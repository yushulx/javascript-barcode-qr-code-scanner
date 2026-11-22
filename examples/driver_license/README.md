# Driver License PDF417 Scanner

A modern, responsive web application that scans and extracts information from driver license **PDF417** barcodes using the [Dynamsoft Barcode Reader SDK](https://www.npmjs.com/package/dynamsoft-barcode-reader-bundle).

## Features

- **PDF417 Barcode Recognition**: Optimized for the barcode found on driver licenses
- **Dual Scan Modes with Modern Toggle**:
  - **Camera Mode**: Real-time video scanning with a live camera feed (mobile and desktop)
  - **Image Mode**: Single frame capture with file upload / gallery picking
  - **Seamless Switching**: Toggle between modes without reloading the page
- **Structured Data Extraction**: Parses the raw barcode payload into named fields
- **Multi-Standard Support**:
  - AAMVA DL/ID (US / Canada standard)
  - AAMVA DL/ID with Magnetic Stripe
  - South Africa Driver License
- **Responsive Design**: Adapts to desktop, tablet, and mobile browsers — including safe-area
  insets on iOS, dynamic viewport height (`100dvh`) so mobile browser chrome does not clip the
  camera, and a bottom-sheet layout for scan results on phones
- **Modern UI**: Clean, intuitive interface with smooth animations and mode indicators

## Project Structure

```
driver_license/
├── index.html    # Single-file scanner: UI + PDF417 scanning + AAMVA parsing
├── style.css     # Responsive styling (desktop / tablet / mobile)
├── 1.jpg         # Sample driver license image (front)
├── 2.jpg         # Sample driver license image (back)
└── README.md
```

## Prerequisites

- A modern web browser (Chrome, Edge, Firefox, or Safari)
- A [Dynamsoft License Key](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)
- Camera access requires a **secure context** (HTTPS or `http://localhost`)

## Quick Start

1. Serve the folder over HTTP (opening `index.html` from `file://` blocks camera access):

   ```bash
   # Python
   python -m http.server 8000

   # Node.js
   npx http-server -p 8000
   ```

2. Open `http://localhost:8000/` in a browser.
3. Paste your license key and click **Initialize Scanner** — or click **Use Trial License** to
   start with the SDK's public 24-hour trial key.
4. Allow camera permission, then point the camera at the PDF417 barcode on a driver license.
   Switch the toggle to **Upload** to scan a still image instead (try `1.jpg` / `2.jpg`).
5. The parsed fields are shown in an overlay. Close it to resume scanning.

## How It Works

```html
<script src="https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@11.6.3200/dist/dbr.bundle.js"></script>
```

The bundle ships every component the sample needs:

| Component | Purpose |
|---|---|
| `CaptureVisionRouter` | Core engine that routes frames to the decoder |
| `CameraEnhancer` / `CameraView` | Camera lifecycle + built-in camera UI |
| `CodeParser` | Turns raw PDF417 bytes into named AAMVA fields |
| `LicenseManager` | Activates the SDK with your license key |

Initialization order matters — the license must be activated **before** any component is created:

```js
await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);
await Dynamsoft.Core.CoreModule.loadWasm(["DBR", "DCP"]);
await Dynamsoft.DCP.CodeParserModule.loadSpec("AAMVA_DL_ID");
await Dynamsoft.DCP.CodeParserModule.loadSpec("AAMVA_DL_ID_WITH_MAG_STRIPE");
await Dynamsoft.DCP.CodeParserModule.loadSpec("SOUTH_AFRICA_DL");
```

The scanner then restricts decoding to PDF417 and parses the payload:

```js
const settings = await cvRouter.getSimplifiedSettings("ReadDenseBarcodes");
settings.barcodeSettings.barcodeFormatIds = Dynamsoft.DBR.EnumBarcodeFormat.BF_PDF417;
await cvRouter.updateSettings("ReadDenseBarcodes", settings);
```

## Supported Driver License Types

| Type | Spec | Notes |
|---|---|---|
| AAMVA DL/ID | `AAMVA_DL_ID` | US / Canada driver licenses and ID cards |
| AAMVA DL/ID + Magnetic Stripe | `AAMVA_DL_ID_WITH_MAG_STRIPE` | Adds data read from the magnetic stripe |
| South Africa Driver License | `SOUTH_AFRICA_DL` | Region-specific field layout |

## Local Development

Camera access needs HTTPS or `localhost`:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Then open `http://localhost:8000/` — `localhost` is treated as a secure context, so the camera
works without a certificate. To test on a phone over the LAN you need HTTPS, so put a
self-signed certificate in front of the static server or use a tunnelling tool.

## Live Demo

[codepool/demos/driver-license](https://www.dynamsoft.com/codepool/demos/driver-license/)

## Blog

[JavaScript Driver's License Barcode Scanner: Read PDF417 and Parse AAMVA ID Data in the Browser](https://www.dynamsoft.com/codepool/javascript-driver-license-pdf417-scanner-web.html)
