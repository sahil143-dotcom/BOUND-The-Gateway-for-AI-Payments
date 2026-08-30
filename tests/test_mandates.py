from datetime import datetime, timedelta, timezone

from bound.mandates import LineItem, issue_cart_mandate, verify_cart_signature
from bound.policy import enforce


def test_signature_roundtrip(catalog):
    now = datetime.now(timezone.utc)
    sku = catalog.get("sku_stole_block")
    cart = issue_cart_mandate(
        merchant_id="acct_seed",
        currency="INR",
        items=[LineItem(sku.id, sku.name, sku.category, 1, sku.price_paise)],
        ttl_seconds=90,
        now=now,
    )
    assert verify_cart_signature(cart)
    cart.signature = "deadbeef"
    assert not verify_cart_signature(cart)


def test_ttl_boundary(catalog):
    now = datetime.now(timezone.utc)
    sku = catalog.get("sku_stole_block")
    cart = issue_cart_mandate(
        merchant_id=catalog.merchant.id,
        currency="INR",
        items=[LineItem(sku.id, sku.name, sku.category, 1, sku.price_paise)],
        ttl_seconds=90,
        now=now,
    )
    from bound.mandates import issue_intent_mandate

    intent = issue_intent_mandate(max_paise=180000, allowed_categories=["apparel"], now=now)
    ok = enforce(cart=cart, intent=intent, catalog=catalog, captured_today_paise=0, now=now + timedelta(seconds=89))
    dead = enforce(cart=cart, intent=intent, catalog=catalog, captured_today_paise=0, now=now + timedelta(seconds=91))
    assert ok.allowed
    assert dead.code == "QUOTE_EXPIRED"
