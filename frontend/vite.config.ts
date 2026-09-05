import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5180,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8756",
        changeOrigin: true,
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: "esbuild",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-framework": ["react", "react-dom"],
          "vendor-icons": ["lucide-react"],
          "vendor-ui": ["sonner", "clsx", "tailwind-merge"],
        },
      },
    },
  },
});
