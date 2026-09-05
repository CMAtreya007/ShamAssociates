import os
import sys
import argparse
import asyncio
import logging

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import init_db
from app.services.nse_scraper import NSEScraper
from app.services.nse_fetcher import run_market_sync
from app.services.excel_sync import master_excel_sync
from app.services.db_manager import DatabaseManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("nse_cli")

async def cmd_sync(args):
    """Triggers live market sync and updates master workbooks."""
    logger.info("Initializing database...")
    await init_db()
    
    logger.info(f"Running live market sync (source: MANUAL_CLI, target_date: {args.date})...")
    log_entry = await run_market_sync(source="MANUAL_CLI", fetch_details=True, target_date=args.date)
    
    if log_entry and log_entry.status == "SUCCESS":
        logger.info(f"Sync successful: {log_entry.rows_fetched} records fetched.")
        logger.info("Updating Master Workbooks (broad_market_indices_master.xlsx & nifty50_daily_master.xlsx)...")
        idx_path, n50_path = await master_excel_sync.sync_all_masters()
        logger.info(f"Master Indices Workbook: {idx_path}")
        logger.info(f"Master Nifty 50 Workbook: {n50_path}")
    else:
        logger.warning(f"Sync finished with status: {log_entry.status if log_entry else 'FAILED'}")

async def cmd_build_masters(args):
    """Rebuilds master workbooks from all historical data in local SQLite database."""
    logger.info("Initializing database...")
    await init_db()
    
    logger.info("Rebuilding Master Workbooks from historical database...")
    idx_path, n50_path = await master_excel_sync.sync_all_masters()
    logger.info(f"✅ Master Indices Workbook built: {idx_path}")
    logger.info(f"✅ Master Nifty 50 Workbook built: {n50_path}")

async def cmd_ingest(args):
    """Ingests external daily .xlsx files into database and updates master workbooks."""
    logger.info("Initializing database...")
    await init_db()
    
    path = args.path
    if not os.path.exists(path):
        logger.error(f"Path does not exist: {path}")
        sys.exit(1)
        
    logger.info(f"Starting ingestion from: {path}")
    result = await master_excel_sync.ingest_historical_excel_files(path)
    logger.info("✅ Ingestion Complete Summary:")
    logger.info(f"  - Indices Records Imported: {result['indices_imported']}")
    logger.info(f"  - Nifty 50 Records Imported: {result['nifty50_imported']}")
    logger.info(f"  - Master Indices Path: {result['master_indices_path']}")
    logger.info(f"  - Master Nifty 50 Path: {result['master_nifty50_path']}")

def main():
    parser = argparse.ArgumentParser(description="NSEpulse Master Data Synchronization & Ingestion CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Command: sync
    sync_parser = subparsers.add_parser("sync", help="Trigger live NSE data sync and update Master Workbooks")
    sync_parser.add_argument("--date", type=str, default=None, help="Target trade date (YYYY-MM-DD)")

    # Command: build-masters
    subparsers.add_parser("build-masters", help="Rebuild Master Workbooks from all records in local SQLite")

    # Command: ingest
    ingest_parser = subparsers.add_parser("ingest", help="Ingest daily Excel files (*.xlsx) into DB and Master Workbooks")
    ingest_parser.add_argument("--path", type=str, required=True, help="Directory or file path containing .xlsx files")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "sync":
        asyncio.run(cmd_sync(args))
    elif args.command == "build-masters":
        asyncio.run(cmd_build_masters(args))
    elif args.command == "ingest":
        asyncio.run(cmd_ingest(args))

if __name__ == "__main__":
    main()
