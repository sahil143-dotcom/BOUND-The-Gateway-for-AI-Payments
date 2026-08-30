import { inr2 } from "./money";
import type { CatalogProduct } from "./types";

export const COLORS = ["red", "indigo", "sand", "olive", "navy", "ivory", "charcoal", "midnight", "white", "black"];
export const MATERIALS = ["cotton", "khadi", "linen", "silk", "wool", "handloom"];
export const GARMENTS = ["shirt", "overshirt", "kurta", "saree", "tee", "hoodie", "trouser", "dress", "skirt", "jacket"];

export function understoodSignals(intent: string): string[] {
  const asked = askedAttributes(intent);
  return [asked.color, asked.material, asked.garment].filter(Boolean).map((s) => s.toUpperCase());
}

export function askedAttributes(intent: string) {
  const q = intent.toLowerCase();
  return {
    color: COLORS.find((c) => q.includes(c)) || "",
    material: MATERIALS.find((m) => q.includes(m)) || "",
    garment: GARMENTS.find((g) => q.includes(g)) || "",
  };
}

export function productHits(product: CatalogProduct, intent: string, maxPaise: number) {
  const asked = askedAttributes(intent);
  const hay = `${product.name} ${product.category}`.toLowerCase();
  const color = Boolean(asked.color && hay.includes(asked.color));
  const material = Boolean(asked.material && hay.includes(asked.material));
  const garment = Boolean(asked.garment && hay.includes(asked.garment));
  const underCap = product.price_paise <= maxPaise;
  return { asked, color, material, garment, underCap };
}

export function chooseBestProduct(
  products: CatalogProduct[],
  intent: string,
  maxPaise: number,
  exactIds?: Set<string>,
): CatalogProduct | null {
  if (!products.length) return null;
  return [...products].sort((a, b) => score(b, intent, maxPaise, exactIds) - score(a, intent, maxPaise, exactIds))[0];
}

export function agentRationale(product: CatalogProduct, intent: string, maxPaise: number): string {
  const hits = productHits(product, intent, maxPaise);
  const matched: string[] = [];
  if (hits.color) matched.push("color");
  if (hits.material) matched.push("material");
  if (hits.garment) matched.push("item type");
  const price = inr2(product.price_paise);
  const cap = inr2(maxPaise);
  const name = titleCase(product.name);

  if (matched.length && hits.underCap) {
    return `I selected the ${name} at ${price} because it matches your ${joinAnd(matched)} and ${cap} spending limit.`;
  }
  if (hits.underCap) {
    return `I selected the ${name} at ${price} because it is the best catalog match under your ${cap} spending limit.`;
  }
  return `I selected the ${name} at ${price} as the closest catalog match for this request.`;
}

function score(product: CatalogProduct, intent: string, maxPaise: number, exactIds?: Set<string>) {
  const hits = productHits(product, intent, maxPaise);
  let n = 0;
  if (exactIds?.has(product.id)) n += 8;
  if (hits.color) n += 4;
  if (hits.material) n += 4;
  if (hits.garment) n += 3;
  return n * 100_000 - product.price_paise;
}

function joinAnd(parts: string[]) {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function titleCase(name: string) {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}
