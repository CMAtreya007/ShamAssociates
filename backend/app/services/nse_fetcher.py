import time
import json
import logging
import asyncio
import urllib.parse
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Tuple
import pytz

from curl_cffi import requests
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Nifty50Daily, 
    StockDetailDaily, 
    IndexDaily, 
    IndexConstituents, 
    CorporateAction, 
    CorporateAnnouncement, 
    FetchLog
)
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

# Global lock to avoid overlapping sync runs
sync_lock = asyncio.Lock()
is_syncing_flag = False

def classify_corporate_action(subject: str, purpose: str = "") -> Tuple[str, int]:
    """Classifies corporate actions and assigns priority weights (1=Critical to 4=Standard)."""
    text = f"{subject} {purpose}".lower()
    if any(k in text for k in ["split", "sub-division", "sub division"]):
        return "SPLIT", 1
    if "bonus" in text:
        return "BONUS", 1
    if any(k in text for k in ["merger", "amalgamation", "scheme of arrangement"]):
        return "MERGER", 1
    if any(k in text for k in ["demerger", "spin-off", "spinoff"]):
        return "DEMERGER", 1
    if any(k in text for k in ["buy back", "buyback", "buy-back"]):
        return "BUYBACK", 1
    if "rights" in text:
        return "RIGHTS", 1
    if "dividend" in text or "interim" in text:
        return "DIVIDEND", 2
    if any(k in text for k in ["financial results", "quarterly", "audited results", "unaudited results", "accounts"]):
        return "RESULTS", 3
    if any(k in text for k in ["board meeting", "meeting of board"]):
        return "BOARD_MEETING", 3
    if "agm" in text or "annual general meeting" in text:
        return "AGM", 4
    if "egm" in text or "extra-ordinary general meeting" in text or "extraordinary general meeting" in text:
        return "EGM", 4
    return "OTHER", 4

class NSEFetcher:
    """Handles session-managed communication with official NSE endpoints."""

    BASE_URL = "https://www.nseindia.com"

    def __init__(self):
        self.session = requests.Session(impersonate="chrome131")
        self.last_cookie_refresh = 0
        self.cookie_lifetime = 180  # refresh cookies every 3 minutes

    def _refresh_cookies(self) -> bool:
        """Refreshes NSE session cookies by visiting landing pages with realistic TLS fingerprints."""
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1"
            }
            # Initial home page hit
            resp = self.session.get(self.BASE_URL, headers=headers, timeout=15)
            if resp.status_code != 200:
                logger.warning(f"Homepage warm-up returned status {resp.status_code}")

            # Second landing page to establish full session state
            self.session.get(f"{self.BASE_URL}/market-data/live-equity-market", headers=headers, timeout=15)
            self.session.get(f"{self.BASE_URL}/companies-listing/corporate-filings-actions", headers=headers, timeout=15)
            self.last_cookie_refresh = time.time()
            return True
        except Exception as e:
            logger.error(f"Error warming up NSE session cookies: {e}")
            return False

    def _ensure_session(self):
        """Ensures cookies are fresh before executing an API call."""
        if time.time() - self.last_cookie_refresh > self.cookie_lifetime or not self.session.cookies:
            self._refresh_cookies()

    def _get_json(self, url: str, referer: Optional[str] = None, retries: int = 3) -> Optional[Dict[str, Any]]:
        """Performs GET request with exponential backoff and automatic cookie rotation."""
        self._ensure_session()

        ref = referer or f"{self.BASE_URL}/market-data/live-equity-market"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": ref,
            "X-Requested-With": "XMLHttpRequest",
            "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin"
        }

        for attempt in range(retries):
            try:
                resp = self.session.get(url, headers=headers, timeout=15)
                if resp.status_code == 200:
                    try:
                        return resp.json()
                    except json.JSONDecodeError:
                        logger.warning(f"Non-JSON response from {url}")
                        return None
                elif resp.status_code in (401, 403, 429):
                    logger.warning(f"Rate limited or unauthorized on {url} (HTTP {resp.status_code}). Rotating session...")
                    self._refresh_cookies()
                    time.sleep(1.0 * (attempt + 1))
                else:
                    logger.warning(f"HTTP {resp.status_code} from {url}")
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1}/{retries} failed for {url}: {e}")
                time.sleep(0.8 * (attempt + 1))

        return None

    def fetch_trading_holidays(self) -> List[str]:
        """Fetches official NSE trading holidays for equities (CM)."""
        url = f"{self.BASE_URL}/api/holiday-master?type=trading"
        data = self._get_json(url)
        holidays = []
        if data and isinstance(data, dict):
            cm_holidays = data.get("CM", [])
            for h in cm_holidays:
                raw_date = h.get("tradingDate")
                if raw_date:
                    try:
                        parsed = datetime.strptime(raw_date.strip(), "%d-%b-%Y").strftime("%Y-%m-%d")
                        holidays.append(parsed)
                    except Exception:
                        pass
        return holidays

    def is_market_holiday_or_weekend(self, check_date: Optional[date] = None) -> Tuple[bool, str]:
        """Checks if a given date is a weekend or NSE trading holiday."""
        if check_date is None:
            check_date = date.today()

        # Check weekend (5 = Saturday, 6 = Sunday)
        if check_date.weekday() in (5, 6):
            return True, f"Weekend ({check_date.strftime('%A')})"

        # Check holiday
        try:
            holidays = self.fetch_trading_holidays()
            date_str = check_date.strftime("%Y-%m-%d")
            if date_str in holidays:
                return True, f"NSE Trading Holiday on {date_str}"
        except Exception as e:
            logger.warning(f"Could not verify holiday calendar: {e}")

        return False, "Trading Day"

    def is_market_open(self) -> Tuple[bool, str]:
        """
        Determines if Indian Stock Market (NSE) is currently open:
        - Open: Mon-Fri between 09:15 and 15:30 IST (excluding trading holidays)
        - Closed: Weekends, Holidays, Pre-Market (< 09:15), Post-Market (> 15:30)
        """
        ist_tz = pytz.timezone("Asia/Kolkata")
        now_ist = datetime.now(ist_tz)
        
        # Check weekend
        if now_ist.weekday() >= 5:
            return False, f"Weekend ({now_ist.strftime('%A')})"
        
        # Check trading holiday
        is_holiday, reason = self.is_market_holiday_or_weekend(now_ist.date())
        if is_holiday:
            return False, reason
        
        # Market hours: 09:15 - 15:30 IST
        market_open_time = now_ist.replace(hour=9, minute=15, second=0, microsecond=0)
        market_close_time = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)
        
        if market_open_time <= now_ist <= market_close_time:
            return True, "Market Open (09:15 - 15:30 IST)"
        elif now_ist < market_open_time:
            return False, "Pre-Market (Opens at 09:15 IST)"
        else:
            return False, "Post-Market (Closed at 15:30 IST)"

    def fetch_all_indices(self) -> Optional[List[Dict[str, Any]]]:
        """Fetches all indices (Broad, Sectoral, Thematic, Strategy)."""
        url = f"{self.BASE_URL}/api/allIndices"
        data = self._get_json(url)
        if data and isinstance(data, dict) and "data" in data:
            return data["data"]
        return None

    def fetch_nifty50_constituents(self) -> Optional[List[Dict[str, Any]]]:
        """Fetches all 50 constituent stocks of Nifty 50 with real-time snapshot metrics."""
        url = f"{self.BASE_URL}/api/NextApi/apiClient/marketWatchApi?functionName=getIndicesData&symbol=NIFTY%2050"
        data = self._get_json(url)
        if data and isinstance(data, dict) and "data" in data:
            raw_data = data["data"]
            items_list = []
            if isinstance(raw_data, list):
                items_list = raw_data
            elif isinstance(raw_data, dict) and "data" in raw_data and isinstance(raw_data["data"], list):
                items_list = raw_data["data"]

            stocks = [item for item in items_list if item.get("priority") != 1 and item.get("symbol") != "NIFTY 50"]
            return stocks
        return None

    def fetch_stock_details(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetches deep trade info, price info, security info for a single stock."""
        encoded_sym = urllib.parse.quote(symbol)
        url = f"{self.BASE_URL}/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol={encoded_sym}"
        referer = f"{self.BASE_URL}/get-quotes/equity?symbol={encoded_sym}"
        data = self._get_json(url, referer=referer, retries=2)
        if data and isinstance(data, dict) and "equityResponse" in data:
            eq_list = data.get("equityResponse", [])
            if eq_list and isinstance(eq_list, list):
                return eq_list[0]
        return None

    def fetch_market_corporate_actions(self) -> List[Dict[str, Any]]:
        """Fetches all equity market corporate actions (Dividends, Splits, Bonus, etc.)."""
        url = f"{self.BASE_URL}/api/corporates-corporateActions?index=equities"
        referer = f"{self.BASE_URL}/companies-listing/corporate-filings-actions"
        data = self._get_json(url, referer=referer)
        if data and isinstance(data, list):
            return data
        elif data and isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            return data["data"]
        return []

    def fetch_event_calendar(self) -> List[Dict[str, Any]]:
        """Fetches Board Meetings and Financial Results Calendar."""
        url = f"{self.BASE_URL}/api/event-calendar?index=equities"
        referer = f"{self.BASE_URL}/companies-listing/corporate-filings-event-calendar"
        data = self._get_json(url, referer=referer)
        if data and isinstance(data, list):
            return data
        elif data and isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            return data["data"]
        return []

    def fetch_corporate_announcements(self) -> List[Dict[str, Any]]:
        """Fetches live corporate announcements and regulatory filings."""
        url = f"{self.BASE_URL}/api/corporate-announcements?index=equities"
        referer = f"{self.BASE_URL}/companies-listing/corporate-filings-announcements"
        data = self._get_json(url, referer=referer)
        if data and isinstance(data, list):
            return data
        elif data and isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            return data["data"]
        return []

    def fetch_stock_corporate_actions(self, symbol: str) -> List[Dict[str, Any]]:
        """Fetches historical & upcoming corporate actions for an individual stock."""
        encoded_sym = urllib.parse.quote(symbol)
        url = f"{self.BASE_URL}/api/corporates-corporateActions?index=equities&symbol={encoded_sym}"
        referer = f"{self.BASE_URL}/get-quotes/equity?symbol={encoded_sym}"
        data = self._get_json(url, referer=referer)
        if data and isinstance(data, list):
            return data
        elif data and isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            return data["data"]
        return []

    def fetch_stock_event_calendar(self, symbol: str) -> List[Dict[str, Any]]:
        """Fetches historical & upcoming Board Meetings for an individual stock."""
        encoded_sym = urllib.parse.quote(symbol)
        url = f"{self.BASE_URL}/api/event-calendar?index=equities&symbol={encoded_sym}"
        referer = f"{self.BASE_URL}/get-quotes/equity?symbol={encoded_sym}"
        data = self._get_json(url, referer=referer)
        if data and isinstance(data, list):
            return data
        elif data and isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            return data["data"]
        return []

def safe_float(val: Any) -> Optional[float]:
    if val is None or val == "" or val == "-" or val == "NaN":
        return None
    try:
        if isinstance(val, str):
            val = val.replace(",", "").strip()
        return float(val)
    except (ValueError, TypeError):
        return None

def safe_int(val: Any) -> Optional[int]:
    if val is None or val == "" or val == "-":
        return None
    try:
        if isinstance(val, str):
            val = val.replace(",", "").strip()
        return int(float(val))
    except (ValueError, TypeError):
        return None

async def run_market_sync(source: str = "MANUAL", fetch_details: bool = True, target_date: Optional[str] = None) -> FetchLog:
    """Orchestrates full daily NSE data pull, normalization, and persistence in SQLite."""
    global is_syncing_flag

    async with sync_lock:
        is_syncing_flag = True
        start_time = time.time()
        today_str = target_date or date.today().strftime("%Y-%m-%d")

        fetcher = NSEFetcher()
        fetcher._refresh_cookies()

        log_entry = FetchLog(
            run_timestamp=datetime.utcnow(),
            trade_date=today_str,
            status="IN_PROGRESS",
            source=source,
            rows_fetched=0,
            indices_count=0,
            stocks_count=0,
            stock_details_count=0,
            corporate_actions_count=0,
        )

        async with AsyncSessionLocal() as db:
            db.add(log_entry)
            await db.commit()
            await db.refresh(log_entry)
            log_id = log_entry.id

        try:
            logger.info(f"Starting NSE sync for trade date {today_str} (Source: {source})")
            
            # 1. Fetch All Indices
            indices_data = fetcher.fetch_all_indices()
            indices_saved = 0
            category_mapping = {
                "BROAD MARKET INDICES": "Broad Market",
                "SECTORAL INDICES": "Sectoral",
                "THEMATIC INDICES": "Thematic",
                "STRATEGY INDICES": "Strategy",
                "INDICES ELIGIBLE IN DERIVATIVES": "Derivatives",
                "FIXED INCOME INDICES": "Fixed Income"
            }

            async with AsyncSessionLocal() as db:
                if indices_data:
                    for item in indices_data:
                        raw_cat = item.get("key", "Other")
                        mapped_cat = category_mapping.get(raw_cat, raw_cat)
                        index_name = item.get("index") or item.get("indexSymbol")
                        if not index_name:
                            continue

                        # Upsert index daily record
                        q = await db.execute(
                            select(IndexDaily).where(
                                IndexDaily.date == today_str,
                                IndexDaily.index_name == index_name
                            )
                        )
                        existing = q.scalars().first()

                        val = safe_float(item.get("last"))
                        var = safe_float(item.get("variation"))
                        pct = safe_float(item.get("percentChange"))
                        opn = safe_float(item.get("open"))
                        hgh = safe_float(item.get("high"))
                        low = safe_float(item.get("low"))
                        prev = safe_float(item.get("previousClose"))
                        yr_high = safe_float(item.get("yearHigh"))
                        yr_low = safe_float(item.get("yearLow"))
                        pe = safe_float(item.get("pe"))
                        pb = safe_float(item.get("pb"))
                        dy = safe_float(item.get("dy"))
                        adv = safe_int(item.get("advances"))
                        dec = safe_int(item.get("declines"))
                        unch = safe_int(item.get("unchanged"))
                        p30d = safe_float(item.get("perChange30d"))
                        p365d = safe_float(item.get("perChange365d"))
                        ow_val = safe_float(item.get("oneWeekAgoVal"))
                        om_val = safe_float(item.get("oneMonthAgoVal"))
                        oy_val = safe_float(item.get("oneYearAgoVal"))

                        if existing:
                            existing.value = val
                            existing.variation = var
                            existing.pct_change = pct
                            existing.open = opn
                            existing.high = hgh
                            existing.low = low
                            existing.previous_close = prev
                            existing.year_high = yr_high
                            existing.year_low = yr_low
                            existing.pe = pe
                            existing.pb = pb
                            existing.dy = dy
                            existing.advances = adv
                            existing.declines = dec
                            existing.unchanged = unch
                            existing.per_change_30d = p30d
                            existing.per_change_365d = p365d
                            existing.one_week_ago_val = ow_val
                            existing.one_month_ago_val = om_val
                            existing.one_year_ago_val = oy_val
                            existing.raw_data = item
                        else:
                            new_idx = IndexDaily(
                                date=today_str,
                                index_category=mapped_cat,
                                index_name=index_name,
                                index_symbol=item.get("indexSymbol"),
                                value=val,
                                variation=var,
                                pct_change=pct,
                                open=opn,
                                high=hgh,
                                low=low,
                                previous_close=prev,
                                year_high=yr_high,
                                year_low=yr_low,
                                pe=pe,
                                pb=pb,
                                dy=dy,
                                advances=adv,
                                declines=dec,
                                unchanged=unch,
                                per_change_30d=p30d,
                                per_change_365d=p365d,
                                one_week_ago_val=ow_val,
                                one_month_ago_val=om_val,
                                one_year_ago_val=oy_val,
                                raw_data=item
                            )
                            db.add(new_idx)
                        indices_saved += 1
                    await db.commit()

            # 2. Fetch Nifty 50 Constituents
            stocks_data = fetcher.fetch_nifty50_constituents()
            stocks_saved = 0
            symbols_list = []

            async with AsyncSessionLocal() as db:
                if stocks_data:
                    for item in stocks_data:
                        symbol = item.get("symbol")
                        if not symbol:
                            continue
                        symbols_list.append(symbol)

                        q = await db.execute(
                            select(Nifty50Daily).where(
                                Nifty50Daily.date == today_str,
                                Nifty50Daily.symbol == symbol
                            )
                        )
                        existing_stock = q.scalars().first()

                        c_name = item.get("companyName")
                        series = item.get("series", "EQ")
                        open_val = safe_float(item.get("open"))
                        high_val = safe_float(item.get("dayHigh"))
                        low_val = safe_float(item.get("dayLow"))
                        prev_close = safe_float(item.get("previousClose"))
                        ltp = safe_float(item.get("lastPrice"))
                        change = safe_float(item.get("change"))
                        pct_change = safe_float(item.get("pChange"))
                        vol = safe_float(item.get("totalTradedVolume"))
                        turnover = safe_float(item.get("totalTradedValue"))
                        yr_high = safe_float(item.get("yearHigh"))
                        yr_low = safe_float(item.get("yearLow"))
                        p30d = safe_float(item.get("perChange30d"))
                        p365d = safe_float(item.get("perChange365d"))
                        near_wkh = safe_float(item.get("nearWKH"))
                        near_wkl = safe_float(item.get("nearWKL"))
                        ffmc = safe_float(item.get("ffmc"))
                        last_upd = item.get("lastUpdateTime")

                        if existing_stock:
                            existing_stock.company_name = c_name
                            existing_stock.series = series
                            existing_stock.open = open_val
                            existing_stock.high = high_val
                            existing_stock.low = low_val
                            existing_stock.previous_close = prev_close
                            existing_stock.ltp = ltp
                            existing_stock.change = change
                            existing_stock.pct_change = pct_change
                            existing_stock.volume = vol
                            existing_stock.turnover = turnover
                            existing_stock.year_high = yr_high
                            existing_stock.year_low = yr_low
                            existing_stock.per_change_30d = p30d
                            existing_stock.per_change_365d = p365d
                            existing_stock.near_wkh = near_wkh
                            existing_stock.near_wkl = near_wkl
                            existing_stock.ffmc = ffmc
                            existing_stock.last_update_time = last_upd
                        else:
                            new_stock = Nifty50Daily(
                                date=today_str,
                                symbol=symbol,
                                company_name=c_name,
                                series=series,
                                open=open_val,
                                high=high_val,
                                low=low_val,
                                previous_close=prev_close,
                                ltp=ltp,
                                change=change,
                                pct_change=pct_change,
                                volume=vol,
                                turnover=turnover,
                                year_high=yr_high,
                                year_low=yr_low,
                                per_change_30d=p30d,
                                per_change_365d=p365d,
                                near_wkh=near_wkh,
                                near_wkl=near_wkl,
                                ffmc=ffmc,
                                last_update_time=last_upd
                            )
                            db.add(new_stock)
                        stocks_saved += 1
                    await db.commit()

            # 3. Deep Ingestion of Secondary Metrics for Nifty 50 Constituents
            details_saved = 0
            if fetch_details and symbols_list:
                semaphore = asyncio.Semaphore(5)

                async def fetch_and_save_detail(sym: str):
                    nonlocal details_saved
                    async with semaphore:
                        try:
                            detail_json = await asyncio.to_thread(fetcher.fetch_stock_details, sym)
                            if detail_json:
                                t_info = detail_json.get("tradeInfo") or {}
                                p_info = detail_json.get("priceInfo") or {}
                                s_info = detail_json.get("secInfo") or {}
                                o_book = detail_json.get("orderBook") or {}
                                m_data = detail_json.get("metaData") or {}

                                c_name = m_data.get("companyName")
                                industry_name = s_info.get("basicIndustry") or m_data.get("industry")
                                isin_val = m_data.get("isinCode") or s_info.get("isin") or m_data.get("isin")
                                deliv_pct_val = safe_float(t_info.get("deliveryToTradedQuantity") or s_info.get("deliveryTotradedQuantity"))
                                face_val = safe_float(t_info.get("faceValue") or s_info.get("faceValue"))
                                daily_vol = safe_float(p_info.get("cmDailyVolatility") or p_info.get("dailyVolatility"))
                                annual_vol = safe_float(p_info.get("cmAnnualVolatility") or p_info.get("annualisedVolatility"))
                                issued_cap = safe_float(s_info.get("issuedSize") or t_info.get("issuedSize"))
                                margin_val = safe_float(t_info.get("applicableMargin") or p_info.get("applicableMargin"))
                                impact_val = safe_float(t_info.get("impactCost"))
                                ffmc_val = safe_float(t_info.get("ffmc"))
                                turnover_val = safe_float(t_info.get("totalTradedValue"))
                                volume_val = safe_float(t_info.get("totalTradedVolume"))

                                async with AsyncSessionLocal() as db:
                                    q = await db.execute(
                                        select(StockDetailDaily).where(
                                            StockDetailDaily.date == today_str,
                                            StockDetailDaily.symbol == sym
                                        )
                                    )
                                    existing_detail = q.scalars().first()

                                    if existing_detail:
                                        if c_name: existing_detail.company_name = c_name
                                        if industry_name: existing_detail.industry = industry_name
                                        if isin_val: existing_detail.isin = isin_val
                                        if deliv_pct_val is not None: existing_detail.delivery_pct = deliv_pct_val
                                        if face_val is not None: existing_detail.face_value = face_val
                                        if daily_vol is not None: existing_detail.daily_volatility = daily_vol
                                        if annual_vol is not None: existing_detail.annual_volatility = annual_vol
                                        if issued_cap is not None: existing_detail.issued_capital = issued_cap
                                        if margin_val is not None: existing_detail.applicable_margin = margin_val
                                        if impact_val is not None: existing_detail.impact_cost = impact_val
                                        if ffmc_val is not None: existing_detail.free_float_mcap = ffmc_val
                                        if turnover_val is not None: existing_detail.total_turnover = turnover_val
                                        if volume_val is not None: existing_detail.total_volume = volume_val
                                        existing_detail.trade_info = t_info
                                        existing_detail.price_info = p_info
                                        existing_detail.security_info = s_info
                                        existing_detail.order_book = o_book
                                        existing_detail.meta_data = m_data
                                    else:
                                        new_detail = StockDetailDaily(
                                            date=today_str,
                                            symbol=sym,
                                            company_name=c_name,
                                            industry=industry_name,
                                            isin=isin_val,
                                            delivery_pct=deliv_pct_val,
                                            face_value=face_val,
                                            daily_volatility=daily_vol,
                                            annual_volatility=annual_vol,
                                            issued_capital=issued_cap,
                                            applicable_margin=margin_val,
                                            impact_cost=impact_val,
                                            free_float_mcap=ffmc_val,
                                            total_turnover=turnover_val,
                                            total_volume=volume_val,
                                            trade_info=t_info,
                                            price_info=p_info,
                                            security_info=s_info,
                                            order_book=o_book,
                                            meta_data=m_data
                                        )
                                        db.add(new_detail)
                                    await db.commit()
                                    details_saved += 1
                            await asyncio.sleep(0.15)
                        except Exception as sym_err:
                            logger.warning(f"Error fetching detail for {sym}: {sym_err}")

                tasks = [fetch_and_save_detail(s) for s in symbols_list]
                await asyncio.gather(*tasks)

            # 4. Ingest Market-Wide Corporate Actions, Calendar Events & Announcements
            corp_actions_saved = 0
            try:
                # A. Corporate Actions
                mkt_ca = await asyncio.to_thread(fetcher.fetch_market_corporate_actions)
                async with AsyncSessionLocal() as db:
                    for item in mkt_ca:
                        sym = item.get("symbol")
                        subj = item.get("subject")
                        if not sym or not subj:
                            continue
                        
                        ex_d = item.get("exDate") or item.get("caBroadcastDate")
                        rec_d = item.get("recDate")
                        act_type, priority = classify_corporate_action(subj)

                        q_ca = await db.execute(
                            select(CorporateAction).where(
                                CorporateAction.symbol == sym,
                                CorporateAction.subject == subj,
                                CorporateAction.ex_date == ex_d
                            )
                        )
                        existing_ca = q_ca.scalars().first()
                        if not existing_ca:
                            new_ca = CorporateAction(
                                symbol=sym,
                                company_name=item.get("comp"),
                                series=item.get("series", "EQ"),
                                subject=subj,
                                action_type=act_type,
                                ex_date=ex_d,
                                record_date=rec_d,
                                bc_start_date=item.get("bcStartDate"),
                                bc_end_date=item.get("bcEndDate"),
                                nd_start_date=item.get("ndStartDate"),
                                nd_end_date=item.get("ndEndDate"),
                                priority_level=priority,
                                raw_data=item
                            )
                            db.add(new_ca)
                            corp_actions_saved += 1

                    # B. Event Calendar / Board Meetings
                    events_list = await asyncio.to_thread(fetcher.fetch_event_calendar)
                    for ev in events_list:
                        sym = ev.get("symbol")
                        purpose = ev.get("purpose") or "Board Meeting"
                        bm_desc = ev.get("bm_desc") or purpose
                        ev_date = ev.get("date")
                        if not sym:
                            continue

                        act_type, priority = classify_corporate_action(purpose, bm_desc)
                        q_ev = await db.execute(
                            select(CorporateAction).where(
                                CorporateAction.symbol == sym,
                                CorporateAction.subject == purpose,
                                CorporateAction.ex_date == ev_date
                            )
                        )
                        if not q_ev.scalars().first():
                            new_ev = CorporateAction(
                                symbol=sym,
                                company_name=ev.get("company"),
                                series="EQ",
                                subject=purpose,
                                action_type=act_type,
                                ex_date=ev_date,
                                details=bm_desc,
                                priority_level=priority,
                                raw_data=ev
                            )
                            db.add(new_ev)
                            corp_actions_saved += 1

                    # C. Corporate Announcements
                    ann_list = await asyncio.to_thread(fetcher.fetch_corporate_announcements)
                    for ann in ann_list:
                        sym = ann.get("symbol")
                        sort_dt = ann.get("sort_date") or ann.get("an_dt") or today_str
                        subj = ann.get("desc") or ann.get("attchmntText") or "Announcement"
                        if not sym:
                            continue

                        q_ann = await db.execute(
                            select(CorporateAnnouncement).where(
                                CorporateAnnouncement.symbol == sym,
                                CorporateAnnouncement.broadcast_date == sort_dt,
                                CorporateAnnouncement.subject == subj
                            )
                        )
                        if not q_ann.scalars().first():
                            new_ann = CorporateAnnouncement(
                                symbol=sym,
                                company_name=ann.get("sm_name"),
                                broadcast_date=sort_dt,
                                subject=subj,
                                description=ann.get("attchmntText"),
                                attachment_url=f"https://nsearchives.nseindia.com/corporate/{ann.get('attchmntFile')}" if ann.get("attchmntFile") else None,
                                raw_data=ann
                            )
                            db.add(new_ann)

                    # D. Fetch constituent-specific corporate actions & board meetings for Nifty 50
                    if symbols_list:
                        sem_ca = asyncio.Semaphore(5)

                        async def fetch_constituent_ca(s_sym: str):
                            nonlocal corp_actions_saved
                            async with sem_ca:
                                try:
                                    ca_items = await asyncio.to_thread(fetcher.fetch_stock_corporate_actions, s_sym)
                                    bm_items = await asyncio.to_thread(fetcher.fetch_stock_event_calendar, s_sym)
                                    async with AsyncSessionLocal() as sub_db:
                                        for c_it in (ca_items or []):
                                            c_subj = c_it.get("subject")
                                            c_ex = c_it.get("exDate") or c_it.get("caBroadcastDate")
                                            if c_subj:
                                                act_t, prio = classify_corporate_action(c_subj)
                                                q_chk = await sub_db.execute(
                                                    select(CorporateAction).where(
                                                        CorporateAction.symbol == s_sym,
                                                        CorporateAction.subject == c_subj,
                                                        CorporateAction.ex_date == c_ex
                                                    )
                                                )
                                                if not q_chk.scalars().first():
                                                    sub_db.add(CorporateAction(
                                                        symbol=s_sym,
                                                        company_name=c_it.get("comp"),
                                                        series=c_it.get("series", "EQ"),
                                                        subject=c_subj,
                                                        action_type=act_t,
                                                        ex_date=c_ex,
                                                        record_date=c_it.get("recDate"),
                                                        priority_level=prio,
                                                        raw_data=c_it
                                                    ))
                                                    corp_actions_saved += 1

                                        for b_it in (bm_items or []):
                                            b_purp = b_it.get("purpose") or "Board Meeting"
                                            b_dt = b_it.get("date")
                                            act_t, prio = classify_corporate_action(b_purp, b_it.get("bm_desc") or "")
                                            q_chk_bm = await sub_db.execute(
                                                select(CorporateAction).where(
                                                    CorporateAction.symbol == s_sym,
                                                    CorporateAction.subject == b_purp,
                                                    CorporateAction.ex_date == b_dt
                                                )
                                            )
                                            if not q_chk_bm.scalars().first():
                                                sub_db.add(CorporateAction(
                                                    symbol=s_sym,
                                                    company_name=b_it.get("company"),
                                                    series="EQ",
                                                    subject=b_purp,
                                                    action_type=act_t,
                                                    ex_date=b_dt,
                                                    details=b_it.get("bm_desc"),
                                                    priority_level=prio,
                                                    raw_data=b_it
                                                ))
                                                corp_actions_saved += 1
                                        await sub_db.commit()
                                except Exception as err:
                                    logger.warning(f"Error fetching constituent CA for {s_sym}: {err}")

                        ca_tasks = [fetch_constituent_ca(s) for s in symbols_list]
                        await asyncio.gather(*ca_tasks)

                    await db.commit()
            except Exception as ca_err:
                logger.error(f"Error fetching corporate actions/calendar: {ca_err}")

            duration = round(time.time() - start_time, 2)
            total_rows = indices_saved + stocks_saved + details_saved + corp_actions_saved

            status = "SUCCESS"
            error_msg = None
            if indices_saved == 0 and stocks_saved == 0:
                status = "FAILED"
                error_msg = "No indices or stock data could be fetched from NSE."
            elif indices_saved == 0 or stocks_saved == 0:
                status = "PARTIAL"
                error_msg = f"Partial fetch: {stocks_saved} stocks, {indices_saved} indices."

            async with AsyncSessionLocal() as db:
                q = await db.execute(select(FetchLog).where(FetchLog.id == log_id))
                updated_log = q.scalars().first()
                if updated_log:
                    updated_log.status = status
                    updated_log.rows_fetched = total_rows
                    updated_log.indices_count = indices_saved
                    updated_log.stocks_count = stocks_saved
                    updated_log.stock_details_count = details_saved
                    updated_log.corporate_actions_count = corp_actions_saved
                    updated_log.duration_seconds = duration
                    updated_log.error_message = error_msg
                    updated_log.details = {
                        "trade_date": today_str,
                        "indices_saved": indices_saved,
                        "stocks_saved": stocks_saved,
                        "details_saved": details_saved,
                        "corporate_actions_saved": corp_actions_saved,
                        "duration_seconds": duration,
                    }
                    await db.commit()
                    await db.refresh(updated_log)
                    log_entry = updated_log

            logger.info(f"Sync complete ({status}): {total_rows} total rows (including {corp_actions_saved} catalysts) in {duration}s")
            return log_entry

        except Exception as e:
            duration = round(time.time() - start_time, 2)
            logger.error(f"Sync error: {e}", exc_info=True)
            async with AsyncSessionLocal() as db:
                q = await db.execute(select(FetchLog).where(FetchLog.id == log_id))
                failed_log = q.scalars().first()
                if failed_log:
                    failed_log.status = "FAILED"
                    failed_log.duration_seconds = duration
                    failed_log.error_message = str(e)
                    await db.commit()
                    await db.refresh(failed_log)
                    log_entry = failed_log
            return log_entry

        finally:
            is_syncing_flag = False
