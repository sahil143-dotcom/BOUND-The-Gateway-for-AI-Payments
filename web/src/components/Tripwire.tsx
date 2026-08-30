"use client";

import { motion, useReducedMotion } from "motion/react";

export type WireMode = "idle" | "checking" | "open" | "stopped";

export function Tripwire({
  mode,
  railName,
}: {
  mode: WireMode;
  railName: string;
}) {
  const reduce = useReducedMotion();
  const fill = mode === "open" ? "100%" : mode === "stopped" ? "50%" : mode === "checking" ? "46%" : "34%";

  return (
    <section aria-label="Payment boundary">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 text-[15px] text-mute">
        <span>BOUND</span>
        <div className="relative h-7">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
          <motion.div
            className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-poster"
            initial={false}
            animate={{ width: fill }}
            transition={reduce ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />
          {mode === "stopped" ? (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1 text-[18px] text-ink">
              ×
            </span>
          ) : null}
        </div>
        <span>{railName}</span>
      </div>
    </section>
  );
}
