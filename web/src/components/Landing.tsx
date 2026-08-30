"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Flick = "pair" | "yes" | "no";

export function Landing({ onEnter }: { onEnter: () => void }) {
  const reduce = useReducedMotion();
  const wide = useWide();
  const [step, setStep] = useState<Step>(reduce ? 6 : 0);
  const [flick, setFlick] = useState<Flick>("pair");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (reduce) {
      setStep(6);
      return;
    }
    const marks: Array<[Step, number]> = [
      [1, 0],
      [2, 220],
      [3, 420],
      [4, 720],
      [5, 1100],
      [6, 1480],
    ];
    const ids = marks.map(([next, at]) => window.setTimeout(() => setStep(next), at));
    return () => ids.forEach(clearTimeout);
  }, [reduce]);

  useEffect(() => {
    if (step !== 5 || reduce) return;
    let n = 0;
    setFlick("yes");
    const id = window.setInterval(() => {
      n += 1;
      setFlick(n % 2 === 0 ? "yes" : "no");
    }, 160);
    return () => clearInterval(id);
  }, [step, reduce]);

  function enter() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onEnter, reduce ? 0 : 160);
  }

  const drawn = step >= 3;
  const atBound = step >= 4;
  const atAuth = step >= 5;
  const ready = step >= 6;

  return (
    <motion.div
      className="relative min-h-screen overflow-x-hidden bg-cream text-ink"
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.16, ease: "linear" }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1080px] flex-col items-center justify-center px-6 py-14 sm:px-10">
        <motion.h1
          className="display text-center text-[clamp(72px,18vh,160px)] text-ink"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 12 }}
          transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          BOUND
        </motion.h1>

        <motion.p
          className="mt-5 text-center font-display text-[clamp(18px,2.4vw,28px)] font-bold uppercase leading-[1.15] tracking-[0.04em] text-ink"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: step >= 2 ? 1 : 0, y: step >= 2 ? 0 : 8 }}
          transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          When AI spends money,
          <br />
          someone needs to say yes.
        </motion.p>

        <motion.div
          className="mt-14 w-full"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: drawn ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.28 }}
          aria-label="Authorization path"
        >
          {wide ? (
            <DesktopDiagram
              drawn={drawn}
              atBound={atBound}
              atAuth={atAuth}
              ready={ready}
              flick={flick}
              reduce={!!reduce}
            />
          ) : (
            <StackedDiagram
              drawn={drawn}
              atBound={atBound}
              atAuth={atAuth}
              ready={ready}
              flick={flick}
              reduce={!!reduce}
            />
          )}
        </motion.div>

        <motion.dl
          className="mt-12 grid w-full max-w-[720px] grid-cols-1 gap-5 font-mono text-[10px] uppercase tracking-[0.14em] text-mute sm:grid-cols-3 sm:gap-8"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: drawn ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.24, delay: reduce ? 0 : 0.08 }}
        >
          <div>
            <dt className="text-ink">AI REQUEST</dt>
            <dd className="mt-1">AI wants to buy</dd>
          </div>
          <div>
            <dt className="text-ink">BOUND AUTHORIZES</dt>
            <dd className="mt-1">BOUND checks the request</dd>
          </div>
          <div>
            <dt className="text-ink">RAZORPAY SETTLES</dt>
            <dd className="mt-1">Only after ALLOW</dd>
          </div>
        </motion.dl>

        <motion.p
          className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: drawn ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.24, delay: reduce ? 0 : 0.1 }}
        >
          AI REQUEST → AI SEARCHES → AI SELECTS → BOUND AUTHORIZES → RAZORPAY SETTLES
        </motion.p>

        <motion.div
          className="mt-14"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: ready ? 1 : 0.4, y: ready ? 0 : 8 }}
          transition={reduce ? { duration: 0 } : { duration: 0.22 }}
        >
          <button type="button" className="landing-enter" onClick={enter}>
            ENTER BOUND →
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function DesktopDiagram({
  drawn,
  atBound,
  atAuth,
  ready,
  flick,
  reduce,
}: {
  drawn: boolean;
  atBound: boolean;
  atAuth: boolean;
  ready: boolean;
  flick: Flick;
  reduce: boolean;
}) {
  return (
    <div className="flex items-center justify-center">
      <NodeLabel>AI REQUEST</NodeLabel>
      <Rail
        length={88}
        drawn={drawn}
        filled={atBound}
        pulse={atBound && !atAuth}
        reduce={reduce}
      />
      <BoundNode live={atBound} />
      <Rail
        length={88}
        drawn={drawn}
        filled={atAuth}
        pulse={atAuth && !ready}
        reduce={reduce}
      />
      <div className="flex items-center">
        <AuthNode flick={flick} ready={ready} />
        <motion.div
          className="relative ml-1 flex flex-col justify-center gap-5 pl-3"
          initial={false}
          animate={{ opacity: ready ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2 }}
          aria-hidden={!ready}
        >
          <span className="absolute bottom-3 left-0 top-3 w-px bg-ink" aria-hidden />
          <Outcome
            kind="allow"
            drawn={ready}
            filled={ready}
            pulse={false}
            reduce={reduce}
          />
          <Outcome
            kind="block"
            drawn={ready}
            filled={ready}
            pulse={false}
            reduce={reduce}
          />
        </motion.div>
      </div>
    </div>
  );
}

function StackedDiagram({
  drawn,
  atBound,
  atAuth,
  ready,
  flick,
  reduce,
}: {
  drawn: boolean;
  atBound: boolean;
  atAuth: boolean;
  ready: boolean;
  flick: Flick;
  reduce: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <NodeLabel>AI REQUEST</NodeLabel>
      <Rail
        vertical
        length={36}
        drawn={drawn}
        filled={atBound}
        pulse={atBound && !atAuth}
        reduce={reduce}
      />
      <BoundNode live={atBound} />
      <Rail
        vertical
        length={36}
        drawn={drawn}
        filled={atAuth}
        pulse={atAuth && !ready}
        reduce={reduce}
      />
      <AuthNode flick={flick} ready={ready} />
      <motion.div
        className="mt-5 flex w-full max-w-[320px] flex-col gap-3"
        initial={false}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.2 }}
        aria-hidden={!ready}
      >
        <Outcome kind="allow" drawn={ready} filled={ready} pulse={false} reduce={reduce} />
        <Outcome kind="block" drawn={ready} filled={ready} pulse={false} reduce={reduce} />
      </motion.div>
    </div>
  );
}

function NodeLabel({ children }: { children: string }) {
  return (
    <p className="shrink-0 font-display text-[16px] font-bold uppercase tracking-[0.08em] text-ink">
      {children}
    </p>
  );
}

function BoundNode({ live }: { live: boolean }) {
  return (
    <div className="relative shrink-0 px-3">
      <span
        className="absolute bottom-[-18px] left-1/2 top-[-18px] w-[2px] -translate-x-1/2 bg-poster"
        aria-hidden
        title="Authorization boundary"
      />
      <p
        className={`relative bg-cream px-1 font-display text-[22px] font-extrabold uppercase tracking-[0.06em] ${
          live ? "text-poster" : "text-ink"
        }`}
      >
        BOUND
      </p>
    </div>
  );
}

function AuthNode({ flick, ready }: { flick: Flick; ready: boolean }) {
  const pair = !ready && flick === "pair";
  const yesOn = ready || flick === "yes" || pair;
  const noOn = ready || flick === "no" || pair;

  return (
    <div className="relative z-10 min-w-[168px] border border-ink bg-cream px-5 py-4 text-center">
      <p className="font-display text-[20px] font-bold uppercase tracking-[0.08em] text-ink">
        AUTHORIZED?
      </p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em]">
        <span className={yesOn && flick === "yes" && !ready ? "text-poster" : "text-ink"}>YES</span>
        <span className="text-mute"> / </span>
        <span className={noOn && flick === "no" && !ready ? "text-poster" : "text-ink"}>NO</span>
      </p>
    </div>
  );
}

function Outcome({
  kind,
  drawn,
  filled,
  pulse,
  reduce,
}: {
  kind: "allow" | "block";
  drawn: boolean;
  filled: boolean;
  pulse: boolean;
  reduce: boolean;
}) {
  const allow = kind === "allow";
  return (
    <div className="flex items-center">
      <p
        className={`w-[72px] shrink-0 font-display text-[13px] font-bold uppercase tracking-[0.08em] ${
          allow ? "text-ink" : "text-poster"
        }`}
      >
        {allow ? "ALLOW" : "BLOCK"}
      </p>
      <Rail
        length={64}
        drawn={drawn}
        filled={filled}
        pulse={pulse}
        blocked={!allow}
        reduce={reduce}
      />
      <p
        className={`shrink-0 font-display text-[13px] font-bold uppercase tracking-[0.08em] ${
          allow ? "text-ink" : "text-poster"
        }`}
      >
        {allow ? "RAZORPAY" : "STOP"}
      </p>
    </div>
  );
}

function Rail({
  length = 72,
  vertical = false,
  drawn,
  filled,
  pulse,
  blocked = false,
  reduce,
}: {
  length?: number;
  vertical?: boolean;
  drawn: boolean;
  filled: boolean;
  pulse: boolean;
  blocked?: boolean;
  reduce: boolean;
}) {
  const size = vertical
    ? { width: 2, height: length }
    : { width: length, height: 2 };

  return (
    <div className="relative mx-1 my-0.5 shrink-0 bg-ink/20" style={size}>
      <motion.div
        className="absolute bg-poster"
        initial={false}
        animate={
          vertical
            ? { height: !drawn ? 0 : blocked && filled ? "42%" : filled ? "100%" : 0, width: 2 }
            : { width: !drawn ? 0 : blocked && filled ? "42%" : filled ? "100%" : 0, height: 2 }
        }
        transition={reduce ? { duration: 0 } : { duration: 0.28, ease: "linear" }}
      />
      {blocked && filled ? (
        <span
          className={`absolute bg-cream px-0.5 font-mono text-[11px] leading-none text-poster ${
            vertical ? "left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2" : "left-[42%] top-1/2 -translate-x-1/2 -translate-y-1/2"
          }`}
        >
          ✕
        </span>
      ) : null}
      {pulse && !reduce ? (
        <motion.span
          className="absolute h-2 w-2 bg-poster"
          initial={vertical ? { top: 0, left: -3 } : { left: 0, top: -3 }}
          animate={vertical ? { top: length - 8, left: -3 } : { left: length - 8, top: -3 }}
          transition={{ duration: 0.28, ease: "linear" }}
        />
      ) : null}
    </div>
  );
}

function useWide() {
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return wide;
}
