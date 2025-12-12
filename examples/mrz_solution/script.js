let cvr = null;
let parser = null;
let isSDKReady = false;
let isCameraRunning = false;
let videoStream = null;

// DOM Elements
const els = {
    licenseKey: document.getElementById('licenseKey'),
    initBtn: document.getElementById('initBtn'),
    displayImage: document.getElementById('displayImage'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    dropZone: document.getElementById('dropZone'),
    cameraView: document.getElementById('cameraView'),
    imageView: document.getElementById('imageView'),
    mrzRawText: document.getElementById('mrzRawText'),
    mrzResults: document.getElementById('mrzResults'),
    ocrResults: document.getElementById('ocrResults'),
    faceCropCanvas: document.getElementById('faceCropCanvas'),
    status: document.getElementById('status'),
    placeholderText: document.getElementById('placeholderText')
};

// 1. Initialization
els.initBtn.addEventListener('click', async () => {
    let key = els.licenseKey.value.trim();
    if (!key) {
        key = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";
    }

    try {
        els.status.textContent = "Initializing SDK...";
        els.initBtn.disabled = true;

        // Initialize License
        await Dynamsoft.License.LicenseManager.initLicense(key, true);

        // Load WASM modules
        els.status.textContent = "Loading WASM modules...";
        await Dynamsoft.Core.CoreModule.loadWasm(["DLR"]);

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

        // Create Capture Vision Router
        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        // Load MRZ template
        await cvr.initSettings("./full.json");

        // Initialize OCR (PaddleOCR)
        if (window.initOCR) {
            els.status.textContent = "Loading OCR models...";
            await window.initOCR();
        }

        // Initialize Face Detection
        if (window.initFaceDetection) {
            els.status.textContent = "Loading face detection model...";
            await window.initFaceDetection();
        }

        isSDKReady = true;
        els.status.textContent = "SDK Initialized. Ready.";
        els.licenseKey.disabled = true;

        // Enable buttons
        document.getElementById('btnLoad').disabled = false;
        document.getElementById('btnCamera').disabled = false;
        document.getElementById('btnPaste').disabled = false;

    } catch (ex) {
        console.error(ex);
        alert("Initialization failed: " + ex.message);
        els.initBtn.disabled = false;
        els.status.textContent = "Initialization failed.";
    }
});

// 2. Input Handling

// Load from Disk
document.getElementById('btnLoad').addEventListener('click', () => {
    if (!isSDKReady) return alert("Please initialize SDK first.");
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
    if (!isSDKReady) return alert("Please initialize SDK first.");
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
    if (!isSDKReady) return alert("Please initialize SDK first.");
    if (e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
    }
});

// Camera Toggle - Simple webcam snapshot
document.getElementById('btnCamera').addEventListener('click', async () => {
    if (!isSDKReady) return alert("Please initialize SDK first.");

    if (isCameraRunning) {
        captureSnapshot();
        return;
    }

    try {
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
            els.cameraView.appendChild(video);
        }

        // Get webcam stream
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        video.srcObject = videoStream;

        isCameraRunning = true;
        document.getElementById('btnCamera').textContent = "📸 Capture";
        els.status.textContent = "Camera ready. Click Capture to take photo.";

    } catch (e) {
        console.error(e);
        alert("Camera failed: " + e.message);
    }
});

function captureSnapshot() {
    const video = els.cameraView.querySelector('video');
    if (!video) return;

    // Create canvas to capture frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Convert to base64 and load into image view
    const base64Image = canvas.toDataURL('image/jpeg', 0.95);

    // Stop camera
    stopCamera();

    // Process the captured image
    loadImage(base64Image);
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    const video = els.cameraView.querySelector('video');
    if (video) {
        video.srcObject = null;
    }
    isCameraRunning = false;
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
        loadImage(base64);
    };
    reader.readAsDataURL(file);
}

function loadImage(base64Image) {
    els.displayImage.src = base64Image;
    els.placeholderText.classList.add('hidden');
    els.imageView.classList.remove('hidden');
    els.cameraView.classList.add('hidden');

    els.displayImage.onload = async () => {
        resizeCanvas();
        els.status.textContent = "Processing...";
        clearResults();

        const ctx = els.overlayCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);

        let mrzZone = null; // Track MRZ zone to exclude from PaddleOCR

        try {
            // Run MRZ detection
            const result = await cvr.capture(base64Image, "ReadMRZ");
            const items = result.items;

            let mrzTexts = [];
            for (const item of items) {
                if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE) {
                    mrzTexts.push(item.text);

                    // Draw overlay and capture MRZ zone
                    const location = item.location;
                    if (location && location.points) {
                        drawOverlay(location);

                        // Calculate MRZ bounding box for OCR exclusion
                        const points = location.points;
                        const minX = Math.min(...points.map(p => p.x));
                        const maxX = Math.max(...points.map(p => p.x));
                        const minY = Math.min(...points.map(p => p.y));
                        const maxY = Math.max(...points.map(p => p.y));

                        if (!mrzZone) {
                            mrzZone = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                        } else {
                            // Expand zone to include all MRZ lines
                            mrzZone.x = Math.min(mrzZone.x, minX);
                            mrzZone.y = Math.min(mrzZone.y, minY);
                            mrzZone.width = Math.max(mrzZone.x + mrzZone.width, maxX) - mrzZone.x;
                            mrzZone.height = Math.max(mrzZone.y + mrzZone.height, maxY) - mrzZone.y;
                        }
                    }
                }
            }

            if (mrzTexts.length > 0) {
                // Display raw MRZ text with newlines for readability
                els.mrzRawText.textContent = mrzTexts.join('\n');

                // Parse MRZ - join all lines into single string (no separators)
                // TD3 passport has 2 lines of 44 chars each = 88 chars total
                const mrzForParsing = mrzTexts.map(t => t.trim()).join('');

                const parseResults = await parser.parse(mrzForParsing);
                displayParsedMrz(parseResults);
            } else {
                els.mrzRawText.textContent = "No MRZ detected.";
                els.mrzResults.textContent = "No MRZ detected.";
            }

            // Run face detection (ONNX)
            if (window.runFaceDetection) {
                await window.runFaceDetection(els.displayImage, els.faceCropCanvas, els.overlayCanvas);
            }

            // Run OCR (PaddleOCR) - skip MRZ zone
            if (window.runOCR) {
                els.status.textContent = "Running OCR...";
                await window.runOCR(els.displayImage, els.ocrResults, els.overlayCanvas, mrzZone);
            }

        } catch (ex) {
            console.error(ex);
            els.status.textContent = "Error: " + ex.message;
        }

        els.status.textContent = "Ready";
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
    els.overlayCanvas.width = els.displayImage.naturalWidth;
    els.overlayCanvas.height = els.displayImage.naturalHeight;
}

function clearResults() {
    els.mrzRawText.textContent = "Waiting for scan...";
    els.mrzResults.textContent = "Waiting for scan...";
    els.ocrResults.textContent = "Waiting for scan...";
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