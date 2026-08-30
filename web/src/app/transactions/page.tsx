"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RecentList } from "@/components/RecentList";
import { getTraces } from "@/lib/api";
import type { LedgerEvent } from "@/lib/types";

export default function TransactionsPage() {
  const [items, setItems] = useState<LedgerEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getTraces()
      .then((t) => {
        setItems(t.items);
        setError("");
      })
      .catch(() => {
        setItems([]);
        setError("BOUND decisions could not be loaded.");
      });
  }, []);

  return (
    <AppShell current="/transactions">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-poster">AUTHORIZATION LOG</p>
      <h1 className="display mt-2 text-[48px] leading-none text-ink">BOUND DECISIONS</h1>
      <p className="mt-3 max-w-[440px] font-sans text-[16px] text-ink">
        Every ALLOW and BLOCK BOUND already made. ALLOW reaches Razorpay. BLOCK does not.
      </p>
      {error ? <p className="mt-8 font-mono text-[13px] uppercase tracking-[0.08em] text-poster">{error}</p> : null}
      {items === null ? (
        <p className="mt-8 font-mono text-[13px] uppercase tracking-[0.08em] text-mute">LOADING DECISIONS</p>
      ) : (
        <RecentList items={items} />
      )}
    </AppShell>
  );
}
