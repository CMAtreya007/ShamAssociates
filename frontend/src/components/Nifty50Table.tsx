import React, { useState, useMemo } from "react";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  IndianRupee, 
  ChevronRight 
} from "lucide-react";
import { Nifty50Stock } from "../types";

interface Nifty50TableProps {
  stocks: Nifty50Stock[];
  isLoading: boolean;
  onSelectStock: (symbol: string) => void;
}

type SortField = keyof Nifty50Stock | "turnover_cr";

export const Nifty50Table: React.FC<Nifty50TableProps> = ({ stocks, isLoading, onSelectStock }) => {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("pct_change");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Summary Metrics
  const summary = useMemo(() => {
    if (!stocks || stocks.length === 0) return null;
    let adv = 0, dec = 0, unch = 0;
    let topGainer = stocks[0];
    let topLoser = stocks[0];
    let totalTurnover = 0;

    stocks.forEach((s) => {
      const chg = s.pct_change || 0;
      if (chg > 0) adv++;
      else if (chg < 0) dec++;
      else unch++;

      if ((s.pct_change || 0) > (topGainer.pct_change || 0)) topGainer = s;
      if ((s.pct_change || 0) < (topLoser.pct_change || 0)) topLoser = s;
      if (s.turnover) totalTurnover += s.turnover;
    });

    return {
      advances: adv,
      declines: dec,
      unchanged: unch,
      topGainer,
      topLoser,
      totalTurnoverCr: totalTurnover / 10000000.0,
    };
  }, [stocks]);

  // Max volume for relative bar visualization
  const maxVolume = useMemo(() => {
    if (!stocks || stocks.length === 0) return 1;
    return Math.max(...stocks.map((s) => s.volume || 0), 1);
  }, [stocks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredAndSortedStocks = useMemo(() => {
    return stocks
      .filter((s) => {
        const query = search.toLowerCase();
        return (
          s.symbol.toLowerCase().includes(query) ||
          (s.company_name && s.company_name.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        let valA: any = a[sortField as keyof Nifty50Stock];
        let valB: any = b[sortField as keyof Nifty50Stock];

        if (sortField === "turnover_cr") {
          valA = a.turnover || 0;
          valB = b.turnover || 0;
        }

        if (valA === undefined || valA === null) valA = sortDirection === "asc" ? Infinity : -Infinity;
        if (valB === undefined || valB === null) valB = sortDirection === "asc" ? Infinity : -Infinity;

        if (typeof valA === "string") {
          return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        return sortDirection === "asc" ? valA - valB : valB - valA;
      });
  }, [stocks, search, sortField, sortDirection]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Loading Nifty 50 overview...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* KPI Top Stat Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Advances / Declines */}
          <div className="glass-card rounded-xl p-4 flex items-center justify-between border-slate-800">
            <div>
              <p className="text-xs font-medium text-slate-400">Market Breadth (ADR)</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-lg font-bold text-emerald-400">{summary.advances} <span className="text-xs font-normal text-slate-400">Adv</span></span>
                <span className="text-slate-600">/</span>
                <span className="text-lg font-bold text-rose-400">{summary.declines} <span className="text-xs font-normal text-slate-400">Dec</span></span>
                {summary.unchanged > 0 && (
                  <span className="text-xs text-slate-500">({summary.unchanged} Unch)</span>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
          </div>

          {/* Top Gainer */}
          <div 
            onClick={() => onSelectStock(summary.topGainer.symbol)}
            className="glass-card rounded-xl p-4 flex items-center justify-between border-slate-800 cursor-pointer hover:border-emerald-500/40 transition group"
          >
            <div>
              <p className="text-xs font-medium text-slate-400">Top Gainer</p>
              <p className="text-base font-bold text-white mt-1 group-hover:text-emerald-400 transition">{summary.topGainer.symbol}</p>
              <p className="text-xs font-mono font-semibold text-emerald-400">
                ₹{summary.topGainer.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (+{summary.topGainer.pct_change?.toFixed(2)}%)
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Top Loser */}
          <div 
            onClick={() => onSelectStock(summary.topLoser.symbol)}
            className="glass-card rounded-xl p-4 flex items-center justify-between border-slate-800 cursor-pointer hover:border-rose-500/40 transition group"
          >
            <div>
              <p className="text-xs font-medium text-slate-400">Top Drag</p>
              <p className="text-base font-bold text-white mt-1 group-hover:text-rose-400 transition">{summary.topLoser.symbol}</p>
              <p className="text-xs font-mono font-semibold text-rose-400">
                ₹{summary.topLoser.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({summary.topLoser.pct_change?.toFixed(2)}%)
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>

          {/* Total Turnover */}
          <div className="glass-card rounded-xl p-4 flex items-center justify-between border-slate-800">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Nifty 50 Turnover</p>
              <p className="text-lg font-bold text-white font-mono mt-1">
                ₹ {summary.totalTurnoverCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} <span className="text-xs font-sans text-slate-400 font-normal">Cr</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">50 Constituent Stocks</p>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>

        </div>
      )}

      {/* Table Controls & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search stock symbol or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition font-sans"
          />
        </div>
        <div className="text-xs text-slate-400 self-end sm:self-auto">
          Showing <span className="font-semibold text-white">{filteredAndSortedStocks.length}</span> of {stocks.length} stocks
        </div>
      </div>

      {/* Main Sortable Table */}
      <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-slate-900/60 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                
                <th onClick={() => handleSort("symbol")} className="py-3 px-4 cursor-pointer hover:text-white transition">
                  <div className="flex items-center gap-1.5">
                    <span>Symbol</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("ltp")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>LTP (₹)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("pct_change")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>% Change</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("volume")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition min-w-[140px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Volume</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("turnover_cr")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Turnover (₹ Cr)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("year_high")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition hidden md:table-cell">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>52W High</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("near_wkh")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition hidden lg:table-cell">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Near 52W High</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("per_change_30d")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition hidden xl:table-cell">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>30D %</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th onClick={() => handleSort("per_change_365d")} className="py-3 px-4 text-right cursor-pointer hover:text-white transition hidden xl:table-cell">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>365D %</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>

                <th className="py-3 px-3 text-center"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredAndSortedStocks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    No stocks matching "{search}".
                  </td>
                </tr>
              ) : (
                filteredAndSortedStocks.map((stock) => {
                  const pct = stock.pct_change || 0;
                  const isPositive = pct > 0;
                  const isNegative = pct < 0;
                  const turnoverCr = (stock.turnover || 0) / 10000000.0;
                  const volPct = Math.min(((stock.volume || 0) / maxVolume) * 100, 100);

                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => onSelectStock(stock.symbol)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      {/* Symbol & Name */}
                      <td className="py-3 px-4 font-medium">
                        <div className="flex flex-col">
                          <span className="text-white font-bold tracking-wide group-hover:text-blue-400 transition">
                            {stock.symbol}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {stock.company_name || stock.symbol}
                          </span>
                        </div>
                      </td>

                      {/* LTP */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                        ₹{stock.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "-"}
                      </td>

                      {/* % Change Badge */}
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-xs font-bold ${
                            isPositive
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : isNegative
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : "bg-slate-800 text-slate-300 border border-slate-700"
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : isNegative ? (
                            <ArrowDown className="w-3 h-3" />
                          ) : null}
                          {isPositive ? "+" : ""}
                          {pct.toFixed(2)}%
                        </span>
                      </td>

                      {/* Volume + Bar */}
                      <td className="py-3 px-4 text-right font-mono">
                        <div className="flex flex-col items-end">
                          <span className="text-slate-200">
                            {stock.volume ? stock.volume.toLocaleString("en-IN") : "-"}
                          </span>
                          <div className="w-20 bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
                            <div
                              className="bg-blue-500 h-full rounded-full"
                              style={{ width: `${volPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Turnover */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        ₹{turnoverCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 52W High */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300 hidden md:table-cell">
                        ₹{stock.year_high?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "-"}
                      </td>

                      {/* Near 52W High */}
                      <td className="py-3 px-4 text-right font-mono text-xs hidden lg:table-cell">
                        <span className={(stock.near_wkh || 0) >= -5 ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                          {stock.near_wkh ? `${stock.near_wkh > 0 ? "+" : ""}${stock.near_wkh.toFixed(2)}%` : "-"}
                        </span>
                      </td>

                      {/* 30D % */}
                      <td className="py-3 px-4 text-right font-mono text-xs hidden xl:table-cell">
                        <span className={(stock.per_change_30d || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {stock.per_change_30d ? `${stock.per_change_30d > 0 ? "+" : ""}${stock.per_change_30d.toFixed(2)}%` : "-"}
                        </span>
                      </td>

                      {/* 365D % */}
                      <td className="py-3 px-4 text-right font-mono text-xs hidden xl:table-cell">
                        <span className={(stock.per_change_365d || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {stock.per_change_365d ? `${stock.per_change_365d > 0 ? "+" : ""}${stock.per_change_365d.toFixed(2)}%` : "-"}
                        </span>
                      </td>

                      {/* Arrow Detail */}
                      <td className="py-3 px-3 text-center text-slate-500 group-hover:text-blue-400 transition">
                        <ChevronRight className="w-4 h-4 inline-block" />
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
