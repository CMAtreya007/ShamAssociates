import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Tuple, Set
from sqlalchemy import select, and_, desc, asc, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, init_db
from app.models import (
    Nifty50Daily,
    StockDetailDaily,
    IndexDaily,
    IndexConstituents,
    CorporateAction,
    CorporateAnnouncement,
    FetchLog
)

logger = logging.getLogger("db_manager")

class DatabaseManager:
    """
    Dedicated local database persistence and analytics access layer (SQLite):
    - indices_history (market_indices): (date, index_symbol)
    - nifty50_overview_history (nifty50_daily): (date, symbol)
    - stock_analytics_history (stock_detail_daily): (date, symbol)
    - corporate_actions_history (corporate_actions)
    """

    @staticmethod
    async def initialize():
        """Initializes database tables if not already created."""
        await init_db()

    @staticmethod
    async def get_available_trade_dates() -> List[str]:
        """Returns all distinct trade dates sorted chronologically ascending."""
        async with AsyncSessionLocal() as db:
            q = await db.execute(
                select(Nifty50Daily.date).distinct().order_by(asc(Nifty50Daily.date))
            )
            dates = [row[0] for row in q.all() if row[0]]
            if not dates:
                q_idx = await db.execute(
                    select(IndexDaily.date).distinct().order_by(asc(IndexDaily.date))
                )
                dates = [row[0] for row in q_idx.all() if row[0]]
            return sorted(list(set(dates)))

    @staticmethod
    async def get_all_indices_history(category: Optional[str] = None) -> List[IndexDaily]:
        """Returns all historical index records sorted by date ascending, then pct_change descending."""
        async with AsyncSessionLocal() as db:
            query = select(IndexDaily)
            if category:
                query = query.where(IndexDaily.index_category == category)
            query = query.order_by(asc(IndexDaily.date), desc(IndexDaily.pct_change))
            res = await db.execute(query)
            return res.scalars().all()

    @staticmethod
    async def get_indices_by_date(trade_date: str, category: Optional[str] = None) -> List[IndexDaily]:
        """Returns all indices for a specific trade date."""
        async with AsyncSessionLocal() as db:
            query = select(IndexDaily).where(IndexDaily.date == trade_date)
            if category:
                query = query.where(IndexDaily.index_category == category)
            query = query.order_by(desc(IndexDaily.pct_change))
            res = await db.execute(query)
            return res.scalars().all()

    @staticmethod
    async def get_all_nifty50_history() -> List[Nifty50Daily]:
        """Returns all Nifty 50 daily records sorted by date ascending, then symbol ascending."""
        async with AsyncSessionLocal() as db:
            query = select(Nifty50Daily).order_by(asc(Nifty50Daily.date), asc(Nifty50Daily.symbol))
            res = await db.execute(query)
            return res.scalars().all()

    @staticmethod
    async def get_nifty50_by_date(trade_date: str) -> List[Nifty50Daily]:
        """Returns Nifty 50 records for a given date sorted by % change descending."""
        async with AsyncSessionLocal() as db:
            query = select(Nifty50Daily).where(Nifty50Daily.date == trade_date).order_by(desc(Nifty50Daily.pct_change))
            res = await db.execute(query)
            return res.scalars().all()

    @staticmethod
    async def get_all_stock_details_history(symbol: Optional[str] = None) -> List[StockDetailDaily]:
        """Returns stock details history sorted by date ascending."""
        async with AsyncSessionLocal() as db:
            query = select(StockDetailDaily)
            if symbol:
                query = query.where(StockDetailDaily.symbol == symbol)
            query = query.order_by(asc(StockDetailDaily.date), asc(StockDetailDaily.symbol))
            res = await db.execute(query)
            return res.scalars().all()

    @staticmethod
    async def get_stock_details_by_date(trade_date: str, symbol: Optional[str] = None) -> List[StockDetailDaily]:
        """Returns stock details for a given date."""
        async with AsyncSessionLocal() as db:
            query = select(StockDetailDaily).where(StockDetailDaily.date == trade_date)
            if symbol:
                query = query.where(StockDetailDaily.symbol == symbol)
            res = await db.execute(query)
            return res.scalars().all()

    @staticmethod
    async def get_corporate_actions(symbol: Optional[str] = None) -> List[CorporateAction]:
        """Returns corporate actions sorted by ex_date descending."""
        async with AsyncSessionLocal() as db:
            query = select(CorporateAction)
            if symbol:
                query = query.where(CorporateAction.symbol == symbol)
            query = query.order_by(desc(CorporateAction.ex_date), desc(CorporateAction.id))
            res = await db.execute(query)
            return res.scalars().all()

    @staticmethod
    async def upsert_indices_records(records: List[Dict[str, Any]]) -> int:
        """Upserts a list of index records into the database with deduplication on (date, index_symbol)."""
        if not records:
            return 0
        inserted_or_updated = 0
        async with AsyncSessionLocal() as db:
            for item in records:
                d = item.get("date")
                sym = item.get("index_symbol") or item.get("index_name")
                if not d or not sym:
                    continue
                q = await db.execute(
                    select(IndexDaily).where(and_(IndexDaily.date == d, IndexDaily.index_symbol == sym))
                )
                existing = q.scalars().first()
                if existing:
                    for k, v in item.items():
                        if hasattr(existing, k) and v is not None:
                            setattr(existing, k, v)
                else:
                    new_rec = IndexDaily(**{k: v for k, v in item.items() if hasattr(IndexDaily, k)})
                    db.add(new_rec)
                inserted_or_updated += 1
            await db.commit()
        return inserted_or_updated

    @staticmethod
    async def upsert_nifty50_records(records: List[Dict[str, Any]]) -> int:
        """Upserts a list of Nifty 50 constituent records with deduplication on (date, symbol)."""
        if not records:
            return 0
        count = 0
        async with AsyncSessionLocal() as db:
            for item in records:
                d = item.get("date")
                sym = item.get("symbol")
                if not d or not sym:
                    continue
                q = await db.execute(
                    select(Nifty50Daily).where(and_(Nifty50Daily.date == d, Nifty50Daily.symbol == sym))
                )
                existing = q.scalars().first()
                if existing:
                    for k, v in item.items():
                        if hasattr(existing, k) and v is not None:
                            setattr(existing, k, v)
                else:
                    new_rec = Nifty50Daily(**{k: v for k, v in item.items() if hasattr(Nifty50Daily, k)})
                    db.add(new_rec)
                count += 1
            await db.commit()
        return count
