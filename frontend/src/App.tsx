import React, { useEffect, useState, useCallback, Suspense, lazy } from "react";
import { Toaster, toast } from "sonner";
import { TopHeader } from "./components/TopHeader";
import { LeftSidebar, NavView } from "./components/LeftSidebar";
import { MarketPulse } from "./components/MarketPulse";
import { MarketDataGrid } from "./components/MarketDataGrid";
import { LoginView } from "./components/LoginView";
import { useAuth } from "./hooks/useAuth";
import { useExportMarketData } from "./hooks/useExportMarketData";
import { useLiveMarketStream } from "./hooks/useLiveMarketStream";
import { Nifty50Stock, IndexDaily, FetchStatus } from "./types";
import { 
  getFetchStatus, 
  fetchAvailableDates, 
  fetchNifty50, 
  fetchIndices, 
  triggerManualSync, 
  triggerBackfill,
  getScheduleSettings
} from "./services/api";
import { Loader2, LayoutGrid, Star, PieChart, CalendarDays, Menu } from "lucide-react";

// Code-split heavy secondary views and modal dialogs for instant sub-second initial load
const IndicesView = lazy(() => import("./components/IndicesView").then(m => ({ default: m.IndicesView })));
const CustomStocksView = lazy(() => import("./components/CustomStocksView").then(m => ({ default: m.CustomStocksView })));
const CatalystFeed = lazy(() => import("./components/CatalystFeed").then(m => ({ default: m.CatalystFeed })));
const StockDetailDrawer = lazy(() => import("./components/StockDetailDrawer").then(m => ({ default: m.StockDetailDrawer })));
const CommandPalette = lazy(() => import("./components/CommandPalette").then(m => ({ default: m.CommandPalette })));
const SettingsModal = lazy(() => import("./components/SettingsModal").then(m => ({ default: m.SettingsModal })));
const FetchLogsModal = lazy(() => import("./components/FetchLogsModal").then(m => ({ default: m.FetchLogsModal })));
const ExcelUploadModal = lazy(() => import("./components/ExcelUploadModal").then(m => ({ default: m.ExcelUploadModal })));

export function App() {
  const { user, isAuthenticated, isLoading: isAuthLoading, login, logout } = useAuth();
  
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [stocks, setStocks] = useState<Nifty50Stock[]>([]);
  const [sectorIndices, setSectorIndices] = useState<IndexDaily[]>([]);
  const [isLoadingStocks, setIsLoadingStocks] = useState(false);
  const [activeView, setActiveView] = useState<NavView>("nifty50");

  // Modals & Drawers state
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string | null>(null);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Export Hook
  const { downloadAll, exporting } = useExportMarketData();

  // Real-time Live Market WebSocket Stream Hook
  const isLatestDate = !selectedDate || (availableDates.length > 0 && selectedDate === availableDates[0]);
  const {
    stocks: liveStocks,
    marketStatus,
    isConnected: isStreamConnected,
    lastTickTime,
    priceFlashMap
  } = useLiveMarketStream(stocks, (tradeDate) => {
    downloadAll(tradeDate);
  });

  const displayStocks = (isLatestDate && liveStocks.length > 0) ? liveStocks : stocks;

  // Active Browser Background Auto-Download Runner
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;
    let scheduleInfo = {
      enabled: true,
      times: ["15:45", "16:30", "17:30"],
      folder: localStorage.getItem("nse_auto_download_folder") || ""
    };

    // 1. Fetch user & system settings from backend SQLite
    getScheduleSettings().then((res) => {
      if (!isMounted) return;
      scheduleInfo = {
        enabled: res.auto_download_enabled ?? true,
        times: res.schedule_times || ["15:45", "16:30", "17:30"],
        folder: res.downloads_folder || localStorage.getItem("nse_auto_download_folder") || ""
      };
      if (res.downloads_folder) {
        localStorage.setItem("nse_auto_download_folder", res.downloads_folder);
      }
    }).catch(console.error);

    const executedSlots = new Set<string>();

    // 2. Active Tab Interval (checks every 30 seconds for scheduled IST times)
    const timer = setInterval(() => {
      if (!scheduleInfo.enabled) return;

      const now = new Date();
      // Format current time and date in IST (Asia/Kolkata)
      const istTimeStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(now);

      const istDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(now);

      const slotKey = `${istDateStr}_${istTimeStr}`;

      if (scheduleInfo.times.includes(istTimeStr) && !executedSlots.has(slotKey)) {
        executedSlots.add(slotKey);
        console.log(`[Auto-Download Background Runner] Matching IST time ${istTimeStr}. Triggering download bundle.`);
        toast.info("Automated Scheduled Download", {
          description: `Triggered background market export for ${istDateStr} at ${istTimeStr} IST.`
        });
        downloadAll(selectedDate || istDateStr);
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isAuthenticated, selectedDate, downloadAll]);

  // Load Status & Dates
  const loadStatusAndDates = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [statusData, dates] = await Promise.all([
        getFetchStatus(),
        fetchAvailableDates(),
      ]);
      setStatus(statusData);
      setAvailableDates(dates);

      if (!selectedDate && dates.length > 0) {
        setSelectedDate(dates[0]);
      }
    } catch (err) {
      console.error("Failed to load initial metadata:", err);
    }
  }, [selectedDate, isAuthenticated]);

  // Load Market Data for selected date
  const loadMarketData = useCallback(async (dateToLoad: string) => {
    if (!dateToLoad || !isAuthenticated) return;
    setIsLoadingStocks(true);
    try {
      const [stockData, secData] = await Promise.all([
        fetchNifty50(dateToLoad),
        fetchIndices("sectoral", dateToLoad).catch(() => []),
      ]);
      setStocks(stockData);
      setSectorIndices(secData);
    } catch (err) {
      console.error("Failed to load market data:", err);
      toast.error("Failed to load market data", { description: String(err) });
    } finally {
      setIsLoadingStocks(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadStatusAndDates();
    }
  }, [isAuthenticated, loadStatusAndDates]);

  useEffect(() => {
    if (selectedDate && isAuthenticated) {
      loadMarketData(selectedDate);
    }
  }, [selectedDate, isAuthenticated, loadMarketData]);

  // Polling when sync is in progress
  useEffect(() => {
    let interval: any;
    if (status?.is_syncing) {
      interval = setInterval(async () => {
        try {
          const freshStatus = await getFetchStatus();
          setStatus(freshStatus);
          if (!freshStatus.is_syncing) {
            const freshDates = await fetchAvailableDates();
            setAvailableDates(freshDates);
            if (freshDates.length > 0) {
              setSelectedDate(freshDates[0]);
              loadMarketData(freshDates[0]);
            }
            toast.success("Market Data Synchronized", {
              description: `Successfully ingested data for ${freshDates[0] || "today"}`
            });
          }
        } catch (err) {
          console.error("Status polling error:", err);
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status?.is_syncing, loadMarketData]);

  // Handle Date Selection or Historical Backfill
  const handleDateChange = async (newDate: string) => {
    if (!newDate) return;
    if (availableDates.includes(newDate)) {
      setSelectedDate(newDate);
      return;
    }

    const toastId = toast.loading(`Backfilling data for ${newDate}...`, {
      description: "Fetching official Bhavcopy, MTO delivery & index archives from NSE"
    });

    try {
      const res = await triggerBackfill(newDate);
      if (res.success) {
        toast.success(`Historical Data Ready (${newDate})`, {
          id: toastId,
          description: "All 50 constituents and multi-sheet indices parsed & cached."
        });
        const freshDates = await fetchAvailableDates();
        setAvailableDates(freshDates);
        setSelectedDate(newDate);
        loadMarketData(newDate);
      } else {
        toast.error(`Backfill Failed for ${newDate}`, {
          id: toastId,
          description: res.message || "Archive files not available for this date (weekend/holiday)."
        });
      }
    } catch (err: any) {
      toast.error("Backfill Error", {
        id: toastId,
        description: err.message || "Failed to download historical archives."
      });
    }
  };

  // Trigger Manual Sync
  const handleManualSync = async () => {
    try {
      setStatus((prev) => prev ? { ...prev, is_syncing: true } : null);
      toast.info("Connecting to NSE...", { description: "Pulling live market snapshots" });
      await triggerManualSync(true);
    } catch (err: any) {
      toast.error("Sync Failed", { description: err.message });
      loadStatusAndDates();
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center animate-pulse">
              <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-sm font-bold text-white tracking-wide">Connecting to NSE Terminal</h2>
            <p className="text-xs text-slate-400 mt-1">Verifying encrypted security session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Toaster 
          theme="dark" 
          position="top-center" 
          richColors 
        />
        <LoginView onLogin={login} />
      </>
    );
  }

  return (
    <div className="min-h-screen w-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden font-sans select-none">
      
      {/* Toast notifications container */}
      <Toaster 
        theme="light" 
        position="bottom-right" 
        richColors 
        toastOptions={{
          style: {
            borderRadius: "14px",
            fontSize: "13px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
          }
        }} 
      />

      {/* Top Header Bar with Live Ticker, Market Status & User Profile */}
      <TopHeader
        status={status}
        selectedDate={selectedDate}
        availableDates={availableDates}
        onDateChange={handleDateChange}
        onSync={handleManualSync}
        onExport={() => downloadAll(selectedDate)}
        onOpenLogs={() => setIsLogsOpen(true)}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenCommand={() => setIsCommandOpen(true)}
        onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)}
        isSyncing={!!status?.is_syncing}
        isExporting={exporting}
        isStreamConnected={isStreamConnected}
        marketStatus={marketStatus}
        lastTickTime={lastTickTime}
        user={user}
        onLogout={logout}
      />

      {/* Main Terminal Viewport with Sidebar & Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Navigation Sidebar (Desktop + Mobile Slide-Over) */}
        <LeftSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          onOpenLogs={() => setIsLogsOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isOpenMobile={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
        />

        {/* Center Main Dashboard Canvas */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-24 lg:pb-6 bg-slate-50">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            
            {/* 1. Screener/TailAdmin 4-Card Market Pulse Grid */}
            <MarketPulse
              stocks={displayStocks}
              sectorIndices={sectorIndices}
              isLoading={isLoadingStocks}
            />

            {/* 2. Main Data View (Nifty 50 Grid, Custom Stocks, Catalysts Feed, or Index Category View) */}
            {activeView === "nifty50" ? (
              <MarketDataGrid
                stocks={displayStocks}
                isLoading={isLoadingStocks}
                onSelectStock={(sym) => setSelectedStockSymbol(sym)}
                priceFlashMap={priceFlashMap}
              />
            ) : activeView === "custom_stocks" ? (
              <Suspense fallback={
                <div className="p-12 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200/80 shadow-card">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">Loading Custom Watchlist Stocks...</span>
                </div>
              }>
                <CustomStocksView
                  selectedDate={selectedDate}
                  onSelectStock={(sym) => setSelectedStockSymbol(sym)}
                  priceFlashMap={priceFlashMap}
                />
              </Suspense>
            ) : activeView === "catalysts" ? (
              <Suspense fallback={
                <div className="p-12 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200/80 shadow-card">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">Loading Corporate Catalysts...</span>
                </div>
              }>
                <CatalystFeed
                  onSelectStock={(sym) => setSelectedStockSymbol(sym)}
                />
              </Suspense>
            ) : (
              <Suspense fallback={
                <div className="p-12 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200/80 shadow-card">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">Loading Index Market Overview...</span>
                </div>
              }>
                <IndicesView
                  category={activeView}
                  selectedDate={selectedDate}
                />
              </Suspense>
            )}

          </div>
        </main>

      </div>

      {/* Mobile Bottom Quick-Navigation Dock (< lg screens) */}
      <nav aria-label="Mobile Bottom Navigation" className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-1 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveView("nifty50")}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
            activeView === "nifty50" ? "text-[#00B386] font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span className="text-[10px]">Nifty 50</span>
        </button>

        <button
          onClick={() => setActiveView("custom_stocks")}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
            activeView === "custom_stocks" ? "text-[#00B386] font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <Star className="w-4 h-4" />
          <span className="text-[10px]">Custom</span>
        </button>

        <button
          onClick={() => setActiveView("sectoral")}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
            ["sectoral", "thematic", "strategy", "broad"].includes(activeView) ? "text-[#00B386] font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span className="text-[10px]">Indices</span>
        </button>

        <button
          onClick={() => setActiveView("catalysts")}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
            activeView === "catalysts" ? "text-[#00B386] font-bold" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span className="text-[10px]">Catalysts</span>
        </button>

        <button
          onClick={() => setIsMobileNavOpen(true)}
          className="flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <Menu className="w-4 h-4" />
          <span className="text-[10px]">More</span>
        </button>
      </nav>

      {/* ⌘K Command Palette Modal */}
      <Suspense fallback={null}>
        {isCommandOpen && (
          <CommandPalette
            open={isCommandOpen}
            onOpenChange={setIsCommandOpen}
            stocks={stocks}
            onSelectStock={(sym) => setSelectedStockSymbol(sym)}
            onExport={() => downloadAll(selectedDate)}
            onSync={handleManualSync}
          />
        )}
      </Suspense>

      {/* Right-Side Screener-Style Fundamental Drawer */}
      <Suspense fallback={null}>
        {selectedStockSymbol && (
          <StockDetailDrawer
            symbol={selectedStockSymbol}
            selectedDate={selectedDate}
            onClose={() => setSelectedStockSymbol(null)}
          />
        )}
      </Suspense>

      {/* Bulk Excel Ingestion & Auto-Classification Modal */}
      <Suspense fallback={null}>
        {isUploadOpen && (
          <ExcelUploadModal
            isOpen={isUploadOpen}
            onClose={() => setIsUploadOpen(false)}
            onSuccess={() => {
              loadStatusAndDates();
              toast.success("Excel files imported and Master Workbooks updated!");
            }}
          />
        )}
      </Suspense>

      {/* Audit Logs Modal */}
      <Suspense fallback={null}>
        {isLogsOpen && (
          <FetchLogsModal
            isOpen={isLogsOpen}
            onClose={() => setIsLogsOpen(false)}
          />
        )}
      </Suspense>

      {/* Settings Modal */}
      <Suspense fallback={null}>
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </Suspense>

    </div>
  );
}

export default App;
