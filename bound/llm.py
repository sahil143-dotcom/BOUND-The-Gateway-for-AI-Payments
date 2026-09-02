"""Model transport. The only module in BOUND permitted to talk to an LLM.

This layer knows nothing about carts, mandates, policy, or money. It takes a
prompt and returns parsed JSON, or raises. Domain meaning lives in bound.agent.

The money path must never import this module. That is enforced by
tests/test_no_llm_on_money_path.py, not by convention.
"""

from __future__ import annotations

import json
import re
from typing import Any, Protocol

from bound.config import Settings

# Providers reached through an OpenAI-compatible endpoint (AIML API proxies many)
# do not all support response_format=json_object, so JSON is requested in the
# prompt and extracted defensively instead.
_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


class LLMUnavailable(RuntimeError):
    """The model could not be reached or returned something unusable.

    Every caller MUST catch this and fall back to deterministic logic. A model
    outage degrades buyer-agent quality; it never blocks a transaction.
    """


def extract_json(text: str) -> dict[str, Any]:
    """Parse JSON from a model reply, tolerating prose and markdown fences."""
    raw = (text or "").strip()
    if not raw:
        raise LLMUnavailable("empty model reply")

    fenced = _FENCE.search(raw)
    if fenced:
        raw = fenced.group(1).strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end <= start:
            raise LLMUnavailable(f"no JSON object in reply: {raw[:120]!r}") from None
        try:
            parsed = json.loads(raw[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LLMUnavailable(f"malformed JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise LLMUnavailable(f"expected a JSON object, got {type(parsed).__name__}")
    return parsed


class LLMClient(Protocol):
    """Transport boundary. bound.agent depends on this, never on a concrete client."""

    @property
    def enabled(self) -> bool: ...

    def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema_hint: str,
        model: str | None = None,
        max_tokens: int = 500,
    ) -> dict[str, Any]: ...

    def describe(self) -> dict[str, Any]: ...


class NullLLM:
    """Used when AGENT_LLM=off or no key is configured. Always unavailable.

    This is not an error state. It is the default, and every agent function has
    a deterministic path that produces a working demo without a model.
    """

    def __init__(self, reason: str = "AGENT_LLM=off") -> None:
        self._reason = reason

    @property
    def enabled(self) -> bool:
        return False

    def complete_json(self, **_: Any) -> dict[str, Any]:
        raise LLMUnavailable(self._reason)

    def describe(self) -> dict[str, Any]:
        return {"enabled": False, "provider": "none", "reason": self._reason}


class OpenAICompatibleLLM:
    """Adapter for any OpenAI-compatible chat endpoint (AIML API by default).

    One retry, hard timeout, defensive JSON parsing. The last failure is kept so
    /agent/status can report exactly why the model is not being used.
    """

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        default_model: str,
        timeout: float = 6.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._default_model = default_model
        self._timeout = timeout
        self._last_error: str | None = None
        self._client: Any | None = None

    @property
    def enabled(self) -> bool:
        return True

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def _ensure_client(self) -> Any:
        if self._client is None:
            try:
                from openai import OpenAI  # imported lazily, never at module scope
            except ImportError as exc:  # pragma: no cover - dependency is declared
                raise LLMUnavailable(
                    "the 'openai' package is required for AGENT_LLM=on"
                ) from exc
            self._client = OpenAI(
                api_key=self._api_key, base_url=self._base_url, timeout=self._timeout
            )
        return self._client

    def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema_hint: str,
        model: str | None = None,
        max_tokens: int = 500,
    ) -> dict[str, Any]:
        client = self._ensure_client()
        chosen = model or self._default_model
        messages = [
            {
                "role": "system",
                "content": (
                    f"{system}\n\n"
                    "Reply with a single JSON object and nothing else. "
                    f"It must match this shape:\n{schema_hint}"
                ),
            },
            {"role": "user", "content": user},
        ]

        last: Exception | None = None
        for _ in range(2):  # one retry; a hung model must not stall the UI
            try:
                res = client.chat.completions.create(
                    model=chosen,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=max_tokens,
                )
                out = extract_json(res.choices[0].message.content or "")
                self._last_error = None
                return out
            except Exception as exc:  # noqa: BLE001 - transport errors are opaque
                last = exc

        self._last_error = f"{type(last).__name__}: {last}"
        raise LLMUnavailable(self._last_error) from last

    def describe(self) -> dict[str, Any]:
        return {
            "enabled": True,
            "provider": "openai-compatible",
            "base_url": self._base_url,
            "model": self._default_model,
            "timeout_s": self._timeout,
            "last_error": self._last_error,
        }


def build_llm(settings: Settings) -> LLMClient:
    """Mirrors build_rail: config picks the implementation, callers see the Protocol."""
    if not settings.agent_llm_enabled:
        return NullLLM("AGENT_LLM=off")
    if not settings.aimlapi_key:
        return NullLLM("AGENT_LLM=on but AIMLAPI_API_KEY is not set")
    return OpenAICompatibleLLM(
        api_key=settings.aimlapi_key,
        base_url=settings.aimlapi_base_url,
        default_model=settings.agent_model,
        timeout=settings.agent_llm_timeout,
    )
