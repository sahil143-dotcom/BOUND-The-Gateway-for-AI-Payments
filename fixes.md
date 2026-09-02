# BOUND — Full Audit, Loopholes & Fix Plan

**Audited:** 2026-09-02 · commit `04a5e11` (branch `fix/vercel-web-root-directory`, merged upstream as `663cde8`)
**Method:** full read of all 85 tracked files, git history, both remotes, PR #1, `PLAN.md`, `BOUND_Fixes_and_Improvements.docx`. Test suite executed (**15 passed**). Twelve runtime probes executed against the real code to confirm or reject each suspected defect — every finding marked **CONFIRMED** below was reproduced, not inferred.

---

## 0. Executive verdict

The **idea is genuinely good** and the framing ("AI requests. BOUND authorizes. The rail settles.") is the right one. The scaffolding is clean, the tests are honest, the deny-path story is real, and the code discipline around "policy never imports the rail" is respected.

But there is a gap between what the product **claims** and what the code **enforces**, and it is not a small one:

> **The thing BOUND says it protects — the human's spending authority — is supplied by the very agent it is supposed to constrain.**

The `IntentMandate` (ceiling + category allowlist) arrives in the request body of `POST /checkout-sessions`. An agent asks for its own limit and BOUND writes it down as if it were a mandate. Two of the six gates (`MANDATE_CEILING`, `CATEGORY_BLOCKED`) therefore only ever fire against an *honest* agent. A hostile one declares `max_paise: 99999999` and sails through.

On top of that there are three independently fatal defects:

| | Defect | Effect |
|---|---|---|
| 1 | No completed-session check | **One cart → two Razorpay orders → double charge** |
| 2 | Unauthenticated webhook in default config | **Anyone can forge audit records, inflate GMV, and DoS the merchant** |
| 3 | Attacker-supplied intent ceiling | **The core authorization promise is unenforced** |

All three are reproduced below with output. Any of them, found by a judge or a reviewer, undoes the pitch. All three are fixable in roughly a day.

**Bottom line:** keep the vision, keep the architecture, keep the copy. Fix P0-1 through P0-4 before you show this to anyone. Then do the vision work in §3 — that is what turns it from "a good demo" into "a defensible product."

> **Added in the second pass:** §13 is a blunt Razorpay-reviewer verdict on whether this gets selected. §14 is the exact list of what changes that verdict. §15 is a full visual/UX audit conducted by running the app live in a browser. §16 is the AI-integration plan for your AIML API credits. Read §13 first.

---

## 1. What is genuinely strong — do not touch

- **The one-line thesis.** "AI requests. BOUND authorizes. The rail settles." is sharp, memorable, and correct. Keep it verbatim.
- **`policy.py` is clean.** Pure function, no I/O, no rail import, no LLM. Deterministic. This is the heart and it is well built.
- **`rail_call` as a first-class ledger column.** The single best design decision in the repo. It makes the negative claim ("Razorpay was never called") *auditable* instead of rhetorical.
- **The rail Protocol + `MockRazorpayRail`.** Lets the whole product run and demo with zero credentials. Correctly decided, and better than what `PLAN.md` originally specified.
- **`RazorpayTestRail` refuses non-`rzp_test_` keys** ([razorpay_rail.py:235](bound/razorpay_rail.py:235)) and `RazorpayTestRail.create_payment` deliberately raises rather than synthesising a payment ([razorpay_rail.py:265](bound/razorpay_rail.py:265)). Both are the right call and show good instincts.
- **Money is integer paise end-to-end.** No floats anywhere. Correct for a payments system.
- **The credential hygiene.** README and `.env.example` repeatedly refuse to invent or borrow keys. Keep that tone.
- **Honest AP2 scoping in docstrings** ("AP2-shaped … not a full AP2 mesh").
- **`SpyRail` + the three no-rail-call tests.** `assert service.spy.calls == []` is exactly the right way to prove the deny path.
- **The staged gate animation** in `CommandCenter`/`Authorization`. Genuinely good demo craft — it makes an invisible policy decision legible.

---

## 2. Scorecard against your own stated vision

From `PLAN.md` §17 "Done" and the docx MUST/SHOULD checklist:

| # | Claim | Status | Note |
|---|---|---|---|
| 1 | `/.well-known/ucp` advertises `com.razorpay.payments` | ✅ | Shape matches the 2026-04-08 `payment_handlers` map |
| 2 | Successful complete creates an order whose notes include `cart_mandate_id` | ⚠️ | True of the **mock** rail. Never executed against real Razorpay |
| 3 | Expiry and price drift deny and create no order | ✅ | Genuinely proven by test + ledger |
| 4 | Console replays a success trace and a deny trace | ✅ | Both consoles do this |
| 5 | Webhooks signature-verified, duplicate ids ignored | ❌ | **Verification is skipped entirely when `PAYMENT_RAIL=mock` — the default.** See P0-2 |
| 6 | `policy.py` / `razorpay_rail.py` have no LLM | ✅ | No LLM anywhere in the repo at all |
| 7 | README is enough to run a buy and both block paths | ⚠️ | Python path yes. **Nothing tells you how to run the Next.js UI** |
| — | Visible AI buyer initiates purchase | ⚠️ | Visible, but it is keyword scoring, not an AI. See P2-1 |
| — | AP2 authorization primitives | ⚠️ | Hand-rolled dataclasses. The official AP2 package `PLAN.md` §4 mandates is not a dependency |
| — | Official UCP client as reference buyer | ❌ | Not present. No vendored UCP server either (`PLAN.md` §4/§6) |
| — | Captured vs blocked GMV as first-class metric | ❌ | **`MetricsStrip.tsx` is dead code.** GMV appears only in the old Jinja console, not the primary UI |
| — | Deterministic policy decides, AI never authorizes | ⚠️ | True in code. But the *inputs* to that decision are attacker-controlled. See P0-1 |

---

## 3. Your vision, refined

Your current framing is a **checkout guard**. That is a feature. The refined framing is a **spending-authority layer**, which is a product. The difference is where the mandate comes from.

### 3.1 The one sentence that should change

> **Current:** "BOUND is the authorization boundary between an AI buyer and Razorpay."
>
> **Refined:** "BOUND holds the human's spending mandate, so an AI agent can transact without ever holding spending authority."

Why this matters: the current sentence makes BOUND a *validator* — and a validator that trusts caller-supplied limits validates nothing. The refined sentence makes BOUND a *custodian* of authority that the agent cannot forge. That is a real moat, it is what actually goes wrong in agentic commerce, and it is defensible under questioning.

### 3.2 The three primitives the vision needs (and currently lacks)

**1. A principal.** Right now there is no user. No account, no session, no identity. "The human authorized ₹1,800" is not recorded anywhere as a fact about a human — it is a number in a JSON body. You need the thinnest possible notion of a principal: an id, and mandates that belong to it.

**2. A pre-registered mandate.** The mandate must exist *before* the agent asks, and must be referenced by id, never by value:

```
POST /mandates            (human, authenticated)  -> mandate_7f3a  { cap: ₹1800, categories: [apparel], expires, budget_remaining }
POST /checkout-sessions   (agent)                 -> { items, mandate_id: "mandate_7f3a" }   # id only, never a cap
```

This one change converts `MANDATE_CEILING` from decoration into enforcement, and it is maybe 60 lines of work.

**3. An agent identity.** Who is spending? There is no answer today, which means no per-agent budget, no revocation, no "this agent went rogue, cut it off," and no story for the multi-agent world you are pitching into. An API key per agent, recorded on every ledger row, is enough.

### 3.3 The metric that should lead

`Agent GMV blocked` is your best asset and it is currently buried in dead code. But state it precisely, because "prevented" invites the question "prevented from what?":

> **Agent GMV captured** — money that moved because a mandate said yes.
> **Agent GMV blocked** — money an agent tried to move that no mandate authorized.

Second framing is unarguable. First is what the merchant cares about. Put both on the first screen of the primary UI, not the legacy console.

### 3.4 Make the guarantee structural, not conventional

Today "no approval → no rail call" holds because the code is written politely: `handler.py` checks `decision.allowed` and returns early. Nothing *prevents* a future edit from calling the rail first. Make it a type-level guarantee:

```python
@dataclass(frozen=True)
class Authorization:          # only enforce() can construct one
    cart_mandate_id: str
    amount_paise: int
    _token: str

def create_order(self, *, auth: Authorization, ...):   # rail physically cannot be called without one
```

Now "policy never talks to the rail" is enforced by the signature, and you can say so on a slide. This is the single highest-leverage architectural change in this document.

### 3.5 Scope discipline — resist these

Your docx §6 list is correct and you should hold the line. Specifically: **do not** add an LLM to the buyer to make it "more AI," do not add MCP, do not add a second merchant. The interesting claim is *deterministic authorization*, and every LLM you add to the money path weakens it. If you want the buyer to feel more agentic, make the *narration* richer, not the *decision*.

---

## 4. P0 — Critical. Fix before showing this to anyone.

### P0-1 · The IntentMandate is supplied by the agent it is meant to constrain **[CONFIRMED]**

**Where:** [bound/handler.py:73-80](bound/handler.py:73) · [bound/app.py:107-112](bound/app.py:107)

```python
default_intent = issue_intent_mandate(
    max_paise=int(intent["max_paise"]) if intent and "max_paise" in intent else 180000,
    allowed_categories=list(intent["allowed_categories"]) if intent and "allowed_categories" in intent else ...,
```

`POST /checkout-sessions` passes `body.intent` straight through. The caller names its own ceiling *and* its own category allowlist, and BOUND records both as a signed "mandate."

**Reproduced:**
```
agent-supplied ceiling accepted: 99999999
agent-supplied categories accepted: ['apparel', 'weapons', 'gift_cards']
result with self-declared ₹999,999 ceiling: APPROVE
```

**Consequence:** `MANDATE_CEILING` and `CATEGORY_BLOCKED` — two of the six gates — cannot fire against a hostile agent. The only real backstops are the merchant's `max_txn_paise` and `daily_cap_paise`, which are *merchant* limits, not *user* limits. The sentence "the AI cannot exceed what the human authorized" is currently false.

Worse for the demo: because the UI sends the cap it parsed from the user's own sentence, `MANDATE_CEILING` is **unreachable through the happy path**. You cannot demo your own gate.

**Fix (minimum viable, ~60 lines):**
1. Add a `mandates` table: `id, principal_id, max_paise, allowed_categories, expires_at, budget_remaining_paise, created_at`.
2. `POST /mandates` creates one. For the demo this can be the UI's "Max authorized" control — the point is that it is a *separate, prior* act from the agent's request.
3. `POST /checkout-sessions` accepts **`mandate_id` only**. Reject any request body containing `max_paise` or `allowed_categories` with `400` — do not silently ignore it.
4. `enforce()` loads the mandate server-side by id.
5. Decrement `budget_remaining_paise` on capture, inside the same transaction (see P0-3).

**Then:** `MANDATE_CEILING` becomes demonstrable — set a ₹1,500 mandate, have the agent try to buy a ₹1,699 kurta, watch it get blocked. That is a *far* better demo beat than the current one.

---

### P0-2 · `/webhooks/razorpay` is unauthenticated in the default configuration **[CONFIRMED]**

**Where:** [bound/app.py:141](bound/app.py:141)

```python
if settings.rail_name == "razorpay":      # <-- mock (the default) skips verification entirely
    if not secret: raise HTTPException(503, ...)
    if not x_razorpay_signature or not verify_signature(...): raise HTTPException(400, ...)
```

`PAYMENT_RAIL=mock` is the default, is what `.env.example` ships, and is what you will deploy. In that mode the endpoint accepts **any unsigned POST from anyone** and writes it straight into the ledger with `rail_call=True`.

**Reproduced — one unauthenticated request:**
```
POST /webhooks/razorpay  (no signature)                    -> HTTP 200 {'ok': True}
captured_paise:                    0  ->  999999999        # fake ₹9,999,999.99 in the "append-only audit ledger"
captured_today (feeds DAILY_CAP):        999999999
merchant daily cap:                        5000000
DAILY CAP NOW TRIPPED:                        True

GET /audit/tr_INJECTED                                     -> HTTP 200, 1 event
    type=CAPTURE  amount_paise=999999999  rail_call=1  rzp_order_id=order_forged

# and then, every legitimate purchase afterwards:
POST /checkout-sessions/{id}/complete -> decision: DAILY_CAP
                                         "Cart would exceed the merchant daily capture cap."
```

**Four distinct impacts from that single request:**
1. **Audit forgery** — a fabricated `CAPTURE` is indistinguishable from a real one, and `/audit/tr_INJECTED` serves it back as proof. Your headline feature is trace replay; this makes trace replay untrustworthy.
2. **Metric forgery** — "Agent GMV captured" is attacker-writable.
3. **Denial of service** — the forged capture consumes the merchant's daily cap, so every subsequent honest purchase is denied. An attacker can shut the merchant down with one `curl`.
4. It happens in the exact configuration you are going to deploy.

**Fix:**
- Verify the HMAC **unconditionally**, for every rail. In mock mode, verify against `MockRazorpayRail._webhook_secret`.
- If no secret is configured, return `503` and refuse the event. Never fall through to acceptance.
- Reject events whose `notes.trace_id` does not match an existing trace, rather than inventing `"tr_webhook"` ([app.py:153](bound/app.py:153)).
- Reject events whose `order.id` was never issued by this system.
- Regression tests: unsigned → 400; wrong signature → 400; replayed `event_id` → ignored once; unknown trace → rejected.

---

### P0-3 · Same cart, two idempotency keys, two charges **[CONFIRMED]**

**Where:** [bound/handler.py:128-146](bound/handler.py:128) — `complete_checkout` loads the session but **never checks `session["status"]`.**

The idempotency table is keyed on the *idempotency key*, and the Razorpay `receipt` is derived from that same key ([handler.py:25-27](bound/handler.py:25)). So a different key means a different receipt, which means Razorpay's own duplicate-receipt protection does not engage either. Nothing anywhere notices the cart was already settled.

**Reproduced:**
```
order A: order_dde98c7c9435af0d  APPROVE
order B: order_ac4148e65b20e1a2  APPROVE
create_order calls: 2      capture calls: 2
DOUBLE CHARGE: True
captured_paise (ledger): 59800   for one cart of 29900
```

The customer is charged twice for one cart. This is the most serious *correctness* bug in the repo — a payments product that double-charges is not a payments product. Note that `test_idempotency.py` passes: it only ever reuses the *same* key, so it cannot see this.

**Fix:**
1. First thing in `complete_checkout`, after loading: if `session["status"] == "completed"`, return the stored result (look it up by `session_id` in the `idempotency` table) — do not re-enforce, do not re-call the rail.
2. Make `receipt` a function of `cart_mandate_id`, not of the idempotency key — one binding offer, one settlement receipt, forever.
3. Add a `UNIQUE` index on `idempotency(session_id)` as a database-level backstop.
4. Wrap load → policy → order → capture → status-update in one SQLite transaction with `BEGIN IMMEDIATE`, so two concurrent completes cannot interleave.
5. Regression test: same session, two different keys → one order, second returns the first result.

---

### P0-4 · The "append-only" ledger is neither append-only nor tamper-evident **[CONFIRMED]**

**Where:** [bound/db.py:7-22](bound/db.py:7) — the schema has no triggers, no constraints, and no hash chain.

"Append-only" is currently a description of programmer intent, not a property of the system. Combined with P0-2 (anyone can insert) this means the audit ledger — the thing the entire product asks a merchant to trust — has no integrity guarantee at all.

**Reproduced:**
```sql
UPDATE events SET decision='APPROVE', reason='looks fine', rail_call=0 WHERE type='DENY';
DELETE FROM events WHERE type='ORDER_CREATE';
-- both succeeded. A blocked transaction now reads as approved; the order that was created is gone.
```

**Fix:**
1. SQLite triggers: `CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append-only'); END;` and the same for `DELETE`. Cheap, and it makes the claim literally true.
2. Hash-chain each row: add `prev_hash` and `row_hash`, where `row_hash = sha256(prev_hash || canonical(row))`. Add `GET /audit/{trace}/verify` that walks the chain and returns `intact: true/false`.
3. Show that verify endpoint in the demo. "You can check that I did not edit this" is a much stronger claim than "this is append-only," and it is a 40-line change.

---

## 5. P1 — High. These break specific claims or mislead.

### P1-1 · The gate display claims gates ran that never ran **[CONFIRMED]**

**Where:** [bound/gates.py:15-34](bound/gates.py:15) + [web/src/lib/gates.ts:17](web/src/lib/gates.ts:17)

`gate_states()` infers gate results from the single failing code by assuming the six gates run in list order and everything before the failure passed. But `IDEMPOTENCY_CONFLICT` is detected **before** `enforce()` is ever called ([handler.py:144-154](bound/handler.py:144)) — the other five gates are never evaluated.

**Reproduced:**
```
IDEMPOTENCY_CONFLICT ->
    cart pass      <-- never evaluated
    quote pass     <-- never evaluated
    price pass     <-- never evaluated
    intent pass    <-- never evaluated
    limits pass    <-- never evaluated
    idempotency fail
```

Your audit UI displays five green checkmarks for checks that did not happen. In an audit product, that is the worst possible class of bug — and it is exactly the thing a sharp judge will catch.

**Fix:** have `enforce()` return the actual per-gate outcomes (`list[GateResult]`) instead of one code, persist that list on the `POLICY_CHECK` ledger row, and render *that*. Anything not evaluated renders `not_evaluated`, never `pass`. Delete the inference logic in both `gates.py` and `gates.ts`.

Also decide where idempotency belongs: it is presented as gate 6 but runs first. Either move it into `enforce()` as gate 0, or stop calling it a gate and present it as a pre-check. Currently the docs, the UI, and the code disagree with each other.

---

### P1-2 · Blocked GMV is trivially inflatable, and inflates on its own **[CONFIRMED]**

**Where:** [bound/ledger.py:116-124](bound/ledger.py:116) — `blocked_paise()` sums `amount_paise` over **every** `DENY` row. Denials are never stored in the idempotency table ([handler.py:174-176](bound/handler.py:174)), so every retry re-runs policy and appends another `DENY`.

**Reproduced:**
```
one expired cart of 29900 paise, retried 5x
blocked_paise: 0 -> 149500   (delta 149500)
blocked_count (distinct traces): 1
```

₹299 of blocked intent is reported as ₹1,495. This is not only an attack — the UI's own "Authorize with BOUND" retry button ([CommandCenter.tsx:297](web/src/components/CommandCenter.tsx:297)) inflates it during a normal demo. Your headline growth metric drifts upward while a judge watches.

**Fix:** count **distinct traces**, not rows: `SELECT COALESCE(SUM(amount_paise),0) FROM (SELECT DISTINCT trace_id, amount_paise FROM events WHERE type='DENY')`. Apply the same to `captured_paise()`, which has the identical flaw via P0-3. Store deny results in the idempotency table so replays are idempotent too.

---

### P1-3 · The UI claims Razorpay settled when nothing reached Razorpay

**Where:** [Authorization.tsx:114](web/src/components/Authorization.tsx:114) `"RAZORPAY: TEST ORDER CREATED"` · [Authorization.tsx:155](web/src/components/Authorization.tsx:155), [448](web/src/components/Authorization.tsx:448) · [Landing.tsx:125](web/src/components/Landing.tsx:125), [136](web/src/components/Landing.tsx:136) · [Discovery.tsx:19](web/src/components/Discovery.tsx:19), [332](web/src/components/Discovery.tsx:332)

All of this is hardcoded. In the default and *only currently deployable* configuration, `MockRazorpayRail` mints a fake `order_…` id in-process and no Razorpay API is called. A judge who opens the Razorpay dashboard finds nothing.

Compounding it: [AppShell.tsx:23](web/src/components/AppShell.tsx:23) initialises the status badge to `"RAZORPAY / TEST"` *before* `/metrics` resolves — so the UI asserts Razorpay on first paint even in mock mode. And [AppShell.tsx:87](web/src/components/AppShell.tsx:87) hardcodes `UCP / CONNECTED`, a status light wired to nothing.

Your own docx MUST-FIX #5 is "tighten claims." The old Jinja console actually does this correctly with its `rail_label` badge ("Payment rail · Mock"); the new UI regressed.

**Fix:**
- Drive every rail mention from `metrics.rail_name`. In mock mode say "**MOCK RAIL** · order created (simulated)".
- Initialise the badge to `"RAIL / …"` or an empty state, never to Razorpay.
- Either derive `UCP / CONNECTED` from a real `GET /.well-known/ucp` fetch, or delete the badge.
- Keep the *architecture* labels ("RAZORPAY SETTLES" as a flow diagram step) — those describe the design and are fine. It is the *status assertions* that must be honest.

---

### P1-4 · The signing key and the ledger both live on ephemeral disk

**Where:** [bound/mandates.py:14-22](bound/mandates.py:14) writes `.signing_key` into the repo root on first use. [config.py:18](bound/config.py:18) defaults `BOUND_DB` to `./bound.db`.

On any container platform (Render, Railway, Fly, Vercel functions) both are lost on restart and differ per instance. Consequences:
- **Every CartMandate issued before a restart fails signature verification → `CART_INVALID`.** Mid-demo redeploy = every transaction breaks.
- With more than one instance, mandates issued by instance A are rejected by instance B — nondeterministically.
- The audit ledger — the product's entire memory — is wiped on every deploy.

**Fix:** read the signing key from `BOUND_SIGNING_KEY` (env, base64) and fail loudly at startup if it is absent in production; keep file-generation for local dev only. Move the ledger to Postgres (Neon/Supabase free tier) or, at minimum, a mounted volume. This is a prerequisite for P1-5.

---

### P1-5 · There is no deployed API, so the deployed UI does not work

Seven of the nine commits fought Vercel; the resolution was "Vercel hosts only `web/`, FastAPI is hosted elsewhere and reached via `NEXT_PUBLIC_BOUND_API_URL`." **Nothing is hosting FastAPI.** A `Procfile` exists but no platform config is committed and no URL is set.

Present state: the Vercel landing page renders, and then every catalog / checkout / audit call fails. [README.md:58](README.md:58) admits this. Right now the public artifact of this project is a landing page attached to nothing.

**Fix:** deploy `bound.app:app` to Render or Railway (the `Procfile` already works), set `NEXT_PUBLIC_BOUND_API_URL` and `CORS_ORIGINS` in Vercel, redeploy, and verify the full flow end to end on the public URLs. Do P1-4 first or the ledger resets under you. **This is the highest-priority non-security item** — everything else is invisible until it is done.

---

### P1-6 · CORS allows any `*.vercel.app` origin with credentials

**Where:** [bound/app.py:24-31](bound/app.py:24)

```python
allow_origin_regex=r"https://.*\.vercel\.app",
allow_credentials=True,
allow_methods=["*"], allow_headers=["*"],
```

Any site anyone deploys on Vercel can make credentialed cross-origin calls to your API. Combined with zero authentication on every endpoint (P1-7), any page on the internet can drive your payment handler.

**Fix:** pin `CORS_ORIGINS` to your exact production and preview hostnames. Drop the wildcard regex, or narrow it to your own project slug. Set `allow_credentials=False` until there is actually a cookie to protect.

---

### P1-7 · No authentication or agent identity on any endpoint **[CONFIRMED]**

```
GET   /.well-known/ucp             -> 200 (no auth)
GET   /catalog                     -> 200 (no auth)
GET   /metrics                     -> 200 (no auth)
GET   /traces                      -> 200 (no auth)   # leaks every merchant decision + amounts
POST  /checkout-sessions           -> 200 (no auth)
POST  /webhooks/razorpay           -> 200 (no auth)
POST  /buyer/shop                  -> 200 (no auth)
```

Discovery and catalog *should* be public. The rest should not. `/traces` and `/metrics` publish the merchant's full commercial history — every amount, every decision — to anyone.

Beyond the exposure, the absence of an agent identity is a **vision** problem: with no idea *which* agent is spending, you cannot offer per-agent budgets, revocation, or anomaly detection. Those are the features that make this a platform rather than a filter.

**Fix:** API key per agent (`Authorization: Bearer …`) on `/checkout-sessions`, `/complete`, `/buyer/shop`. Record `agent_id` on every ledger row. Put `/traces` and `/metrics` behind a merchant key. Keep discovery and catalog open. Then add per-agent budgets — that is a slide, not just a fix.

---

## 6. P2 — Medium. Correctness, honesty, and structure.

**P2-1 · There is no AI in the AI buyer.** [bound/buyer.py:19](bound/buyer.py:19) is `next((s for s in hits if "shirt" in s.name.lower()), min(...))` — a hardcoded substring match on "shirt". [web/src/lib/agent.ts:61](web/src/lib/agent.ts:61) is keyword scoring. `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` are declared in [config.py:36-38](bound/config.py:36) and **never read anywhere**. The docx MUST-FIX #2 is "make the AI buyer visible." It is visible; it is not AI. — *Fix: either wire one LLM call for product selection + narration (never for authorization — that boundary is the whole point, and keeping it is a strength you should say out loud), or rename it "buyer agent" and delete the unused LLM keys. Do not leave dead keys implying capability you do not have.*

**P2-2 · `IDEMPOTENCY_CONFLICT` downgrades a settled session. [CONFIRMED]** [handler.py:308](bound/handler.py:308) calls `_set_session_status(..., "requires_escalation")` unconditionally. Reproduced: `status after successful buy: completed` → `status after conflicting replay: requires_escalation`. Money settled, but the session now reads as blocked. — *Fix: never regress a `completed` session; return the conflict without mutating status.*

**P2-3 · Missing SKU reports `PRICE_DRIFT`.** [policy.py:47](bound/policy.py:47). A delisted SKU is not a price change. Wrong deny reason in the audit record, which is a data-quality problem in the artifact you ask people to trust. — *Fix: add `SKU_UNAVAILABLE`.*

**P2-4 · `CATEGORY_BLOCKED` is ambiguous.** Returned both for the intent allowlist ([policy.py:76](bound/policy.py:76)) and the merchant allowlist ([policy.py:93](bound/policy.py:93)), but `gates.py` maps it only to the *intent* gate — so a merchant-level block is displayed as an intent failure. — *Fix: split into `CATEGORY_NOT_IN_MANDATE` and `CATEGORY_NOT_SOLD`.*

**P2-5 · No transaction boundary across the settlement sequence.** [handler.py:184-273](bound/handler.py:184) runs order → payment → capture → receipt → status as five independent steps with a ledger write between each. A crash after `create_order` leaves an order at Razorpay, a session stuck `incomplete`, and no reconciliation path. For a payments system this is a real gap. — *Fix: one transaction; add a startup reconciliation that finds `ORDER_CREATE` rows with no terminal event and queries the rail.*

**P2-6 · Mock rail webhooks are generated and then thrown away.** `MockRazorpayRail._emit` builds correctly-signed, correctly-shaped events into `self._webhooks` ([razorpay_rail.py:168-190](bound/razorpay_rail.py:168)) and **nothing ever delivers them.** `handler.py` marks the session `completed` inline after capture, contradicting `PLAN.md` §10 ("mark completed only after `order.paid`"). So the webhook path — a MUST item — is untested and unexercised in the default config. — *Fix: have the mock rail POST its events back to `/webhooks/razorpay` (or call `ingest` directly), and let the session complete on `order.paid`. This also gives you a real signature-verification demo and closes P0-2's test gap.*

**P2-7 · Ten SQLite connections per checkout. [CONFIRMED]** [db.py:45-51](bound/db.py:45) — every `connect()` does `mkdir`, opens a fresh connection, sets `PRAGMA journal_mode=WAL`, and re-runs the entire `CREATE TABLE` script. Measured: **2 connections for one `create_checkout`, 10 for one `complete_checkout`.** — *Fix: run the schema once at startup; hold a connection per request (FastAPI dependency) or a small pool.*

**P2-8 · The expiry demo simulates time rather than passing it.** `/buyer/shop` injects `now = clock + 91s` into `complete_checkout` ([app.py:191-197](bound/app.py:191)). Defensible for a demo, but a judge reading the code sees the failure being staged, and the docx says the expiry block is *the* primary failure to show. Note the public `/complete` endpoint correctly does **not** accept a clock — good. — *Fix: keep the fast path, but add a real 90-second countdown option so you can prove it with a wall clock. Label the fast one "simulated" in the UI.*

**P2-9 · The drift demo mutates global state.** [app.py:198-215](bound/app.py:198) calls `svc.catalog.set_price()` on the process-wide catalog and restores it in a `finally`. Any concurrent request in that window sees the wrong price — including a judge on a second browser tab. — *Fix: pass a price-override into `enforce()` for the scenario instead of mutating shared state.*

**P2-10 · `captured_today_paise` compares a datetime string to a date string.** [ledger.py:180](bound/ledger.py:180) `ts >= date('now')`. Works lexicographically for today, but is UTC-only (wrong day boundary for an INR merchant) and also matches future timestamps. — *Fix: explicit UTC range, or store an indexed `day` column.*

**P2-11 · Six dead components, including the GMV strip. [CONFIRMED]** `MetricsStrip`, `Settlement`, `AiRequest`, `Tripwire`, `Stamp`, `StageRail` are imported by nothing. Two matter: **`MetricsStrip` is the captured-vs-blocked GMV display** (docx SHOULD-FIX #10/#12) and **`Settlement`** is the verdict panel. Your best metric is written, working, and unreachable. — *Fix: wire `MetricsStrip` into the command centre; delete the other five.*

**P2-12 · Two consoles, two narratives.** `console/` (Jinja, served at `/` and `/console`) and `web/` (Next.js) both exist, tell overlapping stories, and disagree — the Jinja one is honest about the mock rail and shows GMV; the Next one is prettier and does neither. `PLAN.md` §16 explicitly said no extra UI framework before Phase 4 sign-off. — *Fix: pick the Next UI as the product, port the rail badge and GMV strip into it, and either delete `console/` or keep it as an explicitly-labelled internal debug view.*

**P2-13 · Neither AP2 nor UCP is an actual dependency.** No `ap2` package in `pyproject.toml`, no vendored UCP server, no official UCP client — all three are `PLAN.md` §4 requirements, and docx MUST-FIX #1 is "validate against the current official UCP contract." What exists is hand-rolled dataclasses that *match the shape*. The docstrings are honest; [README.md:16](README.md:16) ("AP2 is used as authorization objects") slightly overstates. — *Fix: either install the official AP2 types and use them, or say plainly "AP2-compatible object shapes, hand-implemented; no AP2 dependency." Run the official UCP client against your discovery endpoint once and record the result — that is cheap and it is the difference between "we followed the spec" and "we verified against the spec."*

**P2-14 · `SpyRail` — a test double — ships in production code.** [razorpay_rail.py:193](bound/razorpay_rail.py:193). — *Fix: move to `tests/`.*

**P2-15 · Module-level app initialisation.** [app.py:19-20](bound/app.py:19) runs `get_settings()` and `build_service()` at import. Bad `.env` crashes at import time, and the app cannot be constructed with test settings without env juggling. — *Fix: an app factory, plus FastAPI dependency injection for the service.*

**P2-16 · `RailNotCalledError` is misnamed.** [razorpay_rail.py:14](bound/razorpay_rail.py:14) — raised when a rail method is *unsupported*, not when the rail was not called. In a codebase whose central concept is `rail_call`, this name actively misleads. — *Fix: rename to `RailOperationUnsupported`.*

---

## 7. P3 — Polish. Small, cheap, and visible to judges.

- **`BOUND © 2024`** in the footer ([AppShell.tsx:101](web/src/components/AppShell.tsx:101)) — the project is 2026.
- **Dead `POLICIES` nav item** with `title="Policies are not available in this build"` ([AppShell.tsx:69](web/src/components/AppShell.tsx:69)). Either build it or remove it; a visible "not available" reads as unfinished.
- **Non-functional footer links** — Documentation / Support / API Status are `<span>`s styled as links ([AppShell.tsx:103-105](web/src/components/AppShell.tsx:103)). Point Documentation at `/docs/handler.md` (it is served, and it is good) and delete the rest.
- **Desktop-only.** `min-w-[1100px]` on the shell ([AppShell.tsx:34](web/src/components/AppShell.tsx:34)) means horizontal scrolling on any phone. Judges open links on phones. At minimum make the landing page responsive.
- **19 of 21 SKUs have no image** ([web/src/lib/products.ts:1-4](web/src/lib/products.ts:1)) and fall back to a text box. Either add images or design the fallback deliberately.
- **2.3 MB JPEGs served via raw `<img>`** — no `next/image`, so no optimisation. Two files are ~4.6 MB of the repo. Compress to <200 KB and use `next/image`.
- **`web/.cc-shot/*.png`** (334 KB of dev screenshots) committed. Remove or move to `docs/`.
- **`ProductShot` modal** has no Escape handler, no focus trap, no `aria-modal` ([ProductShot.tsx:48-61](web/src/components/ProductShot.tsx:48)).
- **`Ticker` animates from 0 on every mount**, so metrics count up from zero on each page view — reads as fake. Initialise to `value`.
- **`sessionStorage` gate on the landing page** ([app/page.tsx:12](web/src/app/page.tsx:12)) means a reload skips your pitch permanently. Add a way back.
- **No error boundary** — one render throw blanks the whole app mid-demo.
- **Vercel leftovers:** root [next.config.ts](next.config.ts) (re-exports `./web/next.config`), root [package.json](package.json) (declares `next`/`react` with no lockfile), and [.vercelignore](.vercelignore) are all dead now that Root Directory is `web`. These are the exact files that caused the seven-commit deploy loop — delete them so it cannot recur.
- **`web/vercel.json` duplicates dashboard settings** (`framework`, `installCommand`, `buildCommand`) that [README.md:50-55](README.md:50) also tells you to set in the UI. That double source of truth is what PR #1 was fighting. Reduce to `{}` and configure in one place only.
- **`docs/handler.md` says "six deterministic gates" then lists eight codes.** Also inconsistent with `gates.py`. Pick a number and make code, docs, and UI agree.
- **`.gitignore` contains `.env*`**, which would ignore `.env.example` — it survives only because it is already tracked. A fresh clone that regenerates it would silently lose it. Use `.env` and `!.env.example`.
- **`PLAN.md` §13 says daily cap ₹10,000**; [data/catalog.json](data/catalog.json) has `5000000` paise = ₹50,000. Reconcile.
- **README has no instructions for the Next.js UI.** The primary demo surface is undocumented — no `cd web && npm install && npm run dev`. Add it.
- **`Authorization.tsx` (602 lines), `Discovery.tsx` (477), `Landing.tsx` (421)** are doing too much each. Not urgent; will bite you when you change the flow.
- **`razorpay` is a hard dependency** even for the mock path. Move to an optional extra.

---

## 8. Test coverage gaps

15 tests pass in 0.40s. They are well written and they prove the deny path properly. But coverage is thinnest exactly where the product's claims are strongest:

| Untested | Why it matters |
|---|---|
| Webhook signature verification | It is a MUST claim and it is **broken** (P0-2) |
| Webhook `event_id` dedupe | Claimed in `PLAN.md` §17.5, never asserted |
| Two different idempotency keys, one session | Would have caught the **double charge** (P0-3) |
| Agent-supplied intent ceiling | Would have caught the **core loophole** (P0-1) |
| Repeated deny → metric inflation | Would have caught P1-2 |
| Session status transitions | Would have caught P2-2 |
| `/buyer/shop` and every HTTP route | No `TestClient` test exists at all |
| `/.well-known/ucp` shape | The UCP contract is asserted nowhere |
| Metric correctness | GMV numbers are never asserted |

**Every P0 and P1 in this document should land with a regression test.** The three probes in §11 are ready to be converted directly into `tests/test_security.py`.

Also add: a CI workflow (`pytest` + `tsc --noEmit` + `next build`), and a linter. Neither exists.

---

## 9. Prioritised action plan

### Day 1 — stop the bleeding (do not demo before this is done)
1. **P0-2** Verify webhook HMAC unconditionally; reject unknown traces. *(~1h)*
2. **P0-3** Completed-session guard + receipt from `cart_mandate_id` + transaction. *(~2h)*
3. **P0-1** `mandates` table; `/checkout-sessions` takes `mandate_id` only; reject inline caps. *(~3h)*
4. **P1-2** Distinct-trace GMV aggregation. *(~30m)*
5. Regression tests for all four. *(~2h)*

### Day 2 — make the claims true
6. **P0-4** Append-only triggers + hash chain + `/audit/{trace}/verify`. *(~3h)*
7. **P1-1** `enforce()` returns real per-gate results; UI renders them; `not_evaluated` never renders as pass. *(~2h)*
8. **P1-3** Rail labels driven by `metrics.rail_name`; honest mock labelling. *(~1h)*
9. **P1-6/P1-7** Pin CORS; API key + `agent_id` on every ledger row; protect `/traces` and `/metrics`. *(~2h)*

### Day 3 — ship it
10. **P1-4** Signing key from env; ledger to Postgres. *(~2h)*
11. **P1-5** Deploy FastAPI; set `NEXT_PUBLIC_BOUND_API_URL` + `CORS_ORIGINS`; verify end to end on public URLs. *(~2h)*
12. **P2-11** Wire `MetricsStrip`; delete the other five dead components. *(~1h)*
13. **P2-6** Mock rail delivers its own webhooks; session completes on `order.paid`. *(~2h)*
14. **P3** Footer year, dead nav, responsive landing, compress images, delete Vercel leftovers. *(~2h)*

### Day 4 — win it
15. **§3.4** `Authorization` capability object so the rail cannot be called without a policy approval. *(~2h)*
16. **§3.2** Per-agent budgets + revocation. This is the demo beat nobody else will have. *(~3h)*
17. **P2-13** Run the official UCP client against your discovery endpoint; record the result in `docs/`. *(~1h)*
18. **P2-1** Decide on the LLM: wire one selection/narration call, or delete the unused keys and say plainly that authorization is deterministic by design. *(~1h)*
19. CI workflow. *(~1h)*

### The demo, re-ordered around the fixes
The current script demos a block you control. After P0-1 you can demo something much stronger:

> Human sets a ₹1,500 mandate. Agent is asked for a ₹1,699 kurta. **BLOCKED — `MANDATE_CEILING`.** Razorpay never called, `rail_call=false`, and here is the hash-chain verify proving I did not edit the record. Now the human raises the mandate to ₹1,800. Same agent, same request. **APPROVED.** Same ledger, same chain.

That is the whole product in forty seconds, and it is only possible once the mandate is server-side.

---

## 10. Loophole summary table

| ID | Severity | Loophole | Confirmed | Location |
|---|---|---|---|---|
| P0-1 | Critical | Agent supplies its own spending ceiling and category allowlist | ✅ | [handler.py:73](bound/handler.py:73) |
| P0-2 | Critical | Unauthenticated webhook → audit forgery, GMV forgery, merchant DoS | ✅ | [app.py:141](bound/app.py:141) |
| P0-3 | Critical | One cart + two idempotency keys → two orders → double charge | ✅ | [handler.py:128](bound/handler.py:128) |
| P0-4 | Critical | "Append-only" ledger accepts UPDATE/DELETE; no tamper evidence | ✅ | [db.py:7](bound/db.py:7) |
| P1-1 | High | Gate display shows PASS for gates that never ran | ✅ | [gates.py:15](bound/gates.py:15) |
| P1-2 | High | Blocked GMV inflates on every retry, incl. the UI's own button | ✅ | [ledger.py:116](bound/ledger.py:116) |
| P1-3 | High | UI asserts Razorpay settlement while running the mock rail | — | [Authorization.tsx:114](web/src/components/Authorization.tsx:114) |
| P1-4 | High | Signing key + ledger on ephemeral disk → `CART_INVALID` after restart | — | [mandates.py:14](bound/mandates.py:14) |
| P1-5 | High | No API deployed; the public UI is attached to nothing | — | [README.md:58](README.md:58) |
| P1-6 | High | CORS allows any `*.vercel.app` with credentials | — | [app.py:24](bound/app.py:24) |
| P1-7 | High | Zero auth on any endpoint; no agent identity | ✅ | [app.py](bound/app.py) |
| P2-2 | Medium | Idempotency conflict downgrades a settled session | ✅ | [handler.py:308](bound/handler.py:308) |
| P2-6 | Medium | Mock webhooks generated then discarded; webhook path unexercised | — | [razorpay_rail.py:168](bound/razorpay_rail.py:168) |
| P2-7 | Medium | 10 SQLite connections + 10 DDL replays per checkout | ✅ | [db.py:45](bound/db.py:45) |
| P2-9 | Medium | Drift demo mutates process-global catalog state | — | [app.py:198](bound/app.py:198) |
| P2-11 | Medium | GMV strip (your best metric) is dead code | ✅ | [MetricsStrip.tsx](web/src/components/MetricsStrip.tsx) |
| P2-13 | Medium | Neither AP2 nor UCP is an actual dependency | ✅ | [pyproject.toml](pyproject.toml) |

---

## 11. Reproduction appendix

All probes were run from the repo root with `PYTHONPATH=.` against a temporary SQLite database. Dependencies were already importable except `razorpay`, which is only imported lazily inside `RazorpayTestRail`, so the mock path runs unaffected.

### Baseline
```bash
python -m pytest -q
# 15 passed in 0.40s
```

### P0-1, P0-3, P1-2 — ceiling, double charge, metric inflation
```python
import tempfile
from pathlib import Path
from datetime import datetime, timedelta, timezone
from bound.catalog import load_catalog
from bound.config import ROOT, Settings
from bound.handler import BoundService
from bound.ledger import Ledger
from bound.razorpay_rail import MockRazorpayRail, SpyRail

tmp = Path(tempfile.mkdtemp())
settings = Settings(PAYMENT_RAIL="mock", BOUND_DB=tmp/"p.db", CART_TTL_SECONDS=90)
spy = SpyRail(MockRazorpayRail())
svc = BoundService(settings, load_catalog(ROOT/"data"/"catalog.json"), Ledger(settings.bound_db), spy)
pay = {"instruments": [{"handler_id": "razorpay_test", "type": "card"}]}

# P0-3: double charge
s = svc.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}])
a = svc.complete_checkout(s["id"], payment=pay, idempotency_key="key-A")
b = svc.complete_checkout(s["id"], payment=pay, idempotency_key="key-B")
assert a["order_id"] != b["order_id"]                 # TWO orders for one cart
assert spy.calls.count("create_order") == 2
assert svc.ledger.captured_paise() == 2 * s["amount_paise"]

# P0-1: agent declares its own ceiling and categories
s3 = svc.create_checkout(
    items=[{"sku_id": "sku_kurta_indigo", "quantity": 1}],
    intent={"max_paise": 99999999, "allowed_categories": ["apparel", "weapons", "gift_cards"]},
)
assert s3["intent_mandate"]["max_paise"] == 99999999   # accepted verbatim
assert svc.complete_checkout(s3["id"], payment=pay, idempotency_key="key-C")["decision"] == "APPROVE"

# P1-2: blocked GMV inflates on retry
now = datetime.now(timezone.utc)
s4 = svc.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}], now=now)
before = svc.ledger.blocked_paise()
for i in range(5):
    svc.complete_checkout(s4["id"], payment=pay, idempotency_key=f"d-{i}", now=now+timedelta(seconds=91))
assert svc.ledger.blocked_paise() - before == 5 * s4["amount_paise"]   # 29900 reported as 149500
```
**Output:**
```
order A: order_dde98c7c9435af0d APPROVE
order B: order_ac4148e65b20e1a2 APPROVE
create_order calls: 2   capture calls: 2   DOUBLE CHARGE: True
captured_paise: 59800 for one cart of 29900

agent-supplied ceiling accepted: 99999999
agent-supplied categories accepted: ['apparel', 'weapons', 'gift_cards']
result with self-declared ₹999,999 ceiling: APPROVE

one expired cart of 29900 paise, retried 5x
blocked_paise 0 -> 149500 (delta 149500);  blocked_count (distinct traces): 1
```

### P0-2, P1-7 — forged webhook and open endpoints
```python
import os, tempfile
os.environ["BOUND_DB"] = os.path.join(tempfile.mkdtemp(), "p2.db")
os.environ["PAYMENT_RAIL"] = "mock"
from fastapi.testclient import TestClient
from bound.app import app, svc
c = TestClient(app)

forged = {
  "event": "order.paid", "id": "evt_forged_1",
  "payload": {
    "payment": {"entity": {"id": "pay_forged", "amount": 999999999, "order_id": "order_forged"}},
    "order": {"entity": {"id": "order_forged", "amount": 999999999,
              "notes": {"trace_id": "tr_INJECTED", "cart_mandate_id": "cart_FAKE"}}},
  },
}
r = c.post("/webhooks/razorpay", json=forged)        # NO signature header
assert r.status_code == 200                          # accepted
assert svc.ledger.captured_paise() == 999999999      # fake GMV in the ledger
assert c.get("/audit/tr_INJECTED").status_code == 200  # forged trace replays as proof

s = c.post("/checkout-sessions", json={"items": [{"sku_id": "sku_tee_lotus", "quantity": 1}]}).json()
done = c.post(f"/checkout-sessions/{s['id']}/complete", json={},
              headers={"idempotency-key": "real-1"}).json()
assert done["decision"] == "DAILY_CAP"               # honest buys now denied: DoS
```
**Output:**
```
POST /webhooks/razorpay (unsigned) -> 200 {'ok': True}
captured_paise:  0 -> 999999999
captured_today (feeds DAILY_CAP): 999999999   merchant daily cap: 5000000
DAILY CAP NOW TRIPPED: True
GET /audit/tr_INJECTED -> 200, 1 event: type=CAPTURE amount=999999999 rail_call=1
real purchase -> DAILY_CAP "Cart would exceed the merchant daily capture cap."

GET  /.well-known/ucp  200   GET /catalog  200   GET /metrics 200   GET /traces 200
POST /checkout-sessions 200  POST /webhooks/razorpay 200            POST /buyer/shop 200
```

### P0-4, P1-1, P2-2, P2-7 — ledger tampering, gate lie, session regression, connections
```python
import sqlite3
# P2-2
s = svc.create_checkout(items=[{"sku_id": "sku_tee_lotus", "quantity": 1}])
svc.complete_checkout(s["id"], payment=pay, idempotency_key="k1")
assert svc._load_session(s["id"])["status"] == "completed"
svc.complete_checkout(s["id"], payment={"instruments": [], "x": 1}, idempotency_key="k1")
assert svc._load_session(s["id"])["status"] == "requires_escalation"   # settled money looks unsettled

# P1-1
from bound.gates import gate_states
assert [g["state"] for g in gate_states("IDEMPOTENCY_CONFLICT")][:5] == ["pass"]*5   # none ran

# P0-4
conn = sqlite3.connect(db_path)
conn.execute("UPDATE events SET decision='APPROVE', reason='looks fine', rail_call=0 WHERE type='DENY'")
conn.execute("DELETE FROM events WHERE type='ORDER_CREATE'")
conn.commit()          # both succeed on an "append-only" table

# P2-7: wrap sqlite3.connect with a counter, then
svc.complete_checkout(...)   # -> 10 connections, each re-running the full CREATE TABLE script
```
**Output:**
```
status after successful buy: completed
status after conflicting replay: requires_escalation   <-- settled money now looks unsettled

IDEMPOTENCY_CONFLICT -> cart pass, quote pass, price pass, intent pass, limits pass, idempotency fail
   ...but enforce() never ran; those five were never evaluated.

UPDATE + DELETE on 'append-only' events table succeeded. rows now: 6

sqlite connections for ONE create_checkout:   2
sqlite connections for ONE complete_checkout: 10
```

### Dead-component check
```bash
for c in MetricsStrip AiRequest Tripwire Stamp StageRail Settlement; do
  echo "$c: $(grep -rl "$c" web/src --include=*.tsx --include=*.ts | grep -v "components/$c.tsx" | wc -l)"
done
# all six: 0
```

---

## 12. Files touched by this audit

None. This document is the only change. `.signing_key`, `bound.db`, `.pytest_cache/`, and `__pycache__/` were created by running the test suite; all are already gitignored.

---
---

# Second pass — Selection verdict, visual audit, AI integration

*Added 2026-09-02. The app was installed, both servers were started, and every screen was driven live in a browser at 1440×900 and 375×812. Findings prefixed `V-` are visual/UX and were verified on screen, not inferred from source.*

---

## 13. The Razorpay reviewer verdict

You asked me to answer as someone screening this against ~40,000 other submissions. Here is the honest answer.

### 13.1 Would I select this today?

**No — and it would not be close, for one reason that has nothing to do with your code quality.**

Here is what actually happens when a reviewer with 200 submissions in a queue opens yours:

1. They click the deployed link.
2. The landing page loads. It looks good.
3. They click **ENTER BOUND**.
4. The catalog call goes to `NEXT_PUBLIC_BOUND_API_URL`, which is unset, so it falls back to `/bound-api/...`, which on Vercel is nothing. **The screen shows "The catalog did not answer."**
5. They close the tab and score it *"does not run."*

That is the entire review. Median time: **40 seconds.** Nothing else in this document matters until P1-5 is fixed. A prototype that does not run is not evaluated on its ideas — and right now the public artifact of this project is a beautiful landing page bolted to a 404.

### 13.2 If it *did* run, would I select it?

Still no, but now it is close, and the gaps are specific.

A reviewer at a payments company applies four filters in roughly this order:

| Filter | Verdict | Why |
|---|---|---|
| **Does it run?** | ❌ Fail | §13.1. API not deployed. |
| **Is it real, or a mock in a trench coat?** | ⚠️ Marginal | Everything works — against `MockRazorpayRail`. Zero real Razorpay API calls have ever been made. The UI says "RAZORPAY: TEST ORDER CREATED" while the header says "RAIL / MOCK" *on the same screen* (V-2). A Razorpay reviewer notices this in seconds, and it reads as overclaiming rather than as a deliberate credential-hygiene choice. |
| **Is it safe?** | ❌ Fail | This is the one that would actually disqualify you on merit. See §13.3. |
| **Does it fit the track (AI Growth & Agentic Commerce)?** | ❌ Fail | There is no AI. `buyer.py:19` selects products with `"shirt" in s.name.lower()`. Three LLM API keys are declared in config and never read. On screen, the "AI" returned a **Khadi Overshirt** as an eligible match for *"red cotton shirt"* (V-11). Submitted to an AI track, this is the most damaging single fact about the project. |

### 13.3 The part that would disqualify you on merit

You are applying to **Razorpay**. The reviewer is, with high likelihood, a payments engineer. Payments engineers screen for exactly three failure modes, and your prototype has all three:

1. **Double charge.** One cart, two idempotency keys, two orders, two captures (P0-3). In a payments interview this is the canonical disqualifying bug.
2. **Unauthenticated financial webhook.** In the default config, one unsigned `curl` writes a fake ₹9,999,999.99 capture into your audit ledger, makes it replay as legitimate proof, and denies every subsequent honest purchase (P0-2).
3. **Attacker-supplied authorization limits.** The agent declares its own spending ceiling (P0-1). The product's central claim is unenforced.

The cruel irony: your submission's whole thesis is *"AI must not become an uncontrolled payment authority."* A reviewer who spends ten minutes finds that **BOUND itself is an uncontrolled payment authority.** That contrast is worse than having no security story at all, because you invited the scrutiny.

### 13.4 What is genuinely top-decile here

I want to be precise about this, because it is real and it is why the gaps are worth closing rather than starting over:

- **The idea and the sentence.** "When AI spends money, someone needs to say yes." That is better positioning than most funded startups in this space. The `rail_call` ledger column as the auditable proof of a *negative* is a genuinely clever design idea.
- **The visual design.** The Swiss/editorial system — cream, ink, one orange accent, condensed display type, hairline rules, corner-bracket frames — is a real design language, consistently applied. Top 2% of hackathon submissions. Most look like unstyled Tailwind.
- **The authorization sequence screen.** The six-gate pipeline animating with `NOT RUN` states for skipped gates, the boundary rail, the verdict box, the dossier with real ids. This is the best thing in the project and it communicates an invisible policy decision better than a diagram would.
- **The blocked-path screen** is even better than the approved one. Gate 02 fails, gates 03–06 correctly read `NOT RUN`, `RAIL CALL: FALSE`, `RAZORPAY: NOT CALLED`. That screen alone is a strong demo beat.
- **Test discipline.** `assert service.spy.calls == []` to prove a negative is exactly right, and `RazorpayTestRail` refusing non-`rzp_test_` keys shows judgment most applicants do not have.

**The summary a reviewer would write:** *"Strong product instinct, excellent design, real engineering discipline — undermined by a broken deployment, no AI in an AI track, and security defects that a payments team cannot look past. Would reconsider if fixed."*

That is a much better place to be than "generic." You are not far away. §14 is the distance.

---

## 14. What it takes to get selected

Ordered by impact per hour. Items 1–4 move you from *rejected* to *credible*. Items 5–8 move you from *credible* to *selected*.

### Tier 1 — mandatory, or nothing else counts (~1 day)

**1. Deploy the API and verify the public link end to end.** (P1-5, P1-4)
Nothing matters before this. Render or Railway — the `Procfile` already works. Move the signing key to an env var and the ledger to Postgres *first*, or your audit trail resets on every deploy and mandates start failing `CART_INVALID` mid-demo. Then click your own public link in a private window and complete a purchase. **If you do only one thing from this document, do this one.**

**2. Fix the three security defects.** (P0-1, P0-2, P0-3)
Not because a reviewer will necessarily find them, but because if they do, you are done — and because fixing P0-1 unlocks your best demo beat (item 6 below). Roughly 6 hours for all three with tests.

**3. Make every claim on screen true.** (P1-3, V-2)
Drive all rail labels from `metrics.rail_name`. In mock mode the screen must say **"MOCK RAIL — no Razorpay call made."** Counterintuitively this makes you look *better*, not worse: it reads as a deliberate credential-hygiene decision instead of a bluff. Pair it with one line in the README: *"We refuse to demo with borrowed Razorpay keys. Switch `PAYMENT_RAIL=razorpay` with your own Test Mode keys and the same code path hits the real API."* A Razorpay reviewer respects that answer.

**4. Put AI in it.** (§16, P2-1)
You are in an **AI** track with no AI. Your AIML API credits solve this in an afternoon. Critically: put the model where it *helps* and keep it provably off the money path — that restraint is itself the story. See §16.

### Tier 2 — this is what actually gets you picked (~1 day)

**5. Make the ledger tamper-evident and show it.** (P0-4)
Hash-chain the events, add `GET /audit/{trace}/verify`, and put a **"VERIFY CHAIN → INTACT ✓"** button on the audit screen. "You can cryptographically check that I did not edit this record" is a sentence almost no submission can say. It converts your audit page from a log viewer into a proof system.

**6. Rebuild the demo around the mandate.** (depends on P0-1)
Your current demo shows a block you engineered. After P0-1 you can show a block that *means* something:

> Human sets a **₹1,500** mandate — visibly, in the UI, as a separate act.
> Agent is asked for a **₹1,699** kurta.
> **BLOCKED — `MANDATE_CEILING`.** `rail_call=false`. Razorpay never called.
> Hash-chain verify: **INTACT**.
> Human raises the mandate to **₹1,800**. Same agent, same request. **APPROVED.**
> Same ledger. Same chain. The agent never touched the limit.

That is the entire product in forty seconds, and it is only possible once the mandate lives server-side. **This is the highest-value change in this document.**

**7. Fix the visual credibility issues.** (V-1, V-3, V-4)
Three things, in order: the inverted colour semantics (your app currently renders **ALLOW in red and BLOCK in black** on the transactions page — the exact opposite of the landing page), mobile (currently unusable — reviewers open links on phones), and the 9–11px type (unreadable in a compressed demo video). See §15.

**8. Record a 3-minute video and put it at the top of the README.**
Assume the reviewer never runs your code. The video *is* your submission. Lead with the block, not the purchase — the negative is your differentiator. Include the chain-verify moment.

### What to explicitly NOT do

- **Do not add an LLM to authorization.** Your docx already says this. It is correct. The deterministic money path is your strongest technical claim — protect it and say it out loud (§16.3).
- **Do not add MCP, a second merchant, crypto, or a recommendation engine.** Every one of these dilutes a sharp story.
- **Do not delete the mock rail** to look more "real." Keep it, label it honestly, and make the swap a one-line config change. That is the professional answer.
- **Do not polish `Discovery.tsx` further.** It is already the most finished part of the app. The audit page is nearly empty and it is the screen your own plan calls judge-facing.

---

## 15. Visual & UX audit

Conducted live: `uvicorn` on `:8000` + `next dev` on `:3737`, every screen driven at 1440×900 and 375×812.

### 15.1 First, what is working

The design language is genuinely strong and I would not restart it. Cream `#f5f2e7` + ink `#000` + a single orange `#ff4500`, Barlow Condensed display against IBM Plex Mono labels, zero border radius, hairline rules, corner-bracket product frames. It is coherent, confident, and unmistakably *designed*. The authorization sequence and the blocked verdict are the best screens and need only colour and type fixes, not redesign. The landing page is fully responsive with a separate stacked diagram for narrow viewports — real work, credited.

*Note on the committed screenshots in `web/.cc-shot/`: the body copy renders as a serif there, clashing badly with the condensed display face. In a fresh build the fonts load correctly, so that was a transient `next/font` fetch failure, not a standing bug. It is still worth hardening — `font-family: var(--font-sans), ...` with no fallback **inside** the `var()` makes the entire declaration invalid if the variable is missing, which silently falls back to Times. Write `var(--font-sans, "IBM Plex Sans")` and the failure becomes invisible instead of ugly.*

### 15.2 V-1 · Colour semantics are inverted, and the app contradicts itself **[CRITICAL]**

The single most damaging visual problem. Verified on screen:

| Screen | ALLOW / approved | BLOCK / denied |
|---|---|---|
| Landing ([Landing.tsx:331](web/src/components/Landing.tsx:331)) | **black** ✅ correct | **orange** ✅ correct |
| Transactions ([RecentList.tsx:25](web/src/components/RecentList.tsx:25)) | **orange** ❌ inverted | **black** ❌ inverted |
| Authorization ([Authorization.tsx:112](web/src/components/Authorization.tsx:112)) | `BOUND ALLOWED` in **orange** ❌ | `BOUND BLOCKED` in **black** ❌ |
| Dossier status | `AUTHORIZED` **orange** | `BLOCKED` **orange** — *same colour for opposite outcomes* |

On the transactions list a reviewer sees the **approved** transaction rendered in the danger colour and the **denied** one in neutral black. In a payments UI that is read backwards at a glance, and it is the one screen whose entire job is "ALLOW vs BLOCK at a glance."

**Root cause:** the palette has **no success colour**. Seven tokens (`cream`, `cream-wash`, `poster`, `ink`, `mute`, `line`, `log`) and exactly one accent, currently overloaded to mean *kicker label*, *currently checking*, *failed*, *STOP*, *blocked reason*, **and** *authorized* — six meanings including two opposites.

**Fix:** add one token and enforce one rule.
```
allow:  #1a7f5a   (or reserve ink for allow)
poster: #ff4500   -> block / stop / attention ONLY. Never success. Never a neutral label.
```
Then sweep every `text-poster` and decide deliberately. Budget 1 hour; it is the highest visual-impact hour in the project.

### 15.3 V-2 · The screen contradicts itself about Razorpay **[CRITICAL]**

Verified simultaneously visible on one screen: header reads **`RAIL / MOCK`**, verdict box reads **`RAZORPAY: TEST ORDER CREATED`** ([Authorization.tsx:114](web/src/components/Authorization.tsx:114)). Also `AppShell` initialises the badge to `"RAZORPAY / TEST"` before `/metrics` resolves ([AppShell.tsx:23](web/src/components/AppShell.tsx:23)), so there is a visible flash of the wrong rail on every page load. See §14 item 3 for the fix and the framing.

### 15.4 V-3 · Mobile is unusable **[CRITICAL]**

At 375×812 the `min-w-[1100px]` shell ([AppShell.tsx:34](web/src/components/AppShell.tsx:34)) forces a 1100px canvas into a 375px viewport. Verified: the 260px sidebar occupies **~55% of the screen**, the heading renders as "BOUND D…", the body as "Every ALLOW an…", and all content requires horizontal scrolling. Reviewers open links on phones.

Separately, on the mobile **landing**, `ENTER BOUND →` sits below the fold (~y=1456 on a ~1560px page) with no scroll cue — the only interactive element on the page is invisible on arrival.

**Fix:** collapse the sidebar to a top bar under 1024px; make the authorization pipeline scroll horizontally as a strip; drop `min-w`. Or, if time is short, ship a mobile-only "open on desktop for the full console" screen plus a fully responsive landing — a deliberate constraint reads far better than a broken layout.

### 15.5 V-4 · There is no type scale **[HIGH]**

**21 distinct hardcoded font sizes** (`text-[9px]` … `text-[64px]`), all arbitrary Tailwind values. Counted usages at or below 11px: **9px × 9, 10px × 20, 11px × 31 = 60 instances.**

The `PASSED` / `NOT RUN` gate labels are **9px**. The `FILE MARKS` trace and order ids are ~10px. Verified on screen: they are borderline at 1440px and will be **illegible in a compressed demo video or on a projector** — which is how your work will actually be seen. The most important text in the product (`RAZORPAY NOT CALLED`) is among the smallest.

**Fix:** a 6-step scale (`11 / 13 / 16 / 22 / 32 / 56`), 12px hard floor, and promote `RAIL CALL` / `RAZORPAY NOT CALLED` to 16px minimum.

### 15.6 V-5 · Contrast failures (computed)

| Pair | Ratio | WCAG AA | Where |
|---|---|---|---|
| `poster #ff4500` on `cream #f5f2e7` | **3.07:1** | ❌ fails (needs 4.5:1) | every 10–11px kicker: `USER INTENT`, `MATCHES FOUND`, `CURRENT CHECK`, `AUTHORIZATION LOG` |
| `mute #5c5c5c` on `cream` | 5.97:1 | ✅ passes | body secondary text |
| `mute #5c5c5c` on `ink #000` | **3.14:1** | ❌ fails | dimmed agent-log lines |
| Disabled button (`opacity: .4`) | **~1.6:1** | ❌ severe fail | `AUTHORIZE WITH BOUND` disabled, `OPEN` on audit page — verified nearly invisible |
| Focus ring `1px solid ink` | — | ⚠️ WCAG 2.2 wants ≥2px | [globals.css:51](web/src/app/globals.css:51) |

**Fix:** darken the accent for small text (`#d93a00` ≈ 4.6:1) or set kickers to `ink`/`mute`; replace `opacity:.4` with an explicit disabled token at ≥3:1; focus ring to 2px.

### 15.7 V-6 · Large dead zones in every panel **[HIGH]**

Verified: the black agent-log panel carries **130–280px of void** below its content in both the pre-search and post-search states; the right-hand dossier has **~175px** between `REMAINING AUTHORIZATION` and `NOW EVALUATING`; the audit page is **~380px of empty cream**. The layout reserves fixed heights for maximum content and then shows minimum content. *Fix: let panels size to content, or fill the log panel with the request/mandate JSON — judges love seeing the actual objects.*

### 15.8 V-7 · The same five-step flow appears three times on one screen **[MEDIUM]**

On the discovery screen, verified simultaneously: the top breadcrumb (`AI REQUEST → AI SEARCHES → …`), the right panel's numbered `01`–`05` list, and a third arrow line at the bottom. Three restatements of one idea competing for the same attention. The landing page does it three times too (diagram, 3-column `dl`, arrow line). *Fix: keep the breadcrumb as live progress; delete the other two.*

### 15.9 V-8 · The audit page is the emptiest screen in the app **[HIGH]**

Your own docx (MUST-FIX #8) says: *"Make this the judge-facing screen, not a secondary admin feature."* Verified live, it contains a heading, the word "Trace", an input, a disabled button, and ~380px of nothing. There are **no recent traces to click** — a reviewer must copy-paste an id from another page. Its heading (`Look up a request`, sentence case, regular weight) also breaks the condensed-uppercase language of every other page, so it reads as a different app.

**Fix:** list the last 10 traces as clickable rows; deep-link from the transactions list (already wired); restyle the heading to match; add the **VERIFY CHAIN** button from §14 item 5. This page should be your strongest, not your weakest.

### 15.10 V-9 · Transactions page is missing its headline metric **[HIGH]**

Verified: no captured-GMV or blocked-GMV tiles anywhere — `MetricsStrip` is dead code (P2-11). Also no filters, no grouping, no pagination, and timestamps render as raw `2026-09-02T09:25:21.684596+00:00`. *Fix: wire `MetricsStrip` to the top of this page; format timestamps as `2 Sep, 09:25`; keep raw ISO in the dossier only.*

### 15.11 V-10 · Enter does not submit the search **[MEDIUM]**

Verified: typed a query, pressed **Enter**, nothing happened — the panel stayed on `> WAITING FOR AI REQUEST`. Clicking `FIND →` worked. The button is `type="submit"` but the keypress does not reach a form handler. A user's most natural action fails **silently**. *Fix: wrap the input in a `<form onSubmit>`.*

### 15.12 V-11 · The agent's match quality is visibly poor **[HIGH]**

Verified on screen: querying *"Buy me a red cotton shirt under 1800"* returned **2 matches** — the Red Cotton Shirt, and a **Khadi Overshirt** marked `ELIGIBLE`. A khadi overshirt is neither red nor cotton. This is the fake-AI problem made visible in the single screenshot a reviewer is most likely to look at. §16 fixes it properly.

### 15.13 V-12 · The human never grants the mandate **[HIGH — UX face of P0-1]**

The card shows `MAXIMUM AUTHORIZED ₹1,800.00 / REQUESTED ₹1,499.00 / REMAINING ₹301.00` — a genuinely good display. But **there is no control to set it.** The number was regex-parsed out of the sentence the agent's own prompt supplied. So the UI presents spending authority as a fact while no human ever exercised it. *Fix: a real mandate control — a slider or amount field, set before the agent runs, in its own visually distinct "human authority" zone. This is the UI half of P0-1 and it is what makes the §14 item 6 demo land.*

### 15.14 V-13 · Fake and duplicated status indicators **[MEDIUM]**

Verified: **`UCP / CONNECTED` appears twice** (header and sidebar footer), both hardcoded strings wired to nothing ([AppShell.tsx:87](web/src/components/AppShell.tsx:87)). `POLICIES` in the nav is visually identical to working items but is a dead `<span>`. Footer links (`DOCUMENTATION`, `SUPPORT`, `API STATUS`) are non-functional. Footer reads **`BOUND © 2024 AUTHORIZATION LAYER`** — wrong year. Each is trivial; together they signal "unfinished." *Fix: derive UCP status from a real discovery fetch or delete the badge; remove `POLICIES`; point `DOCUMENTATION` at `/docs/handler.md` (already served) and delete the rest; fix the year.*

### 15.15 V-14 · The landing is a title card, not a pitch **[HIGH]**

It has a great tagline and a nice diagram, and then it ends. Verified absent: any statement of the problem, any mention that this makes an existing **Razorpay merchant** transactable by an AI buyer, any metric, any proof, any link to the repo, the demo video, or the docs.

Also: the reveal animation runs ~1.5s during which everything sits at low opacity — one screenshot taken mid-reveal showed the entire page washed out to grey, which is how it will look to anyone on a slow connection. *Fix: shorten the reveal to ~600ms and set final opacity as the CSS default so a slow load degrades to "complete," never to "faded." Add one line of what it does, one metric, and three links.*

### 15.16 V-15 · The conceptual centrepiece is the least visible element **[MEDIUM]**

The boundary rail (`AI REQUEST — BOUND — ALLOW — RAZORPAY`, with `✕ STOP` on denial) is the whole idea of the product, and it renders as a 2px hairline with 9px labels, visually subordinate to the gate pipeline above it. *Fix: make it the largest element on the verdict screen. On a block, the `✕` and `RAZORPAY NOT CALLED` should be the biggest thing on the page.*

### 15.17 V-16 · Product imagery is inconsistent **[LOW]**

19 of 21 SKUs have no image ([products.ts:1](web/src/lib/products.ts:1)); the fallback renders a bare letter (verified: "K" for Khadi Overshirt) which looks like a broken image. The two real photos have **grey** backgrounds sitting inside **white** frames on a **cream** page — three neutrals in one card. Both files are ~2.3 MB, served through raw `<img>` with no `next/image`. *Fix: knock the photo backgrounds out to cream; design the fallback as a deliberate typographic tile; compress to <200 KB; use `next/image`.*

### 15.18 V-17 · Empty states read as errors **[MEDIUM]**

Verified in the committed screenshots: the pre-selection dossier shows `—` for category and quantity, a black bar where the product name goes, and a short red bar where the price goes. These look like a failed render, not an empty state. *Fix: explicit copy — "No product selected yet. Ask the agent to find something."*

### 15.19 V-18 · Accessibility gaps **[MEDIUM]**

- `ProductShot` modal: no Escape handler, no focus trap, no `aria-modal`, backdrop click only ([ProductShot.tsx:48](web/src/components/ProductShot.tsx:48)).
- Landing `AUTHORIZED? YES / NO` flickers at **160ms (~6 Hz)** ([Landing.tsx:37](web/src/components/Landing.tsx:37)). Small area so likely under the WCAG 2.3.1 threshold, but it is uncomfortable and serves no purpose after the first cycle.
- `Ticker` animates from **0 on every mount** ([Ticker.tsx:23](web/src/components/Ticker.tsx:23)), so metrics count up from zero on each page view — reads as fabricated. Initialise to `value`; animate only on change.
- Gate names are `truncate`d inside 72px columns, so labels clip.
- No error boundary: one render throw blanks the app mid-demo.

### 15.20 Correction to P1-1

The live run refined an earlier finding. `gate_states()` **does** correctly render post-failure gates as `NOT RUN` — verified on the expired-quote screen, where gate 02 shows `BLOCKED` and gates 03–06 show `NOT RUN`. That logic is right.

The bug is narrower than §5 stated: it applies **only to `IDEMPOTENCY_CONFLICT`**, where gates 01–05 render `PASSED` despite `enforce()` never having run. Fix scope is correspondingly smaller — but the fix (return real per-gate results from `enforce()`) is unchanged and still worth doing, because it also lets you persist the per-gate outcome on the `POLICY_CHECK` ledger row.

### 15.21 Visual fix order

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | V-1 colour semantics — add a success token, one rule | Highest | 1h |
| 2 | V-2 honest rail labels | Credibility | 30m |
| 3 | V-4 type scale, 12px floor, promote the rail verdict | Demo legibility | 2h |
| 4 | V-3 responsive shell (or an honest desktop-only screen) | Reviewer access | 3h |
| 5 | V-9 + V-8 GMV tiles on transactions, recent traces + verify on audit | Closes two docx MUSTs | 2h |
| 6 | V-12 real mandate control | Makes the demo land | 2h |
| 7 | V-5 contrast, V-10 Enter key, V-13 fake status, footer year | Polish | 2h |
| 8 | V-6 dead space, V-7 dedupe the flow, V-17 empty states | Density | 2h |

---

## 16. Integrating your AIML API credits

**Short answer: yes — integrate, but in three specific places, and nowhere near the money.**

You are submitting to an **AI** track with zero AI. That is a track-fit failure (§13.2) and it is the cheapest of your four Tier-1 problems to fix. The risk is doing it carelessly: bolting a chatbot on would *weaken* your strongest technical claim. Placement matters far more than model choice.

### 16.1 Where the model goes (and why each is safe)

**1. Intent parsing — replaces the regex in [intent.ts](web/src/lib/intent.ts)** *(highest value)*
Turn `"buy me a red cotton shirt under 1800"` into `{ query, max_paise, categories, garment, colour, material }`. Today this is ~130 lines of stop-words and regex that breaks on anything unusual ("something breezy for a Chennai summer, keep it under two thousand"). An LLM handles that trivially.
**Safe because** it runs *before* the mandate exists and its output is a *request*, not an authorization. Move it server-side — it must not run in the browser.

**2. Product selection + rationale — replaces [buyer.py:19](bound/buyer.py:19)** *(most visible)*
This directly fixes V-11, the Khadi-Overshirt embarrassment. Give the model the catalog and the parsed intent, ask for a SKU id plus a one-sentence rationale, and validate the returned id against the catalog before use.
**Safe because** the model chooses *what to ask for*; it has no influence over whether the request is approved.

**3. Plain-language denial explanations** *(cheapest win)*
Turn `PRICE_DRIFT` + `"Catalog price for sku_x is 179900 paise; mandate locked 149900"` into *"The shop raised this item's price after the agent locked the quote, so BOUND stopped it. Ask for a fresh quote."* Your own docx lists this as an explicit `ONLY IF TIME` item, so it is sanctioned scope.
**Safe because** it runs *after* the decision, on the decision's output. It explains; it never decides.

### 16.2 Where the model must never go

`policy.enforce()` · `razorpay_rail.py` · mandate issuance · any amount computation · webhook handling · the idempotency check. No exceptions, no "just as a sanity check."

### 16.3 Turn the restraint into the story

This is the part most applicants miss. **Do not hide that authorization is deterministic — lead with it.** Make it structurally provable, then say it on a slide:

```python
# tests/test_no_llm_on_money_path.py
def test_money_path_cannot_reach_a_model():
    """The money path must not be able to reach a model, even by accident."""
    import ast, pathlib
    banned = {"openai", "bound.llm", "anthropic", "httpx", "requests"}
    for module in ("bound/policy.py", "bound/razorpay_rail.py", "bound/mandates.py"):
        tree = ast.parse(pathlib.Path(module).read_text(encoding="utf-8"))
        imported = {
            n.module or "" for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)
        } | {
            a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names
        }
        assert not (banned & imported), f"{module} can reach a model"
```

That converts *"no LLM on the money path"* from a marketing claim into a **CI check**. Then the slide writes itself:

> *"AI decides what to buy. Deterministic policy decides whether money may move. That boundary is enforced by a test, not by a promise."*

For a payments reviewer, that is a far stronger signal than "we used a frontier model." It says you understand which parts of a payments system are allowed to be probabilistic.

### 16.4 Implementation

AIML API is OpenAI-compatible, so use the `openai` SDK with a base-url override. One new module, one new dependency.

```python
# bound/llm.py — the ONLY module allowed to talk to a model.
from __future__ import annotations
import json
from typing import Any
from bound.config import Settings

class LLMUnavailable(RuntimeError):
    """Raised on any model failure. Callers MUST fall back to deterministic logic."""

def complete_json(*, settings: Settings, system: str, user: str,
                  schema_hint: str, model: str, timeout: float = 6.0) -> dict[str, Any]:
    if not settings.aimlapi_key or settings.buyer_llm != "on":
        raise LLMUnavailable("LLM disabled")
    from openai import OpenAI                      # imported lazily, never at module scope
    client = OpenAI(api_key=settings.aimlapi_key,
                    base_url=settings.aimlapi_base_url, timeout=timeout)
    try:
        res = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system",
                 "content": f"{system}\n\nReply with JSON only, matching: {schema_hint}"},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.2, max_tokens=400,
        )
        return json.loads(res.choices[0].message.content or "{}")
    except Exception as exc:
        raise LLMUnavailable(str(exc)) from exc
```

```python
# bound/config.py — additions
aimlapi_key: str | None = Field(default=None, alias="AIMLAPI_API_KEY")
aimlapi_base_url: str = Field(default="https://api.aimlapi.com/v1", alias="AIMLAPI_BASE_URL")
buyer_llm: str = Field(default="off", alias="BUYER_LLM")        # off | on
buyer_model: str = Field(default="gpt-5", alias="BUYER_MODEL")
narrator_model: str = Field(default="gpt-5-mini", alias="NARRATOR_MODEL")
```

Non-negotiable engineering rules:

1. **Server-side only.** The AIML key never reaches the browser. Delete the unused `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` from config (P2-1) — do not accumulate dead keys.
2. **Always fall back.** Every call site catches `LLMUnavailable` and uses the existing deterministic path. Your demo must work with the network unplugged and with `BUYER_LLM=off`.
3. **Validate every model output.** A returned `sku_id` must exist in the catalog; a returned `max_paise` must be an int within bounds. Never trust model output as a key or an amount.
4. **Hard timeout (6s) and at most one retry.** A hung model call must not stall the authorization screen.
5. **Log it in the ledger as a non-authorizing event.** Add event type `AGENT_REASONING` carrying the model name, a prompt hash, and the chosen SKU — with `rail_call=0` and `decision=NULL`. Your audit trail then shows *exactly* where AI participated and proves it never appeared in a `POLICY_CHECK` row. That is a slide.
6. **Never stream onto the authorization screen.** The gate animation must stay deterministic and fast.

### 16.5 Model choice and cost

- **Selection + intent parsing:** a strong model. It runs once per request and 1–2s latency hides behind your existing search animation.
- **Narration + denial explanations:** a small fast model; quality barely matters.
- **Cost:** negligible. A full demo run is a handful of calls at a few hundred tokens each. Your credits are not a constraint — resist using them just because you have them.
- **Do not** add embeddings/RAG over a 21-SKU catalog. Your docx correctly lists RAG under "do not add." A 21-item list fits in a prompt.

### 16.6 Effort and payoff

~4 hours: 1h for `llm.py` + config, 1h for selection, 30m for narration, 30m for the AST test, 1h for fallbacks and the ledger event.

**Payoff:** closes the track-fit failure from §13.2, fixes V-11, and — via §16.3 — converts your most conservative design decision into your most sophisticated-sounding claim.

---

## 17. Revised master plan

Supersedes §9. Same work, reordered by what a reviewer actually sees.

| Day | Focus | Items |
|---|---|---|
| **1** | **Make it exist** | P1-4 signing key to env + ledger to Postgres → **P1-5 deploy the API** → verify the public link end to end in a private window. Nothing else until a stranger can complete a purchase on your URL. |
| **2** | **Make it safe** | P0-2 webhook HMAC always · P0-3 completed-session guard · P0-1 server-side mandate table · P1-2 distinct-trace GMV · regression tests for all four. |
| **3** | **Make it honest and legible** | P1-3 + V-2 honest rail labels · V-1 colour semantics · V-4 type scale · P1-1 real per-gate results · V-13 fake status + footer year. |
| **4** | **Make it AI** | §16 — `llm.py`, intent parsing, product selection, denial narration, the AST no-LLM test, `AGENT_REASONING` ledger event. |
| **5** | **Make it provable** | P0-4 hash chain + `/audit/{trace}/verify` · V-8 rebuild the audit page (recent traces + VERIFY CHAIN) · V-9 GMV tiles on transactions · V-12 real mandate control. |
| **6** | **Make it land** | V-3 responsive · §14 item 6 rebuild the demo around the mandate · record the 3-min video · README with video at top · P1-6/P1-7 CORS + API keys · CI. |
| **Cut if short** | | P2-5 through P2-16, all of §7 (P3), V-16, V-17. None of these change the verdict. |

### The one-paragraph test

When you are done, you should be able to write this and have every clause be literally true:

> *BOUND is a Razorpay payment handler that lets an AI agent transact without ever holding spending authority. A human registers a mandate; the agent can only reference it by id. An LLM chooses what to buy and explains itself — and a CI test proves no model can reach the authorization path. Six deterministic gates run before settlement; on denial the rail is never called and the ledger records `rail_call=false`. Every decision is hash-chained and independently verifiable. Live at &lt;url&gt;. Three-minute video: &lt;url&gt;.*

Today, four of those clauses are false. That is the gap — and it is about six days of work.

---

## 18. How the live audit was run

For reproducing the visual findings yourself:

```bash
# terminal 1 — API (mock rail, no credentials needed)
PYTHONPATH=. python -m uvicorn bound.app:app --port 8000

# terminal 2 — UI (proxies /bound-api -> :8000 automatically when
#                  NEXT_PUBLIC_BOUND_API_URL is unset)
cd web && npm install && npm run dev
```

Then walk: `/` → ENTER BOUND → type a query → **FIND** (Enter does not work, V-10) → AUTHORIZE WITH BOUND → TRY EXPIRED QUOTE → `/transactions` → `/audit`. Resize to 375×812 at any point to reproduce V-3.

Note: ports 3000 and 3100 were already occupied by other projects on this machine, so the audit ran the UI on **:3737**.
