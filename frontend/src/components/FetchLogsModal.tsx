import React, { useEffect, useState } from "react";
import { X, History, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { FetchLog } from "../types";
import { getFetchLogs } from "../services/api";

interface FetchLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FetchLogsModal: React.FC<FetchLogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await getFetchLogs(30);
      setLogs(data);
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      load();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-modal overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Ingestion Audit Logs</h2>
              <p className="text-xs text-slate-500">Historical automated cron & manual sync runs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto bg-slate-50/50">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading audit history...</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">No sync logs recorded yet.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Run Timestamp</th>
                    <th className="py-3 px-4">Trade Date</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Items Ingested</th>
                    <th className="py-3 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {logs.map((log) => {
                    const isSuccess = log.status === "SUCCESS";
                    const isPartial = log.status === "PARTIAL";
                    const isFailed = log.status === "FAILED";

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-slate-800">
                          {new Date(log.run_timestamp).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{log.trade_date}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium font-sans">
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
                          {log.stocks_count} Stocks / {log.indices_count} Indices
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500">
                          {log.duration_seconds ? `${log.duration_seconds}s` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
