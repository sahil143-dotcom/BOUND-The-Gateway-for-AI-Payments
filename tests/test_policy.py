from datetime import datetime, timedelta, timezone

from bound.mandates import LineItem, issue_cart_mandate, issue_intent_mandate
from bound.policy import enforce


def _cart(catalog, *, ttl=90, sku_id="sku_tee_lotus", unit=None, now=None):
    sku = catalog.get(sku_id)
    clock = now or datetime.now(timezone.utc)
    return issue_cart_mandate(
        merchant_id=catalog.merchant.id,
        currency="INR",
        items=[
            LineItem(
                sku_id=sku.id,
                name=sku.name,
                category=sku.category,
                quantity=1,
                unit_paise=unit if unit is not None else sku.price_paise,
            )
        ],
        ttl_seconds=ttl,
        now=clock,
    )


def _intent(max_paise=180000, cats=None, now=None):
    return issue_intent_mandate(
        max_paise=max_paise,
        allowed_categories=cats or ["apparel"],
        now=now,
    )


def test_approve(catalog):
    d = enforce(
        cart=_cart(catalog),
        intent=_intent(),
        catalog=catalog,
        captured_today_paise=0,
    )
    assert d.allowed and d.code == "APPROVE"


def test_cart_missing(catalog):
    d = enforce(cart=None, intent=_intent(), catalog=catalog, captured_today_paise=0)
    assert d.code == "CART_INVALID"


def test_quote_expired(catalog):
    now = datetime.now(timezone.utc)
    cart = _cart(catalog, ttl=90, now=now)
    d = enforce(
        cart=cart,
        intent=_intent(now=now),
        catalog=catalog,
        captured_today_paise=0,
        now=now + timedelta(seconds=91),
    )
    assert not d.allowed and d.code == "QUOTE_EXPIRED"


def test_price_drift(catalog):
    cart = _cart(catalog, sku_id="sku_tee_lotus", unit=100)
    d = enforce(cart=cart, intent=_intent(), catalog=catalog, captured_today_paise=0)
    assert d.code == "PRICE_DRIFT"


def test_mandate_ceiling(catalog):
    cart = _cart(catalog, sku_id="sku_kurta_indigo")
    d = enforce(cart=cart, intent=_intent(max_paise=1000), catalog=catalog, captured_today_paise=0)
    assert d.code == "MANDATE_CEILING"


def test_category_blocked(catalog):
    d = enforce(
        cart=_cart(catalog),
        intent=_intent(cats=["groceries"]),
        catalog=catalog,
        captured_today_paise=0,
    )
    assert d.code == "CATEGORY_BLOCKED"


def test_txn_cap(catalog):
    sku = catalog.get("sku_kurta_indigo")
    now = datetime.now(timezone.utc)
    cart = issue_cart_mandate(
        merchant_id=catalog.merchant.id,
        currency="INR",
        items=[
            LineItem(sku.id, sku.name, sku.category, 2, sku.price_paise),
        ],
        ttl_seconds=90,
        now=now,
    )
    d = enforce(cart=cart, intent=_intent(max_paise=10_000_000, now=now), catalog=catalog, captured_today_paise=0)
    assert d.code == "TXN_CAP"


def test_daily_cap(catalog):
    d = enforce(
        cart=_cart(catalog),
        intent=_intent(),
        catalog=catalog,
        captured_today_paise=catalog.merchant.daily_cap_paise,
    )
    assert d.code == "DAILY_CAP"
