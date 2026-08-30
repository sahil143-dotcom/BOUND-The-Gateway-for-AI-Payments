from bound.handler import BoundService


def _pay(extra=None):
    body = {"instruments": [{"handler_id": "razorpay_test", "type": "card"}]}
    if extra:
        body["extra"] = extra
    return body


def test_replay_does_not_create_second_order(service: BoundService):
    session = service.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}])
    first = service.complete_checkout(session["id"], payment=_pay(), idempotency_key="same-key")
    second = service.complete_checkout(session["id"], payment=_pay(), idempotency_key="same-key")
    assert first["order_id"] == second["order_id"]
    assert service.spy.calls.count("create_order") == 1


def test_conflict_is_rejected_without_second_order(service: BoundService):
    session = service.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}])
    first = service.complete_checkout(session["id"], payment=_pay(), idempotency_key="same-key")
    conflict = service.complete_checkout(
        session["id"], payment=_pay("mutated"), idempotency_key="same-key"
    )
    assert first["decision"] == "APPROVE"
    assert conflict["decision"] == "IDEMPOTENCY_CONFLICT"
    assert conflict["rail_call"] is False
    assert service.spy.calls.count("create_order") == 1
