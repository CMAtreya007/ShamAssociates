import { useState } from "react";
import { toast } from "sonner";
import { authFetch, API_BASE } from "../services/api";

export function useExportMarketData() {
  const [exporting, setExporting] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");

  const downloadAll = async (selectedDate?: string) => {
    try {
      setExporting(true);
      setProgressStage("Connecting to exporter service...");
      toast.info("Preparing Excel workbooks...", { id: "export-toast" });

      const dateStr = selectedDate || new Date().toISOString().split("T")[0];

      const token = localStorage.getItem("nse_terminal_auth_token");
      let url = `${API_BASE}/export/full?date=${encodeURIComponent(dateStr)}`;
      if (token) {
        url += `&token=${encodeURIComponent(token)}`;
      }

      setProgressStage("Generating formatted openpyxl workbooks...");
      const response = await authFetch(url, {
        method: "POST"
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({ detail: "Export generation failed" }));
        throw new Error(errJson.detail || "Failed to generate Excel packages");
      }

      const exportDate = response.headers.get("X-Export-Date") || dateStr;
      const fileName = `NSE_Market_Data_${exportDate}.zip`;

      setProgressStage("Downloading archive...");
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      toast.success("Export Complete", {
        id: "export-toast",
        description: `Downloaded: ${fileName}`
      });
    } catch (err: any) {
      toast.error("Export Failed", {
        id: "export-toast",
        description: err.message || "Could not complete Excel generation"
      });
    } finally {
      setExporting(false);
      setProgressStage("");
    }
  };

  return { downloadAll, exporting, progressStage };
}
