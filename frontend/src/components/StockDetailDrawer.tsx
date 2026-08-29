import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  BarChart2, 
  Building2, 
  ExternalLink,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Activity,
  Award,
  CalendarDays,
  Clock
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { StockDetail } from "../types";
import { fetchStockDetail } from "../services/api";

interface StockDetailDrawerProps {
  symbol: string | null;
  selectedDate: string;
  onClose: () => void;
}

export const StockDetailDrawer: React.FC<StockDetailDrawerProps> = ({ symbol, selectedDate, onClose }) => {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchStockDetail(symbol, selectedDate);
        if (isMounted) setDetail(data);
      } catch (err: any) {
        if (isMounted) setError(err.message || "Failed to load stock details");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [symbol, selectedDate]);

  if (!symbol) return null;

  const tInfo = (detail?.trade_info || {}) as any;
  const pInfo = (detail?.price_info || {}) as any;
  const sInfo = (detail?.security_info || {}) as any;
  const mData = (detail?.meta_data || {}) as any;

  const ltp = tInfo.lastPrice || pInfo.lastPrice || 0;
  const basePrice = tInfo.basePrice || pInfo.basePrice || ltp;
  const change = ltp - basePrice;
  const pctChange = basePrice > 0 ? (change / basePrice) * 100 : 0;
  const isPos = pctChange >= 0;

  const delivPct = detail?.delivery_pct !== undefined && detail?.delivery_pct !== null
    ? detail.delivery_pct
    : (tInfo.deliveryToTradedQuantity || sInfo.deliveryTotradedQuantity || 0);

  const ffmcCr = (detail?.free_float_mcap ? detail.free_float_mcap / 10000000.0 : null) || (tInfo.ffmc ? tInfo.ffmc / 10000000.0 : null);
  const turnoverCr = (detail?.total_turnover ? detail.total_turnover / 10000000.0 : null) || (tInfo.totalTradedValue ? tInfo.totalTradedValue / 10000000.0 : null);
  const totalMcapCr = tInfo.totalMarketCap ? tInfo.totalMarketCap / 10000000.0 : null;

  const dHigh = pInfo.intraDayHighLow?.max || pInfo.high || ltp;
  const dLow = pInfo.intraDayHighLow?.min || pInfo.low || ltp;
  const yHigh = pInfo.yearHigh || tInfo.yearHigh || 0;
  const yLow = pInfo.yearLow || tInfo.yearLow || 0;

  // Mock mini sparkline intraday data points
  const sparklineData = [
    { time: "09:15", price: pInfo.open || basePrice * 0.995 },
    { time: "10:30", price: dLow + (dHigh - dLow) * 0.2 },
    { time: "11:45", price: dLow + (dHigh - dLow) * 0.6 },
    { time: "13:00", price: dLow + (dHigh - dLow) * 0.4 },
    { time: "14:15", price: dHigh * 0.998 },
    { time: "15:30", price: ltp },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
        
        {/* Backdrop click dismiss */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Sliding Screener-Style Drawer */}
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="relative w-full max-w-2xl h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col z-10 overflow-hidden font-sans"
        >
          
          {/* 1. Header Bar with Company Identity & Live Price */}
          <div className="p-6 border-b border-slate-200 bg-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">{symbol}</h2>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono font-semibold">
                    {mData.series || "EQ"}
                  </span>
                  {mData.isFNOSec === "true" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-semibold font-mono">
                      F&O
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {detail?.company_name || mData.companyName || symbol} • Trade Date: <span className="font-mono text-slate-800 font-semibold">{selectedDate}</span>
                </p>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Price & Sparkline Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-400 font-medium block">Current Market Price</span>
                <div className="flex items-baseline gap-2.5 mt-0.5">
                  <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                    ₹{ltp > 0 ? ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold font-mono tabular-nums ${
                      isPos
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                        : "bg-red-50 text-red-700 border border-red-200/60"
                    }`}
                  >
                    {isPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {isPos ? "+" : ""}{pctChange.toFixed(2)}% (₹{change.toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Recharts Mini Sparkline */}
              <div className="w-48 h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isPos ? "#00B386" : "#DC2626"} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={isPos ? "#00B386" : "#DC2626"} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={isPos ? "#00B386" : "#DC2626"}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* 2. Scrollable Screener-Style Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-[#00B386] rounded-full animate-spin mb-3" />
                <p className="text-xs font-mono">Loading deep fundamental snapshot...</p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                {error}
              </div>
            ) : (
              <>
                {/* 1. Screener 3x3 Key Ratios Grid */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <BarChart2 className="w-4 h-4 text-[#00B386]" />
                    Key Ratios & Valuation
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    
                    <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-card">
                      <span className="text-[11px] text-slate-500 font-medium block">Market Cap</span>
                      <p className="text-sm font-bold font-mono text-slate-900 mt-1 tabular-nums">
                        {totalMcapCr ? `₹ ${totalMcapCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr` : (ffmcCr ? `₹ ${ffmcCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr` : "-")}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-card">
                      <span className="text-[11px] text-slate-500 font-medium block">Stock P/E / Sector P/E</span>
                      <p className="text-sm font-bold font-mono text-slate-900 mt-1 tabular-nums">
                        {sInfo.pdSymbolPe || "-"} <span className="text-xs font-normal text-slate-400">/ {sInfo.pdSectorPe || "-"}</span>
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-card">
                      <span className="text-[11px] text-slate-500 font-medium block">Face Value</span>
                      <p className="text-sm font-bold font-mono text-slate-900 mt-1 tabular-nums">
                        ₹ {tInfo.faceValue || sInfo.faceValue || "-"}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-card">
                      <span className="text-[11px] text-slate-500 font-medium block">52-Week High / Low</span>
                      <p className="text-xs font-bold font-mono text-slate-900 mt-1 tabular-nums">
                        <span className="text-emerald-700">₹{yHigh}</span> / <span className="text-red-700">₹{yLow}</span>
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-card">
                      <span className="text-[11px] text-slate-500 font-medium block">Delivery %</span>
                      <p className="text-sm font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                        {delivPct ? `${floatSafe(delivPct).toFixed(2)}%` : "-"}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-card">
                      <span className="text-[11px] text-slate-500 font-medium block">Total Traded Volume</span>
                      <p className="text-sm font-bold font-mono text-slate-900 mt-1 tabular-nums">
                        {tInfo.totalTradedVolume ? tInfo.totalTradedVolume.toLocaleString("en-IN") : "-"}
                      </p>
                    </div>

                  </div>
                </div>

                {/* 2. Delivery & Risk / Margins Indicators */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-600" />
                    Delivery & Volatility Metrics
                  </h3>

                  <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-card space-y-4">
                    
                    {/* Delivery Progress Bar */}
                    <div>
                      <div className="flex justify-between text-xs font-medium mb-1.5">
                        <span className="text-slate-600">Delivery Percentage ({delivPct ? `${floatSafe(delivPct).toFixed(2)}%` : "-"})</span>
                        <span className="text-slate-400 font-mono">
                          Traded: {tInfo.totalTradedVolume ? tInfo.totalTradedVolume.toLocaleString("en-IN") : "-"}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-[#00B386] h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(floatSafe(delivPct), 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Volatility Tags */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs font-mono">
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-sans">Daily Volatility</span>
                        <span className="font-bold text-slate-800">{pInfo.cmDailyVolatility || detail?.daily_volatility || "-"}%</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-sans">Annual Volatility</span>
                        <span className="font-bold text-slate-800">{pInfo.cmAnnualVolatility || detail?.annual_volatility || "-"}%</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-sans">Applicable Margin</span>
                        <span className="font-bold text-slate-800">{tInfo.applicableMargin || detail?.applicable_margin || "-"}%</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-sans">Impact Cost</span>
                        <span className="font-bold text-slate-800">{tInfo.impactCost || detail?.impact_cost || "-"}%</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* 3. Corporate Master & ISIN Details */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    Security Master & Company Information
                  </h3>

                  <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-card space-y-2.5 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">ISIN Code</span>
                      <span className="font-mono font-bold text-slate-900">{sInfo.isin || mData.isinCode || detail?.isin || "-"}</span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Macro / Sector</span>
                      <span className="font-semibold text-slate-900">{sInfo.macro || "-"} / {sInfo.sector || "-"}</span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Basic Industry</span>
                      <span className="font-semibold text-slate-900">{detail?.industry || sInfo.basicIndustry || "-"}</span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Listing Date & Status</span>
                      <span className="font-mono text-slate-800">{sInfo.listingDate || "-"} ({sInfo.secStatus || "Listed"})</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Issued Capital (Shares)</span>
                      <span className="font-mono font-bold text-slate-900">
                        {sInfo.issuedSize ? Number(sInfo.issuedSize).toLocaleString("en-IN") : (tInfo.issuedSize ? Number(tInfo.issuedSize).toLocaleString("en-IN") : "-")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. Corporate Actions & Financial Calendar */}
                {detail?.actions && detail.actions.length > 0 && (() => {
                  const caItems = detail.actions.filter(a => ["DIVIDEND", "SPLIT", "BONUS", "BUYBACK", "RIGHTS"].includes(a.action_type));
                  const bmItems = detail.actions.filter(a => !["DIVIDEND", "SPLIT", "BONUS", "BUYBACK", "RIGHTS"].includes(a.action_type));

                  return (
                    <div className="space-y-4">
                      {/* 4A. Corporate Actions & Dividends Timeline */}
                      {caItems.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                            <CalendarDays className="w-4 h-4 text-emerald-600" />
                            Corporate Actions & Dividends Timeline ({caItems.length})
                          </h3>
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card divide-y divide-slate-100">
                            {caItems.map((act, ai) => {
                              const isDiv = act.action_type === "DIVIDEND";
                              return (
                                <div key={ai} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                                          isDiv
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                            : "bg-purple-50 text-purple-700 border border-purple-200/80"
                                        }`}
                                      >
                                        {act.action_type}
                                      </span>
                                      <span className="font-semibold text-slate-900">{act.subject}</span>
                                    </div>
                                    {act.details && act.details !== act.subject && (
                                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                                        {act.details}
                                      </p>
                                    )}
                                  </div>

                                  <div className="text-right flex-shrink-0 font-mono">
                                    {act.ex_date && (
                                      <span className="text-[11px] font-bold text-slate-800 block">
                                        Ex: {act.ex_date}
                                      </span>
                                    )}
                                    {act.record_date && (
                                      <span className="text-[10px] text-slate-400 block">
                                        Record: {act.record_date}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 4B. Financial Calendar & Board Meetings */}
                      {bmItems.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-blue-600" />
                            Financial Calendar & Board Meetings ({bmItems.length})
                          </h3>
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card divide-y divide-slate-100">
                            {bmItems.map((act, ai) => (
                              <div key={ai} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded font-mono bg-blue-50 text-blue-700 border border-blue-200/80">
                                      {act.action_type || "BOARD_MEETING"}
                                    </span>
                                    <span className="font-semibold text-slate-900">{act.subject}</span>
                                  </div>
                                  {act.details && act.details !== act.subject && (
                                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                                      {act.details}
                                    </p>
                                  )}
                                </div>

                                <div className="text-right flex-shrink-0 font-mono">
                                  {act.ex_date && (
                                    <span className="text-[11px] font-bold text-blue-800 block">
                                      {act.ex_date}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5. Benchmark & Index Memberships */}
                {sInfo.indexList && Array.isArray(sInfo.indexList) && sInfo.indexList.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-500" />
                      Benchmark & Index Memberships ({sInfo.indexList.length})
                    </h3>

                    <div className="flex flex-wrap gap-1.5">
                      {sInfo.indexList.map((idx: string) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-medium shadow-2xs">
                          {idx}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              </>
            )}
          </div>

          {/* 3. Footer Action */}
          <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
            <a
              href={`https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[#00B386] font-semibold hover:underline"
            >
              <span>View Official NSE Live Quote</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold transition"
            >
              Close
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

function floatSafe(val: any): number {
  if (typeof val === "number") return val;
  const parsed = parseFloat(String(val).replace(",", "").trim());
  return isNaN(parsed) ? 0 : parsed;
}
