let barcodeScanner;
let licenseKey = null; // Will be set by message from app.js
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

// Listen for license key from app.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setLicense') {
        licenseKey = request.licenseKey;
        console.log('License key received from app.js');
        // Initialize scanner now that we have the license
        initScanner();
    }
});

// Initialize and start scanner
async function initScanner() {
    try {
        loadingDiv.classList.add('active');
        
        if (!licenseKey) {
            statusDiv.textContent = '❌ No license available. Please login from the extension side panel first.';
            loadingDiv.classList.remove('active');
            return;
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
