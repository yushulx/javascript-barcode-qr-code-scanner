/**
 * Auto Document Scanner
 * Automatically detects, crops documents and reads barcodes.
 * Supports both Auto-Scan and Manual capture modes.
 * Features: License activation, Color mode toggle, Scan history
 */

// ============================================================
// DOM Elements
// ============================================================
const licenseScreen = document.getElementById('license-screen');
const licenseInput = document.getElementById('license-input');
const activateBtn = document.getElementById('activate-btn');
const initOverlay = document.getElementById('init-overlay');
const initStatus = document.getElementById('init-status');
const cameraScreen = document.getElementById('camera-screen');
const resultScreen = document.getElementById('result-screen');
const historyScreen = document.getElementById('history-screen');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const autoToggle = document.getElementById('auto-toggle');
const colorToggle = document.getElementById('color-toggle');
const captureBtn = document.getElementById('capture-btn');
const cameraSelect = document.getElementById('camera-select');
const croppedImage = document.getElementById('cropped-image');
const barcodeResults = document.getElementById('barcode-results');
const retakeBtn = document.getElementById('retake-btn');
const scanNextBtn = document.getElementById('scan-next-btn');
const historyBtn = document.getElementById('history-btn');
const historyCount = document.getElementById('history-count');
const historyBackBtn = document.getElementById('history-back-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const historyContent = document.getElementById('history-content');
const toast = document.getElementById('toast');

// ============================================================
// SDK Components
// ============================================================
let cvr = null;           // Capture Vision Router
let cameraEnhancer = null;
let cameraView = null;
let cameras = [];

// ============================================================
// State Management
// ============================================================
let isSDKReady = false;
let isScanning = false;
let isCaptureInProgress = false;
let isColorMode = true;

// Stability tracking for auto-capture
const STABILITY_THRESHOLD = 12;     // Frames required to be stable
const MOVEMENT_TOLERANCE = 15;      // Pixel movement tolerance
let stabilityCounter = 0;
let lastQuadPoints = null;
let latestOriginalImage = null;
let latestDetectedQuad = null;

// Scan history
let scanHistory = [];
let currentScanResult = null;

// Default license key (get a free trial from Dynamsoft)
const DEFAULT_LICENSE_KEY = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";

// ============================================================
// License Activation
// ============================================================
activateBtn.addEventListener('click', async () => {
    const licenseKey = licenseInput.value.trim() || DEFAULT_LICENSE_KEY;
    await activateAndInit(licenseKey);
});

async function activateAndInit(licenseKey) {
    // Hide license screen, show init overlay
    licenseScreen.classList.add('hidden');
    initOverlay.classList.remove('hidden');

    try {
        updateInitStatus('Activating license...');
        await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);

        updateInitStatus('Loading modules...');
        await Dynamsoft.Core.CoreModule.loadWasm(["DBR", "DDN"]);

        updateInitStatus('Initializing camera...');
        await initCamera();

        updateInitStatus('Setting up scanner...');
        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
        await cvr.initSettings("./DBR_and_DDN_detect_PresetTemplates.json");
        // Set up result receiver
        cvr.addResultReceiver({
            onCapturedResultReceived: handleCapturedResult
        });

        isSDKReady = true;
        hideInitOverlay();

        // Show camera screen
        cameraScreen.classList.remove('hidden');

        // Load history from localStorage
        loadHistory();

        // Start scanning automatically
        await startScanning();

    } catch (error) {
        console.error('Initialization failed:', error);
        updateInitStatus(`Error: ${error.message || 'Failed to initialize'}`);
        // Show retry option
        setTimeout(() => {
            initOverlay.classList.add('hidden');
            licenseScreen.classList.remove('hidden');
            showToast('License activation failed. Please try again.');
        }, 2000);
    }
}

function updateInitStatus(message) {
    initStatus.textContent = message;
}

function hideInitOverlay() {
    initOverlay.classList.add('hidden');
}

// ============================================================
// Camera Management
// ============================================================
async function initCamera() {
    cameraView = await Dynamsoft.DCE.CameraView.createInstance();
    cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance(cameraView);

    // Attach camera view to DOM
    const container = document.getElementById('camera-view');
    container.appendChild(cameraView.getUIElement());

    // Hide default UI controls
    const uiElement = cameraView.getUIElement();
    if (uiElement.shadowRoot) {
        const selCamera = uiElement.shadowRoot.querySelector('.dce-sel-camera');
        const selResolution = uiElement.shadowRoot.querySelector('.dce-sel-resolution');
        if (selCamera) selCamera.style.display = 'none';
        if (selResolution) selResolution.style.display = 'none';
    }

    // Get available cameras
    cameras = await cameraEnhancer.getAllCameras();
    populateCameraSelect();

    if (cameras.length > 0) {
        await cameraEnhancer.selectCamera(cameras[0]);
        // Set color pixel format for color output
        applyColorMode();
        await cameraEnhancer.open();
    }
}

function applyColorMode() {
    if (isColorMode) {
        // Pixel format 10 = color format
        cameraEnhancer.setPixelFormat(10);
    } else {
        // Default/grayscale
        cameraEnhancer.setPixelFormat(2);
    }
}

function populateCameraSelect() {
    cameraSelect.innerHTML = '';
    cameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = camera.label || `Camera ${index + 1}`;
        cameraSelect.appendChild(option);
    });
}

async function switchCamera(index) {
    if (cameras[index]) {
        const wasScanning = isScanning;
        if (wasScanning) await stopScanning();

        await cameraEnhancer.selectCamera(cameras[index]);
        applyColorMode();

        if (wasScanning) await startScanning();
    }
}

// ============================================================
// Color Mode Toggle
// ============================================================
colorToggle.addEventListener('change', async () => {
    isColorMode = colorToggle.checked;
    const mode = isColorMode ? 'Color' : 'Grayscale';
    showToast(`${mode} mode`);

    // Reapply color mode
    if (cameraEnhancer) {
        const wasScanning = isScanning;
        if (wasScanning) await stopScanning();

        applyColorMode();

        if (wasScanning) await startScanning();
    }
});

// ============================================================
// Scanning Control
// ============================================================
async function startScanning() {
    if (!isSDKReady || isScanning) return;

    try {
        // Reset state
        resetStabilityTracking();
        isCaptureInProgress = false;

        // Configure for document detection with original image output
        await cvr.resetSettings();
        let settings = await cvr.getSimplifiedSettings("DetectDocumentBoundaries_Default");
        // settings.outputOriginalImage = true;
        await cvr.updateSettings("DetectDocumentBoundaries_Default", settings);

        // Set camera enhancer as input
        cvr.setInput(cameraEnhancer);

        // Start capturing
        await cvr.startCapturing("DetectDocumentBoundaries_Default");
        isScanning = true;

        updateStatus('searching', 'Looking for document...');

    } catch (error) {
        console.error('Failed to start scanning:', error);
        showToast('Failed to start scanner');
    }
}

async function stopScanning() {
    if (!isScanning) return;

    try {
        await cvr.stopCapturing();
        isScanning = false;
    } catch (error) {
        console.error('Failed to stop scanning:', error);
    }
}

// ============================================================
// Result Handling & Stability Detection
// ============================================================
async function handleCapturedResult(result) {
    if (isCaptureInProgress) return;

    const items = result.items;
    if (!items || items.length === 0) {
        resetStabilityTracking();
        updateStatus('searching', 'Looking for document...');
        return;
    }

    // Process items
    for (const item of items) {
        if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD) {
            latestDetectedQuad = item;
            checkStability(item.location.points);
        } else if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE) {
            latestOriginalImage = item;
        }
    }

    // Auto-capture logic
    if (autoToggle.checked && stabilityCounter >= STABILITY_THRESHOLD && !isCaptureInProgress) {
        await performCapture();
    }
}

function checkStability(currentPoints) {
    if (!lastQuadPoints) {
        lastQuadPoints = currentPoints;
        stabilityCounter = 1;
        updateStatus('searching', 'Document detected, hold steady...');
        return;
    }

    const isStable = isQuadStable(currentPoints, lastQuadPoints);

    if (isStable) {
        stabilityCounter++;
        const progress = Math.min(stabilityCounter / STABILITY_THRESHOLD * 100, 100);

        if (stabilityCounter >= STABILITY_THRESHOLD) {
            updateStatus('stable', 'Ready to capture!');
        } else {
            updateStatus('searching', `Hold steady... ${Math.round(progress)}%`);
        }
    } else {
        stabilityCounter = Math.max(0, stabilityCounter - 2); // Decay faster on movement
        updateStatus('searching', 'Hold steady...');
    }

    lastQuadPoints = currentPoints;
}

function isQuadStable(current, previous) {
    if (!current || !previous || current.length !== 4 || previous.length !== 4) {
        return false;
    }

    for (let i = 0; i < 4; i++) {
        const dx = Math.abs(current[i].x - previous[i].x);
        const dy = Math.abs(current[i].y - previous[i].y);
        if (dx > MOVEMENT_TOLERANCE || dy > MOVEMENT_TOLERANCE) {
            return false;
        }
    }
    return true;
}

function resetStabilityTracking() {
    stabilityCounter = 0;
    lastQuadPoints = null;
    latestDetectedQuad = null;
    latestOriginalImage = null;
}

// ============================================================
// Capture & Processing Pipeline
// ============================================================
async function performCapture() {
    if (isCaptureInProgress) return;
    isCaptureInProgress = true;

    updateStatus('capturing', 'Capturing...');
    captureBtn.classList.add('capturing');

    try {
        await stopScanning();

        // Get the source image
        let sourceImage;
        if (latestOriginalImage) {
            sourceImage = latestOriginalImage.imageData.toCanvas();
        } else {
            // Fallback: grab frame directly
            sourceImage = cameraEnhancer.fetchImage();
        }

        // Step 1: Crop/Normalize the document
        let croppedCanvas;
        if (latestDetectedQuad) {
            croppedCanvas = await normalizeDocument(sourceImage, latestDetectedQuad.location.points);
        }

        if (!croppedCanvas) {
            // If normalization failed, use full image
            croppedCanvas = sourceImage;
            showToast('Using full image (no document detected)');
        }

        // Ensure we have a canvas object (normalize source image if needed)
        if (typeof croppedCanvas.toDataURL !== 'function' && typeof croppedCanvas.toCanvas === 'function') {
            croppedCanvas = croppedCanvas.toCanvas();
        }

        // Step 2: Read barcodes from the cropped image
        const barcodes = await readBarcodes(croppedCanvas);

        // Store current result for potential saving
        currentScanResult = {
            imageDataUrl: croppedCanvas.toDataURL('image/png'),
            barcodes: barcodes,
            timestamp: new Date().toISOString()
        };

        // Step 3: Show results
        displayResults(croppedCanvas, barcodes);

    } catch (error) {
        console.error('Capture failed:', error);
        showToast('Capture failed. Please try again.');
        await startScanning();
    } finally {
        captureBtn.classList.remove('capturing');
        isCaptureInProgress = false;
    }
}

async function normalizeDocument(source, points) {
    try {
        let settings = await cvr.getSimplifiedSettings("NormalizeDocument_Default");
        settings.roi.points = points;
        settings.roiMeasuredInPercentage = 0;
        await cvr.updateSettings("NormalizeDocument_Default", settings);

        const result = await cvr.capture(source, "NormalizeDocument_Default");

        for (const item of result.items) {
            if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ENHANCED_IMAGE) {
                return item.toCanvas();
            }
        }
    } catch (error) {
        console.error('Normalization failed:', error);
    }
    return null;
}

async function readBarcodes(source) {
    try {
        await cvr.resetSettings();
        const result = await cvr.capture(source, "ReadBarcodes_Default");

        const barcodes = [];
        for (const item of result.items) {
            if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                barcodes.push({
                    format: item.formatString,
                    text: item.text
                });
            }
        }
        return barcodes;
    } catch (error) {
        console.error('Barcode reading failed:', error);
        return [];
    }
}

// ============================================================
// Results Display
// ============================================================
function displayResults(croppedCanvas, barcodes) {
    // Set cropped image
    croppedImage.src = croppedCanvas.toDataURL('image/png');

    // Display barcodes
    if (barcodes.length > 0) {
        barcodeResults.innerHTML = barcodes.map(barcode => `
            <div class="barcode-item">
                <div class="barcode-format">${barcode.format}</div>
                <div class="barcode-value">${escapeHtml(barcode.text)}</div>
            </div>
        `).join('');
    } else {
        barcodeResults.innerHTML = '<p class="no-barcode">No barcodes detected on this document</p>';
    }

    // Switch to result screen
    cameraScreen.classList.add('hidden');
    resultScreen.classList.remove('hidden');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// History Management
// ============================================================
function saveToHistory() {
    if (!currentScanResult) return;

    scanHistory.unshift(currentScanResult);
    
    // Limit history to 50 items to avoid localStorage overflow
    if (scanHistory.length > 50) {
        scanHistory = scanHistory.slice(0, 50);
    }

    // Persist to localStorage
    try {
        localStorage.setItem('scanHistory', JSON.stringify(scanHistory));
    } catch (e) {
        console.warn('Failed to save history to localStorage:', e);
    }

    updateHistoryCount();
    currentScanResult = null;
}

function loadHistory() {
    try {
        const stored = localStorage.getItem('scanHistory');
        if (stored) {
            scanHistory = JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to load history from localStorage:', e);
        scanHistory = [];
    }
    updateHistoryCount();
}

function updateHistoryCount() {
    historyCount.textContent = scanHistory.length;
}

function renderHistory() {
    if (scanHistory.length === 0) {
        historyContent.innerHTML = '<p class="no-history">No scans yet. Start scanning to build history.</p>';
        return;
    }

    historyContent.innerHTML = scanHistory.map((item, index) => {
        const date = new Date(item.timestamp);
        const timeStr = date.toLocaleString();
        const barcodeCount = item.barcodes.length;

        return `
            <div class="history-item" data-index="${index}">
                <div class="history-item-header" onclick="toggleHistoryItem(${index})">
                    <span class="history-item-time">${timeStr}</span>
                    <span class="history-item-count">${barcodeCount} barcode${barcodeCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="history-item-body">
                    <img src="${item.imageDataUrl}" alt="Scan ${index + 1}" class="history-thumb">
                    ${item.barcodes.length > 0 ? item.barcodes.map(bc => `
                        <div class="history-barcode">
                            <div class="history-barcode-format">${bc.format}</div>
                            <div class="history-barcode-value">${escapeHtml(bc.text)}</div>
                        </div>
                    `).join('') : '<p class="no-barcode">No barcodes</p>'}
                </div>
            </div>
        `;
    }).join('');
}

function toggleHistoryItem(index) {
    const items = historyContent.querySelectorAll('.history-item');
    items.forEach((item, i) => {
        if (i === index) {
            item.classList.toggle('expanded');
        }
    });
}

// Make toggleHistoryItem available globally for onclick
window.toggleHistoryItem = toggleHistoryItem;

function clearHistory() {
    if (confirm('Are you sure you want to clear all scan history?')) {
        scanHistory = [];
        try {
            localStorage.removeItem('scanHistory');
        } catch (e) {
            console.warn('Failed to clear history from localStorage:', e);
        }
        updateHistoryCount();
        renderHistory();
        showToast('History cleared');
    }
}

function showHistoryScreen() {
    renderHistory();
    cameraScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    historyScreen.classList.remove('hidden');
}

function hideHistoryScreen() {
    historyScreen.classList.add('hidden');
    cameraScreen.classList.remove('hidden');
    startScanning();
}

// ============================================================
// UI Helpers
// ============================================================
function updateStatus(state, message) {
    statusIndicator.className = `status-${state}`;
    statusText.textContent = message;
}

function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

async function returnToCamera(saveResult = false) {
    if (saveResult && currentScanResult) {
        saveToHistory();
        showToast('Scan saved to history');
    }

    resultScreen.classList.add('hidden');
    cameraScreen.classList.remove('hidden');

    resetStabilityTracking();
    currentScanResult = null;
    await startScanning();
}

// ============================================================
// Event Listeners
// ============================================================
captureBtn.addEventListener('click', async () => {
    if (!isSDKReady || isCaptureInProgress) return;

    if (!latestDetectedQuad && !latestOriginalImage) {
        // No detection yet, try to capture current frame anyway
        showToast('No document detected. Capturing full frame...');
    }

    await performCapture();
});

cameraSelect.addEventListener('change', async (e) => {
    await switchCamera(parseInt(e.target.value, 10));
});

// Retake: discard current result and rescan
retakeBtn.addEventListener('click', () => {
    currentScanResult = null;
    returnToCamera(false);
});

// Save & Next: save result to history and continue scanning
scanNextBtn.addEventListener('click', () => {
    returnToCamera(true);
});

// History button
historyBtn.addEventListener('click', async () => {
    await stopScanning();
    showHistoryScreen();
});

// History back button
historyBackBtn.addEventListener('click', () => {
    hideHistoryScreen();
});

// Clear history button
clearHistoryBtn.addEventListener('click', clearHistory);

autoToggle.addEventListener('change', () => {
    const mode = autoToggle.checked ? 'Auto' : 'Manual';
    showToast(`${mode} capture mode`);
});

// Allow Enter key to activate
licenseInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        activateBtn.click();
    }
});

// ============================================================
// Start Application - Wait for user to activate
// ============================================================
// App starts on license screen, user clicks "Start Scanner" to begin
