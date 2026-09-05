from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, status
from typing import Dict, Any, List, Optional
from app.services.live_stream import live_stream_manager
from app.services.auth import get_current_user, verify_ws_token

router = APIRouter(tags=["Live Market Streaming"])

@router.websocket("/api/ws/live")
async def websocket_live_market(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """Real-time bi-directional WebSocket connection for zero-delay live NSE stock market updates."""
    # Optional token verification if auth is required
    if token:
        user = verify_ws_token(token)
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

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
async def get_live_market_cache(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Returns the latest live market snapshot with 0ms in-memory latency."""
    if not live_stream_manager.cached_nifty50:
        await live_stream_manager.fetch_live_tick()

    return {
        "timestamp": live_stream_manager.last_tick_time,
        "market_status": live_stream_manager.market_status,
        "stocks": live_stream_manager.cached_nifty50,
        "pulse": live_stream_manager.cached_pulse
    }
