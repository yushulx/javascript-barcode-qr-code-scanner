let dropdown = document.getElementById('dropdown');
let scanButton = document.getElementById('scan_button');
let cameraSource = document.getElementById('camera_source');
let imageFile = document.getElementById('image_file');
let overlayCanvas = document.getElementById('overlay_canvas');
let cameraOverlay = document.getElementById('camera_overlay');
let videoElement = document.getElementById('camera_view');
let scanResult = document.getElementById('scan_result');

let cvr;
let zxingReader;
let currentSDK = 'zxing'; // Default to free ZXing
let isSDKReady = false;
let img = new Image();
let isDetecting = false;
let stream;
let intervalId;

overlayCanvas.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

overlayCanvas.addEventListener('drop', function (event) {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
        let file = event.dataTransfer.files[0];
        if (file.type.match('image.*')) {
            let reader = new FileReader();
            reader.onload = function (e) {
                loadImage2Canvas(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            alert('Please drop an image file.');
        }
    }
}, false);

async function selectChanged() {
    if (dropdown.value === 'file') {
        stopCamera();
        let divElement = document.getElementById('file_container');
        divElement.style.display = 'block';

        divElement = document.getElementById('camera_container');
        divElement.style.display = 'none';
    }
    else {
        await initCamera();
        let divElement = document.getElementById('camera_container');
        divElement.style.display = 'block';

        divElement = document.getElementById('file_container');
        divElement.style.display = 'none';
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

        if (!isSDKReady) {
            alert('Please activate the SDK first.');
            return;
        }
        toggleLoading(true);

        let context = overlayCanvas.getContext('2d');
        context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        try {
            if (currentSDK === 'dynamsoft') {
                await cvr.resetSettings();
                let result = await cvr.capture(img.src, 'ReadBarcodes_Default');
                showFileResult(context, result);
            } else {
                // ZXing - convert base64 to blob then read
                const blob = await fetch(base64Image).then(res => res.blob());
                let result = await ZXingWASM.readBarcodesFromImageFile(blob);
                showFileResultZXing(context, result);
            }
        }
        catch (ex) {
            console.error(ex);
        }

        toggleLoading(false);
    };
}

function showFileResult(context, result) {
    let detection_result = document.getElementById('detection_result');
    detection_result.innerHTML = '';
    let txts = [];
    let items = result.items;
    if (items.length > 0) {
        for (var i = 0; i < items.length; ++i) {
            if (items[i].type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                continue;
            }

            let item = items[i];
            txts.push(item.text);
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
            detection_result.innerHTML += txts.join('\n') + '\n\n';
        } else {
            detection_result.innerHTML += 'Recognition Failed\n';
        }
    }
    else {
        detection_result.innerHTML += 'Nothing found\n';
    }
}

function showFileResultZXing(context, results) {
    let detection_result = document.getElementById('detection_result');
    detection_result.innerHTML = '';
    let txts = [];

    if (results && results.length > 0) {
        for (let result of results) {
            txts.push(result.text);

            // Draw bounding box
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
        detection_result.innerHTML += txts.join('\n') + '\n\n';
    } else {
        detection_result.innerHTML += 'Nothing found\n';
    }
}

document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                loadImage2Canvas(event.target.result);
            };
            reader.readAsDataURL(blob);
        }
    }
});

function sdkChanged() {
    let sdkSelector = document.getElementById('sdk_selector');
    let licenseSection = document.getElementById('license_section');
    currentSDK = sdkSelector.value;

    if (currentSDK === 'dynamsoft') {
        licenseSection.style.display = 'block';
        isSDKReady = false;
    } else {
        licenseSection.style.display = 'none';
        initZXing();
    }
}

async function initZXing() {
    toggleLoading(true);
    try {
        // ZXingWASM is loaded from the script tag
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
    toggleLoading(false);
}

async function activateDynamsoft() {
    toggleLoading(true);
    let divElement = document.getElementById('license_key');
    let licenseKey = divElement.value == '' ? divElement.placeholder : divElement.value;

    try {
        await Dynamsoft.License.LicenseManager.initLicense(
            licenseKey,
            true
        );

        await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        isSDKReady = true;
        currentSDK = 'dynamsoft';
        console.log('Dynamsoft SDK activated');
    }
    catch (ex) {
        console.error(ex);
        alert('Failed to activate Dynamsoft SDK. You can use ZXing (free) instead.');
    }

    toggleLoading(false);
}

// Initialize ZXing by default on page load
window.addEventListener('DOMContentLoaded', function () {
    initZXing();
});

function toggleLoading(isLoading) {
    if (isLoading) {
        document.getElementById('loading-indicator').style.display = 'flex';
    }
    else {
        document.getElementById('loading-indicator').style.display = 'none';
    }
}

document.getElementById('pick_file').addEventListener('change', function () {
    let currentFile = this.files[0];
    if (currentFile == null) {
        return;
    }
    var fr = new FileReader();
    fr.onload = function () {
        loadImage2Canvas(fr.result);
    }
    fr.readAsDataURL(currentFile);
});

async function scan() {
    if (!isSDKReady) {
        alert('Please activate the SDK first.');
        return;
    }

    if (!isDetecting) {
        scanButton.innerHTML = '<span id="scan_icon">⏸</span> <span id="scan_text">Stop Scanning</span>';
        isDetecting = true;
        startScanning();
    }
    else {
        scanButton.innerHTML = '<span id="scan_icon">▶</span> <span id="scan_text">Start Scanning</span>';
        isDetecting = false;
        stopScanning();
        // Clear overlay when stopping
        let ctx = cameraOverlay.getContext('2d');
        ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    }
}

function startScanning() {
    const captureFrame = async () => {
        if (!isDetecting) return;

        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            let canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

            // Update overlay canvas size to match video
            if (cameraOverlay.width !== videoElement.videoWidth || cameraOverlay.height !== videoElement.videoHeight) {
                cameraOverlay.width = videoElement.videoWidth;
                cameraOverlay.height = videoElement.videoHeight;
            }

            try {
                if (currentSDK === 'dynamsoft') {
                    let result = await cvr.capture(canvas, 'ReadBarcodes_Default');
                    if (isDetecting) {
                        showCameraResult(result);
                    }
                } else {
                    // ZXing
                    let result = await ZXingWASM.readBarcodesFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
                    if (isDetecting) {
                        showCameraResultZXing(result);
                    }
                }
            } catch (ex) {
                console.error(ex);
            }
        }

        if (isDetecting) {
            requestAnimationFrame(captureFrame);
        }
    };

    requestAnimationFrame(captureFrame);
}

function stopScanning() {
    isDetecting = false;
    // Clear overlay when stopping scanning
    if (cameraOverlay && cameraOverlay.width > 0) {
        let ctx = cameraOverlay.getContext('2d');
        ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    }
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
                    option.text = device.label || Camera;
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
    stopCamera();
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
    } catch (error) {
        console.error('Error accessing camera:', error);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    stopScanning();
    isDetecting = false;
    scanButton.innerHTML = '<span id="scan_icon">▶</span> <span id="scan_text">Start Scanning</span>';
    // Clear overlay
    if (cameraOverlay) {
        let ctx = cameraOverlay.getContext('2d');
        ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
    }
}

function showCameraResult(result) {
    scanResult.innerHTML = '';
    let txts = [];
    let items = result.items;

    // Clear overlay
    let ctx = cameraOverlay.getContext('2d');
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    if (items.length > 0) {
        for (var i = 0; i < items.length; ++i) {
            if (items[i].type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                txts.push(items[i].text);

                // Draw bounding box
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
            scanResult.innerHTML += txts.join('\n') + '\n\n';
        } else {
            scanResult.innerHTML += 'Recognition Failed\n';
        }
    } else {
        scanResult.innerHTML += 'Nothing found\n';
    }
}

function showCameraResultZXing(results) {
    scanResult.innerHTML = '';
    let txts = [];

    // Clear overlay
    let ctx = cameraOverlay.getContext('2d');
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);

    if (results && results.length > 0) {
        for (let result of results) {
            txts.push(result.text);

            // Draw bounding box
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
        scanResult.innerHTML += txts.join('\n') + '\n\n';
    } else {
        scanResult.innerHTML += 'Nothing found\n';
    }
}
