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
  ChevronLeft,
  ChevronFirst,
  ChevronLast,
  X, 
  Loader2,
  Sparkles,
  RefreshCw,
  Zap,
  ShieldCheck,
  Building2,
  Filter,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { CustomStockItem, SymbolSearchResult } from "../types";
import { 
  fetchCustomStocks, 
  fetchAllNseStocks,
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
type ViewMode = "watchlist" | "all";
type CategoryFilter = "all" | "gainers" | "losers" | "volume" | "near_52w_high" | "near_52w_low";

// Client-side in-memory cache for 0ms instant tab switching
const watchlistMemoryCache: Record<string, CustomStockItem[]> = {};
const allNseMemoryCache: Record<string, CustomStockItem[]> = {};

// Popular suggested stocks for 1-click quick add
const POPULAR_SUGGESTIONS = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd.", industry: "Oil & Gas" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd.", industry: "IT Services" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", industry: "Private Bank" },
  { symbol: "INFY", name: "Infosys Ltd.", industry: "IT Services" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd.", industry: "Private Bank" },
  { symbol: "TATACONSUM", name: "Tata Consumer Products Ltd.", industry: "FMCG / Beverages" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd.", industry: "Automobile" },
  { symbol: "SBIN", name: "State Bank of India", industry: "Public Bank" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd.", industry: "Telecom" },
  { symbol: "ITC", name: "ITC Ltd.", industry: "FMCG" },
  { symbol: "LT", name: "Larsen & Toubro Ltd.", industry: "Construction" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd.", industry: "Financial Services" },
  { symbol: "ZOMATO", name: "Zomato Ltd.", industry: "E-Commerce / Food" },
];

export const CustomStocksView: React.FC<CustomStocksViewProps> = ({
  selectedDate,
  onSelectStock,
  priceFlashMap = {}
}) => {
  const cacheKey = selectedDate || "latest";

  // Tab mode: "watchlist" vs "all"
  const [viewMode, setViewMode] = useState<ViewMode>("watchlist");

  // Watchlist & All NSE Stocks state
  const [watchlistStocks, setWatchlistStocks] = useState<CustomStockItem[]>(() => {
    return watchlistMemoryCache[cacheKey] || [];
  });
  const [allStocks, setAllStocks] = useState<CustomStockItem[]>(() => {
    return allNseMemoryCache[cacheKey] || [];
  });
  
  const [isLoadingWatchlist, setIsLoadingWatchlist] = useState<boolean>(() => {
    return !watchlistMemoryCache[cacheKey];
  });
  const [isLoadingAll, setIsLoadingAll] = useState<boolean>(() => {
    return !allNseMemoryCache[cacheKey];
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortField, setSortField] = useState<SortField>("pct_change");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Pagination state for smooth handling of 2,600+ items
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Add Stock Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Set of watchlist symbols for instantaneous O(1) bookmark status checks
  const watchlistSymbolsSet = useMemo(() => {
    return new Set(watchlistStocks.map((s) => s.symbol.toUpperCase().trim()));
  }, [watchlistStocks]);

  // Load Watchlist Data
  const loadWatchlist = useCallback(async (isSilent = false) => {
    if (!isSilent && watchlistStocks.length === 0) {
      setIsLoadingWatchlist(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchCustomStocks(selectedDate, undefined, "watchlist");
      setWatchlistStocks(data);
      watchlistMemoryCache[cacheKey] = data;
    } catch (err) {
      console.error("Failed to load watchlist:", err);
      if (watchlistStocks.length === 0) {
        toast.error("Could not load custom stocks watchlist");
      }
    } finally {
      setIsLoadingWatchlist(false);
      setIsRefreshing(false);
    }
  }, [selectedDate, cacheKey, watchlistStocks.length]);

  // Load All NSE Stocks
  const loadAllNseStocks = useCallback(async (isSilent = false) => {
    if (!isSilent && allStocks.length === 0) {
      setIsLoadingAll(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchAllNseStocks(selectedDate);
      setAllStocks(data);
      allNseMemoryCache[cacheKey] = data;
    } catch (err) {
      console.error("Failed to load all NSE stocks:", err);
      if (allStocks.length === 0) {
        toast.error("Could not load all NSE stocks");
      }
    } finally {
      setIsLoadingAll(false);
      setIsRefreshing(false);
    }
  }, [selectedDate, cacheKey, allStocks.length]);

  // Initial load
  useEffect(() => {
    loadWatchlist(watchlistStocks.length > 0);
  }, [selectedDate, loadWatchlist]);

  // Trigger loading all stocks when user switches to "all" tab or in background
  useEffect(() => {
    if (viewMode === "all" && allStocks.length === 0) {
      loadAllNseStocks(false);
    }
  }, [viewMode, allStocks.length, loadAllNseStocks]);

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

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, viewMode, pageSize]);

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
      await loadWatchlist(true);
    } catch (err: any) {
      toast.error(err.message || `Failed to add ${cleanSym}`);
    } finally {
      setIsAdding(false);
    }
  };

  // Handle Remove Stock with optimistic UI update
  const handleRemoveStock = async (symbol: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const prevWatchlist = [...watchlistStocks];
    // Optimistic removal
    setWatchlistStocks((prev) => {
      const updated = prev.filter((s) => s.symbol !== symbol);
      watchlistMemoryCache[cacheKey] = updated;
      return updated;
    });

    try {
      await removeCustomStock(symbol);
      toast.success(`Removed ${symbol} from Watchlist`);
    } catch (err: any) {
      // Revert optimistic update on failure
      setWatchlistStocks(prevWatchlist);
      watchlistMemoryCache[cacheKey] = prevWatchlist;
      toast.error(err.message || `Failed to remove ${symbol}`);
    }
  };

  // 1-Click Bookmark / Watchlist Toggle from Table Row
  const handleToggleWatchlist = async (stock: CustomStockItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const sym = stock.symbol.toUpperCase().trim();
    if (watchlistSymbolsSet.has(sym)) {
      await handleRemoveStock(sym, e);
    } else {
      // Optimistically add to watchlist
      const newWatchlistItem: CustomStockItem = { ...stock };
      setWatchlistStocks((prev) => {
        const updated = [...prev, newWatchlistItem];
        watchlistMemoryCache[cacheKey] = updated;
        return updated;
      });

      try {
        await addCustomStock(sym, stock.company_name);
        toast.success(`Added ${sym} to Watchlist`, {
          icon: "⭐"
        });
      } catch (err: any) {
        // Revert
        setWatchlistStocks((prev) => prev.filter((s) => s.symbol !== sym));
        toast.error(err.message || `Failed to add ${sym}`);
      }
    }
  };

  // Handle Download Excel
  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    const modeLabel = viewMode === "all" ? "All 2,600+ NSE Equities" : "Custom Watchlist";
    const toastId = toast.loading(`Generating ${modeLabel} Excel workbook...`);
    try {
      const result = await downloadCustomStocksExcel(selectedDate, undefined, viewMode);
      toast.success("Excel Workbook Downloaded!", {
        id: toastId,
        description: `Saved ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to download spreadsheet", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  // Active dataset depending on tab
  const currentStocks = viewMode === "all" ? allStocks : watchlistStocks;
  const isCurrentLoading = viewMode === "all" ? isLoadingAll : isLoadingWatchlist;

  // Summary Metrics
  const summary = useMemo(() => {
    if (!currentStocks || currentStocks.length === 0) return null;

    let adv = 0, dec = 0, unch = 0;
    let topGainer = currentStocks[0];
    let topLoser = currentStocks[0];
    let totalTurnover = 0;

    currentStocks.forEach((s) => {
      const chg = s.pct_change || 0;
      if (chg > 0) adv++;
      else if (chg < 0) dec++;
      else unch++;

      if ((s.pct_change || 0) > (topGainer?.pct_change || 0)) topGainer = s;
      if ((s.pct_change || 0) < (topLoser?.pct_change || 0)) topLoser = s;
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
  }, [currentStocks]);

  // Max volume for relative bar visualization
  const maxVolume = useMemo(() => {
    if (!currentStocks || currentStocks.length === 0) return 1;
    return Math.max(...currentStocks.map((s) => s.volume || 0), 1);
  }, [currentStocks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Fast memoized filter and sort across up to 2,652+ items
  const filteredAndSorted = useMemo(() => {
    return currentStocks
      .filter((s) => {
        // 1. Text Search Filter
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const matchSym = s.symbol.toLowerCase().includes(q);
          const matchName = s.company_name && s.company_name.toLowerCase().includes(q);
          const matchSeries = s.series && s.series.toLowerCase().includes(q);
          if (!matchSym && !matchName && !matchSeries) return false;
        }

        // 2. Category Filter Chip
        const pct = s.pct_change != null ? s.pct_change : 0;
        if (categoryFilter === "gainers") {
          return pct > 0;
        } else if (categoryFilter === "losers") {
          return pct < 0;
        } else if (categoryFilter === "volume") {
          return (s.volume || 0) > 100000;
        } else if (categoryFilter === "near_52w_high") {
          return s.near_wkh != null && Math.abs(s.near_wkh) <= 5.0;
        } else if (categoryFilter === "near_52w_low") {
          return s.near_wkl != null && Math.abs(s.near_wkl) <= 5.0;
        }

        return true;
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
  }, [currentStocks, search, categoryFilter, sortField, sortDirection]);

  // Paginated Slice
  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredAndSorted.length / pageSize) || 1;
  const paginatedStocks = useMemo(() => {
    if (pageSize === -1) return filteredAndSorted;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  return (
    <div className="space-y-5">
      
      {/* 1. Header Toolbar & Navigation Mode Toggle */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Title & Badge */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#00B386] shadow-xs">
            {viewMode === "all" ? (
              <Building2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <Star className="w-5 h-5 fill-emerald-500 text-emerald-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 font-sans">
                {viewMode === "all" ? "All NSE Listed Equities" : "Custom Stocks Watchlist"}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-[#00B386] border border-emerald-200/60 font-semibold">
                {currentStocks.length > 0 ? `${currentStocks.length.toLocaleString()} Equities` : "Loading..."}
              </span>
              {isRefreshing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200/50 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Syncing live...</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {viewMode === "all" 
                ? "Complete official NSE Equity universe (2,600+ stocks) with accurate exchange quotes, 4 performance indicators, and 1-click watchlist bookmarking"
                : "Personalized watchlist with live intraday analytics, 4 performance indicators, and multi-sheet Excel export"
              }
            </p>
          </div>
        </div>

        {/* Action Controls & Tab Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap">
          
          {/* Segmented View Switcher */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 shadow-2xs">
            <button
              onClick={() => {
                setViewMode("watchlist");
                if (watchlistStocks.length === 0) loadWatchlist(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === "watchlist"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${viewMode === "watchlist" ? "fill-amber-400 text-amber-500" : ""}`} />
              <span>My Watchlist ({watchlistStocks.length})</span>
            </button>

            <button
              onClick={() => {
                setViewMode("all");
                if (allStocks.length === 0) loadAllNseStocks(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === "all"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>All NSE Stocks ({allStocks.length > 0 ? allStocks.length : "2,600+"})</span>
            </button>
          </div>

          {/* Add Stock Button (in Watchlist Mode) */}
          {viewMode === "watchlist" && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#00B386] hover:bg-[#009b74] text-white text-xs font-semibold shadow-xs shadow-emerald-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Stock</span>
            </button>
          )}

          {/* Download Excel Button */}
          <button
            onClick={handleDownloadExcel}
            disabled={isDownloading || currentStocks.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
            title={viewMode === "all" ? "Download all 2,600+ NSE stocks to formatted Excel" : "Download custom stocks watchlist to Excel"}
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{viewMode === "all" ? "Export All Stocks (Excel)" : "Download Excel"}</span>
          </button>
        </div>

      </div>

      {/* 2. Top Summary Stat Cards */}
      {summary && currentStocks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Advances / Declines */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-card">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {viewMode === "all" ? "NSE Market Breadth" : "Watchlist Breadth"}
              </p>
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
                {summary.topGainer?.pct_change != null && !isNaN(Number(summary.topGainer.pct_change)) ? ` (+${Number(summary.topGainer.pct_change).toFixed(2)}%)` : ""}
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
                {summary.topLoser?.pct_change != null && !isNaN(Number(summary.topLoser.pct_change)) ? ` (${Number(summary.topLoser.pct_change).toFixed(2)}%)` : ""}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>

          {/* Total Turnover */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-card">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {viewMode === "all" ? "Total Traded Turnover" : "Watchlist Turnover"}
              </p>
              <p className="text-lg font-bold text-slate-900 font-mono mt-1">
                ₹ {(summary.totalTurnoverCr || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} <span className="text-xs font-sans text-slate-400 font-normal">Cr</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{currentStocks.length.toLocaleString()} Equities Listed</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>

        </div>
      )}

      {/* 3. Filter Chips & Instant Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Search input */}
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={viewMode === "all" ? "Search all 2,600+ NSE stocks (TATACONSUM, RELIANCE, ZOMATO)..." : "Filter watchlist by symbol or company..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none flex-wrap">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              categoryFilter === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600"
            }`}
          >
            All ({currentStocks.length})
          </button>

          <button
            onClick={() => setCategoryFilter("gainers")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              categoryFilter === "gainers"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60"
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>Gainers</span>
          </button>

          <button
            onClick={() => setCategoryFilter("losers")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              categoryFilter === "losers"
                ? "bg-rose-600 text-white"
                : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60"
            }`}
          >
            <TrendingDown className="w-3 h-3" />
            <span>Losers</span>
          </button>

          <button
            onClick={() => setCategoryFilter("volume")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              categoryFilter === "volume"
                ? "bg-blue-600 text-white"
                : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60"
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>High Volume</span>
          </button>

          <button
            onClick={() => setCategoryFilter("near_52w_high")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              categoryFilter === "near_52w_high"
                ? "bg-purple-600 text-white"
                : "bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/60"
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>Near 52W High (≤5%)</span>
          </button>

          <button
            onClick={() => setCategoryFilter("near_52w_low")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              categoryFilter === "near_52w_low"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/60"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Near 52W Low (≤5%)</span>
          </button>

          {/* Refresh button */}
          <button
            onClick={() => viewMode === "all" ? loadAllNseStocks(false) : loadWatchlist(false)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition ml-auto"
            title="Refresh market data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>

      </div>

      {/* 4. Table / Content Section */}
      {isCurrentLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-card">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              <span className="text-xs font-medium text-slate-600">
                {viewMode === "all" ? "Fetching complete official NSE Equity universe (2,600+ stocks)..." : "Loading custom stocks watchlist..."}
              </span>
            </div>
            {/* Skeleton Table Rows */}
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} className="h-12 bg-slate-100/70 rounded-xl w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : currentStocks.length === 0 && viewMode === "watchlist" ? (
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
              Quick Add Popular Equities
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

          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00B386] hover:bg-[#009b74] text-white text-xs font-semibold shadow-xs shadow-emerald-500/20 transition cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Search & Add Stock</span>
            </button>

            <button
              onClick={() => {
                setViewMode("all");
                if (allStocks.length === 0) loadAllNseStocks(false);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span>Browse All 2,600+ Stocks</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider select-none sticky top-0 z-10">
                <tr>
                  {/* Star / Watchlist Bookmark Column */}
                  <th className="py-3 px-3 text-center w-10">
                    <Star className="w-3.5 h-3.5 mx-auto text-slate-400" />
                  </th>

                  <th onClick={() => handleSort("symbol")} className="py-3 px-4 cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center gap-1.5">
                      <span>Company / Symbol</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th className="py-3 px-4 text-left select-none min-w-[180px]">
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

                  {/* 4 Calculated Performance Indicators */}
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
                {paginatedStocks.map((stock) => {
                  const sym = stock.symbol.toUpperCase().trim();
                  const isBookmarked = watchlistSymbolsSet.has(sym);
                  const pct = stock.pct_change != null ? stock.pct_change : 0;
                  const isPos = pct > 0;
                  const isNeg = pct < 0;
                  const turnoverCr = stock.turnover ? (stock.turnover / 10000000.0) : 0;
                  const flash = priceFlashMap[stock.symbol];

                  // 4 Performance metrics
                  const mktPerf = stock.market_performance != null ? stock.market_performance : ((stock.ltp != null && stock.previous_close != null) ? (stock.ltp - stock.previous_close) : (stock.change != null ? stock.change : null));
                  const premarket = stock.premarket != null ? stock.premarket : ((stock.open != null && stock.previous_close != null) ? (stock.open - stock.previous_close) : null);
                  const recLow = stock.recover_from_low != null ? stock.recover_from_low : ((stock.ltp != null && stock.low != null) ? (stock.ltp - stock.low) : null);
                  const distHigh = stock.distance_from_high != null ? stock.distance_from_high : ((stock.ltp != null && stock.high != null) ? (stock.ltp - stock.high) : null);

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
                      {/* 1-Click Star / Watchlist Toggle */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleToggleWatchlist(stock, e)}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isBookmarked
                              ? "text-amber-500 hover:bg-amber-50"
                              : "text-slate-300 hover:text-amber-500 hover:bg-slate-100"
                          }`}
                          title={isBookmarked ? `Remove ${sym} from Watchlist` : `Add ${sym} to Watchlist`}
                        >
                          <Star className={`w-4 h-4 ${isBookmarked ? "fill-amber-400" : ""}`} />
                        </button>
                      </td>

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
                            <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
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
                                className="flex items-center gap-1.5 max-w-[200px]"
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
                          {stock.ltp != null ? `₹${Number(stock.ltp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
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
                          {pct != null && !isNaN(Number(pct)) ? `${isPos ? "+" : ""}${Number(pct).toFixed(2)}%` : "-"}
                        </span>
                        {stock.change != null && !isNaN(Number(stock.change)) && (
                          <div className={`text-[10px] mt-0.5 ${isPos ? "text-emerald-600" : isNeg ? "text-rose-600" : "text-slate-400"}`}>
                            {Number(stock.change) > 0 ? "+" : ""}{Number(stock.change).toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Previous Close */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600 hidden sm:table-cell">
                        {stock.previous_close != null ? `₹${Number(stock.previous_close).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                      </td>

                      {/* Market Performance */}
                      <td className="py-3 px-3 text-right font-mono hidden md:table-cell">
                        {mktPerf != null && !isNaN(Number(mktPerf)) ? (
                          <span className={mktPerf > 0 ? "text-emerald-600 font-semibold" : mktPerf < 0 ? "text-rose-600 font-semibold" : "text-slate-500"}>
                            {mktPerf > 0 ? "+" : ""}{Number(mktPerf).toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Premarket */}
                      <td className="py-3 px-3 text-right font-mono hidden lg:table-cell">
                        {premarket != null && !isNaN(Number(premarket)) ? (
                          <span className={premarket > 0 ? "text-emerald-600 font-semibold" : premarket < 0 ? "text-rose-600 font-semibold" : "text-slate-500"}>
                            {premarket > 0 ? "+" : ""}{Number(premarket).toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Recover from Low */}
                      <td className="py-3 px-3 text-right font-mono hidden xl:table-cell">
                        {recLow != null && !isNaN(Number(recLow)) ? (
                          <span className={recLow > 0 ? "text-emerald-600 font-semibold" : "text-slate-500"}>
                            +{Number(recLow).toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Distance from High */}
                      <td className="py-3 px-3 text-right font-mono hidden xl:table-cell">
                        {distHigh != null && !isNaN(Number(distHigh)) ? (
                          <span className={distHigh < 0 ? "text-rose-600 font-semibold" : "text-slate-500"}>
                            {Number(distHigh).toFixed(2)}
                          </span>
                        ) : "-"}
                      </td>

                      {/* Open */}
                      <td className="py-3 px-3 text-right font-mono text-slate-700 hidden sm:table-cell">
                        {stock.open != null ? `₹${Number(stock.open).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
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

                          {viewMode === "watchlist" && (
                            <button
                              onClick={(e) => handleRemoveStock(stock.symbol, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title={`Remove ${stock.symbol} from Custom Stocks`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>

          {/* 5. Pagination Toolbar */}
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 select-none">
            
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={-1}>All ({filteredAndSorted.length})</option>
              </select>
              <span className="text-slate-400">|</span>
              <span>
                Showing <strong className="text-slate-900 font-mono">{filteredAndSorted.length === 0 ? 0 : (currentPage - 1) * (pageSize === -1 ? filteredAndSorted.length : pageSize) + 1}</strong> - <strong className="text-slate-900 font-mono">{pageSize === -1 ? filteredAndSorted.length : Math.min(currentPage * pageSize, filteredAndSorted.length)}</strong> of <strong className="text-slate-900 font-mono">{filteredAndSorted.length}</strong> equities
              </span>
            </div>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition cursor-pointer"
                  title="First Page"
                >
                  <ChevronFirst className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <span className="px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition cursor-pointer"
                  title="Last Page"
                >
                  <ChevronLast className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          </div>

        </div>
      )}

      {/* 6. Add Stock Modal Dialog */}
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
                  <p className="text-[11px] text-slate-500">Search by symbol across all 2,600+ NSE Equities</p>
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
                  placeholder="Type symbol (e.g. TATACONSUM, SWIGGY, ZOMATO, RELIANCE, TCS)..."
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
                  <p className="text-xs text-slate-500">No exact cached match for "{addSearchQuery}".</p>
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
                  const sym = item.symbol.toUpperCase().trim();
                  const alreadyAdded = watchlistSymbolsSet.has(sym);
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
                      const sym = item.symbol.toUpperCase().trim();
                      const alreadyAdded = watchlistSymbolsSet.has(sym);
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
