import type { Checkout, Complete, Gate, LedgerEvent } from "./types";

export type ProofRow = { label: string; value: string };

function idOf(obj: unknown): string | null {
  if (obj && typeof obj === "object" && "id" in obj && typeof (obj as { id: unknown }).id === "string") {
    return (obj as { id: string }).id;
  }
  return null;
}

export function proofRows(input: {
  complete?: Complete | null;
  checkout?: Checkout | null;
  events?: LedgerEvent[];
  traceId?: string;
}): ProofRow[] {
  const events = input.events || [];
  const last = events[events.length - 1];
  const cart =
    idOf(input.checkout?.cart_mandate) ||
    events.find((e) => e.cart_mandate_id)?.cart_mandate_id ||
    "—";
  const intent =
    idOf(input.checkout?.intent_mandate) ||
    events.find((e) => e.intent_mandate_id)?.intent_mandate_id ||
    "—";
  const decision = input.complete?.decision || last?.decision || last?.type || "—";
  const reason = input.complete?.reason || last?.reason || "—";
  const rail = input.complete ? input.complete.rail_call : Boolean(last?.rail_call);
  const order = input.complete?.order_id || last?.rzp_order_id;
  const payment = input.complete?.payment_id || last?.rzp_payment_id;
  const ts = last?.ts || "—";

  return [
    { label: "TRACE ID", value: input.traceId || input.complete?.trace_id || last?.trace_id || "—" },
    { label: "MANDATE ID", value: intent },
    { label: "CART MANDATE ID", value: cart },
    { label: "DECISION", value: String(decision) },
    { label: "REASON", value: String(reason) },
    { label: "TIMESTAMP", value: ts },
    { label: "RAIL CALL", value: rail ? "YES" : "NO" },
    { label: "RAZORPAY ORDER ID", value: order || "NOT CREATED" },
    { label: "PAYMENT ID", value: payment || "—" },
  ];
}

export function gateProof(gates: Gate[]): ProofRow[] {
  return gates.map((g) => ({
    label: g.label,
    value: g.state === "pass" ? "PASSED" : g.state === "fail" ? "BLOCKED" : g.state.toUpperCase(),
  }));
}
