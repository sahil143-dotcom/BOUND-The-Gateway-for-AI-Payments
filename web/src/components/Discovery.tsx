"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { understoodSignals } from "@/lib/agent";
import { productRequest } from "@/lib/intent";
import { inr2, pad2 } from "@/lib/money";
import { productImage } from "@/lib/products";
import type { CatalogProduct } from "@/lib/types";
import { AppButton } from "./AppButton";

export type AgentLine = {
  id: string;
  text: string;
  ok: boolean;
};

const STORY = ["AI REQUEST", "AI SEARCHES", "AI SELECTS", "BOUND AUTHORIZES", "RAZORPAY SETTLES"] as const;

export function Discovery({
  query,
  onQueryChange,
  onSearch,
  searching,
  intent,
  merchant,
  products,
  explore,
  selected,
  log,
  maxAuthorizedPaise,
  busy,
  onAuthorize,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (value: string) => void;
  searching: boolean;
  intent: string;
  merchant: string;
  products: CatalogProduct[];
  explore: string[];
  selected: CatalogProduct | null;
  log: AgentLine[];
  maxAuthorizedPaise: number;
  busy: boolean;
  onAuthorize: () => void;
}) {
  const reduce = useReducedMotion();
  const fade = reduce
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as const };
  const [editing, setEditing] = useState(false);
  const idle = !searching && !intent && products.length === 0 && log.length === 0;
  const ready = Boolean(selected);
  const storyStep = idle ? 0 : searching ? 1 : ready ? 2 : 1;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(query);
    setEditing(false);
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <StoryStrip step={storyStep} />

      <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr]">
        <div className="flex min-h-0 flex-col border-r border-ink px-8 pb-5 pt-6">
          {idle ? (
            <>
              <h1 className="display text-[44px] leading-none text-ink">
                WHAT DO YOU
                <br />
                WANT TO BUY?
              </h1>
              <RequestForm
                query={query}
                disabled={searching || busy}
                onQueryChange={onQueryChange}
                onSubmit={submit}
              />
              {explore.length ? (
                <ExploreList
                  phrases={explore}
                  onPick={(phrase) => {
                    onQueryChange(phrase);
                    onSearch(phrase);
                    setEditing(false);
                  }}
                />
              ) : null}
            </>
          ) : editing ? (
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-poster">
                AI REQUEST
              </p>
              <RequestForm
                query={query}
                disabled={searching || busy}
                onQueryChange={onQueryChange}
                onSubmit={submit}
              />
            </div>
          ) : (
            <PurchaseRequest
              intent={intent}
              searching={searching}
              understood={understoodSignals(intent)}
              disabled={searching || busy}
              onEdit={() => setEditing(true)}
            />
          )}

          <div className="mt-6 flex min-h-[160px] min-w-0 flex-1 flex-col overflow-hidden border border-ink bg-cream">
            <p className="bg-ink px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-poster">
              AI SEARCHES
            </p>
            <ul className="min-h-0 flex-1 space-y-2 overflow-auto px-5 py-4 font-mono text-[13px] leading-relaxed text-ink">
              {idle ? (
                <li className="text-mute">&gt; WAITING FOR AI REQUEST</li>
              ) : (
                <AnimatePresence initial={false}>
                  {log.map((line) => (
                    <motion.li
                      key={line.id}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={fade}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <span>&gt; {line.text}</span>
                      <span className={line.ok ? "text-poster" : "text-mute"}>{line.ok ? "✓" : "…"}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              )}
            </ul>
          </div>

          <p className={`mt-4 font-mono text-[10px] uppercase tracking-[0.12em] ${ready ? "text-ink" : "text-mute"}`}>
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 ${ready ? "bg-poster" : "border border-ink bg-transparent"}`} aria-hidden />
              {ready ? "AI SELECTED" : searching ? "AI SEARCHES" : "AWAITING AI REQUEST"}
            </span>
            <span className="mt-1 block pl-4">
              {ready ? "BOUND AUTHORIZES NEXT" : "AI REQUEST → AI SEARCHES → AI SELECTS"}
            </span>
          </p>
        </div>

        <div className="flex min-h-0 flex-col overflow-auto px-8 pb-6 pt-6">
          {idle ? (
            <EmptyStage />
          ) : (
            <>
              {products.length ? (
                <MatchTable
                  products={products}
                  selectedId={selected?.id || ""}
                  reduce={!!reduce}
                  fade={fade}
                />
              ) : searching ? (
                <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-mute">AI SEARCHES CATALOG…</p>
              ) : log.length ? (
                <div className="border border-ink px-6 py-8">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-poster">MATCHES FOUND</p>
                  <p className="mt-3 font-sans text-[18px] text-ink">No catalog match for this AI request.</p>
                  <p className="mt-2 font-mono text-[12px] uppercase tracking-[0.08em] text-mute">
                    EDIT THE REQUEST TO TRY A BROADER INSTRUCTION
                  </p>
                </div>
              ) : null}

              {selected ? (
                <AgentReady
                  product={selected}
                  merchant={merchant}
                  maxAuthorizedPaise={maxAuthorizedPaise}
                  busy={busy}
                  onAuthorize={onAuthorize}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function StoryStrip({ step }: { step: number }) {
  return (
    <p className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink px-8 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em]">
      {STORY.map((label, i) => (
        <span key={label} className="flex items-center gap-2">
          {i > 0 ? <span className="text-mute">→</span> : null}
          <span className={i === step ? "text-poster" : "text-mute"}>{label}</span>
        </span>
      ))}
    </p>
  );
}

function RequestForm({
  query,
  disabled,
  onQueryChange,
  onSubmit,
}: {
  query: string;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-6">
      <label className="sr-only" htmlFor="bound-intent">
        Purchase instruction
      </label>
      <div className="flex border border-ink">
        <input
          id="bound-intent"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search products or describe what you need..."
          disabled={disabled}
          className="min-w-0 flex-1 bg-cream px-4 py-3 font-sans text-[16px] text-ink outline-none placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={disabled || !query.trim()}
          className="shrink-0 border-l border-ink bg-cream px-5 font-sans text-[13px] font-semibold uppercase tracking-[0.1em] text-ink hover:bg-cream-wash disabled:cursor-default disabled:opacity-40"
        >
          FIND →
        </button>
      </div>
    </form>
  );
}

function PurchaseRequest({
  intent,
  searching,
  understood,
  disabled,
  onEdit,
}: {
  intent: string;
  searching: boolean;
  understood: string[];
  disabled: boolean;
  onEdit: () => void;
}) {
  const request = productRequest(intent);
  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-poster">AI REQUEST</p>
      <p className="mt-3 border-l-2 border-poster pl-4 font-sans text-[18px] font-normal leading-snug text-ink">
        “{request}{request.endsWith(".") ? "" : "."}”
      </p>
      <div className="mt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink">AI SEARCHES</p>
        <p className="mt-1 font-sans text-[14px] text-mute">
          {searching && !understood.length ? "Understanding the request..." : "Understood"}
        </p>
        {understood.length ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] uppercase tracking-[0.12em] text-ink">
            {understood.map((token) => (
              <li key={token}>✓ {token}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onEdit}
        className="mt-4 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-ink underline decoration-ink underline-offset-4 hover:text-poster hover:decoration-poster disabled:opacity-40"
      >
        EDIT / SEARCH AGAIN →
      </button>
    </div>
  );
}

function ExploreList({ phrases, onPick }: { phrases: string[]; onPick: (phrase: string) => void }) {
  return (
    <div className="mt-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">EXPLORE</p>
      <ul className="mt-2 space-y-1">
        {phrases.map((phrase) => (
          <li key={phrase}>
            <button
              type="button"
              onClick={() => onPick(phrase)}
              className="text-left font-sans text-[14px] text-ink underline decoration-ink underline-offset-4 hover:text-poster hover:decoration-poster"
            >
              {phrase}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyStage() {
  return (
    <div className="flex h-full min-h-0 flex-col justify-between border border-ink px-7 py-7">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-poster">BEFORE AUTHORIZATION</p>
        <p className="mt-4 font-display text-[32px] font-bold uppercase leading-none tracking-[0.02em] text-ink">
          AI requests.
          <br />
          AI selects.
          <br />
          BOUND authorizes.
        </p>
        <p className="mt-5 max-w-[380px] font-sans text-[16px] leading-snug text-ink">
          BOUND is an authorization layer for AI purchases. The AI can discover and choose what to buy, but it cannot spend money until BOUND verifies that the transaction is authorized.
        </p>
      </div>
      <ol className="space-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink">
        <li>01  AI REQUEST</li>
        <li>02  AI SEARCHES</li>
        <li>03  AI SELECTS</li>
        <li>04  BOUND AUTHORIZES</li>
        <li>05  RAZORPAY SETTLES</li>
      </ol>
    </div>
  );
}

function MatchTable({
  products,
  selectedId,
  reduce,
  fade,
}: {
  products: CatalogProduct[];
  selectedId: string;
  reduce: boolean;
  fade: { duration: number; ease?: readonly [number, number, number, number] };
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-poster">
        {pad2(products.length)} MATCHES FOUND
      </p>
      <table className="mt-3 w-full border-collapse border border-ink text-left">
        <thead>
          <tr className="border-b border-ink bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-poster">
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">AI SELECTS</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => {
            const on = p.id === selectedId;
            const src = productImage(p.id);
            return (
              <motion.tr
                key={p.id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...fade, delay: reduce ? 0 : i * 0.05 }}
                className={`border-b border-ink ${on ? "bg-cream-wash" : "bg-cream"}`}
              >
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="h-12 w-9 shrink-0 overflow-hidden border border-ink bg-white">
                      {src ? (
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full place-items-center font-mono text-[10px] text-mute">
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="font-sans text-[13px] font-medium uppercase tracking-[0.04em] text-ink">
                      {p.name}
                    </span>
                  </span>
                </td>
                <td className="money px-3 py-3 font-mono text-[13px] text-ink">{inr2(p.price_paise)}</td>
                <td className={`px-3 py-3 font-mono text-[11px] uppercase tracking-[0.12em] ${on ? "text-poster" : "text-mute"}`}>
                  {on ? "AI SELECTED" : "ELIGIBLE"}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgentReady({
  product,
  merchant,
  maxAuthorizedPaise,
  busy,
  onAuthorize,
}: {
  product: CatalogProduct;
  merchant: string;
  maxAuthorizedPaise: number;
  busy: boolean;
  onAuthorize: () => void;
}) {
  const remaining = maxAuthorizedPaise - product.price_paise;
  const over = remaining < 0;

  return (
    <div className="mt-6 border border-ink">
      <p className="border-b border-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-poster">
        AI SELECTED
      </p>
      <div className="flex items-start">
        <div className="w-[128px] shrink-0 self-start border-r border-ink bg-white">
          <div className="relative aspect-[3/4]">
            <TechnicalFrame skuId={product.id} name={product.name} />
          </div>
        </div>
        <div className="min-w-0 flex-1 px-5 py-4">
          <h2 className="display break-words text-[28px] leading-none text-ink">{product.name.toUpperCase()}</h2>
          <p className="money mt-3 font-display text-[36px] font-bold leading-none tracking-[-0.03em] text-poster">
            {inr2(product.price_paise)}
          </p>
          <p className="mt-3 font-sans text-[15px] text-ink">Selected based on your request.</p>
          <p className="mt-1 font-sans text-[16px] text-ink">{merchant}</p>
        </div>
      </div>
      <div className="border-t border-ink px-5 py-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-poster">BOUND AUTHORIZATION</p>
        <p className="mt-3 font-sans text-[15px] text-ink">
          Maximum authorized: <span className="font-mono">{inr2(maxAuthorizedPaise)}</span>
        </p>
        <p className="mt-1 font-sans text-[15px] text-ink">
          Requested transaction: <span className="font-mono">{inr2(product.price_paise)}</span>
        </p>
        <p className={`mt-1 font-sans text-[15px] ${over ? "text-poster" : "text-ink"}`}>
          {over
            ? `Over authorization: ${inr2(-remaining)}`
            : `Remaining authorization: ${inr2(remaining)}`}
        </p>
      </div>
      <div className="border-t border-ink p-4">
        <AppButton stamp disabled={busy} onClick={onAuthorize}>
          AUTHORIZE WITH BOUND →
        </AppButton>
      </div>
    </div>
  );
}

function TechnicalFrame({ skuId, name }: { skuId?: string; name: string }) {
  const src = skuId ? productImage(skuId) : null;
  return (
    <div className="relative h-full w-full bg-white">
      <span className="corner-mark tl" />
      <span className="corner-mark tr" />
      <span className="corner-mark bl" />
      <span className="corner-mark br" />
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-contain p-3" />
      ) : (
        <div className="grid h-full place-items-center font-mono text-[11px] uppercase text-mute">{name}</div>
      )}
    </div>
  );
}
