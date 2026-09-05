import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import pytest
import asyncio
from app.database import init_db, AsyncSessionLocal
from app.services.nse_fetcher import NSEFetcher, run_market_sync
from app.services.excel_exporter import generate_full_export_bundle
from app.models import Nifty50Daily, IndexDaily, FetchLog
from sqlalchemy import select

@pytest.mark.asyncio
async def test_init_database():
    await init_db()
    async with AsyncSessionLocal() as db:
        q = await db.execute(select(FetchLog).limit(1))
        assert q is not None

def test_nse_fetcher_session():
    fetcher = NSEFetcher()
    assert fetcher._refresh_cookies() is True
    holidays = fetcher.fetch_trading_holidays()
    assert isinstance(holidays, list)

def test_fetch_all_indices():
    fetcher = NSEFetcher()
    indices = fetcher.fetch_all_indices()
    assert indices is not None
    assert len(indices) > 0
    categories = {i.get("key") for i in indices}
    assert "BROAD MARKET INDICES" in categories or "SECTORAL INDICES" in categories

def test_fetch_nifty50():
    fetcher = NSEFetcher()
    stocks = fetcher.fetch_nifty50_constituents()
    assert stocks is not None
    assert len(stocks) >= 40  # Nifty 50 constituents

@pytest.mark.asyncio
async def test_market_sync_and_excel_export():
    log = await run_market_sync(source="TEST_SUITE", fetch_details=False)
    assert log.status in ("SUCCESS", "PARTIAL")
    assert log.rows_fetched > 0

    zip_path, files, export_date = await generate_full_export_bundle()
    assert os.path.exists(zip_path)
    assert len(files) >= 2
    for f in files:
        assert os.path.exists(f)
        assert os.path.getsize(f) > 0
