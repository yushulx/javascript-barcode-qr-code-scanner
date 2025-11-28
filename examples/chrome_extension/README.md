# Barcode & QR Code Scanner - Chrome Extension

A powerful (free) Chrome extension for scanning barcodes and QR codes from your camera, images, and PDF files. Use the included open-source ZXing-WASM engine for free forever, or switch to Dynamsoft Barcode Reader with your own license key or a trial license.

https://github.com/user-attachments/assets/838d1fd8-862b-4882-b8c4-a8bc14657b05

## Features

✅ **Camera Scanning** - Real-time barcode detection using your device camera  
✅ **Screenshot Capture** - Select and scan any area on your screen with drag-to-select  
✅ **Image Upload** - Scan barcodes from PNG, JPEG images  
✅ **Drag & Drop** - Simply drag images or PDFs into the side panel  
✅ **Context Menu** - Right-click on any image to scan barcodes directly  
✅ **PDF Support** - Multi-page PDF barcode scanning with page navigation  
✅ **Multiple Formats** - Supports QR Code, Code 128, Code 39, EAN, UPC, and more  
✅ **ZXing-WASM (Default)** - 100% free, offline, no login or license required  
✅ **30-Day Trial (Dynamsoft)** - Sign in to obtain a trial license key; required only if you choose the Dynamsoft engine  
✅ **Side Panel UI** - Modern, responsive interface that doesn't interrupt browsing  
✅ **Settings** - Customizable options with floating icon toggle  

## Installation

- [Chrome Web Store](https://chromewebstore.google.com/detail/free-barcode-qr-code-scan/oifbhbnnboafnkjeaglbhknagfjkbhfm?authuser=0&hl=en)
- [Edge Web Store](https://microsoftedge.microsoft.com/addons/detail/free-barcode-qr-code-sc/lddfadanimbaiceehkfdngafclpodldj)

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension folder
6. The extension icon will appear in your toolbar

## Usage

### Getting Started

1. **Click the extension icon** in your Chrome toolbar to open the side panel
2. **Login with Google** to get a free 30-day trial license for the Dynamsoft engine (ZXing requires no login)
3. Choose your scanning method:
   - **📷 Camera** - Opens camera scanner in a new tab
   - **📁 Upload** - Select images or PDF files from your computer
   - **✂️ Screenshot** - Capture and scan any area on your screen
   - **Drag & Drop** - Drag images/PDFs directly into the drop zone
   - **Right-Click** - Right-click any image on a webpage and select "Scan barcode from image"

### Camera Scanning

1. Click **📷** button in the side panel
2. Allow camera permissions when prompted
3. Point your camera at a barcode
4. Results appear automatically
5. Click **"Close"** when finished

### Screenshot Capture

1. Click **✂️** button in the side panel
2. Your cursor changes to a green crosshair
3. **Click and drag** to select the area containing the barcode
4. Release to capture - the selected area is automatically scanned
5. Results appear in the side panel

### File Upload

1. Click **📁** button or drag files into the drop zone
2. Select an image (PNG/JPEG) or PDF file
3. For PDFs with multiple pages:
   - Use **Previous/Next** buttons to navigate pages
   - View summary of all detected barcodes
   - Switch between pages to see individual results
4. Results show all detected barcodes with format information

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
2. Toggle **Floating Icon** - Show/hide a draggable icon on web pages for quick access
3. Click **🛒** icon to purchase a commercial license when trial expires
4. Your profile name appears at the bottom after login

## Supported Barcode Formats

- **1D Barcodes**: Code 128, Code 39, Code 93, EAN-8, EAN-13, UPC-A, UPC-E, Interleaved 2 of 5, Industrial 2 of 5, Codabar
- **2D Barcodes**: QR Code, Data Matrix, PDF417, Aztec Code, MaxiCode
- **Postal Codes**: USPS Intelligent Mail, Postnet, Planet, Australia Post, Royal Mail

## Engines

- **Dynamsoft Barcode Reader**: Commercial-grade accuracy and speed. Requires trial login or license key.
- **ZXing-WASM**: 100% free, open source, no login required. Runs entirely in the browser.

## License

### Trial License (Free)
- [30 days](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform) of full functionality
- Obtained automatically via Google OAuth login
- No credit card required


### Privacy & Security
- **No data collection**: All barcode scanning is performed locally in your browser
- **Secure authentication**: Uses Google OAuth for trial license activation
- **CORS handled**: Background service worker manages API calls securely
- **Camera access**: Only when explicitly requested by user
- **Screenshot permissions**: Only captures when you click the screenshot button
- **Context menu**: Only processes images you right-click on
- **No external uploads**: Images never leave your browser

## Browser Compatibility

- **Chrome**: Version 114+ (Side Panel API required)
- **Edge**: Version 114+ (Chromium-based with Side Panel support)

## Credits

- **SDK Provider**: [Dynamsoft](https://www.dynamsoft.com/)
- **Barcode Reader**: Dynamsoft Barcode Reader Bundle
- **Document Viewer**: Dynamsoft Document Viewer (for PDF processing)
- **Open-Source Engine**: [ZXing-WASM](https://github.com/Sec-ant/zxing-wasm)


