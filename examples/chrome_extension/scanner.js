let barcodeScanner;
const resultArea = document.getElementById("result");
const statusDiv = document.getElementById("status");
const loadingDiv = document.getElementById("loading");
const closeBtn = document.getElementById("closeBtn");

// Close button handler
closeBtn.addEventListener('click', () => {
    if (barcodeScanner) {
        barcodeScanner.dispose();
    }
    window.close();
});

// Get license key from storage
async function getLicenseKey() {
    // Try localStorage first (same as popup uses)
    const localKey = localStorage.getItem('dynamsoft_license_key');
    if (localKey) {
        return localKey;
    }

    // Fallback to chrome.storage.local
    return new Promise((resolve) => {
        chrome.storage.local.get(['dynamsoft_license_key'], (result) => {
            resolve(result.dynamsoft_license_key);
        });
    });
}

// Initialize and start scanner
async function initScanner() {
    try {
        loadingDiv.classList.add('active');
        statusDiv.textContent = 'Getting license...';

        // Get license from storage
        const licenseKey = await getLicenseKey();
        const expiryDate = localStorage.getItem('dynamsoft_license_expiry');

        console.log('License key:', licenseKey ? 'Found' : 'Not found');
        console.log('Expiry date:', expiryDate);

        if (!licenseKey) {
            statusDiv.textContent = '❌ No license found. Please login from the extension popup first.';
            loadingDiv.classList.remove('active');
            return;
        }

        // Check if license is expired
        if (expiryDate) {
            const expiry = new Date(expiryDate);
            const now = new Date();
            if (expiry <= now) {
                statusDiv.innerHTML = '❌ License expired. <a href="https://www.dynamsoft.com/purchase-center/" target="_blank" style="color: white; text-decoration: underline;">Purchase a license</a> or login again from the extension popup.';
                loadingDiv.classList.remove('active');
                return;
            }
        }

        statusDiv.textContent = 'Activating SDK...';

        const barcodeScannerViewConfig = {
            showCloseButton: false,
            showFlashButton: true,
            cameraSwitchControl: "toggleFrontBack",
        };
        // Create barcode scanner using the correct API from dbr.bundle.js
        barcodeScanner = new Dynamsoft.BarcodeScanner({
            license: licenseKey,
            scanMode: Dynamsoft.EnumScanMode.SM_MULTI_UNIQUE,
            container: document.getElementById('divScanner'),
            onUniqueBarcodeScanned: (result) => {
                if (!result) {
                    resultArea.value = "No barcode found.\n";
                } else {
                    resultArea.value += "Text: " + result.text + "\n";
                    resultArea.value += "Format: " + result.formatString + "\n";
                    resultArea.value += "---\n";
                    resultArea.scrollTop = resultArea.scrollHeight;
                }
            },
            onCameraOpen: (components) => {
                statusDiv.style.display = 'none';
                loadingDiv.classList.remove('active');
                loadingDiv.style.display = 'none';
            },
            showResultView: false,
            scannerViewConfig: barcodeScannerViewConfig,
            resultViewConfig: {}
        });

        statusDiv.textContent = 'Starting camera...';

        // Launch the scanner
        await barcodeScanner.launch();
    } catch (error) {
        console.error('Scanner initialization error:', error);
        statusDiv.textContent = '❌ Error: ' + error.message;
        loadingDiv.classList.remove('active');

        if (error.message && (error.message.includes('NotAllowedError') || error.message.includes('Permission'))) {
            statusDiv.textContent = '❌ Camera permission denied. Please allow camera access and refresh.';
        } else if (error.message && error.message.includes('NotFoundError')) {
            statusDiv.textContent = '❌ No camera found. Please connect a camera and refresh.';
        }
    }
}

// Start scanner when page loads
initScanner();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (barcodeScanner) {
        barcodeScanner.dispose();
    }
});
