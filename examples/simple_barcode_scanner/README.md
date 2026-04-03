# Barcode Scanner in JavaScript
A modern web application that scans **1D/2D barcodes** within a web browser. This implementation features **multi-SDK support**: use **ZXing (free, open-source)** or choose from four commercial SDKs - **Dynamsoft Capture Vision**, **Strich.io**, **Scanbot**, or **Scandit**. The app supports scanning from image files, video files, and live camera with automatic detection - no manual start/stop required.

## Features
- 🆓 **Free barcode scanning** with ZXing WASM (no license required)
- ⚡ **Multiple commercial SDKs** - Dynamsoft, Strich.io, Scanbot, Scandit
- 📷 **Real-time barcode scanning** using native browser camera access
- 🎬 **Video file scanning** - upload MP4/WebM/MOV and scan frame-by-frame automatically
- 📁 **Image file scanning** - upload JPG/PNG/GIF and scan instantly
- 🎯 **Visual feedback** with bounding box overlay on detected barcodes
- 📱 **Responsive design** that works on desktop and mobile devices
- 🎨 **Modern UI** with gradient theme and smooth animations
- 📋 **Clipboard paste support** - paste images directly from clipboard
- 🔄 **Multiple camera support** with device selection
- 🔀 **SDK switching** - choose between 5 different barcode SDKs
- ▶️ **Auto-detection** - scanning starts automatically, no button to press

## SDK Options

### ZXing WASM (Default - Free)
- **No license required** - ready to use immediately
- Open-source barcode scanning library
- Supports common 1D and 2D barcode formats

### Dynamsoft Capture Vision
- **High-performance** barcode recognition
- Advanced algorithms for difficult barcodes
- Obtain a [30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)

### Strich.io
- Fast JavaScript/WASM barcode scanner optimized for web
- Clean API with easy integration
- Obtain a license from [Strich Portal](https://portal.strich.io)

### Scanbot
- Reliable barcode scanning with WASM engine
- Supports wide range of barcode symbologies
- Obtain a [7-day free trial license](https://scanbot.io/trial/)

### Scandit
- Enterprise-grade barcode scanning with AI-powered features
- Industry-leading scan speed and accuracy
- Obtain a [free trial license](https://www.scandit.com/trial/)

## Scan Modes

### 📁 File (Image / Video)
Select or drag-and-drop a file. Images (JPG, PNG, GIF) are scanned instantly. Videos (MP4, WebM, MOV) are played and each frame is scanned automatically - results are appended as barcodes are detected.

### 📹 Live Camera
Select your camera and scanning starts automatically. Detected barcodes appear in real-time with bounding box overlays.

## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/simple_barcode_scanner/

## How to Run

```bash
python -m http.server
```

Open your web browser and navigate to http://localhost:8000 to access the application.