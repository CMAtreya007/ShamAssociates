import { 
  Nifty50Stock, 
  StockDetail, 
  IndexDaily, 
  FetchStatus, 
  FetchLog,
  CorporateAction,
  CorporateAnnouncement
} from "../types";

const API_BASE = "http://127.0.0.1:8756/api";

export async function getFetchStatus(): Promise<FetchStatus> {
  const res = await fetch(`${API_BASE}/fetch/status`);
  if (!res.ok) throw new Error("Failed to fetch sync status");
  return res.json();
}

export async function triggerManualSync(fetchDetails: boolean = true, targetDate?: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/fetch/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "MANUAL",
      fetch_details: fetchDetails,
      target_date: targetDate || null,
    }),
  });
  if (!res.ok) throw new Error("Failed to trigger sync");
  return res.json();
}

export async function triggerBackfill(date: string, background: boolean = false): Promise<{ success: boolean; message: string; log?: FetchLog }> {
  const res = await fetch(`${API_BASE}/fetch/backfill?date=${encodeURIComponent(date)}&background=${background}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Backfill request failed" }));
    throw new Error(err.detail || "Failed to trigger historical backfill");
  }
  return res.json();
}

export async function getScheduleSettings(): Promise<{
  auto_download_enabled: boolean;
  schedule_times: string[];
  downloads_folder: string;
  next_run_time: string | null;
}> {
  const res = await fetch(`${API_BASE}/settings/schedule`);
  if (!res.ok) throw new Error("Failed to fetch schedule settings");
  return res.json();
}

export async function saveScheduleSettings(data: {
  auto_download_enabled: boolean;
  schedule_times: string[];
  downloads_folder?: string;
}): Promise<{ success: boolean; message: string; config: any; next_run_time: string | null }> {
  const res = await fetch(`${API_BASE}/settings/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save schedule settings");
  return res.json();
}

export async function triggerImmediateAutoDownload(targetDate?: string): Promise<{
  success: boolean;
  message: string;
  saved_files: string[];
  destination_folder: string;
}> {
  const url = targetDate 
    ? `${API_BASE}/settings/trigger-auto-download?target_date=${encodeURIComponent(targetDate)}`
    : `${API_BASE}/settings/trigger-auto-download`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error("Failed to trigger auto-download");
  return res.json();
}

export async function getFetchLogs(limit: number = 20): Promise<FetchLog[]> {
  const res = await fetch(`${API_BASE}/fetch/logs?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

export async function fetchAvailableDates(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/data/available-dates`);
  if (!res.ok) throw new Error("Failed to fetch dates");
  return res.json();
}

export async function fetchNifty50(date?: string): Promise<Nifty50Stock[]> {
  const url = date ? `${API_BASE}/data/nifty50?date=${encodeURIComponent(date)}` : `${API_BASE}/data/nifty50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch Nifty 50 data");
  return res.json();
}

export async function fetchStockDetail(symbol: string, date?: string): Promise<StockDetail> {
  const url = date
    ? `${API_BASE}/data/stock/${encodeURIComponent(symbol)}?date=${encodeURIComponent(date)}`
    : `${API_BASE}/data/stock/${encodeURIComponent(symbol)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch details for ${symbol}`);
  return res.json();
}

export async function fetchStockActions(symbol: string): Promise<CorporateAction[]> {
  const url = `${API_BASE}/data/stock/${encodeURIComponent(symbol)}/actions`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch actions for ${symbol}`);
  return res.json();
}

export async function fetchCatalysts(scope: string = "all", actionType?: string, limit?: number): Promise<CorporateAction[]> {
  let url = `${API_BASE}/data/catalysts?scope=${encodeURIComponent(scope)}`;
  if (limit) url += `&limit=${limit}`;
  if (actionType) url += `&action_type=${encodeURIComponent(actionType)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch corporate catalysts");
  return res.json();
}

export async function fetchAnnouncements(limit?: number): Promise<CorporateAnnouncement[]> {
  const url = limit ? `${API_BASE}/data/announcements?limit=${limit}` : `${API_BASE}/data/announcements`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch announcements");
  return res.json();
}

export async function fetchIndices(category: string, date?: string): Promise<IndexDaily[]> {
  const url = date
    ? `${API_BASE}/data/indices/${encodeURIComponent(category)}?date=${encodeURIComponent(date)}`
    : `${API_BASE}/data/indices/${encodeURIComponent(category)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${category} indices`);
  return res.json();
}

export async function downloadExportZip(date?: string, onProgress?: (step: string) => void): Promise<{ filename: string; size: number }> {
  if (onProgress) onProgress("Requesting server to build formatted Excel workbooks...");
  
  const url = date ? `${API_BASE}/export/full?date=${encodeURIComponent(date)}` : `${API_BASE}/export/full`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Export generation failed" }));
    throw new Error(errorData.detail || "Failed to generate Excel export");
  }

  if (onProgress) onProgress("Parsing and applying conditional formatting...");
  const blob = await res.blob();
  const exportDate = res.headers.get("X-Export-Date") || date || new Date().toISOString().split("T")[0];
  const filename = `NSE_Market_Data_${exportDate}.zip`;

  if (onProgress) onProgress("Saving file to disk...");

  // Standard Web & Electron browser download
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
  document.body.removeChild(a);

  return { filename, size: blob.size };
}
