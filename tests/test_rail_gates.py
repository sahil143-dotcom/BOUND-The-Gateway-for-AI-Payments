from datetime import datetime, timedelta, timezone

from bound.handler import BoundService


def _pay():
    return {"instruments": [{"handler_id": "razorpay_test", "type": "card"}]}


def test_approve_calls_rail(service: BoundService):
    session = service.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}])
    result = service.complete_checkout(session["id"], payment=_pay(), idempotency_key="k-ok-1")
    assert result["decision"] == "APPROVE"
    assert result["rail_call"] is True
    assert "create_order" in service.spy.calls
    assert result["order_id"].startswith("order_")
    assert result["payment_id"].startswith("pay_")


def test_expired_mandate_does_not_call_rail(service: BoundService):
    now = datetime.now(timezone.utc)
    session = service.create_checkout(
        items=[{"sku_id": "sku_tee_lotus", "quantity": 1}],
        now=now,
    )
    result = service.complete_checkout(
        session["id"],
        payment=_pay(),
        idempotency_key="k-exp-1",
        now=now + timedelta(seconds=91),
    )
    assert result["decision"] == "QUOTE_EXPIRED"
    assert result["rail_call"] is False
    assert service.spy.calls == []
    events = service.ledger.by_trace(session["trace_id"])
    deny = [e for e in events if e["type"] == "DENY"][0]
    assert deny["rail_call"] == 0
    assert deny["rzp_order_id"] is None


def test_price_drift_does_not_call_rail(service: BoundService):
    session = service.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}])
    service.catalog.set_price("sku_tee_lotus", 999999)
    result = service.complete_checkout(session["id"], payment=_pay(), idempotency_key="k-drift-1")
    assert result["decision"] == "PRICE_DRIFT"
    assert result["rail_call"] is False
    assert service.spy.calls == []
