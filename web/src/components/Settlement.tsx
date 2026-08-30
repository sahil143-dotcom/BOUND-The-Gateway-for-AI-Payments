import { decisionBanner, decisionHuman, decisionPolicy } from "@/lib/copy";
import { inr } from "@/lib/money";
import type { Complete } from "@/lib/types";

export function Settlement({
  complete,
  priceCompare,
  amountPaise,
  passed,
}: {
  complete: Complete;
  priceCompare?: { authorized_paise: number; current_paise: number } | null;
  amountPaise: number;
  passed: number;
}) {
  const approved = complete.decision === "APPROVE";
  return (
    <section className="mt-4" aria-live="polite">
      <p className="text-[13px] text-mute">{approved ? "Approved" : "Blocked"}</p>
      <h2 className="mt-2 text-[clamp(44px,8vw,72px)] font-semibold tracking-tight">
        {decisionBanner(complete.decision)}
      </h2>
      {approved ? (
        <p className="mt-3 font-mono text-[13px] text-mute">{passed} / 6 checks passed</p>
      ) : (
        <p className="mt-3 font-mono text-[13px] text-mute">{decisionPolicy(complete.decision)}</p>
      )}
      <p className="money mt-4 text-[28px] font-semibold">{inr(amountPaise)}</p>
      <p className="mt-3 max-w-md text-[17px] leading-7 text-mute">{decisionHuman(complete.decision)}</p>
      {approved ? <p className="mt-4 text-[16px]">Payment authorized</p> : null}
      {complete.reason && !approved ? (
        <p className="mt-3 font-mono text-[14px] text-mute">{complete.reason}</p>
      ) : null}
      {priceCompare ? (
        <p className="mt-3 font-mono text-[14px] text-mute">
          Locked {inr(priceCompare.authorized_paise)} · now {inr(priceCompare.current_paise)}
        </p>
      ) : null}
    </section>
  );
}
