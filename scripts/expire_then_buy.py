from datetime import datetime, timedelta, timezone

from bound.service import build_service


def main() -> None:
    svc = build_service()
    now = datetime.now(timezone.utc)
    session = svc.create_checkout(
        items=[{"sku_id": "sku_tee_lotus", "quantity": 1}],
        now=now,
    )
    result = svc.complete_checkout(
        session["id"],
        payment={"instruments": [{"handler_id": "razorpay_test", "type": "card"}]},
        idempotency_key=session["id"],
        now=now + timedelta(seconds=91),
    )
    print(result)


if __name__ == "__main__":
    main()
