@echo off
title NSEpulse - Real-time Market Terminal
cd /d "%~dp0"

echo ==============================================================================
echo  Starting NSEpulse (Windows Launcher)
echo ==============================================================================

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in PATH. Please install Python 3.10+ from python.org.
    pause
    exit /b 1
)

:: Check Node
call npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH. Please install Node.js from nodejs.org.
    pause
    exit /b 1
)

:: Install requirements if needed
if not exist "frontend\node_modules" (
    echo [1/3] Installing frontend dependencies...
    call npm --prefix frontend install
)

echo [2/3] Launching FastAPI Backend on http://127.0.0.1:8756 ...
start "NSEpulse Backend" cmd /c "cd /d ""%~dp0backend"" && python run.py"

echo [3/3] Launching Frontend Dashboard on http://localhost:5173 ...
start "NSEpulse Frontend" cmd /c "cd /d ""%~dp0frontend"" && npm run dev"

echo.
echo Launching NSEpulse...
timeout /t 3 >nul
start http://localhost:5173
echo.
echo NSEpulse is running at http://localhost:5173
