const SHOTS: Record<string, string> = {
  sku_shirt_red_cotton: "/products/sku_shirt_red_cotton.jpg",
  sku_kurta_indigo: "/products/sku_kurta_indigo.jpg",
};

export function productImage(skuId?: string | null): string | null {
  if (!skuId) return SHOTS.sku_shirt_red_cotton;
  return SHOTS[skuId] || null;
}
