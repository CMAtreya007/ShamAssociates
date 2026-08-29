import asyncio
from datetime import date as dt_date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, asc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models import Nifty50Daily, StockDetailDaily, IndexDaily, CorporateAction, CorporateAnnouncement
from app.schemas import (
    Nifty50StockSchema, 
    StockDetailSchema, 
    IndexDailySchema, 
    CorporateActionSchema, 
    CorporateAnnouncementSchema
)
from app.services.nse_fetcher import NSEFetcher, safe_float, classify_corporate_action

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
    q = await db.execute(
        select(Nifty50Daily.date).distinct().order_by(desc(Nifty50Daily.date))
    )
    dates = q.scalars().all()
    return list(dates)

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
        result.append(stock_dict)

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
        return StockDetailSchema(
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

    # 4. If detail is still None, create a graceful schema object using CorporateAction/Announcement metadata
    comp_name = ca_rows[0].company_name if ca_rows and ca_rows[0].company_name else symbol
    return StockDetailSchema(
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

@router.get("/stock/{symbol}/actions", response_model=List[CorporateActionSchema])
async def get_stock_actions(
    symbol: str,
    db: AsyncSession = Depends(get_db)
):
    """Returns historical and upcoming corporate actions for an individual stock."""
    symbol = symbol.upper().strip()
    q = await db.execute(
        select(CorporateAction).where(CorporateAction.symbol == symbol).order_by(asc(CorporateAction.priority_level), desc(CorporateAction.ex_date))
    )
    actions = q.scalars().all()
    return [CorporateActionSchema.model_validate(a) for a in actions]

@router.get("/catalysts", response_model=List[CorporateActionSchema])
async def get_market_catalysts(
    scope: Optional[str] = Query("all", description="Scope: nifty50 or all"),
    action_type: Optional[str] = Query(None, description="Filter by action type: DIVIDEND, SPLIT, BONUS, RESULTS, etc."),
    limit: Optional[int] = Query(None, ge=1, description="Optional limit (omit for unlimited)"),
    db: AsyncSession = Depends(get_db)
):
    """Returns chronologically and priority-sorted upcoming/recent Corporate Catalysts & Actions with no artificial limit."""
    query = select(CorporateAction)

    if scope == "nifty50":
        q_n50 = await db.execute(select(Nifty50Daily.symbol).distinct())
        n50_symbols = q_n50.scalars().all()
        if n50_symbols:
            query = query.where(CorporateAction.symbol.in_(n50_symbols))

    if action_type:
        query = query.where(CorporateAction.action_type == action_type.upper().strip())

    q = await db.execute(query)
    actions = q.scalars().all()
    # Sort chronologically by true parsed date descending (latest/upcoming first)
    sorted_actions = sorted(actions, key=lambda a: parse_nse_date(a.ex_date), reverse=True)
    if limit and limit > 0:
        return [CorporateActionSchema.model_validate(a) for a in sorted_actions[:limit]]
    return [CorporateActionSchema.model_validate(a) for a in sorted_actions]

@router.get("/announcements", response_model=List[CorporateAnnouncementSchema])
async def get_corporate_announcements(
    limit: Optional[int] = Query(None, ge=1, description="Optional limit (omit for unlimited)"),
    db: AsyncSession = Depends(get_db)
):
    """Returns recent corporate regulatory announcements and filings with no artificial limit."""
    query = select(CorporateAnnouncement).order_by(desc(CorporateAnnouncement.broadcast_date))
    if limit and limit > 0:
        query = query.limit(limit)
    q = await db.execute(query)
    announcements = q.scalars().all()
    return [CorporateAnnouncementSchema.model_validate(a) for a in announcements]

@router.get("/indices/{category}", response_model=List[IndexDailySchema])
async def get_indices_by_category(
    category: str,
    date: Optional[str] = Query(None, description="Trade date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """Returns index data for a category: broad, sectoral, thematic, strategy, or all."""
    cat_clean = category.lower().replace("-", " ").strip()
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
    return [IndexDailySchema.model_validate(i) for i in indices]
