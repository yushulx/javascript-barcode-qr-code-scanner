# Vision Scanner – React

A production-ready **React + Vite** web application for scanning barcodes, QR codes, MRZ (Machine-readable Zones on passports and ID cards), and detecting document boundaries — all powered by the [Dynamsoft Capture Vision SDK](https://www.dynamsoft.com/capture-vision/docs/core/introduction/) running entirely in the browser via WebAssembly.

![React barcode, MRZ, and document scanner](https://www.dynamsoft.com/codepool/img/2026/02/react-barcode-mrz-document-scanner.png)

## Features

- **Barcode & QR code scanning** — 1D/2D barcodes from file upload, drag-and-drop, clipboard paste, or live camera
- **MRZ recognition** — Parses ICAO 9303 travel documents (TD1 ID cards, TD2/TD3 passports & visas) and extracts structured fields
- **Document detection & rectification** — Detects document boundaries with a live quad overlay; supports interactive corner-point adjustment before perspective correction
- **Multi-camera support** — Switch between connected cameras at runtime
- **Flexible input** — File picker, drag-and-drop, and clipboard paste (`Ctrl+V`)

## Prerequisites

- **Node.js 18+** and **npm 9+**
- A modern browser with WebAssembly and `getUserMedia` support (Chrome, Edge, Firefox)
- A [Dynamsoft license key](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform) (a free 30-day trial is available)

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Camera access:** Chrome requires a secure context (`https://` or `localhost`) for `getUserMedia`. The Vite dev server on `localhost` satisfies this automatically. For LAN testing on a mobile device, enable HTTPS in `vite.config.js`:
>
> ```js
> server: { https: true }
> ```

## Usage

1. **Activate the SDK** – Enter your Dynamsoft license key and click **Activate**. A free trial key is pre-filled.
2. **Choose an input source** – Select **File** (upload / drag-and-drop / paste) or **Camera** (live stream).
3. **Choose a scan mode** – **Barcode**, **MRZ**, or **Document**.
4. **View results** – Detection results appear in the text area; document scans open the editor.


## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite development server with HMR |
| `npm run build` | Build optimised production bundle → `dist/` |
| `npm run preview` | Serve the production build locally |

