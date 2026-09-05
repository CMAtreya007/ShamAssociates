import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.database import init_db
from app.services.scheduler import start_scheduler, shutdown_scheduler
from app.services.live_stream import live_stream_manager
from app.services.auth import get_current_user
from app.routers import auth, data, fetch, export, stream, settings as settings_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("nse_app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database tables and background scheduler
    logger.info("Initializing SQLite database tables...")
    await init_db()
    
    logger.info("Starting background scheduler...")
    start_scheduler()
    
    logger.info("Starting real-time live market streaming engine...")
    live_stream_manager.start()

    # Automatically scan for and recover any missing trading days from NSE Archives
    from app.services.historical_backfill import auto_detect_and_backfill_missing_days
    import asyncio
    asyncio.create_task(auto_detect_and_backfill_missing_days(days_back=14))

    logger.info(f"NSE Automation Backend is running on http://{settings.HOST}:{settings.PORT}")
    yield
    # Shutdown: stop scheduler and live stream cleanly
    logger.info("Shutting down live market stream engine and scheduler...")
    live_stream_manager.stop()
    shutdown_scheduler()

app = FastAPI(
    title="NSE Market Data Automation API",
    description="Automated live capture, real-time streaming, and formatted Excel export for NSE equity and indices.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for local Vite, web hosting, and desktop shells
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Export-Date", "X-Files-Count", "WWW-Authenticate"]
)

# 1. Public Authentication & WebSocket Routers
app.include_router(auth.router)
app.include_router(stream.router)

# 2. Protected Business & Data Routers (Require Valid JWT Session Token)
app.include_router(data.router, dependencies=[Depends(get_current_user)])
app.include_router(fetch.router, dependencies=[Depends(get_current_user)])
app.include_router(export.router, dependencies=[Depends(get_current_user)])
app.include_router(settings_router.router, dependencies=[Depends(get_current_user)])

# 3. Healthcheck Endpoint
@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "app": "NSE Market Data Automation API",
        "version": "1.0.0",
        "live_stream": "Active"
    }

# 4. Production Static Single Page App (SPA) Serving
frontend_dist_dir = settings.FRONTEND_DIST
if frontend_dist_dir.exists() and (frontend_dist_dir / "index.html").exists():
    logger.info(f"Mounting production frontend build from {frontend_dist_dir}")
    
    # Mount assets subfolder if present
    assets_dir = frontend_dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Serve index.html for root and SPA routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow API docs and openapi to pass through
        if full_path in ("docs", "openapi.json", "redoc"):
            return None
        file_path = frontend_dist_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dist_dir / "index.html"))
else:
    @app.get("/")
    async def root():
        return {
            "status": "online",
            "app": "NSE Market Data Automation API",
            "version": "1.0.0",
            "live_stream": "Active",
            "docs_url": "/docs",
            "note": "Frontend dist not detected. In dev mode run Vite frontend on port 5180."
        }
