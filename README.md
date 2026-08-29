# NSE Market Data Automation & High-Density Trading Terminal (Phase 1)

A local-first desktop application designed to eliminate daily manual market data capture from the National Stock Exchange of India (NSE). It automatically captures Nifty 50 constituent metrics and Broad Market, Sectoral, Thematic, and Strategy indices snapshots post-market close, stores them in a local SQLite database, presents them in an institutional-grade dark terminal UI, and exports beautifully styled Excel workbooks with a single "Download All" button.

---

## 🔑 Where to Include API Keys & Configuration

### Official NSE Market Data Endpoints
- **No API key is required**: The NSE website does not utilize API keys. The application utilizes Chrome-fingerprinted HTTP sessions (`curl_cffi`) with dynamic session cookie negotiation to authenticate directly with NSE's live endpoints.

### Application Settings & Optional 3rd-Party Fallbacks
All backend configuration and any future external API keys are located in:
📂 `backend/.env` (and template `backend/.env.example`)

```ini
# ==============================================================================
# NSE Market Data Automation & Dashboard - Configuration
# ==============================================================================

# Server Settings
HOST=127.0.0.1
PORT=8756
DEBUG=True

# Database Path (Async SQLite)
DATABASE_URL=sqlite+aiosqlite:///./backend/data/nse_market.db

# Storage directory for Excel exports
EXPORT_DIR=./exports

# Scheduler Settings (IST - Indian Standard Time)
# Automatically runs daily sync post-close on weekdays (Mon-Fri)
SCHEDULE_CRON_TIMES=16:30,17:00,18:00

# Optional 3rd-Party Fallback Providers (Leave empty if using direct NSE capture)
ALPHA_VANTAGE_API_KEY=your_alphavantage_key_here
UPSTOX_API_KEY=your_upstox_key_here
FINANCIAL_MODELING_PREP_KEY=your_fmp_key_here
```

---

## 🚀 One-Command Quick Start

### Single Terminal Command (Concurrent Backend + Frontend):
```bash
npm start
```
*(or `npm run dev`)*

### Windows Dedicated Windows & Browser Auto-Launch:
```cmd
start_dev.bat
```

---

## 📊 Excel Export Specification (`openpyxl`)

When clicking **"Download All"**, the system generates a dated folder (`exports/YYYY-MM-DD/`) containing two workbooks bundled into a single ZIP, with **`Date` explicitly positioned as the 1st column (Column A)** across all spreadsheets:

### 1. `nifty50_daily_YYYY-MM-DD.xlsx`
- **Sheet 1 (`"Nifty 50 Overview"`)**:
  - **Column A is `Date`**, followed by `Symbol`, `Company Name`, `LTP (₹)`, `Change (₹)`, `% Change`, `Open (₹)`, `High (₹)`, `Low (₹)`, `Prev Close (₹)`, `Volume (Shares)`, `Turnover (₹ Cr)`, `52W High (₹)`, `52W Low (₹)`, `30D % Change`, `365D % Change`, `Near 52W High (%)`, `Near 52W Low (%)`.
  - Frozen headers (`freeze_panes = "C2"` to pin Date & Symbol) and autofilter.
  - Native `ColorScaleRule` (Red `#FCA5A5` → White `#FFFFFF` → Green `#86EFAC`) centered at 0.
  - Native `DataBarRule` on `Volume` and `Turnover`.
  - Native `IconSetRule` (3-Arrows) on momentum.
  - Formatted numbers (`₹#,##0.00`, `+0.00%;-0.00%;0.00%`, `#,##0`).
- **Sheets 2 to 51 (`"RELIANCE"`, `"TCS"`, `"INFY"`, etc.)**:
  - One sheet per constituent with 3 structured sections and `Date` prominent in each header and table.

### 2. `broad_market_indices_YYYY-MM-DD.xlsx`
- **Categorized Sheets**: `Broad Market`, `Sectoral`, `Thematic`, and `Strategy`.
- **Column A is `Date`**, followed by `Index Name`, `Index Symbol`, `Current Value`, `Variation`, `% Change`, `Open`, `High`, `Low`, `Prev Close`, `P/E`, `P/B`, `Div Yield (%)`, `Advances`, `Declines`, `Unchanged`, `30D % Change`, `365D % Change`, `52W High`, `52W Low`.
- Frozen headers (`freeze_panes = "C2"`) and autofilter.
- Native `ColorScaleRule` and `IconSetRule` on index performance.

---

## 🖥️ Desktop Application Build (Electron for Windows & macOS)

The application includes native desktop shell support powered by **Electron** and bundled with a standalone Python FastAPI backend sidecar.

### 📦 Prerequisites for Local Packaging
- **Node.js**: v18+ or v20+.
- **Python**: 3.10, 3.11, 3.12, or 3.13.

### 🏗️ Build Local Desktop Installers:
```bash
# Build complete desktop application for Windows (.exe installer + portable)
npm run electron:build:win

# Or build for macOS (.dmg + .zip for MacBook)
npm run electron:build:mac
```

The generated application installers will be saved in the `release/` directory:
- **Windows**: `release/NSE Market Suite Setup 1.0.0.exe` & `release/NSE Market Suite 1.0.0.exe` (Portable)
- **macOS**: `release/NSE Market Suite-1.0.0.dmg` & `release/NSE Market Suite-1.0.0-mac.zip`

### ☁️ Automated Multi-Platform GitHub Actions Builds
A ready-to-run GitHub Actions CI workflow is provided at `.github/workflows/build-electron.yml`.
Whenever you push to `main` or create a release tag (`v1.0.0`), GitHub Actions will automatically compile and produce downloadable binaries for **both Windows and macOS** (Apple Silicon + Intel universal).

