# Privacy Policy for Barcode & QR Code Scanner

**Last Updated: November 10, 2025**

## Overview

This Chrome extension provides barcode and QR code scanning functionality using Dynamsoft's barcode recognition technology. We are committed to protecting your privacy and being transparent about our data practices.

## Data Collection and Usage

### What We Collect

**Authentication Data (Temporary)**
- Google OAuth tokens (stored temporarily for trial license activation)
- User email and name (retrieved only for license management)
- Dynamsoft cookies (DynamsoftToken, DynamsoftUser) for session management

**License Information (Local)**
- Trial license key (stored in browser's localStorage)
- License expiration date (stored in browser's localStorage)

**User Preferences (Local)**
- Settings preferences (stored in chrome.storage.local)
- Floating icon visibility preference

### What We DON'T Collect

- ❌ **No image data storage**: Images, PDFs, and screenshots are processed locally and immediately discarded
- ❌ **No barcode results storage**: Scan results are displayed temporarily and never saved or transmitted
- ❌ **No browsing history**: We don't track which pages you visit or images you scan
- ❌ **No analytics or tracking**: No usage statistics, telemetry, or behavioral tracking
- ❌ **No personal data beyond authentication**: Only email and name for license purposes

## How the Extension Works

### Local Processing
- **All barcode scanning happens locally** in your browser using WebAssembly
- Images, PDFs, and screenshots are processed in memory and never uploaded
- Scan results are displayed only in the side panel and immediately discarded when you close it

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
- **localStorage**: Trial license key and expiration date
- **chrome.storage.local**: User preferences (floating icon toggle)
- **Cookies**: Dynamsoft authentication cookies (DynamsoftToken, DynamsoftUser)

All stored data remains on your device and is never transmitted except during initial authentication.

### No Cloud Storage
- We do not maintain any cloud servers or databases
- No user data is stored on external servers
- All processing is client-side

## Permissions Explained

### Required Permissions

**storage**
- Used to save your trial license and user preferences locally
- Data never leaves your device

**cookies**
- Used only to read Dynamsoft authentication cookies during Google OAuth login
- Required for trial license activation
- Only accesses cookies from www.dynamsoft.com domain

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

### Host Permissions

**https://www.dynamsoft.com/***
**https://*.dynamsoft.com/***
- Required to communicate with Dynamsoft's license API
- Used only for:
  - Google OAuth authentication
  - Trial license request (requires email)
  - User information retrieval (name for display)

## Third-Party Services

### Dynamsoft License API
The extension connects to Dynamsoft's servers **only** for:
1. **Authentication**: Google OAuth login flow
2. **License Activation**: Requesting a 30-day trial license (requires email)
3. **User Information**: Retrieving your name for display in the UI

**Data Transmitted to Dynamsoft:**
- Email address (for trial license generation)
- Authentication tokens (Google OAuth)

**What Dynamsoft May Store:**
- Your email and basic profile information
- Trial license records
- Authentication session data

Please refer to [Dynamsoft's Privacy Policy](https://www.dynamsoft.com/privacy-statement/) for details on how they handle data.

### Google OAuth
When you login with Google:
- Google handles the authentication process
- We receive only your email and name
- Authentication is managed through Dynamsoft's OAuth implementation
- Refer to [Google's Privacy Policy](https://policies.google.com/privacy) for details

### No Other Third Parties
- No analytics services (Google Analytics, etc.)
- No advertising networks
- No social media trackers
- No third-party scripts or beacons

## Data Retention

### Temporary Data
- **Screenshots**: Deleted immediately after scanning
- **Uploaded files**: Processed in memory, never written to disk
- **Scan results**: Cleared when you close the side panel or scan new items

### Persistent Data (Local Only)
- **License key**: Stored until expiration or manual logout
- **User preferences**: Stored until you change them or uninstall the extension

### Data Deletion
To delete all data:
1. Uninstall the extension from Chrome
2. All localStorage and chrome.storage data will be automatically removed
3. Clear browser cookies for www.dynamsoft.com if desired

## Security

### Local Processing
- All barcode recognition happens locally using WebAssembly
- No images or scan data leave your browser
- Industry-standard Dynamsoft SDK used for barcode detection

### Secure Communication
- All API calls to Dynamsoft use HTTPS
- OAuth tokens are transmitted securely
- Cookies are marked as secure where applicable

### No Vulnerabilities
- No eval() or unsafe JavaScript execution
- Content Security Policy enforced (Manifest V3)
- No remote code execution
- No inline scripts

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
- **Access**: View what data is stored (check localStorage in DevTools)
- **Delete**: Uninstall the extension to remove all data
- **Opt-out**: Don't use the login feature to avoid authentication data
- **Control**: Manage permissions in Chrome's extension settings

## No Sale of Data

We **never** sell, rent, or trade any user data. There is no business model based on data monetization.

## Open Source

This extension's code can be reviewed for transparency. All barcode processing uses the Dynamsoft SDK, which is a commercial product with its own privacy practices.

## Contact

For questions, concerns, or requests regarding this privacy policy:

- **Chrome Web Store Support**: Use the support tab on the extension's store listing
- **GitHub Issues**: [yushulx/javascript-barcode-qr-code-scanner](https://github.com/yushulx/javascript-barcode-qr-code-scanner)
- **Email**: Contact through Dynamsoft's support channels

## Acknowledgment

By using this extension, you acknowledge that you have read and understood this Privacy Policy and agree to its terms, including:
- Local processing of images and barcodes
- Transmission of email to Dynamsoft for trial license
- Use of Google OAuth for authentication
- Storage of license information locally

---

**Summary**: This extension processes barcodes locally. The only external communication is for trial license authentication (email sent to Dynamsoft). No images, scan results, or browsing data are ever transmitted or stored externally.
