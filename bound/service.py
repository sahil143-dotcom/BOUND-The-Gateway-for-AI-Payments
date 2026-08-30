from __future__ import annotations

from bound.catalog import load_catalog
from bound.config import Settings, get_settings
from bound.handler import BoundService
from bound.ledger import Ledger
from bound.razorpay_rail import build_rail


def build_service(settings: Settings | None = None, rail=None) -> BoundService:
    cfg = settings or get_settings()
    catalog = load_catalog(cfg.catalog_path)
    ledger = Ledger(cfg.bound_db)
    chosen = rail if rail is not None else build_rail(cfg)
    return BoundService(cfg, catalog, ledger, chosen)
