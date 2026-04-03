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

// Strich.io state
let strichInitialized = false;

// Scanbot state
let scanbotSDK = null;
let scanbotInitialized = false;

// Scandit state
let scanditContext = null;
let scanditBarcodeCapture = null;
let scanditInitialized = false;

// File scanning state
let fileScanning = false;
let fileAnimationFrame = null;
let fileScanResults = [];

// Camera scanning state
let cameraScanning = false;
let cameraAnimationFrame = null;
let cameraScanResults = [];

overlayCanvas.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

overlayCanvas.addEventListener('drop', function (event) {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
        let file = event.dataTransfer.files[0];
        handleFile(file);
    }
}, false);

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

function handleFile(file) {
    if (!file) return;

    stopFileScanning();
    detectionResult.value = '';
    fileScanResults = [];
    imagePreviewContainer.style.display = 'none';
    videoFileWrapper.style.display = 'none';

    if (file.type.startsWith('image/')) {
        let reader = new FileReader();
        reader.onload = function (e) {
            loadImage2Canvas(e.target.result);
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        loadVideoFile(file);
    } else {
        alert('Unsupported file type. Please upload an image or video file.');
    }
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
                let result = await ZXingWASM.readBarcodesFromImageFile(blob);
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
            detectionResult.value += txts.join('\n') + '\n\n';
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
        detectionResult.value += txts.join('\n') + '\n\n';
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
    let dynamsoftLicense = document.getElementById('dynamsoft_license');
    let strichLicense = document.getElementById('strich_license');
    let scanbotLicense = document.getElementById('scanbot_license');
    let scanditLicense = document.getElementById('scandit_license');

    dynamsoftLicense.style.display = 'none';
    strichLicense.style.display = 'none';
    scanbotLicense.style.display = 'none';
    scanditLicense.style.display = 'none';

    currentSDK = sdkSelector.value;
    isSDKReady = false;

    if (currentSDK === 'dynamsoft') {
        dynamsoftLicense.style.display = 'block';
    } else if (currentSDK === 'strich') {
        strichLicense.style.display = 'block';
    } else if (currentSDK === 'scanbot') {
        scanbotLicense.style.display = 'block';
    } else if (currentSDK === 'scandit') {
        scanditLicense.style.display = 'block';
    } else {
        initZXing();
    }
}

async function initZXing() {
    try {
        if (typeof ZXingWASM === 'undefined') {
            throw new Error('ZXingWASM is not loaded');
        }
        isSDKReady = true;
        currentSDK = 'zxing';
        console.log('ZXing SDK ready');
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize ZXing SDK: ' + ex.message);
    }
}

async function activateDynamsoft() {
    let divElement = document.getElementById('dynamsoft_license_key');
    let licenseKey = divElement.value == '' ? divElement.placeholder : divElement.value;

    try {
        await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);
        await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        isSDKReady = true;
        currentSDK = 'dynamsoft';
        console.log('Dynamsoft SDK activated');
    }
    catch (ex) {
        console.error(ex);
        alert('Failed to activate Dynamsoft SDK.');
    }
}

async function activateStrich() {
    let licenseKey = document.getElementById('strich_license_key').value.trim();
    if (!licenseKey) {
        alert('Please enter a Strich.io license key.');
        return;
    }

    try {
        await strich.StrichSDK.initialize(licenseKey);
        strichInitialized = true;
        isSDKReady = true;
        currentSDK = 'strich';
        console.log('Strich.io SDK initialized');
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize Strich.io SDK: ' + (ex.message || ex));
    }
}

async function scanImageWithStrich(imageElement, context) {
    if (!strichInitialized) {
        throw new Error('Strich SDK not initialized');
    }

    const reader = new strich.BarcodeReader({
        selector: null,
        engine: {
            symbologies: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upca', 'upce', 'itf', 'codabar', 'datamatrix', 'pdf417', 'aztec'],
            duplicateInterval: 0
        }
    });

    await reader.initialize();
    const detections = await reader.detectFromImage(imageElement);
    await reader.destroy();

    if (detections && detections.length > 0) {
        let txts = [];
        for (const detection of detections) {
            txts.push(detection.text);

            if (detection.corners) {
                context.strokeStyle = '#ff0000';
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(detection.corners[0].x, detection.corners[0].y);
                context.lineTo(detection.corners[1].x, detection.corners[1].y);
                context.lineTo(detection.corners[2].x, detection.corners[2].y);
                context.lineTo(detection.corners[3].x, detection.corners[3].y);
                context.closePath();
                context.stroke();
            }
        }
        detectionResult.value = txts.join('\n') + '\n\n';
    } else {
        detectionResult.value = 'Nothing found\n';
    }
}

async function activateScanbot() {
    let licenseKey = document.getElementById('scanbot_license_key').value.trim();

    try {
        scanbotSDK = await ScanbotSDK.initialize({
            licenseKey: licenseKey,
            enginePath: 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8/bundle/bin/complete/'
        });
        scanbotInitialized = true;
        isSDKReady = true;
        currentSDK = 'scanbot';
        console.log('Scanbot SDK initialized');
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize Scanbot SDK: ' + (ex.message || ex));
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
        detectionResult.value = txts.join('\n') + '\n\n';
    } else {
        detectionResult.value = 'Nothing found\n';
    }
}

async function activateScandit() {
    let licenseKey = document.getElementById('scandit_license_key').value.trim();
    if (!licenseKey) {
        alert('Please enter a Scandit license key.');
        return;
    }

    try {
        const { DataCaptureContext } = ScanditCore;
        const { barcodeCaptureLoader } = ScanditBarcode;

        scanditContext = await DataCaptureContext.forLicenseKey(licenseKey, {
            libraryLocation: 'https://cdn.jsdelivr.net/npm/@scandit/web-datacapture-barcode@8/sdc-lib/',
            moduleLoaders: [barcodeCaptureLoader()]
        });

        const { BarcodeCapture, BarcodeCaptureSettings, Symbology } = ScanditBarcode;
        const settings = new BarcodeCaptureSettings();
        settings.enableSymbologies([
            Symbology.Code128, Symbology.Code39, Symbology.QR,
            Symbology.EAN8, Symbology.UPCE, Symbology.EAN13UPCA,
            Symbology.InterleavedTwoOfFive, Symbology.Codabar, Symbology.DataMatrix,
            Symbology.PDF417, Symbology.Aztec
        ]);
        scanditBarcodeCapture = await BarcodeCapture.forContext(scanditContext, settings);
        await scanditBarcodeCapture.setEnabled(false);

        scanditInitialized = true;
        isSDKReady = true;
        currentSDK = 'scandit';
        console.log('Scandit SDK initialized');
    } catch (ex) {
        console.error(ex);
        alert('Failed to initialize Scandit SDK: ' + (ex.message || ex));
    }
}

async function scanImageWithScandit(imageElement, context) {
    if (!scanditInitialized) {
        throw new Error('Scandit SDK not initialized');
    }

    const { ImageFrameSource, FrameSourceState } = ScanditCore;

    let capturedBarcode = null;
    const listener = {
        didScan: async (barcodeCaptureMode, session) => {
            capturedBarcode = session.newlyRecognizedBarcode;
            await scanditBarcodeCapture.setEnabled(false);
        }
    };
    scanditBarcodeCapture.addListener(listener);

    const imageFrameSource = await ImageFrameSource.fromImage(imageElement);
    await scanditContext.setFrameSource(imageFrameSource);
    await scanditBarcodeCapture.setEnabled(true);
    await imageFrameSource.switchToDesiredState(FrameSourceState.On);

    await new Promise(resolve => setTimeout(resolve, 2000));

    scanditBarcodeCapture.removeListener(listener);
    await scanditBarcodeCapture.setEnabled(false);

    if (capturedBarcode) {
        let txts = [capturedBarcode.data];
        detectionResult.value = txts.join('\n') + '\n\n';

        if (capturedBarcode.location && capturedBarcode.location.quadrilateral) {
            const quad = capturedBarcode.location.quadrilateral;
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
    } else {
        detectionResult.value = 'Nothing found\n';
    }
}

window.addEventListener('DOMContentLoaded', function () {
    initZXing();
});

document.getElementById('pick_file').addEventListener('change', function () {
    let currentFile = this.files[0];
    if (currentFile == null) {
        return;
    }
    handleFile(currentFile);
});

async function scanVideoFrameZXing(tempCtx, tempCanvas, ctx) {
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    let result = await ZXingWASM.readBarcodesFromImageData(imageData);

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

    const reader = new strich.BarcodeReader({
        selector: null,
        engine: {
            symbologies: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upca', 'upce', 'itf', 'codabar', 'datamatrix', 'pdf417', 'aztec'],
            duplicateInterval: 2000
        }
    });

    await reader.initialize();
    const detections = await reader.detectFromCanvas(canvas);
    await reader.destroy();

    if (detections && detections.length > 0) {
        for (const detection of detections) {
            let type = detection.symbology || 'Unknown';
            let key = `[${type}] ${detection.text}`;
            if (!fileScanResults.includes(key)) {
                fileScanResults.push(key);

                if (detection.corners) {
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(detection.corners[0].x, detection.corners[0].y);
                    ctx.lineTo(detection.corners[1].x, detection.corners[1].y);
                    ctx.lineTo(detection.corners[2].x, detection.corners[2].y);
                    ctx.lineTo(detection.corners[3].x, detection.corners[3].y);
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
        didScan: async (barcodeCaptureMode, session) => {
            const barcode = session.newlyRecognizedBarcode;
            if (barcode) {
                let { SymbologyDescription } = ScanditBarcode;
                let type = barcode.symbology ? new SymbologyDescription(barcode.symbology).readableName : 'Unknown';
                let key = `[${type}] ${barcode.data}`;
                if (!fileScanResults.includes(key)) {
                    fileScanResults.push(key);

                    if (barcode.location && barcode.location.quadrilateral) {
                        const quad = barcode.location.quadrilateral;
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
                detectionResult.value = fileScanResults.join('\n') + '\n\n';
            }
        }
    };
    scanditBarcodeCapture.addListener(listener);

    const dataUrl = canvas.toDataURL('image/png');
    const tempImg = new Image();
    tempImg.src = dataUrl;
    await new Promise(resolve => { tempImg.onload = resolve; });

    const imageFrameSource = await ImageFrameSource.fromImage(tempImg);
    await scanditContext.setFrameSource(imageFrameSource);
    await scanditBarcodeCapture.setEnabled(true);
    await imageFrameSource.switchToDesiredState(FrameSourceState.On);

    await new Promise(resolve => setTimeout(resolve, 500));

    scanditBarcodeCapture.removeListener(listener);
    await scanditBarcodeCapture.setEnabled(false);
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
                ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

                if (currentSDK === 'dynamsoft') {
                    let result = await cvr.capture(canvas, 'ReadBarcodes_Default');
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
                    let result = await ZXingWASM.readBarcodesFromImageData(frameCtx.getImageData(0, 0, canvas.width, canvas.height));
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

    const reader = new strich.BarcodeReader({
        selector: null,
        engine: {
            symbologies: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upca', 'upce', 'itf', 'codabar', 'datamatrix', 'pdf417', 'aztec'],
            duplicateInterval: 2000
        }
    });

    await reader.initialize();
    const detections = await reader.detectFromCanvas(canvas);
    await reader.destroy();

    if (detections && detections.length > 0 && cameraScanning) {
        showCameraResultStrich(detections);
    }
}

function showCameraResultStrich(detections) {
    let txts = [];
    let ctx = cameraOverlay.getContext('2d');

    for (const detection of detections) {
        let type = detection.symbology || 'Unknown';
        let key = `[${type}] ${detection.text}`;
        if (!cameraScanResults.includes(key)) {
            cameraScanResults.push(key);
        }
        txts.push(detection.text);

        if (detection.corners) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(detection.corners[0].x, detection.corners[0].y);
            ctx.lineTo(detection.corners[1].x, detection.corners[1].y);
            ctx.lineTo(detection.corners[2].x, detection.corners[2].y);
            ctx.lineTo(detection.corners[3].x, detection.corners[3].y);
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
    }
}

function showCameraResultScanbot(barcodes) {
    let txts = [];
    let ctx = cameraOverlay.getContext('2d');

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
        didScan: async (barcodeCaptureMode, session) => {
            const barcode = session.newlyRecognizedBarcode;
            if (barcode && cameraScanning) {
                let { SymbologyDescription } = ScanditBarcode;
                let type = barcode.symbology ? new SymbologyDescription(barcode.symbology).readableName : 'Unknown';
                let key = `[${type}] ${barcode.data}`;
                if (!cameraScanResults.includes(key)) {
                    cameraScanResults.push(key);
                }

                ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
                if (barcode.location && barcode.location.quadrilateral) {
                    const quad = barcode.location.quadrilateral;
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

                scanResult.value = cameraScanResults.join('\n') + '\n\n';
            }
        }
    };
    scanditBarcodeCapture.addListener(listener);

    const dataUrl = canvas.toDataURL('image/png');
    const tempImg = new Image();
    tempImg.src = dataUrl;
    await new Promise(resolve => { tempImg.onload = resolve; });

    const imageFrameSource = await ImageFrameSource.fromImage(tempImg);
    await scanditContext.setFrameSource(imageFrameSource);
    await scanditBarcodeCapture.setEnabled(true);
    await imageFrameSource.switchToDesiredState(FrameSourceState.On);

    await new Promise(resolve => setTimeout(resolve, 300));

    scanditBarcodeCapture.removeListener(listener);
    await scanditBarcodeCapture.setEnabled(false);
}

function showCameraResult(result) {
    let txts = [];
    let items = result.items;

    let ctx = cameraOverlay.getContext('2d');

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
