import time
import json
import logging
import urllib.parse
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Tuple
import pytz
from curl_cffi import requests

logger = logging.getLogger("nse_scraper")

class NSEScraper:
    """
    Robust session-managed scraping engine for NSE India with:
    - Browser TLS fingerprint impersonation (Chrome 131)
    - Anti-bot cookie rotation & warm-up (bm_sv, nsit, ak_bmsc)
    - Exponential backoff retry logic
    - Endpoints: allIndices, equity-stockIndices, GetQuoteApi, trade_info, corporate actions & announcements.
    """

    BASE_URL = "https://www.nseindia.com"

    def __init__(self):
        self.session = requests.Session(impersonate="chrome131")
        self.last_cookie_refresh = 0
        self.cookie_lifetime = 180  # Refresh session cookies every 3 minutes
        self.ist_tz = pytz.timezone("Asia/Kolkata")

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
                logger.warning(f"NSE Homepage warm-up returned status {resp.status_code}")

            # Landing pages to establish full cookie session
            self.session.get(f"{self.BASE_URL}/market-data/live-equity-market", headers=headers, timeout=15)
            self.session.get(f"{self.BASE_URL}/companies-listing/corporate-filings-actions", headers=headers, timeout=15)
            self.last_cookie_refresh = time.time()
            logger.info("NSE session cookies warmed up successfully.")
            return True
        except Exception as e:
            logger.error(f"Error warming up NSE session cookies: {e}")
            return False

    def _ensure_session(self):
        """Ensures cookies are fresh before executing an API call."""
        if time.time() - self.last_cookie_refresh > self.cookie_lifetime or not self.session.cookies:
            self._refresh_cookies()

    def _get_json(self, url: str, referer: Optional[str] = None, retries: int = 3) -> Optional[Any]:
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
                    return resp.json()
                elif resp.status_code in (401, 403):
                    logger.warning(f"Received {resp.status_code} on attempt {attempt+1}. Refreshing cookies...")
                    self._refresh_cookies()
                    time.sleep(1.0 * (attempt + 1))
                elif resp.status_code == 429:
                    logger.warning(f"Rate limited (429) on attempt {attempt+1}. Backing off...")
                    time.sleep(2.0 * (attempt + 1))
                else:
                    logger.warning(f"HTTP {resp.status_code} for URL {url} on attempt {attempt+1}")
                    time.sleep(1.0)
            except Exception as e:
                logger.warning(f"Request exception for {url} on attempt {attempt+1}: {e}")
                self._refresh_cookies()
                time.sleep(1.0 * (attempt + 1))

        logger.error(f"Failed to fetch {url} after {retries} retries.")
        return None

    def fetch_trading_holidays(self) -> List[str]:
        """Fetches the official NSE Holiday Calendar."""
        url = f"{self.BASE_URL}/api/holiday-master?type=trading"
        referer = f"{self.BASE_URL}/resources/exchange-communication-trading-holidays"
        data = self._get_json(url, referer=referer)
        holidays = []
        if data and isinstance(data, dict):
            cm_holidays = data.get("CBM", []) or data.get("CM", [])
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

        if check_date.weekday() in (5, 6):
            return True, f"Weekend ({check_date.strftime('%A')})"

        try:
            holidays = self.fetch_trading_holidays()
            date_str = check_date.strftime("%Y-%m-%d")
            if date_str in holidays:
                return True, f"NSE Trading Holiday on {date_str}"
        except Exception as e:
            logger.warning(f"Could not verify holiday calendar: {e}")

        return False, "Trading Day"

    def is_market_open(self) -> Tuple[bool, str]:
        """Determines if Indian Stock Market (NSE) is currently open."""
        now_ist = datetime.now(self.ist_tz)
        if now_ist.weekday() >= 5:
            return False, f"Weekend ({now_ist.strftime('%A')})"

        is_holiday, reason = self.is_market_holiday_or_weekend(now_ist.date())
        if is_holiday:
            return False, reason

        market_open_time = now_ist.replace(hour=9, minute=15, second=0, microsecond=0)
        market_close_time = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)

        if market_open_time <= now_ist <= market_close_time:
            return True, "Market Open (09:15 - 15:30 IST)"
        elif now_ist < market_open_time:
            return False, "Pre-Market (Opens at 09:15 IST)"
        else:
            return False, "Post-Market (Closed at 15:30 IST)"

    def fetch_all_indices(self) -> Optional[List[Dict[str, Any]]]:
        """Fetches all 115+ indices (Broad Market, Sectoral, Thematic, Strategy)."""
        url = f"{self.BASE_URL}/api/allIndices"
        data = self._get_json(url)
        if data and isinstance(data, dict) and "data" in data:
            return data["data"]
        return None

    def fetch_nifty50_constituents(self) -> Optional[List[Dict[str, Any]]]:
        """Fetches all 50 constituent stocks of Nifty 50 with live snapshot metrics."""
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
        
        # Fallback to standard equity-stockIndices endpoint if NextApi is unavailable
        fallback_url = f"{self.BASE_URL}/api/equity-stockIndices?index=NIFTY%2050"
        fallback_data = self._get_json(fallback_url)
        if fallback_data and isinstance(fallback_data, dict) and "data" in fallback_data:
            return [item for item in fallback_data["data"] if item.get("priority") != 1 and item.get("symbol") != "NIFTY 50"]

        return None

    def fetch_stock_details(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetches deep trade info, price info, security info, delivery % for a single stock."""
        encoded_sym = urllib.parse.quote(symbol)
        url = f"{self.BASE_URL}/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol={encoded_sym}"
        referer = f"{self.BASE_URL}/get-quotes/equity?symbol={encoded_sym}"
        data = self._get_json(url, referer=referer, retries=2)
        if data and isinstance(data, dict) and "equityResponse" in data:
            eq_list = data.get("equityResponse", [])
            if eq_list and isinstance(eq_list, list):
                return eq_list[0]
        
        # Fallback to quote-equity
        fallback_url = f"{self.BASE_URL}/api/quote-equity?symbol={encoded_sym}&section=trade_info"
        fallback_data = self._get_json(fallback_url, referer=referer, retries=2)
        if fallback_data and isinstance(fallback_data, dict):
            return fallback_data

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
        """Fetches Board Meetings and earnings calendar for an individual stock."""
        encoded_sym = urllib.parse.quote(symbol)
        url = f"{self.BASE_URL}/api/event-calendar?index=equities&symbol={encoded_sym}"
        referer = f"{self.BASE_URL}/get-quotes/equity?symbol={encoded_sym}"
        data = self._get_json(url, referer=referer)
        if data and isinstance(data, list):
            return data
        elif data and isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            return data["data"]
        return []

    def fetch_corporate_announcements(self) -> List[Dict[str, Any]]:
        """Fetches live corporate announcements and regulatory exchange filings."""
        url = f"{self.BASE_URL}/api/corporate-announcements?index=equities"
        referer = f"{self.BASE_URL}/companies-listing/corporate-filings-announcements"
        data = self._get_json(url, referer=referer)
        if data and isinstance(data, list):
            return data
        elif data and isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
            return data["data"]
        return []
