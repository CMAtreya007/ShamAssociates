import asyncio
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import FetchLog, Nifty50Daily
from app.schemas import FetchStatusResponse, FetchLogSchema, ManualFetchRequest
from app.services.nse_fetcher import run_market_sync, is_syncing_flag
from app.services.scheduler import get_next_run_time
from app.services.historical_backfill import HistoricalBackfillEngine

router = APIRouter(prefix="/api/fetch", tags=["Data Fetching & Scheduler"])

@router.get("/status", response_model=FetchStatusResponse)
async def get_fetch_status(db: AsyncSession = Depends(get_db)):
    """Returns the last sync log, current sync state, and next scheduled run."""
    # Get last fetch log
    q = await db.execute(select(FetchLog).order_by(desc(FetchLog.id)).limit(1))
    last_log = q.scalars().first()

    # Get latest trade date in DB
    q_date = await db.execute(select(Nifty50Daily.date).order_by(desc(Nifty50Daily.date)).limit(1))
    latest_trade_date = q_date.scalars().first()

    # Count total stock records
    q_count = await db.execute(select(func.count(Nifty50Daily.id)))
    total_records = q_count.scalar() or 0

    today_str = date.today().strftime("%Y-%m-%d")
    today_synced = (latest_trade_date == today_str)

    next_run = get_next_run_time()

    return FetchStatusResponse(
        last_sync=FetchLogSchema.model_validate(last_log) if last_log else None,
        is_syncing=is_syncing_flag,
        today_synced=today_synced,
        latest_trade_date=latest_trade_date,
        total_records=total_records,
        next_scheduled_run=next_run
    )

@router.post("/run")
async def trigger_fetch(request: ManualFetchRequest, background_tasks: BackgroundTasks):
    """Manually triggers NSE data fetch."""
    global is_syncing_flag
    if is_syncing_flag:
        return {"success": False, "message": "A sync is already in progress.", "is_syncing": True}

    # Run in background task so UI gets instant confirmation
    background_tasks.add_task(
        run_market_sync,
        source=request.source,
        fetch_details=request.fetch_details,
        target_date=request.target_date
    )

    return {
        "success": True,
        "message": "Market data synchronization started in background.",
        "is_syncing": True
    }

@router.post("/backfill")
async def trigger_backfill(
    date: str = Query(..., description="Target historical date in YYYY-MM-DD format"),
    background: bool = Query(False, description="Whether to run in background")
):
    """Downloads official archives from NSE (Bhavcopy, MTO, Index Closes, Volatility) and backfills SQLite data."""
    clean_date = date.strip()
    try:
        # Validate format
        datetime.strptime(clean_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")

    engine = HistoricalBackfillEngine()
    if background:
        asyncio.create_task(engine.execute_backfill(clean_date))
        return {
            "success": True,
            "message": f"Historical backfill started in background for {clean_date}.",
            "date": clean_date
        }

    log_result = await engine.execute_backfill(clean_date)
    if log_result.status == "FAILED":
        return {
            "success": False,
            "message": log_result.error_message or f"Backfill failed for {clean_date}",
            "log": FetchLogSchema.model_validate(log_result)
        }

    return {
        "success": True,
        "message": f"Successfully backfilled historical market data for {clean_date}.",
        "log": FetchLogSchema.model_validate(log_result)
    }

@router.get("/logs", response_model=List[FetchLogSchema])
async def get_fetch_logs(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Returns audit log of all automated and manual fetch runs."""
    q = await db.execute(select(FetchLog).order_by(desc(FetchLog.id)).limit(limit))
    logs = q.scalars().all()
    return [FetchLogSchema.model_validate(l) for l in logs]
