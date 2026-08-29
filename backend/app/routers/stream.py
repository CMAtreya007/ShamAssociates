from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any, List
from app.services.live_stream import live_stream_manager

router = APIRouter(tags=["Live Market Streaming"])

@router.websocket("/api/ws/live")
async def websocket_live_market(websocket: WebSocket):
    """Real-time bi-directional WebSocket connection for zero-delay live NSE stock market updates."""
    await live_stream_manager.connect(websocket)
    try:
        while True:
            # Handle client heartbeats or custom symbol subscriptions
            data = await websocket.receive_text()
            if data == "PING":
                await websocket.send_text('{"type": "PONG"}')
    except WebSocketDisconnect:
        live_stream_manager.disconnect(websocket)
    except Exception:
        live_stream_manager.disconnect(websocket)

@router.get("/api/data/live")
async def get_live_market_cache() -> Dict[str, Any]:
    """Returns the latest live market snapshot with 0ms in-memory latency."""
    if not live_stream_manager.cached_nifty50:
        await live_stream_manager.fetch_live_tick()

    return {
        "timestamp": live_stream_manager.last_tick_time,
        "market_status": live_stream_manager.market_status,
        "stocks": live_stream_manager.cached_nifty50,
        "pulse": live_stream_manager.cached_pulse
    }
