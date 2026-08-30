from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from bound.config import Settings


class RailNotCalledError(RuntimeError):
    pass


class RailCredentialsMissing(RuntimeError):
    """Raised only when PAYMENT_RAIL=razorpay and legitimate keys are not configured."""


@dataclass
class OrderRecord:
    id: str
    amount_paise: int
    currency: str
    receipt: str
    notes: dict[str, str]
    status: str = "created"
    payment_id: str | None = None


@dataclass
class PaymentRecord:
    id: str
    order_id: str
    amount_paise: int
    status: str
    method: str


class RazorpayRail(Protocol):
    """Settlement boundary. Policy must never import a concrete rail."""

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str],
    ) -> dict[str, Any]: ...

    def create_payment(self, *, order_id: str, method: str = "card") -> dict[str, Any]: ...

    def capture(self, *, payment_id: str, amount_paise: int) -> dict[str, Any]: ...

    def fail_payment(self, *, payment_id: str, reason: str = "payment_failed") -> dict[str, Any]: ...

    def get_order(self, order_id: str) -> dict[str, Any]: ...

    def get_payment(self, payment_id: str) -> dict[str, Any]: ...

    def last_webhooks(self) -> list[dict[str, Any]]: ...


def _rzp_style_id(prefix: str) -> str:
    # Razorpay-like public ids (order_ / pay_). Not API keys.
    return f"{prefix}_{secrets.token_hex(8)}"


class MockRazorpayRail:
    """In-process stand-in for the Razorpay PG boundary. No credentials. No network."""

    def __init__(self, webhook_secret: str | None = None) -> None:
        self._orders: dict[str, OrderRecord] = {}
        self._payments: dict[str, PaymentRecord] = {}
        self._receipts: dict[str, str] = {}
        self._webhooks: list[dict[str, Any]] = []
        self._webhook_secret = webhook_secret or "mock-webhook-hmac-not-a-razorpay-key"

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str],
    ) -> dict[str, Any]:
        if len(receipt) > 40:
            raise ValueError("receipt must be 40 characters or fewer")
        if receipt in self._receipts:
            existing = self._orders[self._receipts[receipt]]
            return self._order_payload(existing)
        order = OrderRecord(
            id=_rzp_style_id("order"),
            amount_paise=amount_paise,
            currency=currency,
            receipt=receipt,
            notes=dict(notes),
            status="created",
        )
        self._orders[order.id] = order
        self._receipts[receipt] = order.id
        return self._order_payload(order)

    def create_payment(self, *, order_id: str, method: str = "card") -> dict[str, Any]:
        order = self._orders[order_id]
        payment = PaymentRecord(
            id=_rzp_style_id("pay"),
            order_id=order_id,
            amount_paise=order.amount_paise,
            status="authorized",
            method=method,
        )
        self._payments[payment.id] = payment
        order.payment_id = payment.id
        order.status = "attempted"
        self._emit("payment.authorized", order, payment)
        return self._payment_payload(payment)

    def capture(self, *, payment_id: str, amount_paise: int) -> dict[str, Any]:
        payment = self._payments[payment_id]
        if amount_paise != payment.amount_paise:
            raise ValueError("capture amount must match payment amount")
        payment.status = "captured"
        order = self._orders[payment.order_id]
        order.status = "paid"
        self._emit("order.paid", order, payment)
        return self._payment_payload(payment)

    def fail_payment(self, *, payment_id: str, reason: str = "payment_failed") -> dict[str, Any]:
        payment = self._payments[payment_id]
        payment.status = "failed"
        order = self._orders[payment.order_id]
        self._emit("payment.failed", order, payment, extra={"reason": reason})
        return self._payment_payload(payment)

    def get_order(self, order_id: str) -> dict[str, Any]:
        return self._order_payload(self._orders[order_id])

    def get_payment(self, payment_id: str) -> dict[str, Any]:
        return self._payment_payload(self._payments[payment_id])

    def last_webhooks(self) -> list[dict[str, Any]]:
        return list(self._webhooks)

    def _order_payload(self, order: OrderRecord) -> dict[str, Any]:
        return {
            "id": order.id,
            "amount": order.amount_paise,
            "currency": order.currency,
            "receipt": order.receipt,
            "notes": order.notes,
            "status": order.status,
            "payments": {"id": order.payment_id} if order.payment_id else None,
        }

    def _payment_payload(self, payment: PaymentRecord) -> dict[str, Any]:
        return {
            "id": payment.id,
            "order_id": payment.order_id,
            "amount": payment.amount_paise,
            "status": payment.status,
            "method": payment.method,
        }

    def _emit(
        self,
        event: str,
        order: OrderRecord,
        payment: PaymentRecord,
        extra: dict[str, Any] | None = None,
    ) -> None:
        event_id = "evt_" + secrets.token_hex(10)
        body = {
            "event": event,
            "created_at": int(time.time()),
            "payload": {
                "payment": {"entity": self._payment_payload(payment) | (extra or {})},
                "order": {"entity": self._order_payload(order)},
            },
        }
        raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode()
        signature = hmac.new(
            self._webhook_secret.encode(), raw, hashlib.sha256
        ).hexdigest()
        self._webhooks.append(
            {"id": event_id, "signature": signature, "body": body, "raw": raw.decode()}
        )


class SpyRail:
    """Test double: records calls, delegates to an inner rail."""

    def __init__(self, inner: RazorpayRail) -> None:
        self.inner = inner
        self.calls: list[str] = []

    def create_order(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append("create_order")
        return self.inner.create_order(**kwargs)

    def create_payment(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append("create_payment")
        return self.inner.create_payment(**kwargs)

    def capture(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append("capture")
        return self.inner.capture(**kwargs)

    def fail_payment(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append("fail_payment")
        return self.inner.fail_payment(**kwargs)

    def get_order(self, order_id: str) -> dict[str, Any]:
        return self.inner.get_order(order_id)

    def get_payment(self, payment_id: str) -> dict[str, Any]:
        return self.inner.get_payment(payment_id)

    def last_webhooks(self) -> list[dict[str, Any]]:
        return self.inner.last_webhooks()


class RazorpayTestRail:
    """Live Razorpay Test Mode adapter. Instantiated only when PAYMENT_RAIL=razorpay."""

    def __init__(self, key_id: str, key_secret: str) -> None:
        if not key_id or not key_secret:
            raise RailCredentialsMissing(
                "PAYMENT_RAIL=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET "
                "from your own Razorpay Test Mode Dashboard."
            )
        if not key_id.startswith("rzp_test_"):
            raise RailCredentialsMissing(
                "RazorpayTestRail accepts only Test Mode key ids (rzp_test_…)."
            )
        import razorpay  # imported only when this class is constructed

        self._client = razorpay.Client(auth=(key_id, key_secret))
        self._webhooks: list[dict[str, Any]] = []

    @classmethod
    def from_settings(cls, settings: Settings) -> RazorpayTestRail:
        return cls(settings.razorpay_key_id or "", settings.razorpay_key_secret or "")

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str],
    ) -> dict[str, Any]:
        return self._client.order.create(
            {
                "amount": amount_paise,
                "currency": currency,
                "receipt": receipt,
                "notes": notes,
            }
        )

    def create_payment(self, *, order_id: str, method: str = "card") -> dict[str, Any]:
        raise RailNotCalledError(
            "RazorpayTestRail.create_payment is collected via Checkout / Payment Links "
            "in the Dashboard, not by synthesizing a payment in-process."
        )

    def capture(self, *, payment_id: str, amount_paise: int) -> dict[str, Any]:
        return self._client.payment.capture(payment_id, amount_paise)

    def fail_payment(self, *, payment_id: str, reason: str = "payment_failed") -> dict[str, Any]:
        raise RailNotCalledError("Use Razorpay test failure methods in Checkout.")

    def get_order(self, order_id: str) -> dict[str, Any]:
        return self._client.order.fetch(order_id)

    def get_payment(self, payment_id: str) -> dict[str, Any]:
        return self._client.payment.fetch(payment_id)

    def last_webhooks(self) -> list[dict[str, Any]]:
        return list(self._webhooks)


def build_rail(settings: Settings) -> RazorpayRail:
    name = settings.rail_name
    if name == "mock":
        return MockRazorpayRail(webhook_secret=settings.razorpay_webhook_secret)
    if name == "razorpay":
        return RazorpayTestRail.from_settings(settings)
    raise ValueError(f"Unknown PAYMENT_RAIL={name!r}. Use mock or razorpay.")
