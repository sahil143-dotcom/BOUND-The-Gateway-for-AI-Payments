export function decisionBanner(code: string): string {
  return code === "APPROVE" ? "APPROVED." : "BLOCKED.";
}

export function decisionPolicy(code: string): string {
  return code === "APPROVE" ? "POLICY / APPROVED" : `POLICY / ${code}`;
}

export function decisionHuman(code: string): string {
  if (code === "APPROVE") return "All six gates passed. The transaction may cross into Razorpay.";
  if (code === "DAILY_CAP") return "The merchant daily limit has been reached.";
  if (code === "QUOTE_EXPIRED") return "The locked quote expired before authorization finished.";
  if (code === "PRICE_DRIFT") return "The catalog price no longer matches the locked cart.";
  if (code === "TXN_CAP") return "This amount is above the merchant per-transaction cap.";
  if (code === "IDEMPOTENCY_CONFLICT") return "This request key was already used for a different body.";
  if (code === "MANDATE_CEILING") return "The AI request is above the maximum BOUND authorized.";
  if (code === "CATEGORY_BLOCKED") return "This category is outside what BOUND authorized.";
  if (code === "CART_INVALID") return "The CartMandate is no longer binding.";
  return "Authorization failed. Razorpay was not called.";
}

export const GATE_NAME: Record<string, string> = {
  cart: "CART",
  quote: "QUOTE",
  price: "PRICE",
  intent: "INTENT",
  limits: "LIMITS",
  idempotency: "IDEMPOTENCY",
};

export const FAIL_GATE_NAME: Record<string, string> = {
  DAILY_CAP: "DAILY CAP",
  QUOTE_EXPIRED: "QUOTE",
  PRICE_DRIFT: "PRICE",
  TXN_CAP: "LIMIT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY",
  MANDATE_CEILING: "INTENT",
  CATEGORY_BLOCKED: "INTENT",
  CART_INVALID: "CART",
};

export function railStatus(railName: string): string {
  return railName === "Mock" ? "RAIL / MOCK" : "RAZORPAY / TEST";
}
