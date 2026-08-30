"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuditDossier, TraceSearch } from "@/components/AuditDossier";
import { getAudit } from "@/lib/api";
import type { LedgerEvent } from "@/lib/types";

export default function AuditPage() {
  const [traceId, setTraceId] = useState("");
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("trace_id") || "";
    setTraceId(q);
    if (q) replay(q);
  }, []);

  async function replay(id = traceId) {
    if (!id.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await getAudit(id.trim());
      setEvents(data.events);
      setTraceId(data.trace_id);
    } catch (err) {
      setEvents([]);
      setError("Nothing matched that trace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="/audit">
      <h1 className="mb-6 text-[28px] font-semibold tracking-tight">Look up a request</h1>
      <TraceSearch value={traceId} onChange={setTraceId} onReplay={() => replay()} busy={busy} />
      {error ? <p className="text-mute">{error}</p> : null}
      {events.length ? <AuditDossier events={events} traceId={traceId} /> : null}
    </AppShell>
  );
}
