export type GateState = "pending" | "pass" | "fail" | "skipped";

export type Gate = {
  id: string;
  label: string;
  state: GateState;
};

export type BuyerPlan = {
  ok: boolean;
  narration?: string;
  reason?: string;
  intent?: { query: string; max_paise: number; allowed_categories?: string[] };
  items?: { sku_id: string; quantity: number }[];
  sku?: { id: string; name: string; price_paise: number; category: string };
};

export type Checkout = {
  id: string;
  status: string;
  trace_id: string;
  amount_paise: number;
  currency: string;
  expires_at?: string;
  cart_mandate?: Record<string, unknown>;
  intent_mandate?: Record<string, unknown>;
};

export type Complete = {
  id: string;
  status: string;
  trace_id: string;
  decision: string;
  reason?: string;
  rail_call: boolean;
  order_id?: string | null;
  payment_id?: string | null;
  receipt?: Record<string, unknown>;
  recovery?: string;
};

export type ShopResponse = {
  ok: boolean;
  buyer: BuyerPlan;
  checkout?: Checkout;
  complete?: Complete | null;
  gates?: Gate[];
  price_compare?: { authorized_paise: number; current_paise: number } | null;
  merchant?: { id: string; name: string; currency: string };
  rail?: string;
  rail_name?: string;
  rail_label?: string;
};

export type Metrics = {
  requests: number;
  approved: number;
  blocked: number;
  captured_paise: number;
  blocked_paise: number;
  deny_reasons: { code: string; count: number; paise: number }[];
  rail: string;
  rail_name: string;
  rail_label: string;
  merchant: { id: string; name: string };
};

export type LedgerEvent = {
  id: number;
  ts: string;
  trace_id: string;
  type: string;
  decision?: string | null;
  reason?: string | null;
  cart_mandate_id?: string | null;
  intent_mandate_id?: string | null;
  rzp_order_id?: string | null;
  rzp_payment_id?: string | null;
  rzp_event_id?: string | null;
  amount_paise?: number | null;
  rail_call?: number | boolean | null;
  payload_json?: string;
};

export type Scenario = "happy" | "expire" | "drift";

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  price_paise: number;
};

export type CatalogResponse = {
  merchant: { id: string; name: string; currency: string };
  products: CatalogProduct[];
};
