"use client";

import { motion, useReducedMotion } from "motion/react";

export function Stamp({ children }: { children: string; rotate?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.p
      className="text-[13px] font-medium tracking-[0.14em] text-mute uppercase"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.p>
  );
}
