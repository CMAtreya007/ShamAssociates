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
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { StockDetail } from "../types";
import { fetchStockDetail } from "../services/api";

interface StockDetailSheetProps {
  symbol: string | null;
  selectedDate: string;
  onClose: () => void;
}

export const StockDetailSheet: React.FC<StockDetailSheetProps> = ({ symbol, selectedDate, onClose }) => {
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

  const tInfo = detail?.trade_info || {};
  const pInfo = detail?.price_info || {};
  const sInfo = detail?.security_info || {};
  const mData = detail?.meta_data || {};

  const delivQty = tInfo.deliveryToTradedQuantity || tInfo.deliveryQuantity;
  const ffmcCr = tInfo.ffmc ? tInfo.ffmc / 10000000.0 : null;
  const turnoverCr = tInfo.totalTradedValue ? tInfo.totalTradedValue / 10000000.0 : null;
  const ltp = tInfo.lastPrice || pInfo.lastPrice || 0;
  const basePrice = tInfo.basePrice || pInfo.basePrice || ltp;
  const change = ltp - basePrice;
  const pctChange = basePrice > 0 ? (change / basePrice) * 100 : 0;
  const isPos = pctChange >= 0;

  // Intraday High/Low slider
  const dHigh = pInfo.intraDayHighLow?.max || pInfo.high || ltp;
  const dLow = pInfo.intraDayHighLow?.min || pInfo.low || ltp;
  const intraSpan = Math.max(dHigh - dLow, 0.01);
  const intraPct = Math.min(Math.max(((ltp - dLow) / intraSpan) * 100, 0), 100);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
        
        {/* Backdrop click dismiss */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Sliding Sheet Container */}
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="relative w-full max-w-xl h-full bg-[var(--bg-surface)] border-l border-[var(--border-hairline)] shadow-2xl flex flex-col z-10 overflow-hidden font-sans"
        >
          
          {/* Header Bar */}
          <div className="p-5 border-b border-[var(--border-hairline)] bg-[var(--bg-base)] flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[var(--text-primary)] font-mono tracking-tight">{symbol}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#1F2530] text-[var(--text-secondary)] font-mono">
                  {mData.series || "EQ"}
                </span>
                {mData.isFNOSec === "true" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold font-mono">
                    F&O
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {detail?.company_name || mData.companyName || symbol} • Trade Date: <span className="font-mono text-white">{selectedDate}</span>
              </p>

              {/* Price & Change Banner */}
              <div className="flex items-center gap-3 mt-3">
                <span className="text-2xl font-bold text-[var(--text-primary)] font-mono tabular-nums">
                  ₹{ltp > 0 ? ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold font-mono tabular-nums ${
                    isPos
                      ? "text-[var(--gain)] bg-[var(--gain-bg)] border border-[var(--gain)]/20"
                      : "text-[var(--loss)] bg-[var(--loss-bg)] border border-[var(--loss)]/20"
                  }`}
                >
                  {isPos ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {isPos ? "+" : ""}{pctChange.toFixed(2)}% (₹{change.toFixed(2)})
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white border border-[var(--border-hairline)] hover:bg-[#1A202C] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-[var(--text-secondary)]">
                <div className="w-8 h-8 border-2 border-[var(--border-hairline)] border-t-[var(--accent)] rounded-full animate-spin mb-3" />
                <p className="text-xs font-mono">Loading deep market snapshot...</p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-[var(--loss-bg)] border border-[var(--loss)]/30 text-[var(--loss)] text-xs">
                {error}
              </div>
            ) : (
              <>
                {/* 1. Intraday Price Range Breakdown */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2.5 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Intraday & 52W Price Range
                  </h3>
                  
                  {/* Intraday Slider Card */}
                  <div className="bg-[var(--bg-base)] border border-[var(--border-hairline)] p-4 rounded-xl space-y-3">
                    <div className="flex justify-between text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] block font-sans">Day Low</span>
                        <span className="font-semibold text-[var(--text-primary)]">₹{dLow.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] text-[var(--text-muted)] block font-sans">Current LTP</span>
                        <span className="font-bold text-[var(--accent)]">₹{ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[var(--text-muted)] block font-sans">Day High</span>
                        <span className="font-semibold text-[var(--text-primary)]">₹{dHigh.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    <div className="w-full bg-[#1F2530] rounded-full h-2 relative overflow-visible">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-[var(--accent)] h-full rounded-full"
                        style={{ width: `${intraPct}%` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow ring-2 ring-[var(--accent)]"
                        style={{ left: `calc(${intraPct}% - 6px)` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border-hairline)] text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] block font-sans">52W High</span>
                        <span className="text-[var(--gain)] font-semibold">₹{pInfo.yearHigh?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "-"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] block font-sans">52W Low</span>
                        <span className="text-[var(--loss)] font-semibold">₹{pInfo.yearLow?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "-"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] block font-sans">VWAP</span>
                        <span className="text-[var(--text-secondary)]">{pInfo.vwap ? `₹${pInfo.vwap.toFixed(2)}` : "-"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] block font-sans">Price Band</span>
                        <span className="text-[var(--text-secondary)] text-[10px] truncate">{pInfo.priceBand || "No Band"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Trade Info 4-Card Metric Grid */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2.5 flex items-center gap-1.5">
                    <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
                    Trading & Liquidity Metrics
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    
                    <div className="bg-[var(--bg-base)] border border-[var(--border-hairline)] p-3.5 rounded-xl">
                      <span className="text-[10px] text-[var(--text-muted)] block">Total Traded Quantity</span>
                      <p className="text-base font-bold font-mono text-[var(--text-primary)] mt-1 tabular-nums">
                        {tInfo.totalTradedVolume ? tInfo.totalTradedVolume.toLocaleString("en-IN") : "-"}
                      </p>
                    </div>

                    <div className="bg-[var(--bg-base)] border border-[var(--border-hairline)] p-3.5 rounded-xl">
                      <span className="text-[10px] text-[var(--text-muted)] block">Delivery Percentage</span>
                      <p className="text-base font-bold font-mono text-[var(--gain)] mt-1 tabular-nums">
                        {delivQty !== undefined && delivQty !== null ? `${delivQty}%` : "-"}
                      </p>
                    </div>

                    <div className="bg-[var(--bg-base)] border border-[var(--border-hairline)] p-3.5 rounded-xl">
                      <span className="text-[10px] text-[var(--text-muted)] block">Total Turnover (₹ Cr)</span>
                      <p className="text-base font-bold font-mono text-[var(--text-primary)] mt-1 tabular-nums">
                        {turnoverCr ? `₹ ${turnoverCr.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Cr` : "-"}
                      </p>
                    </div>

                    <div className="bg-[var(--bg-base)] border border-[var(--border-hairline)] p-3.5 rounded-xl">
                      <span className="text-[10px] text-[var(--text-muted)] block">Free Float MCap</span>
                      <p className="text-base font-bold font-mono text-[var(--text-primary)] mt-1 tabular-nums">
                        {ffmcCr ? `₹ ${ffmcCr.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Cr` : "-"}
                      </p>
                    </div>

                  </div>
                </div>

                {/* 3. Securities & Fundamentals Master */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                    Securities & Corporate Master
                  </h3>

                  <div className="bg-[var(--bg-base)] border border-[var(--border-hairline)] p-4 rounded-xl space-y-2.5 text-xs">
                    
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-muted)]">ISIN Code</span>
                      <span className="font-mono text-white font-semibold">{sInfo.isin || mData.isin || "-"}</span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-muted)]">Industry / Sector</span>
                      <span className="font-semibold text-white">{detail?.industry || sInfo.basicIndustry || "-"}</span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-muted)]">Daily / Annual Volatility</span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {pInfo.cmDailyVolatility || "-"}% / {pInfo.cmAnnualVolatility || "-"}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-muted)]">Impact Cost / Margin</span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {tInfo.impactCost || "-"}% / {tInfo.applicableMargin || "-"}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">Issued Capital (Shares)</span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {sInfo.issuedSize ? Number(sInfo.issuedSize).toLocaleString("en-IN") : "-"}
                      </span>
                    </div>

                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer Action */}
          <div className="p-4 border-t border-[var(--border-hairline)] bg-[var(--bg-base)] flex items-center justify-between text-xs">
            <a
              href={`https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[var(--accent)] hover:underline"
            >
              <span>Live NSE Quote View</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#1F2530] hover:bg-[#2A3442] text-[var(--text-primary)] font-semibold transition"
            >
              Close
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
