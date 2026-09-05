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
  CalendarDays,
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

  return (
    <header className="h-16 border-b border-slate-200/90 bg-white px-4 sm:px-6 flex items-center justify-between gap-3 select-none sticky top-0 z-30 shadow-xs">
      
      {/* 1. Left: Brand & Live IST Clock */}
      <div className="flex items-center gap-3 lg:gap-5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-[#00B386] to-teal-400 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20 flex-shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 font-sans">NSE Pulse</span>
              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-[#00B386] border border-emerald-200/80 font-mono">
                LIVE
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium hidden sm:inline">Terminal</span>
          </div>
        </div>

        {/* Live IST Market Clock */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">IST:</span>
          <span className="font-semibold text-slate-800">{istTime || "Loading..."}</span>
        </div>
      </div>

      {/* 2. Center: Global Search Trigger (⌘K) */}
      <div className="flex-1 max-w-xs md:max-w-sm lg:max-w-md mx-1 sm:mx-3 hidden md:block">
        <button
          type="button"
          onClick={onOpenCommand}
          title="Search stocks, indices, commands (⌘K or Ctrl+K)"
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/90 hover:border-slate-300 text-xs text-slate-500 transition shadow-2xs group cursor-pointer active:scale-[0.99]"
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

      {/* Mobile Search Icon */}
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

      {/* 3. Right: Live Pill, Date Picker, Toolbar, Export & User Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
        
        {/* Real-time Live Stream & Market Status Pill */}
        <div className="hidden lg:flex items-center gap-1.5">
          {isStreamConnected ? (
            <div 
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-semibold font-mono"
              title={`Real-time WebSocket Live Feed Active. Last Tick: ${lastTickTime || "Live"}`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00B386]"></span>
              </span>
              <span>LIVE</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                marketStatus.includes("OPEN")
                  ? "bg-emerald-200/80 text-emerald-900"
                  : "bg-slate-200 text-slate-700"
              }`}>
                {marketStatus.includes("OPEN") ? "OPEN" : "STANDBY"}
              </span>
            </div>
          ) : isSyncing ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-medium font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Syncing...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-medium font-mono">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Standby</span>
            </div>
          )}
        </div>

        {/* Date Selector & Historical Calendar Picker */}
        <div className="flex items-center bg-slate-50 border border-slate-200/90 rounded-xl p-0.5 text-xs text-slate-600 hover:border-slate-300 transition">
          {/* Quick Dates Dropdown */}
          <div className="flex items-center gap-1 px-2 py-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
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
          <div className="relative px-1.5 border-l border-slate-200 flex items-center" title="Pick historical trading date to backfill from NSE Archives">
            <input
              type="date"
              max={new Date().toISOString().split("T")[0]}
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onDateChange(e.target.value);
              }}
              className="w-6 h-6 opacity-0 absolute inset-0 cursor-pointer z-10"
            />
            <button
              type="button"
              className="p-0.5 text-slate-500 hover:text-emerald-700 rounded transition cursor-pointer"
              title="Pick historical date from calendar"
            >
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
            </button>
          </div>
        </div>

        {/* Secondary Utility Toolbar Group (Import, Logs, Sync) */}
        <div className="flex items-center bg-slate-50 border border-slate-200/90 rounded-xl p-0.5">
          {onOpenUpload && (
            <button
              type="button"
              onClick={onOpenUpload}
              title="Import & Auto-Classify Excel Files"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs transition cursor-pointer"
            >
              <UploadCloud className="w-4 h-4 text-emerald-600" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenLogs}
            title="View Ingestion Audit Logs"
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs transition cursor-pointer"
          >
            <History className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            title={`Trigger Manual Sync (Cadence: ${status?.adaptive_sync?.interval_label || "Active"})`}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-blue-600" : "text-slate-600"}`} />
          </button>
        </div>

        {/* Primary Action: "Download All" Signature Emerald Button */}
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting || isSyncing}
          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-[#00B386] hover:bg-[#009E76] active:scale-95 text-white text-xs font-semibold shadow-sm shadow-emerald-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4 stroke-[2.5]" />
          )}
          <span className="hidden sm:inline">Download All</span>
          <span className="sm:hidden">Export</span>
        </button>

        {/* Authenticated User Profile & Logout Action */}
        {user && (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200">
            <div className="flex items-center gap-2 px-2 py-1 rounded-xl bg-slate-100/90 border border-slate-200/80">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold uppercase flex-shrink-0">
                {user.username.charAt(0)}
              </div>
              <div className="hidden xl:flex flex-col text-left leading-none">
                <span className="text-xs font-bold text-slate-800 truncate max-w-[100px]">{user.name}</span>
                <span className="text-[9px] font-mono text-emerald-700 uppercase font-semibold">
                  {user.role}
                </span>
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Sign out of testing terminal"
                className="p-1.5 rounded-xl bg-slate-100/80 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

      </div>

    </header>
  );
};
