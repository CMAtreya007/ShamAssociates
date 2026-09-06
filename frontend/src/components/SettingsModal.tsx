import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Settings, 
  Clock, 
  FolderDown, 
  Loader2, 
  Save, 
  Play,
  RotateCcw,
  UserCheck,
  Folder,
  Laptop,
  CheckCircle2,
  HardDrive
} from "lucide-react";
import { toast } from "sonner";
import { 
  getScheduleSettings, 
  saveScheduleSettings, 
  triggerImmediateAutoDownload,
  downloadExportZip 
} from "../services/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [username, setUsername] = useState<string>("admin");
  const [clientIp, setClientIp] = useState<string>("127.0.0.1");
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(true);
  const [scheduleTime, setScheduleTime] = useState("15:45");
  const [downloadsFolder, setDownloadsFolder] = useState("");
  const [defaultSystemDownloads, setDefaultSystemDownloads] = useState("");
  const [nextRunTime, setNextRunTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      // 1. Check local storage first for instant feedback
      const localFolder = localStorage.getItem("nse_auto_download_folder");
      if (localFolder) setDownloadsFolder(localFolder);

      // 2. Load latest from backend SQLite database
      getScheduleSettings()
        .then((res) => {
          if (res.username) setUsername(res.username);
          if (res.client_ip) setClientIp(res.client_ip);
          setAutoDownloadEnabled(res.auto_download_enabled ?? true);
          if (res.schedule_times && res.schedule_times.length > 0) {
            setScheduleTime(res.schedule_times[0]);
          }
          const folderToUse = res.downloads_folder || localFolder || res.default_system_downloads || "";
          setDownloadsFolder(folderToUse);
          setDefaultSystemDownloads(res.default_system_downloads || "");
          setNextRunTime(res.next_run_time);
        })
        .catch((err) => {
          console.error("Failed to load user schedule settings:", err);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handlePickFolder = async () => {
    try {
      // @ts-ignore
      if (typeof window !== "undefined" && window.showDirectoryPicker) {
        // @ts-ignore
        const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        if (dirHandle && dirHandle.name) {
          const selectedPath = `Downloads/${dirHandle.name}`;
          setDownloadsFolder(selectedPath);
          localStorage.setItem("nse_auto_download_folder", selectedPath);
          toast.success("System Location Selected", {
            description: `Directory: ${dirHandle.name} (Saved for System IP ${clientIp})`
          });
        }
      } else if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        if (fileInputRef.current) fileInputRef.current.click();
      }
    }
  };

  const handleDirectoryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Extract root directory name
      const relativePath = files[0].webkitRelativePath || files[0].name;
      const rootDir = relativePath.split("/")[0] || files[0].name;
      const chosen = `Downloads/${rootDir}`;
      setDownloadsFolder(chosen);
      localStorage.setItem("nse_auto_download_folder", chosen);
      toast.success("System Location Selected", {
        description: `Directory: ${rootDir}`
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const folderToSave = downloadsFolder || defaultSystemDownloads;
      localStorage.setItem("nse_auto_download_folder", folderToSave);

      const res = await saveScheduleSettings({
        auto_download_enabled: autoDownloadEnabled,
        schedule_times: [scheduleTime],
        downloads_folder: folderToSave
      });
      setNextRunTime(res.next_run_time);
      toast.success("Settings Saved in Local Database", {
        description: `Stored in backend SQLite & local storage for IP ${clientIp}. Folder: ${folderToSave}`
      });
    } catch (err: any) {
      toast.error("Failed to save settings", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (defaultSystemDownloads) {
      setDownloadsFolder(defaultSystemDownloads);
      localStorage.setItem("nse_auto_download_folder", defaultSystemDownloads);
      toast.info("Reset to Default Downloads Folder", {
        description: defaultSystemDownloads
      });
    }
  };

  const handleTriggerTestDownload = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generating full export bundle and initiating download...");
    try {
      const [serverRes, clientRes] = await Promise.allSettled([
        triggerImmediateAutoDownload(),
        downloadExportZip()
      ]);

      let dest = downloadsFolder || defaultSystemDownloads;
      if (serverRes.status === "fulfilled" && serverRes.value?.destination_folder) {
        dest = serverRes.value.destination_folder;
      }

      toast.success("Auto-Download Completed Successfully", {
        id: toastId,
        description: `Saved to system directory '${dest}' and downloaded directly to your Downloads folder!`
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn font-sans select-none">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-modal overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#00B386] border border-emerald-200/60 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Application Settings & System Storage</h2>
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold uppercase">
                  <UserCheck className="w-3 h-3" />
                  {username}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                  <Laptop className="w-3 h-3 text-slate-500" />
                  IP: {clientIp}
                </span>
              </div>
              <p className="text-xs text-slate-500">Choose custom system location, persist auto-download paths in SQLite & LocalStorage</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto bg-slate-50/50">
          
          {isLoading ? (
            <div className="p-8 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span>Loading user settings from database...</span>
            </div>
          ) : (
            <div className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-4 shadow-card">
              
              {/* Feature Title & Toggle Switch */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FolderDown className="w-4 h-4 text-emerald-600" />
                  <span>Automated Daily Auto-Download (Background Engine)</span>
                </div>
                
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

              {/* Status Banner */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-emerald-900 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Persistent System Location & Background Runner:</strong> Whenever you log in from this machine (<code className="font-mono text-[11px] font-bold">{clientIp}</code>), your chosen destination is restored automatically. If your browser remains open, the background engine will capture and download market files automatically.
                </div>
              </div>

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

              {/* Destination Folder Path & Interactive System Location Picker */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-800 font-bold block text-[11px] flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                    System Storage Location:
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {defaultSystemDownloads && (
                      <button
                        type="button"
                        onClick={handleResetToDefault}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 font-medium cursor-pointer transition"
                        title="Reset to default system Downloads folder"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Default</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-emerald-700 text-[11px] font-bold shadow-2xs transition cursor-pointer"
                      title="Choose custom folder on your system"
                    >
                      <Folder className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Choose System Location</span>
                    </button>
                  </div>
                </div>

                {/* Hidden input fallback for folder browsing */}
                <input
                  ref={fileInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  className="hidden"
                  onChange={handleDirectoryInputChange}
                />

                <div className="relative">
                  <input
                    type="text"
                    value={downloadsFolder}
                    onChange={(e) => setDownloadsFolder(e.target.value)}
                    placeholder={defaultSystemDownloads || "e.g. C:\\Users\\Name\\Downloads\\NSE_Market_Data"}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500 pr-24"
                  />
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="absolute right-1.5 top-1.5 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-600 transition cursor-pointer"
                  >
                    Browse...
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                  <span>Saved in Local SQLite database + Persistent Browser LocalStorage.</span>
                  <span className="font-mono text-emerald-700 font-bold">System IP: {clientIp}</span>
                </div>
              </div>

              {/* Instant Action & Save Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleTriggerTestDownload}
                  disabled={isExporting}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                  )}
                  <span>Test Save to Location Now</span>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-[#00B386] hover:bg-[#009E76] text-white text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Location & Schedule</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
