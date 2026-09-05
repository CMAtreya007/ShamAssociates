from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text, JSON, UniqueConstraint, Index
)
from app.database import Base

class Nifty50Daily(Base):
    __tablename__ = "nifty50_daily"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    symbol = Column(String(50), nullable=False, index=True)
    company_name = Column(String(200), nullable=True)
    series = Column(String(10), default="EQ")
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    previous_close = Column(Float, nullable=True)
    ltp = Column(Float, nullable=True)
    change = Column(Float, nullable=True)
    pct_change = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    turnover = Column(Float, nullable=True)  # Total traded value in INR
    year_high = Column(Float, nullable=True)
    year_low = Column(Float, nullable=True)
    per_change_30d = Column(Float, nullable=True)
    per_change_365d = Column(Float, nullable=True)
    near_wkh = Column(Float, nullable=True)
    near_wkl = Column(Float, nullable=True)
    ffmc = Column(Float, nullable=True)  # Free float market cap
    last_update_time = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("date", "symbol", name="uq_nifty50_date_symbol"),
        Index("ix_nifty50_date_symbol", "date", "symbol"),
    )

class StockDetailDaily(Base):
    __tablename__ = "stock_detail_daily"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    symbol = Column(String(50), nullable=False, index=True)
    company_name = Column(String(200), nullable=True)
    industry = Column(String(100), nullable=True)
    isin = Column(String(50), nullable=True)
    delivery_pct = Column(Float, nullable=True)
    face_value = Column(Float, nullable=True)
    daily_volatility = Column(Float, nullable=True)
    annual_volatility = Column(Float, nullable=True)
    issued_capital = Column(Float, nullable=True)
    applicable_margin = Column(Float, nullable=True)
    impact_cost = Column(Float, nullable=True)
    free_float_mcap = Column(Float, nullable=True)
    total_turnover = Column(Float, nullable=True)
    total_volume = Column(Float, nullable=True)
    trade_info = Column(JSON, nullable=True)
    price_info = Column(JSON, nullable=True)
    security_info = Column(JSON, nullable=True)
    order_book = Column(JSON, nullable=True)
    meta_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("date", "symbol", name="uq_stock_detail_date_symbol"),
        Index("ix_stock_detail_date_symbol", "date", "symbol"),
    )

class IndexDaily(Base):
    __tablename__ = "index_daily"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    index_category = Column(String(100), nullable=False, index=True)  # Broad Market, Sectoral, Thematic, Strategy
    index_name = Column(String(100), nullable=False, index=True)
    index_symbol = Column(String(100), nullable=True)
    value = Column(Float, nullable=True)  # last price
    variation = Column(Float, nullable=True)
    pct_change = Column(Float, nullable=True)
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    previous_close = Column(Float, nullable=True)
    year_high = Column(Float, nullable=True)
    year_low = Column(Float, nullable=True)
    pe = Column(Float, nullable=True)
    pb = Column(Float, nullable=True)
    dy = Column(Float, nullable=True)
    advances = Column(Integer, nullable=True)
    declines = Column(Integer, nullable=True)
    unchanged = Column(Integer, nullable=True)
    per_change_30d = Column(Float, nullable=True)
    per_change_365d = Column(Float, nullable=True)
    one_week_ago_val = Column(Float, nullable=True)
    one_month_ago_val = Column(Float, nullable=True)
    one_year_ago_val = Column(Float, nullable=True)
    raw_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("date", "index_name", name="uq_index_date_name"),
        Index("ix_index_date_category", "date", "index_category"),
    )

class IndexConstituents(Base):
    __tablename__ = "index_constituents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    index_name = Column(String(100), nullable=False, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    company_name = Column(String(200), nullable=True)
    industry = Column(String(100), nullable=True)
    isin = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("index_name", "symbol", name="uq_constituents_index_symbol"),
    )

class CorporateAction(Base):
    __tablename__ = "corporate_actions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    symbol = Column(String(30), nullable=False, index=True)
    company_name = Column(String(150), nullable=True)
    series = Column(String(10), default="EQ")
    subject = Column(Text, nullable=False)
    action_type = Column(String(50), nullable=False, index=True)  # DIVIDEND, SPLIT, BONUS, RESULTS, BUYBACK, RIGHTS, AGM, OTHER
    ex_date = Column(String(20), nullable=True, index=True)
    record_date = Column(String(20), nullable=True)
    bc_start_date = Column(String(20), nullable=True)
    bc_end_date = Column(String(20), nullable=True)
    nd_start_date = Column(String(20), nullable=True)
    nd_end_date = Column(String(20), nullable=True)
    details = Column(Text, nullable=True)
    priority_level = Column(Integer, default=3, index=True)  # 1 (Highest/Critical) to 4 (Standard)
    raw_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("symbol", "subject", "ex_date", name="uq_corporate_action"),
        Index("ix_corp_action_symbol_date", "symbol", "ex_date"),
    )

class CorporateAnnouncement(Base):
    __tablename__ = "corporate_announcements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    symbol = Column(String(30), nullable=False, index=True)
    company_name = Column(String(150), nullable=True)
    broadcast_date = Column(String(40), nullable=False, index=True)
    subject = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    attachment_url = Column(Text, nullable=True)
    raw_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("symbol", "broadcast_date", "subject", name="uq_corporate_announcement"),
    )

class FetchLog(Base):
    __tablename__ = "fetch_log"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    run_timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    trade_date = Column(String(10), nullable=True)
    status = Column(String(30), nullable=False)  # SUCCESS, PARTIAL, FAILED, SKIPPED_HOLIDAY, IN_PROGRESS
    source = Column(String(50), default="AUTOMATED")  # AUTOMATED, MANUAL
    rows_fetched = Column(Integer, default=0)
    indices_count = Column(Integer, default=0)
    stocks_count = Column(Integer, default=0)
    stock_details_count = Column(Integer, default=0)
    corporate_actions_count = Column(Integer, default=0)
    duration_seconds = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)
