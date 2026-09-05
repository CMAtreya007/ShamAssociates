import React, { useState, useRef } from "react";
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Database, 
  Layers, 
  Loader2,
  Calendar,
  Sparkles
} from "lucide-react";
import { uploadHistoricalExcelFiles, IngestionResult } from "../services/api";

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ExcelUploadModal: React.FC<ExcelUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.endsWith(".xlsx")
      );
      setSelectedFiles((prev) => [...prev, ...validFiles]);
      setError(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = Array.from(e.target.files).filter((f) =>
        f.name.endsWith(".xlsx")
      );
      setSelectedFiles((prev) => [...prev, ...validFiles]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      const res = await uploadHistoricalExcelFiles(selectedFiles);
      setResult(res);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to upload and process Excel workbooks");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setResult(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Import Historical Excel Sheets
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Auto-Classifier
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Bulk upload daily `.xlsx` files to merge into SQLite & Master Workbooks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {!result ? (
            <>
              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-500/10 scale-[0.99]"
                    : "border-slate-700 hover:border-slate-600 bg-slate-800/40 hover:bg-slate-800/60"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="p-4 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                  <Upload className="w-8 h-8 text-emerald-400 animate-bounce" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    Click to browse or drag & drop `.xlsx` files here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Accepts multi-sheet Broad Market Indices & Nifty 50 single-day spreadsheets
                  </p>
                </div>
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
                    <span>Selected Files ({selectedFiles.length})</span>
                    <button
                      onClick={handleReset}
                      className="text-rose-400 hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="truncate font-mono">{file.name}</span>
                          <span className="text-slate-500 text-[10px]">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(idx);
                          }}
                          className="text-slate-400 hover:text-rose-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Box */}
              {error && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            /* Results View */
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-400">
                <CheckCircle2 className="w-6 h-6 shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm">
                    Bulk Ingestion & Classification Complete!
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Imported <strong>{result.indices_imported}</strong> index records &amp;{" "}
                    <strong>{result.nifty50_imported}</strong> stock records into local SQLite database.
                  </p>
                </div>
              </div>

              {/* Classification Breakdown Table */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Classification &amp; Processing Breakdown
                </h5>
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800/60 text-slate-300 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5 font-semibold">File Name</th>
                        <th className="p-2.5 font-semibold">Classified Destination</th>
                        <th className="p-2.5 font-semibold text-center">Dates Found</th>
                        <th className="p-2.5 font-semibold text-right">Records</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {result.classified_files.map((cf, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="p-2.5 font-mono text-slate-200 truncate max-w-[180px]">
                            {cf.filename}
                          </td>
                          <td className="p-2.5">
                            {cf.classification === "NIFTY 50 Daily Master" ? (
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                                Nifty 50 Master
                              </span>
                            ) : cf.classification === "Broad Market Indices Master" ? (
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                                Indices Master
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">
                                Unknown
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center text-slate-400 font-mono">
                            {cf.dates_detected && cf.dates_detected.length > 0 ? (
                              cf.dates_detected.join(", ")
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono font-medium text-emerald-400">
                            +{cf.records_imported}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Master Workbooks Status */}
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1 text-xs text-slate-300">
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Master Workbooks Re-indexed &amp; Synchronized</span>
                </div>
                <p className="text-slate-400 font-mono text-[11px] truncate">
                  • {result.master_indices_path}
                </p>
                <p className="text-slate-400 font-mono text-[11px] truncate">
                  • {result.master_nifty50_path}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          {!result ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedFiles.length === 0 || isUploading}
                onClick={handleUpload}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing &amp; Classifying...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Upload &amp; Merge into Master ({selectedFiles.length})
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="w-full flex justify-end gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Upload More
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
