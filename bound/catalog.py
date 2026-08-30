from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Sku:
    id: str
    name: str
    category: str
    price_paise: int


@dataclass(frozen=True)
class MerchantPolicy:
    id: str
    name: str
    currency: str
    max_txn_paise: int
    daily_cap_paise: int
    allowed_categories: tuple[str, ...]


class Catalog:
    def __init__(self, path: Path) -> None:
        raw = json.loads(path.read_text(encoding="utf-8"))
        m = raw["merchant"]
        self.merchant = MerchantPolicy(
            id=m["id"],
            name=m["name"],
            currency=m["currency"],
            max_txn_paise=int(m["max_txn_paise"]),
            daily_cap_paise=int(m["daily_cap_paise"]),
            allowed_categories=tuple(m["allowed_categories"]),
        )
        self._skus = {row["id"]: Sku(**row) for row in raw["skus"]}
        self._path = path

    def get(self, sku_id: str) -> Sku | None:
        return self._skus.get(sku_id)

    def all(self) -> list[Sku]:
        return list(self._skus.values())

    def search(self, query: str, max_paise: int | None = None) -> list[Sku]:
        tokens = [t for t in (query or "").strip().lower().split() if t]
        hits = []
        for sku in self._skus.values():
            hay = f"{sku.name} {sku.id} {sku.category}".lower()
            if tokens and not all(t in hay for t in tokens):
                continue
            if max_paise is not None and sku.price_paise > max_paise:
                continue
            hits.append(sku)
        return hits

    def set_price(self, sku_id: str, price_paise: int) -> None:
        """In-memory price change for PRICE_DRIFT tests. Does not write the file."""
        sku = self._skus[sku_id]
        self._skus[sku_id] = Sku(
            id=sku.id, name=sku.name, category=sku.category, price_paise=price_paise
        )

    def reload_from_disk(self) -> None:
        self.__init__(self._path)


def load_catalog(path: Path) -> Catalog:
    return Catalog(path)
