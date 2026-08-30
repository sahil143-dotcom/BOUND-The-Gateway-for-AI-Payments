const STOP = new Set([
  "a",
  "an",
  "and",
  "around",
  "at",
  "below",
  "budget",
  "buy",
  "can",
  "could",
  "do",
  "find",
  "for",
  "from",
  "get",
  "i",
  "in",
  "inr",
  "less",
  "like",
  "looking",
  "max",
  "maximum",
  "me",
  "my",
  "need",
  "of",
  "or",
  "please",
  "price",
  "purchase",
  "rs",
  "rupee",
  "rupees",
  "show",
  "some",
  "something",
  "than",
  "the",
  "this",
  "to",
  "under",
  "upto",
  "want",
  "with",
  "would",
]);

const GARMENTS = [
  "shirt",
  "overshirt",
  "kurta",
  "saree",
  "tee",
  "hoodie",
  "trouser",
  "trousers",
  "dress",
  "skirt",
  "jacket",
  "dupatta",
  "stole",
  "scarf",
  "blouse",
  "shorts",
  "vest",
  "palazzo",
  "coat",
  "trench",
  "bandi",
];

export type ParsedIntent = {
  query: string;
  label: string;
  broad: string;
  maxPaise: number | null;
  request: string;
};

export function parseIntent(raw: string): ParsedIntent {
  const text = raw.trim();
  const maxPaise = extractPricePaise(text);
  const tokens = tokenize(text);
  const query = tokens.join(" ");
  const garment = tokens.find((t) => GARMENTS.includes(t));
  const broad = garment || tokens[tokens.length - 1] || "";

  return {
    query,
    label: (query || "CATALOG").toUpperCase(),
    broad: broad !== query ? broad : "",
    maxPaise,
    request: productRequest(text),
  };
}

/** Human product ask with spend language removed — BOUND owns the amount. */
export function productRequest(raw: string): string {
  const cleaned = raw
    .replace(/under\s+(?:₹|rs\.?\s*)?[\d,]+(?:\.\d+)?/gi, "")
    .replace(/(?:below|max(?:imum)?|less than|up to|upto)\s+(?:₹|rs\.?\s*)?[\d,]+(?:\.\d+)?/gi, "")
    .replace(/(?:₹|rs\.?\s*)[\d,]+(?:\.\d+)?/gi, "")
    .replace(/\b(?:rs|inr|rupees?)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+[.,;]+/g, ".")
    .replace(/[.,;]+\s*$/g, "")
    .trim();
  return cleaned || raw.trim();
}

export function extractPricePaise(text: string): number | null {
  const cleaned = text.replace(/,/g, "");
  const patterns = [
    /(?:₹|rs\.?\s*)(\d+(?:\.\d+)?)/i,
    /(?:under|below|max(?:imum)?|less than|up to|upto)\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:rs|inr|rupees?)\b/i,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (!m) continue;
    const rupees = Number(m[1]);
    if (rupees > 0 && rupees < 10_000_000) return Math.round(rupees * 100);
  }
  return null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/₹/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
}
