from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from bound.catalog import Catalog
from bound.mandates import CartMandate, IntentMandate, verify_cart_signature


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    code: str
    reason: str


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


def enforce(
    *,
    cart: CartMandate | None,
    intent: IntentMandate | None,
    catalog: Catalog,
    captured_today_paise: int,
    now: datetime | None = None,
) -> PolicyDecision:
    """Deterministic authorization. No I/O. No rail. No LLM."""
    clock = now or datetime.now(timezone.utc)

    if cart is None:
        return PolicyDecision(False, "CART_INVALID", "CartMandate is missing.")
    if not verify_cart_signature(cart):
        return PolicyDecision(False, "CART_INVALID", "CartMandate signature is invalid.")

    if clock >= _parse_ts(cart.expires_at):
        return PolicyDecision(
            False, "QUOTE_EXPIRED", "CartMandate TTL elapsed. Request a new checkout."
        )

    recomputed = 0
    for item in cart.items:
        sku = catalog.get(item.sku_id)
        if sku is None:
            return PolicyDecision(False, "PRICE_DRIFT", f"SKU {item.sku_id} is no longer in catalog.")
        if sku.price_paise != item.unit_paise:
            return PolicyDecision(
                False,
                "PRICE_DRIFT",
                f"Catalog price for {item.sku_id} is {sku.price_paise} paise; mandate locked {item.unit_paise}.",
            )
        if sku.category != item.category:
            return PolicyDecision(False, "PRICE_DRIFT", f"Category changed for {item.sku_id}.")
        recomputed += sku.price_paise * item.quantity

    if recomputed != cart.total_paise:
        return PolicyDecision(
            False, "PRICE_DRIFT", "Recomputed cart total does not match the binding mandate."
        )

    if intent is None:
        return PolicyDecision(False, "MANDATE_CEILING", "IntentMandate is missing.")
    if clock >= _parse_ts(intent.expires_at):
        return PolicyDecision(False, "MANDATE_CEILING", "IntentMandate has expired.")
    if cart.total_paise > intent.max_paise:
        return PolicyDecision(
            False,
            "MANDATE_CEILING",
            f"Cart {cart.total_paise} paise exceeds intent ceiling {intent.max_paise}.",
        )
    allowed = set(intent.allowed_categories)
    for item in cart.items:
        if item.category not in allowed:
            return PolicyDecision(
                False,
                "CATEGORY_BLOCKED",
                f"Category {item.category} is outside the intent allowlist.",
            )

    merchant = catalog.merchant
    if cart.total_paise > merchant.max_txn_paise:
        return PolicyDecision(
            False, "TXN_CAP", f"Cart exceeds merchant per-transaction cap {merchant.max_txn_paise}."
        )
    if captured_today_paise + cart.total_paise > merchant.daily_cap_paise:
        return PolicyDecision(
            False, "DAILY_CAP", "Cart would exceed the merchant daily capture cap."
        )
    for item in cart.items:
        if item.category not in merchant.allowed_categories:
            return PolicyDecision(
                False, "CATEGORY_BLOCKED", f"Merchant does not sell category {item.category}."
            )

    return PolicyDecision(True, "APPROVE", "All authorization gates passed.")


# Type alias for tests that want to inject a clock without importing datetime everywhere.
Clock = Callable[[], datetime]
