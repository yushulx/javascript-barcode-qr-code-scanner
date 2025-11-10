# Barcode & QR Code Scanner - Chrome Extension

A powerful Chrome extension for scanning barcodes and QR codes from your camera, images, and PDF files using Dynamsoft's advanced barcode recognition technology.

## Features

✅ **Camera Scanning** - Real-time barcode detection using your device camera  
✅ **Image Upload** - Scan barcodes from PNG, JPEG images
✅ **PDF Support** - Multi-page PDF barcode scanning with page navigation  
✅ **Multiple Formats** - Supports QR Code, Code 128, Code 39, EAN, UPC, and more  
✅ **30-Day Trial** - Free trial license via Google OAuth login  
✅ **Modern UI** - Clean, responsive interface with gradient design  

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension folder
6. The extension icon will appear in your toolbar

## Usage

### Getting Started

1. **Click the extension icon** in your Chrome toolbar
2. **Login with Google** to get a free 30-day trial license
3. Choose your scanning method:
   - **📷 Scan** - Opens camera scanner in a new tab
   - **📁 Upload File** - Scan images or PDF files

### Camera Scanning

1. Click **"📷 Scan"** button
2. Allow camera permissions when prompted
3. Point your camera at a barcode
4. Results appear automatically in the results panel
5. Click **"Close"** when finished

### File Upload

1. Click **"📁 Upload File"** button
2. Select an image (PNG/JPEG) or PDF file
3. For PDFs with multiple pages:
   - Use **Previous/Next** buttons to navigate pages
   - View results for each page separately
4. Results show all detected barcodes with format information

## Supported Barcode Formats

- **1D Barcodes**: Code 128, Code 39, Code 93, EAN-8, EAN-13, UPC-A, UPC-E, Interleaved 2 of 5, Industrial 2 of 5, Codabar
- **2D Barcodes**: QR Code, Data Matrix, PDF417, Aztec Code, MaxiCode
- **Postal Codes**: USPS Intelligent Mail, Postnet, Planet, Australia Post, Royal Mail

## License

### Trial License (Free)
- **30 days** of full functionality
- Obtained automatically via Google OAuth login
- No credit card required

### Commercial License
When your trial expires:
1. Visit [Dynamsoft Purchase Center](https://www.dynamsoft.com/purchase-center/)
2. Choose a plan that fits your needs
3. The extension will prompt you to purchase when needed

## Technical Details

### Architecture
- **Manifest Version**: 3
- **SDK**: Dynamsoft Barcode Reader Bundle
- **Permissions**: Storage, Cookies, Tab creation
- **CSP**: WebAssembly support enabled

### Files Structure
```
chrome_extension/
├── manifest.json          # Extension configuration
├── index.html            # Popup interface
├── scanner.html          # Camera scanner page
├── app.js               # Popup logic
├── scanner.js           # Camera scanner logic
├── background.js        # Service worker (handles CORS)
├── main.css            # Popup styles
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── libs/               # Dynamsoft SDK libraries
    ├── dynamsoft-barcode-reader-bundle/
    └── dynamsoft-document-viewer/
```

### Privacy & Security
- **No data collection**: Barcode scanning is performed locally in your browser
- **Secure authentication**: Uses Google OAuth for trial license activation
- **CORS handled**: Background service worker manages API calls securely
- **Camera access**: Only when explicitly requested by user

## Browser Compatibility

- **Chrome**: Version 88+ (Manifest V3 required)
- **Edge**: Version 88+ (Chromium-based)
- **Opera**: Version 74+
- **Brave**: Latest version

## Credits

- **SDK Provider**: [Dynamsoft](https://www.dynamsoft.com/)
- **Barcode Reader**: Dynamsoft Barcode Reader Bundle
- **Document Viewer**: Dynamsoft Document Viewer (for PDF processing)


## License Agreement

This extension uses Dynamsoft SDKs which require a valid license:
- Trial: 30 days free via Google login
- Commercial: Purchase from [Dynamsoft](https://www.dynamsoft.com/purchase-center/)

