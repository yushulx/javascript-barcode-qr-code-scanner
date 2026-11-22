# Barcode Scanner in JavaScript

A modern web application that scans **1D/2D barcodes** in the browser, powered by the
[Dynamsoft Barcode Reader](https://www.dynamsoft.com/barcode-reader/overview/) JavaScript SDK
(`dynamsoft-barcode-reader-bundle@11.6.3200`). Scan from image files, multi-page PDF and TIFF
documents, video files, or a live camera stream — detection starts automatically, no button to press.

## Features

- 🔍 **Dynamsoft Barcode Reader SDK** — high-performance 1D/2D barcode recognition (version `11.6.3200`)
- 📷 **Real-time camera scanning** using native browser camera access
- 🎬 **Video file scanning** — upload MP4/WebM/MOV and every frame is scanned automatically
- 🎥 **Clip recorder** — record the live stream with RecordRTC, then replay the clip through the
  same video decoder to see what the reader does with the exact frames that failed
- 📁 **Image file scanning** — upload one or many JPG/PNG/GIF/BMP/WebP images and scan instantly
- 📄 **Multi-page PDF and TIFF** — every page is rendered and scanned, with prev/next navigation
- 🎯 **Visual feedback** — bounding box overlay drawn on every detected barcode
- 📋 **Clipboard paste support** — paste images straight from the clipboard
- 🔄 **Multiple camera support** with device selection
- ⚙️ **Custom scan templates** — load your own Dynamsoft JSON template to tune the algorithm
- 📊 **Benchmark mode** — measure detection count and speed across an image set
- 🎯 **Ground truth scoring** — import `annotations.json` to compute recall, precision, symbology
  agreement and box overlap against the expected values
- 🗂️ **Dataset ZIP** — drop an archive exported by the
  [barcode generator](https://www.dynamsoft.com/codepool/demos/barcode-qrcode-generator/) and it loads the images *and* their ground truth
  in one step, including the conditions each image was captured under
- 📤 **Exportable reports** — save benchmark results as a standalone HTML file
- 📱 **Responsive design** that works on desktop and mobile
- 🎨 **Modern UI** with gradient theme and smooth animations

## License

The SDK is activated automatically on page load — there is no license input in
Settings. The key is chosen by hostname: on `dynamsoft.com` (and any subdomain)
the demo uses the Codepool license, which is bound to that domain; on any other
host (localhost, staging, a fork) it falls back to the SDK's public 24-hour
trial key, so the demo still runs. The fallback is logged to the console and
reported as a `license_fallback` event in analytics.

To use your own license, set `CODEPOOL_LICENSE_KEY` in `main.js` to your
[30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Scan Modes

### 📁 File (Image / Video)

Select or drag-and-drop a file. Images (JPG, PNG, GIF, BMP, WebP, TIFF, PDF — multiple supported,
with prev/next navigation) are scanned instantly. Videos (MP4, WebM, MOV) are played back and each
frame is scanned automatically, appending results as new barcodes are detected.

A PDF or TIFF is decoded **page by page**: every page is rasterized, the name and page number are
shown above the preview, and **Prev / Next** step through the pages and rescan each one. Up to 50
pages of a document are loaded.

### 📹 Live Camera

Pick your camera and scanning starts automatically. Detected barcodes appear in real time with
bounding box overlays.

### 🎥 Clip Recorder

Next to the camera selector, **Start recording** captures the live stream with
[RecordRTC](https://recordrtc.org/) (loaded from jsDelivr on first click, so a visitor who never
records never downloads it). While a take is running the button turns red and a timer counts up.

Stop it and the clip appears under the preview with its duration, resolution and file size:

| Action | What it does |
| --- | --- |
| **Scan this clip** | Switches to File mode and replays the recording through the ordinary video decoder — same `CaptureVisionRouter.capture()` per frame, same overlay, same result list as an uploaded MP4 |
| **Download** | Saves the clip as `camera-clip.webm` |
| **Discard** | Drops it and frees the object URL |

The point is diagnosis. A live camera keeps no history: by the time you see a miss, the frame is
gone. Recording first turns that moment into a file you can replay at will, and because the clip
goes through the upload path rather than a special case, it answers exactly one question — does the
reader decode this footage when it is a file? If it does, the live miss was timing; if it does not,
the frames themselves are the problem.

The clip is whatever `MediaRecorder` produces — WebM/VP8 in Chrome and Edge, MP4 in Safari — and a
WebM written that way carries no duration in its header, so the page measures it on load and the
seek bar works. Nothing is uploaded; the recording lives in a blob in the tab until you close it.

## How PDF and TIFF are handled

`CaptureVisionRouter.capture()` accepts a `Blob`, but the SDK rasterizes it with
`createImageBitmap()` / `<img>` — so it can only decode what the browser itself can display. The
web SDK's multi-page entry point, `captureMultiPages()`, takes `application/pdf` only, and browsers
other than Safari cannot decode TIFF at all. The demo therefore rasterizes documents itself:

| Format | Decoder | Notes |
| --- | --- | --- |
| PDF | [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | Rendered at up to 2000 px on the long edge, `isEvalSupported: false` |
| TIFF | [UTIF](https://github.com/photopea/UTIF.js) + [pako](https://github.com/nodeca/pako) | pako is required for Deflate-compressed TIFFs |

Each page then travels the ordinary image path — the same `capture()` call, the same overlay canvas,
the same benchmark code — so a barcode's bounding box lands on the pixels it was found in. Both
decoders load from jsDelivr **on first use**, so a visitor who never opens a document never
downloads them. TIFF compression codes other than raw, G3, G4, LZW, JPEG, Deflate (including
Adobe Deflate, which libtiff-family writers emit), PackBits, Thunder and Nikon are rejected with a
message rather than decoded to noise.

## Benchmark Mode

Switch the **Mode** toggle to *Benchmark*, load one or more images (or a multi-page document), then
click **Run Benchmark**. The app reports barcodes found, unique barcodes, total and per-page time for
the whole set — each page of a PDF or TIFF is measured separately.

Optionally import a ground truth file (`annotations.json`) to score accuracy:

```json
{
  "images": [
    {
      "file": "sample1.jpg",
      "barcodes": [
        { "text": "9781234567897", "format": "EAN_13", "points": [[10,20],[310,20],[310,140],[10,140]] }
      ],
      "degradations": { "blur": 1.2, "rotate": -7 }
    }
  ]
}
```

`text` is what the benchmark matches on. `format` and `points` are optional and add two more
columns. Each row's **Details** cell carries up to three labelled blocks — *Conditions*, *Decoded*,
*Missed* — as single flowing lines capped at six entries with `+N more`; the complete text is in the
element's tooltip, so nothing is lost but nothing is printed by default either. (An uncapped list
next to a conditions dump of eighteen raw key/value pairs made a single row 450 px tall, which
stretched every other column of that row into what read as enormous gaps.)

| Column | Meaning |
| --- | --- |
| **Missed** | expected values that never came back, listed under *Details* so a miss can be acted on |
| **Symbology** | how many correct values came back under the annotated symbology |
| **Box IoU** | how many of those boxes overlap the annotated box (IoU ≥ 0.5), plus the mean |
| **Unmatched decodes** | values that read but matched nothing expected — a wrong read, or a value the annotations do not cover |

Symbology and box overlap are **informational**: a correct value is never downgraded because the
reader named the symbology differently or drew the box elsewhere. The overlap maths is in
`main.js` rather than a shared file, so this page has no cross-directory script that could fail to
load and silently cost the column. `degradations` is shown as the
*Conditions* line of the row, so a miss can be read against the capture conditions that caused it.
Known naming differences are folded together before comparing (`CODE_39_EXTENDED` with `CODE_39`,
`UPC_A` with an `EAN_13` that starts with 0, `MSI` with `MSI_CODE`); anything else is reported.

Results can be exported as a standalone HTML report.

### Ready-made datasets

The barcode generator exports a dataset as a single ZIP — `images/*.png` plus `annotations.json` —
and this page reads that archive directly. Drop the ZIP on the upload zone in Benchmark mode and it
loads every image with its ground truth already attached, then **Run Benchmark** scores the set. No
extraction, no filename matching by hand.

The generator also records, per image, the degradation values that were applied to it, so a hard
image reports why it was hard rather than only that it failed.

## Getting a Dataset

**Ground truth is optional.** Any set of images works for benchmarking — you will still get barcodes
found and per-page timing. Importing an `annotations.json` only adds the accuracy columns
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
4. Click **Run Benchmark** — you get per-image found/expected counts, recall, precision, symbology
   agreement and box overlap, plus timing.

Image file names must match the `file` entries in the annotations (they do, out of the box). If you
use your own images, keep the same JSON shape and name the files accordingly. Ground truth is matched
by the name shown in the results table — a multi-page PDF or TIFF is listed as `report.pdf — page 2
of 3`, so annotate a single-page file (or a single-page document) per entry.

## Custom Scan Template

In **Settings**, use **Load Template File** to import a Dynamsoft JSON template
(`ReadBarcodes_Default` is used by default). The template is applied to image, video, camera, and
benchmark scanning, and can be reset with the ✕ button.

### What the default template does *not* read

The stock `ReadBarcodes_Default` preset enables **32 of the 52 formats** the SDK knows and leaves
`BF_DOTCODE`, both Pharmacode tracks, the postal symbologies and a few others out. DotCode and
Pharmacode are the two that matter here, because the barcode generator produces them: benchmarking a
dataset that contains them would report misses that are not reading failures — the reader was never
asked. On activation the demo adds those three bits on top of the preset through the
simplified-settings API (`getSimplifiedSettings()` → set `barcodeSettings.barcodeFormatIds` →
`updateSettings()`), and re-applies them after any `resetSettings()`.

Measured on bundle 11.6.3200: a clean DotCode and a clean one-track Pharmacode both decode once the
bits are set, and neither decodes with the preset alone. Everything else in the generator's thirteen
symbologies is enabled by the preset already.

> Do not add these bits by hand-writing template JSON. `initSettings()` accepts a hand-rolled
> document and `startCapturing()`/`capture()` then rejects it with
> `[-10038] … BarcodeFormatIds: The parameter value is invalid or out of range`, blaming the format
> list for a fault in the document around it.

## Online Demo

https://yushulx.me/javascript-barcode-qr-code-scanner/examples/barcode-scanner/

The recorder is written up step by step in
[How to Record Video from a Webcam Using WebRTC and RecordRTC in JavaScript](https://www.dynamsoft.com/codepool/record-video-using-webrtc-html5.html).

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
| `main.js` | Scanning logic, camera handling, clip recording, PDF/TIFF rasterization, dataset ZIP, benchmark, ground truth |
| `styles.css` | UI styles |
| `utils.js` | Small UI helpers |
| `default.png` | Placeholder preview image |
