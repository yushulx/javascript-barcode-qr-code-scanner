# Barcode Scanner in JavaScript

A modern web application that scans **1D/2D barcodes** in the browser, powered by the
[Dynamsoft Barcode Reader](https://www.dynamsoft.com/barcode-reader/overview/) JavaScript SDK
(`dynamsoft-barcode-reader-bundle@11.6.3200`). Scan from image files, video files, or a live camera
stream — detection starts automatically, no button to press.

## Features

- 🔍 **Dynamsoft Barcode Reader SDK** — high-performance 1D/2D barcode recognition (version `11.6.3200`)
- 📷 **Real-time camera scanning** using native browser camera access
- 🎬 **Video file scanning** — upload MP4/WebM/MOV and every frame is scanned automatically
- 📁 **Image file scanning** — upload one or many JPG/PNG/GIF images and scan instantly
- 🎯 **Visual feedback** — bounding box overlay drawn on every detected barcode
- 📋 **Clipboard paste support** — paste images straight from the clipboard
- 🔄 **Multiple camera support** with device selection
- ⚙️ **Custom scan templates** — load your own Dynamsoft JSON template to tune the algorithm
- 📊 **Benchmark mode** — measure detection count and speed across an image set
- 🎯 **Ground truth scoring** — import `annotations.json` to compute detection rate and precision
- 📤 **Exportable reports** — save benchmark results as a standalone HTML file
- 📱 **Responsive design** that works on desktop and mobile
- 🎨 **Modern UI** with gradient theme and smooth animations

## Getting a License

Dynamsoft Barcode Reader requires a license key. The demo ships with a public trial key, but it may
expire or hit a quota — get your own
[30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)
and paste it into **Settings → Dynamsoft Barcode Reader → Activate**.

**Activation is always manual:** the SDK is never initialized on page load. Open **Settings** (the ⚙
button), fill in your license key and click **Activate**. The badge next to *Dynamsoft Barcode
Reader* shows `Not Activated` until you do.

The key you enter is cached in `localStorage` and pre-filled next time, so you only have to click
**Activate**. Pasting a different key re-enables the button, so you can switch licenses at any time.

> **Temporary license notice:** the bundled public key resolves to a 24-hour temporary license, and
> Dynamsoft displays a full-screen notice on top of the page. Click the **×** on that notice to
> dismiss it and start scanning — or paste your own 30-day trial license in Settings, in which case
> the notice never appears.

## Scan Modes

### 📁 File (Image / Video)

Select or drag-and-drop a file. Images (JPG, PNG, GIF — multiple supported, with prev/next
navigation) are scanned instantly. Videos (MP4, WebM, MOV) are played back and each frame is scanned
automatically, appending results as new barcodes are detected.

### 📹 Live Camera

Pick your camera and scanning starts automatically. Detected barcodes appear in real time with
bounding box overlays.

## Benchmark Mode

Switch the **Mode** toggle to *Benchmark*, load one or more images, then click **Run Benchmark**.
The app reports barcodes found, unique barcodes, total and per-image time for the whole set.

Optionally import a ground truth file (`annotations.json`) to score accuracy:

```json
{
  "images": [
    {
      "file": "sample1.jpg",
      "barcodes": [{ "text": "9781234567897", "format": "EAN_13" }]
    }
  ]
}
```

Results can be exported as a standalone HTML report.

## Getting a Dataset

**Ground truth is optional.** Any set of images works for benchmarking — you will still get barcodes
found and per-image timing. Importing an `annotations.json` only adds the accuracy columns
(detection rate and precision).

### A ready-made dataset with ground truth

[Dynamsoft challenging-images](https://github.com/Dynamsoft/datasets-from-dynamsoft/tree/main/challenging-images)
ships images **and** their ground truth, and its `annotations.json` already matches the format above
— no conversion needed:

| | |
| --- | --- |
| Images | 68 challenging photos (blur, low light, distortion, dense multi-code sheets…) |
| Barcodes | 514 annotated barcodes |
| Format | `barcode-benchmark/1.0` (file name + text + format + corner points) |

Usage:

1. Download the `challenging-images` folder from that repo (or `git clone` it).
2. In the app switch to **Benchmark** mode and upload the images (multi-select works).
3. Click **📄 Import annotations.json** and pick the `annotations.json` from the dataset.
4. Click **Run Benchmark** — you get per-image found/expected counts, detection rate, precision and
   timing.

Image file names must match the `file` entries in the annotations (they do, out of the box). If you
use your own images, keep the same JSON shape and name the files accordingly.

## Custom Scan Template

In **Settings**, use **Load Template File** to import a Dynamsoft JSON template
(`ReadBarcodes_Default` is used by default). The template is applied to image, video, camera, and
benchmark scanning, and can be reset with the ✕ button.

## Online Demo

https://yushulx.me/javascript-barcode-qr-code-scanner/examples/barcode-scanner/

## How to Run

The app uses ES module-free plain scripts and loads the SDK from jsDelivr, so any static server works:

```bash
python -m http.server
```

Then open http://localhost:8000 in your browser.

> Camera access requires a secure context — use `https://` or `http://localhost`.

## Files

| File | Description |
| --- | --- |
| `index.html` | Page structure and SDK script tag |
| `main.js` | Scanning logic, camera handling, benchmark, ground truth |
| `styles.css` | UI styles |
| `utils.js` | Small UI helpers |
| `default.png` | Placeholder preview image |
