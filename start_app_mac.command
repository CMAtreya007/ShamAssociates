#!/bin/bash
# ==============================================================================
# NSEpulse - Real-time Market Terminal (macOS Launcher)
# Double-clickable script for macOS / MacBook
# ==============================================================================

cd "$(dirname "$0")"

echo "=============================================================================="
echo " Starting NSEpulse on macOS"
echo "=============================================================================="

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed. Please install Python from https://www.python.org/downloads/macos/"
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if Node.js / npm is available
if ! command -v npm &> /dev/null; then
    echo "Error: Node.js / npm is not installed. Please install Node from https://nodejs.org/"
    read -p "Press Enter to exit..."
    exit 1
fi

# Setup Python Virtual Environment if not present
if [ ! -d "backend/.venv" ]; then
    echo "[1/3] Setting up Python virtual environment..."
    python3 -m venv backend/.venv
    source backend/.venv/bin/activate
    pip install --upgrade pip
    pip install -r backend/requirements.txt
else
    source backend/.venv/bin/activate
fi

# Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "[2/3] Installing frontend dependencies..."
    npm --prefix frontend install
fi

echo "[3/3] Launching Backend & Frontend services..."

# Start FastAPI backend in background
python3 backend/run.py &
BACKEND_PID=$!

# Start Vite frontend
npm --prefix frontend run dev &
FRONTEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM EXIT

# Wait 3 seconds and open the application in the default browser
sleep 3
open "http://localhost:5173"

echo ""
echo "NSEpulse is running at: http://localhost:5173"
echo "Press Ctrl+C in this terminal window to stop all services."
echo ""

wait
