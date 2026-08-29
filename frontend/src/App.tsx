import React, { useEffect, useState, useCallback } from "react";
import { Toaster, toast } from "sonner";
import { TopHeader } from "./components/TopHeader";
import { LeftSidebar, NavView } from "./components/LeftSidebar";
import { MarketPulse } from "./components/MarketPulse";
import { MarketDataGrid } from "./components/MarketDataGrid";
import { IndicesView } from "./components/IndicesView";
import { CatalystFeed } from "./components/CatalystFeed";
import { StockDetailDrawer } from "./components/StockDetailDrawer";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsModal } from "./components/SettingsModal";
import { FetchLogsModal } from "./components/FetchLogsModal";
import { useExportMarketData } from "./hooks/useExportMarketData";
import { useLiveMarketStream } from "./hooks/useLiveMarketStream";
import { Nifty50Stock, IndexDaily, FetchStatus } from "./types";
import { 
  getFetchStatus, 
  fetchAvailableDates, 
  fetchNifty50, 
  fetchIndices,
  triggerManualSync,
  triggerBackfill 
} from "./services/api";

export function App() {
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
  } = useLiveMarketStream(stocks);

  const displayStocks = (isLatestDate && liveStocks.length > 0) ? liveStocks : stocks;

  // Load Status & Dates
  const loadStatusAndDates = useCallback(async () => {
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
  }, [selectedDate]);

  // Load Market Data for selected date
  const loadMarketData = useCallback(async (dateToLoad: string) => {
    if (!dateToLoad) return;
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
  }, []);

  useEffect(() => {
    loadStatusAndDates();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadMarketData(selectedDate);
    }
  }, [selectedDate, loadMarketData]);

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

      {/* Top Header Bar with Live Ticker & Market Status */}
      <TopHeader
        status={status}
        selectedDate={selectedDate}
        availableDates={availableDates}
        onDateChange={handleDateChange}
        onSync={handleManualSync}
        onExport={() => downloadAll(selectedDate)}
        onOpenLogs={() => setIsLogsOpen(true)}
        onOpenCommand={() => setIsCommandOpen(true)}
        isSyncing={!!status?.is_syncing}
        isExporting={exporting}
        isStreamConnected={isStreamConnected}
        marketStatus={marketStatus}
        lastTickTime={lastTickTime}
      />

      {/* Main Terminal Viewport with Sidebar & Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Navigation Sidebar */}
        <LeftSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          onOpenLogs={() => setIsLogsOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Center Main Dashboard Canvas */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* 1. Screener/TailAdmin 4-Card Market Pulse Grid */}
            <MarketPulse
              stocks={displayStocks}
              sectorIndices={sectorIndices}
              isLoading={isLoadingStocks}
            />

            {/* 2. Main Data View (Nifty 50 Grid, Catalysts Feed, or Index Category View) */}
            {activeView === "nifty50" ? (
              <MarketDataGrid
                stocks={displayStocks}
                isLoading={isLoadingStocks}
                onSelectStock={(sym) => setSelectedStockSymbol(sym)}
                priceFlashMap={priceFlashMap}
              />
            ) : activeView === "catalysts" ? (
              <CatalystFeed
                onSelectStock={(sym) => setSelectedStockSymbol(sym)}
              />
            ) : (
              <IndicesView
                category={activeView}
                selectedDate={selectedDate}
              />
            )}

          </div>
        </main>

      </div>

      {/* ⌘K Command Palette Modal */}
      <CommandPalette
        open={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        stocks={stocks}
        onSelectStock={(sym) => setSelectedStockSymbol(sym)}
        onExport={() => downloadAll(selectedDate)}
        onSync={handleManualSync}
      />

      {/* Right-Side Screener-Style Fundamental Drawer */}
      {selectedStockSymbol && (
        <StockDetailDrawer
          symbol={selectedStockSymbol}
          selectedDate={selectedDate}
          onClose={() => setSelectedStockSymbol(null)}
        />
      )}

      {/* Audit Logs Modal */}
      <FetchLogsModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

    </div>
  );
}

export default App;
