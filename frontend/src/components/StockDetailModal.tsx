import React, { useEffect, useState } from "react";
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  BarChart2, 
  Building2, 
  ExternalLink,
  Layers
} from "lucide-react";
import { StockDetail } from "../types";
import { fetchStockDetail } from "../services/api";

interface StockDetailModalProps {
  symbol: string | null;
  selectedDate: string;
  onClose: () => void;
}

export const StockDetailModal: React.FC<StockDetailModalProps> = ({ symbol, selectedDate, onClose }) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        
        {/* Modal Header */}
        <div className="sticky top-0 z-10 bg-[#111827]/95 backdrop-blur border-b border-slate-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-base">
              {symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{symbol}</h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {mData.series || "EQ"}
                </span>
                {mData.isFNOSec === "true" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                    F&O
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {detail?.company_name || mData.companyName || symbol} • Trade Date: {selectedDate}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
              <p className="text-xs">Fetching deep stock snapshot from local DB...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          ) : (
            <>
              {/* SECTION 1: Price & Performance Overview */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  1. Price & Performance Overview
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Last Price (LTP)</span>
                    <p className="text-base font-bold font-mono text-white mt-1">
                      ₹{tInfo.lastPrice ? tInfo.lastPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Base / Prev Close</span>
                    <p className="text-sm font-mono text-slate-200 mt-1">
                      ₹{tInfo.basePrice ? tInfo.basePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">52-Week High</span>
                    <p className="text-sm font-mono text-emerald-400 font-semibold mt-1">
                      ₹{pInfo.yearHigh ? pInfo.yearHigh.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">52-Week Low</span>
                    <p className="text-sm font-mono text-rose-400 font-semibold mt-1">
                      ₹{pInfo.yearLow ? pInfo.yearLow.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Trading & Liquidity Details */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />
                  2. Trading & Liquidity Details
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Traded Volume</span>
                    <p className="text-sm font-mono font-semibold text-slate-200 mt-1">
                      {tInfo.totalTradedVolume ? tInfo.totalTradedVolume.toLocaleString("en-IN") : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Total Turnover</span>
                    <p className="text-sm font-mono font-semibold text-slate-200 mt-1">
                      {turnoverCr ? `₹ ${turnoverCr.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Cr` : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Free Float Market Cap</span>
                    <p className="text-sm font-mono font-semibold text-slate-200 mt-1">
                      {ffmcCr ? `₹ ${ffmcCr.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Cr` : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Delivery %</span>
                    <p className="text-sm font-mono font-bold text-emerald-400 mt-1">
                      {delivQty !== undefined && delivQty !== null ? `${delivQty}%` : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Impact Cost</span>
                    <p className="text-sm font-mono text-slate-200 mt-1">
                      {tInfo.impactCost !== undefined && tInfo.impactCost !== null ? `${tInfo.impactCost}%` : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Price Band</span>
                    <p className="text-xs font-mono text-slate-300 mt-1">
                      {pInfo.priceBand || "No Band"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Daily Volatility</span>
                    <p className="text-sm font-mono text-slate-200 mt-1">
                      {pInfo.cmDailyVolatility ? `${pInfo.cmDailyVolatility}%` : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Annual Volatility</span>
                    <p className="text-sm font-mono text-slate-200 mt-1">
                      {pInfo.cmAnnualVolatility ? `${pInfo.cmAnnualVolatility}%` : "-"}
                    </p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border-slate-800">
                    <span className="text-[11px] text-slate-400">Applicable Margin</span>
                    <p className="text-sm font-mono text-slate-200 mt-1">
                      {tInfo.applicableMargin ? `${tInfo.applicableMargin}%` : "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Security Master & Corporate Info */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  3. Security Master & Corporate Information
                </h3>
                <div className="glass-card p-4 rounded-xl border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">ISIN Code:</span>
                    <p className="font-mono font-semibold text-white mt-0.5">
                      {sInfo.isin || mData.isin || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Industry / Sector:</span>
                    <p className="font-semibold text-white mt-0.5">
                      {detail?.industry || sInfo.basicIndustry || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Issued Size:</span>
                    <p className="font-mono text-slate-200 mt-0.5">
                      {sInfo.issuedSize ? Number(sInfo.issuedSize).toLocaleString("en-IN") : "-"} shares
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Face Value:</span>
                    <p className="font-mono text-slate-200 mt-0.5">
                      ₹{tInfo.faceValue || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#111827] border-t border-slate-800 px-6 py-3.5 flex items-center justify-between text-xs text-slate-400">
          <a
            href={`https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition"
          >
            <span>View on NSE Official Website</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
