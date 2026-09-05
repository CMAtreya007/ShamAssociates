from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db() -> None:
    # Ensure all models are loaded into Base metadata
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        # 1. Enable SQLite WAL and performance optimizations
        def configure_sqlite(sync_conn):
            cursor = sync_conn.connection.cursor()
            try:
                cursor.execute("PRAGMA journal_mode=WAL;")
                cursor.execute("PRAGMA synchronous=NORMAL;")
                cursor.execute("PRAGMA cache_size=-64000;")  # 64MB memory cache
                cursor.execute("PRAGMA temp_store=MEMORY;")
                cursor.execute("PRAGMA busy_timeout=10000;") # 10s wait before busy
            except Exception:
                pass
        
        await conn.run_sync(configure_sqlite)

        # 2. Create all tables defined in models
        await conn.run_sync(Base.metadata.create_all)
        
        # 3. Automatic SQLite column migrations
        def migrate_columns(sync_conn):
            cursor = sync_conn.connection.cursor()
            
            # Migration for stock_detail_daily
            cursor.execute("PRAGMA table_info(stock_detail_daily)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            
            new_columns = [
                ("isin", "VARCHAR(50)"),
                ("delivery_pct", "FLOAT"),
                ("face_value", "FLOAT"),
                ("daily_volatility", "FLOAT"),
                ("annual_volatility", "FLOAT"),
                ("issued_capital", "FLOAT"),
                ("applicable_margin", "FLOAT"),
                ("impact_cost", "FLOAT"),
                ("free_float_mcap", "FLOAT"),
                ("total_turnover", "FLOAT"),
                ("total_volume", "FLOAT"),
            ]
            for col_name, col_type in new_columns:
                if col_name not in existing_cols:
                    try:
                        cursor.execute(f"ALTER TABLE stock_detail_daily ADD COLUMN {col_name} {col_type}")
                    except Exception:
                        pass
        
            # Migration for index_daily
            cursor.execute("PRAGMA table_info(index_daily)")
            existing_idx_cols = {row[1] for row in cursor.fetchall()}
            idx_new_cols = [
                ("one_week_ago_val", "FLOAT"),
                ("one_month_ago_val", "FLOAT"),
                ("one_year_ago_val", "FLOAT"),
                ("raw_data", "JSON"),
            ]
            for col_name, col_type in idx_new_cols:
                if col_name not in existing_idx_cols:
                    try:
                        cursor.execute(f"ALTER TABLE index_daily ADD COLUMN {col_name} {col_type}")
                    except Exception:
                        pass
        
            # Migration for fetch_log
            cursor.execute("PRAGMA table_info(fetch_log)")
            existing_log_cols = {row[1] for row in cursor.fetchall()}
            if "corporate_actions_count" not in existing_log_cols:
                try:
                    cursor.execute("ALTER TABLE fetch_log ADD COLUMN corporate_actions_count INTEGER DEFAULT 0")
                except Exception:
                    pass
        
        await conn.run_sync(migrate_columns)
