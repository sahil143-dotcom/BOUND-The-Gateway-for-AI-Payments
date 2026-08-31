# BOUND

AI requests. BOUND authorizes. The payment rail settles.

`com.razorpay.payments` is the authorization boundary between an AI buyer and Razorpay. Policy never talks to the rail. On DENY the rail is not called.

## Architecture

```
AI Buyer → UCP → BOUND → Policy Engine → Payment Rail → Receipt / Audit
```

`PAYMENT_RAIL=mock` (default) uses `MockRazorpayRail`.
`PAYMENT_RAIL=razorpay` uses `RazorpayTestRail` with **your own** Test Mode keys only.

AP2 is used as authorization **objects** (CartMandate, IntentMandate, Receipt). This is not a full AP2 multi-agent implementation.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
copy .env.example .env
```

`.env` must contain `PAYMENT_RAIL=mock` until you have legitimate Razorpay Test Mode keys. Do not invent or borrow credentials.

```bash
uvicorn bound.app:app --reload
```

- Discovery: `GET http://127.0.0.1:8000/.well-known/ucp`
- Console: `http://127.0.0.1:8000/console`
- Buyer agent: `POST /buyer/shop` `{"query":"kurta","max_paise":180000}`

```bash
python scripts/buy.py
python scripts/expire_then_buy.py
python scripts/drift_then_buy.py
pytest
```

## Deploy the Next.js UI on Vercel

The payment API is FastAPI (`bound/`). Vercel should host only the UI in `web/`.

1. Import the GitHub repo in Vercel.
2. Set **Root Directory** to `web` (not `.`).
3. In **Build & Development Settings**:
   - Framework: Next.js
   - Install Command: `npm install` (or turn Override **off**)
   - Build Command: `npm run build` (or turn Override **off**)
   - Output Directory: leave empty (Override **off**)
4. Do **not** keep an install command that contains `--prefix web`. With Root Directory `web`, that resolves to `web/web/package.json` and fails.
5. Optional env for a live API later: `NEXT_PUBLIC_BOUND_API_URL=https://your-api-host.example` (no trailing slash), then redeploy.

Until that env is set, the landing page can load, but catalog / buy calls will fail.

## Tests that prove the rail boundary

- Approved checkout calls the rail
- Expired CartMandate does not call the rail
- Price drift does not call the rail
- Idempotent replay does not create a second order
- Idempotency conflict is rejected

## After you obtain legitimate Razorpay Test Mode credentials

Do this only with keys you generated on **your** Dashboard (Test Mode toggle on). Never use someone else’s PAN or keys.

1. Dashboard → Account & Settings → API Keys → Generate Key. Put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`.
2. Dashboard → Webhooks → add `PUBLIC_BASE_URL/webhooks/razorpay` (HTTPS tunnel). Set `RAZORPAY_WEBHOOK_SECRET` to the secret you chose there. Subscribe to `payment.authorized`, `order.paid`, `payment.failed`, `refund.created`.
3. Set `PAYMENT_RAIL=razorpay`.
4. Restart the app. `RazorpayTestRail` will call the official SDK. `create_payment` is no longer in-process — complete payment with Test Checkout / test card or UPI from the docs, then let the webhook mark the session paid.
5. Confirm a real `order_…` in the Test Dashboard whose `notes` include `cart_mandate_id` and `trace_id`.
6. Re-run expiry and price-drift paths: they must still show `rail_call=false` and no new Dashboard order.

The policy engine, mandates, UCP surface, console, and tests do not change. Only the rail implementation behind the interface switches.
