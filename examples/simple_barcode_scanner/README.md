# Barcode Scanner in JavaScript
A modern web application that scans **1D/2D barcodes** within a web browser. This implementation features **dual SDK support**: use **ZXing (free, open-source)** or **Dynamsoft Capture Vision (commercial, high-performance)**. The app uses the native `getUserMedia` API for camera access and features a clean, responsive user interface.

## Features
- 🆓 **Free barcode scanning** with ZXing WASM (no license required)
- ⚡ **High-performance option** with Dynamsoft Capture Vision
- 📷 **Real-time barcode scanning** using native browser camera access
- 🎯 **Visual feedback** with bounding box overlay on detected barcodes
- 📱 **Responsive design** that works on desktop and mobile devices
- 🎨 **Modern UI** with gradient theme and smooth animations
- 📁 **File upload support** for scanning barcodes from images
- 🔄 **Multiple camera support** with device selection
- 🔀 **SDK switching** - choose between ZXing (free) or Dynamsoft (commercial)

## SDK Options

### ZXing WASM (Default - Free)
- **No license required** - ready to use immediately
- Open-source barcode scanning library
- Supports common 1D and 2D barcode formats

### Dynamsoft Capture Vision (Optional)
- **High-performance** barcode recognition
- Advanced algorithms for difficult barcodes
- Obtain a [30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)

## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/simple_barcode_scanner/

## How to Run

```bash
python -m http.server
```

Open your web browser and navigate to http://localhost:8000 to access the application.
