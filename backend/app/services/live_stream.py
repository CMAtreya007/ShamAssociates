import asyncio
import json
import logging
import time
from datetime import datetime, date, time as dt_time
import zoneinfo
from typing import Dict, Any, List, Set, Optional, Tuple
from fastapi import WebSocket, WebSocketDisconnect

from app.database import AsyncSessionLocal
from app.models import Nifty50Daily, FetchLog
from app.services.nse_fetcher import NSEFetcher, safe_float

logger = logging.getLogger("live_stream")

# IST Timezone for Indian Stock Market
try:
    IST = zoneinfo.ZoneInfo("Asia/Kolkata")
except Exception:
    import pytz
    IST = pytz.timezone("Asia/Kolkata")

class LiveMarketStreamManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.fetcher = NSEFetcher()
        self.fetcher._refresh_cookies()
        self.cached_nifty50: List[Dict[str, Any]] = []
        self.cached_pulse: Dict[str, Any] = {}
        self.market_status: str = "CLOSED"
        self.last_tick_time: Optional[str] = None
        self._is_running = False
        self._task: Optional[asyncio.Task] = None

    def is_market_open(self) -> Tuple[bool, str]:
        """Determines if the Indian Equity market (NSE) is currently open."""
        now_ist = datetime.now(IST)
        weekday = now_ist.weekday()  # 0=Monday, ..., 4=Friday, 5=Saturday, 6=Sunday

        if weekday >= 5:
            return False, "CLOSED (Weekend)"

        market_pre_open = dt_time(9, 0)
        market_open = dt_time(9, 15)
        market_close = dt_time(15, 30)

        current_time = now_ist.time()

        if current_time < market_pre_open:
            return False, "CLOSED (Pre-Market)"
        elif market_pre_open <= current_time < market_open:
            return True, "PRE_OPEN"
        elif market_open <= current_time <= market_close:
            return True, "OPEN"
        else:
            return False, "CLOSED (Post-Market)"

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total connections: {len(self.active_connections)}")

        # Send immediate cached snapshot upon connection (0ms initial latency)
        if self.cached_nifty50:
            try:
                await websocket.send_text(json.dumps({
                    "type": "INITIAL_SNAPSHOT",
                    "timestamp": self.last_tick_time or datetime.now(IST).isoformat(),
                    "market_status": self.market_status,
                    "stocks": self.cached_nifty50,
                    "pulse": self.cached_pulse
                }))
            except Exception as e:
                logger.warning(f"Failed to send initial snapshot: {e}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Remaining connections: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcasts real-time payload to all connected clients."""
        if not self.active_connections:
            return

        payload_str = json.dumps(message)
        dead_connections = set()

        for conn in self.active_connections:
            try:
                await conn.send_text(payload_str)
            except WebSocketDisconnect:
                dead_connections.add(conn)
            except Exception as e:
                logger.warning(f"Error sending message to client: {e}")
                dead_connections.add(conn)

        for dead in dead_connections:
            self.disconnect(dead)

    async def fetch_live_tick(self) -> Dict[str, Any]:
        """Fetches the latest live Nifty 50 constituents quote stream from NSE."""
        raw_stocks = await asyncio.to_thread(self.fetcher.fetch_nifty50_constituents)
        if not raw_stocks:
            return {}

        now_str = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
        today_str = datetime.now(IST).strftime("%Y-%m-%d")
        _, m_status = self.is_market_open()
        self.market_status = m_status

        formatted_stocks = []
        advances = 0
        declines = 0
        unchanged = 0
        total_turnover = 0.0

        for item in raw_stocks:
            sym = item.get("symbol")
            if not sym:
                continue

            open_val = safe_float(item.get("open"))
            high_val = safe_float(item.get("dayHigh"))
            low_val = safe_float(item.get("dayLow"))
            prev_close = safe_float(item.get("previousClose"))
            ltp = safe_float(item.get("lastPrice"))
            change = safe_float(item.get("change"))
            pct_change = safe_float(item.get("pChange"))
            vol = safe_float(item.get("totalTradedVolume"))
            turnover = safe_float(item.get("totalTradedValue"))

            if pct_change is not None:
                if pct_change > 0:
                    advances += 1
                elif pct_change < 0:
                    declines += 1
                else:
                    unchanged += 1

            if turnover:
                total_turnover += turnover

            formatted_stocks.append({
                "date": today_str,
                "symbol": sym,
                "company_name": item.get("companyName") or sym,
                "series": item.get("series", "EQ"),
                "open": open_val,
                "high": high_val,
                "low": low_val,
                "previous_close": prev_close,
                "ltp": ltp,
                "change": change,
                "pct_change": pct_change,
                "volume": vol,
                "turnover": turnover,
                "year_high": safe_float(item.get("yearHigh")),
                "year_low": safe_float(item.get("yearLow")),
                "per_change_30d": safe_float(item.get("perChange30d")),
                "per_change_365d": safe_float(item.get("perChange365d")),
                "near_wkh": safe_float(item.get("nearWKH")),
                "near_wkl": safe_float(item.get("nearWKL")),
                "ffmc": safe_float(item.get("ffmc")),
                "last_update_time": item.get("lastUpdateTime") or now_str
            })

        # Calculate Nifty 50 benchmark pulse
        n50_val = sum(s["ltp"] for s in formatted_stocks if s["ltp"]) / max(len(formatted_stocks), 1)
        pulse_data = {
            "market_status": m_status,
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "total_turnover_cr": round(total_turnover / 10000000.0, 2),
            "stocks_count": len(formatted_stocks)
        }

        self.cached_nifty50 = formatted_stocks
        self.cached_pulse = pulse_data
        self.last_tick_time = now_str

        return {
            "type": "LIVE_TICK",
            "timestamp": now_str,
            "market_status": m_status,
            "stocks": formatted_stocks,
            "pulse": pulse_data
        }

    async def start_stream_loop(self):
        """Continuous background streaming loop."""
        if self._is_running:
            return

        self._is_running = True
        logger.info("Live market streaming loop started.")

        while self._is_running:
            try:
                is_open, status_text = self.is_market_open()
                
                # Fetch live tick from NSE
                tick_data = await self.fetch_live_tick()
                if tick_data:
                    await self.broadcast(tick_data)

                # Dynamically adjust tick interval:
                # During active market hours: 2.5 seconds refresh
                # During off-market hours: 10 seconds heartbeat
                sleep_interval = 2.5 if is_open else 10.0
                await asyncio.sleep(sleep_interval)

            except Exception as e:
                logger.error(f"Error in live stream loop: {e}")
                await asyncio.sleep(5.0)

    def start(self):
        if not self._task or self._task.done():
            self._task = asyncio.create_task(self.start_stream_loop())

    def stop(self):
        self._is_running = False
        if self._task:
            self._task.cancel()

# Global Singleton Manager
live_stream_manager = LiveMarketStreamManager()
