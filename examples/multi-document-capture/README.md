# Web Document Scanner

A browser-based document scanning application powered by the **Dynamsoft Capture Vision JS SDK**. No backend required — runs entirely in the browser.

https://github.com/user-attachments/assets/5a9a9a9d-df9e-4422-886a-eb52105e4b9b

## Features

- **License Activation**: Enter your Dynamsoft license key on the start screen (or use the built-in trial key).
- **Auto & Manual Capture**: Quad stabilization detects stable document boundaries and auto-captures, or tap to capture manually. Falls back to the raw frame if no document is detected within 500 ms.
- **Configurable Stabilization**: Adjust IoU threshold, area-delta threshold, stable frame count, and toggle auto-capture via the in-app settings panel.
- **Gallery Import**: Load images from your device for document detection and normalization (EXIF orientation is preserved).
- **Multi-Page Scanning**: Capture multiple pages in a single session with a thumbnail preview bar.
- **Edit Quad**: Drag the four document-boundary corners on the original image, then apply perspective correction.
- **Retake**: Recapture the current page in-place.
- **Image Filters**: Apply Color, Grayscale, or Binary filters per page.
- **Rotate**: Rotate pages by 90 degrees.
- **Drag-and-Drop Reorder**: Sort captured pages by dragging (mouse or touch).
- **PDF Export**: Save all pages as a multi-page PDF (opens in a new tab).
- **Image Export**: Download each page as a PNG file.
- **Touch & Mouse**: All controls work with both pointer types.

## Prerequisites

- A modern browser with camera access (Chrome, Edge, Safari, Firefox).
- A Dynamsoft Capture Vision license key. Get a free trial at the [Dynamsoft Customer Portal](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Getting Started

1. Serve the folder with any static HTTP server:

   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .
   ```

2. Open `http://localhost:8000` in your browser.
3. Enter your license key (or leave blank for the default trial key) and click **Start Scanner**.

> **Note:** Camera access requires HTTPS in production. For local development, `localhost` is fine.

## File Structure

| File | Description |
|------|-------------|
| `index.html` | App markup — license screen, scanner, result viewer, sort/edit overlays |
| `styles.css` | Dark-themed responsive CSS |
| `app.js` | All application logic (scanner, stabilizer, filters, edit, sort, export) |
| `DBR_and_DDN_detect_PresetTemplates.json` | Dynamsoft capture templates |

## Dependencies (loaded via CDN)

- [Dynamsoft Capture Vision Bundle v3.2.5000](https://cdn.jsdelivr.net/npm/dynamsoft-capture-vision-bundle@3.2.5000/)
- [jsPDF v2.5.1](https://cdn.jsdelivr.net/npm/jspdf@2.5.1/)
