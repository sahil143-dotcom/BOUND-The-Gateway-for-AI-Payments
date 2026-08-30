import Link from "next/link";
import { inr2 } from "@/lib/money";
import type { LedgerEvent } from "@/lib/types";

export function RecentList({ items }: { items: LedgerEvent[] }) {
  if (!items.length) {
    return (
      <p className="mt-8 max-w-[420px] font-sans text-[16px] text-mute">
        No BOUND decisions yet. After authorization, both ALLOW and BLOCK appear here — including
        blocked attempts that never reached Razorpay.
      </p>
    );
  }

  return (
    <ul className="mt-8 border-t border-ink">
      {items.map((item) => {
        const blocked = item.type === "DENY" || (item.decision && item.decision !== "APPROVE");
        const allowed = !blocked;
        const rail = Boolean(item.rail_call);
        return (
          <li key={item.id} className="border-b border-ink">
            <Link href={`/audit?trace_id=${item.trace_id}`} className="block py-4">
              <span className="flex items-baseline justify-between gap-4">
                <span className={`font-display text-[22px] font-bold uppercase tracking-[0.04em] ${allowed ? "text-poster" : "text-ink"}`}>
                  {allowed ? "ALLOW" : "BLOCK"}
                </span>
                <span className="money font-mono text-[16px] text-ink">{inr2(item.amount_paise)}</span>
              </span>
              <span className="mt-1 block font-mono text-[12px] uppercase tracking-[0.08em] text-ink">
                {allowed ? "APPROVE" : item.decision || item.reason || item.type}
                {" · "}
                {rail ? "RAIL CALLED" : "RAIL NOT CALLED"}
              </span>
              {item.rzp_order_id ? (
                <span className="mt-1 block font-mono text-[12px] uppercase tracking-[0.08em] text-mute">
                  ORDER {item.rzp_order_id}
                </span>
              ) : (
                <span className="mt-1 block font-mono text-[12px] uppercase tracking-[0.08em] text-mute">
                  RAZORPAY ORDER NOT CREATED
                </span>
              )}
              {item.ts ? (
                <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-mute">{item.ts}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
