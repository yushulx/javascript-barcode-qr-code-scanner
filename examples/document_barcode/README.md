# Auto Document Scanner

A purpose-built web application for automatic document detection, cropping, and barcode extraction. Designed for high-volume document processing workflows.

https://github.com/user-attachments/assets/54aa1d95-3f7b-43dc-a688-f05099ba3962


## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/document_barcode/

## Features

- **Auto-Scan Mode**: Automatically detects when a document is stable and captures it hands-free.
- **Manual Capture**: Tap the shutter button at any time to capture immediately.
- **Document Cropping**: Automatically straightens and crops the detected document.
- **Barcode Extraction**: Scans the cropped document for barcodes and displays results.
- **Mobile-Optimized**: Full-screen camera view designed for mobile and tablet use.

## How It Works

### Auto-Scan Mode (Default)
1. Point camera at a document
2. Hold steady - the app tracks stability
3. When stable for ~1 second, it automatically:
   - Captures the frame
   - Crops/straightens the document
   - Reads any barcodes
4. View results and tap "Save & Next" to continue

### Manual Mode
1. Toggle off "Auto" in the control bar
2. Point camera at document
3. Tap the shutter button when ready
4. View results

## Technology

Built with **Dynamsoft Capture Vision Bundle v3.2.5000**:
- **Document Normalizer (DDN)**: Document boundary detection and perspective correction
- **Barcode Reader (DBR)**: 1D/2D barcode recognition

## Quick Start

1. Open `index.html` in a web browser (requires HTTPS for camera access)
2. Allow camera permissions when prompted
3. Start scanning documents

## License

The included trial license key is for evaluation purposes. A **30-day free trial** is available at:  
https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform
