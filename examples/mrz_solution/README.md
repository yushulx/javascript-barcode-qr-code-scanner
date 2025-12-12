# MRZ & Passport Scanner Web App

A web-based passport and ID document scanner that extracts MRZ (Machine Readable Zone) data, detects faces, and performs OCR on document text.

https://github.com/user-attachments/assets/e93bc52f-6e5b-4f96-97d8-22d203962a1a

## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/mrz_solution/

## Features

- **MRZ Detection & Parsing** - Powered by [Dynamsoft Capture Vision SDK](https://www.dynamsoft.com/capture-vision/docs/web/programming/javascript/)
  - Supports TD1 (ID cards), TD2, and TD3 (passports) formats
  - Extracts: Name, Nationality, Date of Birth, Document Number, Expiry Date, etc.

- **Face Detection** - ONNX-based face detection using Ultra-Light-Fast-Generic-Face-Detector
  - Crops and displays detected face from passport photo

- **OCR (Optical Character Recognition)** - PaddleOCR PP-OCRv4 models
  - Recognizes non-MRZ text on documents
  - Automatically skips MRZ zone (handled by Dynamsoft)


## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- A local HTTP server (required for loading ONNX models)

### Running Locally

<img width="800" alt="Face Detection, MRZ Recognition and OCR Visualization in a Web App" src="https://github.com/user-attachments/assets/8a0369f4-084e-4463-b0a7-b1c0e9236ce0" />


1. Navigate to the web folder:
   ```bash
   cd web
   ```

2. Start a local HTTP server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (if http-server is installed)
   npx http-server -p 8000
   ```

3. Open your browser and go to:
   ```
   http://localhost:8000
   ```

4. Click **"Initialize SDK"** to load all models

5. Use one of these input methods:
   - **📂 Load** - Select an image file
   - **📷 Camera** - Take a photo with webcam
   - **📋 Paste** - Paste from clipboard (Ctrl+V)
   - **Drag & Drop** - Drop an image onto the viewer

## License

The Dynamsoft SDK requires a license key. You can:
- Use the default trial key (included)
- [Get a free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)

