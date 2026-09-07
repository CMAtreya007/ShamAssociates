import time
import json
import logging
import asyncio
import io
import zipfile
import csv
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

    def fetch_all_live_market_quotes(self) -> Dict[str, Dict[str, Any]]:
        """
        Fetches live real-time market snapshots across NIFTY 500, SECURITIES IN F&O, NIFTY 50,
        and Sectoral indices. Returns a dictionary mapping SYMBOL -> live quote dictionary.
        Cached in RAM for 25s for blazing-fast sub-millisecond multi-stock lookups.
        """
        cache_key = "live_market_quotes_map"
        from app.services.cache_manager import ram_cache
        cached = ram_cache.get(cache_key)
        if cached is not None and isinstance(cached, dict):
            return cached

        quotes_map: Dict[str, Dict[str, Any]] = {}
        indices_to_fetch = ["NIFTY 500", "SECURITIES IN F&O", "NIFTY 50", "NIFTY MIDCAP 150"]
        for idx in indices_to_fetch:
            try:
                enc = urllib.parse.quote(idx)
                url = f"{self.BASE_URL}/api/NextApi/apiClient/marketWatchApi?functionName=getIndicesData&symbol={enc}"
                d = self._get_json(url, referer=f"{self.BASE_URL}/market-data/live-equity-market", retries=2)
                if d and isinstance(d, dict) and "data" in d:
                    raw_data = d["data"]
                    stock_list = []
                    if isinstance(raw_data, dict) and "data" in raw_data and isinstance(raw_data["data"], list):
                        stock_list = raw_data["data"]
                    elif isinstance(raw_data, list):
                        stock_list = raw_data
                    
                    for item in stock_list:
                        sym = (item.get("symbol") or "").upper().strip()
                        if not sym or sym == idx or item.get("priority") == 1:
                            continue
                        if sym not in quotes_map:
                            quotes_map[sym] = item
            except Exception as e:
                logger.warning(f"Error fetching live index {idx}: {e}")

        if quotes_map:
            ram_cache.set(cache_key, quotes_map, ttl=25.0)
        return quotes_map

    def fetch_full_market_bhavcopy(self, target_date: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """
        Fetches the complete authoritative NSE Equity universe (all 2,652+ listed stocks)
        from the official consolidated NSE Bhavcopy, overlaying live quotes for real-time accuracy.
        Caches in RAM for sub-millisecond multi-stock responses.
        """
        from app.services.cache_manager import ram_cache
        
        cache_key = f"full_market_bhavcopy_{target_date or 'latest'}"
        cached = ram_cache.get(cache_key)
        if cached is not None and isinstance(cached, dict):
            return cached

        dates_to_try = []
        if target_date:
            try:
                clean_d = datetime.strptime(target_date.strip().replace("-", ""), "%Y%m%d")
                dates_to_try.append(clean_d)
            except Exception:
                pass
        
        now = datetime.now()
        for offset in range(8):
            d = now - timedelta(days=offset)
            if d.weekday() not in (5, 6):
                if d not in dates_to_try:
                    dates_to_try.append(d)

        bhav_map: Dict[str, Dict[str, Any]] = {}
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Referer": "https://www.nseindia.com/"
        }

        for check_dt in dates_to_try:
            ymd = check_dt.strftime("%Y%m%d")
            url = f"https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{ymd}_F_0000.csv.zip"
            try:
                res = self.session.get(url, headers=headers, timeout=12)
                if res.status_code == 200 and len(res.content) > 1000:
                    zf = zipfile.ZipFile(io.BytesIO(res.content))
                    with zf.open(zf.namelist()[0]) as f:
                        csv_text = io.TextIOWrapper(f, encoding="utf-8", errors="ignore").read()
                        reader = csv.DictReader(io.StringIO(csv_text))
                        for row in reader:
                            series = (row.get("SctySrs") or row.get("SERIES") or "").strip().upper()
                            sym = (row.get("TckrSymb") or row.get("SYMBOL") or "").strip().upper()
                            inst_tp = (row.get("FinInstrmTp") or "").strip().upper()
                            
                            # Accept all equity and trade-for-trade stock series (EQ, BE, BZ, SM, ST, SZ, E1, GB)
                            if not sym or (inst_tp != "STK" and series not in ("EQ", "BE", "BZ", "SM", "ST", "SZ", "E1", "GB")):
                                continue
                            
                            open_p = safe_float(row.get("OpnPric") or row.get("OPEN_PRICE") or row.get("OPEN"))
                            high_p = safe_float(row.get("HghPric") or row.get("HIGH_PRICE") or row.get("HIGH"))
                            low_p = safe_float(row.get("LwPric") or row.get("LOW_PRICE") or row.get("LOW"))
                            cls_p = safe_float(row.get("ClsPric") or row.get("CLOSE_PRICE") or row.get("LastPric") or row.get("CLOSE") or row.get("LAST_PRICE"))
                            prev_p = safe_float(row.get("PrvsClsgPric") or row.get("PREV_CLOSE") or row.get("PREVCLOSE"))
                            vol = safe_float(row.get("TtlTradgVol") or row.get("TTL_TRD_QNTY") or row.get("TOTTRDQTY"))
                            turnover = safe_float(row.get("TtlTrfVal") or row.get("TURNOVER_LACS") or row.get("TOTTRDVAL"))
                            isin = row.get("ISIN") or ""
                            comp_name = (row.get("FinInstrmNm") or row.get("COMPANY_NAME") or sym).strip()

                            chg = round(cls_p - prev_p, 2) if (cls_p is not None and prev_p is not None) else None
                            p_chg = round(((chg / prev_p) * 100.0), 2) if (chg is not None and prev_p and prev_p > 0) else None

                            mkt_perf = round(cls_p - prev_p, 2) if (cls_p is not None and prev_p is not None) else chg
                            premarket = round(open_p - prev_p, 2) if (open_p is not None and prev_p is not None) else None
                            rec_low = round(cls_p - low_p, 2) if (cls_p is not None and low_p is not None) else None
                            dist_high = round(cls_p - high_p, 2) if (cls_p is not None and high_p is not None) else None

                            bhav_map[sym] = {
                                "symbol": sym,
                                "companyName": comp_name,
                                "series": series or "EQ",
                                "isin": isin,
                                "open": open_p,
                                "dayHigh": high_p,
                                "dayLow": low_p,
                                "previousClose": prev_p,
                                "lastPrice": cls_p,
                                "change": chg,
                                "pChange": p_chg,
                                "market_performance": mkt_perf,
                                "premarket": premarket,
                                "recover_from_low": rec_low,
                                "distance_from_high": dist_high,
                                "totalTradedVolume": vol,
                                "totalTradedValue": turnover,
                                "trade_date": check_dt.strftime("%Y-%m-%d")
                            }
                    logger.info(f"Successfully fetched Bhavcopy for {ymd}: {len(bhav_map)} equities")
                    break
            except Exception as e:
                logger.debug(f"Could not load Bhavcopy for {ymd}: {e}")

        # Overlay live market quotes when available
        try:
            live_quotes = self.fetch_all_live_market_quotes()
            for sym, l_q in live_quotes.items():
                if sym in bhav_map:
                    p_inf = l_q.get("priceInfo") if isinstance(l_q.get("priceInfo"), dict) else {}
                    t_inf = l_q.get("tradeInfo") if isinstance(l_q.get("tradeInfo"), dict) else {}
                    intra = p_inf.get("intraDayHighLow") if isinstance(p_inf.get("intraDayHighLow"), dict) else {}
                    week = p_inf.get("weekHighLow") if isinstance(p_inf.get("weekHighLow"), dict) else {}

                    ltp_val = safe_float(l_q.get("lastPrice") or p_inf.get("lastPrice") or p_inf.get("close"))
                    if ltp_val is not None:
                        bhav_map[sym]["lastPrice"] = ltp_val
                    open_val = safe_float(l_q.get("open") or p_inf.get("open"))
                    if open_val is not None:
                        bhav_map[sym]["open"] = open_val
                    hi_val = safe_float(l_q.get("dayHigh") or intra.get("max") or p_inf.get("high"))
                    if hi_val is not None:
                        bhav_map[sym]["dayHigh"] = hi_val
                    lo_val = safe_float(l_q.get("dayLow") or intra.get("min") or p_inf.get("low"))
                    if lo_val is not None:
                        bhav_map[sym]["dayLow"] = lo_val
                    pc_val = safe_float(l_q.get("previousClose") or p_inf.get("previousClose"))
                    if pc_val is not None:
                        bhav_map[sym]["previousClose"] = pc_val
                    chg_val = safe_float(l_q.get("change") or p_inf.get("change"))
                    if chg_val is not None:
                        bhav_map[sym]["change"] = chg_val
                    pct_val = safe_float(l_q.get("pChange") or p_inf.get("pChange"))
                    if pct_val is not None:
                        bhav_map[sym]["pChange"] = pct_val
                    vol_val = safe_float(l_q.get("totalTradedVolume") or t_inf.get("totalTradedVolume"))
                    if vol_val is not None:
                        bhav_map[sym]["totalTradedVolume"] = vol_val
                    val_val = safe_float(l_q.get("totalTradedValue"))
                    if val_val is not None:
                        bhav_map[sym]["totalTradedValue"] = val_val
                    yh = safe_float(l_q.get("yearHigh") or week.get("max") or p_inf.get("yearHigh"))
                    if yh is not None:
                        bhav_map[sym]["yearHigh"] = yh
                    yl = safe_float(l_q.get("yearLow") or week.get("min") or p_inf.get("yearLow"))
                    if yl is not None:
                        bhav_map[sym]["yearLow"] = yl
                    p30 = safe_float(l_q.get("perChange30d") or p_inf.get("perChange30d"))
                    if p30 is not None:
                        bhav_map[sym]["perChange30d"] = p30
                    p365 = safe_float(l_q.get("perChange365d") or p_inf.get("perChange365d"))
                    if p365 is not None:
                        bhav_map[sym]["perChange365d"] = p365
                    nwkh = safe_float(l_q.get("nearWKH") or p_inf.get("nearWKH"))
                    if nwkh is not None:
                        bhav_map[sym]["nearWKH"] = nwkh
                    nwkl = safe_float(l_q.get("nearWKL") or p_inf.get("nearWKL"))
                    if nwkl is not None:
                        bhav_map[sym]["nearWKL"] = nwkl

                    # Recalculate 4 metrics with live prices
                    cur_ltp = bhav_map[sym].get("lastPrice")
                    cur_prev = bhav_map[sym].get("previousClose")
                    cur_open = bhav_map[sym].get("open")
                    cur_high = bhav_map[sym].get("dayHigh")
                    cur_low = bhav_map[sym].get("dayLow")
                    if cur_ltp is not None and cur_prev is not None:
                        bhav_map[sym]["market_performance"] = round(cur_ltp - cur_prev, 2)
                    if cur_open is not None and cur_prev is not None:
                        bhav_map[sym]["premarket"] = round(cur_open - cur_prev, 2)
                    if cur_ltp is not None and cur_low is not None:
                        bhav_map[sym]["recover_from_low"] = round(cur_ltp - cur_low, 2)
                    if cur_ltp is not None and cur_high is not None:
                        bhav_map[sym]["distance_from_high"] = round(cur_ltp - cur_high, 2)
        except Exception as e:
            logger.debug(f"Live quotes overlay notice: {e}")

        if bhav_map:
            ram_cache.set(cache_key, bhav_map, ttl=60.0)
        return bhav_map

    def fetch_live_stock_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Returns live real-time quote for any individual stock symbol across any series (EQ, BE, BZ, SM, ST).
        Checks broad market live feeds first, falling back to deep individual quote extractor and Bhavcopy.
        """
        clean_sym = symbol.upper().strip()
        all_quotes = self.fetch_all_live_market_quotes()
        if clean_sym in all_quotes:
            return all_quotes[clean_sym]
        
        # Check deep stock details with dynamic multi-series
        det = self.fetch_stock_details(clean_sym)
        if det and isinstance(det, dict):
            p_inf = det.get("priceInfo") or {}
            t_inf = det.get("tradeInfo") or {}
            m_inf = det.get("metaData") or {}
            intra = p_inf.get("intraDayHighLow") or {}
            week = p_inf.get("weekHighLow") or {}
            return {
                "symbol": clean_sym,
                "companyName": m_inf.get("companyName") or det.get("companyName") or clean_sym,
                "series": m_inf.get("series") or "EQ",
                "open": safe_float(p_inf.get("open") or m_inf.get("open")),
                "dayHigh": safe_float(intra.get("max") or p_inf.get("high") or m_inf.get("dayHigh")),
                "dayLow": safe_float(intra.get("min") or p_inf.get("low") or m_inf.get("dayLow")),
                "previousClose": safe_float(p_inf.get("previousClose") or m_inf.get("previousClose")),
                "lastPrice": safe_float(p_inf.get("lastPrice") or p_inf.get("close") or m_inf.get("lastPrice")),
                "change": safe_float(p_inf.get("change") or m_inf.get("change")),
                "pChange": safe_float(p_inf.get("pChange") or m_inf.get("pChange")),
                "totalTradedVolume": safe_float(t_inf.get("totalTradedVolume") or t_inf.get("quantityTraded")),
                "totalTradedValue": safe_float(t_inf.get("totalTradedValue")),
                "yearHigh": safe_float(p_inf.get("yearHigh") or week.get("max")),
                "yearLow": safe_float(p_inf.get("yearLow") or week.get("min")),
                "perChange30d": safe_float(p_inf.get("perChange30d")),
                "perChange365d": safe_float(p_inf.get("perChange365d")),
                "nearWKH": safe_float(p_inf.get("nearWKH")),
                "nearWKL": safe_float(p_inf.get("nearWKL")),
                "lastUpdateTime": str(m_inf.get("lastUpdateTime") or ""),
                "ffmc": safe_float(t_inf.get("ffmc"))
            }

        # Fallback to Bhavcopy
        bhav_map = self.fetch_full_market_bhavcopy()
        if clean_sym in bhav_map:
            return bhav_map[clean_sym]

        return None

    def search_autocomplete(self, query: str) -> List[Dict[str, Any]]:
        """Searches live symbols and company names on NSE via official autocomplete API."""
        encoded_q = urllib.parse.quote(query.strip())
        url = f"{self.BASE_URL}/api/search/autocomplete?q={encoded_q}"
        referer = f"{self.BASE_URL}/search"
        data = self._get_json(url, referer=referer, retries=2)
        results = []
        if data and isinstance(data, dict):
            sym_list = data.get("symbols", [])
            for item in sym_list:
                sym = item.get("symbol")
                name = item.get("symbol_info") or item.get("company_name") or item.get("symbol_des")
                if sym:
                    results.append({
                        "symbol": sym.upper().strip(),
                        "company_name": name or sym,
                        "series": item.get("series") or "EQ",
                        "industry": item.get("industry") or item.get("result_type")
                    })
        return results

    def fetch_stock_trade_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetches detailed trade information and security-wise delivery position for a stock."""
        encoded_sym = urllib.parse.quote(symbol.upper().strip())
        url = f"{self.BASE_URL}/api/quote-equity?symbol={encoded_sym}&section=trade_info"
        referer = f"{self.BASE_URL}/get-quotes/equity?symbol={encoded_sym}"
        return self._get_json(url, referer=referer, retries=2)

    def fetch_stock_details(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetches deep trade info, price info, security info, valuation ratios, and delivery metrics across all equity series."""
        clean_sym = symbol.upper().strip()
        encoded_sym = urllib.parse.quote(clean_sym)
        
        # 1. Determine series candidates (EQ, BE, BZ, SM, ST, SZ, E1)
        series_hint = None
        from app.services.nse_symbols_master import lookup_master_symbol
        m_info_master = lookup_master_symbol(clean_sym)
        if m_info_master and m_info_master.get("series"):
            series_hint = m_info_master["series"].upper()
        
        series_candidates = []
        if series_hint:
            series_candidates.append(series_hint)
        for srs in ["EQ", "BE", "BZ", "SM", "ST", "SZ", "GB", "E1"]:
            if srs not in series_candidates:
                series_candidates.append(srs)

        # 2. Try NextApi GetQuoteApi with dynamic multi-series support
        for srs in series_candidates:
            url1 = f"{self.BASE_URL}/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series={srs}&symbol={encoded_sym}"
            referer1 = f"{self.BASE_URL}/get-quotes/equity?symbol={encoded_sym}"
            data1 = self._get_json(url1, referer=referer1, retries=2)
            if data1 and isinstance(data1, dict) and "equityResponse" in data1:
                eq_list = data1.get("equityResponse", [])
                if eq_list and isinstance(eq_list, list) and len(eq_list) > 0:
                    eq_res = eq_list[0]
                    p_inf = eq_res.get("priceInfo") or {}
                    t_inf = eq_res.get("tradeInfo") or {}
                    m_inf = eq_res.get("metaData") or {}
                    s_inf = eq_res.get("secInfo") or {}
                    o_book = eq_res.get("orderBook") or {}

                    ltp_val = safe_float(m_inf.get("lastPrice") or m_inf.get("closePrice") or p_inf.get("lastPrice") or p_inf.get("close") or t_inf.get("lastPrice"))
                    if ltp_val is not None or m_inf.get("symbol"):
                        op_val = safe_float(m_inf.get("open") or p_inf.get("open"))
                        hi_val = safe_float(m_inf.get("dayHigh") or (p_inf.get("intraDayHighLow") or {}).get("max") or p_inf.get("high"))
                        lo_val = safe_float(m_inf.get("dayLow") or (p_inf.get("intraDayHighLow") or {}).get("min") or p_inf.get("low"))
                        pc_val = safe_float(m_inf.get("previousClose") or m_inf.get("basePrice") or p_inf.get("previousClose") or p_inf.get("basePrice"))
                        yh_val = safe_float(p_inf.get("yearHigh") or (p_inf.get("weekHighLow") or {}).get("max"))
                        yl_val = safe_float(p_inf.get("yearLow") or (p_inf.get("weekHighLow") or {}).get("min"))
                        chg_val = safe_float(m_inf.get("change") or p_inf.get("change"))
                        pct_val = safe_float(m_inf.get("pChange") or p_inf.get("pChange"))
                        vol_val = safe_float(t_inf.get("totalTradedVolume") or t_inf.get("quantityTraded"))
                        val_val = safe_float(t_inf.get("totalTradedValue"))

                        if chg_val is None and ltp_val is not None and pc_val is not None:
                            chg_val = round(ltp_val - pc_val, 2)
                        if pct_val is None and ltp_val is not None and pc_val and pc_val > 0:
                            pct_val = round(((ltp_val - pc_val) / pc_val) * 100, 2)

                        near_wkh = safe_float(p_inf.get("nearWKH"))
                        if near_wkh is None and ltp_val and yh_val and yh_val > 0:
                            near_wkh = round(((ltp_val - yh_val) / yh_val) * 100, 2)
                        near_wkl = safe_float(p_inf.get("nearWKL"))
                        if near_wkl is None and ltp_val and yl_val and yl_val > 0:
                            near_wkl = round(((ltp_val - yl_val) / yl_val) * 100, 2)

                        c_name = m_inf.get("companyName") or (m_info_master.get("company_name") if m_info_master else clean_sym)

                        # Package complete normalized details
                        return {
                            "priceInfo": {
                                "lastPrice": ltp_val,
                                "change": chg_val,
                                "pChange": pct_val,
                                "previousClose": pc_val,
                                "open": op_val,
                                "close": ltp_val,
                                "intraDayHighLow": {"min": lo_val, "max": hi_val},
                                "weekHighLow": {"min": yl_val, "max": yh_val},
                                "yearHigh": yh_val,
                                "yearLow": yl_val,
                                "nearWKH": near_wkh,
                                "nearWKL": near_wkl,
                                "perChange30d": safe_float(p_inf.get("perChange30d")),
                                "perChange365d": safe_float(p_inf.get("perChange365d")),
                                "cmDailyVolatility": safe_float(p_inf.get("cmDailyVolatility")),
                                "cmAnnualVolatility": safe_float(p_inf.get("cmAnnualVolatility"))
                            },
                            "tradeInfo": {
                                "totalTradedVolume": vol_val,
                                "totalTradedValue": val_val,
                                "ffmc": safe_float(t_inf.get("ffmc")),
                                "totalMarketCap": safe_float(t_inf.get("totalMarketCap")),
                                "deliveryToTradedQuantity": safe_float(t_inf.get("deliveryToTradedQuantity")),
                                "deliveryQuantity": safe_float(t_inf.get("deliveryQuantity")),
                                "faceValue": safe_float(t_inf.get("faceValue") or s_inf.get("faceValue")),
                                "issuedSize": safe_float(t_inf.get("issuedSize") or s_inf.get("issuedSize")),
                                "impactCost": safe_float(t_inf.get("impactCost")),
                                "applicableMargin": safe_float(t_inf.get("applicableMargin"))
                            },
                            "secInfo": s_inf or {
                                "basicIndustry": m_info_master.get("industry") if m_info_master else "NSE Equity",
                                "isin": m_inf.get("isinCode")
                            },
                            "metaData": {
                                "companyName": c_name,
                                "symbol": clean_sym,
                                "series": srs,
                                "isinCode": m_inf.get("isinCode") or (m_info_master.get("isin") if m_info_master else None),
                                "industry": m_inf.get("industry") or (m_info_master.get("industry") if m_info_master else "NSE Equity"),
                                "lastUpdateTime": str(m_inf.get("lastUpdateTime") or eq_res.get("lastUpdateTime") or "")
                            },
                            "orderBook": o_book,
                            "companyName": c_name
                        }

        # 3. Fallback to Bhavcopy for complete and accurate exchange data
        bhav_map = self.fetch_full_market_bhavcopy()
        if clean_sym in bhav_map:
            bh = bhav_map[clean_sym]
            return {
                "priceInfo": {
                    "lastPrice": bh.get("lastPrice"),
                    "change": bh.get("change"),
                    "pChange": bh.get("pChange"),
                    "previousClose": bh.get("previousClose"),
                    "open": bh.get("open"),
                    "close": bh.get("lastPrice"),
                    "intraDayHighLow": {"min": bh.get("dayLow"), "max": bh.get("dayHigh")},
                    "weekHighLow": {"min": bh.get("yearLow"), "max": bh.get("yearHigh")},
                    "yearHigh": bh.get("yearHigh"),
                    "yearLow": bh.get("yearLow"),
                    "nearWKH": bh.get("nearWKH"),
                    "nearWKL": bh.get("nearWKL")
                },
                "tradeInfo": {
                    "totalTradedVolume": bh.get("totalTradedVolume"),
                    "totalTradedValue": bh.get("totalTradedValue")
                },
                "secInfo": {
                    "isin": bh.get("isin"),
                    "basicIndustry": m_info_master.get("industry") if m_info_master else "NSE Equity"
                },
                "metaData": {
                    "companyName": bh.get("companyName") or clean_sym,
                    "symbol": clean_sym,
                    "series": bh.get("series") or "EQ",
                    "isinCode": bh.get("isin")
                },
                "companyName": bh.get("companyName") or clean_sym
            }

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

            # 3. Deep Ingestion of Secondary Metrics for Nifty 50 & Custom Stocks (Parallel Batch)
            details_saved = 0
            if fetch_details:
                # Retrieve all custom watchlist symbols to sync alongside Nifty 50
                custom_syms = []
                async with AsyncSessionLocal() as db:
                    q_cust = await db.execute(select(CustomStockWatchlist.symbol).distinct())
                    custom_syms = [s[0].upper().strip() for s in q_cust.all() if s[0]]

                all_symbols_to_detail = list(dict.fromkeys(symbols_list + custom_syms))

                if all_symbols_to_detail:
                    semaphore = asyncio.Semaphore(12)
                    collected_details: List[Dict[str, Any]] = []

                    async def fetch_and_save_detail(sym: str):
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

                                    collected_details.append({
                                        "date": today_str,
                                        "symbol": sym,
                                        "company_name": c_name,
                                        "industry": industry_name,
                                        "isin": isin_val,
                                        "delivery_pct": deliv_pct_val,
                                        "face_value": face_val,
                                        "daily_volatility": daily_vol,
                                        "annual_volatility": annual_vol,
                                        "issued_capital": issued_cap,
                                        "applicable_margin": margin_val,
                                        "impact_cost": impact_val,
                                        "free_float_mcap": ffmc_val,
                                        "total_turnover": turnover_val,
                                        "total_volume": volume_val,
                                        "trade_info": t_info,
                                        "price_info": p_info,
                                        "security_info": s_info,
                                        "order_book": o_book,
                                        "meta_data": m_data
                                    })
                            except Exception as sym_err:
                                logger.warning(f"Error fetching detail for {sym}: {sym_err}")

                    tasks = [fetch_and_save_detail(s) for s in all_symbols_to_detail]
                    await asyncio.gather(*tasks)

                    if collected_details:
                        from app.services.db_manager import DatabaseManager
                        details_saved = await DatabaseManager.upsert_stock_details_records(collected_details)

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

                    # D. Fetch constituent-specific corporate actions & board meetings for Nifty 50 (Parallel Batch)
                    if symbols_list:
                        sem_ca = asyncio.Semaphore(12)
                        collected_actions: List[Dict[str, Any]] = []

                        async def fetch_constituent_ca(s_sym: str):
                            async with sem_ca:
                                try:
                                    ca_items = await asyncio.to_thread(fetcher.fetch_stock_corporate_actions, s_sym)
                                    bm_items = await asyncio.to_thread(fetcher.fetch_stock_event_calendar, s_sym)
                                    for c_it in (ca_items or []):
                                        c_subj = c_it.get("subject")
                                        c_ex = c_it.get("exDate") or c_it.get("caBroadcastDate")
                                        if c_subj:
                                            act_t, prio = classify_corporate_action(c_subj)
                                            collected_actions.append({
                                                "symbol": s_sym,
                                                "company_name": c_it.get("comp"),
                                                "series": c_it.get("series", "EQ"),
                                                "subject": c_subj,
                                                "action_type": act_t,
                                                "ex_date": c_ex,
                                                "record_date": c_it.get("recDate"),
                                                "priority_level": prio,
                                                "raw_data": c_it
                                            })

                                    for b_it in (bm_items or []):
                                        b_purp = b_it.get("purpose") or "Board Meeting"
                                        b_dt = b_it.get("date")
                                        act_t, prio = classify_corporate_action(b_purp, b_it.get("bm_desc") or "")
                                        collected_actions.append({
                                            "symbol": s_sym,
                                            "company_name": b_it.get("company"),
                                            "series": "EQ",
                                            "subject": b_purp,
                                            "action_type": act_t,
                                            "ex_date": b_dt,
                                            "details": b_it.get("bm_desc"),
                                            "priority_level": prio,
                                            "raw_data": b_it
                                        })
                                except Exception as err:
                                    logger.warning(f"Error fetching constituent CA for {s_sym}: {err}")

                        ca_tasks = [fetch_constituent_ca(s) for s in symbols_list]
                        await asyncio.gather(*ca_tasks)

                        if collected_actions:
                            from app.services.db_manager import DatabaseManager
                            corp_actions_saved += await DatabaseManager.upsert_corporate_actions_records(collected_actions)

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
            
            # Immediately pre-warm the export ZIP cache and trigger background auto-export to destination folders
            if status in ("SUCCESS", "PARTIAL"):
                try:
                    from app.services.cache_manager import clear_all_data_caches
                    clear_all_data_caches()
                    from app.services.excel_exporter import warmup_export_cache
                    asyncio.create_task(warmup_export_cache(today_str))

                    # Automatically append to Master Workbooks & Auto-Download to user-chosen system folders
                    async def auto_download_background():
                        try:
                            from app.services.scheduler import auto_export_to_downloads, master_excel_sync, DEFAULT_DOWNLOADS_FOLDER
                            from app.models import UserSettings
                            await master_excel_sync.append_daily_data(today_str)
                            async with AsyncSessionLocal() as db_ad:
                                q_u = await db_ad.execute(select(UserSettings).where(UserSettings.auto_download_enabled == True))
                                u_list = q_u.scalars().all()
                                if u_list:
                                    for u_s in u_list:
                                        u_dest = u_s.downloads_folder or DEFAULT_DOWNLOADS_FOLDER
                                        await auto_export_to_downloads(today_str, dest_folder=u_dest)
                                else:
                                    await auto_export_to_downloads(today_str)
                        except Exception as ad_err:
                            logger.error(f"Background live auto-download export error: {ad_err}")

                    asyncio.create_task(auto_download_background())
                except Exception:
                    pass

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
