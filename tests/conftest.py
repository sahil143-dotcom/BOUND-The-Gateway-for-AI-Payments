from pathlib import Path

import pytest

from bound.catalog import load_catalog
from bound.config import ROOT, Settings
from bound.handler import BoundService
from bound.ledger import Ledger
from bound.razorpay_rail import MockRazorpayRail, SpyRail


@pytest.fixture
def catalog():
    return load_catalog(ROOT / "data" / "catalog.json")


@pytest.fixture
def service(tmp_path: Path, catalog):
    settings = Settings(
        PAYMENT_RAIL="mock",
        BOUND_DB=tmp_path / "test.db",
        CART_TTL_SECONDS=90,
    )
    rail = SpyRail(MockRazorpayRail())
    svc = BoundService(settings, catalog, Ledger(settings.bound_db), rail)
    svc.spy = rail
    return svc
