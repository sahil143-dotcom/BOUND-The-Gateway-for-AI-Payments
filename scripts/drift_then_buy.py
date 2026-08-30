from bound.service import build_service


def main() -> None:
    svc = build_service()
    session = svc.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}])
    svc.catalog.set_price("sku_tee_lotus", 999999)
    result = svc.complete_checkout(
        session["id"],
        payment={"instruments": [{"handler_id": "razorpay_test", "type": "card"}]},
        idempotency_key=session["id"],
    )
    print(result)


if __name__ == "__main__":
    main()
