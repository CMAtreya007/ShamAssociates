import { 
  Nifty50Stock, 
  StockDetail, 
  IndexDaily, 
  FetchStatus, 
  FetchLog,
  CorporateAction,
  CorporateAnnouncement,
  AuthUser,
  LoginResponseData,
  AccountPublicInfo
} from "../types";

export const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }
  // In development Vite dev server, route to backend port if not using relative proxy
  if (typeof window !== "undefined") {
    if (window.location.port === "5180" || window.location.port === "5173" || window.location.port === "5175") {
      return "http://127.0.0.1:8756/api";
    }
  }
  return "/api";
};

export const API_BASE = getApiBaseUrl();

let tokenGetter: (() => string | null) = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("nse_terminal_auth_token");
  }
  return null;
};

let onUnauthorizedCallback: (() => void) | null = null;

export function setAuthTokenGetter(getter: () => string | null) {
  tokenGetter = getter;
}

export function setOnUnauthorizedCallback(cb: () => void) {
  onUnauthorizedCallback = cb;
}

/**
 * Universal authenticated fetch helper attaching Bearer token and handling 401 unauth.
 */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = tokenGetter();
  const headers = new Headers(init?.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(input, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
    const err = await res.json().catch(() => ({ detail: "Unauthorized access" }));
    throw new Error(err.detail || "Authentication required or session expired.");
  }

  return res;
}

// ================= AUTHENTICATION APIS =================

export async function loginApi(username: string, pass: string): Promise<LoginResponseData> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: pass }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Invalid credentials. Please try again.");
  }

  return res.json();
}

export async function getCurrentUser(): Promise<AuthUser> {
  const res = await authFetch(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error("Failed to verify user session");
  return res.json();
}

export async function logoutApi(): Promise<{ success: boolean; message: string }> {
  const res = await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
  if (!res.ok) return { success: true, message: "Logged out" };
  return res.json();
}

export async function fetchPublicAccounts(): Promise<AccountPublicInfo[]> {
  const res = await fetch(`${API_BASE}/auth/accounts`);
  if (!res.ok) return [];
  return res.json();
}

// ================= MARKET & SYNC APIS =================

export async function getFetchStatus(): Promise<FetchStatus> {
  const res = await authFetch(`${API_BASE}/fetch/status`);
  if (!res.ok) throw new Error("Failed to fetch sync status");
  return res.json();
}

export async function triggerManualSync(fetchDetails: boolean = true, targetDate?: string): Promise<{ success: boolean; message: string }> {
  const res = await authFetch(`${API_BASE}/fetch/run`, {
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
  const res = await authFetch(`${API_BASE}/fetch/backfill?date=${encodeURIComponent(date)}&background=${background}`, {
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
  const res = await authFetch(`${API_BASE}/settings/schedule`);
  if (!res.ok) throw new Error("Failed to fetch schedule settings");
  return res.json();
}

export async function saveScheduleSettings(data: {
  auto_download_enabled: boolean;
  schedule_times: string[];
  downloads_folder?: string;
}): Promise<{ success: boolean; message: string; config: any; next_run_time: string | null }> {
  const res = await authFetch(`${API_BASE}/settings/schedule`, {
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
  const res = await authFetch(url, { method: "POST" });
  if (!res.ok) throw new Error("Failed to trigger auto-download");
  return res.json();
}

export async function getFetchLogs(limit: number = 20): Promise<FetchLog[]> {
  const res = await authFetch(`${API_BASE}/fetch/logs?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

export async function fetchAvailableDates(): Promise<string[]> {
  const res = await authFetch(`${API_BASE}/data/available-dates`);
  if (!res.ok) throw new Error("Failed to fetch dates");
  return res.json();
}

export async function fetchNifty50(date?: string): Promise<Nifty50Stock[]> {
  const url = date ? `${API_BASE}/data/nifty50?date=${encodeURIComponent(date)}` : `${API_BASE}/data/nifty50`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error("Failed to fetch Nifty 50 data");
  return res.json();
}

export async function fetchStockDetail(symbol: string, date?: string): Promise<StockDetail> {
  const url = date
    ? `${API_BASE}/data/stock/${encodeURIComponent(symbol)}?date=${encodeURIComponent(date)}`
    : `${API_BASE}/data/stock/${encodeURIComponent(symbol)}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch details for ${symbol}`);
  return res.json();
}

export async function fetchStockActions(symbol: string): Promise<CorporateAction[]> {
  const url = `${API_BASE}/data/stock/${encodeURIComponent(symbol)}/actions`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch actions for ${symbol}`);
  return res.json();
}

export async function fetchCatalysts(scope: string = "all", actionType?: string, limit?: number): Promise<CorporateAction[]> {
  let url = `${API_BASE}/data/catalysts?scope=${encodeURIComponent(scope)}`;
  if (limit) url += `&limit=${limit}`;
  if (actionType) url += `&action_type=${encodeURIComponent(actionType)}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error("Failed to fetch corporate catalysts");
  return res.json();
}

export async function fetchAnnouncements(limit?: number): Promise<CorporateAnnouncement[]> {
  const url = limit ? `${API_BASE}/data/announcements?limit=${limit}` : `${API_BASE}/data/announcements`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error("Failed to fetch announcements");
  return res.json();
}

export async function fetchIndices(category: string, date?: string): Promise<IndexDaily[]> {
  const url = date
    ? `${API_BASE}/data/indices/${encodeURIComponent(category)}?date=${encodeURIComponent(date)}`
    : `${API_BASE}/data/indices/${encodeURIComponent(category)}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${category} indices`);
  return res.json();
}

export async function downloadExportZip(date?: string, onProgress?: (step: string) => void): Promise<{ filename: string; size: number }> {
  if (onProgress) onProgress("Requesting server to build formatted Excel workbooks...");
  
  const token = tokenGetter();
  let url = date ? `${API_BASE}/export/full?date=${encodeURIComponent(date)}` : `${API_BASE}/export/full`;
  if (token) {
    url += (url.includes("?") ? "&" : "?") + `token=${encodeURIComponent(token)}`;
  }

  const res = await authFetch(url, { method: "POST" });
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

export interface IngestionResult {
  success: boolean;
  files_processed: number;
  indices_imported: number;
  nifty50_imported: number;
  classified_files: Array<{
    filename: string;
    classification: string;
    records_imported: number;
    dates_detected: string[];
    error?: string;
  }>;
  master_indices_path: string;
  master_nifty50_path: string;
}

export async function uploadHistoricalExcelFiles(files: File[]): Promise<IngestionResult> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  const res = await authFetch(`${API_BASE}/export/master/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Failed to upload and ingest Excel files");
  }
  return res.json();
}
