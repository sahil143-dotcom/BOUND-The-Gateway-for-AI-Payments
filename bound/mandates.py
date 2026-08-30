from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from bound.config import ROOT

SIGNING_KEY_PATH = ROOT / ".signing_key"


def _load_or_create_key() -> bytes:
    if SIGNING_KEY_PATH.exists():
        return SIGNING_KEY_PATH.read_bytes()
    key = secrets.token_bytes(32)
    SIGNING_KEY_PATH.write_bytes(key)
    return key


def _sign(payload: str) -> str:
    key = _load_or_create_key()
    return hmac.new(key, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _canonical(obj: dict[str, Any]) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


@dataclass
class LineItem:
    sku_id: str
    name: str
    category: str
    quantity: int
    unit_paise: int

    @property
    def line_paise(self) -> int:
        return self.unit_paise * self.quantity


@dataclass
class CartMandate:
    """AP2-shaped CartMandate primitive (binding offer). Not a full AP2 mesh."""

    id: str
    merchant_id: str
    currency: str
    total_paise: int
    items: list[LineItem]
    issued_at: str
    expires_at: str
    signature: str

    def unsigned_body(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "merchant_id": self.merchant_id,
            "currency": self.currency,
            "total_paise": self.total_paise,
            "items": [asdict(i) for i in self.items],
            "issued_at": self.issued_at,
            "expires_at": self.expires_at,
        }

    def to_dict(self) -> dict[str, Any]:
        body = self.unsigned_body()
        body["signature"] = self.signature
        return body

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CartMandate:
        items = [LineItem(**i) for i in data["items"]]
        return cls(
            id=data["id"],
            merchant_id=data["merchant_id"],
            currency=data["currency"],
            total_paise=int(data["total_paise"]),
            items=items,
            issued_at=data["issued_at"],
            expires_at=data["expires_at"],
            signature=data["signature"],
        )


@dataclass
class IntentMandate:
    """AP2-shaped IntentMandate primitive (buyer bounds)."""

    id: str
    max_paise: int
    allowed_categories: list[str]
    expires_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> IntentMandate:
        return cls(
            id=data["id"],
            max_paise=int(data["max_paise"]),
            allowed_categories=list(data["allowed_categories"]),
            expires_at=data["expires_at"],
        )


@dataclass
class PaymentReceipt:
    """AP2-shaped receipt linking authorization objects to settlement ids."""

    id: str
    cart_mandate_id: str
    intent_mandate_id: str
    trace_id: str
    order_id: str
    payment_id: str
    amount_paise: int
    currency: str
    issued_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def issue_cart_mandate(
    *,
    merchant_id: str,
    currency: str,
    items: list[LineItem],
    ttl_seconds: int,
    now: datetime | None = None,
) -> CartMandate:
    clock = now or datetime.now(timezone.utc)
    total = sum(i.line_paise for i in items)
    mandate_id = "cart_" + secrets.token_hex(8)
    issued = clock.isoformat()
    expires = (clock + timedelta(seconds=ttl_seconds)).isoformat()
    unsigned = {
        "id": mandate_id,
        "merchant_id": merchant_id,
        "currency": currency,
        "total_paise": total,
        "items": [asdict(i) for i in items],
        "issued_at": issued,
        "expires_at": expires,
    }
    sig = _sign(_canonical(unsigned))
    return CartMandate(
        id=mandate_id,
        merchant_id=merchant_id,
        currency=currency,
        total_paise=total,
        items=items,
        issued_at=issued,
        expires_at=expires,
        signature=sig,
    )


def verify_cart_signature(cart: CartMandate) -> bool:
    expected = _sign(_canonical(cart.unsigned_body()))
    return hmac.compare_digest(expected, cart.signature)


def issue_intent_mandate(
    *,
    max_paise: int,
    allowed_categories: list[str],
    ttl_seconds: int = 600,
    now: datetime | None = None,
) -> IntentMandate:
    clock = now or datetime.now(timezone.utc)
    return IntentMandate(
        id="intent_" + secrets.token_hex(8),
        max_paise=max_paise,
        allowed_categories=list(allowed_categories),
        expires_at=(clock + timedelta(seconds=ttl_seconds)).isoformat(),
    )


def issue_receipt(
    *,
    cart_mandate_id: str,
    intent_mandate_id: str,
    trace_id: str,
    order_id: str,
    payment_id: str,
    amount_paise: int,
    currency: str,
) -> PaymentReceipt:
    return PaymentReceipt(
        id="rcpt_" + secrets.token_hex(8),
        cart_mandate_id=cart_mandate_id,
        intent_mandate_id=intent_mandate_id,
        trace_id=trace_id,
        order_id=order_id,
        payment_id=payment_id,
        amount_paise=amount_paise,
        currency=currency,
        issued_at=datetime.now(timezone.utc).isoformat(),
    )
