import React, { useState, useEffect } from "react";
import { 
  Download, 
  Search, 
  RefreshCw, 
  Calendar, 
  TrendingUp, 
  History,
  Clock,
  Loader2,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Sparkles,
  UploadCloud,
  LogOut,
  User as UserIcon,
  ShieldCheck
} from "lucide-react";
import { FetchStatus, AuthUser } from "../types";

interface TopHeaderProps {
  status: FetchStatus | null;
  selectedDate: string;
  availableDates: string[];
  onDateChange: (date: string) => void;
  onSync: () => void;
  onExport: () => void;
  onOpenLogs: () => void;
  onOpenUpload?: () => void;
  onOpenCommand: () => void;
  isSyncing: boolean;
  isExporting: boolean;
  isStreamConnected?: boolean;
  marketStatus?: string;
  lastTickTime?: string | null;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  status,
  selectedDate,
  availableDates,
  onDateChange,
  onSync,
  onExport,
  onOpenLogs,
  onOpenUpload,
  onOpenCommand,
  isSyncing,
  isExporting,
  isStreamConnected = false,
  marketStatus = "OPEN",
  lastTickTime = null,
  user = null,
  onLogout,
}) => {
  // Live IST Clock
  const [istTime, setIstTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      };
      setIstTime(now.toLocaleTimeString("en-IN", options));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const lastSync = status?.last_sync;
  const isTodaySynced = status?.today_synced;
  const lastSyncTime = lastSync?.run_timestamp
    ? new Date(lastSync.run_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between gap-4 select-none sticky top-0 z-30 shadow-sm">
      
      {/* 1. Left: Brand & Live IST Clock */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#00B386] to-teal-400 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20">
            <TrendingUp className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-base tracking-tight text-slate-900 font-sans">NSE Pulse</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-[#00B386] border border-emerald-200/60 font-mono">
                LIVE
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Institutional Market Terminal</span>
          </div>
        </div>

        {/* Live IST Market Clock */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">IST:</span>
          <span className="font-semibold text-slate-800">{istTime || "Loading..."}</span>
        </div>
      </div>

      {/* 2. Center: Global Search Trigger (⌘K) */}
      <div className="flex-1 max-w-xs md:max-w-sm lg:max-w-md mx-2 sm:mx-4 hidden md:block">
        <button
          type="button"
          onClick={onOpenCommand}
          title="Search all stocks, indices, and commands (⌘K or Ctrl+K)"
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-xs text-slate-500 transition shadow-inner-sm group cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition flex-shrink-0" />
            <span className="text-slate-500 font-medium truncate">Search stocks, indices, commands...</span>
          </div>
          <kbd className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-white text-slate-500 border border-slate-200 shadow-2xs flex-shrink-0 ml-2">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Mobile Search Icon Button */}
      <div className="block md:hidden">
        <button
          type="button"
          onClick={onOpenCommand}
          title="Search (⌘K)"
          className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition cursor-pointer"
        >
          <Search className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* 3. Right: Status Pill, Date Picker, Backfill, Sync, & "Download All" Button */}
      <div className="flex items-center gap-2.5">
        
        {/* Real-time Live Stream & Market Status Pill */}
        <div className="hidden sm:flex items-center gap-2">
          {isStreamConnected ? (
            <div 
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-medium font-mono shadow-2xs"
              title={`Real-time WebSocket Live Feed Active. Last Tick: ${lastTickTime || "Live"}`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00B386]"></span>
              </span>
              <span className="font-bold">LIVE TICKER</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                marketStatus.includes("OPEN")
                  ? "bg-emerald-200/70 text-emerald-900"
                  : "bg-slate-200 text-slate-700"
              }`}>
                {marketStatus.includes("OPEN") ? "OPEN" : "STANDBY"}
              </span>
            </div>
          ) : isSyncing ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Syncing Datasets...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium font-mono">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>NSE Feed</span>
            </div>
          )}
        </div>

        {/* Date Selector & Historical Calendar Picker */}
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 text-xs text-slate-600 hover:border-slate-300 transition">
          {/* Quick Dates Dropdown */}
          <div className="flex items-center gap-1 px-2 py-0.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-slate-800 font-mono font-semibold focus:outline-none cursor-pointer text-xs pr-1"
            >
              {availableDates.map((d) => (
                <option key={d} value={d} className="bg-white text-slate-800">
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Historical Calendar Input for Any Past Date */}
          <div className="relative pl-1 border-l border-slate-200 flex items-center" title="Pick any past trading date to backfill from NSE Archives">
            <input
              type="date"
              max={new Date().toISOString().split("T")[0]}
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onDateChange(e.target.value);
              }}
              className="w-7 h-7 opacity-0 absolute inset-0 cursor-pointer z-10"
            />
            <button
              type="button"
              className="p-1 text-slate-500 hover:text-emerald-700 rounded transition"
              title="Pick historical date from calendar"
            >
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
            </button>
          </div>
        </div>

        {/* Import Historical Excel Sheets Button */}
        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            title="Import & Auto-Classify Historical Excel Sheets"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition text-xs font-medium"
          >
            <UploadCloud className="w-4 h-4 text-emerald-600" />
            <span className="hidden md:inline">Import Excel</span>
          </button>
        )}

        {/* Audit Logs Button */}
        <button
          onClick={onOpenLogs}
          title="View Ingestion Audit Logs"
          className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition"
        >
          <History className="w-4 h-4" />
        </button>

        {/* Adaptive Sync Trigger Button with Cadence Indicator */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition disabled:opacity-50 text-xs font-medium font-mono group"
          title={`Auto-Sync Cadence: ${status?.adaptive_sync?.interval_label || (marketStatus.includes("OPEN") ? "Every 1 min (Market Open)" : "Every 10 min (Market Closed)")}. Click to trigger immediate manual sync.`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-blue-600" : "text-slate-500 group-hover:text-slate-700"}`} />
          <span className="hidden sm:inline text-[11px]">
            {isSyncing ? "Syncing..." : status?.adaptive_sync?.is_market_open ? "1m Auto-Sync" : "10m Auto-Sync"}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${status?.adaptive_sync?.is_market_open ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
        </button>

        {/* Signature Action: "Download All" Groww-Style Emerald Button */}
        <button
          onClick={onExport}
          disabled={isExporting || isSyncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00B386] hover:bg-[#009E76] active:scale-95 text-white text-xs font-semibold shadow-sm shadow-emerald-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4 stroke-[2.5]" />
          )}
          <span>Download All</span>
        </button>

        {/* Authenticated User Profile & Logout Action */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100/90 border border-slate-200/80">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold uppercase">
                {user.username.charAt(0)}
              </div>
              <div className="hidden lg:flex flex-col text-left leading-none">
                <span className="text-xs font-bold text-slate-800">{user.name}</span>
                <span className="text-[9px] font-mono text-emerald-700 uppercase font-semibold">
                  {user.role}
                </span>
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                title="Sign out of testing terminal"
                className="p-2 rounded-xl bg-slate-100/80 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

      </div>

    </header>
  );
};
