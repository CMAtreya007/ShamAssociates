import React, { useState, useMemo } from "react";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  SlidersHorizontal,
  ChevronRight,
  Sparkles,
  CalendarDays,
  Flame
} from "lucide-react";
import { Nifty50Stock } from "../types";
import { LiveCatalystTicker } from "./LiveCatalystTicker";

interface MarketDataGridProps {
  stocks: Nifty50Stock[];
  isLoading: boolean;
  onSelectStock: (symbol: string) => void;
  priceFlashMap?: Record<string, "UP" | "DOWN">;
}

type TabFilter = "all" | "gainers" | "losers" | "near52w" | "catalysts" | "volume";
type SortField = keyof Nifty50Stock | "day_range_pos" | "year_range_pos";

export const MarketDataGrid: React.FC<MarketDataGridProps> = ({ 
  stocks, 
  isLoading, 
  onSelectStock,
  priceFlashMap = {}
}) => {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("pct_change");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Summary counts for quick filter tabs
  const tabCounts = useMemo(() => {
    let gainers = 0;
    let losers = 0;
    let near52w = 0;
    let catalysts = 0;

    stocks.forEach((s) => {
      if ((s.pct_change || 0) > 0) gainers++;
      if ((s.pct_change || 0) < 0) losers++;
      if (Math.abs(s.near_wkh || 100) <= 5) near52w++;
      if (s.catalysts && s.catalysts.length > 0) catalysts++;
    });
    return { all: stocks.length, gainers, losers, near52w, catalysts };
  }, [stocks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Filter and sort stocks
  const processedStocks = useMemo(() => {
    let list = stocks;

    // 1. Tab filter
    if (activeTab === "gainers") {
      list = list.filter((s) => (s.pct_change || 0) > 0);
    } else if (activeTab === "losers") {
      list = list.filter((s) => (s.pct_change || 0) < 0);
    } else if (activeTab === "near52w") {
      list = list.filter((s) => Math.abs(s.near_wkh || 100) <= 5);
    } else if (activeTab === "catalysts") {
      list = list.filter((s) => s.catalysts && s.catalysts.length > 0);
    }

    // 2. Search query filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          (s.company_name && s.company_name.toLowerCase().includes(q))
      );
    }

    // 3. Sorting
    return [...list].sort((a, b) => {
      let valA: any = a[sortField as keyof Nifty50Stock];
      let valB: any = b[sortField as keyof Nifty50Stock];

      if (sortField === "day_range_pos") {
        const spanA = (a.high || 1) - (a.low || 0);
        const spanB = (b.high || 1) - (b.low || 0);
        valA = spanA > 0 ? ((a.ltp || 0) - (a.low || 0)) / spanA : 0;
        valB = spanB > 0 ? ((b.ltp || 0) - (b.low || 0)) / spanB : 0;
      } else if (sortField === "year_range_pos") {
        const spanA = (a.year_high || 1) - (a.year_low || 0);
        const spanB = (b.year_high || 1) - (b.year_low || 0);
        valA = spanA > 0 ? ((a.ltp || 0) - (a.year_low || 0)) / spanA : 0;
        valB = spanB > 0 ? ((b.ltp || 0) - (b.year_low || 0)) / spanB : 0;
      }

      if (valA === undefined || valA === null) valA = sortDirection === "asc" ? Infinity : -Infinity;
      if (valB === undefined || valB === null) valB = sortDirection === "asc" ? Infinity : -Infinity;

      if (typeof valA === "string") {
        return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === "asc" ? valA - valB : valB - valA;
    });
  }, [stocks, activeTab, search, sortField, sortDirection]);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-card">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-[#00B386] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-mono text-slate-500">Loading Nifty 50 constituent metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      
      {/* Live Top Most Important Announcements & Catalysts Marquee Banner */}
      <LiveCatalystTicker onSelectStock={onSelectStock} />

      {/* 1. Header Toolbar: Quick Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-card">
        
        {/* Quick Filter Pills (Groww + Screener style) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            All ({tabCounts.all})
          </button>

          <button
            onClick={() => setActiveTab("gainers")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeTab === "gainers"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/50"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Gainers ({tabCounts.gainers})</span>
          </button>

          <button
            onClick={() => setActiveTab("losers")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeTab === "losers"
                ? "bg-red-600 text-white shadow-sm"
                : "text-red-700 bg-red-50/70 hover:bg-red-100/70 border border-red-200/50"
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Losers ({tabCounts.losers})</span>
          </button>

          <button
            onClick={() => setActiveTab("near52w")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeTab === "near52w"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-purple-700 bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200/50"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Near 52W High ({tabCounts.near52w})</span>
          </button>

          <button
            onClick={() => setActiveTab("catalysts")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeTab === "catalysts"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-700 bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200/50"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>With Catalysts ({tabCounts.catalysts})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("volume");
              setSortField("volume");
              setSortDirection("desc");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === "volume"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            High Volume
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter stocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
          />
        </div>

      </div>

      {/* 2. Main High-Density Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            
            {/* Table Header */}
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider select-none sticky top-0 z-10">
              <tr>
                <th onClick={() => handleSort("symbol")} className="py-3 px-4 cursor-pointer hover:text-slate-900 transition">
                  <div className="flex items-center gap-1.5">
                    <span>Company / Symbol</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                {/* Key Corporate Action / Announcement Column */}
                <th className="py-3 px-4 text-left select-none min-w-[210px]">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Key Catalyst / Action</span>
                  </div>
                </th>

                <th onClick={() => handleSort("ltp")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>LTP (₹)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th onClick={() => handleSort("pct_change")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition min-w-[100px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>% Change</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th onClick={() => handleSort("day_range_pos")} className="py-3 px-4 text-center cursor-pointer hover:text-slate-900 transition min-w-[150px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Day Range (L/H)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th onClick={() => handleSort("volume")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Volume</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th onClick={() => handleSort("year_range_pos")} className="py-3 px-4 text-center cursor-pointer hover:text-slate-900 transition min-w-[160px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>52-Week Range</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th onClick={() => handleSort("per_change_30d")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition hidden xl:table-cell">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>30D %</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th onClick={() => handleSort("per_change_365d")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition hidden xl:table-cell">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>365D %</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th onClick={() => handleSort("turnover")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition hidden lg:table-cell">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Turnover (₹ Cr)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th className="py-3 px-4 text-center">
                  <span>Action</span>
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100">
              {processedStocks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 text-xs font-mono">
                    No stocks match the active filter "{search || activeTab}".
                  </td>
                </tr>
              ) : (
                processedStocks.map((stock) => {
                  const pct = stock.pct_change || 0;
                  const isPos = pct > 0;
                  const isNeg = pct < 0;
                  const turnoverCr = (stock.turnover || 0) / 10000000.0;

                  // Day Range
                  const low = stock.low || 0;
                  const high = stock.high || 0;
                  const ltp = stock.ltp || low;
                  const dSpan = Math.max(high - low, 0.01);
                  const dPosPct = Math.min(Math.max(((ltp - low) / dSpan) * 100, 0), 100);

                  // 52W Range
                  const yLow = stock.year_low || 0;
                  const yHigh = stock.year_high || 1;
                  const ySpan = Math.max(yHigh - yLow, 0.01);
                  const yPosPct = Math.min(Math.max(((ltp - yLow) / ySpan) * 100, 0), 100);

                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => onSelectStock(stock.symbol)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group select-none"
                    >
                      {/* Symbol & Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 font-mono flex-shrink-0">
                            {stock.symbol.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 group-hover:text-[#00B386] transition font-sans text-xs flex items-center gap-1.5">
                              <span>{stock.symbol}</span>
                              {stock.series && (
                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-500 font-medium">
                                  {stock.series}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                              {stock.company_name || stock.symbol}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Key Catalyst / Corporate Action Column */}
                      <td className="py-3 px-4 text-left">
                        {stock.catalysts && stock.catalysts.length > 0 ? (
                          (() => {
                            const cat = stock.catalysts[0];
                            const isDiv = cat.action_type === "DIVIDEND";
                            const isSplit = ["SPLIT", "BONUS", "BUYBACK", "RIGHTS"].includes(cat.action_type);
                            const isResults = cat.action_type === "RESULTS" || cat.action_type === "BOARD_MEETING";
                            
                            return (
                              <div 
                                className="flex items-center gap-1.5 max-w-[230px]"
                                title={`${cat.subject} (Ex: ${cat.ex_date || "-"}, Record: ${cat.record_date || "-"})`}
                              >
                                <span
                                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                                    isDiv
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : isSplit
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : isResults
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-slate-100 text-slate-700 border-slate-200"
                                  }`}
                                >
                                  {cat.action_type}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-medium text-slate-800 truncate">
                                    {cat.subject}
                                  </p>
                                  {cat.ex_date && (
                                    <p className="text-[10px] font-mono text-slate-400">
                                      Ex: {cat.ex_date}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-slate-300 font-mono text-xs">-</span>
                        )}
                      </td>

                      {/* LTP with Real-time Price Flash */}
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-xs">
                        <span className={`inline-block px-1.5 py-0.5 rounded transition-all duration-500 ${
                          priceFlashMap[stock.symbol] === "UP"
                            ? "bg-emerald-100 text-emerald-800 font-extrabold ring-2 ring-emerald-400/60 scale-105"
                            : priceFlashMap[stock.symbol] === "DOWN"
                            ? "bg-red-100 text-red-800 font-extrabold ring-2 ring-red-400/60 scale-105"
                            : "text-slate-900"
                        }`}>
                          ₹{stock.ltp ? stock.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                        </span>
                      </td>

                      {/* % Change Pill Badge (Groww Style) */}
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold font-mono tabular-nums ${
                            isPos
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              : isNeg
                              ? "bg-red-50 text-red-700 border border-red-200/60"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {isPos ? "+" : ""}{pct.toFixed(2)}%
                        </span>
                      </td>

                      {/* Day Range Slider [--•--------] */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-500">
                          <span className="w-12 text-right truncate">{low > 0 ? low.toFixed(0) : "-"}</span>
                          <div className="relative w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 bottom-0 bg-slate-800 rounded-full"
                              style={{ left: `${dPosPct}%`, width: "4px" }}
                            />
                          </div>
                          <span className="w-12 text-left truncate">{high > 0 ? high.toFixed(0) : "-"}</span>
                        </div>
                      </td>

                      {/* Volume */}
                      <td className="py-3 px-4 text-right font-mono text-slate-700 text-xs tabular-nums">
                        {stock.volume ? stock.volume.toLocaleString("en-IN") : "-"}
                      </td>

                      {/* 52W Range Slider [--•--------] */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-500">
                          <span className="w-12 text-right truncate">{yLow > 0 ? yLow.toFixed(0) : "-"}</span>
                          <div className="relative w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 bottom-0 bg-[#00B386] rounded-full"
                              style={{ left: `${yPosPct}%`, width: "4px" }}
                            />
                          </div>
                          <span className="w-12 text-left truncate">{yHigh > 0 ? yHigh.toFixed(0) : "-"}</span>
                        </div>
                      </td>

                      {/* 30D % */}
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums hidden xl:table-cell">
                        {stock.per_change_30d !== undefined && stock.per_change_30d !== null ? (
                          <span className={stock.per_change_30d > 0 ? "text-emerald-700 font-semibold" : stock.per_change_30d < 0 ? "text-red-700 font-semibold" : "text-slate-600"}>
                            {stock.per_change_30d > 0 ? "+" : ""}{stock.per_change_30d.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 365D % */}
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums hidden xl:table-cell">
                        {stock.per_change_365d !== undefined && stock.per_change_365d !== null ? (
                          <span className={stock.per_change_365d > 0 ? "text-emerald-700 font-semibold" : stock.per_change_365d < 0 ? "text-red-700 font-semibold" : "text-slate-600"}>
                            {stock.per_change_365d > 0 ? "+" : ""}{stock.per_change_365d.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Turnover (Cr) */}
                      <td className="py-3 px-4 text-right font-mono text-slate-700 text-xs tabular-nums hidden lg:table-cell">
                        ₹{turnoverCr > 0 ? turnoverCr.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "-"}
                      </td>

                      {/* Action Chevron */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00B386] group-hover:translate-x-0.5 transition font-sans">
                          <span>Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>

          </table>
        </div>
      </div>

    </div>
  );
};
