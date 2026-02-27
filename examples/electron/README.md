# Vision Scanner – Electron

A cross-platform **Electron** desktop application for scanning barcodes, QR codes, MRZ (Machine-readable Zones on passports and ID cards), and detecting document boundaries — powered by the [Dynamsoft Capture Vision SDK](https://www.dynamsoft.com/capture-vision/docs/core/introduction/) running client-side in Chromium via WebAssembly.

https://github.com/user-attachments/assets/7db2cf1e-b9b6-423c-bd56-68ca9bd7dbd3

## Features

- **Barcode & QR code scanning** — 1D/2D barcodes from file upload, drag-and-drop, clipboard paste, or live camera
- **MRZ recognition** — Parses ICAO 9303 travel documents (TD1 ID cards, TD2/TD3 passports & visas) and extracts structured fields
- **Document detection & rectification** — Detects document boundaries; supports interactive corner-point dragging before perspective correction and export
- **Multi-camera support** — Switch between connected cameras at runtime
- **Flexible input** — File picker, drag-and-drop, and clipboard paste (`Ctrl+V`)
- **Cross-platform** — Packages to a Windows NSIS installer, macOS DMG, or Linux AppImage via `electron-builder`

## Prerequisites

- **Node.js 18+** and **npm 9+**
- A [Dynamsoft license key](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform) (a free 30-day trial is available)

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Launch the app
npm start
```

The application window opens directly — no browser required.

## Usage

1. **Activate the SDK** – Enter your Dynamsoft license key and click **Activate**. A free trial key is pre-filled.
2. **Choose an input source** – Select **File** (upload / drag-and-drop / paste) or **Camera** (live stream).
3. **Choose a scan mode** – **Barcode**, **MRZ**, or **Document**.
4. **View results** – Detection results appear in the text area; document scans open the editor modal.


## Available Scripts

| Script | Description |
|---|---|
| `npm start` | Launch the app in default mode |
| `npm run dev` | Launch with `--enable-logging` for verbose output |
| `npm run pack` | Package without creating an installer (fast iteration) |
| `npm run dist` | Build a distributable installer for the current platform |

## Building Distributables

Build for the current OS:

```bash
npm run dist
```

Build for a specific platform (requires the appropriate OS or cross-compile toolchain):

```bash
npm run dist -- --win    # Windows NSIS installer
npm run dist -- --mac    # macOS DMG
npm run dist -- --linux  # Linux AppImage
```

Output files are placed in `dist/`.

### macOS Code Signing

On macOS, `electron-builder` will attempt to sign the app with your Apple Developer ID. Set the following environment variables before running `npm run dist`:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
```

### macOS Camera Permission

macOS requires a `NSCameraUsageDescription` entry in `Info.plist`. Add it to your `package.json` build config:

```json
"build": {
  "mac": {
    "extendInfo": {
      "NSCameraUsageDescription": "Vision Scanner needs camera access to scan barcodes, MRZ, and documents."
    }
  }
}
```

## Configuration

### Changing the SDK version

Update the CDN URL in `src/index.html`:

```html
<script src="https://cdn.jsdelivr.net/npm/dynamsoft-capture-vision-bundle@X.Y.Z/dist/dcv.bundle.min.js"></script>
```

Also update the allowed CDN origin in `main.js` if the domain changes.

### Self-hosting the SDK (offline / air-gapped)

1. Copy `dcv.bundle.min.js` into `src/`
2. Update the `<script src>` in `src/index.html` to `./dcv.bundle.min.js`
3. Remove `https://cdn.jsdelivr.net` from the CSP in `main.js`

### Custom save location

By default, **Save** uses an `<a download>` anchor, which triggers the OS save dialog pointing to Downloads. For a fixed output path, replace `save()` in `src/renderer.js` with an IPC call:

**renderer.js**
```js
const { ipcRenderer } = require('electron'); // only if nodeIntegration is enabled
// OR send via contextBridge:
window.electronAPI.saveFile(rectifiedImage.src);
```

**main.js**
```js
const { ipcMain, dialog } = require('electron');
const fs = require('fs');

ipcMain.handle('save-file', async (event, dataUrl) => {
  const { filePath } = await dialog.showSaveDialog({ defaultPath: 'document.png' });
  if (filePath) {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  }
});
```

## Blog
[How to Build a Desktop Barcode, MRZ & Document Scanner with Electron and JavaScript](https://www.dynamsoft.com/codepool/electron-barcode-mrz-document-scanner.html)
