import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.services.scheduler import start_scheduler, shutdown_scheduler
from app.services.live_stream import live_stream_manager
from app.routers import data, fetch, export, stream, settings as settings_router

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

# Configure CORS for local Vite and Tauri desktop shell
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "tauri://localhost",
        "http://tauri.localhost",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Export-Date", "X-Files-Count"]
)

# Include Routers
app.include_router(stream.router)
app.include_router(fetch.router)
app.include_router(data.router)
app.include_router(export.router)
app.include_router(settings_router.router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "app": "NSE Market Data Automation API",
        "version": "1.0.0",
        "live_stream": "Active",
        "docs_url": "/docs"
    }
