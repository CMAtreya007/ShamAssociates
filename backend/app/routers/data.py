import asyncio
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

from app.services.cache_manager import ram_cache

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

@router.get("/custom-stocks", response_model=List[CustomStockItemSchema])
async def get_custom_stocks_data(
    date: Optional[str] = Query(None, description="Trade date in YYYY-MM-DD format"),
    username: str = Query("admin", description="Username for custom watchlist"),
    db: AsyncSession = Depends(get_db)
):
    """Returns custom watchlist overview table with 4 calculated performance metrics and corporate action catalysts.
    Optimized for sub-millisecond cached responses and parallel batch fetching.
    """
    if not date:
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

    # 5. Parallel on-demand fetch for any symbols still completely missing
    still_missing = [s for s in symbols if s not in n50_map and s not in det_map]
    if still_missing:
        fetcher = NSEFetcher()
        fetcher._ensure_session()
        semaphore = asyncio.Semaphore(10)

        async def fetch_one(sym_to_fetch: str):
            async with semaphore:
                try:
                    return sym_to_fetch, await asyncio.to_thread(fetcher.fetch_stock_details, sym_to_fetch)
                except Exception:
                    return sym_to_fetch, None

        fetched = await asyncio.gather(*[fetch_one(s) for s in still_missing])
        for s, eq_dict in fetched:
            if eq_dict:
                det_map[s] = eq_dict

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
            c_name = det.company_name or m_info.get("companyName") or c_name
            ltp = safe_float(p_info.get("lastPrice") or p_info.get("close") or m_info.get("lastPrice"))
            open_val = safe_float(p_info.get("open") or m_info.get("open"))
            high = safe_float(p_info.get("intraDayHighLow", {}).get("max") or p_info.get("high") or m_info.get("dayHigh"))
            low = safe_float(p_info.get("intraDayHighLow", {}).get("min") or p_info.get("low") or m_info.get("dayLow"))
            prev_close = safe_float(p_info.get("previousClose") or m_info.get("previousClose"))
            change = safe_float(p_info.get("change") or m_info.get("change"))
            pct_change = safe_float(p_info.get("pChange") or m_info.get("pChange"))
            volume = det.total_volume or safe_float(t_info.get("totalTradedVolume"))
            turnover = det.total_turnover or safe_float(t_info.get("totalTradedValue"))
            ffmc = det.free_float_mcap or safe_float(t_info.get("ffmc"))
            year_high = safe_float(p_info.get("weekHighLow", {}).get("max") or p_info.get("yearHigh"))
            year_low = safe_float(p_info.get("weekHighLow", {}).get("min") or p_info.get("yearLow"))
            p30 = safe_float(p_info.get("perChange30d"))
            p365 = safe_float(p_info.get("perChange365d"))
            near_h = safe_float(p_info.get("nearWKH"))
            near_l = safe_float(p_info.get("nearWKL"))
            series = str(m_info.get("series") or "EQ")
            last_update = str(m_info.get("lastUpdateTime") or "")
        elif isinstance(det, dict):  # Dict response from fetch_stock_details
            p_info = det.get("priceInfo") or {}
            t_info = det.get("tradeInfo") or {}
            m_info = det.get("metaData") or {}
            c_name = m_info.get("companyName") or c_name
            ltp = safe_float(p_info.get("lastPrice") or p_info.get("close"))
            open_val = safe_float(p_info.get("open"))
            high = safe_float(p_info.get("intraDayHighLow", {}).get("max") or p_info.get("high"))
            low = safe_float(p_info.get("intraDayHighLow", {}).get("min") or p_info.get("low"))
            prev_close = safe_float(p_info.get("previousClose"))
            change = safe_float(p_info.get("change"))
            pct_change = safe_float(p_info.get("pChange"))
            volume = safe_float(t_info.get("totalTradedVolume"))
            turnover = safe_float(t_info.get("totalTradedValue"))
            ffmc = safe_float(t_info.get("ffmc"))
            year_high = safe_float(p_info.get("weekHighLow", {}).get("max") or p_info.get("yearHigh"))
            year_low = safe_float(p_info.get("weekHighLow", {}).get("min") or p_info.get("yearLow"))
            p30 = safe_float(p_info.get("perChange30d"))
            p365 = safe_float(p_info.get("perChange365d"))
            near_h = safe_float(p_info.get("nearWKH"))
            near_l = safe_float(p_info.get("nearWKL"))
            series = str(m_info.get("series") or "EQ")
            last_update = str(m_info.get("lastUpdateTime") or "")

        # Compute calculated performance indicators with exact precision
        if ltp is not None and prev_close is not None and prev_close > 0:
            if change is None:
                change = round(ltp - prev_close, 2)
            if pct_change is None:
                pct_change = round(((ltp - prev_close) / prev_close) * 100, 2)

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
    """Adds a stock to the user's custom watchlist, pre-fetching live quote details."""
    symbol = req.symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol cannot be empty.")

    # Check if already exists in watchlist
    q_chk = await db.execute(
        select(CustomStockWatchlist).where(CustomStockWatchlist.username == username, CustomStockWatchlist.symbol == symbol)
    )
    existing = q_chk.scalars().first()
    if existing:
        return {"success": True, "message": f"{symbol} is already in your custom watchlist.", "symbol": symbol}

    # Fetch company name / details if not provided
    c_name = req.company_name
    fetcher = NSEFetcher()
    if not c_name:
        q_n50 = await db.execute(select(Nifty50Daily.company_name).where(Nifty50Daily.symbol == symbol).limit(1))
        c_name = q_n50.scalars().first()
        if not c_name:
            q_det = await db.execute(select(StockDetailDaily.company_name).where(StockDetailDaily.symbol == symbol).limit(1))
            c_name = q_det.scalars().first()

    # Pre-fetch and cache stock details immediately
    try:
        detail_json = await asyncio.to_thread(fetcher.fetch_stock_details, symbol)
        if detail_json:
            m_data = detail_json.get("metaData") or {}
            if not c_name:
                c_name = m_data.get("companyName")
    except Exception:
        pass

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
        raise HTTPException(status_code=500, detail=f"Failed to add custom stock: {str(e)}")

    ram_cache.clear()
    return {
        "success": True,
        "message": f"Successfully added {symbol} to custom stocks.",
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
    symbol = symbol.upper().strip()
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
    ram_cache.clear()
    return {"success": True, "message": f"Successfully removed {symbol} from custom stocks."}

@router.get("/search-symbols", response_model=List[SymbolSearchResult])
async def search_symbols(
    q: str = Query(..., min_length=1, description="Symbol or company name search query"),
    db: AsyncSession = Depends(get_db)
):
    """Searches stock symbols across local database and Nifty 500 constituents."""
    query = q.strip().upper()
    if not query:
        return []

    cache_key = f"symbol_search:{query}"
    cached = ram_cache.get(cache_key)
    if cached is not None:
        return cached

    results_dict = {}

    # 1. Search Nifty 50 stocks
    q_n50 = await db.execute(
        select(Nifty50Daily.symbol, Nifty50Daily.company_name).where(
            or_(
                Nifty50Daily.symbol.ilike(f"%{query}%"),
                Nifty50Daily.company_name.ilike(f"%{query}%")
            )
        ).distinct().limit(20)
    )
    for sym, name in q_n50.all():
        if sym not in results_dict:
            results_dict[sym] = SymbolSearchResult(symbol=sym, company_name=name, series="EQ", industry=None)

    # 2. Search StockDetailDaily
    q_det = await db.execute(
        select(StockDetailDaily.symbol, StockDetailDaily.company_name, StockDetailDaily.industry).where(
            or_(
                StockDetailDaily.symbol.ilike(f"%{query}%"),
                StockDetailDaily.company_name.ilike(f"%{query}%")
            )
        ).distinct().limit(20)
    )
    for sym, name, ind in q_det.all():
        if sym not in results_dict:
            results_dict[sym] = SymbolSearchResult(symbol=sym, company_name=name, series="EQ", industry=ind)

    # 3. Search IndexConstituents
    q_const = await db.execute(
        select(IndexConstituents.symbol, IndexConstituents.company_name, IndexConstituents.industry).where(
            or_(
                IndexConstituents.symbol.ilike(f"%{query}%"),
                IndexConstituents.company_name.ilike(f"%{query}%")
            )
        ).distinct().limit(20)
    )
    for sym, name, ind in q_const.all():
        if sym not in results_dict:
            results_dict[sym] = SymbolSearchResult(symbol=sym, company_name=name, series="EQ", industry=ind)

    # 4. Search CorporateAction symbols
    q_ca = await db.execute(
        select(CorporateAction.symbol, CorporateAction.company_name).where(
            or_(
                CorporateAction.symbol.ilike(f"%{query}%"),
                CorporateAction.company_name.ilike(f"%{query}%")
            )
        ).distinct().limit(20)
    )
    for sym, name in q_ca.all():
        if sym not in results_dict:
            results_dict[sym] = SymbolSearchResult(symbol=sym, company_name=name, series="EQ", industry=None)

    res_list = list(results_dict.values())[:30]
    ram_cache.set(cache_key, res_list, ttl=60.0)
    return res_list

