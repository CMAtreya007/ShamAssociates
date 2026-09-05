# ==========================================
# Multi-Stage Dockerfile for NSE Market Terminal
# Stage 1: Build Frontend (Vite + React + TS)
# Stage 2: Python Backend (FastAPI + Uvicorn)
# ==========================================

# ----------------- Stage 1: Build Frontend -----------------
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN chmod -R +x node_modules/.bin && npm run build

# ----------------- Stage 2: Backend + Final Runtime -----------------
FROM python:3.11-slim AS runtime

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set Timezone to Asia/Kolkata (IST)
ENV TZ=Asia/Kolkata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Install Python requirements
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy Backend application
COPY backend/ ./backend/

# Copy built frontend assets into frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Set working directory to backend
WORKDIR /app/backend

# Ensure persistent directories exist
RUN mkdir -p data exports

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=8756
ENV DEBUG=False
ENV PYTHONPATH=/app/backend

EXPOSE 8756

# Startup command supporting dynamic cloud $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8756}"]
