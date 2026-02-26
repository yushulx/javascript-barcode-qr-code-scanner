/**
 * Electron Preload Script
 *
 * Runs in a privileged context before the renderer page loads.
 * Uses contextBridge to safely expose host information to the renderer
 * without granting full Node.js access.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Identify the host OS so the renderer can adjust if needed */
  platform: process.platform,
  /** Electron / Node / Chrome version info */
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
});
