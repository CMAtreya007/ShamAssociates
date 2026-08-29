const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let backendProcess = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT = 8756;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

function getBackendBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'fastapi-backend.exe' : 'fastapi-backend';
  
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', binaryName);
  } else {
    const localDist = path.join(__dirname, '..', 'backend', 'dist', binaryName);
    return localDist;
  }
}

function startBackend() {
  const binaryPath = getBackendBinaryPath();
  const fs = require('fs');

  if (fs.existsSync(binaryPath)) {
    console.log(`[Electron] Starting compiled backend sidecar: ${binaryPath}`);
    backendProcess = spawn(binaryPath, [], {
      detached: false,
      stdio: 'pipe',
    });
  } else {
    // Fallback in development if binary not yet compiled
    console.log('[Electron] Compiled binary not found, launching python backend/run.py directly...');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '..', 'backend', 'run.py');
    backendProcess = spawn(pythonCmd, [scriptPath], {
      cwd: path.join(__dirname, '..', 'backend'),
      detached: false,
      stdio: 'pipe',
    });
  }

  if (backendProcess) {
    backendProcess.stdout.on('data', (data) => {
      console.log(`[FastAPI Backend]: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[FastAPI Backend Error]: ${data}`);
    });

    backendProcess.on('close', (code) => {
      console.log(`[FastAPI Backend] Exited with code ${code}`);
    });
  }
}

function waitForBackend(callback, retries = 30) {
  if (retries <= 0) {
    console.warn('[Electron] Backend health check timeout, loading window anyway.');
    callback();
    return;
  }

  http.get(`${BACKEND_URL}/api/market/health`, (res) => {
    if (res.statusCode === 200) {
      console.log('[Electron] Backend is healthy and ready!');
      callback();
    } else {
      setTimeout(() => waitForBackend(callback, retries - 1), 500);
    }
  }).on('error', () => {
    setTimeout(() => waitForBackend(callback, retries - 1), 500);
  });
}

function createWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, 'icons', 'icon.ico')
    : path.join(__dirname, 'icons', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b0f19',
    title: 'NSEpulse - Real-time Market Terminal & Automation Suite',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Open target URL
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    console.log('[Electron] Terminating backend process...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid.toString(), '/f', '/t']);
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('[Electron] Error killing backend process:', e);
    }
    backendProcess = null;
  }
}

app.whenReady().then(() => {
  startBackend();
  waitForBackend(() => {
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('exit', () => {
  stopBackend();
});
