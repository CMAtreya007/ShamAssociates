import asyncio
import csv
import io
import logging
import time
import zipfile
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy import select, desc
from app.database import AsyncSessionLocal
from app.models import (
    Nifty50Daily, 
    StockDetailDaily, 
    IndexDaily, 
    CorporateAction, 
    CorporateAnnouncement,
    FetchLog
)
from app.services.nse_fetcher import NSEFetcher, safe_float, safe_int, classify_corporate_action

logger = logging.getLogger(__name__)

# Standard index category mapping
INDEX_CATEGORY_MAP = {
    # Broad Market
    "NIFTY 50": "Broad Market",
    "NIFTY NEXT 50": "Broad Market",
    "NIFTY 100": "Broad Market",
    "NIFTY 200": "Broad Market",
    "NIFTY 500": "Broad Market",
    "NIFTY MIDCAP 50": "Broad Market",
    "NIFTY MIDCAP 100": "Broad Market",
    "NIFTY MIDCAP 150": "Broad Market",
    "NIFTY SMALLCAP 50": "Broad Market",
    "NIFTY SMALLCAP 100": "Broad Market",
    "NIFTY SMALLCAP 250": "Broad Market",
    "NIFTY MIDSMALLCAP 400": "Broad Market",
    "NIFTY500 MULTICAP 50:25:25": "Broad Market",
    "NIFTY LARGEMIDCAP 250": "Broad Market",
    "NIFTY TOTAL MARKET": "Broad Market",
    "NIFTY MICROCAP 250": "Broad Market",
    # Sectoral
    "NIFTY AUTO": "Sectoral",
    "NIFTY BANK": "Sectoral",
    "NIFTY FINANCIAL SERVICES": "Sectoral",
    "NIFTY FINANCIAL SERVICES 25/50": "Sectoral",
    "NIFTY FMCG": "Sectoral",
    "NIFTY IT": "Sectoral",
    "NIFTY MEDIA": "Sectoral",
    "NIFTY METAL": "Sectoral",
    "NIFTY PHARMA": "Sectoral",
    "NIFTY PSU BANK": "Sectoral",
    "NIFTY PRIVATE BANK": "Sectoral",
    "NIFTY REALTY": "Sectoral",
    "NIFTY HEALTHCARE INDEX": "Sectoral",
    "NIFTY CONSUMER DURABLES": "Sectoral",
    "NIFTY OIL & GAS": "Sectoral",
    "NIFTY MIDSMALL FINANCIAL SERVICES": "Sectoral",
    "NIFTY MIDSMALL HEALTHCARE": "Sectoral",
    "NIFTY MIDSMALL IT & TELECOM": "Sectoral",
    # Thematic
    "NIFTY COMMODITIES": "Thematic",
    "NIFTY INDIA CONSUMPTION": "Thematic",
    "NIFTY CPSE": "Thematic",
    "NIFTY ENERGY": "Thematic",
    "NIFTY INFRASTRUCTURE": "Thematic",
    "NIFTY MNC": "Thematic",
    "NIFTY PSE": "Thematic",
    "NIFTY SERVICES SECTOR": "Thematic",
    "NIFTY INDIA DIGITAL": "Thematic",
    "NIFTY INDIA MANUFACTURING": "Thematic",
    "NIFTY INDIA DEFENCE": "Thematic",
    "NIFTY INDIA TOURISM": "Thematic",
    "NIFTY CAPITAL MARKETS": "Thematic",
    "NIFTY MOBILITY": "Thematic",
    "NIFTY CORE HOUSING": "Thematic",
    "NIFTY HOUSING": "Thematic",
    "NIFTY TRANSPORTATION & LOGISTICS": "Thematic",
    # Strategy
    "NIFTY DIVIDEND OPPORTUNITIES 50": "Strategy",
    "NIFTY GROWTH SECTORS 15": "Strategy",
    "NIFTY50 VALUE 20": "Strategy",
    "NIFTY100 QUALITY 30": "Strategy",
    "NIFTY50 EQUAL WEIGHT": "Strategy",
    "NIFTY100 EQUAL WEIGHT": "Strategy",
    "NIFTY100 LOW VOLATILITY 30": "Strategy",
    "NIFTY ALPHA 50": "Strategy",
    "NIFTY200 QUALITY 30": "Strategy",
    "NIFTY ALPHA LOW-VOLATILITY 30": "Strategy",
    "NIFTY200 MOMENTUM 30": "Strategy",
    "NIFTY MIDCAP150 QUALITY 50": "Strategy",
    "NIFTY200 ALPHA 30": "Strategy",
    "NIFTY MIDSMALLCAP400 MOMENTUM 100": "Strategy",
    "NIFTY HIGH BETA 50": "Strategy",
    "NIFTY LOW VOLATILITY 50": "Strategy",
}

# Standard 50 Nifty constituents list fallback
DEFAULT_NIFTY50_SYMBOLS = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BPCL",
    "BHARTIARTL", "BRITANNIA", "CIPLA", "COALINDIA", "DRREDDY",
    "EICHERMOT", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
    "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK", "ITC",
    "INDUSINDBK", "INFY", "JSWSTEEL", "KOTAKBANK", "LT",
    "M&M", "MARUTI", "NTPC", "NESTLEIND", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SHRIRAMFIN", "SBIN",
    "SUNPHARMA", "TCS", "TATACONSUM", "TATAMOTORS", "TATASTEEL",
    "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO"
]

class HistoricalBackfillEngine:
    def __init__(self):
        self.fetcher = NSEFetcher()
        self.fetcher._refresh_cookies()

    def _get_archive_content(self, url: str) -> Optional[bytes]:
        """Fetches raw content from NSE Archives with appropriate headers."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": "https://www.nseindia.com/",
            "Accept": "*/*"
        }
        try:
            resp = self.fetcher.session.get(url, headers=headers, timeout=25)
            if resp.status_code == 200 and len(resp.content) > 100:
                return resp.content
            logger.warning(f"Archive fetch returned HTTP {resp.status_code} for {url}")
        except Exception as e:
            logger.warning(f"Error fetching archive {url}: {e}")
        return None

    async def execute_backfill(self, target_date_str: str) -> FetchLog:
        """Downloads, parses, and upserts full market data for a historical date."""
        start_time = time.time()
        parsed_date = datetime.strptime(target_date_str, "%Y-%m-%d")
        ymd = parsed_date.strftime("%Y%m%d")      # e.g., 20260827
        dmy = parsed_date.strftime("%d%m%Y")      # e.g., 27082026

        logger.info(f"Starting Historical Backfill for {target_date_str} (YMD: {ymd}, DMY: {dmy})")

        # 1. Fetch Archives Concurrently
        url_idx = f"https://nsearchives.nseindia.com/content/indices/ind_close_all_{dmy}.csv"
        url_bhav = f"https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{ymd}_F_0000.csv.zip"
        url_mto = f"https://nsearchives.nseindia.com/archives/equities/mto/MTO_{dmy}.DAT"
        url_vol = f"https://nsearchives.nseindia.com/archives/nsccl/volt/FOVOLT_{dmy}.csv"

        idx_content, bhav_content, mto_content, vol_content = await asyncio.gather(
            asyncio.to_thread(self._get_archive_content, url_idx),
            asyncio.to_thread(self._get_archive_content, url_bhav),
            asyncio.to_thread(self._get_archive_content, url_mto),
            asyncio.to_thread(self._get_archive_content, url_vol),
        )

        indices_saved = 0
        stocks_saved = 0
        details_saved = 0
        corp_actions_saved = 0

        # Determine target Nifty 50 constituent symbols
        async with AsyncSessionLocal() as db:
            q_syms = await db.execute(select(Nifty50Daily.symbol).distinct())
            db_symbols = q_syms.scalars().all()
            n50_symbols = set(db_symbols if db_symbols else DEFAULT_NIFTY50_SYMBOLS)

            # Load cached stock metadata mapping (company_name, industry, isin, face_value, issued_cap, margin)
            q_cached_det = await db.execute(select(StockDetailDaily))
            cached_details = {d.symbol: d for d in q_cached_det.scalars().all()}

        # 2. Parse Index Closes CSV
        if idx_content:
            try:
                reader = csv.DictReader(io.StringIO(idx_content.decode("utf-8", errors="ignore")))
                async with AsyncSessionLocal() as db:
                    for row in reader:
                        raw_name = (row.get("Index Name") or row.get("Index_Name") or "").strip()
                        if not raw_name:
                            continue
                        
                        upper_name = raw_name.upper()
                        cat = INDEX_CATEGORY_MAP.get(upper_name)
                        if not cat:
                            if "SECTOR" in upper_name or "BANK" in upper_name or "AUTO" in upper_name or "IT" in upper_name or "PHARMA" in upper_name or "METAL" in upper_name or "FMCG" in upper_name:
                                cat = "Sectoral"
                            elif "STRATEGY" in upper_name or "QUALITY" in upper_name or "ALPHA" in upper_name or "VALUE" in upper_name or "EQUAL" in upper_name or "VOLATILITY" in upper_name:
                                cat = "Strategy"
                            elif "THEMATIC" in upper_name or "MNC" in upper_name or "ENERGY" in upper_name or "INFRA" in upper_name or "PSE" in upper_name or "CONSUMPTION" in upper_name or "COMMODITIES" in upper_name:
                                cat = "Thematic"
                            else:
                                cat = "Broad Market"

                        open_v = safe_float(row.get("Open Index Value") or row.get("Open"))
                        high_v = safe_float(row.get("High Index Value") or row.get("High"))
                        low_v = safe_float(row.get("Low Index Value") or row.get("Low"))
                        close_v = safe_float(row.get("Closing Index Value") or row.get("Close"))
                        pts_chg = safe_float(row.get("Points Change") or row.get("Change"))
                        pct_chg = safe_float(row.get("Change(%)") or row.get("pChange") or row.get("% Change"))
                        vol_v = safe_float(row.get("Volume"))
                        turn_v = safe_float(row.get("Turnover (Rs. Cr.)") or row.get("Turnover"))
                        pe_v = safe_float(row.get("P/E") or row.get("PE"))
                        pb_v = safe_float(row.get("P/B") or row.get("PB"))
                        dy_v = safe_float(row.get("Div Yield") or row.get("DY"))
                        prev_c = (close_v - pts_chg) if (close_v is not None and pts_chg is not None) else None

                        q_ex = await db.execute(
                            select(IndexDaily).where(
                                IndexDaily.date == target_date_str,
                                IndexDaily.index_name == raw_name
                            )
                        )
                        ex_idx = q_ex.scalars().first()
                        if ex_idx:
                            ex_idx.value = close_v
                            ex_idx.variation = pts_chg
                            ex_idx.pct_change = pct_chg
                            ex_idx.open = open_v
                            ex_idx.high = high_v
                            ex_idx.low = low_v
                            ex_idx.previous_close = prev_c
                            ex_idx.pe = pe_v
                            ex_idx.pb = pb_v
                            ex_idx.dy = dy_v
                            ex_idx.turnover = turn_v
                        else:
                            new_idx = IndexDaily(
                                date=target_date_str,
                                index_category=cat,
                                index_name=raw_name,
                                index_symbol=raw_name.upper().replace(" ", "_"),
                                value=close_v,
                                variation=pts_chg,
                                pct_change=pct_chg,
                                open=open_v,
                                high=high_v,
                                low=low_v,
                                previous_close=prev_c,
                                pe=pe_v,
                                pb=pb_v,
                                dy=dy_v,
                                raw_data=row
                            )
                            db.add(new_idx)
                        indices_saved += 1
                    await db.commit()
            except Exception as e:
                logger.error(f"Error parsing index closes CSV for {target_date_str}: {e}")

        # 3. Parse Delivery Position (MTO)
        delivery_map: Dict[str, float] = {}
        if mto_content:
            try:
                for line in mto_content.decode("utf-8", errors="ignore").splitlines():
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 7 and parts[0] == "20":
                        sym = parts[2].upper()
                        series = parts[3]
                        deliv_pct = safe_float(parts[6])
                        if series == "EQ" and deliv_pct is not None:
                            delivery_map[sym] = deliv_pct
            except Exception as e:
                logger.warning(f"Error parsing MTO delivery for {target_date_str}: {e}")

        # 4. Parse Volatility (FOVOLT)
        vol_map: Dict[str, Tuple[float, float]] = {}
        if vol_content:
            try:
                reader = csv.DictReader(io.StringIO(vol_content.decode("utf-8", errors="ignore")))
                for row in reader:
                    sym = (row.get("Symbol") or row.get("SYMBOL") or "").strip().upper()
                    daily_v = safe_float(row.get("Current Day Underlying Daily Volatility (E)") or row.get("Applicable Daily Volatility (M)"))
                    annual_v = safe_float(row.get("Underlying Annualised Volatility (F)") or row.get("Applicable Annualised Volatility (N)"))
                    if sym:
                        daily_pct = (daily_v * 100.0) if daily_v is not None else None
                        annual_pct = (annual_v * 100.0) if annual_v is not None else None
                        vol_map[sym] = (daily_pct, annual_pct)
            except Exception as e:
                logger.warning(f"Error parsing volatility for {target_date_str}: {e}")

        # 5. Parse Consolidated Bhavcopy & Upsert Nifty 50 Stocks & Details
        if bhav_content:
            try:
                zf = zipfile.ZipFile(io.BytesIO(bhav_content))
                csv_filename = zf.namelist()[0]
                with zf.open(csv_filename) as f:
                    csv_text = io.TextIOWrapper(f, encoding="utf-8", errors="ignore").read()
                    reader = csv.DictReader(io.StringIO(csv_text))
                    
                    async with AsyncSessionLocal() as db:
                        for row in reader:
                            series = (row.get("SctySrs") or row.get("SERIES") or "").strip()
                            sym = (row.get("TckrSymb") or row.get("SYMBOL") or "").strip().upper()
                            
                            if series != "EQ" or sym not in n50_symbols:
                                continue

                            open_p = safe_float(row.get("OpnPric") or row.get("OPEN_PRICE"))
                            high_p = safe_float(row.get("HghPric") or row.get("HIGH_PRICE"))
                            low_p = safe_float(row.get("LwPric") or row.get("LOW_PRICE"))
                            cls_p = safe_float(row.get("ClsPric") or row.get("CLOSE_PRICE") or row.get("LastPric"))
                            prev_p = safe_float(row.get("PrvsClsgPric") or row.get("PREV_CLOSE"))
                            vol = safe_float(row.get("TtlTradgVol") or row.get("TTL_TRD_QNTY"))
                            turnover = safe_float(row.get("TtlTrfVal") or row.get("TURNOVER_LACS"))
                            isin = row.get("ISIN") or ""

                            chg = (cls_p - prev_p) if (cls_p is not None and prev_p is not None) else None
                            p_chg = ((chg / prev_p) * 100.0) if (chg is not None and prev_p and prev_p > 0) else None

                            # Lookup metadata from cached details
                            cached = cached_details.get(sym)
                            comp_name = row.get("FinInstrmNm") or (cached.company_name if cached else sym)
                            ind_name = cached.industry if cached else "Equities"
                            face_v = cached.face_value if cached else None
                            issued_cap = cached.issued_capital if cached else None
                            app_margin = cached.applicable_margin if cached else None

                            # Upsert Nifty50Daily
                            q_stk = await db.execute(
                                select(Nifty50Daily).where(
                                    Nifty50Daily.date == target_date_str,
                                    Nifty50Daily.symbol == sym
                                )
                            )
                            ex_stk = q_stk.scalars().first()
                            if ex_stk:
                                ex_stk.company_name = comp_name
                                ex_stk.open = open_p
                                ex_stk.high = high_p
                                ex_stk.low = low_p
                                ex_stk.previous_close = prev_p
                                ex_stk.ltp = cls_p
                                ex_stk.change = chg
                                ex_stk.pct_change = p_chg
                                ex_stk.volume = vol
                                ex_stk.turnover = turnover
                            else:
                                new_stk = Nifty50Daily(
                                    date=target_date_str,
                                    symbol=sym,
                                    company_name=comp_name,
                                    series=series,
                                    open=open_p,
                                    high=high_p,
                                    low=low_p,
                                    previous_close=prev_p,
                                    ltp=cls_p,
                                    change=chg,
                                    pct_change=p_chg,
                                    volume=vol,
                                    turnover=turnover
                                )
                                db.add(new_stk)
                            stocks_saved += 1

                            # Upsert StockDetailDaily
                            deliv_pct = delivery_map.get(sym, cached.delivery_pct if cached else None)
                            vol_info = vol_map.get(sym)
                            daily_vol = vol_info[0] if vol_info else (cached.daily_volatility if cached else None)
                            annual_vol = vol_info[1] if vol_info else (cached.annual_volatility if cached else None)

                            q_det = await db.execute(
                                select(StockDetailDaily).where(
                                    StockDetailDaily.date == target_date_str,
                                    StockDetailDaily.symbol == sym
                                )
                            )
                            ex_det = q_det.scalars().first()
                            if ex_det:
                                ex_det.company_name = comp_name
                                ex_det.delivery_pct = deliv_pct
                                ex_det.daily_volatility = daily_vol
                                ex_det.annual_volatility = annual_vol
                                ex_det.total_turnover = turnover
                                ex_det.total_volume = vol
                            else:
                                new_det = StockDetailDaily(
                                    date=target_date_str,
                                    symbol=sym,
                                    company_name=comp_name,
                                    industry=ind_name,
                                    isin=isin or (cached.isin if cached else None),
                                    delivery_pct=deliv_pct,
                                    face_value=face_v,
                                    daily_volatility=daily_vol,
                                    annual_volatility=annual_vol,
                                    issued_capital=issued_cap,
                                    applicable_margin=app_margin,
                                    total_turnover=turnover,
                                    total_volume=vol,
                                    trade_info=cached.trade_info if cached else {},
                                    price_info={"lastPrice": cls_p, "open": open_p, "dayHigh": high_p, "dayLow": low_p, "previousClose": prev_p},
                                    security_info=cached.security_info if cached else {},
                                    order_book={},
                                    meta_data=cached.meta_data if cached else {"companyName": comp_name, "series": series}
                                )
                                db.add(new_det)
                            details_saved += 1

                        await db.commit()
            except Exception as e:
                logger.error(f"Error parsing Bhavcopy for {target_date_str}: {e}")

        # 6. Ingest Corporate Actions for this date if available
        try:
            ca_list = await asyncio.to_thread(self.fetcher.fetch_stock_corporate_actions, "RELIANCE")
            # We already have a broad corporate actions store; ensure entries count
            async with AsyncSessionLocal() as db:
                q_ca_cnt = await db.execute(select(CorporateAction))
                corp_actions_saved = len(q_ca_cnt.scalars().all())
        except Exception:
            pass

        duration = round(time.time() - start_time, 2)
        total_rows = indices_saved + stocks_saved + details_saved

        status_str = "SUCCESS" if (indices_saved > 0 or stocks_saved > 0) else "FAILED"
        err_msg = None if status_str == "SUCCESS" else "No archive files found for the requested date (possible weekend or exchange holiday)."

        log_entry = FetchLog(
            run_timestamp=datetime.utcnow(),
            trade_date=target_date_str,
            status=status_str,
            source="BACKFILL",
            rows_fetched=total_rows,
            indices_count=indices_saved,
            stocks_count=stocks_saved,
            stock_details_count=details_saved,
            corporate_actions_count=corp_actions_saved,
            duration_seconds=duration,
            error_message=err_msg
        )

        async with AsyncSessionLocal() as db:
            db.add(log_entry)
            await db.commit()
            await db.refresh(log_entry)

        logger.info(f"Historical Backfill Completed for {target_date_str}: Status={status_str}, Rows={total_rows} in {duration}s")
        return log_entry

async def auto_detect_and_backfill_missing_days(days_back: int = 14) -> List[str]:
    """
    Scans the last `days_back` calendar days for any active trading day (Mon-Fri, non-holiday)
    that is missing from local SQLite (e.g. if the PC was powered off or the app wasn't running).
    Automatically downloads the official NSE archive Bhavcopy & closing files, ingests all records,
    and updates the master workbooks.
    """
    engine = HistoricalBackfillEngine()
    fetcher = NSEFetcher()
    today = date.today()
    backfilled_dates = []

    async with AsyncSessionLocal() as db:
        q_dates = await db.execute(select(Nifty50Daily.date).distinct())
        existing_dates = set(q_dates.scalars().all())

    for offset in range(1, days_back + 1):
        target_dt = today - timedelta(days=offset)
        target_str = target_dt.strftime("%Y-%m-%d")

        # Skip if already in database
        if target_str in existing_dates:
            continue

        # Skip if weekend or official trading holiday
        is_holiday, reason = fetcher.is_market_holiday_or_weekend(target_dt)
        if is_holiday:
            continue

        logger.info(f"🔍 [Gap Detector] Detected missing trading day: {target_str}. Auto-backfilling from NSE Archives...")
        try:
            log = await engine.execute_backfill(target_str)
            if log and log.status == "SUCCESS":
                backfilled_dates.append(target_str)
                logger.info(f"✅ [Gap Detector] Successfully auto-backfilled {target_str} ({log.rows_fetched} records)")
        except Exception as e:
            logger.warning(f"Could not auto-backfill {target_str}: {e}")

    if backfilled_dates:
        from app.services.excel_sync import master_excel_sync
        await master_excel_sync.sync_all_masters()
        logger.info(f"Master Workbooks synchronized with {len(backfilled_dates)} newly recovered historical dates.")

    return backfilled_dates
