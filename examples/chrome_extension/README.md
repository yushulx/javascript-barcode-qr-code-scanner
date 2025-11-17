# FREE Barcode & QR Code Scanner - Chrome Extension

A powerful **FREE** Chrome extension for scanning barcodes and QR codes from your camera, images, and PDF files using the open-source ZXing-WASM library. **100% FREE, no login required, no license needed, fully open-source.**

https://github.com/user-attachments/assets/838d1fd8-862b-4882-b8c4-a8bc14657b05

## Features

✅ **Camera Scanning** - Real-time barcode detection using your device camera with live overlay annotations  
✅ **Screenshot Capture** - Select and scan any area on your screen with drag-to-select  
✅ **Image Upload** - Scan barcodes from PNG, JPEG images  
✅ **Drag & Drop** - Simply drag images or PDFs into the side panel  
✅ **Context Menu** - Right-click on any image to scan barcodes directly  
✅ **PDF Support** - Multi-page PDF barcode scanning with page navigation and visual annotations  
✅ **Multiple Formats** - Supports QR Code, Code 128, Code 39, EAN, UPC, and more  
✅ **💯 100% FREE FOREVER** - No license required, no login needed, no trials, no hidden costs  
✅ **Side Panel UI** - Modern, responsive interface that doesn't interrupt browsing  
✅ **Settings** - Customizable options with floating icon toggle  
✅ **Privacy-First** - All processing happens locally in your browser  

## FREE Installation - No Payment Required
- [Edge extension](https://microsoftedge.microsoft.com/addons/detail/barcode-qr-code-scanner/lddfadanimbaiceehkfdngafclpodldj)

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension folder
6. The extension icon will appear in your toolbar

## Usage

### Getting Started

1. **Click the extension icon** in your Chrome toolbar to open the side panel - **NO LOGIN REQUIRED**
2. **Start scanning immediately - 100% FREE** - Choose your scanning method:
   - **📷 Camera** - Opens camera scanner in a new tab with live barcode overlay
   - **📁 Upload** - Select images or PDF files from your computer
   - **✂️ Screenshot** - Capture and scan any area on your screen
   - **Drag & Drop** - Drag images/PDFs directly into the drop zone
   - **Right-Click** - Right-click any image on a webpage and select "Scan barcode from image"

### Camera Scanning

1. Click **📷** button in the side panel
2. Allow camera permissions when prompted
3. Point your camera at a barcode
4. **Green boxes** appear around detected barcodes in real-time
5. Results appear automatically with timestamp and format
6. Click **"Close"** when finished

### Screenshot Capture

1. Click **✂️** button in the side panel
2. Your cursor changes to a green crosshair
3. **Click and drag** to select the area containing the barcode
4. Release to capture - the selected area is automatically scanned
5. Results appear in the side panel

### File Upload

1. Click **📁** button or drag files into the drop zone
2. Select an image (PNG/JPEG) or PDF file
3. **Green boxes and labels** appear around detected barcodes on the image
4. For PDFs with multiple pages:
   - Use **Previous/Next** buttons to navigate pages
   - View barcode count for current page
   - Visual annotations update for each page
5. Results show all detected barcodes with format information

### Drag & Drop

1. Drag any image or PDF file from your computer
2. Drop it into the side panel's drop zone
3. Automatic scanning begins immediately
4. Supported formats: PNG, JPEG, GIF, BMP, PDF

### Context Menu (Right-Click)

1. Right-click on any image on a webpage
2. Select **"Scan barcode from image"**
3. Side panel opens automatically with results
4. Works on most web images

### Settings

1. Click **⚙️** icon in the right sidebar
2. Toggle **Floating Icon** - Show/hide a draggable icon on web pages for quick access to the scanner
3. Click **⭐** icon to visit the ZXing-WASM GitHub repository

## Supported Barcode Formats

- **1D Barcodes**: Code 128, Code 39, Code 93, EAN-8, EAN-13, UPC-A, UPC-E, Interleaved 2 of 5, Industrial 2 of 5, Codabar
- **2D Barcodes**: QR Code, Data Matrix, PDF417, Aztec Code, MaxiCode
- **Postal Codes**: USPS Intelligent Mail, Postnet, Planet, Australia Post, Royal Mail

## FREE & Open-Source Technology Stack

- **Barcode Reader**: [ZXing-WASM](https://github.com/Sec-ant/zxing-wasm) v2.2.3 - open-source WebAssembly barcode scanner
- **PDF Processing**: [PDF.js](https://mozilla.github.io/pdf.js/) v3.11.174 - Mozilla's PDF rendering library
- **Chrome APIs**: Side Panel API, Content Scripts, Background Service Worker 
- **Architecture**: Chrome Extension Manifest V3, ES6 Modules 

## Supported Barcode Formats 

- **1D Barcodes**: Code 128, Code 39, Code 93, EAN-8, EAN-13, UPC-A, UPC-E, ITF, Codabar
- **2D Barcodes**: QR Code, Data Matrix, PDF417, Aztec Code
- And more formats supported by ZXing

## Privacy & Security 

- **💯 100% FREE**: No hidden costs, no subscriptions, no trials that expire
- **100% Local Processing**: All barcode scanning is performed locally in your browser - no data is sent to external servers
- **No Authentication Required**: No login, no account creation, no tracking - **completely FREE**
- **Open Source**: Full source code available for review 
- **Camera Access**: Only when explicitly requested by user
- **Screenshot Permissions**: Only captures when you click the screenshot button
- **Context Menu**: Only processes images you right-click on
- **No External Dependencies**: All libraries bundled locally for offline use

## Browser Compatibility

- **Chrome**: Version 114+ (Side Panel API required)
- **Edge**: Version 114+ (Chromium-based with Side Panel support)

## Credits

- **Barcode Library**: [ZXing-WASM](https://github.com/Sec-ant/zxing-wasm) by Sec-ant (Apache 2.0 License)
- **PDF Processing**: [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla (Apache 2.0 License)

**Feel free to use, modify, and distribute this extension.**

