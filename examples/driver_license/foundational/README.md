# Driver License PDF417 Scanner

A modern, responsive web application for scanning and extracting information from driver license **PDF417** barcodes using the [Dynamsoft Barcode Reader SDK](https://www.npmjs.com/package/dynamsoft-barcode-reader-bundle).

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

1. **Set License Key**: Enter your Dynamsoft license key or use the trial license
2. **Choose Your Mode**: Use the toggle switch to select between Camera or Image mode
   - **Camera Mode** (📹): Real-time scanning using your device's camera
   - **Image Mode** (🖼️): Upload or capture a single high-quality image
3. **Start Scanning**: Click the camera icon to begin
4. **Aim Camera** (Camera Mode): Point your device's camera at the PDF417 barcode on a driver license
5. **Upload Image** (Image Mode): Select or capture an image containing the barcode
6. **Automatic Detection**: The scanner will automatically detect and process the barcode
7. **View Results**: Extracted information is displayed in a clean, organized format

### License Setup
- **Trial License**: Click "Use Trial License" for quick testing
- **Custom License**: Enter your own Dynamsoft license key for production use
- **Flexible Configuration**: No need to rebuild the application when license expires

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



## License Configuration

### Getting Started
1. **Trial License**: Click "Use Trial License" for immediate testing
2. **Custom License**: Enter your Dynamsoft license key in the setup interface
3. **No Code Changes**: All license management happens through the UI

### Getting a License Key
- **Free Trial**: Get a trial license at [Dynamsoft Trial License](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)
- **Production**: Purchase a production license for commercial use
- **Flexible Setup**: Change license keys anytime without rebuilding the application

## Local Development
For local development with HTTPS (required for camera access):

```bash
# Using Python
python -m http.server 8000 --bind 127.0.0.1

# Using Node.js
npx http-server -p 8000
```

