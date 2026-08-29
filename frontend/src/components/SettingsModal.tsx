import React, { useState, useEffect } from "react";
import { 
  X, 
  Settings, 
  Clock, 
  FolderDown, 
  Loader2, 
  Save, 
  Play
} from "lucide-react";
import { toast } from "sonner";
import { 
  getScheduleSettings, 
  saveScheduleSettings, 
  triggerImmediateAutoDownload 
} from "../services/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(true);
  const [scheduleTime, setScheduleTime] = useState("16:30");
  const [downloadsFolder, setDownloadsFolder] = useState("");
  const [nextRunTime, setNextRunTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getScheduleSettings()
        .then((res) => {
          setAutoDownloadEnabled(res.auto_download_enabled);
          if (res.schedule_times && res.schedule_times.length > 0) {
            setScheduleTime(res.schedule_times[0]);
          }
          setDownloadsFolder(res.downloads_folder || "");
          setNextRunTime(res.next_run_time);
        })
        .catch((err) => {
          console.error("Failed to load schedule settings:", err);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await saveScheduleSettings({
        auto_download_enabled: autoDownloadEnabled,
        schedule_times: [scheduleTime],
        downloads_folder: downloadsFolder
      });
      setNextRunTime(res.next_run_time);
      toast.success("Schedule Settings Saved", {
        description: `Automated daily auto-download set to ${scheduleTime} IST.`
      });
    } catch (err: any) {
      toast.error("Failed to save schedule settings", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerTestDownload = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generating full export bundle and saving to Downloads folder...");
    try {
      const res = await triggerImmediateAutoDownload();
      toast.success("Saved to Downloads Folder", {
        id: toastId,
        description: `Successfully stored ${res.saved_files.length} workbooks in: ${res.destination_folder}`
      });
    } catch (err: any) {
      toast.error("Auto-Download Failed", {
        id: toastId,
        description: err.message || "Could not write to destination folder"
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-modal overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#00B386] border border-emerald-200/60 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Application Settings & Scheduler</h2>
              <p className="text-xs text-slate-500">Configure automated daily downloads, destination folder, and local SQLite database</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto bg-slate-50/50">
          
          {/* 1. Automated Daily Auto-Download to Downloads Folder (Feature Card) */}
          <div className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FolderDown className="w-4 h-4 text-emerald-600" />
                <span>Automated Daily Auto-Download (Every Day)</span>
              </div>
              
              {/* Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDownloadEnabled}
                  onChange={(e) => setAutoDownloadEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00B386]"></div>
              </label>
            </div>

            <p className="text-slate-600 leading-relaxed">
              When enabled, the system automatically fetches all market data, generates the full 54-row Nifty 50 sheets and multi-sheet indices, and <strong className="text-slate-900">stores the `.xlsx` workbooks and `.zip` bundle directly in your Downloads folder</strong> post-market close every active trading day.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              
              {/* Scheduled Auto-Download Time */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <label className="text-slate-500 font-semibold block text-[11px]">
                  Daily Scheduled Time (IST):
                </label>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-slate-400 font-mono text-[11px]">IST (Mon–Fri)</span>
                </div>
              </div>

              {/* Next Execution Status */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <span className="text-slate-500 font-semibold block text-[11px]">
                  Next Scheduled Run:
                </span>
                <div className="text-emerald-700 font-mono font-bold text-xs pt-1 truncate">
                  {nextRunTime || `${scheduleTime}:00 IST (Active Trading Days)`}
                </div>
              </div>

            </div>

            {/* Destination Folder Path */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
              <span className="text-slate-500 font-semibold block text-[11px]">
                Auto-Download Destination Folder:
              </span>
              <input
                type="text"
                value={downloadsFolder}
                onChange={(e) => setDownloadsFolder(e.target.value)}
                placeholder="e.g. C:\Users\YourName\Downloads\NSE_Market_Data"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Instant Action: Test Export to Downloads Folder Now */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTriggerTestDownload}
                disabled={isExporting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                )}
                <span>Test Save to Downloads Folder Now</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#00B386] hover:bg-[#009E76] text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Schedule</span>
              </button>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
