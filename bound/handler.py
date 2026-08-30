from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timezone
from typing import Any

from bound.catalog import Catalog
from bound.config import Settings
from bound.db import connect
from bound.ledger import Ledger
from bound.mandates import (
    CartMandate,
    IntentMandate,
    LineItem,
    issue_cart_mandate,
    issue_intent_mandate,
    issue_receipt,
)
from bound.policy import PolicyDecision, enforce
from bound.razorpay_rail import RazorpayRail


def receipt_from_idempotency(key: str) -> str:
    digest = hashlib.sha256(key.encode()).hexdigest()
    return digest[:40]


def body_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class BoundService:
    def __init__(self, settings: Settings, catalog: Catalog, ledger: Ledger, rail: RazorpayRail):
        self.settings = settings
        self.catalog = catalog
        self.ledger = ledger
        self.rail = rail

    def create_checkout(
        self,
        *,
        items: list[dict[str, Any]],
        intent: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        clock = now or datetime.now(timezone.utc)
        line_items: list[LineItem] = []
        for raw in items:
            sku = self.catalog.get(raw["sku_id"])
            if sku is None:
                raise ValueError(f"Unknown sku_id {raw['sku_id']}")
            qty = int(raw.get("quantity", 1))
            line_items.append(
                LineItem(
                    sku_id=sku.id,
                    name=sku.name,
                    category=sku.category,
                    quantity=qty,
                    unit_paise=sku.price_paise,
                )
            )
        cart = issue_cart_mandate(
            merchant_id=self.catalog.merchant.id,
            currency=self.catalog.merchant.currency,
            items=line_items,
            ttl_seconds=self.settings.cart_ttl_seconds,
            now=clock,
        )
        default_intent = issue_intent_mandate(
            max_paise=int(intent["max_paise"]) if intent and "max_paise" in intent else 180000,
            allowed_categories=list(intent["allowed_categories"])
            if intent and "allowed_categories" in intent
            else list(self.catalog.merchant.allowed_categories),
            ttl_seconds=int(intent.get("ttl_seconds", 600)) if intent else 600,
            now=clock,
        )
        session_id = "chk_" + secrets.token_hex(8)
        trace_id = "tr_" + secrets.token_hex(8)
        conn = connect(self.settings.bound_db)
        try:
            conn.execute(
                """
                INSERT INTO sessions (
                  id, status, trace_id, cart_mandate_json, intent_mandate_json,
                  created_at, amount_paise, currency, line_items_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    "incomplete",
                    trace_id,
                    json.dumps(cart.to_dict()),
                    json.dumps(default_intent.to_dict()),
                    clock.isoformat(),
                    cart.total_paise,
                    cart.currency,
                    json.dumps([i.__dict__ for i in line_items]),
                ),
            )
            conn.commit()
        finally:
            conn.close()

        self.ledger.append(
            trace_id=trace_id,
            type="CART_ISSUED",
            payload={"session_id": session_id, "cart": cart.to_dict()},
            cart_mandate_id=cart.id,
            intent_mandate_id=default_intent.id,
            amount_paise=cart.total_paise,
            rail_call=False,
        )
        return {
            "id": session_id,
            "status": "incomplete",
            "trace_id": trace_id,
            "cart_mandate": cart.to_dict(),
            "intent_mandate": default_intent.to_dict(),
            "expires_at": cart.expires_at,
            "amount_paise": cart.total_paise,
            "currency": cart.currency,
        }

    def complete_checkout(
        self,
        session_id: str,
        *,
        payment: dict[str, Any],
        idempotency_key: str,
        now: datetime | None = None,
        fail_payment: bool = False,
    ) -> dict[str, Any]:
        session = self._load_session(session_id)
        cart = CartMandate.from_dict(json.loads(session["cart_mandate_json"]))
        intent = IntentMandate.from_dict(json.loads(session["intent_mandate_json"]))
        trace_id = session["trace_id"]
        complete_body = {"session_id": session_id, "payment": payment}
        fingerprint = body_hash(complete_body)

        replay = self._idempotency_lookup(idempotency_key)
        if replay:
            if replay["body_hash"] != fingerprint:
                return self._deny(
                    session,
                    cart,
                    intent,
                    PolicyDecision(False, "IDEMPOTENCY_CONFLICT", "Same idempotency key, different body."),
                    rail_called=False,
                )
            return json.loads(replay["result_json"])

        decision = enforce(
            cart=cart,
            intent=intent,
            catalog=self.catalog,
            captured_today_paise=self.ledger.captured_today_paise(),
            now=now,
        )
        self.ledger.append(
            trace_id=trace_id,
            type="POLICY_CHECK",
            payload={"code": decision.code, "reason": decision.reason},
            decision=decision.code,
            reason=decision.reason,
            cart_mandate_id=cart.id,
            intent_mandate_id=intent.id,
            amount_paise=cart.total_paise,
            rail_call=False,
        )
        if not decision.allowed:
            result = self._deny(session, cart, intent, decision, rail_called=False)
            return result

        receipt = receipt_from_idempotency(idempotency_key)
        notes = {
            "cart_mandate_id": cart.id,
            "intent_mandate_id": intent.id,
            "trace_id": trace_id,
        }
        order = self.rail.create_order(
            amount_paise=cart.total_paise,
            currency=cart.currency,
            receipt=receipt,
            notes=notes,
        )
        self.ledger.append(
            trace_id=trace_id,
            type="ORDER_CREATE",
            payload={"order": order, "notes": notes},
            decision="APPROVE",
            cart_mandate_id=cart.id,
            intent_mandate_id=intent.id,
            rzp_order_id=order["id"],
            amount_paise=cart.total_paise,
            rail_call=True,
        )

        pay = self.rail.create_payment(order_id=order["id"], method="card")
        self.ledger.append(
            trace_id=trace_id,
            type="AUTHORIZE",
            payload={"payment": pay},
            cart_mandate_id=cart.id,
            intent_mandate_id=intent.id,
            rzp_order_id=order["id"],
            rzp_payment_id=pay["id"],
            amount_paise=cart.total_paise,
            rail_call=True,
        )

        if fail_payment:
            failed = self.rail.fail_payment(payment_id=pay["id"])
            self.ledger.append(
                trace_id=trace_id,
                type="PAYMENT_FAILED",
                payload={"payment": failed},
                decision="PAYMENT_FAILED",
                cart_mandate_id=cart.id,
                intent_mandate_id=intent.id,
                rzp_order_id=order["id"],
                rzp_payment_id=pay["id"],
                amount_paise=cart.total_paise,
                rail_call=True,
            )
            result = {
                "id": session_id,
                "status": "incomplete",
                "trace_id": trace_id,
                "decision": "PAYMENT_FAILED",
                "rail_call": True,
                "order_id": order["id"],
                "payment_id": pay["id"],
            }
            self._store_idempotency(idempotency_key, fingerprint, session_id, result)
            return result

        captured = self.rail.capture(payment_id=pay["id"], amount_paise=cart.total_paise)
        self.ledger.append(
            trace_id=trace_id,
            type="CAPTURE",
            payload={"payment": captured},
            cart_mandate_id=cart.id,
            intent_mandate_id=intent.id,
            rzp_order_id=order["id"],
            rzp_payment_id=pay["id"],
            amount_paise=cart.total_paise,
            rail_call=True,
        )
        rec = issue_receipt(
            cart_mandate_id=cart.id,
            intent_mandate_id=intent.id,
            trace_id=trace_id,
            order_id=order["id"],
            payment_id=pay["id"],
            amount_paise=cart.total_paise,
            currency=cart.currency,
        )
        self.ledger.append(
            trace_id=trace_id,
            type="RECEIPT",
            payload=rec.to_dict(),
            cart_mandate_id=cart.id,
            intent_mandate_id=intent.id,
            rzp_order_id=order["id"],
            rzp_payment_id=pay["id"],
            amount_paise=cart.total_paise,
            rail_call=True,
        )
        self._set_session_status(session_id, "completed")
        result = {
            "id": session_id,
            "status": "completed",
            "trace_id": trace_id,
            "decision": "APPROVE",
            "rail_call": True,
            "order_id": order["id"],
            "payment_id": pay["id"],
            "receipt": rec.to_dict(),
            "permalink": f"/console?trace_id={trace_id}",
        }
        self._store_idempotency(idempotency_key, fingerprint, session_id, result)
        return result

    def _deny(
        self,
        session: dict[str, Any],
        cart: CartMandate,
        intent: IntentMandate,
        decision: PolicyDecision,
        *,
        rail_called: bool,
    ) -> dict[str, Any]:
        self.ledger.append(
            trace_id=session["trace_id"],
            type="DENY",
            payload={"code": decision.code, "reason": decision.reason, "rail_call": False},
            decision=decision.code,
            reason=decision.reason,
            cart_mandate_id=cart.id,
            intent_mandate_id=intent.id,
            amount_paise=cart.total_paise,
            rail_call=rail_called,
        )
        self._set_session_status(session["id"], "requires_escalation")
        return {
            "id": session["id"],
            "status": "requires_escalation",
            "trace_id": session["trace_id"],
            "decision": decision.code,
            "reason": decision.reason,
            "rail_call": False,
            "recovery": "Request a fresh checkout. A new CartMandate will lock the current price.",
        }

    def _load_session(self, session_id: str) -> dict[str, Any]:
        conn = connect(self.settings.bound_db)
        try:
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
            if row is None:
                raise KeyError(session_id)
            return dict(row)
        finally:
            conn.close()

    def _set_session_status(self, session_id: str, status: str) -> None:
        conn = connect(self.settings.bound_db)
        try:
            conn.execute("UPDATE sessions SET status = ? WHERE id = ?", (status, session_id))
            conn.commit()
        finally:
            conn.close()

    def _idempotency_lookup(self, key: str) -> dict[str, Any] | None:
        conn = connect(self.settings.bound_db)
        try:
            row = conn.execute("SELECT * FROM idempotency WHERE key = ?", (key,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def _store_idempotency(
        self, key: str, fingerprint: str, session_id: str, result: dict[str, Any]
    ) -> None:
        conn = connect(self.settings.bound_db)
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO idempotency (key, body_hash, session_id, result_json)
                VALUES (?, ?, ?, ?)
                """,
                (key, fingerprint, session_id, json.dumps(result)),
            )
            conn.commit()
        finally:
            conn.close()
