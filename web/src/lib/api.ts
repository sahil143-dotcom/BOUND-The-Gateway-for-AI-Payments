import type { CatalogResponse, Checkout, Complete, LedgerEvent, Metrics, ShopResponse } from "./types";

const BASE = "/bound-api";

function friendlyError(status: number): string {
  if (status === 404) return "Nothing matched that request.";
  if (status >= 500) return "BOUND did not answer.";
  return "BOUND could not complete that request.";
}

async function read<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(friendlyError(res.status));
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error("BOUND did not answer.");
  }
}

export function getMetrics() {
  return fetch(`${BASE}/metrics`).then((r) => read<Metrics>(r));
}

export function getCatalog(q: string, maxPaise: number) {
  const qs = new URLSearchParams({ q, max_paise: String(maxPaise) });
  return fetch(`${BASE}/catalog?${qs}`).then((r) => read<CatalogResponse>(r));
}

export function createCheckout(body: {
  items: { sku_id: string; quantity: number }[];
  intent?: { max_paise: number; allowed_categories: string[] };
}) {
  return fetch(`${BASE}/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => read<Checkout>(r));
}

export async function getTraces() {
  const res = await fetch(`${BASE}/traces`);
  const data = await read<{ items?: LedgerEvent[] }>(res);
  return { items: Array.isArray(data.items) ? data.items : [] };
}

export function getAudit(traceId: string) {
  return fetch(`${BASE}/audit/${encodeURIComponent(traceId)}`).then((r) =>
    read<{ trace_id: string; events: LedgerEvent[] }>(r),
  );
}

export function shop(input: {
  query: string;
  max_paise?: number;
  scenario: "happy" | "expire" | "drift";
}) {
  return fetch(`${BASE}/buyer/shop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: input.query,
      max_paise: input.max_paise ?? 180000,
      complete: true,
      scenario: input.scenario,
    }),
  }).then((r) => read<ShopResponse>(r));
}

export function completeCheckout(
  sessionId: string,
  payment: Record<string, unknown>,
  idempotencyKey: string,
) {
  return fetch(`${BASE}/checkout-sessions/${sessionId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ payment }),
  }).then((r) => read<Complete>(r));
}
