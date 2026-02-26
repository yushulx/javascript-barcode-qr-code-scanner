/**
 * Electron Main Process
 *
 * Responsibilities:
 *  - Create the BrowserWindow (renderer)
 *  - Grant camera / microphone permissions so Dynamsoft DCE can open webcams
 *  - Expose a minimal context-bridge API via preload.js
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Vision Scanner',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,   // Keep renderer sandboxed
      contextIsolation: true,   // Required for contextBridge
      webSecurity: true,
    },
  });

  // ── Allow camera & microphone (needed by Dynamsoft Camera Enhancer) ──────────
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = ['media', 'camera', 'microphone'];
      callback(allowedPermissions.includes(permission));
    }
  );

  // ── Relax CSP so the Dynamsoft CDN bundle and WASM files can load ─────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: " +
            'https://cdn.jsdelivr.net https://*.dynamsoft.com;' +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: " +
            'https://cdn.jsdelivr.net https://*.dynamsoft.com;' +
            "worker-src 'self' blob:;' +",
        ],
      },
    });
  });

  // Load the renderer page
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Uncomment to open DevTools during development:
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
