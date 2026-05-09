let cvr = null;
let parser = null;
let isMRZReady = false;
let isFreeModelsReady = false;
let isCameraRunning = false;
let videoStream = null;
let currentImageCaptureSource = null;

async function initFreeModels() {
    const statusEl = document.getElementById('status');
    try {
        statusEl.textContent = "Loading Face Detection models...";

        // Initialize Face Detection – registers the processor (powered by Dynamsoft Identity when CVR is available)
        if (window.initFaceDetection) {
            await window.initFaceDetection();
        }

        isFreeModelsReady = true;
        statusEl.textContent = "Ready (Initialize MRZ for face/border detection.)";

        // Enable buttons for free features
        document.getElementById('btnLoad').disabled = false;
        document.getElementById('btnCamera').disabled = false;
        document.getElementById('btnPaste').disabled = false;

        console.log("✅ Face Detection initialized");
    } catch (ex) {
        console.error("Failed to initialize Face Detection:", ex);
        statusEl.textContent = "Failed to load Face Detection: " + ex.message;
    }
}

// Start loading free models when page loads
window.addEventListener('DOMContentLoaded', () => {
    initFreeModels();
});

// DOM Elements
const els = {
    licenseKey: document.getElementById('licenseKey'),
    initBtn: document.getElementById('initBtn'),
    displayImage: document.getElementById('displayImage'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    cameraOverlay: document.getElementById('cameraOverlay'),
    dropZone: document.getElementById('dropZone'),
    cameraView: document.getElementById('cameraView'),
    imageView: document.getElementById('imageView'),
    mrzRawText: document.getElementById('mrzRawText'),
    mrzResults: document.getElementById('mrzResults'),
    faceCropCanvas: document.getElementById('faceCropCanvas'),
    status: document.getElementById('status'),
    placeholderText: document.getElementById('placeholderText'),
    loadingSpinner: document.getElementById('loadingSpinner')
};

// 1. Initialization - MRZ only (requires license)
els.initBtn.addEventListener('click', async () => {
    let key = els.licenseKey.value.trim();
    if (!key) {
        key = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";
    }

    try {
        els.status.textContent = "Initializing MRZ SDK...";
        els.initBtn.disabled = true;

        // Initialize License
        await Dynamsoft.License.LicenseManager.initLicense(key, true);

        // Load WASM modules
        els.status.textContent = "Loading WASM modules...";
        await Dynamsoft.Core.CoreModule.loadWasm(["DLR", "DDN"]);

        // Create Code Parser for MRZ parsing
        parser = await Dynamsoft.DCP.CodeParser.createInstance();

        // Load MRZ specs
        els.status.textContent = "Loading MRZ specs...";
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD1_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_FRENCH_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_VISA");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_PASSPORT");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_VISA");

        // Preload the custom MRZ recognition models referenced by the sample settings file.
        await Dynamsoft.CVR.CaptureVisionRouter.appendDLModelBuffer([
            "MRZCharRecognition",
            "MRZTextLineRecognition"
        ]);

        // Create Capture Vision Router
        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        // Load MRZ template
        const settingsResult = await cvr.initSettings("./findPrecisePortraitZone.json?t=" + new Date().getTime());
        if (settingsResult?.errorCode && settingsResult.errorCode !== 0) {
            throw new Error(`Template load failed: ${settingsResult.errorString || settingsResult.errorCode}`);
        }

        const hasReadPassportAndId = await cvr.checkTemplateNameValidity("ReadPassportAndId");
        if (!hasReadPassportAndId) {
            const templateNames = await cvr.getTemplateNames();
            throw new Error(
                `Template ReadPassportAndId is not available after loading findPrecisePortraitZone.json. Available templates: ${templateNames.join(", ")}`
            );
        }

        isMRZReady = true;

        // Wire CVR into the face/border detection processor
        // (registers IntermediateResultReceiver for portrait detection)
        if (typeof faceProcessor !== 'undefined') {
            await faceProcessor.setCVR(cvr);
        }

        els.status.textContent = "MRZ SDK Initialized. All features ready.";
        els.licenseKey.disabled = true;
        els.initBtn.textContent = "✓ MRZ Ready";

    } catch (ex) {
        console.error(ex);
        alert("MRZ initialization failed: " + ex.message + "\n\nYou can still use Face Detection.");
        els.initBtn.disabled = false;
        els.status.textContent = "MRZ failed. Face Detection still available.";
    }
});

// 2. Input Handling

// Load from Disk
document.getElementById('btnLoad').addEventListener('click', () => {
    if (!isFreeModelsReady) return alert("Please wait for models to load.");
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    };
    input.click();
});

// Paste from Clipboard
document.getElementById('btnPaste').addEventListener('click', async () => {
    if (!isFreeModelsReady) return alert("Please wait for models to load.");
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                const blob = await item.getType(item.types[0]);
                processFile(blob);
                return;
            }
        }
        alert("No image found in clipboard.");
    } catch (err) {
        console.error(err);
        alert("Failed to read clipboard. Make sure you granted permission.");
    }
});

// Drag and Drop
els.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropZone.classList.add('drag-over');
});
els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
els.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('drag-over');
    if (!isFreeModelsReady) return alert("Please wait for models to load.");
    if (e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
    }
});

// Camera Toggle - Simple webcam snapshot
document.getElementById('btnCamera').addEventListener('click', async () => {
    if (!isFreeModelsReady) return alert("Please wait for models to load.");

    if (isCameraRunning) {
        await captureAndFreezeCamera();
        return;
    }

    try {
        lastCameraResult = null;
        els.imageView.classList.add('hidden');
        els.cameraView.classList.remove('hidden');
        els.placeholderText.classList.add('hidden');

        // Create video element for webcam
        let video = els.cameraView.querySelector('video');
        if (!video) {
            video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'contain';
            els.cameraView.insertBefore(video, els.cameraOverlay);
        }

        // Setup camera overlay bounds once video metadata loads
        video.onloadeddata = () => {
            els.cameraOverlay.width = video.videoWidth;
            els.cameraOverlay.height = video.videoHeight;
            els.cameraOverlay.style.position = 'absolute';
            els.cameraOverlay.style.top = '0';
            els.cameraOverlay.style.left = '0';
            els.cameraOverlay.style.width = '100%';
            els.cameraOverlay.style.height = '100%';
            els.cameraOverlay.style.pointerEvents = 'none';
            els.cameraOverlay.style.objectFit = 'contain';

            const overlayCtx = els.cameraOverlay.getContext('2d', { willReadFrequently: true });
            overlayCtx.clearRect(0, 0, els.cameraOverlay.width, els.cameraOverlay.height);
        };

        // Get webcam stream
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        video.srcObject = videoStream;

        isCameraRunning = true;
        document.getElementById('btnCamera').textContent = "📸 Capture";
        els.status.textContent = "Camera ready. Click Capture to scan the current frame.";

    } catch (e) {
        console.error(e);
        alert("Camera failed: " + e.message);
    }
});

// Stores the last captured camera result so the frozen image can be redrawn.
let lastCameraResult = null;
async function captureAndFreezeCamera() {
    const video = els.cameraView.querySelector('video');
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        els.status.textContent = "Camera frame is not ready yet.";
        return;
    }

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = video.videoWidth;
    frameCanvas.height = video.videoHeight;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    const frozenFrameDataUrl = frameCanvas.toDataURL('image/jpeg', 0.95);

    isCameraRunning = false;

    if (els.cameraOverlay) {
        const ctx = els.cameraOverlay.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, els.cameraOverlay.width, els.cameraOverlay.height);
    }

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    video.srcObject = null;

    document.getElementById('btnCamera').textContent = "📷 Camera";
    els.cameraView.classList.add('hidden');
    els.imageView.classList.remove('hidden');
    els.status.textContent = "Processing captured frame...";
    clearResults();
    els.loadingSpinner.classList.add('visible');

    lastCameraResult = {
        base64Image: frozenFrameDataUrl,
        mrzTexts: [],
        mrzLocations: [],
        detectedQuad: null,
        portraitZone: null
    };

    try {
        await showCapturedCameraFrame(frozenFrameDataUrl);

        if (isMRZReady && cvr) {
            try {
                if (typeof faceProcessor !== 'undefined') {
                    faceProcessor.clearIntermediateResults();
                }

                const result = await cvr.capture(frameCanvas, "ReadPassportAndId");
                const items = result.items || [];
                const mrzTexts = [];
                const mrzLocations = [];
                let detectedQuad = null;

                for (const item of items) {
                    if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE) {
                        mrzTexts.push(item.text);
                        const location = item.location;
                        if (location?.points) {
                            mrzLocations.push({
                                points: location.points.map(point => ({ x: point.x, y: point.y }))
                            });
                        }
                    } else if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD) {
                        detectedQuad = item;
                    }
                }

                if (mrzTexts.length > 0) {
                    els.mrzRawText.textContent = mrzTexts.join('\n');
                    const mrzForParsing = mrzTexts.map(text => text.trim()).join('');
                    const parseResults = await parser.parse(mrzForParsing);
                    displayParsedMrz(parseResults);
                } else {
                    els.mrzRawText.textContent = "No MRZ detected.";
                    els.mrzResults.textContent = "No MRZ detected.";
                }

                let portraitZone = null;
                if (typeof faceProcessor?.findPortraitZoneForCapturedResult === 'function') {
                    portraitZone = await faceProcessor.findPortraitZoneForCapturedResult(result);
                }

                lastCameraResult = {
                    base64Image: frozenFrameDataUrl,
                    mrzTexts,
                    mrzLocations,
                    detectedQuad,
                    portraitZone
                };
            } catch (ex) {
                console.error("Capture detection error:", ex);
                els.mrzRawText.textContent = "MRZ detection error.";
                els.mrzResults.textContent = "MRZ detection error.";
            }
        } else {
            els.mrzRawText.textContent = "MRZ not initialized. Click 'Initialize SDK' with a valid license.";
            els.mrzResults.textContent = "MRZ requires Dynamsoft license.";
        }

        renderCapturedCameraResult();
    } finally {
        els.loadingSpinner.classList.remove('visible');
    }
}

function showCapturedCameraFrame(base64Image) {
    return new Promise((resolve) => {
        els.displayImage.onload = () => {
            resizeCanvas();
            const ctx = els.overlayCanvas.getContext('2d', { willReadFrequently: true });
            ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
            resolve();
        };
        els.displayImage.src = base64Image;
    });
}

function renderCapturedCameraResult() {
    if (!lastCameraResult?.base64Image) {
        els.status.textContent = "Capture failed.";
        return;
    }

    els.status.textContent = "Displaying captured frame.";
    const ctx = els.overlayCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
    resizeCanvas();

    if (lastCameraResult.mrzLocations) {
        for (const location of lastCameraResult.mrzLocations) {
            drawOverlay(location);
        }
    }

    if (typeof faceProcessor !== 'undefined') {
        const w = els.displayImage.naturalWidth;
        const h = els.displayImage.naturalHeight;
        if (lastCameraResult.detectedQuad) {
            faceProcessor.drawDocumentBorder(lastCameraResult.detectedQuad, els.overlayCanvas, w, h);
        }
        if (lastCameraResult.portraitZone) {
            faceProcessor.drawAndCropPortrait(lastCameraResult.portraitZone, els.displayImage, els.faceCropCanvas, els.overlayCanvas);
        } else {
            const faceCtx = els.faceCropCanvas.getContext('2d', { willReadFrequently: true });
            faceCtx.clearRect(0, 0, els.faceCropCanvas.width, els.faceCropCanvas.height);
        }
    }
}

function stopCamera() {
    isCameraRunning = false;
    
    // Clear live overlay
    if (els.cameraOverlay) {
        const ctx = els.cameraOverlay.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, els.cameraOverlay.width, els.cameraOverlay.height);
    }
    
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    const video = els.cameraView.querySelector('video');
    if (video) {
        video.srcObject = null;
    }
    
    document.getElementById('btnCamera').textContent = "📷 Camera";
    els.cameraView.classList.add('hidden');
    els.imageView.classList.remove('hidden');
    els.status.textContent = "Ready";
}

// 3. Processing Logic

async function processFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        loadImage(base64, file);
    };
    reader.readAsDataURL(file);
}

function loadImage(base64Image, captureSource = null) {
    currentImageCaptureSource = captureSource ?? base64Image;
    els.displayImage.src = base64Image;
    els.placeholderText.classList.add('hidden');
    els.imageView.classList.remove('hidden');
    els.cameraView.classList.add('hidden');

    els.displayImage.onload = async () => {
        resizeCanvas();
        els.status.textContent = "Processing...";
        clearResults();

        // Show spinner
        els.loadingSpinner.classList.add('visible');

        const ctx = els.overlayCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);

        try {
            // Run MRZ detection (only if license is initialized)
            if (isMRZReady && cvr) {
                try {
                    // Clear previous intermediate results so IdentityProcessor
                    // only sees data from this capture call
                    if (typeof faceProcessor !== 'undefined') {
                        faceProcessor.clearIntermediateResults();
                    }

                    // Use ReadPassportAndId template: one capture returns MRZ text,
                    // document border (DetectedQuad), and intermediate units for
                    // IdentityProcessor.findPortraitZone()
                    const captureSource = currentImageCaptureSource ?? els.displayImage;
                    const result = await cvr.capture(captureSource, "ReadPassportAndId");
                    const items = result.items || [];

                    let mrzTexts = [];
                    for (const item of items) {
                        if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE) {
                            mrzTexts.push(item.text);

                            // Draw overlay and capture MRZ zone
                            const location = item.location;
                            if (location && location.points) {
                                drawOverlay(location);
                            }
                        }
                    }

                    if (mrzTexts.length > 0) {
                        // Display raw MRZ text with newlines for readability
                        els.mrzRawText.textContent = mrzTexts.join('\\n');

                        // Parse MRZ - join all lines into single string (no separators)
                        // TD3 passport has 2 lines of 44 chars each = 88 chars total
                        const mrzForParsing = mrzTexts.map(t => t.trim()).join('');

                        const parseResults = await parser.parse(mrzForParsing);
                        displayParsedMrz(parseResults);
                    } else {
                        els.mrzRawText.textContent = "No MRZ detected.";
                        els.mrzResults.textContent = "No MRZ detected.";
                    }

                    // Process face/border from the same captured result
                    if (typeof faceProcessor !== 'undefined') {
                        await faceProcessor.processCapturedResult(
                            result, els.displayImage, els.faceCropCanvas, els.overlayCanvas
                        );
                    }

                } catch (mrzEx) {
                    console.error("MRZ detection error:", mrzEx);
                    els.mrzRawText.textContent = "MRZ detection error.";
                    els.mrzResults.textContent = "MRZ detection error.";
                    const faceCtx = els.faceCropCanvas.getContext('2d', { willReadFrequently: true });
                    faceCtx.clearRect(0, 0, els.faceCropCanvas.width, els.faceCropCanvas.height);
                }
            } else {
                els.mrzRawText.textContent = "MRZ not initialized. Click 'Initialize SDK' with a valid license.";
                els.mrzResults.textContent = "MRZ requires Dynamsoft license.";
            }
            } catch (ex) {
            console.error(ex);
            els.status.textContent = "Error: " + ex.message;
        } finally {
            // Hide spinner
            els.loadingSpinner.classList.remove('visible');
            els.status.textContent = "Ready";
        }
    };
}

function displayParsedMrz(parseResults) {
    const info = extractMrzInfo(parseResults);
    let html = "";

    const fieldOrder = [
        "documentType", "issuingState", "surname", "givenName",
        "passportNumber", "nationality", "dateOfBirth", "gender",
        "dateOfExpiry"
    ];

    const labels = {
        documentType: "Document Type",
        issuingState: "Issuing State",
        surname: "Surname",
        givenName: "Given Name",
        passportNumber: "Passport/Document Number",
        nationality: "Nationality",
        dateOfBirth: "Date of Birth",
        gender: "Gender",
        dateOfExpiry: "Date of Expiry"
    };

    fieldOrder.forEach(key => {
        if (info[key]) {
            html += `<div><span class="label">${labels[key]}:</span> <span class="highlight">${info[key]}</span></div>`;
        }
    });

    if (html === "") {
        html = JSON.stringify(info, null, 2);
    }

    els.mrzResults.innerHTML = html;
}

function extractMrzInfo(result) {
    const info = {};
    if (!result || !result.getFieldValue) return info;

    try {
        // Get document type from documentCode
        let type = result.getFieldValue("documentCode");
        info.documentType = JSON.parse(result.jsonString).CodeType;

        // Issuing state
        info.issuingState = result.getFieldValue("issuingState");

        // Names - use primaryIdentifier and secondaryIdentifier  
        let surname = result.getFieldValue("primaryIdentifier");
        let givenName = result.getFieldValue("secondaryIdentifier");
        // Clean up any newlines or extra whitespace
        info.surname = surname ? surname.replace(/[\n\r]/g, '').trim() : '';
        info.givenName = givenName ? givenName.replace(/[\n\r]/g, '').trim() : '';

        // Document number - passportNumber for passports, documentNumber for others
        let docNum = type === "P" ? result.getFieldValue("passportNumber") : result.getFieldValue("documentNumber");
        info.passportNumber = docNum ? docNum.replace(/[\n\r]/g, '').trim() : '';

        // Nationality
        let nationality = result.getFieldValue("nationality");
        info.nationality = nationality ? nationality.replace(/[\n\r]/g, '').trim() : '';

        // Gender
        let gender = result.getFieldValue("sex");
        info.gender = gender ? gender.replace(/[\n\r]/g, '').trim() : '';

        // Date of Birth - build from year/month/day
        let birthYear = result.getFieldValue("birthYear");
        let birthMonth = result.getFieldValue("birthMonth");
        let birthDay = result.getFieldValue("birthDay");
        if (birthYear && birthMonth && birthDay) {
            // Clean values
            birthYear = birthYear.replace(/[\n\r]/g, '').trim();
            birthMonth = birthMonth.replace(/[\n\r]/g, '').trim();
            birthDay = birthDay.replace(/[\n\r]/g, '').trim();
            // Determine century for birth year
            if (parseInt(birthYear) > (new Date().getFullYear() % 100)) {
                birthYear = "19" + birthYear;
            } else {
                birthYear = "20" + birthYear;
            }
            info.dateOfBirth = birthYear + "-" + birthMonth + "-" + birthDay;
        }

        // Date of Expiry - build from year/month/day
        let expiryYear = result.getFieldValue("expiryYear");
        let expiryMonth = result.getFieldValue("expiryMonth");
        let expiryDay = result.getFieldValue("expiryDay");
        if (expiryYear && expiryMonth && expiryDay) {
            // Clean values
            expiryYear = expiryYear.replace(/[\n\r]/g, '').trim();
            expiryMonth = expiryMonth.replace(/[\n\r]/g, '').trim();
            expiryDay = expiryDay.replace(/[\n\r]/g, '').trim();
            // Determine century for expiry year
            if (parseInt(expiryYear) >= 60) {
                expiryYear = "19" + expiryYear;
            } else {
                expiryYear = "20" + expiryYear;
            }
            info.dateOfExpiry = expiryYear + "-" + expiryMonth + "-" + expiryDay;
        }
    } catch (e) {
        console.warn("extractMrzInfo error:", e);
    }

    return info;
}

function drawOverlay(location) {
    if (!location || !location.points) return;

    const ctx = els.overlayCanvas.getContext('2d', { willReadFrequently: true });
    const points = location.points;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.fill();
}

function resizeCanvas() {
    // Canvas backing store matches image natural dimensions
    // CSS object-fit: contain scales both image and canvas identically
    els.overlayCanvas.width = els.displayImage.naturalWidth;
    els.overlayCanvas.height = els.displayImage.naturalHeight;
}

function clearResults() {
    els.mrzRawText.textContent = "Waiting for scan...";
    els.mrzResults.textContent = "Waiting for scan...";
    const ctx = els.faceCropCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, els.faceCropCanvas.width, els.faceCropCanvas.height);
}

// Paste event handler
document.addEventListener('paste', (event) => {
    if (!isSDKReady) return;
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            processFile(blob);
            break;
        }
    }
});