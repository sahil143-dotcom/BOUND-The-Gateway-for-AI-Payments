from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from bound.buyer import plan_purchase
from bound.config import ROOT, get_settings
from bound.gates import gate_states
from bound.service import build_service
from bound.webhooks import ingest, verify_signature

settings = get_settings()
svc = build_service(settings)
templates = Jinja2Templates(directory=str(ROOT / "console" / "templates"))

app = FastAPI(title="BOUND", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CheckoutCreate(BaseModel):
    items: list[dict]
    intent: dict | None = None


class CompleteBody(BaseModel):
    payment: dict = Field(
        default_factory=lambda: {
            "instruments": [
                {"id": "instr_rzp", "handler_id": "razorpay_test", "type": "card"}
            ]
        }
    )
    fail_payment: bool = False


class BuyerAsk(BaseModel):
    query: str = "red cotton shirt"
    max_paise: int = 180000
    complete: bool = True
    scenario: str = "happy"


def rail_label(name: str) -> str:
    if name == "razorpay":
        return "Payment rail · Razorpay Test"
    return "Payment rail · Mock"


def rail_short(name: str) -> str:
    if name == "razorpay":
        return "Razorpay Test"
    return "Mock"


@app.get("/.well-known/ucp")
def ucp_profile():
    return {
        "ucp": {
            "version": "2026-04-08",
            "payment_handlers": {
                "com.razorpay.payments": [
                    {
                        "id": "razorpay_test",
                        "version": "2026-08-30",
                        "spec": "/docs/handler.md",
                        "schema": "/docs/handler.schema.json",
                        "available_instruments": [
                            {"type": "card", "constraints": {"brands": ["visa", "mastercard"]}},
                            {"type": "upi"},
                        ],
                        "config": {
                            "environment": "test",
                            "currency": "INR",
                            "merchant_id": svc.catalog.merchant.id,
                            "rail": settings.rail_name,
                        },
                    }
                ]
            },
        }
    }


@app.get("/catalog")
def catalog(q: str | None = None, max_paise: int | None = None):
    skus = svc.catalog.search(q or "", max_paise=max_paise) if q else svc.catalog.all()
    return {
        "merchant": svc.catalog.merchant.__dict__,
        "products": [s.__dict__ for s in skus],
    }


@app.post("/checkout-sessions")
def create_checkout(body: CheckoutCreate):
    try:
        return svc.create_checkout(items=body.items, intent=body.intent)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/checkout-sessions/{session_id}/complete")
def complete_checkout(
    session_id: str,
    body: CompleteBody,
    idempotency_key: str | None = Header(default=None, alias="idempotency-key"),
):
    key = idempotency_key or session_id
    try:
        return svc.complete_checkout(
            session_id,
            payment=body.payment,
            idempotency_key=key,
            fail_payment=body.fail_payment,
        )
    except KeyError:
        raise HTTPException(404, "checkout session not found") from None


@app.post("/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
    x_razorpay_event_id: str | None = Header(default=None),
):
    raw = await request.body()
    secret = settings.razorpay_webhook_secret
    if settings.rail_name == "razorpay":
        if not secret:
            raise HTTPException(503, "RAZORPAY_WEBHOOK_SECRET is not configured.")
        if not x_razorpay_signature or not verify_signature(raw, x_razorpay_signature, secret):
            raise HTTPException(400, "invalid webhook signature")
    body = json.loads(raw or b"{}")
    event = body.get("event", "")
    payment = (body.get("payload") or {}).get("payment", {}).get("entity") or {}
    order = (body.get("payload") or {}).get("order", {}).get("entity") or {}
    notes = order.get("notes") or {}
    ingest(
        ledger=svc.ledger,
        trace_id=notes.get("trace_id") or "tr_webhook",
        event_id=x_razorpay_event_id or body.get("id") or "evt_unknown",
        event_name=event,
        payload=body,
        order_id=order.get("id") or payment.get("order_id"),
        payment_id=payment.get("id"),
        amount_paise=payment.get("amount") or order.get("amount"),
        cart_mandate_id=notes.get("cart_mandate_id"),
        intent_mandate_id=notes.get("intent_mandate_id"),
    )
    return {"ok": True}


@app.post("/buyer/shop")
def buyer_shop(ask: BuyerAsk):
    plan = plan_purchase(svc.catalog, query=ask.query, max_paise=ask.max_paise)
    if not plan["ok"]:
        return {
            "ok": False,
            "buyer": plan,
            "merchant": svc.catalog.merchant.__dict__,
            "rail": settings.rail_name,
            "rail_name": rail_short(settings.rail_name),
            "rail_label": rail_label(settings.rail_name),
        }
    clock = datetime.now(timezone.utc)
    session = svc.create_checkout(
        items=plan["items"],
        intent={
            "max_paise": ask.max_paise,
            "allowed_categories": list(svc.catalog.merchant.allowed_categories),
        },
        now=clock,
    )
    result = None
    price_compare = None
    if ask.complete:
        payment = {"instruments": [{"handler_id": "razorpay_test", "type": "card"}]}
        if ask.scenario == "expire":
            result = svc.complete_checkout(
                session["id"],
                payment=payment,
                idempotency_key=session["id"],
                now=clock + timedelta(seconds=91),
            )
        elif ask.scenario == "drift":
            sku_id = plan["sku"]["id"]
            authorized = int(plan["sku"]["price_paise"])
            current = 179900 if authorized == 149900 else authorized + 30000
            svc.catalog.set_price(sku_id, current)
            try:
                result = svc.complete_checkout(
                    session["id"],
                    payment=payment,
                    idempotency_key=session["id"],
                    now=clock,
                )
            finally:
                svc.catalog.set_price(sku_id, authorized)
            price_compare = {
                "authorized_paise": authorized,
                "current_paise": current,
            }
        else:
            result = svc.complete_checkout(
                session["id"],
                payment=payment,
                idempotency_key=session["id"],
                now=clock,
            )
    decision = (result or {}).get("decision")
    return {
        "ok": True,
        "buyer": plan,
        "checkout": session,
        "complete": result,
        "gates": gate_states(decision),
        "price_compare": price_compare,
        "merchant": svc.catalog.merchant.__dict__,
        "rail": settings.rail_name,
        "rail_name": rail_short(settings.rail_name),
        "rail_label": rail_label(settings.rail_name),
    }


@app.get("/audit/{trace_id}")
def audit(trace_id: str):
    events = svc.ledger.by_trace(trace_id)
    if not events:
        raise HTTPException(404, "unknown trace_id")
    return {"trace_id": trace_id, "events": events}


@app.get("/traces")
def traces(limit: int = Query(default=16, ge=1, le=50)):
    """ALLOW and BLOCK decisions. The Transactions page is this list — not settled-only."""
    return {
        "items": svc.ledger.recent_decisions(limit),
        "rail": settings.rail_name,
        "rail_name": rail_short(settings.rail_name),
        "rail_label": rail_label(settings.rail_name),
    }


@app.get("/metrics")
def metrics():
    return {
        "requests": svc.ledger.request_count(),
        "approved": svc.ledger.approved_count(),
        "blocked": svc.ledger.blocked_count(),
        "captured_paise": svc.ledger.captured_paise(),
        "blocked_paise": svc.ledger.blocked_paise(),
        "deny_reasons": svc.ledger.deny_breakdown(),
        "rail": settings.rail_name,
        "rail_name": rail_short(settings.rail_name),
        "rail_label": rail_label(settings.rail_name),
        "merchant": svc.catalog.merchant.__dict__,
    }


@app.get("/", response_class=HTMLResponse)
@app.get("/console", response_class=HTMLResponse)
def console(request: Request, trace_id: str | None = Query(default=None)):
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "rail_label": rail_label(settings.rail_name),
            "merchant": svc.catalog.merchant,
            "initial_trace": trace_id or "",
        },
    )


app.mount("/static", StaticFiles(directory=str(ROOT / "console" / "static")), name="static")


@app.get("/docs/handler.md", response_class=HTMLResponse)
def handler_md():
    path = ROOT / "docs" / "handler.md"
    return HTMLResponse(path.read_text(encoding="utf-8"), media_type="text/markdown")


@app.get("/docs/handler.schema.json")
def handler_schema():
    path = ROOT / "docs" / "handler.schema.json"
    return json.loads(path.read_text(encoding="utf-8"))
