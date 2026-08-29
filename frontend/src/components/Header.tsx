import React from "react";
import { 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  Activity, 
  History 
} from "lucide-react";
import { FetchStatus } from "../types";

interface HeaderProps {
  status: FetchStatus | null;
  selectedDate: string;
  availableDates: string[];
  onDateChange: (date: string) => void;
  onSync: () => void;
  onExport: () => void;
  onOpenLogs: () => void;
  isSyncing: boolean;
  isExporting: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  selectedDate,
  availableDates,
  onDateChange,
  onSync,
  onExport,
  onOpenLogs,
  isSyncing,
  isExporting,
}) => {
  const lastSync = status?.last_sync;
  const isTodaySynced = status?.today_synced;
  const lastSyncTime = lastSync?.run_timestamp
    ? new Date(lastSync.run_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-800/80 px-6 py-4 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Logo & Title */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">NSE Market Suite</h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Phase 1 Live
              </span>
            </div>
            <p className="text-xs text-slate-400">Automated Daily EOD Capture & Color-Formatted Excel Export</p>
          </div>
        </div>

        {/* Date Selector & Sync Status Indicator */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Historical Date Selector */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">Date:</span>
            <select
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-white font-mono font-medium focus:outline-none cursor-pointer"
            >
              {availableDates.map((d) => (
                <option key={d} value={d} className="bg-slate-900 text-slate-200">
                  {d} {d === new Date().toISOString().split("T")[0] ? "(Today)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Sync Status Badge */}
          <div className="flex items-center gap-2">
            {isSyncing ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing from NSE...</span>
              </div>
            ) : isTodaySynced ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Synced today at {lastSyncTime}</span>
              </div>
            ) : lastSync ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Latest data: {status?.latest_trade_date}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                <span>No local data</span>
              </div>
            )}
          </div>

          {/* Audit Logs Button */}
          <button
            onClick={onOpenLogs}
            title="View Sync Audit Logs"
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700 transition"
          >
            <History className="w-4 h-4" />
          </button>

          {/* Manual Sync Button */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition shadow-sm ${
              isSyncing
                ? "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-slate-800 hover:bg-slate-700 border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white active:scale-95"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>Sync Now</span>
          </button>

          {/* Prominent "Download All" Excel Export Button */}
          <button
            onClick={onExport}
            disabled={isExporting || isSyncing}
            className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 ring-1 ring-emerald-400/30 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Download All (.xlsx)</span>
          </button>

        </div>
      </div>
    </header>
  );
};
