let dropdown = document.getElementById('dropdown');
let cameraSource = document.getElementById('camera_source');
let imageFile = document.getElementById('image_file');
let overlayCanvas = document.getElementById('overlay_canvas');
let cameraOverlay = document.getElementById('camera_overlay');
let videoElement = document.getElementById('camera_view');
let scanResult = document.getElementById('scan_result');
let videoFilePlayer = document.getElementById('video_file_player');
let videoOverlay = document.getElementById('video_overlay');
let detectionResult = document.getElementById('detection_result');
let imagePreviewContainer = document.getElementById('image_preview_container');
let videoFileWrapper = document.getElementById('video_file_wrapper');

let cvr;
let currentSDK = 'zxing';
let isSDKReady = false;
let img = new Image();
let stream;

// SDK activation tracking
let sdkActivated = {
    zxing: false,
    dynamsoft: false,
    strich: false,
    scanbot: false,
    scandit: false
};

// Strich.io state
let strichInitialized = false;

// Scanbot state
let scanbotSDK = null;
let scanbotInitialized = false;

// Scandit state
let scanditContext = null;
let scanditBarcodeBatch = null;
let scanditInitialized = false;

// File scanning state
let fileScanning = false;
let fileAnimationFrame = null;
let fileScanResults = [];

// Camera scanning state
let cameraScanning = false;
let cameraAnimationFrame = null;
let cameraScanResults = [];

// Multi-image state
let imageFiles = [];
let currentImageIndex = 0;
let imageNavigator = document.getElementById('image_navigator');
let navigatorCounter = document.getElementById('navigator_counter');

// Mode state
let currentMode = 'default'; // 'default' or 'benchmark'
let benchmarkRunning = false;

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

// Prevent browser from opening dragged files anywhere on the page
document.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

document.addEventListener('drop', function (event) {
    event.preventDefault();
}, false);

// Drop zone: the file upload label area
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

async function selectChanged() {
    stopCameraScanning();

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

function handleFiles(files) {
    if (!files || files.length === 0) return;

    // Separate images from videos
    const images = files.filter(f => f.type.startsWith('image/'));
    const videos = files.filter(f => f.type.startsWith('video/'));

    if (images.length > 0) {
        // Load all images into the navigator
        stopFileScanning();
        detectionResult.value = '';
        fileScanResults = [];
        videoFileWrapper.style.display = 'none';

        imageFiles = images;
        currentImageIndex = 0;
        loadImageAtIndex(0);
    } else if (videos.length > 0) {
        // Only handle first video
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

    // Update navigator
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
            alert('Please activate the SDK first.');
            return;
        }

        let context = overlayCanvas.getContext('2d');
        context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        try {
            if (currentSDK === 'dynamsoft') {
                await cvr.resetSettings();
                let result = await cvr.capture(img.src, 'ReadBarcodes_Default');
                showFileResult(context, result);
            } else if (currentSDK === 'strich') {
                await scanImageWithStrich(img, context);
            } else if (currentSDK === 'scanbot') {
                await scanImageWithScanbot(img, context);
            } else if (currentSDK === 'scandit') {
                await scanImageWithScandit(img, context);
            } else {
                const blob = await fetch(base64Image).then(res => res.blob());
                let result = await ZXingWASM.readBarcodes(blob);
                showFileResultZXing(context, result);
            }
        }
        catch (ex) {
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
            detectionResult.value = 'Please activate the SDK first.\n';
            return;
        }

        startFileScanning();
    };
}

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

                if (currentSDK === 'dynamsoft') {
                    await scanVideoFrameDynamsoft(tempCanvas, ctx);
                } else if (currentSDK === 'strich') {
                    await scanVideoFrameStrich(tempCanvas, ctx);
                } else if (currentSDK === 'scanbot') {
                    await scanVideoFrameScanbot(tempCanvas, ctx);
                } else if (currentSDK === 'scandit') {
                    await scanVideoFrameScandit(tempCanvas, ctx);
                } else {
                    await scanVideoFrameZXing(tempCtx, tempCanvas, ctx);
                }
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

function showFileResult(context, result) {
    detectionResult.value = '';
    let txts = [];
    let items = result.items;
    if (items.length > 0) {
        for (var i = 0; i < items.length; ++i) {
            if (items[i].type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                continue;
            }

            let item = items[i];
            let type = item.formatString || 'Unknown';
            txts.push(`[${type}] ${item.text}`);
            let localization = item.location;

            context.strokeStyle = '#ff0000';
            context.lineWidth = 2;

            let points = localization.points;
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
    }
    else {
        detectionResult.value += 'Nothing found\n';
    }
}

function showFileResultZXing(context, results) {
    detectionResult.value = '';
    let txts = [];

    if (results && results.length > 0) {
        for (let result of results) {
            let type = result.format || 'Unknown';
            txts.push(`[${type}] ${result.text}`);

            if (result.position) {
                context.strokeStyle = '#ff0000';
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(result.position.topLeft.x, result.position.topLeft.y);
                context.lineTo(result.position.topRight.x, result.position.topRight.y);
                context.lineTo(result.position.bottomRight.x, result.position.bottomRight.y);
                context.lineTo(result.position.bottomLeft.x, result.position.bottomLeft.y);
                context.closePath();
                context.stroke();
            }
        }
        detectionResult.value += `Total: ${txts.length} barcode(s)\n` + txts.join('\n') + '\n\n';
    } else {
        detectionResult.value += 'Nothing found\n';
    }
}

document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            const blob = item.getAsFile();
            handleFile(blob);
        }
    }
});

function sdkChanged() {
    let sdkSelector = document.getElementById('sdk_selector');
    currentSDK = sdkSelector.value;

    // Clear scan results when switching SDKs
    detectionResult.value = '';
    scanResult.value = '';

    // If already activated, just switch to it
    if (sdkActivated[currentSDK]) {
        isSDKReady = true;
        return;
    }

    // ZXing is free, auto-activate
    if (currentSDK === 'zxing') {
        initZXing();
        return;
    }

    // Not activated — prompt user to open settings
    isSDKReady = false;
    openSettings();
}

async function initZXing() {
    try {
        if (typeof ZXingWASM === 'undefined') {
            throw new Error('ZXingWASM is not loaded');
        }
        isSDKReady = true;
        currentSDK = 'zxing';
        sdkActivated.zxing = true;
        console.log('ZXing SDK ready');
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize ZXing SDK: ' + ex.message);
    }
}

async function activateDynamsoft() {
    if (sdkActivated.dynamsoft) return;
    let divElement = document.getElementById('dynamsoft_license_key');
    let licenseKey = divElement.value == '' ? divElement.placeholder : divElement.value;

    let btn = document.getElementById('dynamsoft_activate_btn');
    btn.disabled = true;
    btn.textContent = 'Activating...';

    try {
        await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);
        await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        sdkActivated.dynamsoft = true;
        saveLicenseKey('dynamsoft', licenseKey);
        updateSDKBadge('dynamsoft');
        if (currentSDK === 'dynamsoft') {
            isSDKReady = true;
        }
        console.log('Dynamsoft SDK activated');
        btn.textContent = 'Activated';
    }
    catch (ex) {
        console.error(ex);
        alert('Failed to activate Dynamsoft SDK.');
        btn.disabled = false;
        btn.textContent = 'Activate';
    }
}

async function activateStrich() {
    if (sdkActivated.strich) return;
    let licenseKey = document.getElementById('strich_license_key').value.trim();
    if (!licenseKey) {
        alert('Please enter a Strich.io license key.');
        return;
    }

    let btn = document.getElementById('strich_activate_btn');
    btn.disabled = true;
    btn.textContent = 'Activating...';

    try {
        await strich.StrichSDK.initialize(licenseKey);
        strichInitialized = true;
        sdkActivated.strich = true;
        saveLicenseKey('strich', licenseKey);
        updateSDKBadge('strich');
        if (currentSDK === 'strich') {
            isSDKReady = true;
        }
        console.log('Strich.io SDK initialized');
        btn.textContent = 'Activated';
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize Strich.io SDK: ' + (ex.message || ex));
        btn.disabled = false;
        btn.textContent = 'Activate';
    }
}

const STRICH_SYMBOLOGIES = ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upca', 'upce', 'itf', 'codabar', 'datamatrix', 'pdf417', 'aztec'];

async function scanImageWithStrich(imageElement, context) {
    if (!strichInitialized) {
        throw new Error('Strich SDK not initialized');
    }

    const detections = await strich.ImageScanner.scan(imageElement, {
        engine: { symbologies: STRICH_SYMBOLOGIES }
    });

    if (detections && detections.length > 0) {
        let txts = [];
        for (const detection of detections) {
            txts.push(detection.data);

            if (detection.quadrilateral && detection.quadrilateral.points) {
                const pts = detection.quadrilateral.points;
                context.strokeStyle = '#ff0000';
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(pts[0].x, pts[0].y);
                context.lineTo(pts[1].x, pts[1].y);
                context.lineTo(pts[2].x, pts[2].y);
                context.lineTo(pts[3].x, pts[3].y);
                context.closePath();
                context.stroke();
            }
        }
        detectionResult.value = `Total: ${txts.length} barcode(s)\n` + txts.join('\n') + '\n\n';
    } else {
        detectionResult.value = 'Nothing found\n';
    }
}

async function activateScanbot() {
    if (sdkActivated.scanbot) return;
    let licenseKey = document.getElementById('scanbot_license_key').value.trim();
    // Save the raw key (with literal \n) before converting
    let rawKey = licenseKey;
    // Convert literal \n sequences to actual newlines (common in Scanbot license keys)
    licenseKey = licenseKey.replace(/\\n/g, '\n');

    let btn = document.getElementById('scanbot_activate_btn');
    btn.disabled = true;
    btn.textContent = 'Activating...';

    try {
        scanbotSDK = await ScanbotSDK.initialize({
            licenseKey: licenseKey,
            enginePath: 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8/bundle/bin/complete/'
        });
        scanbotInitialized = true;
        sdkActivated.scanbot = true;
        saveLicenseKey('scanbot', rawKey);
        updateSDKBadge('scanbot');
        if (currentSDK === 'scanbot') {
            isSDKReady = true;
        }
        console.log('Scanbot SDK initialized');
        btn.textContent = 'Activated';
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize Scanbot SDK: ' + (ex.message || ex));
        btn.disabled = false;
        btn.textContent = 'Activate';
    }
}

async function scanImageWithScanbot(imageElement, context) {
    if (!scanbotInitialized) {
        throw new Error('Scanbot SDK not initialized');
    }

    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageElement, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');

    const result = await scanbotSDK.detectBarcodes(dataUrl);

    if (result && result.barcodes && result.barcodes.length > 0) {
        let txts = [];
        for (const barcode of result.barcodes) {
            let type = barcode.format || 'Unknown';
            txts.push(`[${type}] ${barcode.text}`);

            if (barcode.quad && barcode.quad.length >= 4) {
                context.strokeStyle = '#ff0000';
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(barcode.quad[0].x, barcode.quad[0].y);
                for (let i = 1; i < barcode.quad.length; i++) {
                    context.lineTo(barcode.quad[i].x, barcode.quad[i].y);
                }
                context.closePath();
                context.stroke();
            }
        }
        detectionResult.value = `Total: ${txts.length} barcode(s)\n` + txts.join('\n') + '\n\n';
    } else {
        detectionResult.value = 'Nothing found\n';
    }
}

async function activateScandit() {
    if (sdkActivated.scandit) return;
    let licenseKey = document.getElementById('scandit_license_key').value.trim();
    if (!licenseKey) {
        alert('Please enter a Scandit license key.');
        return;
    }

    let btn = document.getElementById('scandit_activate_btn');
    btn.disabled = true;
    btn.textContent = 'Activating...';

    try {
        const { DataCaptureContext } = ScanditCore;
        const { barcodeCaptureLoader } = ScanditBarcode;

        scanditContext = await DataCaptureContext.forLicenseKey(licenseKey, {
            libraryLocation: 'https://cdn.jsdelivr.net/npm/@scandit/web-datacapture-barcode@8/sdc-lib/',
            moduleLoaders: [barcodeCaptureLoader()]
        });

        const { BarcodeBatch, BarcodeBatchSettings, Symbology } = ScanditBarcode;
        const settings = new BarcodeBatchSettings();
        settings.enableSymbologies([
            Symbology.Code128, Symbology.Code39, Symbology.QR,
            Symbology.EAN8, Symbology.UPCE, Symbology.EAN13UPCA,
            Symbology.InterleavedTwoOfFive, Symbology.Codabar, Symbology.DataMatrix,
            Symbology.PDF417, Symbology.Aztec
        ]);
        scanditBarcodeBatch = await BarcodeBatch.forContext(scanditContext, settings);
        await scanditBarcodeBatch.setEnabled(false);

        scanditInitialized = true;
        sdkActivated.scandit = true;
        saveLicenseKey('scandit', licenseKey);
        updateSDKBadge('scandit');
        if (currentSDK === 'scandit') {
            isSDKReady = true;
        }
        console.log('Scandit SDK initialized');
        btn.textContent = 'Activated';
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize Scandit SDK: ' + (ex.message || ex));
        btn.disabled = false;
        btn.textContent = 'Activate';
    }
}

async function scanImageWithScandit(imageElement, context) {
    if (!scanditInitialized) {
        throw new Error('Scandit SDK not initialized');
    }

    const { ImageFrameSource, FrameSourceState } = ScanditCore;
    const { SymbologyDescription } = ScanditBarcode;

    let capturedBarcodes = [];
    const listener = {
        didUpdateSession: async (barcodeBatch, session) => {
            const trackedBarcodes = session.addedTrackedBarcodes;
            if (trackedBarcodes) {
                for (const tracked of trackedBarcodes) {
                    capturedBarcodes.push(tracked);
                }
            }
        }
    };
    scanditBarcodeBatch.addListener(listener);

    const imageFrameSource = await ImageFrameSource.fromImage(imageElement);
    await scanditContext.setFrameSource(imageFrameSource);
    await scanditBarcodeBatch.setEnabled(true);
    await imageFrameSource.switchToDesiredState(FrameSourceState.On);

    await new Promise(resolve => setTimeout(resolve, 2000));

    scanditBarcodeBatch.removeListener(listener);
    await scanditBarcodeBatch.setEnabled(false);

    if (capturedBarcodes.length > 0) {
        let txts = [];
        for (const tracked of capturedBarcodes) {
            const barcode = tracked.barcode;
            let type = barcode.symbology ? new SymbologyDescription(barcode.symbology).readableName : 'Unknown';
            txts.push(`[${type}] ${barcode.data}`);

            const quad = tracked.location;
            if (quad) {
                context.strokeStyle = '#ff0000';
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(quad.topLeft.x, quad.topLeft.y);
                context.lineTo(quad.topRight.x, quad.topRight.y);
                context.lineTo(quad.bottomRight.x, quad.bottomRight.y);
                context.lineTo(quad.bottomLeft.x, quad.bottomLeft.y);
                context.closePath();
                context.stroke();
            }
        }
        detectionResult.value = `Total: ${txts.length} barcode(s)\n` + txts.join('\n') + '\n\n';
    } else {
        detectionResult.value = 'Nothing found\n';
    }
}

// ========== License Key Caching ==========
function saveLicenseKey(sdk, key) {
    try { localStorage.setItem('barcodeScanner_' + sdk + '_license', key); } catch (e) {}
}

function loadLicenseKey(sdk) {
    try { return localStorage.getItem('barcodeScanner_' + sdk + '_license') || ''; } catch (e) { return ''; }
}

function restoreLicenseKeys() {
    ['dynamsoft', 'strich', 'scanbot', 'scandit'].forEach(sdk => {
        let saved = loadLicenseKey(sdk);
        if (saved) {
            let input = document.getElementById(sdk + '_license_key');
            if (input) input.value = saved;
        }
    });
}

async function autoActivateSavedSDKs() {
    // Only restore license keys to input fields; do NOT auto-activate.
    // User must click Activate button manually.
}

window.addEventListener('DOMContentLoaded', function () {
    restoreLicenseKeys();
    initZXing();
    autoActivateSavedSDKs();
});

document.getElementById('pick_file').addEventListener('change', function () {
    if (this.files.length === 0) return;
    handleFiles(Array.from(this.files));
});

async function scanVideoFrameZXing(tempCtx, tempCanvas, ctx) {
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    let result = await ZXingWASM.readBarcodes(imageData);

    if (result && result.length > 0) {
        for (let barcode of result) {
            let key = `[${barcode.format || 'Unknown'}] ${barcode.text}`;
            if (!fileScanResults.includes(key)) {
                fileScanResults.push(key);

                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(barcode.position.topLeft.x, barcode.position.topLeft.y);
                ctx.lineTo(barcode.position.topRight.x, barcode.position.topRight.y);
                ctx.lineTo(barcode.position.bottomRight.x, barcode.position.bottomRight.y);
                ctx.lineTo(barcode.position.bottomLeft.x, barcode.position.bottomLeft.y);
                ctx.closePath();
                ctx.stroke();
            }
        }
        detectionResult.value = fileScanResults.join('\n') + '\n\n';
    }
}

async function scanVideoFrameDynamsoft(canvas, ctx) {
    await cvr.resetSettings();
    let result = await cvr.capture(canvas, 'ReadBarcodes_Default');

    if (result.items && result.items.length > 0) {
        for (let item of result.items) {
            if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                let type = item.formatString || 'Unknown';
                let key = `[${type}] ${item.text}`;
                if (!fileScanResults.includes(key)) {
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
            }
        }
        detectionResult.value = fileScanResults.join('\n') + '\n\n';
    }
}

async function scanVideoFrameStrich(canvas, ctx) {
    if (!strichInitialized) return;

    const dataUrl = canvas.toDataURL('image/png');
    const detections = await strich.ImageScanner.scan(dataUrl, {
        engine: { symbologies: STRICH_SYMBOLOGIES }
    });

    if (detections && detections.length > 0) {
        for (const detection of detections) {
            let type = detection.typeName || 'Unknown';
            let key = `[${type}] ${detection.data}`;
            if (!fileScanResults.includes(key)) {
                fileScanResults.push(key);

                if (detection.quadrilateral && detection.quadrilateral.points) {
                    const pts = detection.quadrilateral.points;
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    ctx.lineTo(pts[1].x, pts[1].y);
                    ctx.lineTo(pts[2].x, pts[2].y);
                    ctx.lineTo(pts[3].x, pts[3].y);
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }
        detectionResult.value = fileScanResults.join('\n') + '\n\n';
    }
}

async function scanVideoFrameScanbot(canvas, ctx) {
    if (!scanbotInitialized) return;

    const dataUrl = canvas.toDataURL('image/jpeg');
    const result = await scanbotSDK.detectBarcodes(dataUrl);

    if (result && result.barcodes && result.barcodes.length > 0) {
        for (const barcode of result.barcodes) {
            let type = barcode.format || 'Unknown';
            let key = `[${type}] ${barcode.text}`;
            if (!fileScanResults.includes(key)) {
                fileScanResults.push(key);

                if (barcode.quad && barcode.quad.length >= 4) {
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(barcode.quad[0].x, barcode.quad[0].y);
                    for (let i = 1; i < barcode.quad.length; i++) {
                        ctx.lineTo(barcode.quad[i].x, barcode.quad[i].y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }
        detectionResult.value = fileScanResults.join('\n') + '\n\n';
    }
}

async function scanVideoFrameScandit(canvas, ctx) {
    if (!scanditInitialized) return;

    const { ImageFrameSource, FrameSourceState } = ScanditCore;

    const listener = {
        didUpdateSession: async (barcodeBatch, session) => {
            const trackedBarcodes = session.addedTrackedBarcodes;
            if (trackedBarcodes) {
                let { SymbologyDescription } = ScanditBarcode;
                for (const tracked of trackedBarcodes) {
                    const barcode = tracked.barcode;
                    let type = barcode.symbology ? new SymbologyDescription(barcode.symbology).readableName : 'Unknown';
                    let key = `[${type}] ${barcode.data}`;
                    if (!fileScanResults.includes(key)) {
                        fileScanResults.push(key);

                        const quad = tracked.location;
                        if (quad) {
                            ctx.strokeStyle = '#00ff00';
                            ctx.lineWidth = 3;
                            ctx.beginPath();
                            ctx.moveTo(quad.topLeft.x, quad.topLeft.y);
                            ctx.lineTo(quad.topRight.x, quad.topRight.y);
                            ctx.lineTo(quad.bottomRight.x, quad.bottomRight.y);
                            ctx.lineTo(quad.bottomLeft.x, quad.bottomLeft.y);
                            ctx.closePath();
                            ctx.stroke();
                        }
                    }
                }
                detectionResult.value = fileScanResults.join('\n') + '\n\n';
            }
        }
    };
    scanditBarcodeBatch.addListener(listener);

    const dataUrl = canvas.toDataURL('image/png');
    const tempImg = new Image();
    tempImg.src = dataUrl;
    await new Promise(resolve => { tempImg.onload = resolve; });

    const imageFrameSource = await ImageFrameSource.fromImage(tempImg);
    await scanditContext.setFrameSource(imageFrameSource);
    await scanditBarcodeBatch.setEnabled(true);
    await imageFrameSource.switchToDesiredState(FrameSourceState.On);

    await new Promise(resolve => setTimeout(resolve, 500));

    scanditBarcodeBatch.removeListener(listener);
    await scanditBarcodeBatch.setEnabled(false);
}

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
                if (currentSDK === 'dynamsoft') {
                    let result = await cvr.capture(canvas.toDataURL('image/jpeg'), 'ReadBarcodes_Default');
                    if (cameraScanning) {
                        showCameraResult(result);
                    }
                } else if (currentSDK === 'strich') {
                    await scanCameraFrameStrich(canvas, frameCtx);
                } else if (currentSDK === 'scanbot') {
                    await scanCameraFrameScanbot(canvas, frameCtx);
                } else if (currentSDK === 'scandit') {
                    await scanCameraFrameScandit(canvas, frameCtx);
                } else {
                    let result = await ZXingWASM.readBarcodes(frameCtx.getImageData(0, 0, canvas.width, canvas.height));
                    if (cameraScanning) {
                        showCameraResultZXing(result);
                    }
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
    }
    stopCameraScanning();
    if (cameraOverlay) {
        let ctx = cameraOverlay.getContext('2d');
        ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    }
}

async function scanCameraFrameStrich(canvas, canvasCtx) {
    if (!strichInitialized) return;

    const dataUrl = canvas.toDataURL('image/png');
    const detections = await strich.ImageScanner.scan(dataUrl, {
        engine: { symbologies: STRICH_SYMBOLOGIES }
    });

    if (detections && detections.length > 0 && cameraScanning) {
        showCameraResultStrich(detections);
    }
}

function showCameraResultStrich(detections) {
    let txts = [];
    let ctx = cameraOverlay.getContext('2d');

    for (const detection of detections) {
        let type = detection.typeName || 'Unknown';
        let key = `[${type}] ${detection.data}`;
        if (!cameraScanResults.includes(key)) {
            cameraScanResults.push(key);
        }
        txts.push(detection.data);

        if (detection.quadrilateral && detection.quadrilateral.points) {
            const pts = detection.quadrilateral.points;
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[1].x, pts[1].y);
            ctx.lineTo(pts[2].x, pts[2].y);
            ctx.lineTo(pts[3].x, pts[3].y);
            ctx.closePath();
            ctx.stroke();
        }
    }

    if (txts.length > 0) {
        scanResult.value = cameraScanResults.join('\n') + '\n\n';
    }
}

async function scanCameraFrameScanbot(canvas, canvasCtx) {
    if (!scanbotInitialized) return;

    const dataUrl = canvas.toDataURL('image/jpeg');
    const result = await scanbotSDK.detectBarcodes(dataUrl);

    if (result && result.barcodes && result.barcodes.length > 0 && cameraScanning) {
        showCameraResultScanbot(result.barcodes);
    } else if (cameraScanning) {
        let ctx = cameraOverlay.getContext('2d');
        ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    }
}

function showCameraResultScanbot(barcodes) {
    let txts = [];
    let ctx = cameraOverlay.getContext('2d');
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    for (const barcode of barcodes) {
        let type = barcode.format || 'Unknown';
        let key = `[${type}] ${barcode.text}`;
        if (!cameraScanResults.includes(key)) {
            cameraScanResults.push(key);
        }
        txts.push(barcode.text);

        if (barcode.quad && barcode.quad.length >= 4) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(barcode.quad[0].x, barcode.quad[0].y);
            for (let i = 1; i < barcode.quad.length; i++) {
                ctx.lineTo(barcode.quad[i].x, barcode.quad[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    if (txts.length > 0) {
        scanResult.value = cameraScanResults.join('\n') + '\n\n';
    }
}

async function scanCameraFrameScandit(canvas, canvasCtx) {
    if (!scanditInitialized) return;

    const { ImageFrameSource, FrameSourceState } = ScanditCore;

    let ctx = cameraOverlay.getContext('2d');
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    const listener = {
        didUpdateSession: async (barcodeBatch, session) => {
            const trackedBarcodes = session.addedTrackedBarcodes;
            if (trackedBarcodes && cameraScanning) {
                let { SymbologyDescription } = ScanditBarcode;
                ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

                for (const tracked of trackedBarcodes) {
                    const barcode = tracked.barcode;
                    let type = barcode.symbology ? new SymbologyDescription(barcode.symbology).readableName : 'Unknown';
                    let key = `[${type}] ${barcode.data}`;
                    if (!cameraScanResults.includes(key)) {
                        cameraScanResults.push(key);
                    }

                    const quad = tracked.location;
                    if (quad) {
                        ctx.strokeStyle = '#00ff00';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(quad.topLeft.x, quad.topLeft.y);
                        ctx.lineTo(quad.topRight.x, quad.topRight.y);
                        ctx.lineTo(quad.bottomRight.x, quad.bottomRight.y);
                        ctx.lineTo(quad.bottomLeft.x, quad.bottomLeft.y);
                        ctx.closePath();
                        ctx.stroke();
                    }
                }

                scanResult.value = cameraScanResults.join('\n') + '\n\n';
            }
        }
    };
    scanditBarcodeBatch.addListener(listener);

    const dataUrl = canvas.toDataURL('image/png');
    const tempImg = new Image();
    tempImg.src = dataUrl;
    await new Promise(resolve => { tempImg.onload = resolve; });

    const imageFrameSource = await ImageFrameSource.fromImage(tempImg);
    await scanditContext.setFrameSource(imageFrameSource);
    await scanditBarcodeBatch.setEnabled(true);
    await imageFrameSource.switchToDesiredState(FrameSourceState.On);

    await new Promise(resolve => setTimeout(resolve, 300));

    scanditBarcodeBatch.removeListener(listener);
    await scanditBarcodeBatch.setEnabled(false);
}

function showCameraResult(result) {
    let txts = [];
    let items = result.items;

    let ctx = cameraOverlay.getContext('2d');
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    if (items.length > 0) {
        for (var i = 0; i < items.length; ++i) {
            if (items[i].type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                let type = items[i].formatString || 'Unknown';
                let key = `[${type}] ${items[i].text}`;
                if (!cameraScanResults.includes(key)) {
                    cameraScanResults.push(key);
                }
                txts.push(items[i].text);

                let localization = items[i].location;
                let points = localization.points;

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
        }
        if (txts.length > 0) {
            scanResult.value = cameraScanResults.join('\n') + '\n\n';
        }
    }
}

function showCameraResultZXing(results) {
    let txts = [];

    let ctx = cameraOverlay.getContext('2d');
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    if (results && results.length > 0) {
        for (let result of results) {
            let type = result.format || 'Unknown';
            let key = `[${type}] ${result.text}`;
            if (!cameraScanResults.includes(key)) {
                cameraScanResults.push(key);
            }
            txts.push(result.text);

            if (result.position) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(result.position.topLeft.x, result.position.topLeft.y);
                ctx.lineTo(result.position.topRight.x, result.position.topRight.y);
                ctx.lineTo(result.position.bottomRight.x, result.position.bottomRight.y);
                ctx.lineTo(result.position.bottomLeft.x, result.position.bottomLeft.y);
                ctx.closePath();
                ctx.stroke();
            }
        }
        scanResult.value = cameraScanResults.join('\n') + '\n\n';
    }
}

// ========== Settings Modal ==========
function openSettings() {
    document.getElementById('settings_modal').style.display = 'flex';
    updateAllBadges();
}

function closeSettings() {
    document.getElementById('settings_modal').style.display = 'none';

    // If user activated the currently selected SDK while settings was open, enable it
    if (sdkActivated[currentSDK]) {
        isSDKReady = true;
    }
}

function updateSDKBadge(sdkName) {
    let badge = document.getElementById(sdkName + '_status');
    if (!badge) return;
    if (sdkActivated[sdkName]) {
        badge.className = 'sdk-badge badge-active';
        badge.textContent = 'Activated';
    } else {
        badge.className = 'sdk-badge badge-inactive';
        badge.textContent = 'Not Activated';
    }
    updateBenchmarkCheckboxes();
}

function updateAllBadges() {
    ['dynamsoft', 'strich', 'scanbot', 'scandit'].forEach(updateSDKBadge);
}

function updateBenchmarkCheckboxes() {
    let checkboxes = document.querySelectorAll('#benchmark_sdk_checkboxes .checkbox-label');
    checkboxes.forEach(label => {
        let cb = label.querySelector('input');
        let sdk = cb.value;
        if (sdk === 'zxing') {
            // ZXing is always available
            label.classList.remove('cb-disabled');
            cb.disabled = false;
        } else if (sdkActivated[sdk]) {
            label.classList.remove('cb-disabled');
            cb.disabled = false;
        } else {
            label.classList.add('cb-disabled');
            cb.disabled = true;
            cb.checked = false;
        }
    });
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
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
    let sdkSelectorGroup = document.getElementById('sdk_selector_group');

    if (mode === 'benchmark') {
        defaultResultSection.style.display = 'none';
        benchmarkSection.style.display = 'block';
        sdkSelectorGroup.style.display = 'none';
        updateBenchmarkCheckboxes();
    } else {
        defaultResultSection.style.display = 'block';
        benchmarkSection.style.display = 'none';
        sdkSelectorGroup.style.display = 'block';
    }
}

// ========== Benchmark ==========
function getSelectedBenchmarkSDKs() {
    let checkboxes = document.querySelectorAll('#benchmark_sdk_checkboxes input:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

async function runBenchmark() {
    if (benchmarkRunning) return;

    // Need at least one image loaded
    if (!imageFiles || imageFiles.length === 0) {
        if (!img.src || !img.complete || img.naturalWidth === 0) {
            alert('Please load one or more images first.');
            return;
        }
    }

    let sdks = getSelectedBenchmarkSDKs();
    if (sdks.length === 0) {
        alert('Please select at least one SDK to benchmark.');
        return;
    }

    // Check all selected SDKs are activated
    for (let sdk of sdks) {
        if (!sdkActivated[sdk]) {
            alert(`${sdk} is not activated. Please activate it in Settings first.`);
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

    const sdkLabels = {zxing:'ZXing', dynamsoft:'Dynamsoft', strich:'Strich.io', scanbot:'Scanbot', scandit:'Scandit'};

    // Build list of images to benchmark
    let imagesToBenchmark = [];
    if (imageFiles && imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
            imagesToBenchmark.push({ file: imageFiles[i], name: imageFiles[i].name, index: i });
        }
    } else {
        // Single image from img element (e.g. pasted or drag-dropped)
        imagesToBenchmark.push({ file: null, name: 'Current Image', index: 0 });
    }

    let totalSteps = imagesToBenchmark.length * sdks.length;
    let stepsDone = 0;

    // Results: array of { imageName, imageIndex, sdkResults: [ { sdk, sdkLabel, barcodes, time, error } ] }
    let allResults = [];

    for (let imgInfo of imagesToBenchmark) {
        // Load image into a temp Image element
        let testImg;
        if (imgInfo.file) {
            testImg = await loadImageFromFile(imgInfo.file);
        } else {
            testImg = img; // Use global img
        }

        let imageResult = { imageName: imgInfo.name, imageIndex: imgInfo.index, sdkResults: [] };

        for (let sdk of sdks) {
            stepsDone++;
            let sdkLabel = sdkLabels[sdk];
            progressText.textContent = `Image ${imgInfo.index + 1}/${imagesToBenchmark.length}: ${sdkLabel}... (${stepsDone}/${totalSteps})`;
            progressBar.style.width = ((stepsDone / totalSteps) * 100) + '%';

            let result = await benchmarkSingleSDK(sdk, testImg);
            imageResult.sdkResults.push({ sdk, sdkLabel, ...result });
        }

        allResults.push(imageResult);
    }

    progressBar.style.width = '100%';
    progressText.textContent = 'Done!';

    renderBenchmarkResults(allResults, sdks.map(s => sdkLabels[s]));
    benchmarkRunning = false;

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

async function benchmarkSingleSDK(sdk, testImg) {
    let barcodes = []; // Array of { type, text }
    let startTime = performance.now();

    try {
        if (sdk === 'zxing') {
            const blob = await fetch(testImg.src).then(res => res.blob());
            let result = await ZXingWASM.readBarcodes(blob);
            if (result && result.length > 0) {
                for (let r of result) {
                    barcodes.push({ type: r.format || 'Unknown', text: r.text });
                }
            }
        } else if (sdk === 'dynamsoft') {
            await cvr.resetSettings();
            let result = await cvr.capture(testImg.src, 'ReadBarcodes_Default');
            if (result.items && result.items.length > 0) {
                for (let item of result.items) {
                    if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                        barcodes.push({ type: item.formatString || 'Unknown', text: item.text });
                    }
                }
            }
        } else if (sdk === 'strich') {
            const detections = await strich.ImageScanner.scan(testImg, {
                engine: { symbologies: STRICH_SYMBOLOGIES }
            });
            if (detections && detections.length > 0) {
                for (const d of detections) {
                    barcodes.push({ type: d.typeName || 'Unknown', text: d.data });
                }
            }
        } else if (sdk === 'scanbot') {
            const canvas = document.createElement('canvas');
            canvas.width = testImg.naturalWidth || testImg.width;
            canvas.height = testImg.naturalHeight || testImg.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(testImg, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg');
            const result = await scanbotSDK.detectBarcodes(dataUrl);
            if (result && result.barcodes && result.barcodes.length > 0) {
                for (const b of result.barcodes) {
                    barcodes.push({ type: b.format || 'Unknown', text: b.text });
                }
            }
        } else if (sdk === 'scandit') {
            const { ImageFrameSource, FrameSourceState } = ScanditCore;
            let capturedBarcodes = [];
            const listener = {
                didUpdateSession: async (barcodeBatch, session) => {
                    const trackedBarcodes = session.addedTrackedBarcodes;
                    if (trackedBarcodes) {
                        for (const tracked of trackedBarcodes) {
                            capturedBarcodes.push(tracked.barcode);
                        }
                    }
                }
            };
            scanditBarcodeBatch.addListener(listener);
            const imageFrameSource = await ImageFrameSource.fromImage(testImg);
            await scanditContext.setFrameSource(imageFrameSource);
            await scanditBarcodeBatch.setEnabled(true);
            await imageFrameSource.switchToDesiredState(FrameSourceState.On);
            await new Promise(resolve => setTimeout(resolve, 2000));
            scanditBarcodeBatch.removeListener(listener);
            await scanditBarcodeBatch.setEnabled(false);
            if (capturedBarcodes.length > 0) {
                let { SymbologyDescription } = ScanditBarcode;
                for (const barcode of capturedBarcodes) {
                    let type = barcode.symbology ? new SymbologyDescription(barcode.symbology).readableName : 'Unknown';
                    barcodes.push({ type, text: barcode.data });
                }
            }
        }
    } catch (ex) {
        console.error(`Benchmark error for ${sdk}:`, ex);
        return { barcodes: [], time: performance.now() - startTime, error: ex.message };
    }

    return { barcodes, time: performance.now() - startTime };
}

function renderBenchmarkResults(allResults, sdkLabels) {
    let container = document.getElementById('benchmark_results_container');

    if (allResults.length === 0) {
        container.innerHTML = '<div class="benchmark-no-result">No results to display.</div>';
        return;
    }

    let html = '';
    let isMultiImage = allResults.length > 1;

    // Aggregate stats per SDK
    let aggregateMap = {}; // sdkLabel -> { totalBarcodes, totalTime, errors, allBarcodes[] }
    for (let sdkLabel of sdkLabels) {
        aggregateMap[sdkLabel] = { totalBarcodes: 0, totalTime: 0, errors: 0, allBarcodes: [] };
    }

    // Per-image tables
    for (let imgResult of allResults) {
        let results = imgResult.sdkResults;
        let maxCount = Math.max(...results.map(r => r.barcodes.length));

        if (isMultiImage) {
            html += `<h4 class="benchmark-image-title">${escapeHtml(imgResult.imageName)}</h4>`;
        }

        html += '<div class="benchmark-table-wrap"><table class="benchmark-table">';
        html += '<thead><tr><th>SDK</th><th>Barcodes Found</th><th>Time</th><th>Details</th></tr></thead>';
        html += '<tbody>';

        for (let r of results) {
            let count = r.barcodes.length;
            let isBest = count === maxCount && count > 0;
            let countClass = isBest ? 'count-col best-count' : 'count-col';

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

            html += `<tr>
                <td class="sdk-col">${escapeHtml(r.sdkLabel)}</td>
                <td class="${countClass}">${count}</td>
                <td class="time-col">${r.time.toFixed(0)} ms</td>
                <td>${detailHtml}</td>
            </tr>`;

            // Aggregate
            let agg = aggregateMap[r.sdkLabel];
            agg.totalBarcodes += count;
            agg.totalTime += r.time;
            if (r.error) agg.errors++;
            for (let b of r.barcodes) {
                agg.allBarcodes.push(b.text);
            }
        }

        html += '</tbody></table></div>';
    }

    // Aggregate summary
    let allBarcodeTexts = new Set();
    for (let sdkLabel of sdkLabels) {
        aggregateMap[sdkLabel].allBarcodes.forEach(t => allBarcodeTexts.add(t));
    }
    let uniqueTotal = allBarcodeTexts.size;

    let summaryEntries = sdkLabels.map(sdkLabel => ({
        sdk: sdkLabel,
        totalBarcodes: aggregateMap[sdkLabel].totalBarcodes,
        totalTime: aggregateMap[sdkLabel].totalTime,
        errors: aggregateMap[sdkLabel].errors,
        uniqueBarcodes: new Set(aggregateMap[sdkLabel].allBarcodes).size
    }));

    let most = summaryEntries.reduce((a, b) => a.totalBarcodes > b.totalBarcodes ? a : b);
    let fastest = summaryEntries.reduce((a, b) => a.totalTime < b.totalTime ? a : b);
    let mostUnique = summaryEntries.reduce((a, b) => a.uniqueBarcodes > b.uniqueBarcodes ? a : b);

    html += '<div class="benchmark-summary">';
    if (isMultiImage) {
        html += `<h4>Aggregate Summary (${allResults.length} images)</h4>`;

        // Aggregate table
        html += '<div class="benchmark-table-wrap"><table class="benchmark-table">';
        html += '<thead><tr><th>SDK</th><th>Total Barcodes</th><th>Unique Barcodes</th><th>Total Time</th><th>Avg Time/Image</th></tr></thead>';
        html += '<tbody>';

        let maxTotal = Math.max(...summaryEntries.map(e => e.totalBarcodes));
        let maxUnique = Math.max(...summaryEntries.map(e => e.uniqueBarcodes));

        for (let entry of summaryEntries) {
            let totalClass = (entry.totalBarcodes === maxTotal && maxTotal > 0) ? 'count-col best-count' : 'count-col';
            let uniqueClass = (entry.uniqueBarcodes === maxUnique && maxUnique > 0) ? 'count-col best-count' : 'count-col';
            let avgTime = entry.totalTime / allResults.length;
            html += `<tr>
                <td class="sdk-col">${escapeHtml(entry.sdk)}</td>
                <td class="${totalClass}">${entry.totalBarcodes}</td>
                <td class="${uniqueClass}">${entry.uniqueBarcodes}</td>
                <td class="time-col">${entry.totalTime.toFixed(0)} ms</td>
                <td class="time-col">${avgTime.toFixed(0)} ms</td>
            </tr>`;
        }

        html += '</tbody></table></div>';
    }

    html += '<ul>';
    html += `<li><strong>${uniqueTotal}</strong> unique barcode(s) found across all SDKs${isMultiImage ? ' and images' : ''}</li>`;
    html += `<li>Most barcodes: <strong>${escapeHtml(most.sdk)}</strong> (${most.totalBarcodes})</li>`;
    if (isMultiImage) {
        html += `<li>Most unique barcodes: <strong>${escapeHtml(mostUnique.sdk)}</strong> (${mostUnique.uniqueBarcodes})</li>`;
    }
    html += `<li>Fastest: <strong>${escapeHtml(fastest.sdk)}</strong> (${fastest.totalTime.toFixed(0)} ms total)</li>`;
    html += '</ul></div>';

    container.innerHTML = html;
}

function escapeHtml(str) {
    let div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
