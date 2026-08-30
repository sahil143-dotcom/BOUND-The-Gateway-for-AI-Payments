"use client";

import { useState } from "react";
import { AppButton } from "./AppButton";
import { gateProof, proofRows } from "@/lib/proof";
import { inr } from "@/lib/money";
import type { Checkout, Complete, Gate, LedgerEvent } from "@/lib/types";

export function AuditDossier({
  events,
  traceId,
  complete,
  checkout,
  gates,
  product,
  amountPaise,
}: {
  events: LedgerEvent[];
  traceId: string;
  complete?: Complete | null;
  checkout?: Checkout | null;
  gates?: Gate[];
  product?: string;
  amountPaise?: number;
}) {
  const [tech, setTech] = useState(false);
  const rows = proofRows({ complete, checkout, events, traceId });
  const denied = complete && complete.decision !== "APPROVE";

  return (
    <section className="mt-2 max-w-[520px]">
      <p className="text-[22px] font-semibold tracking-tight">Transaction proof</p>
      <div className="hairline mt-3" />
      {product ? <p className="mt-5 text-[18px]">{product}</p> : null}
      {amountPaise != null ? <p className="money mt-1 text-[22px]">{inr(amountPaise)}</p> : null}
      <p className="mt-5 text-[13px] text-mute">{denied ? "Blocked" : "Approved"}</p>
      <p className="mt-1 font-mono text-[16px]">{complete?.decision || "—"}</p>
      {complete?.reason ? <p className="mt-3 max-w-md text-[16px] text-mute">{complete.reason}</p> : null}

      {gates?.length ? (
        <ul className="mt-6 space-y-2 font-mono text-[13px]">
          {gateProof(gates).map((row) => (
            <li key={row.label} className="flex justify-between gap-4">
              <span className="text-mute">{row.label}</span>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 space-y-2 font-mono text-[13px]">
        <p>ORDER CREATED · {complete?.order_id ? "YES" : "NO"}</p>
        <p>RAIL CALLED · {complete?.rail_call ? "YES" : "NO"}</p>
      </div>

      <div className="mt-6">
        <AppButton ghost onClick={() => setTech((v) => !v)}>
          {tech ? "Hide identifiers" : "Inspect identifiers"}
        </AppButton>
      </div>
      {tech ? (
        <dl className="mt-5 space-y-4">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="kicker">{row.label}</dt>
              <dd className="mt-1 break-all font-mono text-[15px]">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export function TraceSearch({
  value,
  onChange,
  onReplay,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onReplay: () => void;
  busy: boolean;
}) {
  return (
    <form
      className="mb-8 max-w-[520px]"
      onSubmit={(e) => {
        e.preventDefault();
        onReplay();
      }}
    >
      <label className="text-[16px] text-mute" htmlFor="trace-id">
        Trace
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
        <input
          id="trace-id"
          className="bound-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="tr_…"
          autoComplete="off"
        />
        <AppButton type="submit" disabled={busy || !value.trim()}>
          Open
        </AppButton>
      </div>
    </form>
  );
}
