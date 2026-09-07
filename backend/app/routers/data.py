import asyncio
import logging
from datetime import date as dt_date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, asc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models import (
    Nifty50Daily, 
    StockDetailDaily, 
    IndexDaily, 
    IndexConstituents,
    CorporateAction, 
    CorporateAnnouncement,
    CustomStockWatchlist
)
from app.schemas import (
    Nifty50StockSchema, 
    StockDetailSchema, 
    IndexDailySchema, 
    CorporateActionSchema, 
    CorporateAnnouncementSchema,
    CustomStockAddRequest,
    CustomStockItemSchema,
    SymbolSearchResult
)
from app.services.nse_fetcher import NSEFetcher, safe_float, classify_corporate_action
from app.services.nse_symbols_master import search_master_equities, lookup_master_symbol
from app.services.cache_manager import ram_cache

logger = logging.getLogger(__name__)

def parse_nse_date(d_str: Optional[str]) -> datetime:
    """Parses various NSE date formats for accurate chronological sorting."""
    if not d_str or str(d_str).strip() in ("-", "", "None"):
        return datetime.min
    clean = str(d_str).strip()
    formats = [
        "%d-%b-%Y", "%d-%b-%y", "%d-%B-%Y",
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y",
        "%Y%m%d", "%d%b%Y"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean, fmt)
        except Exception:
            pass
    return datetime.min

router = APIRouter(prefix="/api/data", tags=["Market Data"])
fetcher = NSEFetcher()

@router.get("/available-dates", response_model=List[str])
async def get_available_dates(db: AsyncSession = Depends(get_db)):
    """Returns list of distinct trade dates available in local database."""
    cached = ram_cache.get("available_dates")
    if cached is not None:
        return cached

    q = await db.execute(
        select(Nifty50Daily.date).distinct().order_by(desc(Nifty50Daily.date))
    )
    dates = list(q.scalars().all())
    ram_cache.set("available_dates", dates, ttl=60.0)
    return dates

@router.get("/nifty50", response_model=List[Nifty50StockSchema])
async def get_nifty50_data(
    date: Optional[str] = Query(None, description="Trade date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """Returns Nifty 50 overview table with attached catalyst indicators for the specified date."""
    if not date:
        q_date = await db.execute(select(Nifty50Daily.date).order_by(desc(Nifty50Daily.date)).limit(1))
        date = q_date.scalars().first()

    if not date:
        return []

    cache_key = f"nifty50:{date}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    q = await db.execute(
        select(Nifty50Daily).where(Nifty50Daily.date == date).order_by(desc(Nifty50Daily.pct_change))
    )
    stocks = q.scalars().all()

    # Load all active corporate actions for these symbols
    symbols = [s.symbol for s in stocks]
    q_ca = await db.execute(
        select(CorporateAction).where(CorporateAction.symbol.in_(symbols)).order_by(asc(CorporateAction.priority_level))
    )
    all_ca = q_ca.scalars().all()
    ca_by_symbol = {}
    for ca in all_ca:
        ca_by_symbol.setdefault(ca.symbol, []).append({
            "action_type": ca.action_type,
            "subject": ca.subject,
            "ex_date": ca.ex_date,
            "record_date": ca.record_date,
            "priority_level": ca.priority_level,
            "details": ca.details
        })

    result = []
    for s in stocks:
        stock_dict = Nifty50StockSchema.model_validate(s)
        stock_dict.catalysts = ca_by_symbol.get(s.symbol, [])
        stock_dict.market_performance = round(s.ltp - s.previous_close, 2) if (s.ltp is not None and s.previous_close is not None) else (round(s.change, 2) if s.change is not None else None)
        stock_dict.premarket = round(s.open - s.previous_close, 2) if (s.open is not None and s.previous_close is not None) else None
        stock_dict.recover_from_low = round(s.ltp - s.low, 2) if (s.ltp is not None and s.low is not None) else None
        stock_dict.distance_from_high = round(s.ltp - s.high, 2) if (s.ltp is not None and s.high is not None) else None
        result.append(stock_dict)

    ram_cache.set(cache_key, result, ttl=30.0)
    return result

@router.get("/stock/{symbol}", response_model=StockDetailSchema)
async def get_stock_detail(
    symbol: str,
    date: Optional[str] = Query(None, description="Trade date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """Returns deep quote, security details, and corporate action timeline for a single stock with on-demand fallback."""
    symbol = symbol.upper().strip()
    target_date = date

    cache_key = f"stock_detail:{symbol}:{target_date or 'latest'}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    if not target_date:
        q_date = await db.execute(
            select(StockDetailDaily.date).where(StockDetailDaily.symbol == symbol).order_by(desc(StockDetailDaily.date)).limit(1)
        )
        target_date = q_date.scalars().first() or dt_date.today().strftime("%Y-%m-%d")

    # 1. Check local database
    q = await db.execute(
        select(StockDetailDaily).where(
            StockDetailDaily.symbol == symbol,
            StockDetailDaily.date == target_date
        )
    )
    detail = q.scalars().first()

    # If not found for target_date, try finding any latest detail record for that symbol
    if not detail:
        q_any = await db.execute(
            select(StockDetailDaily).where(StockDetailDaily.symbol == symbol).order_by(desc(StockDetailDaily.date)).limit(1)
        )
        detail = q_any.scalars().first()

    d_dict = None
    if detail:
        d_dict = {
            "id": detail.id,
            "date": detail.date,
            "symbol": detail.symbol,
            "company_name": detail.company_name,
            "industry": detail.industry,
            "isin": detail.isin,
            "delivery_pct": detail.delivery_pct,
            "face_value": detail.face_value,
            "daily_volatility": detail.daily_volatility,
            "annual_volatility": detail.annual_volatility,
            "issued_capital": detail.issued_capital,
            "applicable_margin": detail.applicable_margin,
            "impact_cost": detail.impact_cost,
            "free_float_mcap": detail.free_float_mcap,
            "total_turnover": detail.total_turnover,
            "total_volume": detail.total_volume,
            "trade_info": detail.trade_info or {},
            "price_info": detail.price_info or {},
            "security_info": detail.security_info or {},
            "order_book": detail.order_book or {},
            "meta_data": detail.meta_data or {},
        }

    # 2. If still not in DB, perform on-demand fetch from NSE!
    if not d_dict:
        try:
            detail_json = await asyncio.to_thread(fetcher.fetch_stock_details, symbol)
            if detail_json:
                t_info = detail_json.get("tradeInfo") or {}
                p_info = detail_json.get("priceInfo") or {}
                s_info = detail_json.get("secInfo") or {}
                o_book = detail_json.get("orderBook") or {}
                m_data = detail_json.get("metaData") or {}

                c_name = m_data.get("companyName")
                industry_name = s_info.get("basicIndustry") or m_data.get("industry")
                isin_val = m_data.get("isinCode") or s_info.get("isin") or m_data.get("isin")
                deliv_pct_val = safe_float(t_info.get("deliveryToTradedQuantity") or s_info.get("deliveryTotradedQuantity"))
                face_val = safe_float(t_info.get("faceValue") or s_info.get("faceValue"))
                daily_vol = safe_float(p_info.get("cmDailyVolatility") or p_info.get("dailyVolatility"))
                annual_vol = safe_float(p_info.get("cmAnnualVolatility") or p_info.get("annualisedVolatility"))
                issued_cap = safe_float(s_info.get("issuedSize") or t_info.get("issuedSize"))
                margin_val = safe_float(t_info.get("applicableMargin") or p_info.get("applicableMargin"))
                impact_val = safe_float(t_info.get("impactCost"))
                ffmc_val = safe_float(t_info.get("ffmc"))
                turnover_val = safe_float(t_info.get("totalTradedValue"))
                volume_val = safe_float(t_info.get("totalTradedVolume"))

                d_dict = {
                    "id": None,
                    "date": target_date,
                    "symbol": symbol,
                    "company_name": c_name,
                    "industry": industry_name,
                    "isin": isin_val,
                    "delivery_pct": deliv_pct_val,
                    "face_value": face_val,
                    "daily_volatility": daily_vol,
                    "annual_volatility": annual_vol,
                    "issued_capital": issued_cap,
                    "applicable_margin": margin_val,
                    "impact_cost": impact_val,
                    "free_float_mcap": ffmc_val,
                    "total_turnover": turnover_val,
                    "total_volume": volume_val,
                    "trade_info": t_info,
                    "price_info": p_info,
                    "security_info": s_info,
                    "order_book": o_book,
                    "meta_data": m_data,
                }

                new_detail = StockDetailDaily(
                    date=target_date,
                    symbol=symbol,
                    company_name=c_name,
                    industry=industry_name,
                    isin=isin_val,
                    delivery_pct=deliv_pct_val,
                    face_value=face_val,
                    daily_volatility=daily_vol,
                    annual_volatility=annual_vol,
                    issued_capital=issued_cap,
                    applicable_margin=margin_val,
                    impact_cost=impact_val,
                    free_float_mcap=ffmc_val,
                    total_turnover=turnover_val,
                    total_volume=volume_val,
                    trade_info=t_info,
                    price_info=p_info,
                    security_info=s_info,
                    order_book=o_book,
                    meta_data=m_data
                )
                try:
                    db.add(new_detail)
                    await db.commit()
                except Exception:
                    await db.rollback()
        except Exception:
            pass

    # 3. Fetch corporate actions for symbol from DB
    q_ca = await db.execute(
        select(CorporateAction).where(CorporateAction.symbol == symbol).order_by(asc(CorporateAction.priority_level), desc(CorporateAction.ex_date))
    )
    ca_rows = q_ca.scalars().all()

    # If no corporate actions in DB for this symbol, try on-demand fetch of actions
    if not ca_rows:
        try:
            stock_ca_list = await asyncio.to_thread(fetcher.fetch_stock_corporate_actions, symbol)
            for item in stock_ca_list:
                subj = item.get("subject")
                ex_d = item.get("exDate") or item.get("caBroadcastDate")
                if subj:
                    act_type, priority = classify_corporate_action(subj)
                    q_chk = await db.execute(
                        select(CorporateAction).where(
                            CorporateAction.symbol == symbol,
                            CorporateAction.subject == subj,
                            CorporateAction.ex_date == ex_d
                        )
                    )
                    if not q_chk.scalars().first():
                        new_ca = CorporateAction(
                            symbol=symbol,
                            company_name=item.get("comp"),
                            series=item.get("series", "EQ"),
                            subject=subj,
                            action_type=act_type,
                            ex_date=ex_d,
                            record_date=item.get("recDate"),
                            priority_level=priority,
                            raw_data=item
                        )
                        db.add(new_ca)
            
            stock_bm_list = await asyncio.to_thread(fetcher.fetch_stock_event_calendar, symbol)
            for ev in stock_bm_list:
                purpose = ev.get("purpose") or "Board Meeting"
                ev_date = ev.get("date")
                act_type, priority = classify_corporate_action(purpose, ev.get("bm_desc") or "")
                q_chk_bm = await db.execute(
                    select(CorporateAction).where(
                        CorporateAction.symbol == symbol,
                        CorporateAction.subject == purpose,
                        CorporateAction.ex_date == ev_date
                    )
                )
                if not q_chk_bm.scalars().first():
                    new_ev = CorporateAction(
                        symbol=symbol,
                        company_name=ev.get("company"),
                        series="EQ",
                        subject=purpose,
                        action_type=act_type,
                        ex_date=ev_date,
                        details=ev.get("bm_desc"),
                        priority_level=priority,
                        raw_data=ev
                    )
                    db.add(new_ev)

            try:
                await db.commit()
            except Exception:
                await db.rollback()

            q_ca2 = await db.execute(
                select(CorporateAction).where(CorporateAction.symbol == symbol).order_by(asc(CorporateAction.priority_level), desc(CorporateAction.ex_date))
            )
            ca_rows = q_ca2.scalars().all()
        except Exception:
            pass

    actions_list = [
        {
            "action_type": ca.action_type,
            "subject": ca.subject,
            "ex_date": ca.ex_date,
            "record_date": ca.record_date,
            "details": ca.details,
            "priority_level": ca.priority_level
        }
        for ca in ca_rows
    ]
    actions_list.sort(key=lambda x: parse_nse_date(x.get("ex_date")), reverse=True)

    if d_dict:
        detail_res = StockDetailSchema(
            id=d_dict["id"],
            date=d_dict["date"],
            symbol=d_dict["symbol"],
            company_name=d_dict["company_name"],
            industry=d_dict["industry"],
            isin=d_dict["isin"],
            delivery_pct=d_dict["delivery_pct"],
            face_value=d_dict["face_value"],
            daily_volatility=d_dict["daily_volatility"],
            annual_volatility=d_dict["annual_volatility"],
            issued_capital=d_dict["issued_capital"],
            applicable_margin=d_dict["applicable_margin"],
            impact_cost=d_dict["impact_cost"],
            free_float_mcap=d_dict["free_float_mcap"],
            total_turnover=d_dict["total_turnover"],
            total_volume=d_dict["total_volume"],
            trade_info=d_dict["trade_info"],
            price_info=d_dict["price_info"],
            security_info=d_dict["security_info"],
            order_book=d_dict["order_book"],
            meta_data=d_dict["meta_data"],
            actions=actions_list
        )
        ram_cache.set(cache_key, detail_res, ttl=60.0)
        return detail_res

    # 4. If detail is still None, create a graceful schema object using CorporateAction/Announcement metadata
    comp_name = ca_rows[0].company_name if ca_rows and ca_rows[0].company_name else symbol
    fallback_res = StockDetailSchema(
        date=target_date,
        symbol=symbol,
        company_name=comp_name,
        industry="Equities",
        trade_info={},
        price_info={},
        security_info={},
        order_book={},
        meta_data={"companyName": comp_name, "series": "EQ"},
        actions=actions_list
    )
    ram_cache.set(cache_key, fallback_res, ttl=60.0)
    return fallback_res

@router.get("/stock/{symbol}/actions", response_model=List[CorporateActionSchema])
async def get_stock_actions(
    symbol: str,
    db: AsyncSession = Depends(get_db)
):
    """Returns historical and upcoming corporate actions for an individual stock."""
    symbol = symbol.upper().strip()
    cache_key = f"stock_actions:{symbol}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    q = await db.execute(
        select(CorporateAction).where(CorporateAction.symbol == symbol).order_by(asc(CorporateAction.priority_level), desc(CorporateAction.ex_date))
    )
    actions = q.scalars().all()
    res = [CorporateActionSchema.model_validate(a) for a in actions]
    ram_cache.set(cache_key, res, ttl=60.0)
    return res

@router.get("/catalysts", response_model=List[CorporateActionSchema])
async def get_market_catalysts(
    scope: Optional[str] = Query("all", description="Scope: nifty50 or all"),
    action_type: Optional[str] = Query(None, description="Filter by action type: DIVIDEND, SPLIT, BONUS, RESULTS, etc."),
    limit: Optional[int] = Query(None, ge=1, description="Optional limit (omit for unlimited)"),
    db: AsyncSession = Depends(get_db)
):
    """Returns chronologically and priority-sorted upcoming/recent Corporate Catalysts & Actions."""
    cache_key = f"catalysts:{scope}:{action_type}:{limit}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        query = select(CorporateAction)

        if scope == "nifty50":
            q_n50 = await db.execute(select(Nifty50Daily.symbol).distinct())
            n50_symbols = q_n50.scalars().all()
            if n50_symbols:
                query = query.where(CorporateAction.symbol.in_(n50_symbols))

        if action_type:
            query = query.where(CorporateAction.action_type == action_type.upper().strip())

        max_limit = limit if (limit and limit > 0) else 300
        query = query.order_by(asc(CorporateAction.priority_level), desc(CorporateAction.ex_date)).limit(max_limit)

        q = await db.execute(query)
        actions = q.scalars().all()
        # Sort chronologically by true parsed date descending (latest/upcoming first)
        sorted_actions = sorted(actions, key=lambda a: parse_nse_date(a.ex_date), reverse=True)
        res = [CorporateActionSchema.model_validate(a) for a in sorted_actions]
        ram_cache.set(cache_key, res, ttl=30.0)
        return res
    except Exception as err:
        return []

@router.get("/announcements", response_model=List[CorporateAnnouncementSchema])
async def get_corporate_announcements(
    limit: Optional[int] = Query(None, ge=1, description="Optional limit (omit for unlimited)"),
    db: AsyncSession = Depends(get_db)
):
    """Returns recent corporate regulatory announcements and filings."""
    cache_key = f"announcements:{limit}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        max_limit = limit if (limit and limit > 0) else 100
        query = select(CorporateAnnouncement).order_by(desc(CorporateAnnouncement.broadcast_date)).limit(max_limit)
        q = await db.execute(query)
        announcements = q.scalars().all()
        res = [CorporateAnnouncementSchema.model_validate(a) for a in announcements]
        ram_cache.set(cache_key, res, ttl=30.0)
        return res
    except Exception as err:
        return []

@router.get("/indices/{category}", response_model=List[IndexDailySchema])
async def get_indices_by_category(
    category: str,
    date: Optional[str] = Query(None, description="Trade date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """Returns index data for a category: broad, sectoral, thematic, strategy, or all."""
    cat_clean = category.lower().replace("-", " ").strip()
    cache_key = f"indices:{cat_clean}:{date or 'latest'}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    cat_mapping = {
        "broad": "Broad Market",
        "broad market": "Broad Market",
        "sectoral": "Sectoral",
        "thematic": "Thematic",
        "strategy": "Strategy",
        "derivatives": "Derivatives",
        "fixed income": "Fixed Income"
    }
    target_cat = cat_mapping.get(cat_clean)

    if not date:
        q_date = await db.execute(select(IndexDaily.date).order_by(desc(IndexDaily.date)).limit(1))
        date = q_date.scalars().first()

    if not date:
        return []

    if target_cat:
        q = await db.execute(
            select(IndexDaily).where(
                IndexDaily.date == date,
                IndexDaily.index_category == target_cat
            ).order_by(desc(IndexDaily.pct_change))
        )
    else:
        q = await db.execute(
            select(IndexDaily).where(IndexDaily.date == date).order_by(desc(IndexDaily.pct_change))
        )

    indices = q.scalars().all()
    res = []
    for i in indices:
        idx_schema = IndexDailySchema.model_validate(i)
        idx_schema.market_performance = round(i.value - i.previous_close, 2) if (i.value is not None and i.previous_close is not None) else (round(i.variation, 2) if i.variation is not None else None)
        idx_schema.premarket = round(i.open - i.previous_close, 2) if (i.open is not None and i.previous_close is not None) else None
        idx_schema.recover_from_low = round(i.value - i.low, 2) if (i.value is not None and i.low is not None) else None
        idx_schema.distance_from_high = round(i.value - i.high, 2) if (i.value is not None and i.high is not None) else None
        res.append(idx_schema)

    ram_cache.set(cache_key, res, ttl=30.0)
    return res

@router.get("/all-nse-stocks", response_model=List[CustomStockItemSchema])
async def get_all_nse_stocks_data(
    date: Optional[str] = Query(None, description="Trade date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the complete official NSE Equity universe (all 2,652+ listed stocks)
    with accurate OHLCV, 4 performance indicators, 52-week ranges, and catalyst actions.
    """
    cache_key = f"all_nse_stocks:{date or 'latest'}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    fetcher = NSEFetcher()
    bhav_map = await asyncio.to_thread(fetcher.fetch_full_market_bhavcopy, date)
    if not bhav_map:
        return []

    # Get all active corporate actions to link catalysts
    q_ca = await db.execute(
        select(CorporateAction).order_by(asc(CorporateAction.priority_level))
    )
    all_ca = q_ca.scalars().all()
    ca_by_symbol = {}
    for ca in all_ca:
        ca_by_symbol.setdefault(ca.symbol, []).append({
            "action_type": ca.action_type,
            "subject": ca.subject,
            "ex_date": ca.ex_date,
            "record_date": ca.record_date,
            "priority_level": ca.priority_level,
            "details": ca.details
        })

    results = []
    trade_date = date
    for sym, item in bhav_map.items():
        if not trade_date and item.get("trade_date"):
            trade_date = item.get("trade_date")

        mkt_perf = item.get("market_performance")
        premarket = item.get("premarket")
        rec_low = item.get("recover_from_low")
        dist_high = item.get("distance_from_high")
        ltp = item.get("lastPrice")
        prev_close = item.get("previousClose")
        open_val = item.get("open")
        high = item.get("dayHigh")
        low = item.get("dayLow")
        chg = item.get("change")
        p_chg = item.get("pChange")

        if mkt_perf is None and ltp is not None and prev_close is not None:
            mkt_perf = round(ltp - prev_close, 2)
        if premarket is None and open_val is not None and prev_close is not None:
            premarket = round(open_val - prev_close, 2)
        if rec_low is None and ltp is not None and low is not None:
            rec_low = round(ltp - low, 2)
        if dist_high is None and ltp is not None and high is not None:
            dist_high = round(ltp - high, 2)

        results.append(CustomStockItemSchema(
            id=None,
            date=trade_date or date,
            symbol=sym,
            company_name=item.get("companyName") or sym,
            series=item.get("series") or "EQ",
            open=open_val,
            high=high,
            low=low,
            previous_close=prev_close,
            market_performance=mkt_perf,
            premarket=premarket,
            recover_from_low=rec_low,
            distance_from_high=dist_high,
            ltp=ltp,
            change=chg,
            pct_change=p_chg,
            volume=item.get("totalTradedVolume"),
            turnover=item.get("totalTradedValue"),
            year_high=item.get("yearHigh"),
            year_low=item.get("yearLow"),
            per_change_30d=item.get("perChange30d"),
            per_change_365d=item.get("perChange365d"),
            near_wkh=item.get("nearWKH"),
            near_wkl=item.get("nearWKL"),
            ffmc=item.get("ffmc"),
            last_update_time=item.get("lastUpdateTime") or "",
            catalysts=ca_by_symbol.get(sym, []),
            created_at=None
        ))

    # Sort default by % change descending
    results.sort(key=lambda s: (s.pct_change if s.pct_change is not None else -9999), reverse=True)
    ram_cache.set(cache_key, results, ttl=60.0)
    return results

@router.get("/custom-stocks", response_model=List[CustomStockItemSchema])
async def get_custom_stocks_data(
    date: Optional[str] = Query(None, description="Trade date in YYYY-MM-DD format"),
    username: str = Query("admin", description="Username for custom watchlist"),
    mode: str = Query("watchlist", description="View mode: 'watchlist' or 'all'"),
    db: AsyncSession = Depends(get_db)
):
    """Returns custom watchlist overview table with 4 calculated performance metrics and corporate action catalysts.
    Optimized for sub-millisecond cached responses and parallel batch fetching.
    """
    if mode == "all":
        return await get_all_nse_stocks_data(date=date, db=db)

    if not isinstance(username, str) or not username:
        username = "admin"

    if not date or not isinstance(date, str):
        q_date = await db.execute(select(Nifty50Daily.date).order_by(desc(Nifty50Daily.date)).limit(1))
        date = q_date.scalars().first() or dt_date.today().strftime("%Y-%m-%d")

    cache_key = f"custom_stocks:{username}:{date}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    # 1. Fetch watchlist items for user
    q_watch = await db.execute(
        select(CustomStockWatchlist).where(CustomStockWatchlist.username == username).order_by(asc(CustomStockWatchlist.created_at))
    )
    watchlist = q_watch.scalars().all()
    if not watchlist and username != "admin":
        q_watch_admin = await db.execute(
            select(CustomStockWatchlist).where(CustomStockWatchlist.username == "admin").order_by(asc(CustomStockWatchlist.created_at))
        )
        watchlist = q_watch_admin.scalars().all()

    if not watchlist:
        return []

    symbols = [w.symbol.upper().strip() for w in watchlist]
    names_map = {w.symbol.upper().strip(): w.company_name for w in watchlist}
    created_map = {w.symbol.upper().strip(): w.created_at for w in watchlist}

    # 2. Check Nifty50Daily table (Batch indexed lookup)
    q_n50 = await db.execute(
        select(Nifty50Daily).where(Nifty50Daily.date == date, Nifty50Daily.symbol.in_(symbols))
    )
    n50_map = {s.symbol: s for s in q_n50.scalars().all()}

    # 3. Check StockDetailDaily table for target date
    q_det = await db.execute(
        select(StockDetailDaily).where(StockDetailDaily.date == date, StockDetailDaily.symbol.in_(symbols))
    )
    det_map = {d.symbol: d for d in q_det.scalars().all()}

    # 4. Check latest available date in StockDetailDaily for any symbols missing on target date
    missing_for_db = [s for s in symbols if s not in n50_map and s not in det_map]
    if missing_for_db:
        q_any = await db.execute(
            select(StockDetailDaily).where(StockDetailDaily.symbol.in_(missing_for_db)).order_by(desc(StockDetailDaily.date))
        )
        for d in q_any.scalars().all():
            if d.symbol not in det_map:
                det_map[d.symbol] = d

    # 5. Fetch live quotes for any symbols still missing from DB or for real-time live views
    still_missing = [s for s in symbols if s not in n50_map and s not in det_map]
    live_quotes_map = {}
    fetcher = NSEFetcher()
    try:
        live_quotes_map = await asyncio.to_thread(fetcher.fetch_all_live_market_quotes)
    except Exception as e:
        logger.debug(f"Live market quotes fetch notice: {e}")

    for s in still_missing:
        if s in live_quotes_map:
            det_map[s] = live_quotes_map[s]

    remaining_missing = [s for s in symbols if s not in n50_map and s not in det_map]
    if remaining_missing:
        semaphore = asyncio.Semaphore(5)

        async def fetch_one(sym_to_fetch: str):
            async with semaphore:
                try:
                    return sym_to_fetch, await asyncio.to_thread(fetcher.fetch_live_stock_quote, sym_to_fetch)
                except Exception:
                    return sym_to_fetch, None

        fetched = await asyncio.gather(*[fetch_one(s) for s in remaining_missing])
        for s, q_dict in fetched:
            if q_dict:
                det_map[s] = q_dict

    # 6. Load corporate actions for catalysts
    q_ca = await db.execute(
        select(CorporateAction).where(CorporateAction.symbol.in_(symbols)).order_by(asc(CorporateAction.priority_level))
    )
    all_ca = q_ca.scalars().all()
    ca_by_symbol = {}
    for ca in all_ca:
        ca_by_symbol.setdefault(ca.symbol, []).append({
            "action_type": ca.action_type,
            "subject": ca.subject,
            "ex_date": ca.ex_date,
            "record_date": ca.record_date,
            "priority_level": ca.priority_level,
            "details": ca.details
        })

    results = []
    for sym in symbols:
        n50 = n50_map.get(sym)
        det = det_map.get(sym)
        c_name = names_map.get(sym) or (n50.company_name if n50 else (getattr(det, "company_name", None) if hasattr(det, "company_name") else sym))
        
        ltp = None
        open_val = None
        high = None
        low = None
        prev_close = None
        change = None
        pct_change = None
        volume = None
        turnover = None
        ffmc = None
        year_high = None
        year_low = None
        p30 = None
        p365 = None
        near_h = None
        near_l = None
        series = "EQ"
        last_update = None

        if n50:
            ltp = n50.ltp
            open_val = n50.open
            high = n50.high
            low = n50.low
            prev_close = n50.previous_close
            change = n50.change
            pct_change = n50.pct_change
            volume = n50.volume
            turnover = n50.turnover
            ffmc = n50.ffmc
            year_high = n50.year_high
            year_low = n50.year_low
            p30 = n50.per_change_30d
            p365 = n50.per_change_365d
            near_h = n50.near_wkh
            near_l = n50.near_wkl
            series = n50.series or "EQ"
            last_update = n50.last_update_time
        elif hasattr(det, "price_info"):  # StockDetailDaily model instance
            p_info = det.price_info if isinstance(det.price_info, dict) else {}
            t_info = det.trade_info if isinstance(det.trade_info, dict) else {}
            m_info = det.meta_data if isinstance(det.meta_data, dict) else {}
            intra = p_info.get("intraDayHighLow") if isinstance(p_info.get("intraDayHighLow"), dict) else {}
            week = p_info.get("weekHighLow") if isinstance(p_info.get("weekHighLow"), dict) else {}
            
            c_name = det.company_name or m_info.get("companyName") or c_name
            ltp = safe_float(p_info.get("lastPrice") or p_info.get("close") or m_info.get("lastPrice"))
            open_val = safe_float(p_info.get("open") or m_info.get("open"))
            high = safe_float(intra.get("max") or p_info.get("high") or m_info.get("dayHigh"))
            low = safe_float(intra.get("min") or p_info.get("low") or m_info.get("dayLow"))
            prev_close = safe_float(p_info.get("previousClose") or m_info.get("previousClose"))
            change = safe_float(p_info.get("change") or m_info.get("change"))
            pct_change = safe_float(p_info.get("pChange") or m_info.get("pChange"))
            volume = det.total_volume or safe_float(t_info.get("totalTradedVolume") or t_info.get("quantityTraded"))
            turnover = det.total_turnover or safe_float(t_info.get("totalTradedValue"))
            ffmc = det.free_float_mcap or safe_float(t_info.get("ffmc"))
            year_high = safe_float(week.get("max") or p_info.get("yearHigh"))
            year_low = safe_float(week.get("min") or p_info.get("yearLow"))
            p30 = safe_float(p_info.get("perChange30d"))
            p365 = safe_float(p_info.get("perChange365d"))
            near_h = safe_float(p_info.get("nearWKH"))
            near_l = safe_float(p_info.get("nearWKL"))
            series = str(m_info.get("series") or "EQ")
            last_update = str(m_info.get("lastUpdateTime") or "")
        elif isinstance(det, dict):  # Dict response from live market snapshot or fetch_live_stock_quote
            p_info = det.get("priceInfo") if isinstance(det.get("priceInfo"), dict) else {}
            t_info = det.get("tradeInfo") if isinstance(det.get("tradeInfo"), dict) else {}
            m_info = det.get("metaData") if isinstance(det.get("metaData"), dict) else {}
            intra = p_info.get("intraDayHighLow") if isinstance(p_info.get("intraDayHighLow"), dict) else {}
            week = p_info.get("weekHighLow") if isinstance(p_info.get("weekHighLow"), dict) else {}

            c_name = det.get("companyName") or m_info.get("companyName") or c_name
            ltp = safe_float(det.get("lastPrice") or p_info.get("lastPrice") or p_info.get("close"))
            open_val = safe_float(det.get("open") or p_info.get("open"))
            high = safe_float(det.get("dayHigh") or intra.get("max") or p_info.get("high"))
            low = safe_float(det.get("dayLow") or intra.get("min") or p_info.get("low"))
            prev_close = safe_float(det.get("previousClose") or p_info.get("previousClose"))
            change = safe_float(det.get("change") or p_info.get("change"))
            pct_change = safe_float(det.get("pChange") or p_info.get("pChange"))
            volume = safe_float(det.get("totalTradedVolume") or t_info.get("totalTradedVolume") or t_info.get("quantityTraded"))
            turnover = safe_float(det.get("totalTradedValue") or t_info.get("totalTradedValue"))
            ffmc = safe_float(det.get("ffmc") or t_info.get("ffmc"))
            year_high = safe_float(det.get("yearHigh") or week.get("max") or p_info.get("yearHigh"))
            year_low = safe_float(det.get("yearLow") or week.get("min") or p_info.get("yearLow"))
            p30 = safe_float(det.get("perChange30d") or p_info.get("perChange30d"))
            p365 = safe_float(det.get("perChange365d") or p_info.get("perChange365d"))
            near_h = safe_float(det.get("nearWKH") or p_info.get("nearWKH"))
            near_l = safe_float(det.get("nearWKL") or p_info.get("nearWKL"))
            series = str(det.get("series") or m_info.get("series") or "EQ")
            last_update = str(det.get("lastUpdateTime") or m_info.get("lastUpdateTime") or "")

        # Augment with live market quote if fields are still missing
        if (ltp is None or prev_close is None) and sym in live_quotes_map:
            l_q = live_quotes_map[sym]
            p_inf = l_q.get("priceInfo") if isinstance(l_q.get("priceInfo"), dict) else {}
            t_inf = l_q.get("tradeInfo") if isinstance(l_q.get("tradeInfo"), dict) else {}
            m_inf = l_q.get("metaData") if isinstance(l_q.get("metaData"), dict) else {}
            intra = p_inf.get("intraDayHighLow") if isinstance(p_inf.get("intraDayHighLow"), dict) else {}
            week = p_inf.get("weekHighLow") if isinstance(p_inf.get("weekHighLow"), dict) else {}

            c_name = l_q.get("companyName") or m_inf.get("companyName") or c_name
            ltp = safe_float(l_q.get("lastPrice") or p_inf.get("lastPrice") or p_inf.get("close") or ltp)
            open_val = safe_float(l_q.get("open") or p_inf.get("open") or open_val)
            high = safe_float(l_q.get("dayHigh") or intra.get("max") or p_inf.get("high") or high)
            low = safe_float(l_q.get("dayLow") or intra.get("min") or p_inf.get("low") or low)
            prev_close = safe_float(l_q.get("previousClose") or p_inf.get("previousClose") or prev_close)
            change = safe_float(l_q.get("change") or p_inf.get("change") or change)
            pct_change = safe_float(l_q.get("pChange") or p_inf.get("pChange") or pct_change)
            volume = safe_float(l_q.get("totalTradedVolume") or t_inf.get("totalTradedVolume") or volume)
            turnover = safe_float(l_q.get("totalTradedValue") or turnover)
            ffmc = safe_float(l_q.get("ffmc") or ffmc)
            year_high = safe_float(l_q.get("yearHigh") or week.get("max") or year_high)
            year_low = safe_float(l_q.get("yearLow") or week.get("min") or year_low)
            p30 = safe_float(l_q.get("perChange30d") or p30)
            p365 = safe_float(l_q.get("perChange365d") or p365)
            near_h = safe_float(l_q.get("nearWKH") or near_h)
            near_l = safe_float(l_q.get("nearWKL") or near_l)
            series = str(l_q.get("series") or series or "EQ")
            last_update = str(l_q.get("lastUpdateTime") or last_update or "")

        # Compute calculated performance indicators with exact precision
        if ltp is not None and prev_close is not None and prev_close > 0:
            if change is None:
                change = round(ltp - prev_close, 2)
            if pct_change is None:
                pct_change = round(((ltp - prev_close) / prev_close) * 100, 2)

        if near_h is None and ltp is not None and year_high is not None and year_high > 0:
            near_h = round(((ltp - year_high) / year_high) * 100, 2)
        if near_l is None and ltp is not None and year_low is not None and year_low > 0:
            near_l = round(((ltp - year_low) / year_low) * 100, 2)

        market_perf = round(ltp - prev_close, 2) if (ltp is not None and prev_close is not None) else (round(change, 2) if change is not None else None)
        premarket = round(open_val - prev_close, 2) if (open_val is not None and prev_close is not None) else None
        rec_low = round(ltp - low, 2) if (ltp is not None and low is not None) else None
        dist_high = round(ltp - high, 2) if (ltp is not None and high is not None) else None

        row_item = CustomStockItemSchema(
            id=None,
            date=date,
            symbol=sym,
            company_name=c_name,
            series=series,
            open=open_val,
            high=high,
            low=low,
            previous_close=prev_close,
            market_performance=market_perf,
            premarket=premarket,
            recover_from_low=rec_low,
            distance_from_high=dist_high,
            ltp=ltp,
            change=change,
            pct_change=pct_change,
            volume=volume,
            turnover=turnover,
            year_high=year_high,
            year_low=year_low,
            per_change_30d=p30,
            per_change_365d=p365,
            near_wkh=near_h,
            near_wkl=near_l,
            ffmc=ffmc,
            last_update_time=last_update,
            catalysts=ca_by_symbol.get(sym, []),
            created_at=created_map.get(sym)
        )
        results.append(row_item)

    ram_cache.set(cache_key, results, ttl=30.0)
    return results

@router.post("/custom-stocks")
async def add_custom_stock(
    req: CustomStockAddRequest,
    username: str = Query("admin", description="Username for custom watchlist"),
    db: AsyncSession = Depends(get_db)
):
    """Adds a stock to the user's custom watchlist, pulling all latest live data, corporate actions & catalysts from NSE."""
    if not isinstance(username, str) or not username:
        username = "admin"

    symbol = req.symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol cannot be empty.")

    # Check if already exists in watchlist
    q_chk = await db.execute(
        select(CustomStockWatchlist).where(CustomStockWatchlist.username == username, CustomStockWatchlist.symbol == symbol)
    )
    existing = q_chk.scalars().first()

    # Find company name & industry from master list or request or DB
    master_info = lookup_master_symbol(symbol)
    c_name = req.company_name or (master_info.get("company_name") if master_info else None)
    industry_name = master_info.get("industry") if master_info else None

    # Fetch live deep quotes, trade metrics, and corporate actions from NSE
    fetcher = NSEFetcher()
    today_str = dt_date.today().strftime("%Y-%m-%d")
    detail_json = None
    try:
        detail_json = await asyncio.to_thread(fetcher.fetch_stock_details, symbol)
        if not detail_json:
            live_q = await asyncio.to_thread(fetcher.fetch_live_stock_quote, symbol)
            if live_q:
                detail_json = {
                    "priceInfo": {
                        "lastPrice": live_q.get("lastPrice"),
                        "open": live_q.get("open"),
                        "previousClose": live_q.get("previousClose"),
                        "change": live_q.get("change"),
                        "pChange": live_q.get("pChange"),
                        "yearHigh": live_q.get("yearHigh"),
                        "yearLow": live_q.get("yearLow"),
                        "perChange30d": live_q.get("perChange30d"),
                        "perChange365d": live_q.get("perChange365d"),
                        "nearWKH": live_q.get("nearWKH"),
                        "nearWKL": live_q.get("nearWKL"),
                        "intraDayHighLow": {"min": live_q.get("dayLow"), "max": live_q.get("dayHigh")},
                        "weekHighLow": {"min": live_q.get("yearLow"), "max": live_q.get("yearHigh")}
                    },
                    "tradeInfo": {
                        "totalTradedVolume": live_q.get("totalTradedVolume"),
                        "totalTradedValue": live_q.get("totalTradedValue"),
                        "ffmc": live_q.get("ffmc")
                    },
                    "metaData": {
                        "companyName": live_q.get("companyName") or c_name,
                        "symbol": symbol,
                        "series": live_q.get("series") or "EQ",
                        "lastUpdateTime": live_q.get("lastUpdateTime")
                    },
                    "companyName": live_q.get("companyName") or c_name
                }
        if detail_json:
            m_data = detail_json.get("metaData") or {}
            c_name = m_data.get("companyName") or detail_json.get("companyName") or c_name
            industry_name = m_data.get("industry") or (detail_json.get("secInfo") or {}).get("basicIndustry") or industry_name
    except Exception as e:
        logger.warning(f"Error fetching live NSE quote for {symbol}: {e}")

    # 1. First, ensure CustomStockWatchlist record is added and committed
    if not existing:
        new_item = CustomStockWatchlist(
            username=username,
            symbol=symbol,
            company_name=c_name or symbol
        )
        db.add(new_item)
        try:
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.debug(f"Watchlist item already exists or commit notice: {e}")

    # 2. Persist complete live quote in StockDetailDaily table
    if detail_json:
        try:
            t_info = detail_json.get("tradeInfo") or {}
            p_info = detail_json.get("priceInfo") or {}
            s_info = detail_json.get("secInfo") or {}
            o_book = detail_json.get("orderBook") or {}
            m_data = detail_json.get("metaData") or {}

            q_stk_det = await db.execute(
                select(StockDetailDaily).where(StockDetailDaily.date == today_str, StockDetailDaily.symbol == symbol)
            )
            existing_det = q_stk_det.scalars().first()

            isin_val = m_data.get("isinCode") or s_info.get("isin") or m_data.get("isin")
            deliv_pct_val = safe_float(t_info.get("deliveryToTradedQuantity") or s_info.get("deliveryTotradedQuantity"))
            face_val = safe_float(t_info.get("faceValue") or s_info.get("faceValue"))
            daily_vol = safe_float(p_info.get("cmDailyVolatility") or p_info.get("dailyVolatility"))
            annual_vol = safe_float(p_info.get("cmAnnualVolatility") or p_info.get("annualisedVolatility"))
            issued_cap = safe_float(s_info.get("issuedSize") or t_info.get("issuedSize"))
            margin_val = safe_float(t_info.get("applicableMargin") or p_info.get("applicableMargin"))
            impact_val = safe_float(t_info.get("impactCost"))
            ffmc_val = safe_float(t_info.get("ffmc") or t_info.get("totalMarketCap"))
            turnover_val = safe_float(t_info.get("totalTradedValue") or t_info.get("totalTurnover"))
            volume_val = safe_float(t_info.get("totalTradedVolume") or t_info.get("totalVolume"))

            if existing_det:
                existing_det.company_name = c_name or existing_det.company_name
                existing_det.industry = industry_name or existing_det.industry
                existing_det.isin = isin_val or existing_det.isin
                existing_det.delivery_pct = deliv_pct_val if deliv_pct_val is not None else existing_det.delivery_pct
                existing_det.face_value = face_val if face_val is not None else existing_det.face_value
                existing_det.daily_volatility = daily_vol if daily_vol is not None else existing_det.daily_volatility
                existing_det.annual_volatility = annual_vol if annual_vol is not None else existing_det.annual_volatility
                existing_det.issued_capital = issued_cap if issued_cap is not None else existing_det.issued_capital
                existing_det.applicable_margin = margin_val if margin_val is not None else existing_det.applicable_margin
                existing_det.impact_cost = impact_val if impact_val is not None else existing_det.impact_cost
                existing_det.free_float_mcap = ffmc_val if ffmc_val is not None else existing_det.free_float_mcap
                existing_det.total_turnover = turnover_val if turnover_val is not None else existing_det.total_turnover
                existing_det.total_volume = volume_val if volume_val is not None else existing_det.total_volume
                existing_det.trade_info = t_info
                existing_det.price_info = p_info
                existing_det.security_info = s_info
                existing_det.order_book = o_book
                existing_det.meta_data = m_data
            else:
                new_detail = StockDetailDaily(
                    date=today_str,
                    symbol=symbol,
                    company_name=c_name or symbol,
                    industry=industry_name,
                    isin=isin_val,
                    delivery_pct=deliv_pct_val,
                    face_value=face_val,
                    daily_volatility=daily_vol,
                    annual_volatility=annual_vol,
                    issued_capital=issued_cap,
                    applicable_margin=margin_val,
                    impact_cost=impact_val,
                    free_float_mcap=ffmc_val,
                    total_turnover=turnover_val,
                    total_volume=volume_val,
                    trade_info=t_info,
                    price_info=p_info,
                    security_info=s_info,
                    order_book=o_book,
                    meta_data=m_data
                )
                db.add(new_detail)

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.warning(f"Error persisting stock details for {symbol}: {e}")

    # 3. Ingest stock corporate actions (Dividends, Splits, Bonus, etc.) with safe savepoints
    try:
        stock_ca_list = await asyncio.to_thread(fetcher.fetch_stock_corporate_actions, symbol)
        if stock_ca_list:
            for ca_item in stock_ca_list:
                subj = ca_item.get("subject") or ca_item.get("purpose") or ""
                if not subj:
                    continue
                act_type, priority = classify_corporate_action(subj)
                raw_ex = ca_item.get("exDate") or ca_item.get("ex_date")
                parsed_ex = None
                if raw_ex:
                    try:
                        parsed_ex = datetime.strptime(raw_ex.strip(), "%d-%b-%Y").strftime("%Y-%m-%d")
                    except Exception:
                        parsed_ex = str(raw_ex)

                try:
                    async with db.begin_nested():
                        q_ca_exist = await db.execute(
                            select(CorporateAction).where(
                                CorporateAction.symbol == symbol,
                                CorporateAction.subject == subj,
                                CorporateAction.ex_date == parsed_ex
                            )
                        )
                        if not q_ca_exist.scalars().first():
                            new_ca = CorporateAction(
                                symbol=symbol,
                                company_name=c_name or symbol,
                                series=ca_item.get("series") or "EQ",
                                action_type=act_type,
                                subject=subj,
                                ex_date=parsed_ex,
                                record_date=ca_item.get("recordDate"),
                                priority_level=priority,
                                details=ca_item.get("details") or subj,
                                raw_data=ca_item
                            )
                            db.add(new_ca)
                            await db.flush()
                except Exception:
                    pass
            await db.commit()
    except Exception as e:
        logger.debug(f"Corporate actions ingestion notice for {symbol}: {e}")

    # 4. Ingest stock event calendar (Board Meetings & Financial Results) with safe savepoints
    try:
        stock_events = await asyncio.to_thread(fetcher.fetch_stock_event_calendar, symbol)
        if stock_events:
            for ev in stock_events:
                purpose = ev.get("purpose") or ev.get("subject") or "Board Meeting"
                ev_date = ev.get("bm_date") or ev.get("eventDate") or ev.get("date")
                if not purpose:
                    continue
                parsed_ev_date = None
                if ev_date:
                    try:
                        parsed_ev_date = datetime.strptime(ev_date.strip(), "%d-%b-%Y").strftime("%Y-%m-%d")
                    except Exception:
                        parsed_ev_date = str(ev_date)

                try:
                    async with db.begin_nested():
                        q_ev_exist = await db.execute(
                            select(CorporateAction).where(
                                CorporateAction.symbol == symbol,
                                CorporateAction.subject == purpose,
                                CorporateAction.ex_date == parsed_ev_date
                            )
                        )
                        if not q_ev_exist.scalars().first():
                            new_ev_ca = CorporateAction(
                                symbol=symbol,
                                company_name=c_name or symbol,
                                series=ev.get("series") or "EQ",
                                action_type="RESULTS" if "RESULT" in purpose.upper() else "BOARD_MEETING",
                                subject=purpose,
                                ex_date=parsed_ev_date,
                                priority_level=2,
                                details=ev.get("details") or purpose,
                                raw_data=ev
                            )
                            db.add(new_ev_ca)
                            await db.flush()
                except Exception:
                    pass
            await db.commit()
    except Exception as e:
        logger.debug(f"Event calendar ingestion notice for {symbol}: {e}")

    ram_cache.invalidate("custom_stocks")
    return {
        "success": True,
        "message": f"Successfully added {symbol} ({c_name or symbol}) and pulled live data from NSE.",
        "symbol": symbol,
        "company_name": c_name or symbol
    }

@router.delete("/custom-stocks/{symbol}")
async def remove_custom_stock(
    symbol: str,
    username: str = Query("admin", description="Username for custom watchlist"),
    db: AsyncSession = Depends(get_db)
):
    """Removes a stock from the user's custom watchlist."""
    if not isinstance(username, str) or not username:
        username = "admin"

    symbol = str(symbol).upper().strip()
    q = await db.execute(
        select(CustomStockWatchlist).where(CustomStockWatchlist.username == username, CustomStockWatchlist.symbol == symbol)
    )
    item = q.scalars().first()
    if not item and username != "admin":
        q2 = await db.execute(
            select(CustomStockWatchlist).where(CustomStockWatchlist.username == "admin", CustomStockWatchlist.symbol == symbol)
        )
        item = q2.scalars().first()

    if not item:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found in custom watchlist.")

    await db.delete(item)
    await db.commit()
    ram_cache.invalidate("custom_stocks")
    return {"success": True, "message": f"Successfully removed {symbol} from custom stocks."}

@router.get("/search-symbols", response_model=List[SymbolSearchResult])
async def search_symbols(
    q: str = Query(..., min_length=1, description="Symbol or company name search query"),
    db: AsyncSession = Depends(get_db)
):
    """Searches stock symbols across comprehensive Master Universe, local database, and live NSE autocomplete."""
    query = q.strip().upper()
    if not query:
        return []

    cache_key = f"symbol_search:{query}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    results_dict = {}

    # 1. Search comprehensive in-memory master universe (instant <2ms response)
    master_matches = search_master_equities(query, limit=35)
    for m in master_matches:
        sym = m["symbol"]
        results_dict[sym] = SymbolSearchResult(
            symbol=sym,
            company_name=m.get("company_name"),
            series="EQ",
            industry=m.get("industry")
        )

    # 2. Search local database tables (Nifty50Daily, StockDetailDaily, IndexConstituents, CorporateAction)
    q_n50 = await db.execute(
        select(Nifty50Daily.symbol, Nifty50Daily.company_name).where(
            or_(
                Nifty50Daily.symbol.ilike(f"%{query}%"),
                Nifty50Daily.company_name.ilike(f"%{query}%")
            )
        ).distinct().limit(25)
    )
    for sym, name in q_n50.all():
        if sym not in results_dict:
            results_dict[sym] = SymbolSearchResult(symbol=sym, company_name=name, series="EQ", industry=None)

    q_det = await db.execute(
        select(StockDetailDaily.symbol, StockDetailDaily.company_name, StockDetailDaily.industry).where(
            or_(
                StockDetailDaily.symbol.ilike(f"%{query}%"),
                StockDetailDaily.company_name.ilike(f"%{query}%")
            )
        ).distinct().limit(25)
    )
    for sym, name, ind in q_det.all():
        if sym not in results_dict:
            results_dict[sym] = SymbolSearchResult(symbol=sym, company_name=name, series="EQ", industry=ind)

    # 3. Live NSE Autocomplete Fallback if fewer than 10 matches or specific query
    if len(results_dict) < 10 or len(query) >= 2:
        try:
            fetcher = NSEFetcher()
            live_results = await asyncio.to_thread(fetcher.search_autocomplete, query)
            for item in live_results:
                sym = item.get("symbol", "").upper().strip()
                if sym and sym not in results_dict:
                    results_dict[sym] = SymbolSearchResult(
                        symbol=sym,
                        company_name=item.get("company_name") or sym,
                        series=item.get("series") or "EQ",
                        industry=item.get("industry")
                    )
        except Exception as e:
            logger.debug(f"Live NSE search autocomplete fallback skipped: {e}")

    # Prioritize: Exact match first, then prefix match, then substring match
    exact_list = []
    prefix_list = []
    other_list = []
    for sym, item in results_dict.items():
        if sym == query:
            exact_list.append(item)
        elif sym.startswith(query):
            prefix_list.append(item)
        else:
            other_list.append(item)

    res_list = (exact_list + prefix_list + other_list)[:40]
    ram_cache.set(cache_key, res_list, ttl=60.0)
    return res_list

