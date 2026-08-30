import { inr, pad2 } from "@/lib/money";
import type { Metrics } from "@/lib/types";
import { Ticker } from "./Ticker";

export function MetricsStrip({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return null;
  return (
    <aside className="mt-10 border-t border-line pt-6 text-[16px] text-mute">
      <p>
        <Ticker value={metrics.requests} format={pad2} /> requests ·{" "}
        <Ticker value={metrics.approved} format={pad2} /> approved ·{" "}
        <Ticker value={metrics.blocked} format={pad2} /> blocked
      </p>
      <p className="mt-3">
        <Ticker value={metrics.captured_paise} format={inr} /> captured ·{" "}
        <Ticker value={metrics.blocked_paise} format={inr} /> prevented
      </p>
      {metrics.deny_reasons.length ? (
        <ul className="mt-3 space-y-1 font-mono text-[14px]">
          {metrics.deny_reasons.map((reason) => (
            <li key={reason.code}>
              {reason.code} · {inr(reason.paise)}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
