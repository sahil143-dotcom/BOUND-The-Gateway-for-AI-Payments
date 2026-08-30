"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { GATE_NAME } from "@/lib/copy";
import { inr2 } from "@/lib/money";
import type { Checkout, Complete, Gate } from "@/lib/types";

export type Reveal = "queued" | "checking" | "pass" | "fail" | "skipped";
export type BoundaryState = "idle" | "hit" | "crossed" | "stopped";

const SHORT: Record<string, string> = {
  cart: "CART",
  quote: "QUOTE",
  price: "PRICE",
  intent: "INTENT",
  limits: "LIMITS",
  idempotency: "IDEMP",
};

export function Authorization({
  amountPaise,
  product,
  skuId,
  gates,
  reveal,
  boundary,
  complete,
  checkout,
  priceCompare,
  startedAt,
  showVerdict,
  checkMs = 520,
  maxAuthorizedPaise,
}: {
  amountPaise: number;
  product?: string;
  skuId?: string;
  gates: Gate[];
  reveal: Reveal[];
  boundary: BoundaryState;
  decision?: string;
  complete?: Complete | null;
  checkout?: Checkout | null;
  priceCompare?: { authorized_paise: number; current_paise: number } | null;
  startedAt?: string;
  railStep: number;
  showVerdict: boolean;
  checkMs?: number;
  maxAuthorizedPaise?: number;
}) {
  const reduce = useReducedMotion();
  const approved = complete?.decision === "APPROVE";
  const blocked = Boolean(showVerdict && complete && complete.decision !== "APPROVE");
  const passed = reveal.filter((r) => r === "pass").length;
  const currentIndex = currentGateIndex(reveal);
  const currentGate = currentIndex >= 0 ? gates[currentIndex] : null;
  const currentState = currentIndex >= 0 ? reveal[currentIndex] : "queued";
  const traceId = checkout?.trace_id || complete?.trace_id || "—";
  const gateName = currentGate ? GATE_NAME[currentGate.id] || currentGate.label : "—";
  const boundStatus = blocked
    ? "✕ BLOCKED"
    : approved && showVerdict
      ? "✓ AUTHORIZED"
      : "EVALUATING";

  return (
    <section className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px]" aria-live="polite">
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-ink px-6 py-6 lg:px-8">
        <h1 className="display text-[48px] leading-none text-ink lg:text-[56px]">AUTHORIZATION SEQUENCE</h1>
        <p className="mt-2 font-mono text-[12px] uppercase tracking-[0.12em] text-mute">
          {blocked
            ? "BOUND STOPPED THE TRANSACTION"
            : approved && showVerdict
              ? `${passed} / 6 CHECKS PASSED`
              : "BOUND IS EVALUATING THIS TRANSACTION"}
        </p>

        <AuthPipeline gates={gates} reveal={reveal} reduce={Boolean(reduce)} checkMs={checkMs} />

        <CurrentCheck
          gate={currentGate}
          index={currentIndex}
          state={currentState}
          amountPaise={amountPaise}
          priceCompare={priceCompare}
          checkout={checkout}
          complete={complete}
          blocked={blocked}
          checkMs={checkMs}
          reduce={Boolean(reduce)}
        />

        <BoundaryStory
          approved={Boolean(approved && (boundary === "crossed" || showVerdict))}
          blocked={blocked || boundary === "stopped"}
          checking={!showVerdict}
          railCalled={Boolean(complete?.rail_call)}
        />

        {blocked && complete ? (
          <div className="mt-4 border border-ink px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em]">
            <p className="display text-[28px] text-ink">BOUND BLOCKED</p>
            <p className="mt-2 text-poster">DECISION_REASON: {complete.decision}</p>
            <p className="mt-2 text-ink">RAIL CALL: FALSE</p>
            <p className="mt-1 text-ink">RAZORPAY: NOT CALLED</p>
            {complete.reason ? <p className="mt-2 normal-case tracking-normal text-mute">{complete.reason}</p> : null}
          </div>
        ) : null}

        {approved && showVerdict && complete ? (
          <div className="mt-4 border border-ink px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em]">
            <p className="display text-[28px] text-poster">BOUND ALLOWED</p>
            <p className="mt-2 text-ink">RAIL CALL: TRUE</p>
            <p className="mt-1 text-ink">RAZORPAY: TEST ORDER CREATED</p>
          </div>
        ) : null}
      </div>

      <aside className="flex min-h-0 w-[340px] shrink-0 flex-col bg-cream">
        <TxnDossier
          amountPaise={amountPaise}
          product={product}
          skuId={skuId}
          traceId={traceId}
          startedAt={startedAt}
          boundStatus={boundStatus}
          gateNo={currentGate ? String(currentIndex + 1).padStart(2, "0") : "—"}
          gateName={currentGate ? gateName : "—"}
          blocked={blocked}
          authorized={Boolean(approved && showVerdict)}
          maxAuthorizedPaise={maxAuthorizedPaise}
          orderId={complete?.order_id}
          paymentId={complete?.payment_id}
          receipt={receiptId(complete)}
        />
      </aside>
    </section>
  );
}

function AuthPipeline({
  gates,
  reveal,
  reduce,
  checkMs,
}: {
  gates: Gate[];
  reveal: Reveal[];
  reduce: boolean;
  checkMs: number;
}) {
  return (
    <div className="mt-8 min-w-0">
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        AI REQUEST → BOUND AUTHORIZES → RAZORPAY SETTLES
      </p>
      <div className="flex min-w-0 items-start">
        {gates.map((gate, i) => {
          const state = reveal[i] || "queued";
          return (
            <div key={gate.id} className="flex min-w-0 flex-1 items-start">
              <Checkpoint index={i} gate={gate} state={state} checkMs={checkMs} reduce={reduce} />
              {i < gates.length - 1 ? (
                <Connector
                  filled={state === "pass"}
                  traveling={reveal[i + 1] === "checking"}
                  stopped={state === "fail"}
                  reduce={reduce}
                  duration={checkMs / 1000}
                />
              ) : (
                <Tail
                  approved={reveal.every((r) => r === "pass")}
                  blocked={state === "fail"}
                  reduce={reduce}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Checkpoint({
  index,
  gate,
  state,
  checkMs,
  reduce,
}: {
  index: number;
  gate: Gate;
  state: Reveal;
  checkMs: number;
  reduce: boolean;
}) {
  const checking = state === "checking";
  const passed = state === "pass";
  const failed = state === "fail";
  const skipped = state === "skipped";
  const name = SHORT[gate.id] || GATE_NAME[gate.id] || gate.label;

  return (
    <div className="flex w-[4.5rem] shrink-0 flex-col items-center sm:w-[5.25rem] lg:w-[5.75rem]">
      <p className="font-mono text-[10px] text-mute">{String(index + 1).padStart(2, "0")}</p>
      <p
        className={`mt-0.5 truncate font-sans text-[11px] font-semibold tracking-[0.06em] lg:text-[12px] ${
          checking ? "text-poster" : skipped ? "text-mute" : "text-ink"
        }`}
        title={GATE_NAME[gate.id] || gate.label}
      >
        {name}
      </p>
      <motion.span
        className={`mt-2 grid h-5 w-5 place-items-center border ${
          checking ? "border-poster bg-poster" : failed ? "border-poster bg-cream" : passed ? "border-ink bg-ink" : "border-ink bg-cream"
        }`}
        animate={checking && !reduce ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={checking && !reduce ? { duration: 0.7, repeat: Infinity, ease: "linear" } : { duration: 0 }}
      >
        {passed ? <span className="text-[11px] leading-none text-cream">✓</span> : null}
        {failed ? <span className="text-[11px] leading-none text-poster">✕</span> : null}
        {skipped ? <span className="text-[10px] leading-none text-mute">—</span> : null}
      </motion.span>
      <p
        className={`mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] ${
          checking ? "text-poster" : failed ? "text-poster" : skipped ? "text-mute" : "text-ink"
        }`}
      >
        {labelFor(state)}
      </p>
      <div className="mt-2 h-[3px] w-full bg-ink/15">
        <motion.div
          key={`${gate.id}-${state}`}
          className={`h-full ${failed ? "bg-poster" : "bg-poster"}`}
          initial={{ width: passed || failed ? "100%" : 0 }}
          animate={{ width: checking || passed || failed ? "100%" : 0 }}
          transition={reduce ? { duration: 0 } : { duration: checking ? checkMs / 1000 : 0.18, ease: "linear" }}
        />
      </div>
    </div>
  );
}

function Connector({
  filled,
  traveling,
  stopped,
  reduce,
  duration,
}: {
  filled: boolean;
  traveling: boolean;
  stopped: boolean;
  reduce: boolean;
  duration: number;
}) {
  return (
    <div className="relative mx-0.5 mt-9 h-[3px] min-w-0 flex-1 bg-ink/20">
      <motion.div
        className="absolute inset-y-0 left-0 bg-poster"
        initial={false}
        animate={{ width: stopped ? "100%" : filled || traveling ? "100%" : "0%" }}
        transition={reduce ? { duration: 0 } : { duration: traveling ? duration : 0.2, ease: "linear" }}
      />
      {stopped ? (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-cream px-0.5 font-mono text-[11px] text-poster">
          ✕
        </span>
      ) : null}
      <AnimatePresence>
        {traveling && !reduce ? (
          <motion.span
            key="pulse"
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 bg-poster"
            initial={{ left: "0%" }}
            animate={{ left: "100%" }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: "linear" }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Tail({
  approved,
  blocked,
  reduce,
}: {
  approved: boolean;
  blocked: boolean;
  reduce: boolean;
}) {
  if (blocked) {
    return (
      <div className="relative ml-1 mt-7 hidden w-10 shrink-0 sm:block">
        <span className="block h-[2px] w-6 bg-poster" />
        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-poster">STOP</span>
      </div>
    );
  }
  return (
    <div className="relative ml-1 mt-8 hidden min-w-0 flex-1 sm:block">
      <div className="h-[2px] bg-ink/20">
        <motion.div
          className="h-full bg-poster"
          initial={false}
          animate={{ width: approved ? "100%" : "0%" }}
          transition={reduce ? { duration: 0 } : { duration: 0.4, ease: "linear" }}
        />
      </div>
    </div>
  );
}

function CurrentCheck({
  gate,
  index,
  state,
  amountPaise,
  priceCompare,
  checkout,
  complete,
  blocked,
  checkMs,
  reduce,
}: {
  gate: Gate | null;
  index: number;
  state: Reveal;
  amountPaise: number;
  priceCompare?: { authorized_paise: number; current_paise: number } | null;
  checkout?: Checkout | null;
  complete?: Complete | null;
  blocked: boolean;
  checkMs: number;
  reduce: boolean;
}) {
  if (!gate) return null;
  const name = GATE_NAME[gate.id] || gate.label;
  const authorized = priceCompare?.authorized_paise ?? amountPaise;
  const current = priceCompare?.current_paise ?? amountPaise;

  return (
    <div className="mt-6 border border-ink px-4 py-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-poster">CURRENT CHECK</p>
      <p className="mt-2 font-sans text-[16px] font-semibold tracking-[0.06em] text-ink">
        {String(index + 1).padStart(2, "0")} / {name}
      </p>
      <p className="mt-1 font-sans text-[14px] text-ink">{gate.label}</p>

      {gate.id === "price" ? (
        <div className="mt-4 grid grid-cols-2 gap-4 font-mono text-[12px] uppercase">
          <div>
            <p className="text-mute">AUTHORIZED PRICE</p>
            <p className="mt-1 text-ink">{inr2(authorized)}</p>
          </div>
          <div>
            <p className="text-mute">CURRENT PRICE</p>
            <p className="mt-1 text-ink">{inr2(current)}</p>
          </div>
        </div>
      ) : null}

      {gate.id === "quote" ? (
        <p className="mt-3 font-mono text-[12px] uppercase text-ink">
          {state === "fail" ? "QUOTE NO LONGER VALID" : "QUOTE LOCKED"}
        </p>
      ) : null}

      {gate.id === "cart" ? <p className="mt-3 font-mono text-[12px] uppercase text-ink">ITEMS [1]</p> : null}

      <p className={`mt-4 font-mono text-[12px] uppercase ${state === "fail" || blocked ? "text-poster" : "text-ink"}`}>
        STATUS{" "}
        {state === "checking"
          ? "CHECKING"
          : state === "pass"
            ? "✓ PASSED"
            : state === "fail"
              ? `✕ BLOCKED${complete?.decision ? `  ${complete.decision}` : ""}`
              : state === "skipped"
                ? "— NOT RUN"
                : "WAITING"}
      </p>
      {state === "checking" ? (
        <div className="mt-2 h-[4px] w-full max-w-sm bg-ink/15">
          <motion.div
            key={`detail-${gate.id}`}
            className="h-full bg-poster"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={reduce ? { duration: 0 } : { duration: checkMs / 1000, ease: "linear" }}
          />
        </div>
      ) : null}
    </div>
  );
}

function BoundaryStory({
  approved,
  blocked,
  checking,
  railCalled,
}: {
  approved: boolean;
  blocked: boolean;
  checking: boolean;
  railCalled: boolean;
}) {
  const nodes = blocked
    ? ["AI REQUEST", "BOUND", "✕ STOP"]
    : approved
      ? ["AI REQUEST", "BOUND", "ALLOW", "RAZORPAY"]
      : ["AI REQUEST", "BOUND", "GATES", "RAZORPAY"];
  const active = blocked ? 2 : approved ? 2 : checking ? 1 : 0;

  return (
    <div className="mt-5">
      <div className="relative flex items-center justify-between gap-2">
        <span className="absolute inset-x-0 top-[7px] h-px bg-ink" aria-hidden />
        <span
          className="absolute left-0 top-[7px] h-px bg-poster"
          style={{ width: blocked ? "66%" : approved ? "100%" : checking ? "50%" : "25%" }}
          aria-hidden
        />
        {nodes.map((label, i) => (
          <div key={label} className="relative z-10 flex flex-col items-center bg-cream px-1">
            <span className={`h-2 w-2 ${i === active ? "bg-poster" : "bg-ink"}`} />
            <span
              className={`mt-2 text-center font-mono text-[9px] uppercase tracking-[0.08em] lg:text-[10px] ${
                i === active ? "text-poster" : "text-ink"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
      {blocked ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-mute">RAZORPAY NOT CALLED</p>
      ) : null}
      {approved && railCalled ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-mute">RAZORPAY SETTLES</p>
      ) : null}
    </div>
  );
}

function TxnDossier({
  amountPaise,
  product,
  skuId,
  traceId,
  startedAt,
  boundStatus,
  gateNo,
  gateName,
  blocked,
  authorized,
  maxAuthorizedPaise,
  orderId,
  paymentId,
  receipt,
}: {
  amountPaise: number;
  product?: string;
  skuId?: string;
  traceId: string;
  startedAt?: string;
  boundStatus: string;
  gateNo: string;
  gateName: string;
  blocked: boolean;
  authorized: boolean;
  maxAuthorizedPaise?: number;
  orderId?: string | null;
  paymentId?: string | null;
  receipt?: string | null;
}) {
  const money = inr2(amountPaise);
  const rupee = money.startsWith("₹") ? "₹" : "";
  const figures = rupee ? money.slice(1) : money;
  const stamp = blocked ? "BLOCKED" : authorized ? "AUTHORIZED" : "LIVE";
  const stampColor = blocked || authorized ? "text-poster" : "text-ink";

  return (
    <>
      <p className="bg-ink px-4 py-2 font-display text-[10px] font-extrabold uppercase tracking-[0.28em] text-poster">
        FILE · TXN DOSSIER
      </p>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-4">
        <p className="font-sans text-[9px] uppercase tracking-[0.32em] text-mute">Amount at stake</p>
        <p className="mt-1 flex items-start leading-none">
          <span className="mt-1 font-display text-[22px] font-bold text-poster">{rupee}</span>
          <span className="ml-0.5 font-display text-[52px] font-bold tracking-[-0.04em] text-poster">{figures}</span>
        </p>

        <div className="mt-6 border-t border-ink pt-4">
          <p className="font-sans text-[9px] uppercase tracking-[0.32em] text-mute">Subject</p>
          <p className="mt-1 font-sans text-[26px] font-semibold leading-[0.9] tracking-[-0.03em] text-ink">
            {(product || "—").toUpperCase()}
          </p>
        </div>

        {maxAuthorizedPaise != null ? (
          <div className="mt-5 border-t border-ink pt-4">
            <p className="font-sans text-[9px] uppercase tracking-[0.32em] text-mute">Bound authorization</p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink">
              Maximum authorized {inr2(maxAuthorizedPaise)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink">
              Requested transaction {inr2(amountPaise)}
            </p>
            <p
              className={`mt-1 font-mono text-[11px] uppercase tracking-[0.08em] ${
                amountPaise > maxAuthorizedPaise ? "text-poster" : "text-mute"
              }`}
            >
              {amountPaise > maxAuthorizedPaise
                ? `Over authorization ${inr2(amountPaise - maxAuthorizedPaise)}`
                : `Remaining authorization ${inr2(maxAuthorizedPaise - amountPaise)}`}
            </p>
          </div>
        ) : null}

        {authorized || blocked ? (
          <div className="mt-5 border-t border-ink pt-4">
            <p className="font-sans text-[9px] uppercase tracking-[0.32em] text-mute">File marks</p>
            <p className="mt-2 break-all font-mono text-[11px] leading-relaxed tracking-[0.12em] text-ink">{traceId}</p>
            {skuId ? (
              <p className="mt-1 break-all font-mono text-[10px] tracking-[0.14em] text-mute">{skuId}</p>
            ) : null}
            {orderId ? (
              <p className="mt-1 break-all font-mono text-[10px] tracking-[0.14em] text-mute">{orderId}</p>
            ) : null}
            {paymentId ? (
              <p className="mt-1 break-all font-mono text-[10px] tracking-[0.14em] text-mute">{paymentId}</p>
            ) : null}
            {receipt ? (
              <p className="mt-1 break-all font-mono text-[10px] tracking-[0.14em] text-mute">{receipt}</p>
            ) : null}
            <p className="mt-2 font-mono text-[10px] tracking-[0.08em] text-mute">{filedAt(startedAt)}</p>
          </div>
        ) : null}

        <div className="mt-auto border-t border-ink pt-4">
          <p className="font-sans text-[9px] uppercase tracking-[0.32em] text-mute">Now evaluating</p>
          <div className="mt-1 flex items-end gap-3">
            <p className="font-display text-[64px] font-bold leading-none tracking-[-0.06em] text-ink">{gateNo}</p>
            <p className="mb-1 font-sans text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">{gateName}</p>
          </div>
        </div>
      </div>
      <div className="border-t border-ink px-4 py-3">
        <p className="font-sans text-[9px] uppercase tracking-[0.28em] text-mute">Bound status</p>
        <p className={`mt-1 font-mono text-[32px] font-medium uppercase leading-none tracking-tight ${stampColor}`}>
          {stamp}
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">{boundStatus}</p>
      </div>
    </>
  );
}

function receiptId(complete?: Complete | null): string | null {
  const raw = complete?.receipt;
  if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string") return raw.id;
  return null;
}

function filedAt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", "  ").replace(/\.\d+Z$/, "Z");
}

function labelFor(state: Reveal) {
  if (state === "checking") return "CHECKING";
  if (state === "pass") return "PASSED";
  if (state === "fail") return "BLOCKED";
  if (state === "skipped") return "NOT RUN";
  return "WAITING";
}

function currentGateIndex(reveal: Reveal[]) {
  const checking = reveal.findIndex((r) => r === "checking");
  if (checking >= 0) return checking;
  const failed = reveal.findIndex((r) => r === "fail");
  if (failed >= 0) return failed;
  let lastPass = -1;
  reveal.forEach((r, i) => {
    if (r === "pass") lastPass = i;
  });
  if (lastPass >= 0) return lastPass;
  return reveal.length ? 0 : -1;
}
