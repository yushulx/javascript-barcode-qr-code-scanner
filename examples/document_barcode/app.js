/**
 * Auto Document Scanner
 * Automatically detects, crops documents and reads barcodes.
 * Supports both Auto-Scan and Manual capture modes.
 */

// ============================================================
// DOM Elements
// ============================================================
const initOverlay = document.getElementById('init-overlay');
const initStatus = document.getElementById('init-status');
const cameraScreen = document.getElementById('camera-screen');
const resultScreen = document.getElementById('result-screen');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const autoToggle = document.getElementById('auto-toggle');
const captureBtn = document.getElementById('capture-btn');
const cameraSelect = document.getElementById('camera-select');
const croppedImage = document.getElementById('cropped-image');
const barcodeResults = document.getElementById('barcode-results');
const retakeBtn = document.getElementById('retake-btn');
const scanNextBtn = document.getElementById('scan-next-btn');
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

// Stability tracking for auto-capture
const STABILITY_THRESHOLD = 12;     // Frames required to be stable
const MOVEMENT_TOLERANCE = 15;      // Pixel movement tolerance
let stabilityCounter = 0;
let lastQuadPoints = null;
let latestOriginalImage = null;
let latestDetectedQuad = null;

// License key (get a free trial from Dynamsoft)
const LICENSE_KEY = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";

// ============================================================
// Initialization
// ============================================================
async function init() {
    try {
        updateInitStatus('Activating license...');
        await Dynamsoft.License.LicenseManager.initLicense(LICENSE_KEY, true);

        updateInitStatus('Loading modules...');
        await Dynamsoft.Core.CoreModule.loadWasm(["DBR", "DDN"]);

        updateInitStatus('Initializing camera...');
        await initCamera();

        updateInitStatus('Setting up scanner...');
        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        // Set up result receiver
        cvr.addResultReceiver({
            onCapturedResultReceived: handleCapturedResult
        });

        isSDKReady = true;
        hideInitOverlay();

        // Start scanning automatically
        await startScanning();

    } catch (error) {
        console.error('Initialization failed:', error);
        updateInitStatus(`Error: ${error.message || 'Failed to initialize'}`);
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
        cameraEnhancer.setPixelFormat(10); // Color format
        await cameraEnhancer.open();
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

        if (wasScanning) await startScanning();
    }
}

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

        // Step 2: Read barcodes from the cropped image
        const barcodes = await readBarcodes(croppedCanvas);

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
        // Set colour mode to output a color image (default is grayscale)
        // ICM_COLOUR = 0, ICM_GRAYSCALE = 1, ICM_BINARY = 2
        // settings.documentSettings.colourMode = Dynamsoft.DDN.EnumImageColourMode.ICM_COLOUR;
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

async function returnToCamera() {
    resultScreen.classList.add('hidden');
    cameraScreen.classList.remove('hidden');

    resetStabilityTracking();
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

retakeBtn.addEventListener('click', returnToCamera);
scanNextBtn.addEventListener('click', returnToCamera);

autoToggle.addEventListener('change', () => {
    const mode = autoToggle.checked ? 'Auto' : 'Manual';
    showToast(`${mode} capture mode`);
});

// ============================================================
// Start Application
// ============================================================
document.addEventListener('DOMContentLoaded', init);
