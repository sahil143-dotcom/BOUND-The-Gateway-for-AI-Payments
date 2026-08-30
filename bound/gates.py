"""Display mapping for the six gates. Does not authorize. Does not call the rail."""

from __future__ import annotations

GATES = [
    ("cart", "CartMandate valid", {"CART_INVALID"}),
    ("quote", "Quote not expired", {"QUOTE_EXPIRED"}),
    ("price", "Price matches current catalog", {"PRICE_DRIFT"}),
    ("intent", "Intent authorization valid", {"MANDATE_CEILING", "CATEGORY_BLOCKED"}),
    ("limits", "Merchant spending limits valid", {"TXN_CAP", "DAILY_CAP"}),
    ("idempotency", "Idempotency valid", {"IDEMPOTENCY_CONFLICT"}),
]


def gate_states(decision_code: str | None) -> list[dict]:
    if not decision_code:
        return [
            {"id": gid, "label": label, "state": "pending"}
            for gid, label, _ in GATES
        ]
    if decision_code == "APPROVE":
        return [{"id": gid, "label": label, "state": "pass"} for gid, label, _ in GATES]

    out = []
    failed = False
    for gid, label, codes in GATES:
        if failed:
            out.append({"id": gid, "label": label, "state": "skipped"})
        elif decision_code in codes:
            out.append({"id": gid, "label": label, "state": "fail"})
            failed = True
        else:
            out.append({"id": gid, "label": label, "state": "pass"})
    return out
