# Scan Barcode, Document and Machine-readable Zone (MRZ) in JavaScript
The sample demonstrates how to use Dynamsoft Capture Vision to scan **1D/2D barcodes**, **document** and **machine-readable zone (MRZ)** within a web browser with a modern, responsive UI.

https://github.com/user-attachments/assets/e205a602-b838-46fa-ac8e-45a009e64ae0

## Prerequisites
- Obtain a [30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform) for Dynamsoft Capture Vision.

## Usage

1. **Activate SDK**: Enter your license key and click "Activate"
2. **Select Input Source**: Choose between File (upload) or Camera (live scan)
3. **Choose Scan Mode**: Select Barcode, MRZ, or Document
4. **Scanning**:
   - **File Mode**: Upload or drag & drop an image
   - **Camera Mode**: Scanning starts automatically
5. **Document Mode**: 
   - Click "📸 Capture Document" to capture
   - Use the modal editor to adjust corners
   - Click "🔄 Rectify" to process
   - Click "💾 Save" to download (appears after rectification)

## Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/barcode_mrz_document

## Technical Details

### Scan Modes
- **Barcode**: Detects 1D and 2D barcodes including QR codes
- **MRZ**: Reads machine-readable zones from passports and IDs
- **Document**: Detects document boundaries and supports perspective correction

### Document Editor Features
- Interactive corner point adjustment
- Real-time preview
- Perspective correction (rectification)
- Automatic filename generation with timestamps

## Blog
- [How to Build a Web App to Scan Barcode, Document, and MRZ with JavaScript APIs](https://www.dynamsoft.com/codepool/javascript-scan-barcode-mrz-document.html)



