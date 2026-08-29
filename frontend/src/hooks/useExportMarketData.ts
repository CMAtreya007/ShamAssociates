import { useState } from "react";
import { toast } from "sonner";

export function useExportMarketData() {
  const [exporting, setExporting] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");

  const downloadAll = async (selectedDate?: string) => {
    try {
      setExporting(true);
      setProgressStage("Connecting to exporter service...");
      toast.info("Preparing Excel workbooks...", { id: "export-toast" });

      const dateStr = selectedDate || new Date().toISOString().split("T")[0];
      const defaultFileName = `NSE_Market_Data_${dateStr}.zip`;

      let tauriSaved = false;

      // 1. Check if running inside native Tauri v2 desktop shell
      try {
        const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
        if (isTauri) {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const { writeFile } = await import("@tauri-apps/plugin-fs");

          // Prompt Native Save Dialog
          const filePath = await save({
            defaultPath: defaultFileName,
            filters: [{ name: "ZIP Archive", extensions: ["zip"] }]
          });

          if (!filePath) {
            setExporting(false);
            setProgressStage("");
            toast.dismiss("export-toast");
            return; // User cancelled
          }

          setProgressStage("Generating formatted openpyxl workbooks...");
          const response = await fetch(`http://127.0.0.1:8756/api/export/full?date=${encodeURIComponent(dateStr)}`, {
            method: "POST"
          });

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({ detail: "Export generation failed" }));
            throw new Error(errJson.detail || "Failed to generate Excel packages");
          }

          setProgressStage("Writing binary package to disk...");
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await writeFile(filePath, uint8Array);

          tauriSaved = true;
          toast.success("Export Complete", {
            id: "export-toast",
            description: `Saved: ${filePath}`
          });
        }
      } catch (tauriErr) {
        console.warn("Tauri native save dialog unavailable, falling back to browser download:", tauriErr);
      }

      // 2. Browser stream download fallback (when running in web / dev mode)
      if (!tauriSaved) {
        setProgressStage("Generating formatted openpyxl workbooks...");
        const response = await fetch(`http://127.0.0.1:8756/api/export/full?date=${encodeURIComponent(dateStr)}`, {
          method: "POST"
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({ detail: "Export generation failed" }));
          throw new Error(errJson.detail || "Failed to generate Excel packages");
        }

        setProgressStage("Downloading archive...");
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = defaultFileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);

        toast.success("Export Downloaded", {
          id: "export-toast",
          description: `Downloaded ${defaultFileName}`
        });
      }
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
