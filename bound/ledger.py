from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from bound.db import connect


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Ledger:
    def __init__(self, db_path) -> None:
        self.db_path = db_path

    def append(
        self,
        *,
        trace_id: str,
        type: str,
        payload: dict[str, Any],
        decision: str | None = None,
        reason: str | None = None,
        cart_mandate_id: str | None = None,
        intent_mandate_id: str | None = None,
        rzp_order_id: str | None = None,
        rzp_payment_id: str | None = None,
        rzp_event_id: str | None = None,
        amount_paise: int | None = None,
        rail_call: bool = False,
    ) -> int:
        conn = connect(self.db_path)
        try:
            cur = conn.execute(
                """
                INSERT INTO events (
                  ts, trace_id, type, decision, reason,
                  cart_mandate_id, intent_mandate_id,
                  rzp_order_id, rzp_payment_id, rzp_event_id,
                  amount_paise, rail_call, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    _now(),
                    trace_id,
                    type,
                    decision,
                    reason,
                    cart_mandate_id,
                    intent_mandate_id,
                    rzp_order_id,
                    rzp_payment_id,
                    rzp_event_id,
                    amount_paise,
                    1 if rail_call else 0,
                    json.dumps(payload, default=str),
                ),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()

    def by_trace(self, trace_id: str) -> list[dict[str, Any]]:
        conn = connect(self.db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM events WHERE trace_id = ? ORDER BY id", (trace_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def recent(self, limit: int = 40) -> list[dict[str, Any]]:
        conn = connect(self.db_path)
        try:
            rows = conn.execute(
                """
                SELECT * FROM events
                WHERE type IN ('RECEIPT', 'DENY', 'ORDER_CREATE')
                ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def recent_decisions(self, limit: int = 16) -> list[dict[str, Any]]:
        conn = connect(self.db_path)
        try:
            rows = conn.execute(
                """
                SELECT * FROM events
                WHERE type IN ('RECEIPT', 'DENY')
                ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def captured_paise(self) -> int:
        conn = connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT COALESCE(SUM(amount_paise), 0) AS s FROM events WHERE type = 'CAPTURE'"
            ).fetchone()
            return int(row["s"] or 0)
        finally:
            conn.close()

    def blocked_paise(self) -> int:
        conn = connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT COALESCE(SUM(amount_paise), 0) AS s FROM events WHERE type = 'DENY'"
            ).fetchone()
            return int(row["s"] or 0)
        finally:
            conn.close()

    def request_count(self) -> int:
        conn = connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT COUNT(DISTINCT trace_id) AS c FROM events WHERE type = 'CART_ISSUED'"
            ).fetchone()
            return int(row["c"] or 0)
        finally:
            conn.close()

    def approved_count(self) -> int:
        conn = connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT COUNT(DISTINCT trace_id) AS c FROM events WHERE type = 'RECEIPT'"
            ).fetchone()
            return int(row["c"] or 0)
        finally:
            conn.close()

    def blocked_count(self) -> int:
        conn = connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT COUNT(DISTINCT trace_id) AS c FROM events WHERE type = 'DENY'"
            ).fetchone()
            return int(row["c"] or 0)
        finally:
            conn.close()

    def deny_breakdown(self) -> list[dict[str, Any]]:
        conn = connect(self.db_path)
        try:
            rows = conn.execute(
                """
                SELECT decision, COUNT(*) AS c, COALESCE(SUM(amount_paise), 0) AS paise
                FROM events WHERE type = 'DENY' AND decision IS NOT NULL
                GROUP BY decision ORDER BY c DESC
                """
            ).fetchall()
            return [
                {"code": r["decision"], "count": int(r["c"]), "paise": int(r["paise"] or 0)}
                for r in rows
            ]
        finally:
            conn.close()

    def captured_today_paise(self) -> int:
        conn = connect(self.db_path)
        try:
            row = conn.execute(
                """
                SELECT COALESCE(SUM(amount_paise), 0) AS s
                FROM events
                WHERE type = 'CAPTURE' AND ts >= date('now')
                """
            ).fetchone()
            return int(row["s"] or 0)
        finally:
            conn.close()
