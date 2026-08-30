from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  decision TEXT,
  reason TEXT,
  cart_mandate_id TEXT,
  intent_mandate_id TEXT,
  rzp_order_id TEXT,
  rzp_payment_id TEXT,
  rzp_event_id TEXT UNIQUE,
  amount_paise INTEGER,
  rail_call INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  cart_mandate_json TEXT NOT NULL,
  intent_mandate_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL,
  line_items_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  body_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  result_json TEXT NOT NULL
);
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.executescript(SCHEMA)
    return conn
