import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  Plus, 
  Download, 
  Trash2, 
  Star, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  IndianRupee, 
  CalendarDays, 
  ChevronRight, 
  X, 
  Loader2,
  Sparkles,
  RefreshCw,
  Zap,
  ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { CustomStockItem, SymbolSearchResult } from "../types";
import { 
  fetchCustomStocks, 
  addCustomStock, 
  removeCustomStock, 
  searchSymbols, 
  downloadCustomStocksExcel 
} from "../services/api";

interface CustomStocksViewProps {
  selectedDate: string;
  onSelectStock: (symbol: string) => void;
  priceFlashMap?: Record<string, "UP" | "DOWN">;
}

type SortField = keyof CustomStockItem | "turnover_cr" | "day_range_pos" | "year_range_pos";

// Client-side in-memory cache for 0ms instant page loads across navigation
const customStocksMemoryCache: Record<string, CustomStockItem[]> = {};

// Popular suggested stocks for 1-click quick add
const POPULAR_SUGGESTIONS = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd.", industry: "Oil & Gas" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd.", industry: "IT Services" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", industry: "Private Bank" },
  { symbol: "INFY", name: "Infosys Ltd.", industry: "IT Services" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd.", industry: "Private Bank" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd.", industry: "Automobile" },
  { symbol: "SBIN", name: "State Bank of India", industry: "Public Bank" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd.", industry: "Telecom" },
  { symbol: "ITC", name: "ITC Ltd.", industry: "FMCG" },
  { symbol: "LT", name: "Larsen & Toubro Ltd.", industry: "Construction" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd.", industry: "Financial Services" },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd.", industry: "Automobile" },
];

export const CustomStocksView: React.FC<CustomStocksViewProps> = ({
  selectedDate,
  onSelectStock,
  priceFlashMap = {}
}) => {
  const cacheKey = selectedDate || "latest";

  // Initial state retrieved from memory cache for 0ms sub-second rendering
  const [stocks, setStocks] = useState<CustomStockItem[]>(() => {
    return customStocksMemoryCache[cacheKey] || [];
  });
  
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return !customStocksMemoryCache[cacheKey];
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("pct_change");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Add Stock Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Load Custom Stocks with SWR (Stale-While-Revalidate) pattern
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent && stocks.length === 0) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchCustomStocks(selectedDate);
      setStocks(data);
      customStocksMemoryCache[cacheKey] = data;
    } catch (err) {
      console.error("Failed to load custom stocks:", err);
      if (stocks.length === 0) {
        toast.error("Could not load custom stocks watchlist");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDate, cacheKey, stocks.length]);

  useEffect(() => {
    loadData(stocks.length > 0);
  }, [selectedDate]);

  // Autocomplete search debounce (150ms for snappy responsiveness)
  useEffect(() => {
    if (!addSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchSymbols(addSearchQuery);
        setSearchResults(results);
      } catch (err) {
        console.warn("Symbol search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [addSearchQuery]);

  // Handle Add Stock with optimistic update
  const handleAddStock = async (symbol: string, companyName?: string) => {
    const cleanSym = symbol.trim().toUpperCase();
    if (!cleanSym) return;

    setIsAdding(true);
    try {
      const res = await addCustomStock(cleanSym, companyName);
      toast.success(res.message || `Added ${cleanSym} to Custom Stocks`);
      setAddSearchQuery("");
      setSearchResults([]);
      setIsAddModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      toast.error(err.message || `Failed to add ${cleanSym}`);
    } finally {
      setIsAdding(false);
    }
  };

  // Handle Remove Stock with optimistic UI update
  const handleRemoveStock = async (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const prevStocks = [...stocks];
    // Optimistic removal
    setStocks((prev) => {
      const updated = prev.filter((s) => s.symbol !== symbol);
      customStocksMemoryCache[cacheKey] = updated;
      return updated;
    });

    try {
      await removeCustomStock(symbol);
      toast.success(`Removed ${symbol} from Custom Stocks`);
    } catch (err: any) {
      // Revert optimistic update on failure
      setStocks(prevStocks);
      customStocksMemoryCache[cacheKey] = prevStocks;
      toast.error(err.message || `Failed to remove ${symbol}`);
    }
  };

  // Handle Download Excel
  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    const toastId = toast.loading("Generating Custom Stocks Excel workbook...");
    try {
      const result = await downloadCustomStocksExcel(selectedDate);
      toast.success("Excel Workbook Downloaded!", {
        id: toastId,
        description: `Saved ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to download custom stocks spreadsheet", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

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

  // Fast memoized filter and sort
  const filteredAndSorted = useMemo(() => {
    return stocks
      .filter((s) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          s.symbol.toLowerCase().includes(q) ||
          (s.company_name && s.company_name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        let valA: any = a[sortField as keyof CustomStockItem];
        let valB: any = b[sortField as keyof CustomStockItem];

        if (sortField === "turnover_cr") {
          valA = a.turnover || 0;
          valB = b.turnover || 0;
        } else if (sortField === "day_range_pos") {
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
  }, [stocks, search, sortField, sortDirection]);

  return (
    <div className="space-y-5">
      
      {/* 1. Header Toolbar & Action Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Title & Badge */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#00B386] shadow-xs">
            <Star className="w-5 h-5 fill-emerald-500 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 font-sans">Custom Stocks Watchlist</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-[#00B386] border border-emerald-200/60 font-semibold">
                {stocks.length} Tracked
              </span>
              {isRefreshing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200/50 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Syncing live...</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Personalized watchlist with live intraday analytics, 4 performance indicators, and multi-sheet Excel export
            </p>
          </div>
        </div>

        {/* Action Buttons: Add Stock & Download Excel */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#00B386] hover:bg-[#009b74] text-white text-xs font-semibold shadow-xs shadow-emerald-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Stock</span>
          </button>

          <button
            onClick={handleDownloadExcel}
            disabled={isDownloading || stocks.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
            title="Download multi-sheet Excel workbook with Overview and individual stock tabs"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Download Excel</span>
          </button>
        </div>

      </div>

      {/* 2. Top Summary Stat Cards */}
      {summary && stocks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Advances / Declines */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-card">
            <div>
              <p className="text-xs font-medium text-slate-500">Watchlist Breadth</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-lg font-bold text-emerald-600 font-mono">{summary.advances} <span className="text-xs font-sans text-slate-400 font-normal">Adv</span></span>
                <span className="text-slate-300">/</span>
                <span className="text-lg font-bold text-rose-600 font-mono">{summary.declines} <span className="text-xs font-sans text-slate-400 font-normal">Dec</span></span>
                {summary.unchanged > 0 && (
                  <span className="text-xs text-slate-400 font-mono font-medium">({summary.unchanged} Unch)</span>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>

          {/* Top Gainer */}
          <div 
            onClick={() => summary.topGainer && onSelectStock(summary.topGainer.symbol)}
            className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-card cursor-pointer hover:border-emerald-500/50 transition group"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Top Gainer</p>
              <p className="text-sm font-bold text-slate-900 mt-1 group-hover:text-emerald-600 transition">{summary.topGainer?.symbol || "-"}</p>
              <p className="text-xs font-mono font-semibold text-emerald-600 mt-0.5">
                {summary.topGainer?.ltp ? `₹${summary.topGainer.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"} 
                {summary.topGainer?.pct_change !== undefined ? ` (+${summary.topGainer.pct_change.toFixed(2)}%)` : ""}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Top Drag */}
          <div 
            onClick={() => summary.topLoser && onSelectStock(summary.topLoser.symbol)}
            className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-card cursor-pointer hover:border-rose-500/50 transition group"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Top Drag</p>
              <p className="text-sm font-bold text-slate-900 mt-1 group-hover:text-rose-600 transition">{summary.topLoser?.symbol || "-"}</p>
              <p className="text-xs font-mono font-semibold text-rose-600 mt-0.5">
                {summary.topLoser?.ltp ? `₹${summary.topLoser.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"} 
                {summary.topLoser?.pct_change !== undefined ? ` (${summary.topLoser.pct_change.toFixed(2)}%)` : ""}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>

          {/* Watchlist Turnover */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-card">
            <div>
              <p className="text-xs font-medium text-slate-500">Watchlist Turnover</p>
              <p className="text-lg font-bold text-slate-900 font-mono mt-1">
                ₹ {summary.totalTurnoverCr.toLocaleString("en-IN", { maximumFractionDigits: 1 })} <span className="text-xs font-sans text-slate-400 font-normal">Cr</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{stocks.length} Custom Stocks</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>

        </div>
      )}

      {/* 3. Table Filter Search Toolbar */}
      {stocks.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-card">
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter custom stocks by symbol or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
            <span>
              Showing <strong className="text-slate-900 font-mono">{filteredAndSorted.length}</strong> of {stocks.length} custom stocks
            </span>
            <button
              onClick={() => loadData(false)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              title="Refresh custom stocks"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* 4. Table or Empty State */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-card">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 py-6">
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              <span className="text-xs font-medium text-slate-600">Loading custom stocks data & live performance...</span>
            </div>
            {/* Skeleton Table Rows */}
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-12 bg-slate-100/70 rounded-xl w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : stocks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-card space-y-6 max-w-2xl mx-auto my-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
            <Star className="w-7 h-7 fill-emerald-500/20 text-emerald-600" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-slate-900">Your Custom Watchlist is Empty</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Add any NSE stock to monitor real-time prices, 4 custom performance indicators (Market Performance, Premarket, Recovery from Low, Distance from High), and generate multi-sheet Excel reports.
            </p>
          </div>

          {/* Quick Add Suggestions */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              Quick Add Popular Blue-Chips
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {POPULAR_SUGGESTIONS.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => handleAddStock(item.symbol, item.name)}
                  disabled={isAdding}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                  <span>{item.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00B386] hover:bg-[#009b74] text-white text-xs font-semibold shadow-xs shadow-emerald-500/20 transition cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Search & Add Other Stocks</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider select-none sticky top-0 z-10">
                <tr>
                  <th onClick={() => handleSort("symbol")} className="py-3 px-4 cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center gap-1.5">
                      <span>Company / Symbol</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th className="py-3 px-4 text-left select-none min-w-[200px]">
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

                  <th onClick={() => handleSort("previous_close")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden sm:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>Prev Close</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  {/* 4 Performance Indicators */}
                  <th onClick={() => handleSort("market_performance")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden md:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>Mkt Perf</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("premarket")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden lg:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>Premarket</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("recover_from_low")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden xl:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>Rec Low</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("distance_from_high")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden xl:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>Dist High</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("open")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden sm:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>Open</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("high")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden md:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>High</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("low")} className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 transition hidden md:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <span>Low</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("day_range_pos")} className="py-3 px-4 cursor-pointer hover:text-slate-900 transition min-w-[130px]">
                    <div className="flex items-center justify-between gap-1">
                      <span>Day Range</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("volume")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Volume</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("turnover_cr")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition hidden lg:table-cell">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Turnover</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("year_range_pos")} className="py-3 px-4 cursor-pointer hover:text-slate-900 transition min-w-[140px]">
                    <div className="flex items-center justify-between gap-1">
                      <span>52W Range</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th className="py-3 px-4 text-center">
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredAndSorted.map((stock) => {
                  const pct = stock.pct_change || 0;
                  const isPos = pct > 0;
                  const isNeg = pct < 0;
                  const turnoverCr = (stock.turnover || 0) / 10000000.0;
                  const flash = priceFlashMap[stock.symbol];

                  // 4 Performance metrics
                  const mktPerf = stock.market_performance ?? ((stock.ltp !== undefined && stock.previous_close !== undefined) ? (stock.ltp - stock.previous_close) : stock.change);
                  const premarket = stock.premarket ?? ((stock.open !== undefined && stock.previous_close !== undefined) ? (stock.open - stock.previous_close) : undefined);
                  const recLow = stock.recover_from_low ?? ((stock.ltp !== undefined && stock.low !== undefined) ? (stock.ltp - stock.low) : undefined);
                  const distHigh = stock.distance_from_high ?? ((stock.ltp !== undefined && stock.high !== undefined) ? (stock.ltp - stock.high) : undefined);

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
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center font-bold text-xs text-emerald-800 font-mono flex-shrink-0">
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

                      {/* Catalyst / Action Column */}
                      <td className="py-3 px-4 text-left">
                        {stock.catalysts && stock.catalysts.length > 0 ? (
                          (() => {
                            const cat = stock.catalysts[0];
                            const isDiv = cat.action_type === "DIVIDEND";
                            const isSplit = ["SPLIT", "BONUS", "BUYBACK", "RIGHTS"].includes(cat.action_type);
                            const isResults = cat.action_type === "RESULTS" || cat.action_type === "BOARD_MEETING";
                            
                            return (
                              <div 
                                className="flex items-center gap-1.5 max-w-[220px]"
                                title={`${cat.subject} (Ex: ${cat.ex_date || "-"})`}
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

                      {/* LTP with Live Pulse Flash */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        <span className={`inline-block px-1 rounded transition-colors duration-500 ${
                          flash === "UP" ? "bg-emerald-100 text-emerald-800" : flash === "DOWN" ? "bg-rose-100 text-rose-800" : ""
                        }`}>
                          {stock.ltp !== undefined && stock.ltp !== null ? `₹${stock.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                        </span>
                      </td>

                      {/* % Change & Change */}
                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-semibold text-xs ${
                            isPos
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              : isNeg
                              ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {isPos ? "+" : ""}{pct.toFixed(2)}%
                        </span>
                        {stock.change !== undefined && (
                          <div className={`text-[10px] mt-0.5 ${isPos ? "text-emerald-600" : isNeg ? "text-rose-600" : "text-slate-400"}`}>
                            {stock.change > 0 ? "+" : ""}{stock.change.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Previous Close */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600 hidden sm:table-cell">
                        {stock.previous_close ? `₹${stock.previous_close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                      </td>

                      {/* Market Performance */}
                      <td className="py-3 px-3 text-right font-mono hidden md:table-cell">
                        {mktPerf !== undefined && mktPerf !== null ? (
                          <span className={mktPerf > 0 ? "text-emerald-600 font-semibold" : mktPerf < 0 ? "text-rose-600 font-semibold" : "text-slate-500"}>
                            {mktPerf > 0 ? "+" : ""}{mktPerf.toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Premarket */}
                      <td className="py-3 px-3 text-right font-mono hidden lg:table-cell">
                        {premarket !== undefined && premarket !== null ? (
                          <span className={premarket > 0 ? "text-emerald-600 font-semibold" : premarket < 0 ? "text-rose-600 font-semibold" : "text-slate-500"}>
                            {premarket > 0 ? "+" : ""}{premarket.toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Recover from Low */}
                      <td className="py-3 px-3 text-right font-mono hidden xl:table-cell">
                        {recLow !== undefined && recLow !== null ? (
                          <span className={recLow > 0 ? "text-emerald-600 font-semibold" : "text-slate-500"}>
                            +{recLow.toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Distance from High */}
                      <td className="py-3 px-3 text-right font-mono hidden xl:table-cell">
                        {distHigh !== undefined && distHigh !== null ? (
                          <span className={distHigh < 0 ? "text-rose-600 font-semibold" : "text-slate-500"}>
                            {distHigh.toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Open */}
                      <td className="py-3 px-3 text-right font-mono text-slate-700 hidden sm:table-cell">
                        {stock.open ? `₹${stock.open.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                      </td>

                      {/* High */}
                      <td className="py-3 px-3 text-right font-mono text-slate-700 hidden md:table-cell">
                        {stock.high ? `₹${stock.high.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                      </td>

                      {/* Low */}
                      <td className="py-3 px-3 text-right font-mono text-slate-700 hidden md:table-cell">
                        {stock.low ? `₹${stock.low.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                      </td>

                      {/* Day Range Bar */}
                      <td className="py-3 px-4 min-w-[140px]">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-slate-500">
                            <span>₹{low.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                            <span>₹{high.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 to-[#00B386] rounded-full"
                              style={{ width: `${dPosPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Volume */}
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        <div>{stock.volume ? stock.volume.toLocaleString("en-IN") : "-"}</div>
                        {stock.volume && (
                          <div className="w-16 h-1 bg-slate-100 rounded-full ml-auto mt-1 overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min((stock.volume / maxVolume) * 100, 100)}%` }}
                            />
                          </div>
                        )}
                      </td>

                      {/* Turnover */}
                      <td className="py-3 px-4 text-right font-mono text-slate-700 hidden lg:table-cell">
                        {turnoverCr ? `₹${turnoverCr.toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr` : "-"}
                      </td>

                      {/* 52-Week Range */}
                      <td className="py-3 px-4 min-w-[150px]">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-slate-500">
                            <span>₹{yLow.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                            <span>₹{yHigh.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full"
                              style={{ width: `${yPosPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Actions: View Details & Remove Stock */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectStock(stock.symbol);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                            title="View deep quote & analytics"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => handleRemoveStock(stock.symbol, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title={`Remove ${stock.symbol} from Custom Stocks`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        </div>
      )}

      {/* 5. Modern Add Stock Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#00B386]">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Stock to Watchlist</h3>
                  <p className="text-[11px] text-slate-500">Search by NSE symbol or company name</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Search Input */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Type symbol (e.g. ZOMATO, TATAELXSI, IRFC, TCS)..."
                  value={addSearchQuery}
                  onChange={(e) => setAddSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && addSearchQuery.trim()) {
                      handleAddStock(addSearchQuery.trim());
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 font-sans focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-2xs"
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 text-emerald-600 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-slate-100 max-h-80">
              {addSearchQuery.trim() && searchResults.length === 0 && !isSearching ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-xs text-slate-500">No exact database match for "{addSearchQuery}".</p>
                  <button
                    onClick={() => handleAddStock(addSearchQuery.trim())}
                    disabled={isAdding}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00B386] hover:bg-[#009b74] text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
                    <span>Add "{addSearchQuery.trim().toUpperCase()}" directly from NSE</span>
                  </button>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((item) => {
                  const alreadyAdded = stocks.some((s) => s.symbol === item.symbol);
                  return (
                    <div
                      key={item.symbol}
                      className="p-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center font-bold text-xs text-emerald-800 font-mono flex-shrink-0">
                          {item.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-900 font-mono">{item.symbol}</span>
                            {item.industry && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                                {item.industry}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate max-w-xs">{item.company_name || item.symbol}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddStock(item.symbol, item.company_name)}
                        disabled={alreadyAdded || isAdding}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                          alreadyAdded
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-emerald-50 hover:bg-emerald-100 text-[#00B386] border border-emerald-200/80"
                        }`}
                      >
                        {alreadyAdded ? "Added" : isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3 stroke-[2.5]" /> Add</>}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                    Popular Indian Stocks
                  </p>
                  <div className="space-y-1">
                    {POPULAR_SUGGESTIONS.map((item) => {
                      const alreadyAdded = stocks.some((s) => s.symbol === item.symbol);
                      return (
                        <div
                          key={item.symbol}
                          className="p-2.5 flex items-center justify-between hover:bg-slate-50 rounded-xl transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center font-bold text-[11px] text-emerald-800 font-mono flex-shrink-0">
                              {item.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-slate-900 font-mono">{item.symbol}</span>
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-500">
                                  {item.industry}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 truncate max-w-xs">{item.name}</p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleAddStock(item.symbol, item.name)}
                            disabled={alreadyAdded || isAdding}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                              alreadyAdded
                                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                : "bg-emerald-50 hover:bg-emerald-100 text-[#00B386] border border-emerald-200/80"
                            }`}
                          >
                            {alreadyAdded ? "Added" : isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3 stroke-[2.5]" /> Add</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">Enter</kbd> to add instantly</span>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
