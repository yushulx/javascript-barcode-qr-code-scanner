# Privacy Policy for FREE Barcode & QR Code Scanner

**Last Updated: November 17, 2025**

## Overview

This **100% FREE** Chrome extension provides barcode and QR code scanning functionality using open-source ZXing-WASM technology. We are committed to protecting your privacy with a **zero-data-collection** approach. **No login required, no authentication, no tracking - completely free and private.**

## Data Collection and Usage

### What We Collect

**User Preferences (Local Only)**
- Settings preferences (stored in chrome.storage.local)
- Floating icon visibility preference

**That's It. Nothing Else.**

### What We DON'T Collect

- ❌ **No authentication data**: No login, no OAuth, no cookies
- ❌ **No personal information**: No email, no name, no account data
- ❌ **No image data storage**: Images, PDFs, and screenshots are processed locally and immediately discarded
- ❌ **No barcode results storage**: Scan results are displayed temporarily and never saved or transmitted
- ❌ **No browsing history**: We don't track which pages you visit or images you scan
- ❌ **No analytics or tracking**: No usage statistics, telemetry, or behavioral tracking
- ❌ **No external API calls**: 100% offline processing after installation
- ❌ **No license keys**: Completely free, no trial periods, no expiration

## How the Extension Works

### 100% Local Processing
- **All barcode scanning happens locally** in your browser using FREE open-source ZXing-WASM (WebAssembly)
- Images, PDFs, and screenshots are processed in memory and never uploaded
- Scan results are displayed only in the side panel and immediately discarded when you close it
- **No external servers involved** - works completely offline after installation

### Screenshot Capture
- When you use the screenshot feature, the image is captured locally
- The captured area is processed immediately for barcode detection
- No screenshots are saved to disk or transmitted anywhere

### Camera Access
- Camera access is requested only when you explicitly click the camera button
- Video streams are processed locally in real-time
- No video or images are recorded or transmitted

### File Upload and Drag & Drop
- Files you upload or drag into the extension are processed entirely in your browser
- PDF files are converted to images locally for barcode detection
- No files are uploaded to external servers

### Context Menu (Right-Click)
- When you right-click an image, only that specific image URL is processed
- The image is fetched and scanned locally
- No data about the webpage or your browsing is collected

## Data Storage

### Local Storage
- **chrome.storage.local**: User preferences (floating icon toggle only)
- **No cookies**: No authentication means no cookies
- **No license data**: No trial keys, no expiration dates

All stored data is minimal and remains on your device forever.

### No Cloud Storage
- We do not maintain any cloud servers or databases
- No user data is stored on external servers
- All processing is 100% client-side
- **No internet connection required** after installation

## Permissions Explained

### Required Permissions

**storage**
- Used to save your preferences locally (floating icon setting only)
- Data never leaves your device
- No authentication or license data stored

**activeTab**
- Used to inject screenshot selector when you click the screenshot button
- Only activates on the current tab when you explicitly use the feature
- No background monitoring or automatic access

**tabs**
- Required to open the camera scanner in a new tab
- Used to query the current active tab for screenshot feature
- No tab content or browsing history is accessed

**scripting**
- Used to inject screenshot selection overlay when you use the screenshot feature
- Only executes when you explicitly click the screenshot button
- No automatic or background script injection

**sidePanel**
- Displays the extension UI as a side panel
- Provides better user experience without blocking your view

**contextMenus**
- Adds "Scan barcode from image" option when you right-click images
- Only processes images you explicitly choose to scan

**host_permissions (all_urls)**
- Required to fetch images when you drag-and-drop from web pages or use context menu
- Only activates when you explicitly interact with an image
- No automatic background requests or tracking

## Third-Party Services

### None. Zero. Zilch.

- ✅ **No Commercial Use**: We use FREE open-source ZXing-WASM instead
- ✅ **No Google OAuth**: No login required
- ✅ **No analytics services**: No Google Analytics, etc.
- ✅ **No advertising networks**: Never
- ✅ **No social media trackers**: Never
- ✅ **No third-party scripts or beacons**: Everything is bundled locally
- ✅ **No external API calls**: 100% offline after installation

**Libraries Used (All FREE & Open-Source, Bundled Locally):**
- **ZXing-WASM** v2.2.3 - Apache License 2.0 (barcode detection)
- **PDF.js** v3.11.174 - Apache License 2.0 (PDF rendering)

Both libraries are included in the extension and run entirely in your browser. No data is sent to their developers.

## Data Retention

### Temporary Data
- **Screenshots**: Deleted immediately after scanning
- **Uploaded files**: Processed in memory, never written to disk
- **Scan results**: Cleared when you close the side panel or scan new items

### Persistent Data (Local Only)
- **User preferences**: Floating icon toggle only (stored until you change it or uninstall)
- **No authentication data**: Nothing to expire or clean up
- **No license keys**: Nothing to manage

### Data Deletion
To delete all data:
1. Uninstall the extension from Chrome
2. All chrome.storage data will be automatically removed
3. No cookies to clear (we don't use any)

## Security

### 100% Local Processing
- All barcode recognition happens locally using open-source ZXing-WASM
- No images or scan data leave your browser
- WebAssembly provides near-native performance with sandboxed security

### No External Communication
- **No API calls** to any servers after installation
- **No authentication** means no tokens to steal
- **No cloud services** means no data breaches possible
- Works completely **offline**

### Secure Code
- No eval() or unsafe JavaScript execution
- Content Security Policy enforced (Manifest V3)
- No remote code execution
- No inline scripts
- ES6 modules for code isolation

## Children's Privacy

This extension does not knowingly collect any information from children under 13. The extension is intended for general audiences and does not target children.

## Updates to Privacy Policy

We may update this privacy policy to reflect:
- Changes in data practices
- New features or functionality
- Legal or regulatory requirements

Updates will be posted in the Chrome Web Store listing and in this file. The "Last Updated" date will be revised accordingly.

## Compliance

This extension complies with:
- ✅ Chrome Web Store Developer Program Policies
- ✅ User Data Privacy requirements
- ✅ Manifest V3 specifications
- ✅ Limited Use disclosure requirements
- ✅ GDPR principles (data minimization, purpose limitation)

## Your Rights

You have the right to:
- **Access**: View what data is stored (only preferences in chrome.storage)
- **Delete**: Uninstall the extension to remove all data
- **Privacy**: No login means complete anonymity
- **Control**: Manage permissions in Chrome's extension settings
- **Transparency**: Full source code available on GitHub

## No Sale of Data

We **never** sell, rent, or trade any user data. There is no business model based on data monetization.

## 100% FREE & Open Source

This extension is **completely FREE** and open-source:
- No paid features
- No premium upgrades
- No trials that expire
- No hidden costs
- Full source code available: [GitHub Repository](https://github.com/yushulx/javascript-barcode-qr-code-scanner/tree/main/examples/chrome_extension)

All barcode processing uses FREE open-source libraries:
- **ZXing-WASM** - Apache License 2.0
- **PDF.js** - Apache License 2.0

## Contact

For questions, concerns, or requests regarding this privacy policy:

- **GitHub Issues**: [yushulx/javascript-barcode-qr-code-scanner](https://github.com/yushulx/javascript-barcode-qr-code-scanner)
- **Chrome Web Store Support**: Use the support tab on the extension's store listing

## Acknowledgment

By using this extension, you acknowledge that you have read and understood this Privacy Policy and agree to its terms:
- 100% local processing of images and barcodes
- No external data transmission
- No authentication or personal data collection
- Minimal local storage (preferences only)

---

**Summary**: This is a **100% FREE, privacy-first** extension. All barcode scanning happens locally in your browser using open-source libraries. **ZERO data collection. ZERO external communication. ZERO tracking. Completely free forever.**
