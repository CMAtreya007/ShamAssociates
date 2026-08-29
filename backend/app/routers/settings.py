from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from app.services.scheduler import (
    schedule_config, 
    update_schedule_settings, 
    auto_export_to_downloads,
    get_next_run_time
)

router = APIRouter(prefix="/api/settings", tags=["Application Settings & Scheduler"])

class ScheduleSettingsRequest(BaseModel):
    auto_download_enabled: bool = Field(True, description="Whether to automatically download all Excel files daily")
    schedule_times: List[str] = Field(default=["16:30", "17:00", "18:00"], description="List of HH:MM IST times to run auto-download")
    downloads_folder: Optional[str] = Field(None, description="Custom downloads folder path")

@router.get("/schedule")
async def get_schedule_settings() -> Dict[str, Any]:
    """Returns current auto-download and scheduler configuration."""
    return {
        "auto_download_enabled": schedule_config.get("auto_download_enabled", True),
        "schedule_times": schedule_config.get("schedule_times", ["16:30"]),
        "downloads_folder": schedule_config.get("downloads_folder"),
        "next_run_time": get_next_run_time()
    }

@router.post("/schedule")
async def save_schedule_settings(req: ScheduleSettingsRequest) -> Dict[str, Any]:
    """Updates auto-download schedule time, toggle, and downloads directory."""
    clean_times = [t.strip() for t in req.schedule_times if ":" in t]
    if not clean_times:
        clean_times = ["16:30"]

    update_schedule_settings(
        enabled=req.auto_download_enabled,
        times=clean_times,
        folder=req.downloads_folder
    )

    return {
        "success": True,
        "message": f"Updated auto-download schedule ({', '.join(clean_times)} IST).",
        "config": schedule_config,
        "next_run_time": get_next_run_time()
    }

@router.post("/trigger-auto-download")
async def trigger_immediate_auto_download(target_date: Optional[str] = None):
    """Triggers an immediate export of all Excel workbooks and saves directly to the user's Downloads folder."""
    try:
        saved_files = await auto_export_to_downloads(target_date)
        return {
            "success": True,
            "message": f"Successfully exported {len(saved_files)} files to {schedule_config.get('downloads_folder')}",
            "saved_files": saved_files,
            "destination_folder": schedule_config.get("downloads_folder")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to auto-download files: {str(e)}")
