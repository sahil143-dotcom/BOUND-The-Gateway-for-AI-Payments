import type { Gate } from "./types";

/** Display map of bound.gates.GATES. Does not authorize. */
const POLICY_GATES: { id: string; label: string; codes: string[] }[] = [
  { id: "cart", label: "CartMandate valid", codes: ["CART_INVALID"] },
  { id: "quote", label: "Quote not expired", codes: ["QUOTE_EXPIRED"] },
  { id: "price", label: "Price matches current catalog", codes: ["PRICE_DRIFT"] },
  { id: "intent", label: "Intent authorization valid", codes: ["MANDATE_CEILING", "CATEGORY_BLOCKED"] },
  { id: "limits", label: "Merchant spending limits valid", codes: ["TXN_CAP", "DAILY_CAP"] },
  { id: "idempotency", label: "Idempotency valid", codes: ["IDEMPOTENCY_CONFLICT"] },
];

export function emptyGates(): Gate[] {
  return POLICY_GATES.map((g) => ({ id: g.id, label: g.label, state: "pending" }));
}

export function gatesFromDecision(decision?: string | null): Gate[] {
  if (!decision) return emptyGates();
  if (decision === "APPROVE") {
    return POLICY_GATES.map((g) => ({ id: g.id, label: g.label, state: "pass" }));
  }
  const out: Gate[] = [];
  let failed = false;
  for (const g of POLICY_GATES) {
    if (failed) out.push({ id: g.id, label: g.label, state: "skipped" });
    else if (g.codes.includes(decision)) {
      out.push({ id: g.id, label: g.label, state: "fail" });
      failed = true;
    } else out.push({ id: g.id, label: g.label, state: "pass" });
  }
  return out;
}
