# `com.razorpay.payments`

BOUND payment handler. UCP version `2026-04-08`.

## Identity

| Field | Value |
|---|---|
| name | `com.razorpay.payments` |
| id | `razorpay_test` |
| environment | `test` |
| currency | `INR` |

## Input

Discovery: `GET /.well-known/ucp` → `ucp.payment_handlers["com.razorpay.payments"]`.

Create checkout: `POST /checkout-sessions` with `{ items, intent? }`.

Complete: `POST /checkout-sessions/{id}/complete` with `Idempotency-Key` and a payment instrument whose `handler_id` is `razorpay_test`.

## Authorization model

AI or client may request a purchase. BOUND issues an AP2-shaped **CartMandate** (binding offer, TTL) and **IntentMandate** (ceiling + categories). Six deterministic gates run **before** any settlement call:

`CART_INVALID` · `QUOTE_EXPIRED` · `PRICE_DRIFT` · `MANDATE_CEILING` · `CATEGORY_BLOCKED` · `TXN_CAP` · `DAILY_CAP` · `IDEMPOTENCY_CONFLICT`

AP2 scope: authorization **objects / primitives** only. This is not a full AP2 A2A mesh.

## Decision states

| Result | UCP status | `rail_call` |
|---|---|---|
| APPROVE | `completed` | `true` — order and payment ids present |
| DENY | `requires_escalation` | `false` — rail was not invoked |
| PAYMENT_FAILED | `incomplete` | `true` — rail was invoked; payment failed |

## Settlement rail

Selected by `PAYMENT_RAIL`:

- `mock` — `MockRazorpayRail` (in-process boundary: order, payment, capture, failure, webhook-shaped events)
- `razorpay` — `RazorpayTestRail` (official SDK, your own Test Mode keys only)

`receipt` on create-order is a SHA-256 prefix of the idempotency key, ≤ 40 characters.

## Receipt mapping

Receipt fields: `cart_mandate_id`, `intent_mandate_id`, `trace_id`, `order_id`, `payment_id`, `amount_paise`.

## Failure behavior

Expired CartMandate or catalog price drift: deny, `rail_call=false`, no order. Buyer must create a new checkout.
