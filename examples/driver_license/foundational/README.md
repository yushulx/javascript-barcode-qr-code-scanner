# Driver License PDF417 Scanner

A modern, responsive web application for scanning and extracting information from driver license **PDF417** barcodes using the [Dynamsoft Barcode Reader SDK](https://www.npmjs.com/package/dynamsoft-barcode-reader-bundle).

## Prerequisites
- Obtain a [30-day Free Trial License](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform) for Dynamsoft Barcode Reader

## Features

- **PDF417 Barcode Recognition**: Specifically optimized for driver license barcodes
- **Dual Scan Modes with Modern Toggle**: 
  - **📹 Camera Mode**: Real-time video scanning with live camera feed
  - **🖼️ Image Mode**: Single frame capture and file upload support
  - **Seamless Switching**: Beautiful toggle switch to change modes instantly
- **Multi-Standard Support**:
  - AAMVA DL/ID (US/Canada standard)
  - AAMVA DL/ID with Magnetic Stripe
  - South Africa Driver License
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Modern UI**: Clean, intuitive interface with smooth animations and mode indicators

## Live Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/driver_license/foundational/

## How It Works

1. **Choose Your Mode**: Use the toggle switch to select between Camera or Image mode
   - **Camera Mode** (📹): Real-time scanning using your device's camera
   - **Image Mode** (🖼️): Upload or capture a single high-quality image
2. **Start Scanning**: Click the camera icon to begin
3. **Aim Camera** (Camera Mode): Point your device's camera at the PDF417 barcode on a driver license
4. **Upload Image** (Image Mode): Select or capture an image containing the barcode
5. **Automatic Detection**: The scanner will automatically detect and process the barcode
6. **View Results**: Extracted information is displayed in a clean, organized format

### Mode Switching
- **Instant Toggle**: Switch between modes anytime using the beautiful toggle switch
- **Smart UI**: Interface adapts automatically to show relevant instructions
- **No Restart Required**: Change modes on-the-fly without restarting the scanner
- **Clean Interface**: No more popup messages - everything is accessible through the main toggle

## Supported Driver License Types

### AAMVA DL/ID (US/Canada)
- Standard driver licenses and identification cards
- Extracts personal information, license details, and restrictions

### AAMVA DL/ID with Magnetic Stripe
- Driver licenses with additional magnetic stripe data
- Enhanced information extraction from both barcode and stripe

### South Africa Driver License
- South African driver license format
- Region-specific field extraction



## Custom License
Replace the license key in the JavaScript code:
```javascript
Dynamsoft.License.LicenseManager.initLicense("YOUR_LICENSE_KEY_HERE");
```

## Local Development
For local development with HTTPS (required for camera access):

```bash
# Using Python
python -m http.server 8000 --bind 127.0.0.1

# Using Node.js
npx http-server -p 8000
```

