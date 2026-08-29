from typing import Optional, List, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field

class Nifty50StockSchema(BaseModel):
    id: Optional[int] = None
    date: str
    symbol: str
    company_name: Optional[str] = None
    series: Optional[str] = "EQ"
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    previous_close: Optional[float] = None
    ltp: Optional[float] = None
    change: Optional[float] = None
    pct_change: Optional[float] = None
    volume: Optional[float] = None
    turnover: Optional[float] = None
    year_high: Optional[float] = None
    year_low: Optional[float] = None
    per_change_30d: Optional[float] = None
    per_change_365d: Optional[float] = None
    near_wkh: Optional[float] = None
    near_wkl: Optional[float] = None
    ffmc: Optional[float] = None
    last_update_time: Optional[str] = None
    catalysts: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

class StockDetailSchema(BaseModel):
    id: Optional[int] = None
    date: str
    symbol: str
    company_name: Optional[str] = None
    industry: Optional[str] = None
    isin: Optional[str] = None
    delivery_pct: Optional[float] = None
    face_value: Optional[float] = None
    daily_volatility: Optional[float] = None
    annual_volatility: Optional[float] = None
    issued_capital: Optional[float] = None
    applicable_margin: Optional[float] = None
    impact_cost: Optional[float] = None
    free_float_mcap: Optional[float] = None
    total_turnover: Optional[float] = None
    total_volume: Optional[float] = None
    trade_info: Optional[Dict[str, Any]] = None
    price_info: Optional[Dict[str, Any]] = None
    security_info: Optional[Dict[str, Any]] = None
    order_book: Optional[Dict[str, Any]] = None
    meta_data: Optional[Dict[str, Any]] = None
    actions: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

class IndexDailySchema(BaseModel):
    id: Optional[int] = None
    date: str
    index_category: str
    index_name: str
    index_symbol: Optional[str] = None
    value: Optional[float] = None
    variation: Optional[float] = None
    pct_change: Optional[float] = None
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    previous_close: Optional[float] = None
    year_high: Optional[float] = None
    year_low: Optional[float] = None
    pe: Optional[float] = None
    pb: Optional[float] = None
    dy: Optional[float] = None
    advances: Optional[int] = None
    declines: Optional[int] = None
    unchanged: Optional[int] = None
    per_change_30d: Optional[float] = None
    per_change_365d: Optional[float] = None
    one_week_ago_val: Optional[float] = None
    one_month_ago_val: Optional[float] = None
    one_year_ago_val: Optional[float] = None

    class Config:
        from_attributes = True

class CorporateActionSchema(BaseModel):
    id: Optional[int] = None
    symbol: str
    company_name: Optional[str] = None
    series: Optional[str] = "EQ"
    subject: str
    action_type: str
    ex_date: Optional[str] = None
    record_date: Optional[str] = None
    bc_start_date: Optional[str] = None
    bc_end_date: Optional[str] = None
    nd_start_date: Optional[str] = None
    nd_end_date: Optional[str] = None
    details: Optional[str] = None
    priority_level: int = 3
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CorporateAnnouncementSchema(BaseModel):
    id: Optional[int] = None
    symbol: str
    company_name: Optional[str] = None
    broadcast_date: str
    subject: str
    description: Optional[str] = None
    attachment_url: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class FetchLogSchema(BaseModel):
    id: int
    run_timestamp: datetime
    trade_date: Optional[str] = None
    status: str
    source: str
    rows_fetched: int
    indices_count: int
    stocks_count: int
    stock_details_count: int
    corporate_actions_count: Optional[int] = 0
    duration_seconds: float
    error_message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

class FetchStatusResponse(BaseModel):
    last_sync: Optional[FetchLogSchema] = None
    is_syncing: bool = False
    today_synced: bool = False
    latest_trade_date: Optional[str] = None
    total_records: int = 0
    next_scheduled_run: Optional[str] = None

class ManualFetchRequest(BaseModel):
    source: str = "MANUAL"
    fetch_details: bool = True  # whether to fetch deep stock details
    target_date: Optional[str] = None

class ExportResponse(BaseModel):
    success: bool
    message: str
    export_date: str
    files: List[str]
    zip_path: Optional[str] = None
    total_size_bytes: int = 0
