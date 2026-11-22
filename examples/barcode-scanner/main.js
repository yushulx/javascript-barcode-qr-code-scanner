/**
 * Barcode Scanner
 *
 * Built on Dynamsoft Barcode Reader (dynamsoft-barcode-reader-bundle 11.6.3200).
 * Scans 1D/2D barcodes from image files, video files, and a live camera stream.
 */

// ========== DOM Elements ==========
const dropdown = document.getElementById('dropdown');
const cameraSource = document.getElementById('camera_source');
const imageFile = document.getElementById('image_file');
const overlayCanvas = document.getElementById('overlay_canvas');
const cameraOverlay = document.getElementById('camera_overlay');
const videoElement = document.getElementById('camera_view');
const scanResult = document.getElementById('scan_result');
const videoFilePlayer = document.getElementById('video_file_player');
const videoOverlay = document.getElementById('video_overlay');
const detectionResult = document.getElementById('detection_result');
const imagePreviewContainer = document.getElementById('image_preview_container');
const videoFileWrapper = document.getElementById('video_file_wrapper');
const imageNavigator = document.getElementById('image_navigator');
const navigatorCounter = document.getElementById('navigator_counter');
const loadingIndicator = document.getElementById('loading-indicator');
const loadingText = document.getElementById('loading-text');
const settingsModal = document.getElementById('settings_modal');

// The SDK renders its license notice overlay with the maximum z-index. Moving the
// settings modal to the end of <body> keeps it clickable on top of that overlay.
document.body.appendChild(settingsModal);

// ========== SDK State ==========
let cvr = null;              // CaptureVisionRouter instance
let isSDKReady = false;      // True once the SDK is activated and ready to scan
let activatedLicenseKey = '';// Key the SDK is currently activated with
let wasmLoaded = false;      // WASM modules only need loading once
let img = new Image();
let stream = null;

// ========== Scanning State ==========
let fileScanning = false;
let fileAnimationFrame = null;
let fileScanResults = [];

let cameraScanning = false;
let cameraAnimationFrame = null;
let cameraScanResults = [];

// Multi-image state
let imageFiles = [];
let currentImageIndex = 0;

// Mode state: 'default' or 'benchmark'
let currentMode = 'default';
let benchmarkRunning = false;
let lastBenchmarkData = null;

// Dynamsoft template setting
let dynamsoftTemplate = 'ReadBarcodes_Default';
let dynamsoftCustomTemplateContent = null; // pending JSON string applied after CVR init

// Annotation ground truth data (map: filename -> [{text, format, points}])
let annotationData = null;

// ========== Drag & Drop ==========
overlayCanvas.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

overlayCanvas.addEventListener('drop', function (event) {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
        handleFiles(Array.from(event.dataTransfer.files));
    }
}, false);

// Prevent the browser from opening dragged files anywhere on the page
document.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

document.addEventListener('drop', function (event) {
    event.preventDefault();
}, false);

const fileUploadLabel = document.querySelector('.file-upload-label');
if (fileUploadLabel) {
    fileUploadLabel.addEventListener('dragover', function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        fileUploadLabel.classList.add('drag-over');
    }, false);

    fileUploadLabel.addEventListener('dragleave', function (event) {
        event.preventDefault();
        event.stopPropagation();
        fileUploadLabel.classList.remove('drag-over');
    }, false);

    fileUploadLabel.addEventListener('drop', function (event) {
        event.preventDefault();
        event.stopPropagation();
        fileUploadLabel.classList.remove('drag-over');
        if (event.dataTransfer.files.length > 0) {
            handleFiles(Array.from(event.dataTransfer.files));
        }
    }, false);
}

// ========== Scan Mode Switching ==========
async function selectChanged() {
    stopCamera();

    let fileContainer = document.getElementById('file_container');
    let cameraContainer = document.getElementById('camera_container');

    fileContainer.style.display = 'none';
    cameraContainer.style.display = 'none';

    if (dropdown.value === 'file') {
        fileContainer.style.display = 'block';
    } else {
        await initCamera();
        cameraContainer.style.display = 'block';
    }
}

// ========== File Handling ==========
function handleFiles(files) {
    if (!files || files.length === 0) return;

    const images = files.filter(f => f.type.startsWith('image/'));
    const videos = files.filter(f => f.type.startsWith('video/'));

    if (images.length > 0) {
        stopFileScanning();
        detectionResult.value = '';
        fileScanResults = [];
        videoFileWrapper.style.display = 'none';

        imageFiles = images;
        currentImageIndex = 0;
        loadImageAtIndex(0);
    } else if (videos.length > 0) {
        handleFile(videos[0]);
    } else {
        alert('Unsupported file type. Please upload image or video files.');
    }
}

function handleFile(file) {
    if (!file) return;

    stopFileScanning();
    detectionResult.value = '';
    fileScanResults = [];
    imagePreviewContainer.style.display = 'none';
    videoFileWrapper.style.display = 'none';
    imageNavigator.style.display = 'none';
    imageFiles = [];

    if (file.type.startsWith('image/')) {
        imageFiles = [file];
        currentImageIndex = 0;
        loadImageAtIndex(0);
    } else if (file.type.startsWith('video/')) {
        loadVideoFile(file);
    } else {
        alert('Unsupported file type. Please upload an image or video file.');
    }
}

function loadImageAtIndex(index) {
    const file = imageFiles[index];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function (e) {
        loadImage2Canvas(e.target.result);
    };
    reader.readAsDataURL(file);

    if (imageFiles.length > 1) {
        imageNavigator.style.display = 'block';
        navigatorCounter.textContent = `${index + 1} / ${imageFiles.length}`;
        const prevBtn = imageNavigator.querySelector('.btn-nav:first-child');
        const nextBtn = imageNavigator.querySelector('.btn-nav:last-child');
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === imageFiles.length - 1;
    } else {
        imageNavigator.style.display = 'none';
    }
}

function navigateImage(delta) {
    const newIndex = currentImageIndex + delta;
    if (newIndex < 0 || newIndex >= imageFiles.length) return;
    currentImageIndex = newIndex;
    detectionResult.value = '';
    fileScanResults = [];
    loadImageAtIndex(currentImageIndex);
}

function loadImage2Canvas(base64Image) {
    imageFile.src = base64Image;
    img.src = base64Image;
    img.onload = async function () {
        let width = img.width;
        let height = img.height;

        overlayCanvas.width = width;
        overlayCanvas.height = height;
        imagePreviewContainer.style.display = 'block';
        videoFileWrapper.style.display = 'none';

        if (!isSDKReady) {
            alert('Dynamsoft Barcode Reader is not ready yet. Please activate it in Settings.');
            return;
        }

        let context = overlayCanvas.getContext('2d');
        context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        try {
            await resetOrReapplyDynamsoftSettings();
            let result = await cvr.capture(img.src, dynamsoftTemplate);
            showFileResult(context, result);
        } catch (ex) {
            console.error(ex);
            detectionResult.value += 'Scanning failed: ' + ex.message + '\n';
        }
    };
}

function loadVideoFile(file) {
    let url = URL.createObjectURL(file);
    videoFilePlayer.src = url;

    videoFilePlayer.onloadedmetadata = function () {
        videoFileWrapper.style.display = 'block';
        imagePreviewContainer.style.display = 'none';
        videoOverlay.width = videoFilePlayer.videoWidth;
        videoOverlay.height = videoFilePlayer.videoHeight;

        if (!isSDKReady) {
            detectionResult.value = 'Dynamsoft Barcode Reader is not ready yet. Please activate it in Settings.\n';
            return;
        }

        startFileScanning();
    };
}

// ========== Video File Scanning ==========
function startFileScanning() {
    fileScanning = true;
    fileScanResults = [];
    detectionResult.value = '';
    let ctx = videoOverlay.getContext('2d');
    let tempCanvas = document.createElement('canvas');
    let tempCtx = tempCanvas.getContext('2d');

    const scanFrame = async () => {
        if (!fileScanning || videoFilePlayer.paused || videoFilePlayer.ended) {
            if (!videoFilePlayer.ended) {
                fileScanning = false;
            }
            return;
        }

        if (videoFilePlayer.readyState >= 2) {
            tempCanvas.width = videoFilePlayer.videoWidth;
            tempCanvas.height = videoFilePlayer.videoHeight;
            tempCtx.drawImage(videoFilePlayer, 0, 0, tempCanvas.width, tempCanvas.height);

            if (videoOverlay.width !== videoFilePlayer.videoWidth || videoOverlay.height !== videoFilePlayer.videoHeight) {
                videoOverlay.width = videoFilePlayer.videoWidth;
                videoOverlay.height = videoFilePlayer.videoHeight;
                ctx = videoOverlay.getContext('2d');
            }

            try {
                ctx.clearRect(0, 0, videoOverlay.width, videoOverlay.height);
                await scanVideoFrameDynamsoft(tempCanvas, ctx);
            } catch (ex) {
                console.error('Video scanning error:', ex);
            }
        }

        if (fileScanning && !videoFilePlayer.ended) {
            fileAnimationFrame = requestAnimationFrame(scanFrame);
        } else {
            fileScanning = false;
        }
    };

    videoFilePlayer.play();
    scanFrame();
}

function stopFileScanning() {
    fileScanning = false;
    if (fileAnimationFrame) {
        cancelAnimationFrame(fileAnimationFrame);
        fileAnimationFrame = null;
    }
    if (videoOverlay) {
        let ctx = videoOverlay.getContext('2d');
        ctx.clearRect(0, 0, videoOverlay.width, videoOverlay.height);
    }
}

async function scanVideoFrameDynamsoft(canvas, ctx) {
    await resetOrReapplyDynamsoftSettings();
    let result = await cvr.capture(canvas, dynamsoftTemplate);

    if (!result.items || result.items.length === 0) return;

    for (let item of result.items) {
        if (item.type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
            continue;
        }

        let type = item.formatString || 'Unknown';
        let key = `[${type}] ${item.text}`;
        if (fileScanResults.includes(key)) continue;

        fileScanResults.push(key);

        let points = item.location.points;
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.lineTo(points[2].x, points[2].y);
        ctx.lineTo(points[3].x, points[3].y);
        ctx.closePath();
        ctx.stroke();
    }

    detectionResult.value = fileScanResults.join('\n') + '\n\n';
}

// ========== Image Result Rendering ==========
function showFileResult(context, result) {
    detectionResult.value = '';
    let txts = [];
    let items = result.items;

    if (items.length > 0) {
        for (let i = 0; i < items.length; ++i) {
            if (items[i].type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                continue;
            }

            let item = items[i];
            txts.push(`[${item.formatString || 'Unknown'}] ${item.text}`);

            let points = item.location.points;
            context.strokeStyle = '#ff0000';
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            context.lineTo(points[1].x, points[1].y);
            context.lineTo(points[2].x, points[2].y);
            context.lineTo(points[3].x, points[3].y);
            context.closePath();
            context.stroke();
        }

        if (txts.length > 0) {
            detectionResult.value += `Total: ${txts.length} barcode(s)\n` + txts.join('\n') + '\n\n';
        } else {
            detectionResult.value += 'Recognition Failed\n';
        }
    } else {
        detectionResult.value += 'Nothing found\n';
    }
}

document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            handleFile(item.getAsFile());
        }
    }
});

document.getElementById('pick_file').addEventListener('change', function () {
    if (this.files.length === 0) return;
    handleFiles(Array.from(this.files));
});

// ========== SDK Activation ==========
async function activateDynamsoft() {
    let inputElement = document.getElementById('dynamsoft_license_key');
    let licenseKey = (inputElement.value || '').trim() || inputElement.placeholder;

    let btn = document.getElementById('dynamsoft_activate_btn');

    // Already activated with this exact key — nothing to do
    if (isSDKReady && licenseKey === activatedLicenseKey) return;

    btn.disabled = true;
    btn.textContent = 'Activating...';
    showLoading('Initializing Dynamsoft Barcode Reader...');

    try {
        await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);

        if (!wasmLoaded) {
            await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
            wasmLoaded = true;
        }

        if (!cvr) {
            cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
        }

        // Apply any custom template that was loaded before activation
        if (dynamsoftCustomTemplateContent) {
            await applyDynamsoftTemplateContent(dynamsoftCustomTemplateContent);
        }

        activatedLicenseKey = licenseKey;
        isSDKReady = true;
        saveLicenseKey(licenseKey);
        updateSDKBadge();

        console.log('Dynamsoft Barcode Reader activated');
        btn.textContent = 'Activated';
        btn.disabled = false; // allow re-activating with a different key

        // If the live camera is already open, start scanning right away
        if (dropdown.value === 'camera' && stream) {
            startCameraScanning();
        }
    } catch (ex) {
        console.error(ex);
        isSDKReady = false;
        updateSDKBadge();
        alert('Failed to activate Dynamsoft Barcode Reader: ' + (ex.message || ex));
        btn.disabled = false;
        btn.textContent = 'Activate';
    } finally {
        hideLoading();
    }
}

// ========== License Key Caching ==========
function saveLicenseKey(key) {
    try { localStorage.setItem('barcodeScanner_dynamsoft_license', key); } catch (e) { }
}

function loadLicenseKey() {
    try { return localStorage.getItem('barcodeScanner_dynamsoft_license') || ''; } catch (e) { return ''; }
}

function restoreLicenseKey() {
    let saved = loadLicenseKey();
    if (saved) {
        document.getElementById('dynamsoft_license_key').value = saved;
    }
}

// The SDK is never activated automatically — the user opens Settings and clicks Activate.
window.addEventListener('DOMContentLoaded', function () {
    restoreLicenseKey();
    updateSDKBadge();

    // Typing a different key re-enables the Activate button
    const licenseInput = document.getElementById('dynamsoft_license_key');
    licenseInput.addEventListener('input', function () {
        let btn = document.getElementById('dynamsoft_activate_btn');
        btn.disabled = false;
        if (btn.textContent !== 'Activate') btn.textContent = 'Activate';
    });
});

// ========== Camera ==========
async function initCamera() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
            let devices = await navigator.mediaDevices.enumerateDevices();
            cameraSource.innerHTML = '';
            devices.forEach(device => {
                if (device.kind === 'videoinput') {
                    let option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label;
                    cameraSource.appendChild(option);
                }
            });

            if (cameraSource.options.length > 0) {
                cameraChanged();
            } else {
                alert('No camera found.');
            }
        } catch (error) {
            console.error('Error enumerating devices:', error);
        }
    } else {
        alert('getUserMedia is not supported in this browser.');
    }
}

async function cameraChanged() {
    stopCameraScanning();
    let deviceId = cameraSource.value;
    let constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    try {
        stopCamera();
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        startCameraScanning();
    } catch (error) {
        console.error('Error accessing camera:', error);
    }
}

function startCameraScanning() {
    if (!isSDKReady) return;

    cameraScanning = true;
    cameraScanResults = [];
    scanResult.value = '';
    let ctx = cameraOverlay.getContext('2d');

    const captureFrame = async () => {
        if (!cameraScanning) return;

        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            let canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            let frameCtx = canvas.getContext('2d');
            frameCtx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

            if (cameraOverlay.width !== videoElement.videoWidth || cameraOverlay.height !== videoElement.videoHeight) {
                cameraOverlay.width = videoElement.videoWidth;
                cameraOverlay.height = videoElement.videoHeight;
                ctx = cameraOverlay.getContext('2d');
            }

            try {
                let result = await cvr.capture(canvas.toDataURL('image/jpeg'), dynamsoftTemplate);
                if (cameraScanning) {
                    showCameraResult(result);
                }
            } catch (ex) {
                console.error(ex);
            }
        }

        if (cameraScanning) {
            cameraAnimationFrame = requestAnimationFrame(captureFrame);
        }
    };

    cameraAnimationFrame = requestAnimationFrame(captureFrame);
}

function stopCameraScanning() {
    cameraScanning = false;
    if (cameraAnimationFrame) {
        cancelAnimationFrame(cameraAnimationFrame);
        cameraAnimationFrame = null;
    }
    if (cameraOverlay && cameraOverlay.width > 0) {
        let ctx = cameraOverlay.getContext('2d');
        ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        stream = null;
    }
    stopCameraScanning();
    if (cameraOverlay) {
        let ctx = cameraOverlay.getContext('2d');
        ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    }
}

function showCameraResult(result) {
    let txts = [];
    let items = result.items;

    let ctx = cameraOverlay.getContext('2d');
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    if (items.length === 0) return;

    for (let i = 0; i < items.length; ++i) {
        if (items[i].type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
            continue;
        }

        let type = items[i].formatString || 'Unknown';
        let key = `[${type}] ${items[i].text}`;
        if (!cameraScanResults.includes(key)) {
            cameraScanResults.push(key);
        }
        txts.push(items[i].text);

        let points = items[i].location.points;
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.lineTo(points[2].x, points[2].y);
        ctx.lineTo(points[3].x, points[3].y);
        ctx.closePath();
        ctx.stroke();
    }

    if (txts.length > 0) {
        scanResult.value = cameraScanResults.join('\n') + '\n\n';
    }
}

// ========== Loading Indicator ==========
function showLoading(text) {
    if (!loadingIndicator) return;
    if (text && loadingText) loadingText.textContent = text;
    loadingIndicator.style.display = 'flex';
}

function hideLoading() {
    if (!loadingIndicator) return;
    loadingIndicator.style.display = 'none';
}

// ========== Settings Modal ==========
function openSettings() {
    settingsModal.style.display = 'flex';
    updateSDKBadge();
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

function updateSDKBadge() {
    let badge = document.getElementById('dynamsoft_status');
    if (badge) {
        badge.className = 'sdk-badge ' + (isSDKReady ? 'badge-active' : 'badge-inactive');
        badge.textContent = isSDKReady ? 'Activated' : 'Not Activated';
    }
}

// Close modal on overlay click
document.addEventListener('click', function (e) {
    if (e.target.id === 'settings_modal') {
        closeSettings();
    }
});

// ========== Mode Toggle ==========
function setMode(mode) {
    currentMode = mode;
    document.getElementById('mode_default').classList.toggle('toggle-active', mode === 'default');
    document.getElementById('mode_benchmark').classList.toggle('toggle-active', mode === 'benchmark');

    let defaultResultSection = document.getElementById('default_result_section');
    let benchmarkSection = document.getElementById('benchmark_section');

    if (mode === 'benchmark') {
        defaultResultSection.style.display = 'none';
        benchmarkSection.style.display = 'block';
    } else {
        defaultResultSection.style.display = 'block';
        benchmarkSection.style.display = 'none';
    }
}

// ========== Benchmark ==========
async function runBenchmark() {
    if (benchmarkRunning) return;

    if (!isSDKReady) {
        alert('Dynamsoft Barcode Reader is not ready yet. Please activate it in Settings.');
        return;
    }

    if (!imageFiles || imageFiles.length === 0) {
        if (!img.src || !img.complete || img.naturalWidth === 0) {
            alert('Please load one or more images first.');
            return;
        }
    }

    benchmarkRunning = true;
    let progressDiv = document.getElementById('benchmark_progress');
    let progressBar = document.getElementById('benchmark_progress_bar');
    let progressText = document.getElementById('benchmark_progress_text');
    let resultsContainer = document.getElementById('benchmark_results_container');

    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    resultsContainer.innerHTML = '';

    // Build the list of images to benchmark
    let imagesToBenchmark = [];
    if (imageFiles && imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
            imagesToBenchmark.push({ file: imageFiles[i], name: imageFiles[i].name });
        }
    } else {
        imagesToBenchmark.push({ file: null, name: 'Current Image' });
    }

    let results = [];

    for (let i = 0; i < imagesToBenchmark.length; i++) {
        let imgInfo = imagesToBenchmark[i];
        progressText.textContent = `Image ${i + 1}/${imagesToBenchmark.length}...`;
        progressBar.style.width = ((i / imagesToBenchmark.length) * 100) + '%';

        let testImg = imgInfo.file ? await loadImageFromFile(imgInfo.file) : img;

        // Look up ground truth for this image (matched by filename)
        let groundTruth = null;
        if (annotationData && annotationData[imgInfo.name]) {
            groundTruth = annotationData[imgInfo.name].map(b => b.text);
        }

        results.push(await benchmarkSingleImage(testImg, imgInfo.name, groundTruth));
    }

    progressBar.style.width = '100%';
    progressText.textContent = 'Done!';

    renderBenchmarkResults(results);
    benchmarkRunning = false;

    document.getElementById('benchmark_export_btn').style.display = 'inline-flex';
    lastBenchmarkData = results;

    setTimeout(() => { progressDiv.style.display = 'none'; }, 1500);
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = function (e) {
            let tempImg = new Image();
            tempImg.onload = () => resolve(tempImg);
            tempImg.onerror = () => reject(new Error('Failed to load image: ' + file.name));
            tempImg.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
        reader.readAsDataURL(file);
    });
}

// Returns { imageName, barcodes: [{type, text}], time, error, gtResult }
async function benchmarkSingleImage(testImg, imageName, groundTruth = null) {
    let barcodes = [];
    let startTime = performance.now();

    try {
        await resetOrReapplyDynamsoftSettings();
        let result = await cvr.capture(testImg.src, dynamsoftTemplate);
        if (result.items && result.items.length > 0) {
            for (let item of result.items) {
                if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                    barcodes.push({ type: item.formatString || 'Unknown', text: item.text });
                }
            }
        }
    } catch (ex) {
        console.error('Benchmark error:', ex);
        return {
            imageName,
            barcodes: [],
            time: performance.now() - startTime,
            error: ex.message || String(ex),
            gtResult: groundTruth ? computeGTResult([], groundTruth) : null
        };
    }

    return {
        imageName,
        barcodes,
        time: performance.now() - startTime,
        error: null,
        gtResult: groundTruth ? computeGTResult(barcodes.map(b => b.text), groundTruth) : null
    };
}

function renderBenchmarkResults(results) {
    let container = document.getElementById('benchmark_results_container');

    if (results.length === 0) {
        container.innerHTML = '<div class="benchmark-no-result">No results to display.</div>';
        return;
    }

    container.innerHTML = buildBenchmarkHtml(results);
}

function buildBenchmarkHtml(results) {
    const hasAnyGT = results.some(r => r.gtResult !== null);

    let totalBarcodes = 0;
    let totalTime = 0;
    let errors = 0;
    let allTexts = new Set();
    let totalTP = 0;
    let totalFP = 0;
    let totalExpected = 0;

    for (let r of results) {
        totalBarcodes += r.barcodes.length;
        totalTime += r.time;
        if (r.error) errors++;
        for (let b of r.barcodes) allTexts.add(b.text);
        if (r.gtResult) {
            totalTP += r.gtResult.tp;
            totalFP += r.gtResult.fp;
            totalExpected += r.gtResult.total;
        }
    }

    const avgTime = results.length > 0 ? totalTime / results.length : 0;
    const detectionRate = totalExpected > 0 ? totalTP / totalExpected : null;
    const precision = (totalTP + totalFP) > 0 ? totalTP / (totalTP + totalFP) : null;
    const fastest = results.reduce((a, b) => (a.time <= b.time ? a : b));
    const slowest = results.reduce((a, b) => (a.time >= b.time ? a : b));
    const most = results.reduce((a, b) => (a.barcodes.length >= b.barcodes.length ? a : b));

    // ---- Summary ----
    let html = '<div class="benchmark-summary">';
    html += `<h4>Summary (${results.length} image${results.length > 1 ? 's' : ''})</h4>`;
    html += '<ul>';
    html += `<li>Total barcodes found: <strong>${totalBarcodes}</strong></li>`;
    html += `<li>Unique barcodes: <strong>${allTexts.size}</strong></li>`;
    html += `<li>Total time: <strong>${totalTime.toFixed(0)} ms</strong> — avg <strong>${avgTime.toFixed(0)} ms</strong> per image</li>`;
    if (results.length > 1) {
        html += `<li>Fastest image: <strong>${escapeHtml(fastest.imageName)}</strong> (${fastest.time.toFixed(0)} ms)</li>`;
        html += `<li>Slowest image: <strong>${escapeHtml(slowest.imageName)}</strong> (${slowest.time.toFixed(0)} ms)</li>`;
        html += `<li>Most barcodes: <strong>${escapeHtml(most.imageName)}</strong> (${most.barcodes.length})</li>`;
    }
    if (hasAnyGT) {
        html += `<li>Ground truth: <strong>${totalTP}/${totalExpected}</strong> detected — rate <span class="${gtRateClass(detectionRate)}">${(detectionRate * 100).toFixed(1)}%</span>, precision <span class="${gtRateClass(precision)}">${(precision * 100).toFixed(1)}%</span></li>`;
    }
    if (errors > 0) {
        html += `<li>Errors: <strong style="color:#dc2626;">${errors}</strong></li>`;
    }
    html += '</ul></div>';

    // ---- Per-image table ----
    html += '<div class="benchmark-table-wrap"><table class="benchmark-table">';
    if (hasAnyGT) {
        html += '<thead><tr><th>Image</th><th>Found</th><th>Expected</th><th>Detected ✓</th><th>Rate</th><th>Precision</th><th>Time</th><th>Details</th></tr></thead>';
    } else {
        html += '<thead><tr><th>Image</th><th>Barcodes Found</th><th>Time</th><th>Details</th></tr></thead>';
    }
    html += '<tbody>';

    let maxCount = Math.max(...results.map(r => r.barcodes.length));

    for (let r of results) {
        let count = r.barcodes.length;
        let countClass = (count === maxCount && count > 0) ? 'count-col best-count' : 'count-col';

        let detailHtml = '';
        if (r.error) {
            detailHtml = `<em style="color:#ef4444;">Error: ${escapeHtml(r.error)}</em>`;
        } else if (count > 0) {
            detailHtml = '<ul class="barcodes-list">';
            for (let b of r.barcodes) {
                detailHtml += `<li>[${escapeHtml(b.type)}] ${escapeHtml(b.text)}</li>`;
            }
            detailHtml += '</ul>';
        } else {
            detailHtml = '<em>Nothing found</em>';
        }

        if (hasAnyGT) {
            let gt = r.gtResult;
            let tp = gt ? gt.tp : '-';
            let expected = gt ? gt.total : '-';
            let rateHtml = gt ? `<span class="${gtRateClass(gt.detectionRate)}">${(gt.detectionRate * 100).toFixed(1)}%</span>` : '<em>N/A</em>';
            let precHtml = gt ? `<span class="${gtRateClass(gt.precision)}">${(gt.precision * 100).toFixed(1)}%</span>` : '<em>N/A</em>';
            html += `<tr>
                <td class="sdk-col">${escapeHtml(r.imageName)}</td>
                <td class="${countClass}">${count}</td>
                <td class="count-col">${expected}</td>
                <td class="count-col">${tp}</td>
                <td class="rate-col">${rateHtml}</td>
                <td class="rate-col">${precHtml}</td>
                <td class="time-col">${r.time.toFixed(0)} ms</td>
                <td>${detailHtml}</td>
            </tr>`;
        } else {
            html += `<tr>
                <td class="sdk-col">${escapeHtml(r.imageName)}</td>
                <td class="${countClass}">${count}</td>
                <td class="time-col">${r.time.toFixed(0)} ms</td>
                <td>${detailHtml}</td>
            </tr>`;
        }
    }

    html += '</tbody></table></div>';
    return html;
}

function escapeHtml(str) {
    let div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function exportBenchmarkResults() {
    if (!lastBenchmarkData) return;

    const reportHtml = buildBenchmarkHtml(lastBenchmarkData);
    const timestamp = new Date().toLocaleString();
    const imageCount = lastBenchmarkData.length;

    const fullPage = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Barcode Scanner Benchmark Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
  .report-header { background: #fff; border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .report-header h1 { margin: 0 0 6px; font-size: 1.6rem; color: #0f172a; }
  .report-header p { margin: 2px 0; font-size: 0.88rem; color: #64748b; }
  .benchmark-table-wrap { overflow-x: auto; margin-bottom: 16px; }
  .benchmark-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.07); font-size: 0.9rem; }
  .benchmark-table th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; }
  .benchmark-table td { padding: 9px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .benchmark-table tr:last-child td { border-bottom: none; }
  .benchmark-table tr:hover td { background: #f8fafc; }
  .sdk-col { font-weight: 600; white-space: nowrap; }
  .count-col { text-align: center; font-weight: 700; font-size: 1.05em; }
  .best-count { color: #16a34a; }
  .time-col { white-space: nowrap; color: #64748b; }
  .rate-col { text-align: center; white-space: nowrap; font-weight: 600; }
  .gt-good { color: #16a34a; }
  .gt-ok { color: #d97706; }
  .gt-poor { color: #dc2626; }
  .barcodes-list { margin: 0; padding-left: 16px; }
  .barcodes-list li { margin-bottom: 2px; font-size: 0.85em; font-family: monospace; }
  .benchmark-summary { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 4px rgba(0,0,0,.07); margin-top: 8px; }
  .benchmark-summary h4 { margin: 0 0 10px; font-size: 1rem; color: #334155; }
  .benchmark-summary ul { margin: 8px 0 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.8; }
  .benchmark-image-title { font-size: 0.95rem; font-weight: 600; color: #475569; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="report-header">
  <h1>📊 Barcode Scanner Benchmark Report</h1>
  <p><strong>Generated:</strong> ${escapeHtml(timestamp)}</p>
  <p><strong>Images tested:</strong> ${imageCount}</p>
  <p><strong>SDK:</strong> Dynamsoft Barcode Reader</p>
</div>
${reportHtml}
</body>
</html>`;

    const blob = new Blob([fullPage], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'benchmark_report.html';
    a.click();
    URL.revokeObjectURL(url);
}

// ========== Dynamsoft Template ==========
async function resetOrReapplyDynamsoftSettings() {
    if (dynamsoftCustomTemplateContent) {
        await cvr.initSettings(dynamsoftCustomTemplateContent);
    } else {
        await cvr.resetSettings();
    }
}

async function applyDynamsoftTemplateContent(jsonContent) {
    try {
        await cvr.initSettings(jsonContent);
        // Extract the first task name from the CaptureVisionTemplates array
        const parsed = JSON.parse(jsonContent);
        const templates = parsed.CaptureVisionTemplates || parsed.CaptureVisionTemplate;
        if (Array.isArray(templates) && templates.length > 0 && templates[0].Name) {
            dynamsoftTemplate = templates[0].Name;
        } else if (templates && templates.Name) {
            dynamsoftTemplate = templates.Name;
        }
        console.log('Dynamsoft custom template applied, task name:', dynamsoftTemplate);
    } catch (ex) {
        console.error('Failed to apply Dynamsoft template:', ex);
        throw ex;
    }
}

function loadDynamsoftTemplate(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
        const content = e.target.result;
        const statusEl = document.getElementById('dynamsoft_template_status');
        const clearBtn = document.getElementById('dynamsoft_template_clear_btn');
        try {
            JSON.parse(content); // validate JSON
            dynamsoftCustomTemplateContent = content;

            if (cvr && isSDKReady) {
                await applyDynamsoftTemplateContent(content);
                statusEl.textContent = `\u2713 ${file.name} (task: ${dynamsoftTemplate})`;
            } else {
                dynamsoftTemplate = 'ReadBarcodes_Default'; // reset until applied
                statusEl.textContent = `\u23F3 ${file.name} (applied on activation)`;
            }
            statusEl.style.color = 'var(--success-color)';
            clearBtn.style.display = 'inline-flex';
        } catch (err) {
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.style.color = '#ef4444';
            clearBtn.style.display = 'none';
            dynamsoftCustomTemplateContent = null;
        }
        input.value = '';
    };
    reader.readAsText(file);
}

function clearDynamsoftTemplate() {
    dynamsoftCustomTemplateContent = null;
    dynamsoftTemplate = 'ReadBarcodes_Default';
    const statusEl = document.getElementById('dynamsoft_template_status');
    if (statusEl) { statusEl.textContent = 'Using built-in default'; statusEl.style.color = ''; }
    const clearBtn = document.getElementById('dynamsoft_template_clear_btn');
    if (clearBtn) clearBtn.style.display = 'none';
    if (cvr && isSDKReady) {
        cvr.resetSettings().catch(() => { });
    }
}

// ========== Annotation Ground Truth ==========
function importAnnotations(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.images || !Array.isArray(data.images)) {
                throw new Error('Invalid format. Expected an "images" array.');
            }
            annotationData = {};
            for (const entry of data.images) {
                if (entry.file && Array.isArray(entry.barcodes)) {
                    annotationData[entry.file] = entry.barcodes;
                }
            }
            const count = Object.keys(annotationData).length;
            const totalBarcodes = Object.values(annotationData).reduce((sum, barcodes) => sum + barcodes.length, 0);
            const statusEl = document.getElementById('annotation_status');
            statusEl.textContent = `\u2713 ${count} images, ${totalBarcodes} barcodes loaded`;
            statusEl.style.color = 'var(--success-color)';
            document.getElementById('annotation_clear_btn').style.display = 'inline-flex';
        } catch (err) {
            annotationData = null;
            const statusEl = document.getElementById('annotation_status');
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.style.color = '#ef4444';
            document.getElementById('annotation_clear_btn').style.display = 'none';
        }
        input.value = '';
    };
    reader.readAsText(file);
}

function clearAnnotations() {
    annotationData = null;
    const statusEl = document.getElementById('annotation_status');
    if (statusEl) statusEl.textContent = '';
    const clearBtn = document.getElementById('annotation_clear_btn');
    if (clearBtn) clearBtn.style.display = 'none';
}

function matchBarcodeText(detected, expected) {
    if (detected === expected) return true;
    // UPC-A (12 digits) vs EAN-13 (13 digits with leading 0) equivalence
    if (detected.length === 12 && expected.length === 13 && expected === '0' + detected) return true;
    if (detected.length === 13 && expected.length === 12 && detected === '0' + expected) return true;
    // Detected may include an appended check digit (up to 2 extra chars)
    if (detected.startsWith(expected) && detected.length <= expected.length + 2) return true;
    return false;
}

function computeGTResult(detectedTexts, expectedTexts) {
    const matchedExpectedIndices = new Set();
    const matchedDetectedIndices = new Set();
    for (let i = 0; i < expectedTexts.length; i++) {
        for (let j = 0; j < detectedTexts.length; j++) {
            if (!matchedDetectedIndices.has(j) && matchBarcodeText(detectedTexts[j], expectedTexts[i])) {
                matchedExpectedIndices.add(i);
                matchedDetectedIndices.add(j);
                break;
            }
        }
    }
    const tp = matchedExpectedIndices.size;
    const fp = detectedTexts.length - matchedDetectedIndices.size;
    const detectionRate = expectedTexts.length > 0 ? tp / expectedTexts.length : 0;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : (tp > 0 ? 1 : 0);
    return { tp, fp, fn: expectedTexts.length - tp, detectionRate, precision, total: expectedTexts.length };
}

function gtRateClass(rate) {
    if (rate >= 0.9) return 'gt-good';
    if (rate >= 0.7) return 'gt-ok';
    return 'gt-poor';
}
