from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import sqlite3

from bound.ledger import Ledger


def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def ingest(
    *,
    ledger: Ledger,
    trace_id: str,
    event_id: str,
    event_name: str,
    payload: dict[str, Any],
    order_id: str | None,
    payment_id: str | None,
    amount_paise: int | None,
    cart_mandate_id: str | None = None,
    intent_mandate_id: str | None = None,
) -> bool:
    """Returns False if the event id was already recorded."""
    try:
        ledger.append(
            trace_id=trace_id,
            type=_map_type(event_name),
            payload=payload,
            rzp_order_id=order_id,
            rzp_payment_id=payment_id,
            rzp_event_id=event_id,
            amount_paise=amount_paise,
            cart_mandate_id=cart_mandate_id,
            intent_mandate_id=intent_mandate_id,
            rail_call=True,
        )
        return True
    except sqlite3.IntegrityError:
        return False


def _map_type(event_name: str) -> str:
    return {
        "payment.authorized": "AUTHORIZE",
        "order.paid": "CAPTURE",
        "payment.failed": "PAYMENT_FAILED",
        "refund.created": "REFUND",
    }.get(event_name, "POLICY_CHECK")
