import React from "react";
import { 
  Download, 
  Search, 
  RefreshCw, 
  Calendar, 
  Activity, 
  History,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { FetchStatus } from "../types";

interface TopBarProps {
  status: FetchStatus | null;
  selectedDate: string;
  availableDates: string[];
  onDateChange: (date: string) => void;
  onSync: () => void;
  onExport: () => void;
  onOpenLogs: () => void;
  onOpenCommand: () => void;
  isSyncing: boolean;
  isExporting: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  status,
  selectedDate,
  availableDates,
  onDateChange,
  onSync,
  onExport,
  onOpenLogs,
  onOpenCommand,
  isSyncing,
  isExporting,
}) => {
  const lastSync = status?.last_sync;
  const isTodaySynced = status?.today_synced;
  const lastSyncTime = lastSync?.run_timestamp
    ? new Date(lastSync.run_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <header className="h-14 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 flex items-center justify-between gap-4 select-none z-20">
      
      {/* Left: Brand & Glowing Live Sync Status Indicator */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-900/30">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">NSE Terminal</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1F2530] text-[var(--accent)] border border-[var(--accent)]/30">
                PRO
              </span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] leading-none">Local-First Desktop</span>
          </div>
        </div>

        {/* Breathing Live Status Pill */}
        <div className="hidden sm:flex items-center">
          {isSyncing ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Fetching NSE Datasets...</span>
            </div>
          ) : isTodaySynced ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--gain-bg)] border border-[var(--gain)]/30 text-[var(--gain)] text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-[var(--gain)] animate-pulse-breathing shadow-[0_0_8px_var(--gain)]" />
              <span>Synced Today {lastSyncTime} IST</span>
            </div>
          ) : lastSync ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Latest Data: {status?.latest_trade_date}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1F2530] border border-[var(--border-hairline)] text-[var(--text-muted)] text-xs font-mono">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>No Local Data</span>
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Command Search Trigger (⌘K) */}
      <div className="flex-1 max-w-md hidden md:block">
        <button
          onClick={onOpenCommand}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-hairline)] hover:border-[var(--text-muted)] text-xs text-[var(--text-secondary)] transition group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" />
            <span>Search constituents or commands...</span>
          </div>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1F2530] text-[var(--text-muted)] border border-[#2A3442]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right Actions: Date Selector, Audit, Manual Sync, "Download All" */}
      <div className="flex items-center gap-2.5">
        
        {/* Date Selector */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-secondary)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <select
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-transparent text-[var(--text-primary)] font-mono font-medium focus:outline-none cursor-pointer text-xs"
          >
            {availableDates.map((d) => (
              <option key={d} value={d} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Audit Logs */}
        <button
          onClick={onOpenLogs}
          title="View Ingestion Audit Logs"
          className="p-1.5 rounded-lg bg-[var(--bg-base)] hover:bg-[#1F2530] text-[var(--text-secondary)] hover:text-white border border-[var(--border-hairline)] transition"
        >
          <History className="w-4 h-4" />
        </button>

        {/* Manual Sync Trigger */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="p-1.5 rounded-lg bg-[var(--bg-base)] hover:bg-[#1F2530] text-[var(--text-secondary)] hover:text-white border border-[var(--border-hairline)] transition disabled:opacity-50"
          title="Trigger Immediate Sync"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-blue-400" : ""}`} />
        </button>

        {/* Signature Action: "Download All" Excel Export */}
        <button
          onClick={onExport}
          disabled={isExporting || isSyncing}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[#34C987] active:scale-95 text-[#0A0D12] text-xs font-bold shadow-lg shadow-[var(--accent)]/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          <span>Download All</span>
        </button>

      </div>

    </header>
  );
};
