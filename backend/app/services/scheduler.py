import os
import json
import shutil
import logging
import asyncio
from datetime import datetime, date
from pathlib import Path
from typing import Optional, List, Dict, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

from app.services.nse_fetcher import run_market_sync, NSEFetcher
from app.services.excel_exporter import generate_full_export_bundle
from app.services.excel_sync import master_excel_sync
from app.models import FetchLog
from app.database import AsyncSessionLocal
from app.config import settings, DATA_DIR

logger = logging.getLogger("scheduler")
logger.setLevel(logging.INFO)

scheduler = AsyncIOScheduler()
ist_tz = pytz.timezone("Asia/Kolkata")

# Default User Downloads Folder
DEFAULT_DOWNLOADS_FOLDER = str(Path.home() / "Downloads" / "NSE_Market_Data")
CONFIG_FILE = DATA_DIR / "scheduler_config.json"

# In-memory runtime configuration with disk persistence
schedule_config: Dict[str, Any] = {
    "auto_download_enabled": True,
    "schedule_times": ["15:45", "16:30", "17:30"],
    "downloads_folder": DEFAULT_DOWNLOADS_FOLDER
}

def load_persisted_config():
    """Loads configuration from JSON file on startup."""
    global schedule_config
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                schedule_config.update(saved)
                logger.info(f"Loaded persisted scheduler config: {schedule_config}")
    except Exception as e:
        logger.warning(f"Failed to load scheduler config file: {e}")

def save_persisted_config():
    """Persists configuration to JSON file."""
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(schedule_config, f, indent=2)
            logger.info("Persisted scheduler config to disk.")
    except Exception as e:
        logger.error(f"Failed to persist scheduler config: {e}")

# Load initial config on module import
load_persisted_config()

async def auto_export_to_downloads(target_date: Optional[str] = None) -> List[str]:
    """Generates the full Excel export bundle and copies all workbooks and zip to the user's Downloads folder."""
    if not schedule_config.get("auto_download_enabled", True):
        logger.info("Auto-download to Downloads folder is disabled in settings.")
        return []

    dest_dir = Path(schedule_config.get("downloads_folder") or DEFAULT_DOWNLOADS_FOLDER)
    dest_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Generating full market export bundle for auto-download to: {dest_dir}")
    zip_path, files, t_date = await generate_full_export_bundle(target_date)

    saved_files = []
    # Copy Zip bundle
    if os.path.exists(zip_path):
        target_zip = dest_dir / os.path.basename(zip_path)
        shutil.copy2(zip_path, target_zip)
        saved_files.append(str(target_zip))
        logger.info(f"Saved ZIP bundle to: {target_zip}")

    # Copy individual .xlsx spreadsheets
    for f in files:
        if os.path.exists(f):
            target_xlsx = dest_dir / os.path.basename(f)
            shutil.copy2(f, target_xlsx)
            saved_files.append(str(target_xlsx))
            logger.info(f"Saved Excel workbook to: {target_xlsx}")

    return saved_files

async def scheduled_daily_fetch_job():
    """Daily market data fetch job executed by APScheduler post-market close."""
    logger.info("APScheduler triggered post-market-close sync job.")
    fetcher = NSEFetcher()
    is_holiday, reason = fetcher.is_market_holiday_or_weekend(date.today())

    if is_holiday:
        logger.info(f"Skipping scheduled sync: {reason}")
        today_str = date.today().strftime("%Y-%m-%d")
        async with AsyncSessionLocal() as db:
            log_entry = FetchLog(
                run_timestamp=datetime.utcnow(),
                trade_date=today_str,
                status="SKIPPED_HOLIDAY",
                source="AUTOMATED",
                rows_fetched=0,
                indices_count=0,
                stocks_count=0,
                stock_details_count=0,
                duration_seconds=0.0,
                error_message=f"Scheduled sync skipped: {reason}"
            )
            db.add(log_entry)
            await db.commit()
        return

    logger.info("Executing scheduled sync for active trading day...")
    fetch_log = await run_market_sync(source="AUTOMATED", fetch_details=True)

    # If sync succeeded, automatically update master workbooks and save Excel files to user's Downloads folder
    if fetch_log and fetch_log.status == "SUCCESS":
        try:
            await master_excel_sync.append_daily_data(fetch_log.trade_date)
            saved = await auto_export_to_downloads(fetch_log.trade_date)
            logger.info(f"Auto-download and Master sync completed successfully: {len(saved)} files saved to {schedule_config['downloads_folder']}")
        except Exception as e:
            logger.error(f"Error during master sync / auto-export to downloads folder: {e}")

def register_cron_jobs():
    """Registers APScheduler cron triggers for configured IST times."""
    # Remove existing jobs
    for job in list(scheduler.get_jobs()):
        if job.id.startswith("nse_daily_sync_"):
            scheduler.remove_job(job.id)

    if not schedule_config.get("auto_download_enabled", True):
        logger.info("Scheduled auto-download is disabled. No cron jobs registered.")
        return

    times = schedule_config.get("schedule_times", ["16:30"])
    for ct in times:
        parts = ct.strip().split(":")
        if len(parts) == 2:
            try:
                hr, mn = int(parts[0]), int(parts[1])
                scheduler.add_job(
                    scheduled_daily_fetch_job,
                    trigger=CronTrigger(hour=hr, minute=mn, day_of_week="mon-fri", timezone=ist_tz),
                    id=f"nse_daily_sync_{hr}_{mn}",
                    name=f"NSE Daily Sync at {hr:02d}:{mn:02d} IST",
                    replace_existing=True
                )
                logger.info(f"Registered scheduled job at {hr:02d}:{mn:02d} IST (Mon-Fri)")
            except ValueError:
                pass

_adaptive_task: Optional[asyncio.Task] = None
_adaptive_status: Dict[str, Any] = {
    "is_market_open": False,
    "interval_seconds": 600,
    "interval_label": "10 minutes (Market Closed)",
    "market_status": "Post-Market / Closed",
    "last_sync_time": None
}

def get_adaptive_sync_info() -> Dict[str, Any]:
    """Returns current adaptive sync status and cadence info."""
    return _adaptive_status

async def adaptive_auto_sync_loop():
    """
    Continuous adaptive background worker:
    - When market is OPEN (09:15 - 15:30 IST, Mon-Fri): syncs every 1 MINUTE.
    - When market is CLOSED / Weekend / Holiday: syncs every 10 MINUTES for post-market filings.
    """
    global _adaptive_status
    logger.info("Starting continuous adaptive market sync engine (1 min open / 10 min closed)...")
    
    # Short warm-up delay on boot
    await asyncio.sleep(2.0)
    
    while True:
        try:
            fetcher = NSEFetcher()
            is_open, status_text = fetcher.is_market_open()
            
            # Determine cadence based on real-time market status
            if is_open:
                interval = 60       # 1 minute during active market trading
                source_label = "AUTO_1MIN_LIVE"
                interval_label = "1 minute (Live Market)"
            else:
                interval = 600      # 10 minutes when market is closed
                source_label = "AUTO_10MIN_POST"
                interval_label = "10 minutes (Market Closed)"

            _adaptive_status["is_market_open"] = is_open
            _adaptive_status["interval_seconds"] = interval
            _adaptive_status["interval_label"] = interval_label
            _adaptive_status["market_status"] = status_text

            logger.info(f"🔄 [Adaptive Sync] Status: {status_text} | Running {interval_label} sync...")
            
            # Execute full database update
            fetch_log = await run_market_sync(source=source_label, fetch_details=True)
            if fetch_log:
                _adaptive_status["last_sync_time"] = datetime.now(ist_tz).strftime("%Y-%m-%d %H:%M:%S IST")
                if fetch_log.status == "SUCCESS" and fetch_log.trade_date:
                    try:
                        await master_excel_sync.append_daily_data(fetch_log.trade_date)
                    except Exception as me:
                        logger.warning(f"Error appending to master workbooks in adaptive sync: {me}")
                logger.info(f"✅ [Adaptive Sync] Cycle finished: {fetch_log.status} ({fetch_log.rows_fetched} records)")

            # Sleep for the exact cadence
            await asyncio.sleep(interval)

        except asyncio.CancelledError:
            logger.info("Adaptive sync loop cancelled.")
            break
        except Exception as e:
            logger.error(f"❌ [Adaptive Sync] Error during cycle: {e}")
            await asyncio.sleep(30)  # Retry in 30s on unexpected exception

def start_scheduler():
    """Initializes and starts APScheduler cron jobs and continuous adaptive auto-sync loop."""
    global _adaptive_task
    load_persisted_config()
    register_cron_jobs()
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started successfully.")
    
    # Start continuous adaptive sync background task if not already running
    if _adaptive_task is None or _adaptive_task.done():
        _adaptive_task = asyncio.create_task(adaptive_auto_sync_loop())
        logger.info("Adaptive auto-sync background worker spawned.")

def update_schedule_settings(enabled: bool, times: List[str], folder: Optional[str] = None):
    """Updates runtime schedule configuration, persists to disk, and updates cron jobs."""
    schedule_config["auto_download_enabled"] = enabled
    schedule_config["schedule_times"] = times
    if folder:
        schedule_config["downloads_folder"] = folder
    
    save_persisted_config()
    register_cron_jobs()
    logger.info(f"Updated scheduler settings: enabled={enabled}, times={times}, folder={schedule_config['downloads_folder']}")

def shutdown_scheduler():
    global _adaptive_task
    if _adaptive_task and not _adaptive_task.done():
        _adaptive_task.cancel()
        logger.info("Adaptive auto-sync background worker stopped.")
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")

def get_next_run_time() -> Optional[str]:
    """Returns human-readable next execution time in IST."""
    if not schedule_config.get("auto_download_enabled", True):
        return "Disabled (Turn on toggle to enable)"
    
    if scheduler.running:
        jobs = scheduler.get_jobs()
        next_times = [j.next_run_time for j in jobs if j.next_run_time]
        if next_times:
            earliest = min(next_times)
            return earliest.astimezone(ist_tz).strftime("%Y-%m-%d %H:%M:%S IST")

    # If scheduler is idle or calculating statically:
    times = schedule_config.get("schedule_times", ["16:30"])
    now_ist = datetime.now(ist_tz)
    calculated_times = []
    for ct in times:
        parts = ct.strip().split(":")
        if len(parts) == 2:
            try:
                hr, mn = int(parts[0]), int(parts[1])
                trig = CronTrigger(hour=hr, minute=mn, day_of_week="mon-fri", timezone=ist_tz)
                nxt = trig.get_next_fire_time(None, now_ist)
                if nxt:
                    calculated_times.append(nxt)
            except Exception:
                pass
    if calculated_times:
        return min(calculated_times).astimezone(ist_tz).strftime("%Y-%m-%d %H:%M:%S IST")
    return None
