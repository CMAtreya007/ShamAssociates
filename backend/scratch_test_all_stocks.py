import asyncio
import time
from app.database import init_db, AsyncSessionLocal
from app.services.nse_symbols_master import _ALL_EQUITIES_LIST
from app.services.nse_fetcher import NSEFetcher, safe_float

async def test_all_stocks_generation():
    start = time.time()
    fetcher = NSEFetcher()
    live_quotes = fetcher.fetch_all_live_market_quotes()
    print(f"Loaded {len(_ALL_EQUITIES_LIST)} master equities and {len(live_quotes)} live index quotes in {time.time() - start:.2f}s")

    populated_count = 0
    sample_stocks = []
    for item in _ALL_EQUITIES_LIST:
        sym = item["symbol"]
        live_q = live_quotes.get(sym)
        ltp = live_q.get("lastPrice") if live_q else None
        if ltp is not None:
            populated_count += 1
        if sym in ["RELIANCE", "TCS", "TATACONSUM", "ZOMATO", "SWIGGY", "20MICRONS"]:
            sample_stocks.append({
                "symbol": sym,
                "name": item.get("company_name"),
                "ltp": ltp,
                "change": live_q.get("change") if live_q else None,
                "pct_change": live_q.get("pChange") if live_q else None
            })

    print(f"Populated live quotes for {populated_count} active traded stocks.")
    print("Sample stocks:")
    for s in sample_stocks:
        print(s)

if __name__ == "__main__":
    asyncio.run(test_all_stocks_generation())
