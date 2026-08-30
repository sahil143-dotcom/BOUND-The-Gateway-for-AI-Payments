"use client";

import { useEffect, useRef, useState } from "react";
import { completeCheckout, createCheckout, getAudit, getCatalog, shop } from "@/lib/api";
import { chooseBestProduct } from "@/lib/agent";
import { parseIntent } from "@/lib/intent";
import { pad2 } from "@/lib/money";
import { emptyGates, gatesFromDecision } from "@/lib/gates";
import type { CatalogProduct, Checkout, Complete, Gate, LedgerEvent, Scenario } from "@/lib/types";
import { AppButton } from "./AppButton";
import { AuditDossier } from "./AuditDossier";
import { Authorization, type BoundaryState, type Reveal } from "./Authorization";
import { Discovery, type AgentLine } from "./Discovery";

type Stage = "discover" | "bound";

const DEFAULT_MAX_PAISE = 180000;
const CATALOG_SCAN_PAISE = 10_000_000;
const GATE_MS = 720;
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CommandCenter() {
  const [stage, setStage] = useState<Stage>("discover");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState("");
  const [maxAuthorizedPaise, setMaxAuthorizedPaise] = useState(DEFAULT_MAX_PAISE);
  const [merchant, setMerchant] = useState("Ananya Atelier");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [explore, setExplore] = useState<string[]>([]);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [log, setLog] = useState<AgentLine[]>([]);
  const searchGen = useRef(0);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [complete, setComplete] = useState<Complete | null>(null);
  const [gates, setGates] = useState<Gate[]>(emptyGates());
  const [reveal, setReveal] = useState<Reveal[]>(emptyGates().map(() => "queued"));
  const [priceCompare, setPriceCompare] = useState<{
    authorized_paise: number;
    current_paise: number;
  } | null>(null);
  const [boundary, setBoundary] = useState<BoundaryState>("idle");
  const [showVerdict, setShowVerdict] = useState(false);
  const [railStep, setRailStep] = useState(0);
  const [decided, setDecided] = useState(false);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [proofOpen, setProofOpen] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState("");

  useEffect(() => {
    getCatalog("", DEFAULT_MAX_PAISE)
      .then((catalog) => {
        setMerchant(catalog.merchant.name);
        setExplore(exploreFromCatalog(catalog.products));
      })
      .catch(() => setExplore(["Buy me a red cotton shirt under ₹1,800"]));
  }, []);

  async function runSearch(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const gen = ++searchGen.current;
    const parsed = parseIntent(text);
    const cap = parsed.maxPaise ?? DEFAULT_MAX_PAISE;
    const gap = prefersReducedMotion() ? 0 : 280;

    setSearching(true);
    setError("");
    setSelected(null);
    setProducts([]);
    setIntent(text);
    setMaxAuthorizedPaise(cap);
    setLog([]);

    async function mark(id: string, line: string, work?: () => Promise<void>) {
      if (gen !== searchGen.current) return;
      setLog((prev) => [...prev.filter((l) => l.id !== id), { id, text: line, ok: false }]);
      if (work) await work();
      else if (gap) await wait(gap);
      if (gen !== searchGen.current) return;
      setLog((prev) => prev.map((l) => (l.id === id ? { ...l, ok: true } : l)));
      if (gap) await wait(80);
    }

    try {
      await mark("intent", "UNDERSTANDING AI REQUEST");
      await mark("search", `AI SEARCHES ${parsed.label}`);
      let exactHits: CatalogProduct[] = [];
      let wideHits: CatalogProduct[] = [];
      await mark("merchants", "EVALUATING MATCHING OPTIONS", async () => {
        const exact = parsed.query
          ? await getCatalog(parsed.query, CATALOG_SCAN_PAISE)
          : await getCatalog("", CATALOG_SCAN_PAISE);
        if (gen !== searchGen.current) return;
        setMerchant(exact.merchant.name);
        exactHits = exact.products;
        if (parsed.broad) {
          const wide = await getCatalog(parsed.broad, CATALOG_SCAN_PAISE);
          if (gen !== searchGen.current) return;
          wideHits = wide.products;
        }
      });
      if (gen !== searchGen.current) return;
      const exactIds = new Set(exactHits.map((p) => p.id));
      const shown = mergeCatalog(exactHits, wideHits).slice(0, 4);
      setProducts(shown);
      await mark("found", `MATCHES FOUND ${pad2(shown.length)}`);
      const pick = chooseBestProduct(shown, text, cap, exactIds);
      if (pick) {
        await mark("choose", `AI SELECTED ${pick.name.toUpperCase()}`);
        setSelected(pick);
        await mark("ready", "TRANSACTION READY");
      }
    } catch {
      if (gen !== searchGen.current) return;
      setError("The catalog did not answer.");
      setLog((prev) => [
        ...prev.map((l) => ({ ...l, ok: true })),
        { id: "err", text: "ERROR: CATALOG DID NOT ANSWER", ok: false },
      ]);
    } finally {
      if (gen === searchGen.current) setSearching(false);
    }
  }

  async function authorize(scenario: Scenario = "happy") {
    if (!selected && scenario === "happy") return;
    setBusy(true);
    setError("");
    setEvents([]);
    setProofOpen(false);
    setDecided(false);
    setShowVerdict(false);
    setRailStep(0);
    setBoundary("idle");
    setPriceCompare(null);
    setComplete(null);
    setCheckout(null);
    setReveal(emptyGates().map(() => "queued"));
    setGates(emptyGates());
    setStage("bound");
    setStartedAt(new Date().toISOString());
    try {
      if (scenario === "happy") {
        const session = await createCheckout({
          items: [{ sku_id: selected!.id, quantity: 1 }],
          intent: { max_paise: maxAuthorizedPaise, allowed_categories: ["apparel"] },
        });
        const result = await completeCheckout(
          session.id,
          { instruments: [{ handler_id: "razorpay_test", type: "card" }] },
          session.id,
        );
        const nextGates = result.decision ? gatesFromDecision(result.decision) : emptyGates();
        setCheckout(session);
        setComplete(result);
        setGates(nextGates);
        await playGates(nextGates);
        await finish(result, session.trace_id);
      } else {
        const data = await shop({
          query: selected?.name || intent || "red cotton shirt",
          max_paise: maxAuthorizedPaise,
          scenario,
        });
        const nextGates = data.gates?.length ? data.gates : gatesFromDecision(data.complete?.decision);
        setCheckout(data.checkout || null);
        setComplete(data.complete || null);
        setPriceCompare(data.price_compare || null);
        setGates(nextGates);
        if (data.complete) {
          await playGates(nextGates);
          await finish(data.complete, data.complete.trace_id);
        }
      }
    } catch {
      setError("BOUND did not answer.");
      setStage("discover");
    } finally {
      setBusy(false);
    }
  }

  async function finish(result: Complete, trace: string) {
    getAudit(trace)
      .then((d) => setEvents(d.events))
      .catch(() => undefined);
    setShowVerdict(true);
    const approved = result.decision === "APPROVE";
    if (prefersReducedMotion()) {
      setBoundary(approved ? "crossed" : "stopped");
      setRailStep(approved ? 4 : 0);
    } else if (approved) {
      await wait(420);
      setBoundary("hit");
      await wait(400);
      setBoundary("crossed");
      for (let i = 1; i <= 4; i += 1) {
        setRailStep(i);
        await wait(340);
      }
    } else {
      await wait(360);
      setBoundary("stopped");
    }
    setDecided(true);
  }

  async function playGates(next: Gate[]) {
    if (prefersReducedMotion()) {
      setReveal(next.map((g) => (g.state === "pending" ? "queued" : (g.state as Reveal))));
      return;
    }
    const row: Reveal[] = next.map(() => "queued");
    setReveal([...row]);
    for (let i = 0; i < next.length; i += 1) {
      row[i] = "checking";
      setReveal([...row]);
      await wait(GATE_MS);
      row[i] = next[i].state === "pass" ? "pass" : next[i].state === "fail" ? "fail" : "skipped";
      setReveal([...row]);
      if (row[i] === "fail") {
        for (let j = i + 1; j < next.length; j += 1) row[j] = "skipped";
        setReveal([...row]);
        break;
      }
      await wait(220);
    }
  }

  const approved = complete?.decision === "APPROVE";
  const amount = checkout?.amount_paise || selected?.price_paise || 149900;

  if (stage === "discover") {
    return (
      <div className="h-full min-h-0">
        <Discovery
          query={query}
          onQueryChange={setQuery}
          onSearch={runSearch}
          searching={searching}
          intent={intent}
          merchant={merchant}
          products={products}
          explore={explore}
          selected={selected}
          log={log}
          maxAuthorizedPaise={maxAuthorizedPaise}
          busy={busy}
          onAuthorize={() => authorize("happy")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Authorization
          amountPaise={amount}
          product={selected?.name}
          skuId={selected?.id}
          gates={gates}
          reveal={reveal}
          boundary={boundary}
          decision={complete?.decision}
          complete={complete}
          checkout={checkout}
          priceCompare={priceCompare}
          startedAt={startedAt}
          railStep={railStep}
          showVerdict={showVerdict}
          checkMs={GATE_MS}
          maxAuthorizedPaise={maxAuthorizedPaise}
        />
      </div>

      {decided && complete ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-ink px-8 py-3">
          <AppButton onClick={() => setProofOpen((v) => !v)}>
            {proofOpen ? "Hide proof" : "View transaction proof"}
          </AppButton>
          {approved ? (
            <>
              <AppButton ghost disabled={busy} onClick={() => authorize("expire")}>
                Try expired quote
              </AppButton>
              <AppButton ghost disabled={busy} onClick={() => authorize("drift")}>
                Try price change
              </AppButton>
            </>
          ) : (
            <AppButton ghost disabled={busy} onClick={() => authorize("happy")}>
              Authorize with BOUND
            </AppButton>
          )}
          <AppButton
            ghost
            disabled={busy}
            onClick={() => {
              setStage("discover");
              setDecided(false);
              setSelected(null);
              setProducts([]);
              setLog([]);
              setIntent("");
              setQuery("");
              setMaxAuthorizedPaise(DEFAULT_MAX_PAISE);
            }}
          >
            New request
          </AppButton>
        </div>
      ) : null}

      {proofOpen && complete ? (
        <div className="shrink-0 overflow-auto border-t border-ink px-8 py-4">
          <AuditDossier
            events={events}
            traceId={complete.trace_id}
            complete={complete}
            checkout={checkout}
            gates={gates}
            product={selected?.name}
            amountPaise={amount}
          />
        </div>
      ) : null}

      {error ? <p className="px-8 py-3 text-mute">{error}</p> : null}
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeCatalog(exact: CatalogProduct[], wide: CatalogProduct[]) {
  const byId = new Map<string, CatalogProduct>();
  const exactIds = new Set(exact.map((p) => p.id));
  for (const p of [...exact, ...wide]) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => {
    const rank = (p: CatalogProduct) => (exactIds.has(p.id) ? 0 : 1);
    return rank(a) - rank(b) || a.price_paise - b.price_paise;
  });
}

function exploreFromCatalog(products: CatalogProduct[]): string[] {
  const phrases: string[] = [];
  if (products.some((p) => p.id === "sku_shirt_red_cotton")) {
    phrases.push("Buy me a red cotton shirt under ₹1,800");
  }
  for (const product of products) {
    if (product.id === "sku_shirt_red_cotton") continue;
    phrases.push(product.name);
    if (phrases.length >= 4) break;
  }
  return phrases;
}