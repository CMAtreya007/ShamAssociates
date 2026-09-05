# NSE Market Terminal — Deployment & Client Access Guide

This guide provides full instructions for hosting the **NSE Market Terminal** application (both Frontend and Backend together in a unified cloud web service) and sharing testing access with your clients.

---

## 1. Client Testing Credentials Reference

The application is protected by a dedicated security gate. Without valid credentials, nobody can access the dashboard or backend APIs.

| Account Type | User ID / Username | Password | Role & Permissions |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin` | `Admin@NSE2025!` | Full system control, sync triggers, historical backfills, Excel master downloads & settings |
| **Financial Analyst** | `client_analyst` | `Analyst@NSE2025!` | Market data analysis, Sectoral/Thematic views, corporate catalysts, and full Excel export |
| **QA / Client Tester** | `client_tester` | `Tester@NSE2025!` | End-to-end client verification, live real-time price streaming, screener validation |

> **Note on Customization**: You can change any of these passwords without editing code by setting environment variables in your cloud provider dashboard (e.g. `AUTH_USER_ADMIN_PASS`, `AUTH_USER_ANALYST_PASS`, `AUTH_USER_TESTER_PASS`).

---

## 2. Cloud Hosting Options

### Option A: 100% Free Deployment on Render.com (Recommended)

Render offers free web service hosting for Docker containers and automatically handles SSL (HTTPS & WSS).

1. **Push your code to GitHub / GitLab**:
   ```bash
   git add .
   git commit -m "Add authentication and cloud deployment setup"
   git push origin main
   ```
2. **Sign in to [Render.com](https://render.com/)** and click **New +** $\rightarrow$ **Web Service**.
3. Select your GitHub repository.
4. Render will automatically detect the `Dockerfile` in the root directory.
5. Choose **Instance Type**: `Free`.
6. Add the following **Environment Variables** in the Render dashboard:
   - `HOST`: `0.0.0.0`
   - `DEBUG`: `false`
   - `JWT_SECRET`: *(Click "Generate" or type a secret key)*
   - `AUTH_USER_ADMIN_PASS`: `Admin@NSE2025!`
   - `AUTH_USER_ANALYST_PASS`: `Analyst@NSE2025!`
   - `AUTH_USER_TESTER_PASS`: `Tester@NSE2025!`
7. Click **Create Web Service**.
8. Once deployed, Render will provide a live HTTPS URL (e.g., `https://nse-terminal-xxxx.onrender.com`).
9. Share the live URL and the credentials with your client!

---

### Option B: 1-Click Deployment on Railway.app

Railway provides fast container hosting with generous starter credits.

1. Go to [Railway.app](https://railway.app/) and sign in with GitHub.
2. Click **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Select this repository. Railway will detect `railway.json` and `Dockerfile`.
4. Under **Variables**, add:
   - `PORT`: `8756` (or leave default)
   - `HOST`: `0.0.0.0`
   - `JWT_SECRET`: `nse_secure_production_secret_2025_market`
   - `AUTH_USER_ADMIN_PASS`: `Admin@NSE2025!`
   - `AUTH_USER_ANALYST_PASS`: `Analyst@NSE2025!`
   - `AUTH_USER_TESTER_PASS`: `Tester@NSE2025!`
5. Click **Deploy**. Under **Settings** $\rightarrow$ **Generate Domain** to get a public URL (e.g., `https://nse-terminal.up.railway.app`).

---

### Option C: Single-Command Docker Deployment (VPS / DigitalOcean / AWS EC2)

If you have a Linux VPS or cloud server with Docker installed:

1. Clone the repository on the server:
   ```bash
   git clone <your-repo-url>
   cd CA
   ```
2. Start the unified container:
   ```bash
   docker compose up -d --build
   ```
3. The application will be live at `http://<your-server-ip>:8756` with persistent storage for SQLite data and Excel exports.

---

## 3. Local Development Mode

To run locally in development mode:

### Terminal 1: Backend
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
python run.py
```
*Backend runs on `http://127.0.0.1:8756`*

### Terminal 2: Frontend
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5180` (with live reload)*

---

## 4. Architecture Summary

- **Unified Single-Server Model**: In production, the FastAPI backend serves both the compiled React single-page app (`frontend/dist`) and the JSON REST / WebSocket live APIs on a single port.
- **HMAC-SHA256 Token Auth**: Login requests to `/api/auth/login` validate credentials and issue signed JWT tokens (72-hour lifetime).
- **Protected APIs**: All market data, synchronization, backfill, and Excel export routes reject unauthenticated requests with `HTTP 401 Unauthorized`.
- **WebSocket Streaming**: Real-time market updates authenticate via `?token=<token>` query parameters on connection.
- **Zero CORS Issues**: Because both the UI and backend run on the same origin when hosted, there are zero CORS or certificate mismatch issues.
