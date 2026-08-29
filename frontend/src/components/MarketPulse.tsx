import React from "react";
import { TrendingUp, TrendingDown, Layers, BarChart3, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Nifty50Stock, IndexDaily } from "../types";

interface MarketPulseProps {
  stocks: Nifty50Stock[];
  sectorIndices?: IndexDaily[];
  isLoading?: boolean;
}

export const MarketPulse: React.FC<MarketPulseProps> = ({ stocks, sectorIndices = [], isLoading }) => {
  if (isLoading || stocks.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200/80 p-4 animate-pulse shadow-card flex flex-col justify-between">
            <div className="h-4 bg-slate-100 rounded w-24" />
            <div className="h-7 bg-slate-100 rounded w-36" />
            <div className="h-3 bg-slate-100 rounded w-48" />
          </div>
        ))}
      </div>
    );
  }

  // 1. Calculate Nifty 50 Aggregate Benchmark Status
  let totalTurnover = 0;
  let totalVolume = 0;
  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  let totalPctSum = 0;

  stocks.forEach((s) => {
    const chg = s.pct_change || 0;
    if (chg > 0) advances++;
    else if (chg < 0) declines++;
    else unchanged++;

    totalTurnover += s.turnover || 0;
    totalVolume += s.volume || 0;
    totalPctSum += chg;
  });

  const avgPct = stocks.length > 0 ? totalPctSum / stocks.length : 0;
  const isBenchmarkPos = avgPct >= 0;
  const totalTurnoverCr = totalTurnover / 10000000.0;
  const totalVolumeM = totalVolume / 1000000.0;

  // 2. Top Sector Performer
  const topSector = sectorIndices.length > 0
    ? [...sectorIndices].sort((a, b) => (b.pct_change || 0) - (a.pct_change || 0))[0]
    : null;

  // 3. Breadth ratio
  const totalValid = advances + declines + unchanged || 1;
  const advPct = Math.round((advances / totalValid) * 100);
  const decPct = Math.round((declines / totalValid) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 select-none">
      
      {/* Card 1: Benchmark Status (Nifty 50 Overview) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card hover:shadow-card-hover transition">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
          <span className="flex items-center gap-1.5 font-sans">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            NIFTY 50 BASKET
          </span>
          <span className="text-[10px] font-mono text-slate-400">50 Equities</span>
        </div>

        <div className="flex items-baseline justify-between mt-2">
          <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {stocks[0]?.ltp ? `₹${stocks[0].ltp.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "Nifty 50"}
          </span>
          <span
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-semibold font-mono tabular-nums ${
              isBenchmarkPos
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                : "bg-red-50 text-red-700 border border-red-200/60"
            }`}
          >
            {isBenchmarkPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {isBenchmarkPos ? "+" : ""}{avgPct.toFixed(2)}%
          </span>
        </div>

        <div className="text-[11px] text-slate-500 mt-2 font-medium">
          Constituent Average: <span className="font-mono text-slate-700">{avgPct >= 0 ? "+" : ""}{avgPct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Card 2: Top Sector Performer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card hover:shadow-card-hover transition">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
          <span className="flex items-center gap-1.5 font-sans">
            <TrendingUp className="w-3.5 h-3.5 text-[#00B386]" />
            TOP SECTOR TODAY
          </span>
          <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold">LEADER</span>
        </div>

        {topSector ? (
          <>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-sm font-bold text-slate-900 truncate max-w-[150px]" title={topSector.index_name}>
                {topSector.index_name}
              </span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-semibold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200/60 tabular-nums">
                +{(topSector.pct_change || 0).toFixed(2)}%
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-2 font-mono tabular-nums">
              Index: <span className="font-semibold text-slate-800">{topSector.value?.toLocaleString("en-IN", { minimumFractionDigits: 1 })}</span> ({topSector.advances} Adv / {topSector.declines} Dec)
            </div>
          </>
        ) : (
          <div className="mt-2 text-xs text-slate-400">Loading sector leaders...</div>
        )}
      </div>

      {/* Card 3: Market Breadth (Advances vs Declines) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card hover:shadow-card-hover transition">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
          <span className="flex items-center gap-1.5 font-sans">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            MARKET BREADTH
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Ratio <strong className="text-slate-800">{(advances / (declines || 1)).toFixed(2)}</strong>
          </span>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs font-mono">
          <span className="text-emerald-700 font-bold">{advances} Adv ({advPct}%)</span>
          <span className="text-red-700 font-bold">{declines} Dec ({decPct}%)</span>
        </div>

        {/* Visual Breadth Split Bar */}
        <div className="w-full bg-slate-100 rounded-full h-2 mt-2.5 flex overflow-hidden">
          <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${advPct}%` }} />
          <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${decPct}%` }} />
        </div>
      </div>

      {/* Card 4: Turnover & Liquidity */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card hover:shadow-card-hover transition">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
          <span className="flex items-center gap-1.5 font-sans">
            <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
            TOTAL TURNOVER
          </span>
          <span className="text-[10px] font-mono text-slate-400">NSE N50</span>
        </div>

        <div className="flex items-baseline justify-between mt-2">
          <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            ₹{totalTurnoverCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} <span className="text-xs font-sans font-medium text-slate-500">Cr</span>
          </span>
          <span className="text-xs font-semibold font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md tabular-nums">
            {totalVolumeM.toFixed(1)}M Shares
          </span>
        </div>

        <div className="text-[11px] text-slate-500 mt-2 font-medium">
          Traded across all 50 constituent equities
        </div>
      </div>

    </div>
  );
};
