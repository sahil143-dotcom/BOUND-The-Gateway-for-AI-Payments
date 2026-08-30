# BOUND — Product build plan

BOUND is a payment handler that makes a Razorpay merchant transactable by an AI buyer.

Handler name: `com.razorpay.payments`  
Discovery id: `razorpay_test`  
Settlement: Razorpay Payment Gateway (test-mode keys for development; same APIs as live)

An agent cannot use human checkout. There is no frozen cart, no bound amount, and no mandate that Razorpay can see. BOUND is that missing layer: **AP2 authorization objects in, Razorpay settlement out.** Keys stay on the server. The agent never sees them.

This file is the build spec for the complete product. Nothing else.

---

## 1. Product

A merchant publishes a UCP surface. A buyer agent discovers it, creates a checkout, and completes payment. Completion is allowed only after BOUND verifies mandates and policy. Then BOUND creates a Razorpay Order and settles.

The merchant console shows every attempt: approved settlement, blocked attempt, and the reason. Captured agent GMV and blocked agent GMV are first-class metrics.

BOUND does not invent a commerce protocol. It implements the Razorpay payment handler that UCP and AP2 do not ship.

---

## 2. Scope

**In**

- UCP merchant surface: discovery, catalog, checkout session, complete
- AP2 IntentMandate, CartMandate, PaymentMandate, Receipt (official types)
- Deterministic policy gate before any Razorpay call
- Razorpay Orders, payment, capture, refunds, webhooks
- Append-only ledger and merchant console
- Visible AI buyer: an agent that finds/selects a SKU and requests purchase, then the UCP flow runs. LLM is only here. It never authorizes money.
- Official UCP client remains the protocol reference buyer
- Seed merchant catalog (INR, apparel) so the system runs without external data
- Ledger field `rail_call` (true only after Razorpay is invoked; false on every DENY)

**Out**

- Custom chatbot as the product
- Upsell, campaigns, Engage, Magic Checkout, Route
- Full AP2 A2A cluster (shopping agent + credentials provider + MPP)
- x402 / crypto settlement
- NPCI UAP
- Multi-merchant marketplace
- A second quote/catalog format besides UCP + AP2

---

## 3. Architecture

```
Buyer agent
  official UCP client
  console agent-action panel
        |
        | UCP REST
        v
Merchant surface
  GET  /.well-known/ucp
  GET  catalog
  POST /checkout-sessions              -> issue CartMandate (TTL)
  PUT  /checkout-sessions/{id}
  POST /checkout-sessions/{id}/complete
        |
        v
BOUND  com.razorpay.payments
  Mandate desk     IntentMandate + CartMandate
  Policy engine    six gates, no LLM
  Razorpay rail    order -> payment -> capture -> webhook
  Ledger           append-only
  Receipt          AP2 receipt + Razorpay ids
        |                    |
        v                    v
Razorpay PG              Merchant console
  Orders / Payments        catalog, policy, replay
  Refunds / Webhooks       captured GMV / blocked GMV
```

The UCP process does not hold Razorpay keys. Only BOUND does.

---

## 4. Dependencies

| Component | Source | Use |
|---|---|---|
| Merchant + checkout | [Universal-Commerce-Protocol/samples](https://github.com/universal-commerce-protocol/samples) `rest/python/server` | Fork. Replace catalog and payment handler. |
| Buyer client | Same repo, Python happy-path client | Point at our server. `handler_id: razorpay_test`. |
| Mandate / receipt types | [google-agentic-commerce/AP2](https://github.com/google-agentic-commerce/AP2) | Install types package only. |
| Settlement | Official `razorpay` Python SDK | Orders, payments, refunds, webhook signatures. |

Do not vendor unrelated payment or hackathon repos.

---

## 5. Stack

| Layer | Choice |
|---|---|
| Language | Python 3.11+ |
| Merchant API | Forked UCP server |
| Handler + console | FastAPI |
| Models | Official AP2 package + Pydantic |
| Payments | `razorpay` SDK |
| Store | SQLite (`bound.db`) |
| Console UI | FastAPI + Jinja |
| Money path | Rules only. No LLM. |

Required to run: Razorpay Dashboard → Test Mode → Key ID and Key Secret.

---

## 6. Codebase

```
bound/
  README.md
  PLAN.md
  .env.example
  pyproject.toml
  vendor/
    ucp-server/
  bound/
    app.py                 FastAPI: console, webhooks, health
    handler.py             complete_checkout
    mandates.py            issue / verify AP2 objects
    policy.py              six gates
    razorpay_rail.py
    webhooks.py
    ledger.py
    catalog.py
    schemas.py
    db.py
  console/
    templates/index.html
    static/
  data/
    catalog.json
  scripts/
    buy.py
    expire_then_buy.py
    drift_then_buy.py
  tests/
    test_policy.py
    test_mandates.py
    test_idempotency.py
  docs/
    handler.md
```

---

## 7. Discovery

Current UCP (2026-04-08) advertises handlers as a **map under `ucp.payment_handlers`**, not a legacy `payment.handlers` array. Source of truth: [UCP payment-handler guide](https://ucp.dev/2026-04-08/specification/payment-handler-guide/) and live profiles (e.g. `com.stripe.payments`).

`GET /.well-known/ucp`:

```json
{
  "ucp": {
    "version": "2026-04-08",
    "payment_handlers": {
      "com.razorpay.payments": [
        {
          "id": "razorpay_test",
          "version": "2026-08-30",
          "spec": "./docs/handler.md",
          "schema": "./docs/handler.schema.json",
          "available_instruments": [
            { "type": "card", "constraints": { "brands": ["visa", "mastercard"] } },
            { "type": "upi" }
          ],
          "config": {
            "environment": "test",
            "currency": "INR",
            "merchant_id": "acct_seed"
          }
        }
      ]
    }
  }
}
```

Secrets never appear in this document. Do not freeze on an older UCP sample shape.

---

## 8. Checkout and mandates

### Create — `POST /checkout-sessions`

1. Resolve SKUs from `data/catalog.json`.
2. Lock totals in paise.
3. Issue AP2 CartMandate: lines, total, `expires_at = now + CART_TTL_SECONDS`, signed with the product signing key.
4. Attach AP2 IntentMandate (ceiling, category allowlist, expiry) from the buyer or merchant default.
5. Persist session and mandate ids.
6. Ledger: `CART_ISSUED`.

CartMandate is the binding offer. Do not add a second quote type.

### Complete — `POST /checkout-sessions/{id}/complete`

This is the only path that may create a Razorpay Order.

```
load session + CartMandate + IntentMandate
  -> policy.enforce()
       DENY | ESCALATE
            -> UCP status requires_escalation
            -> ledger DENY
            -> return (no Razorpay call)
       APPROVE
            -> orders.create({
                 amount, currency: INR,
                 receipt: idempotency-key,
                 notes: { cart_mandate_id, intent_mandate_id, trace_id }
               })
            -> collect payment
            -> apply webhooks
            -> AP2 Payment Receipt
            -> UCP status completed
```

Instrument:

```json
{
  "payment": {
    "instruments": [
      {
        "id": "instr_rzp",
        "handler_id": "razorpay_test",
        "type": "card",
        "credential": { "type": "test_card", "number": "<razorpay-test-card>" }
      }
    ]
  }
}
```

UCP `idempotency-key` maps to Razorpay order `receipt`. Razorpay limits `receipt` to **40 characters** and treats it as unique — store a short hash, not the raw UUID.

---

## 9. Policy

All six must pass before the rail runs.

| # | Rule | Code |
|---|---|---|
| 1 | CartMandate present and signature valid | `CART_INVALID` |
| 2 | `now < cart.expires_at` | `QUOTE_EXPIRED` |
| 3 | Recomputed catalog totals (paise) match the mandate | `PRICE_DRIFT` |
| 4 | IntentMandate ceiling and category allowlist | `MANDATE_CEILING` / `CATEGORY_BLOCKED` |
| 5 | Merchant max-per-txn and max-per-day | `TXN_CAP` / `DAILY_CAP` |
| 6 | Same idempotency key + same body returns the original result; same key + different body is rejected | `IDEMPOTENCY_CONFLICT` |

`policy.py` and `razorpay_rail.py` contain no model calls.

---

## 10. Settlement

| Step | Implementation |
|---|---|
| Auth | Basic `key_id:key_secret` |
| Order | `POST /v1/orders` — paise, `INR`, `receipt`, mandate notes |
| Pay | Standard Checkout or Payment Links |
| Capture | Auto-capture unless the merchant setting is manual |
| Payment failure | Webhook → `PAYMENT_FAILED`. Session does not complete. |
| Refund | Supported on captured payments. Not used as the primary block path. |

Webhooks (`POST /webhooks/razorpay`):

- Verify HMAC on every event.
- Dedupe `x-razorpay-event-id`.
- Handle `payment.authorized`, `order.paid`, `payment.failed`, `refund.created`.
- Mark the UCP session completed only after `order.paid` (or the equivalent auto-capture event).

---

## 11. Ledger

Append-only. Event rows are never updated.

```
events (
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
)
```

`type`: `CART_ISSUED` | `POLICY_CHECK` | `DENY` | `ORDER_CREATE` | `AUTHORIZE` | `CAPTURE` | `PAYMENT_FAILED` | `REFUND` | `RECEIPT`

`rail_call`: `0` on DENY (Razorpay was not called). `1` only after `orders.create` is invoked. Approval events carry Razorpay ids; deny events must not.

The console loads a `trace_id` and replays the chain.

---

## 12. Blocked completion (product behavior)

These are core product paths, not extras.

1. **Quote expiry** — CartMandate TTL elapses before complete → `QUOTE_EXPIRED` → no Order. Buyer must create a new checkout.
2. **Price drift** — catalog price changes after the mandate is issued → `PRICE_DRIFT` → no Order. Buyer must create a new checkout to lock the current price.

---

## 13. Seed merchant

`data/catalog.json` — one D2C apparel merchant, INR, ~20 SKUs.

Defaults:

- max ₹2000 per transaction
- category allowlist: `apparel`
- CartMandate TTL 90 seconds
- daily cap ₹10,000
- default IntentMandate: apparel, ₹1800, 10 minutes

Console:

- catalog and policy
- trace replay
- captured agent GMV
- blocked agent GMV

---

## 14. Environment

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
BOUND_DB=./bound.db
CART_TTL_SECONDS=90
PUBLIC_BASE_URL=
```

Never commit `.env`.

---

## 15. Tests

- `test_policy.py` — every deny code.
- `test_mandates.py` — TTL boundary (valid before expiry, invalid after).
- `test_idempotency.py` — replay vs conflict.
- Rail test may skip when keys are absent; when keys exist it must create a real test Order.

---

## 16. Build phases

Four phases. After every **two** phases, stop for your manual validation.

### Phase 1 — Contract and skeleton

Validate the current official UCP sample and `payment_handlers` map. Scaffold the repo, SQLite ledger (`rail_call` included), seed catalog, discovery advertising `com.razorpay.payments` in the **current** profile shape. Visible AI buyer stub that can search the catalog and emit a structured purchase request (no settlement yet).

### Phase 2 — Happy path (money moves)

Create-checkout issues CartMandate + IntentMandate. Six gates. APPROVE creates a Razorpay test Order (`receipt` ≤ 40 chars) and collects payment. Webhooks HMAC + dedupe. AP2 receipt. Ledger `RAIL_CALL=true` with Razorpay ids. AI buyer initiates the same path.

**Stop. You validate Phase 1–2.** Discovery JSON, AI starts the buy, Dashboard shows an order, notes have mandate ids, webhook lands.

### Phase 3 — Deny path and proof

Quote expiry and price drift. DENY writes `RAIL_CALL=false` and never calls `orders.create`. Script + unit test that mocks the rail and asserts it was not invoked. Idempotency replay and conflict.

### Phase 4 — Console and handler spec

Trace replay. Captured vs blocked GMV on the first screen. `docs/handler.md` + schema. README with AP2 scope (objects only, not a full mesh).

**Stop. You validate Phase 3–4.** Expiry creates no new order. Replay shows the full chain. GMV tiles match. Handler spec is complete.

No MCP, no LLM on the rail, no extra UI framework before Phase 4 is signed off.

---

## 17. Done

The product is complete when all of these hold:

1. `GET /.well-known/ucp` advertises `com.razorpay.payments`.
2. A successful complete creates a Razorpay Order whose notes include `cart_mandate_id`.
3. Expired mandate and price drift each deny completion and create no Order.
4. The console replays a success trace and a deny trace.
5. Webhooks are signature-verified and duplicate event ids are ignored.
6. `policy.py` and `razorpay_rail.py` have no LLM.
7. README is enough to run a buy and both block paths.

---

## 18. Locked decisions

| Decision | Value |
|---|---|
| Language | Python |
| Buyer | UCP client + console panel, not a chatbot product |
| Binding offer | AP2 CartMandate |
| Block paths | Quote expiry and price drift |
| Seed catalog | Apparel, INR |
| Razorpay surface | Orders, Checkout / Payment Links, webhooks |
| AP2 | Types and objects only |

If an official type forces a field rename, rename it and record it in `docs/handler.md`. Do not change the product.
