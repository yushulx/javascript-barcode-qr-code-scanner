let barcodeScanner;
let licenseKey = null;
let engineChoice = 'dynamsoft';
let zxingReader = null;
let selectedDeviceId;
let stream;
let isScanning = false;
let animationId = null;

const resultArea = document.getElementById("result");
const statusDiv = document.getElementById("status");
const loadingDiv = document.getElementById("loading");
const closeBtn = document.getElementById("closeBtn");
const divScanner = document.getElementById("divScanner");
const overlayCanvas = document.getElementById("overlayCanvas");

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        stopAll();
        window.close();
    });
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'setLicense') {
        licenseKey = request.licenseKey;
        if (engineChoice === 'dynamsoft') {
            initDynamsoftScanner();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['scannerEngine'], (result) => {
        engineChoice = result.scannerEngine || 'dynamsoft';

        if (engineChoice === 'zxing') {
            initZXingScanner();
        } else {
            statusDiv.textContent = 'Waiting for license from side panel...';
            if (licenseKey) {
                initDynamsoftScanner();
            }
        }
    });
});

function stopAll() {
    stopZXing();
    if (barcodeScanner) {
        barcodeScanner.dispose();
        barcodeScanner = null;
    }
}

function stopZXing() {
    isScanning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    const video = document.getElementById('scanner-video');
    if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
    }
    clearOverlay();
}

function clearOverlay() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

async function ensureZXingReader() {
    if (!zxingReader) {
        const module = await import('./libs/zxing-wasm/es/reader/index.js');
        zxingReader = module.readBarcodesFromImageData;
    }
}

async function initZXingScanner() {
    try {
        await ensureZXingReader();
        statusDiv.textContent = 'Checking cameras...';

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (!videoDevices.length) {
            statusDiv.textContent = 'No cameras found';
            alert('No cameras found. Please connect a camera and try again.');
            return;
        }

        selectedDeviceId = videoDevices[0].deviceId;
        await startZXingCamera();
    } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
        alert('Error starting camera: ' + error.message);
    }
}

async function startZXingCamera() {
    stopZXing();

    const video = document.createElement('video');
    video.id = 'scanner-video';
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.height = '100%';
    divScanner.prepend(video);

    stream = await navigator.mediaDevices.getUserMedia({
        video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    });

    video.srcObject = stream;
    await video.play();

    statusDiv.textContent = 'Scanning... Point camera at barcode';
    isScanning = true;
    scanFrameZXing(video);
}

async function scanFrameZXing(video) {
    if (!isScanning || !zxingReader) return;

    if (!video.videoWidth || !video.videoHeight) {
        animationId = requestAnimationFrame(() => scanFrameZXing(video));
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const results = await zxingReader(imageData, { maxSymbols: 1 });

    drawZXingOverlay(results, canvas.width, canvas.height);
    updateResultArea(results);

    animationId = requestAnimationFrame(() => scanFrameZXing(video));
}

function drawZXingOverlay(results, width, height) {
    if (!overlayCanvas) return;
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    results.forEach((result, index) => {
        const pos = result.position || result.location;
        if (!pos) return;

        const points = normalizePoints(pos);
        if (!points.length) return;

        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        const label = `${index + 1}: ${result.format}`;
        ctx.font = '16px Arial';
        const metrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
        ctx.fillRect(points[0].x, points[0].y - 24, metrics.width + 10, 24);
        ctx.fillStyle = '#000';
        ctx.fillText(label, points[0].x + 5, points[0].y - 8);
    });
}

function normalizePoints(pos) {
    if (pos.topLeft && pos.topRight && pos.bottomRight && pos.bottomLeft) {
        return [pos.topLeft, pos.topRight, pos.bottomRight, pos.bottomLeft];
    }
    if (Array.isArray(pos) && pos.length >= 4) {
        return pos;
    }
    if (pos.points && Array.isArray(pos.points)) {
        return pos.points;
    }
    return [];
}

function updateResultArea(results) {
    if (!results || !results.length) {
        resultArea.value = 'No barcode detected yet...';
        return;
    }

    resultArea.value = '';
    results.forEach((item, idx) => {
        resultArea.value += `Result ${idx + 1}\n`;
        resultArea.value += `Text: ${item.text}\n`;
        resultArea.value += `Format: ${item.format}\n`;
        resultArea.value += '---\n';
    });
    resultArea.scrollTop = resultArea.scrollHeight;
}

async function initDynamsoftScanner() {
    if (engineChoice !== 'dynamsoft') return;
    try {
        loadingDiv.classList.add('active');

        if (!licenseKey) {
            statusDiv.textContent = 'No license available. Please login from the side panel first.';
            loadingDiv.classList.remove('active');
            return;
        }

        statusDiv.textContent = 'Activating SDK...';

        barcodeScanner = new Dynamsoft.BarcodeScanner({
            license: licenseKey,
            scanMode: Dynamsoft.EnumScanMode.SM_MULTI_UNIQUE,
            container: divScanner,
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
            onCameraOpen: () => {
                statusDiv.style.display = 'none';
                loadingDiv.classList.remove('active');
                loadingDiv.style.display = 'none';
            },
            showResultView: false,
            scannerViewConfig: {
                showCloseButton: false,
                showFlashButton: true,
                cameraSwitchControl: "toggleFrontBack",
            },
            resultViewConfig: {}
        });

        statusDiv.textContent = 'Starting camera...';
        await barcodeScanner.launch();
    } catch (error) {
        console.error('Scanner initialization error:', error);
        statusDiv.textContent = 'Error: ' + error.message;
        loadingDiv.classList.remove('active');

        if (error.message && (error.message.includes('NotAllowedError') || error.message.includes('Permission'))) {
            statusDiv.textContent = 'Camera permission denied. Please allow camera access and refresh.';
        } else if (error.message && error.message.includes('NotFoundError')) {
            statusDiv.textContent = 'No camera found. Please connect a camera and refresh.';
        }
    }
}

window.addEventListener('beforeunload', () => {
    stopAll();
});
