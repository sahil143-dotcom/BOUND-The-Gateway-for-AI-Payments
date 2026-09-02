"""Validated shapes for buyer-agent output.

Everything a model returns crosses this boundary before any other code sees it.
A model may suggest; it may not assert. In particular a returned sku_id is only
a *candidate* until it is resolved against the live catalog by the selector.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field, field_validator

MAX_PAISE_CEILING = 1_000_000_00  # ₹1,00,00,000 — sanity bound, not a policy limit

Source = Literal["llm", "deterministic"]


class IntentDraft(BaseModel):
    """Raw model output for intent parsing. Untrusted until validated here."""

    query: str = Field(default="", max_length=200)
    max_paise: int | None = None
    garment: str = Field(default="", max_length=40)
    colour: str = Field(default="", max_length=40)
    material: str = Field(default="", max_length=40)

    @field_validator("max_paise")
    @classmethod
    def _sane_amount(cls, v: int | None) -> int | None:
        # A model must never be able to widen a spending figure to nonsense.
        # This is a parsing sanity check only; the real ceiling is the mandate,
        # which the agent cannot see or influence.
        if v is None:
            return None
        if not isinstance(v, int) or v <= 0 or v > MAX_PAISE_CEILING:
            return None
        return v

    @field_validator("query", "garment", "colour", "material", mode="before")
    @classmethod
    def _coerce_str(cls, v: object) -> str:
        return "" if v is None else str(v).strip()[:200]


class SelectionDraft(BaseModel):
    """Raw model output for product selection. sku_id is a candidate, not a fact."""

    sku_id: str = Field(default="", max_length=80)
    rationale: str = Field(default="", max_length=400)

    @field_validator("sku_id", "rationale", mode="before")
    @classmethod
    def _coerce_str(cls, v: object) -> str:
        return "" if v is None else str(v).strip()[:400]


@dataclass(frozen=True)
class ParsedIntent:
    """What the buyer is asking for. Not an authorization of any kind."""

    text: str
    query: str
    max_paise: int | None = None
    garment: str = ""
    colour: str = ""
    material: str = ""
    source: Source = "deterministic"

    def signals(self) -> list[str]:
        return [s.upper() for s in (self.colour, self.material, self.garment) if s]


@dataclass(frozen=True)
class Selection:
    """The SKU the agent wants to buy, plus why. Resolved against the catalog."""

    sku_id: str
    name: str
    category: str
    price_paise: int
    rationale: str
    source: Source = "deterministic"
    considered: tuple[str, ...] = field(default_factory=tuple)
