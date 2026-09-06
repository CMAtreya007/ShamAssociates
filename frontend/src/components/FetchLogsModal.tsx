import React, { useEffect, useState, useRef } from "react";
import { 
  X, 
  History, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight, 
  FolderDown, 
  FileSpreadsheet, 
  Database,
  Layers
} from "lucide-react";
import { FetchLog } from "../types";
import { getFetchLogs } from "../services/api";

interface FetchLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FetchLogsModal: React.FC<FetchLogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const intervalRef = useRef<any>(null);

  const load = async (silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await getFetchLogs(50);
      setLogs(data);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      load(false);
      // Auto-poll in real time every 3.5 seconds while modal is open
      intervalRef.current = setInterval(() => {
        load(true);
      }, 3500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleExpand = (id: number) => {
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

  const filteredLogs = logs.filter((log) => {
    if (activeFilter === "ALL") return true;
    if (activeFilter === "SYNC") return log.source === "MANUAL" || log.source.startsWith("AUTO");
    if (activeFilter === "AUTO_DOWNLOAD") return log.source === "AUTO_DOWNLOAD";
    if (activeFilter === "EXCEL_UPLOAD") return log.source === "EXCEL_UPLOAD";
    if (activeFilter === "BACKFILL") return log.source === "HISTORICAL_BACKFILL" || log.source === "BACKFILL";
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn font-sans select-none">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl shadow-modal overflow-hidden flex flex-col max-h-[88vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-[#00B386] border border-emerald-200/60 flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">Real-Time Ingestion Audit Logs</h2>
                <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  LIVE AUDIT
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate hidden xs:block">Live transaction history for automated cron, auto-downloads, backfills, and uploads</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => load(false)}
              disabled={isLoading}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center gap-2 overflow-x-auto">
          {[
            { id: "ALL", label: "All Logs" },
            { id: "SYNC", label: "Market Sync" },
            { id: "AUTO_DOWNLOAD", label: "Auto-Download" },
            { id: "EXCEL_UPLOAD", label: "Excel Upload" },
            { id: "BACKFILL", label: "Backfills" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeFilter === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-500 font-medium shrink-0 pl-2">
            Showing {filteredLogs.length} entries
          </span>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 overflow-y-auto bg-slate-50/50 flex-1">
          {isLoading && logs.length === 0 ? (
            <div className="py-20 text-center text-xs text-slate-400">Loading audit history from database...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-xs text-slate-400">No logs found matching selected category.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[620px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 w-8"></th>
                    <th className="py-3 px-4">Timestamp (IST)</th>
                    <th className="py-3 px-4">Trade Date</th>
                    <th className="py-3 px-4">Source / Action</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Items Ingested</th>
                    <th className="py-3 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filteredLogs.map((log) => {
                    const isSuccess = log.status === "SUCCESS";
                    const isPartial = log.status === "PARTIAL";
                    const isFailed = log.status === "FAILED";
                    const isExpanded = expandedLogId === log.id;

                    return (
                      <React.Fragment key={log.id}>
                        <tr 
                          onClick={() => toggleExpand(log.id)}
                          className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${isExpanded ? "bg-slate-50/90" : ""}`}
                        >
                          <td className="py-3 px-3 text-slate-400">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-800">
                            {new Date(log.run_timestamp).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit"
                            })}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">{log.trade_date}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold font-sans">
                              {log.source === "AUTO_DOWNLOAD" ? (
                                <FolderDown className="w-3 h-3 text-emerald-600" />
                              ) : log.source === "EXCEL_UPLOAD" ? (
                                <FileSpreadsheet className="w-3 h-3 text-blue-600" />
                              ) : (
                                <Database className="w-3 h-3 text-slate-500" />
                              )}
                              {log.source}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-sans ${
                                isSuccess
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                  : isPartial
                                  ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                  : "bg-red-50 text-red-700 border border-red-200/60"
                              }`}
                            >
                              {isSuccess ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : isPartial ? (
                                <AlertTriangle className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-700">
                            {log.source === "AUTO_DOWNLOAD" ? (
                              `${log.rows_fetched} Files Saved`
                            ) : (
                              `${log.stocks_count} Stocks / ${log.indices_count} Indices`
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-500">
                            {log.duration_seconds !== undefined && log.duration_seconds !== null ? `${log.duration_seconds}s` : "-"}
                          </td>
                        </tr>

                        {/* Expandable Details Drawer */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <td colSpan={7} className="p-4">
                              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-inner-sm text-xs font-sans">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <span className="font-bold text-slate-800 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-emerald-600" />
                                    Transaction Audit Breakdown (Log #{log.id})
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-mono">
                                    {log.run_timestamp}
                                  </span>
                                </div>

                                {log.error_message && (
                                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
                                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-[11px]">Error Message:</div>
                                      <div className="text-xs font-mono">{log.error_message}</div>
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                                    <div className="text-[10px] text-slate-500 font-sans">Stocks Ingested</div>
                                    <div className="text-sm font-bold text-slate-900">{log.stocks_count}</div>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                                    <div className="text-[10px] text-slate-500 font-sans">Indices Ingested</div>
                                    <div className="text-sm font-bold text-slate-900">{log.indices_count}</div>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                                    <div className="text-[10px] text-slate-500 font-sans">Security Details</div>
                                    <div className="text-sm font-bold text-slate-900">{log.stock_details_count || 0}</div>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                                    <div className="text-[10px] text-slate-500 font-sans">Corporate Catalysts</div>
                                    <div className="text-sm font-bold text-slate-900">{log.corporate_actions_count || 0}</div>
                                  </div>
                                </div>

                                {log.details && (
                                  <div className="space-y-1.5 pt-1">
                                    <div className="text-[11px] font-bold text-slate-700">Detailed Transaction Payload:</div>
                                    <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg text-[10.5px] font-mono overflow-x-auto max-h-40 leading-tight">
                                      {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Audit logs are permanently recorded in local SQLite database.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
