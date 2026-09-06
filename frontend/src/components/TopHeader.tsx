import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
  Menu
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
  onToggleMobileNav?: () => void;
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
  onToggleMobileNav,
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
      setIstTime(now.toLocaleTimeString("en-IN", options).toLowerCase());
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const isMarketOpen = marketStatus.toUpperCase().includes("OPEN") || (status?.adaptive_sync?.is_market_open ?? false);
  const syncInterval = status?.adaptive_sync?.interval_label?.split(" ")[0] || "10m";

  return (
    <header className="w-full h-16 border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-3 lg:gap-4 select-none sticky top-0 z-30 shadow-xs">
      
      {/* 1. Left: Mobile Hamburger Menu & Brand Identity */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        
        {/* Mobile Hamburger Drawer Button (< lg) */}
        {onToggleMobileNav && (
          <button
            type="button"
            onClick={onToggleMobileNav}
            className="lg:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0"
            title="Open Menu"
          >
            <Menu className="w-4 h-4 stroke-[2.5]" />
          </button>
        )}

        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 sm:gap-2.5"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-[#00B386] to-teal-400 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20 shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 font-sans">
                NSE Pulse
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-[#00B386] border border-emerald-200/60 font-mono">
                LIVE
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium hidden xl:inline">
              Institutional Terminal
            </span>
          </div>
        </motion.div>

        {/* Live IST Market Clock (>= 2xl screens) */}
        <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">IST:</span>
          <span className="font-semibold text-slate-800">{istTime || "12:10:36 am"}</span>
        </div>
      </div>

      {/* 2. Center: Global Search Trigger (⌘K) */}
      <div className="flex-1 max-w-[120px] sm:max-w-xs md:max-w-sm lg:max-w-md mx-1 sm:mx-2">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={onOpenCommand}
          title="Search stocks, indices, and commands (⌘K or Ctrl+K)"
          className="w-full flex items-center justify-between px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-xs text-slate-500 transition shadow-inner-xs group cursor-pointer"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 truncate">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
            <span className="text-slate-500 font-medium truncate text-[11px] sm:text-xs">
              <span className="hidden sm:inline">Search stocks, indices...</span>
              <span className="inline sm:hidden">Search...</span>
            </span>
          </div>
          <kbd className="hidden md:inline-block text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200 shadow-2xs shrink-0 ml-1.5">
            ⌘K
          </kbd>
        </motion.button>
      </div>

      {/* 3. Right Controls & Actions Bar */}
      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5 shrink-0">
        
        {/* Real-time Stream Live Ticker Pill (>= lg screens) */}
        <div className="hidden lg:flex items-center">
          <div 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/90 border border-emerald-200/80 text-emerald-800 text-[11px] font-medium font-mono"
            title={`Real-time WebSocket Live Feed. Last Tick: ${lastTickTime || "Active"}`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00B386]"></span>
            </span>
            <span className="font-bold text-[10px] tracking-wide">TICKER</span>
            <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
              isMarketOpen ? "bg-emerald-200 text-emerald-900" : "bg-slate-200 text-slate-700"
            }`}>
              {isMarketOpen ? "OPEN" : "STANDBY"}
            </span>
          </div>
        </div>

        {/* Date Selector & Historical Calendar Backfill Picker */}
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5 text-xs text-slate-600 hover:border-slate-300 transition">
          <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5">
            <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-slate-800 font-mono font-semibold focus:outline-none cursor-pointer text-[10px] sm:text-xs pr-0.5 max-w-[85px] sm:max-w-none truncate"
            >
              {availableDates.map((d) => (
                <option key={d} value={d} className="bg-white text-slate-800 font-mono">
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="relative pl-0.5 border-l border-slate-200 flex items-center" title="Pick historical date from calendar">
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
              className="p-1 text-slate-500 hover:text-emerald-700 rounded transition cursor-pointer"
            >
              <CalendarDays className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
            </button>
          </div>
        </div>

        {/* Import Excel Action (hidden on mobile, shown on lg) */}
        {onOpenUpload && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={onOpenUpload}
            title="Import Historical Excel Files"
            className="hidden sm:flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition text-xs font-medium cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="hidden xl:inline text-[11px]">Import</span>
          </motion.button>
        )}

        {/* Ingestion Audit Logs Action (hidden on mobile, shown on sm+) */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          type="button"
          onClick={onOpenLogs}
          title="View Ingestion Audit Logs"
          className="hidden md:flex p-1.5 sm:p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition cursor-pointer shrink-0"
        >
          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </motion.button>

        {/* Auto-Sync Trigger */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition disabled:opacity-50 text-xs font-medium font-mono cursor-pointer shrink-0"
          title={`Auto-Sync: ${syncInterval}. Click to sync immediately.`}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? "animate-spin text-emerald-600" : ""}`} />
          <span className="hidden md:inline text-[11px]">
            {syncInterval}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? "bg-blue-500 animate-ping" : (isMarketOpen ? "bg-emerald-500" : "bg-amber-400")}`}></span>
        </motion.button>

        {/* Signature Emerald "Download All" Action */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          type="button"
          onClick={onExport}
          disabled={isExporting || isSyncing}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-[#00B386] to-emerald-600 hover:from-[#009E76] hover:to-emerald-700 text-white text-xs font-semibold shadow-xs shadow-emerald-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          {isExporting ? (
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          )}
          <span className="hidden sm:inline text-xs">Download All</span>
          <span className="inline sm:hidden text-[10px]">Export</span>
        </motion.button>

        {/* Authenticated User Profile & Logout */}
        {user && (
          <div className="flex items-center gap-1 sm:gap-1.5 pl-1 sm:pl-2 border-l border-slate-200 shrink-0">
            <div className="flex items-center gap-1.5 px-1.5 sm:px-2 py-1 rounded-xl bg-slate-100/90 border border-slate-200/80">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                {user.username ? user.username.charAt(0) : "A"}
              </div>
              <div className="hidden 2xl:flex flex-col text-left leading-none">
                <span className="text-[11px] font-bold text-slate-800 truncate max-w-[100px]">{user.name || "Analyst"}</span>
                <span className="text-[8px] font-mono text-emerald-700 uppercase font-semibold">
                  {user.role || "user"}
                </span>
              </div>
            </div>

            {onLogout && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={onLogout}
                title="Sign Out"
                className="p-1.5 sm:p-2 rounded-xl bg-slate-100/80 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 transition cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </motion.button>
            )}
          </div>
        )}

      </div>

    </header>
  );
};
