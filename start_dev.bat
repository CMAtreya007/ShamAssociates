@echo off
echo ==============================================================================
echo Starting NSE Market Data Automation Suite (Dev Mode)
echo ==============================================================================

echo [1/2] Launching FastAPI Backend on http://127.0.0.1:8756 ...
start "NSE Backend (FastAPI)" cmd /k "cd /d %~dp0backend && python run.py"

echo [2/2] Launching Frontend Dashboard on http://localhost:5173 ...
start "NSE Dashboard (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo All services launched!
echo Opening browser at http://localhost:5173 ...
timeout /t 3 >nul
start http://localhost:5173
