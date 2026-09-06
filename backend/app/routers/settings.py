from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models import UserSettings
from app.services.auth import get_current_user
from app.services.scheduler import (
    DEFAULT_DOWNLOADS_FOLDER,
    schedule_config, 
    update_schedule_settings, 
    auto_export_to_downloads,
    get_next_run_time
)

router = APIRouter(prefix="/api/settings", tags=["Application Settings & Scheduler"])

class ScheduleSettingsRequest(BaseModel):
    auto_download_enabled: bool = Field(True, description="Whether to automatically download all Excel files daily")
    schedule_times: List[str] = Field(default=["15:45", "16:30", "17:30"], description="List of HH:MM IST times to run auto-download")
    downloads_folder: Optional[str] = Field(None, description="Custom downloads folder path")
    auto_download_mode: Optional[str] = Field("MARKET_SYNC", description="Auto-download trigger mode")

from fastapi import APIRouter, HTTPException, Depends, Request

async def get_or_create_user_settings(username: str, db: AsyncSession, client_ip: Optional[str] = None) -> UserSettings:
    """Retrieves existing UserSettings or initializes default record with system Downloads folder and IP tracking."""
    q = await db.execute(select(UserSettings).where(UserSettings.username == username))
    user_setting = q.scalars().first()

    if not user_setting:
        user_setting = UserSettings(
            username=username,
            downloads_folder=DEFAULT_DOWNLOADS_FOLDER,
            client_ip=client_ip or "127.0.0.1",
            auto_download_enabled=True,
            schedule_times=["15:45", "16:30", "17:30"],
            auto_download_mode="MARKET_SYNC"
        )
        db.add(user_setting)
        try:
            await db.commit()
            await db.refresh(user_setting)
        except Exception:
            await db.rollback()
            q2 = await db.execute(select(UserSettings).where(UserSettings.username == username))
            user_setting = q2.scalars().first() or user_setting
    elif client_ip and user_setting.client_ip != client_ip:
        user_setting.client_ip = client_ip
        try:
            await db.commit()
            await db.refresh(user_setting)
        except Exception:
            pass

    return user_setting

def extract_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.get("/schedule")
async def get_schedule_settings(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Returns current auto-download and scheduler configuration for the authenticated user and system IP."""
    username = current_user.get("username", "admin")
    client_ip = extract_client_ip(request)
    setting = await get_or_create_user_settings(username, db, client_ip=client_ip)

    return {
        "username": username,
        "client_ip": client_ip,
        "auto_download_enabled": setting.auto_download_enabled,
        "schedule_times": setting.schedule_times or ["15:45", "16:30", "17:30"],
        "downloads_folder": setting.downloads_folder or DEFAULT_DOWNLOADS_FOLDER,
        "auto_download_mode": setting.auto_download_mode or "MARKET_SYNC",
        "last_download_date": setting.last_download_date,
        "default_system_downloads": DEFAULT_DOWNLOADS_FOLDER,
        "next_run_time": get_next_run_time()
    }

@router.post("/schedule")
async def save_schedule_settings(
    req: ScheduleSettingsRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Updates auto-download schedule time, toggle, and downloads directory in SQLite for user and system IP."""
    username = current_user.get("username", "admin")
    client_ip = extract_client_ip(request)
    setting = await get_or_create_user_settings(username, db, client_ip=client_ip)

    clean_times = [t.strip() for t in req.schedule_times if ":" in t]
    if not clean_times:
        clean_times = ["15:45", "16:30"]

    folder = req.downloads_folder.strip() if req.downloads_folder else DEFAULT_DOWNLOADS_FOLDER

    setting.auto_download_enabled = req.auto_download_enabled
    setting.schedule_times = clean_times
    setting.downloads_folder = folder
    setting.client_ip = client_ip
    if req.auto_download_mode:
        setting.auto_download_mode = req.auto_download_mode
    setting.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(setting)

    # Sync scheduler global config
    update_schedule_settings(
        enabled=setting.auto_download_enabled,
        times=clean_times,
        folder=setting.downloads_folder
    )

    return {
        "success": True,
        "message": f"Updated settings for user '{username}' on IP {client_ip}. Destination: {setting.downloads_folder}",
        "user_settings": {
            "username": setting.username,
            "client_ip": setting.client_ip,
            "auto_download_enabled": setting.auto_download_enabled,
            "schedule_times": setting.schedule_times,
            "downloads_folder": setting.downloads_folder,
            "next_run_time": get_next_run_time()
        }
    }

class TriggerAutoDownloadRequest(BaseModel):
    target_date: Optional[str] = None
    destination_folder: Optional[str] = None

@router.post("/trigger-auto-download")
async def trigger_immediate_auto_download(
    request: Request,
    req: Optional[TriggerAutoDownloadRequest] = None,
    target_date: Optional[str] = None,
    dest_folder: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Triggers an immediate export of all Excel workbooks and saves directly to the user's Downloads folder."""
    username = current_user.get("username", "admin")
    client_ip = extract_client_ip(request)
    setting = await get_or_create_user_settings(username, db, client_ip=client_ip)

    t_date = (req.target_date if req and req.target_date else target_date)
    chosen_dest = (req.destination_folder if req and req.destination_folder else dest_folder) or setting.downloads_folder or DEFAULT_DOWNLOADS_FOLDER

    if chosen_dest and chosen_dest != setting.downloads_folder:
        setting.downloads_folder = chosen_dest
        await db.commit()

    try:
        saved_files = await auto_export_to_downloads(t_date, dest_folder=chosen_dest)
        setting.last_download_date = t_date or datetime.utcnow().strftime("%Y-%m-%d")
        await db.commit()

        return {
            "success": True,
            "message": f"Successfully exported {len(saved_files)} files to {chosen_dest}",
            "saved_files": saved_files,
            "destination_folder": chosen_dest
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to auto-download files: {str(e)}")

