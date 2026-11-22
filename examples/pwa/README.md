# Barcode Scanner PWA

A progressive web app (PWA) that scans **1D/2D barcodes and QR codes** in the browser using the latest [Dynamsoft Barcode Reader Bundle](https://www.dynamsoft.com/barcode-reader/sdk-javascript/). It captures from a live camera or from an uploaded image, draws bounding boxes around detected codes, and is installable on desktop and mobile — it works offline after the first load.

## Features
- **Live camera scanning** with an intuitive scan frame and real-time bounding-box overlays
- **Image scanning** — upload, drag & drop, or paste an image to detect barcodes in it
- **Responsive design** that adapts to desktop and mobile layouts
- **Installable PWA** with an app manifest and an offline-capable service worker
- **Torch toggle** on devices whose camera supports it
- **Deduplicated results** with barcode format labels
- Built on the modern **Capture Vision** API (`CaptureVisionRouter`)

## How It Works
The sample loads `dynamsoft-barcode-reader-bundle` from a CDN and drives a `CaptureVisionRouter` instance:

```js
await Dynamsoft.License.LicenseManager.initLicense(LICENSE_KEY, true);
await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
const cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

const result = await cvr.capture(source, 'ReadBarcodes_Default');
// result.items[] -> each barcode has { text, formatString, location.points }
```

## License
Get a [30-day FREE trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform). Set your key in `main.js`:

```js
const LICENSE_KEY = 'YOUR-LICENSE-KEY-HERE';
```

## Usage
1. Set a valid license key in `main.js` (see above).
2. Serve the folder over HTTPS (required for camera access and PWA installation). For example:
   ```bash
   python -m http.server 8080
   ```
   then open `http://localhost:8080`.
3. Open the app in Chrome/Edge (desktop or Android) and install it from the address bar, or tap **Install App** in the header.

## Project Structure
- `index.html` — app shell and UI
- `main.js` — SDK initialization, camera/image scanning, result rendering
- `overlay.js` — canvas overlay renderer for bounding boxes and labels
- `style.css` — modern, responsive styles
- `manifest.json` — web app manifest
- `service-worker.js` — offline app-shell caching

## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/pwa

## Blog
[How to Build a Simple PWA Barcode QR Code Scanner](https://www.dynamsoft.com/codepool/build-simple-pwa-barcode-reader.html)
