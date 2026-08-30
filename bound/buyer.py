from __future__ import annotations

from bound.catalog import Catalog


def plan_purchase(catalog: Catalog, *, query: str, max_paise: int) -> dict:
    """
    Visible buyer agent: turn a constraint into a structured purchase request.
    No authorization. No rail. Optional LLM is not required.
    """
    hits = catalog.search(query, max_paise=max_paise)
    if not hits:
        return {
            "ok": False,
            "intent": {"query": query, "max_paise": max_paise},
            "reason": "No SKU matched the buyer constraint.",
            "items": [],
        }
    chosen = next((s for s in hits if "shirt" in s.name.lower()), min(hits, key=lambda s: s.price_paise))
    return {
        "ok": True,
        "intent": {
            "query": query,
            "max_paise": max_paise,
            "allowed_categories": list(catalog.merchant.allowed_categories),
        },
        "narration": (
            f"Buyer agent searched {query!r} under {max_paise} paise "
            f"and selected {chosen.name} ({chosen.id}) at {chosen.price_paise} paise."
        ),
        "items": [{"sku_id": chosen.id, "quantity": 1}],
        "sku": {
            "id": chosen.id,
            "name": chosen.name,
            "price_paise": chosen.price_paise,
            "category": chosen.category,
        },
    }
