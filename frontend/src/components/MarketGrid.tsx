import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  SlidersHorizontal,
  ChevronRight 
} from "lucide-react";
import { Nifty50Stock } from "../types";

interface MarketGridProps {
  stocks: Nifty50Stock[];
  isLoading: boolean;
  onSelectStock: (symbol: string) => void;
}

type SortField = keyof Nifty50Stock | "turnover_cr" | "range_position";

export const MarketGrid: React.FC<MarketGridProps> = ({ stocks, isLoading, onSelectStock }) => {
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
        } else if (sortField === "range_position") {
          const rangeA = (a.year_high || 1) - (a.year_low || 0);
          const rangeB = (b.year_high || 1) - (b.year_low || 0);
          valA = rangeA > 0 ? ((a.ltp || 0) - (a.year_low || 0)) / rangeA : 0;
          valB = rangeB > 0 ? ((b.ltp || 0) - (b.year_low || 0)) / rangeB : 0;
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
      <div className="flex flex-col items-center justify-center py-28 text-[var(--text-secondary)]">
        <div className="w-9 h-9 border-2 border-[var(--border-hairline)] border-t-[var(--accent)] rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono tracking-tight">Ingesting live Nifty 50 constituent snapshots...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      
      {/* Search & Density Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter by symbol or company name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg pl-8 pr-4 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 transition font-sans"
          />
        </div>

        {summary && (
          <div className="flex items-center gap-4 text-xs font-mono text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">ADR:</span>
              <strong className="text-[var(--gain)]">{summary.advances} Adv</strong>
              <span className="text-[var(--text-muted)]">/</span>
              <strong className="text-[var(--loss)]">{summary.declines} Dec</strong>
            </span>
            <span className="hidden md:inline text-[var(--text-muted)]">•</span>
            <span className="hidden md:inline">
              <span className="text-[var(--text-muted)]">N50 Volume Turnover:</span>{" "}
              <strong className="text-[var(--text-primary)]">₹{summary.totalTurnoverCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr</strong>
            </span>
            <span className="text-[var(--text-muted)]">•</span>
            <span className="text-[var(--text-muted)]">
              Showing <strong className="text-[var(--text-primary)]">{filteredAndSortedStocks.length}</strong>/50
            </span>
          </div>
        )}
      </div>

      {/* Main High-Density Grid Container */}
      <div className="rounded-xl border border-[var(--border-hairline)] overflow-hidden bg-[var(--bg-surface)] shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            
            {/* Sticky Table Header */}
            <thead className="sticky top-0 z-10 backdrop-blur-md bg-[var(--bg-surface)]/95 border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-secondary)] select-none uppercase tracking-wider">
              <tr>
                <th onClick={() => handleSort("symbol")} className="py-2.5 px-3 cursor-pointer hover:text-white transition">
                  <div className="flex items-center gap-1">
                    <span>Symbol</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("ltp")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition">
                  <div className="flex items-center justify-end gap-1">
                    <span>LTP (₹)</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("pct_change")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition min-w-[95px]">
                  <div className="flex items-center justify-end gap-1">
                    <span>% Chg</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("open")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition hidden md:table-cell">
                  <div className="flex items-center justify-end gap-1">
                    <span>Open</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("high")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition hidden md:table-cell">
                  <div className="flex items-center justify-end gap-1">
                    <span>High</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("low")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition hidden md:table-cell">
                  <div className="flex items-center justify-end gap-1">
                    <span>Low</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("volume")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition">
                  <div className="flex items-center justify-end gap-1">
                    <span>Volume</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("turnover_cr")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition hidden lg:table-cell">
                  <div className="flex items-center justify-end gap-1">
                    <span>Turnover (Cr)</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("range_position")} className="py-2.5 px-4 text-center cursor-pointer hover:text-white transition min-w-[150px]">
                  <div className="flex items-center justify-center gap-1">
                    <span>52W Range</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th onClick={() => handleSort("per_change_30d")} className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition hidden xl:table-cell">
                  <div className="flex items-center justify-end gap-1">
                    <span>30D %</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>

                <th className="py-2.5 px-2 text-center w-8"></th>
              </tr>
            </thead>

            {/* High-Density Rows with Framer Motion Layout Animations */}
            <tbody className="divide-y divide-[var(--border-hairline)] text-xs font-mono">
              {filteredAndSortedStocks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-[var(--text-muted)] font-sans">
                    No stocks matching "{search}".
                  </td>
                </tr>
              ) : (
                filteredAndSortedStocks.map((stock) => {
                  const pct = stock.pct_change || 0;
                  const isPos = pct > 0;
                  const isNeg = pct < 0;
                  const turnoverCr = (stock.turnover || 0) / 10000000.0;

                  // 52-Week Range calculation: where does LTP sit between Low and High?
                  const yHigh = stock.year_high || 1;
                  const yLow = stock.year_low || 0;
                  const ltp = stock.ltp || yLow;
                  const rangeSpan = Math.max(yHigh - yLow, 0.01);
                  const rangePct = Math.min(Math.max(((ltp - yLow) / rangeSpan) * 100, 0), 100);

                  return (
                    <motion.tr
                      key={stock.symbol}
                      layout
                      onClick={() => onSelectStock(stock.symbol)}
                      className="hover:bg-[var(--bg-surface-hover)] cursor-pointer transition-colors group select-none"
                    >
                      {/* Symbol & Name */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition">
                            {stock.symbol}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] font-sans truncate max-w-[120px] hidden sm:inline">
                            {stock.company_name || stock.symbol}
                          </span>
                        </div>
                      </td>

                      {/* LTP */}
                      <td className="py-2 px-3 text-right font-semibold text-[var(--text-primary)] tabular-nums">
                        ₹{stock.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "-"}
                      </td>

                      {/* % Change Badge */}
                      <td className="py-2 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold tabular-nums ${
                            isPos
                              ? "text-[var(--gain)] bg-[var(--gain-bg)] border border-[var(--gain)]/20"
                              : isNeg
                              ? "text-[var(--loss)] bg-[var(--loss-bg)] border border-[var(--loss)]/20"
                              : "text-[var(--text-secondary)] bg-[#1A202C]"
                          }`}
                        >
                          {isPos ? "+" : ""}{pct.toFixed(2)}%
                        </span>
                      </td>

                      {/* Open */}
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)] tabular-nums hidden md:table-cell">
                        {stock.open?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "-"}
                      </td>

                      {/* High */}
                      <td className="py-2 px-3 text-right text-[var(--gain)]/90 tabular-nums hidden md:table-cell">
                        {stock.high?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "-"}
                      </td>

                      {/* Low */}
                      <td className="py-2 px-3 text-right text-[var(--loss)]/90 tabular-nums hidden md:table-cell">
                        {stock.low?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "-"}
                      </td>

                      {/* Volume */}
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                        {stock.volume ? stock.volume.toLocaleString("en-IN") : "-"}
                      </td>

                      {/* Turnover Cr */}
                      <td className="py-2 px-3 text-right text-[var(--text-secondary)] tabular-nums hidden lg:table-cell">
                        ₹{turnoverCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 52W Range Bar [====|===] */}
                      <td className="py-2 px-4 text-center">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-[var(--text-muted)] w-10 text-right truncate">
                            {yLow.toFixed(0)}
                          </span>
                          <div className="flex-1 bg-[#1F2530] rounded-full h-1.5 relative overflow-visible">
                            {/* Fill bar */}
                            <div
                              className="bg-gradient-to-r from-blue-600 to-[var(--accent)] h-full rounded-full"
                              style={{ width: `${rangePct}%` }}
                            />
                            {/* Position Pip */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-sm ring-1 ring-[var(--accent)]"
                              style={{ left: `calc(${rangePct}% - 4px)` }}
                            />
                          </div>
                          <span className="text-[9px] text-[var(--text-muted)] w-10 text-left truncate">
                            {yHigh.toFixed(0)}
                          </span>
                        </div>
                      </td>

                      {/* 30D % */}
                      <td className="py-2 px-3 text-right tabular-nums hidden xl:table-cell">
                        <span className={(stock.per_change_30d || 0) >= 0 ? "text-[var(--gain)]" : "text-[var(--loss)]"}>
                          {stock.per_change_30d ? `${stock.per_change_30d > 0 ? "+" : ""}${stock.per_change_30d.toFixed(2)}%` : "-"}
                        </span>
                      </td>

                      {/* Detail Chevron */}
                      <td className="py-2 px-2 text-center text-[var(--text-muted)] group-hover:text-[var(--accent)] transition">
                        <ChevronRight className="w-3.5 h-3.5 inline-block" />
                      </td>
                    </motion.tr>
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
