import os
from pathlib import Path
from datetime import datetime, date as dt_date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Nifty50Daily, FetchLog
from app.services.excel_exporter import generate_full_export_bundle
from app.services.nse_fetcher import NSEFetcher
from app.schemas import ExportResponse
from app.config import settings

router = APIRouter(prefix="/api/export", tags=["Excel Export"])

async def resolve_last_synced_nse_trade_date(db: AsyncSession, requested_date: Optional[str] = None) -> Optional[str]:
    """Resolves to the last actual live synced trading date from NSE, automatically skipping
    weekends and government / trading holidays.
    """
    fetcher = NSEFetcher()

    if requested_date:
        try:
            dt_req = datetime.strptime(requested_date, "%Y-%m-%d").date()
            is_closed, _ = fetcher.is_market_holiday_or_weekend(dt_req)
            if not is_closed:
                # Verify that this requested date actually has synced data in DB
                q_chk = await db.execute(
                    select(func.count(Nifty50Daily.id)).where(Nifty50Daily.date == requested_date)
                )
                cnt = q_chk.scalar() or 0
                if cnt >= 20:  # Valid synced trading session
                    return requested_date
        except Exception:
            pass

    # If requested date was a weekend/government holiday or empty, find the latest date in DB with real synced data
    q_dates = await db.execute(
        select(Nifty50Daily.date).distinct().order_by(desc(Nifty50Daily.date))
    )
    all_dates = q_dates.scalars().all()

    for d_str in all_dates:
        try:
            d_obj = datetime.strptime(d_str, "%Y-%m-%d").date()
            is_hol_or_wknd, _ = fetcher.is_market_holiday_or_weekend(d_obj)
            if not is_hol_or_wknd:
                return d_str
        except Exception:
            pass

    # Fallback to the latest available date in database if all were flagged
    return all_dates[0] if all_dates else None

@router.post("/full")
async def export_full_dataset(
    date: Optional[str] = Query(None, description="Trade date to export in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """Generates both styled Excel workbooks (Nifty 50 + Broad Market Indices) and returns ZIP file download.
    On weekends and government holidays, the export and all internal spreadsheet dates automatically reflect
    the last live synced trading date from NSE.
    """
    resolved_date = await resolve_last_synced_nse_trade_date(db, date)

    if not resolved_date:
        raise HTTPException(status_code=400, detail="No market data available to export. Please run a sync first.")

    try:
        zip_path, files, export_date = await generate_full_export_bundle(resolved_date)
        file_size = os.path.getsize(zip_path)

        return FileResponse(
            path=zip_path,
            filename=f"NSE_Market_Data_{export_date}.zip",
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="NSE_Market_Data_{export_date}.zip"',
                "X-Export-Date": export_date,
                "X-Files-Count": str(len(files)),
                "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Date, X-Files-Count"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Excel export: {str(e)}")

@router.get("/download/{filename}")
async def download_file(filename: str):
    """Direct file download endpoint for individual workbooks."""
    export_root = Path(settings.EXPORT_DIR)
    target_files = list(export_root.glob(f"**/{filename}"))
    if not target_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = target_files[0]
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
