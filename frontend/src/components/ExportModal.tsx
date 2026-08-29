import React from "react";
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  DownloadCloud,
  FileCheck2,
  FolderArchive
} from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  statusText: string;
  isComplete: boolean;
  error: string | null;
  savedFilename: string | null;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  statusText,
  isComplete,
  error,
  savedFilename,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6">
        
        {/* Header Icon & Title */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Generating Excel Export</h3>
            <p className="text-xs text-slate-400">NSE Market Data Workbooks (openpyxl)</p>
          </div>
        </div>

        {/* Status Animation & Checklist */}
        <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
          
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              {isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : error ? (
                <AlertCircle className="w-5 h-5 text-rose-400" />
              ) : (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-white">{statusText}</p>
            </div>
          </div>

          {/* Included workbooks summary */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-teal-400" />
              <span><strong className="text-white">nifty50_daily_*.xlsx</strong> (Overview + 50 Stock Sheets)</span>
            </div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-blue-400" />
              <span><strong className="text-white">broad_market_indices_*.xlsx</strong> (4 Category Sheets)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <FolderArchive className="w-4 h-4 text-amber-400" />
              <span>Packaged into dated ZIP archive with conditional formatting</span>
            </div>
          </div>

        </div>

        {/* Error message if any */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Completed notification */}
        {isComplete && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="truncate">Saved: {savedFilename || "Export archive downloaded"}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            disabled={!isComplete && !error}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition ${
              isComplete || error
                ? "bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-md shadow-blue-900/30 cursor-pointer"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            {isComplete ? "Done" : error ? "Close" : "Exporting..."}
          </button>
        </div>

      </div>
    </div>
  );
};
