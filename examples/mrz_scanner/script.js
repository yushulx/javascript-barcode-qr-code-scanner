/**
 * MRZ & Passport Scanner
 *
 * Extracts MRZ fields, document borders, and portrait photos from passports and
 * ID cards in the browser with Dynamsoft Capture Vision 3.4.2001.
 */

/* Analytics shim: keeps the demo running even if the shared tracker fails
   to load (blocked by an ad blocker, offline, etc.). */
/* Shared capture-progress feedback (demos/shared/scanner-feedback.js). Same
   degrade-gracefully pattern as analytics above: if the shared file did not
   load, capture still works, it just shows no animation. */
var feedback = window.ScannerFeedback || {
    begin: function () { },
    end: function () { },
    isBusy: function () { return false; },
    run: function (label, factory) {
        return Promise.resolve(typeof factory === 'function' ? factory() : factory);
    }
};

var analytics = window.DemoAnalytics || {
    ready: function () { },
    error: function () { },
    start: function () { },
    success: function () { },
    fail: function () { },
    action: function () { },
    trialClick: function () { }
};

/* The demos hosted under /codepool/demos/ share one license that is bound to
   dynamsoft.com, so activation runs on page load and there is no license input.

   The bound key only activates on dynamsoft.com, so on any other host
   (localhost, staging, a fork) we fall back to the SDK's public 24-hour trial
   key, which is accepted on localhost. */
const BOUND_HOSTS = ['dynamsoft.com'];
const CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
const TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';

function isBoundHost() {
    const host = window.location.hostname.toLowerCase();
    return BOUND_HOSTS.some(function (bound) {
        return host === bound || host.endsWith('.' + bound);
    });
}

function resolveLicenseKey() {
    if (isBoundHost()) {
        return CODEPOOL_LICENSE_KEY;
    }
    console.info('[demo] Using the SDK trial license: the Codepool license is bound to '
        + BOUND_HOSTS.join(', ') + ' and cannot activate on "' + window.location.hostname + '".');
    analytics.action('license_fallback', { host: window.location.hostname });
    return TRIAL_LICENSE_KEY;
}

/* Asset version: script.js is loaded as script.js?v=<n> (see index.html).
   Reuse that value so the template JSON is cache-busted by the same bump. */
const ASSET_V = (function () {
    const src = document.currentScript ? document.currentScript.src : "";
    const i = src.indexOf("?v=");
    return i === -1 ? "" : src.slice(i);
})();

let cvr = null;
let parser = null;
let isMRZReady = false;
let isFreeModelsReady = false;
let isCameraRunning = false;
let videoStream = null;
let currentImageCaptureSource = null;
let lastInputSource = 'file';

async function initFreeModels() {
    const statusEl = document.getElementById('status');
    try {
        statusEl.textContent = "Loading Face Detection models...";

        // Initialize Face Detection – registers the processor (powered by Dynamsoft Identity when CVR is available)
        if (window.initFaceDetection) {
            await window.initFaceDetection();
        }

        isFreeModelsReady = true;

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

// 1. Initialization - MRZ (activated automatically with the domain-bound demo license)
async function initMRZ() {
    try {
        els.status.textContent = "Initializing MRZ SDK...";

        // Initialize License
        await Dynamsoft.License.LicenseManager.initLicense(resolveLicenseKey(), true);

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
        const settingsResult = await cvr.initSettings("./findPrecisePortraitZone.json" + ASSET_V);
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

        els.status.textContent = "MRZ SDK initialized. All features ready.";
    } catch (ex) {
        console.error(ex);
        analytics.error('init_failed', (ex && (ex.message || ex)) || 'unknown');
        els.status.textContent = "MRZ initialization failed. Face Detection is still available.";
    }
}

// Start loading models and activate the SDK when the page loads
window.addEventListener('DOMContentLoaded', async () => {
    const initStartedAt = performance.now();
    await initFreeModels();
    await initMRZ();
    if (isMRZReady) {
        analytics.ready(performance.now() - initStartedAt);
    }
});

// DOM Elements
const els = {
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

// 2. Input Handling

// Load from Disk
document.getElementById('btnLoad').addEventListener('click', () => {
    if (!isFreeModelsReady) return alert("Please wait for models to load.");
    const input = document.createElement('input');
    input.type = 'file';
    /* TIFF and PDF are rasterized page by page; `accept` lists them explicitly
       because no browser reports a MIME type for every .tif it is handed. */
    input.accept = 'image/*,application/pdf,.pdf,.tif,.tiff';
    input.onchange = (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            lastInputSource = fileKind(file) === 'image' ? 'file' : fileKind(file);
            processFile(file);
        }
    };
    input.click();
});

// Paste from Clipboard
//
// This button and Ctrl+V are NOT the same path, and Ctrl+V is the more capable
// one: the document `paste` event (below) needs no permission and works in every
// browser, while `navigator.clipboard.read()` needs a Chromium browser, the
// clipboard-read permission, and a focused document. When this button fails, the
// message says so and points at Ctrl+V rather than dead-ending.
//
// The real bug here was subtler than permissions though: the code checked that an
// image was present but then asked for `types[0]`, and most apps put `text/html`
// first on the clipboard when you copy a screenshot — so `getType` handed back an
// HTML blob that was fed to the decoder as if it were an image, and the button
// silently failed even though the picture was right there.
document.getElementById('btnPaste').addEventListener('click', async () => {
    if (!isFreeModelsReady) return alert("Please wait for models to load.");
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        alert("This browser does not let a button read the clipboard. Please press Ctrl+V instead — that works here.");
        return;
    }

    let items;
    try {
        items = await navigator.clipboard.read();
    } catch (err) {
        console.error(err);
        const text = ((err && err.name) || '') + ' ' + ((err && err.message) || '');
        alert(/focus/i.test(text)
            ? "The page lost focus while reading the clipboard. Click the page, then press Ctrl+V."
            : "Clipboard access was blocked. Press Ctrl+V instead — that works here.");
        return;
    }

    // Ask for the image entry itself. `types[0]` is frequently text/html.
    for (const item of items) {
        const imageType = (item.types || []).find(t => t.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        lastInputSource = 'clipboard';
        processFile(blob);
        return;
    }

    alert("No image found in the clipboard. Copy a screenshot, or press Ctrl+V.");
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
        const file = e.dataTransfer.files[0];
        lastInputSource = 'drag_drop';
        /* A dataset ZIP belongs to the benchmark (benchmark.js), not to the
           single-scan path — it is an archive of test images plus the ground
           truth, and treating it as an image would fail in a confusing way. */
        if (window.MrzBenchmark && window.MrzBenchmark.accepts(file)) {
            window.MrzBenchmark.load(file);
            return;
        }
        processFile(file);
    }
});

// Multi-page documents: step through the rasterized pages of a PDF or TIFF.
document.getElementById('pagePrevBtn').addEventListener('click', () => stepDocumentPage(-1));
document.getElementById('pageNextBtn').addEventListener('click', () => stepDocumentPage(1));

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
        document.getElementById('btnCamera').textContent = "Capture";
        els.status.textContent = "Camera ready — tracking the document outline. The MRZ text and the portrait are read after you press Capture.";
        analytics.action('camera_open');

        startLiveDetection();

    } catch (e) {
        console.error(e);
        alert("Camera failed: " + e.message);
    }
});

// ---------------------------------------------------------------------------
// Live detection while the camera previews.
//
// One pass per cycle, outline only. The same ReadPassportAndId template also
// yields the MRZ text lines and the portrait, but that is the expensive half of
// the work and those regions are only shown after Capture, on the frozen
// full-resolution frame. One cheap outline pass per cycle roughly doubles the
// outline's refresh rate compared with the previous two-pass live loop.
//
// Detection and painting are decoupled: a cycle only records the newest quad in
// LIVE_DETECT.target, and a requestAnimationFrame loop eases the drawn outline
// toward it. A cycle that finds nothing keeps the previous outline for a moment
// (then fades it out) instead of clearing the overlay, so a single missed frame
// does not make the border blink.
// ---------------------------------------------------------------------------
const LIVE_DETECT = {
    /* Minimum time between the START of two cycles — the next timer is
       scheduled from the cycle start, so the cadence is max(intervalMs,
       processing time), not processing time + intervalMs. */
    intervalMs: 400,
    /* A 640px frame is plenty for the document outline and keeps the frame grab
       and its readback cheap. */
    detectWidth: 640,
    /* How long a detected outline stays on screen without a fresh detection
       before it fades away. A document that left the frame must not leave a
       stale box behind. */
    staleMs: 900,
    running: false,
    timer: null,
    /* Newest detected quad in video pixel coordinates, and when it was seen. */
    target: null,
    seenAt: 0
};

/* State of the painted outline: it eases toward LIVE_DETECT.target and fades
   out when no fresh detection arrives. */
const LIVE_OVERLAY = {
    points: null,
    alpha: 0,
    lastFrameAt: 0,
    raf: null
};

function clearCameraOverlay() {
    const ctx = els.cameraOverlay.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, els.cameraOverlay.width, els.cameraOverlay.height);
}

function stopLiveDetection() {
    LIVE_DETECT.running = false;
    LIVE_DETECT.target = null;
    LIVE_DETECT.seenAt = 0;
    if (LIVE_DETECT.timer) {
        clearTimeout(LIVE_DETECT.timer);
        LIVE_DETECT.timer = null;
    }
    if (LIVE_OVERLAY.raf) {
        cancelAnimationFrame(LIVE_OVERLAY.raf);
        LIVE_OVERLAY.raf = null;
    }
    LIVE_OVERLAY.points = null;
    LIVE_OVERLAY.alpha = 0;
    clearCameraOverlay();
}

function startLiveDetection() {
    if (LIVE_DETECT.running) return;
    LIVE_DETECT.running = true;
    LIVE_OVERLAY.lastFrameAt = performance.now();
    LIVE_OVERLAY.raf = requestAnimationFrame(paintLiveOverlay);
    scheduleLiveDetection(0);
}

function scheduleLiveDetection(delay) {
    if (!LIVE_DETECT.running) return;
    LIVE_DETECT.timer = setTimeout(runLiveDetection, delay);
}

async function runLiveDetection() {
    if (!LIVE_DETECT.running || !isCameraRunning) return;
    if (els.cameraView.classList.contains('hidden')) return;   // camera no longer on screen
    if (!isMRZReady || !cvr) {
        /* The camera can be opened while the MRZ SDK is still initializing;
           keep polling so live detection starts by itself once it is ready. */
        scheduleLiveDetection(LIVE_DETECT.intervalMs);
        return;
    }

    const video = els.cameraView.querySelector('video');
    if (!video || video.readyState < 2 || !video.videoWidth) {
        scheduleLiveDetection(LIVE_DETECT.intervalMs);
        return;
    }

    const startedAt = performance.now();
    try {
        // Downscaled frame grab — the outline does not need full resolution.
        const scale = Math.min(1, LIVE_DETECT.detectWidth / video.videoWidth);
        const frame = document.createElement('canvas');
        frame.width = Math.max(1, Math.round(video.videoWidth * scale));
        frame.height = Math.max(1, Math.round(video.videoHeight * scale));
        frame.getContext('2d', { willReadFrequently: true })
            .drawImage(video, 0, 0, frame.width, frame.height);

        // The overlay backing store already tracks the video, but keep it honest
        // in case the loop's first tick lands before `onloadeddata` fires.
        if (els.cameraOverlay.width !== video.videoWidth || els.cameraOverlay.height !== video.videoHeight) {
            els.cameraOverlay.width = video.videoWidth;
            els.cameraOverlay.height = video.videoHeight;
        }

        const result = await cvr.capture(frame, "ReadPassportAndId");
        if (!LIVE_DETECT.running) return;      // Capture was pressed meanwhile

        // Keep only the document outline; MRZ lines and the portrait are read
        // after Capture, from the frozen full-resolution frame.
        const inv = 1 / scale;
        for (const item of result.items || []) {
            const pts = item.location && item.location.points;
            if (pts && pts.length === 4 && item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD) {
                LIVE_DETECT.target = pts.map(p => ({ x: p.x * inv, y: p.y * inv }));
                LIVE_DETECT.seenAt = performance.now();
            }
        }
    } catch (err) {
        /* Framing feedback is best-effort: one failed frame must not take the
           loop down or nag the user. */
        console.warn('Live detection skipped a frame:', (err && err.message) || err);
    }

    scheduleLiveDetection(Math.max(0, LIVE_DETECT.intervalMs - (performance.now() - startedAt)));
}

/* Ease factor for a time step, so the motion looks the same on 60Hz and 120Hz
   displays and does not depend on how often a detection happens to finish. */
function liveEase(dt, tauMs) {
    return 1 - Math.exp(-dt / tauMs);
}

function paintLiveOverlay(now) {
    LIVE_OVERLAY.raf = null;
    if (!LIVE_DETECT.running) return;

    // Clamp dt so a background tab or a long stall cannot make the outline jump.
    const dt = Math.min(100, Math.max(1, now - LIVE_OVERLAY.lastFrameAt));
    LIVE_OVERLAY.lastFrameAt = now;

    const fresh = !!(LIVE_DETECT.target && now - LIVE_DETECT.seenAt < LIVE_DETECT.staleMs);
    if (fresh) {
        if (!LIVE_OVERLAY.points) {
            LIVE_OVERLAY.points = LIVE_DETECT.target.map(p => ({ x: p.x, y: p.y }));
        } else {
            const k = liveEase(dt, 90);
            for (let i = 0; i < LIVE_OVERLAY.points.length; i++) {
                const cur = LIVE_OVERLAY.points[i];
                const tgt = LIVE_DETECT.target[i];
                cur.x += (tgt.x - cur.x) * k;
                cur.y += (tgt.y - cur.y) * k;
            }
        }
    }

    LIVE_OVERLAY.alpha += ((fresh ? 1 : 0) - LIVE_OVERLAY.alpha) * liveEase(dt, 180);
    if (!fresh && LIVE_OVERLAY.alpha < 0.02) {
        LIVE_OVERLAY.alpha = 0;
        LIVE_OVERLAY.points = null;
        LIVE_DETECT.target = null;
    }

    clearCameraOverlay();
    const pts = LIVE_OVERLAY.points;
    if (pts && LIVE_OVERLAY.alpha > 0) {
        const ctx = els.cameraOverlay.getContext('2d', { willReadFrequently: true });
        ctx.save();
        ctx.globalAlpha = LIVE_OVERLAY.alpha;
        ctx.strokeStyle = '#fe8e14';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    LIVE_OVERLAY.raf = requestAnimationFrame(paintLiveOverlay);
}

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
    stopLiveDetection();

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    video.srcObject = null;

    document.getElementById('btnCamera').textContent = "Camera";
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
            analytics.start('mrz', 'camera');
            try {
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
                    analytics.success('mrz', 'camera', { mrz_lines: mrzTexts.length });
                } else {
                    els.mrzRawText.textContent = "No MRZ detected.";
                    els.mrzResults.textContent = "No MRZ detected.";
                    analytics.fail('mrz', 'camera');
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
                analytics.fail('mrz', 'camera');
                els.mrzRawText.textContent = "MRZ detection error.";
                els.mrzResults.textContent = "MRZ detection error.";
            }
        } else {
            els.mrzRawText.textContent = "MRZ not ready yet. Please wait for initialization to finish.";
            els.mrzResults.textContent = "MRZ is still initializing.";
        }

        renderCapturedCameraResult();
    } finally {
        els.loadingSpinner.classList.remove('visible');
    }
}

function showCapturedCameraFrame(base64Image) {
    /* A frozen camera frame is not a page of the document that may have been
       open before it. */
    hidePageNav();
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
    
    document.getElementById('btnCamera').textContent = "Camera";
    els.cameraView.classList.add('hidden');
    els.imageView.classList.remove('hidden');
    els.status.textContent = "Ready";
}

// 3. Processing Logic

/* ---------------------------------------------------------------------------
 * Multi-page documents (PDF / TIFF)
 *
 * The reader takes an image, and neither a PDF nor a TIFF is one — the
 * browser's own decoders cannot open either — so both are rasterized into one
 * image per page here, and each page then travels the ordinary image path:
 * same capture() call, same overlay, same parsing. PDF goes through pdf.js,
 * TIFF through UTIF (plus pako, which UTIF needs for Deflate). Both load from
 * jsDelivr on first use, so a visitor who never opens a document never
 * downloads them.
 * ------------------------------------------------------------------------- */

const PAGE_MAX_SIDE = 2000;      // px, long edge of one rasterized page
const MAX_DOCUMENT_PAGES = 50;
const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149';
const PAKO_URL = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
const UTIF_URL = 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js';
/* UTIF implements exactly these compression codes; anything else decodes to
   noise, so it is rejected with a message instead of a black page. */
const TIFF_READABLE_COMPRESSION = [1, 3, 4, 5, 6, 7, 8, 32767, 32773, 32809, 34713];
/* Adobe Deflate (32946) and Deflate (8) carry the same zlib stream; UTIF only
   branches on 8, and 32946 is what libtiff-family writers emit, so it is
   relabelled before decoding rather than rejected as unreadable. */
const TIFF_ADOBE_DEFLATE = 32946;

let pdfjsPromise = null;
let tiffPromise = null;
let documentPages = [];    // [{ src, label }] of the last document opened
let documentPageIndex = 0;

/* The extension is checked as well as the MIME type: browsers report an empty
   type for some .tif files and for a .pdf served without its registered type. */
function fileKind(file) {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (file.type === 'application/pdf' || extension === 'pdf') return 'pdf';
    if (file.type === 'image/tiff' || extension === 'tif' || extension === 'tiff') return 'tiff';
    if (file.type === 'application/zip' || extension === 'zip') return 'zip';
    if (file.type.startsWith('image/')) return 'image';
    return 'unknown';
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Could not read ' + file.name));
        reader.readAsDataURL(file);
    });
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => {
            script.remove();
            reject(new Error('Could not load ' + url));
        };
        document.head.appendChild(script);
    });
}

function loadPdfJs() {
    if (!pdfjsPromise) {
        pdfjsPromise = import(PDFJS_BASE + '/legacy/build/pdf.min.mjs')
            .then((pdfjsLib) => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + '/legacy/build/pdf.worker.min.mjs';
                return pdfjsLib;
            })
            .catch((ex) => {
                pdfjsPromise = null;   // let the next upload retry
                throw ex;
            });
    }
    return pdfjsPromise;
}

// UTIF reads Deflate through pako and picks up `self.pako` as it loads, so pako
// has to be in place first.
function loadTiffDecoder() {
    if (!tiffPromise) {
        tiffPromise = loadScript(PAKO_URL)
            .then(() => loadScript(UTIF_URL))
            .then(() => {
                if (!window.UTIF) throw new Error('The TIFF decoder did not initialise.');
                return window.UTIF;
            })
            .catch((ex) => {
                tiffPromise = null;
                throw ex;
            });
    }
    return tiffPromise;
}

async function rasterizePdf(file) {
    const pdfjsLib = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    // isEvalSupported:false keeps pdf.js from eval()-ing content from a PDF the
    // visitor supplied.
    const pdf = await pdfjsLib.getDocument({ data: data, isEvalSupported: false }).promise;
    const pageCount = Math.min(pdf.numPages, MAX_DOCUMENT_PAGES);
    const pages = [];

    try {
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
            if (pageCount > 1) {
                els.status.textContent = `Rendering page ${pageNumber} of ${pageCount}…`;
            }
            const page = await pdf.getPage(pageNumber);
            const unscaled = page.getViewport({ scale: 1 });
            const scale = Math.min(3, Math.max(1, PAGE_MAX_SIDE / Math.max(unscaled.width, unscaled.height)));
            const viewport = page.getViewport({ scale: scale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;

            pages.push(canvas.toDataURL('image/png'));
            page.cleanup();
        }
    } finally {
        await pdf.destroy();
    }

    return { pages: pages, totalPages: pdf.numPages };
}

/* Converts one decoded frame to RGBA.
 *
 * UTIF's own toRGBA8() covers white-is-zero, black-is-zero, RGB, palette and
 * CMYK — but not photometric 6 (YCbCr), which is what a TIFF written by a video
 * pipeline usually carries (MIDV500 document frames, for instance, are YCbCr
 * 4:2:2 in PackBits strips). UTIF logs "Unknown Photometric interpretation",
 * skips the conversion and hands back a zero-filled buffer, which reaches the
 * canvas as a black image with no error anywhere.
 *
 * TIFF 6.0 stores subsampled YCbCr in clumps — for 2x2, four Y samples then one
 * Cb and one Cr. UTIF decompresses each strip into a slot sized for a full
 * uncompressed strip at three bytes per pixel, while the clumps occupy only
 * their compact part of it, so the walk below is per strip and starts at the
 * slot UTIF gave that strip.
 *
 * ReferenceBlackWhite (tag 532) says how the samples map onto the full range:
 * the video-range defaults ffmpeg writes are [15, 235, 128, 240, 128, 240], so
 * luma is 16-235 and chroma 16-240 about a neutral 128. Subtracting the
 * reference before scaling is what puts neutral chroma on zero. */
function tiffToRgba(UTIF, ifd) {
    const photometric = ifd.t262 ? ifd.t262[0] : 2;
    if (photometric !== 6) return UTIF.toRGBA8(ifd);

    const bps = ifd.t258 ? ifd.t258[0] : 8;
    const samples = ifd.t258 ? ifd.t258.length : 3;
    if (bps !== 8 || samples !== 3) {
        throw new Error('this TIFF stores YCbCr ' + bps + '-bit with ' + samples
            + ' samples per pixel, which is not supported. Re-save it as RGB or as a PDF.');
    }

    const w = ifd.width;
    const h = ifd.height;
    const data = ifd.data;
    const sub = (ifd.t530 && ifd.t530.length === 2) ? ifd.t530 : [2, 2];
    const ref = (ifd.t532 && ifd.t532.length === 6) ? ifd.t532 : [15, 235, 128, 240, 128, 240];
    const out = new Uint8ClampedArray(w * h * 4);

    const scaleY = 255 / Math.max(1, ref[1] - ref[0]);
    const scaleCb = 255 / Math.max(1, ref[3] - ref[2]);
    const scaleCr = 255 / Math.max(1, ref[5] - ref[4]);
    const clamp = (v) => v < 0 ? 0 : (v > 255 ? 255 : v);

    const cols = sub[0];
    const rows = sub[1];
    const clumpSamples = cols * rows + 2;      // the Y samples, then Cb and Cr
    const blocksPerRow = Math.ceil(w / cols);
    const rps = (ifd.t278 && ifd.t278[0]) ? Math.min(ifd.t278[0], h) : h;
    const stripCount = (ifd.t273 && ifd.t273.length) ? ifd.t273.length : 1;
    const rowBytes = Math.ceil(w * 8 * samples / 8);
    const stripSlot = rowBytes * rps;

    for (let strip = 0; strip < stripCount; strip++) {
        const top = strip * rps;
        const stripRows = Math.min(rps, h - top);
        if (stripRows <= 0) break;
        const blockRows = Math.ceil(stripRows / rows);
        const base = strip * stripSlot;

        for (let by = 0; by < blockRows; by++) {
            for (let bx = 0; bx < blocksPerRow; bx++) {
                const i = base + (by * blocksPerRow + bx) * clumpSamples;
                const cb = (data[i + cols * rows] - ref[2]) * scaleCb;
                const cr = (data[i + cols * rows + 1] - ref[4]) * scaleCr;
                for (let sy = 0; sy < rows; sy++) {
                    const y = top + by * rows + sy;
                    if (y >= h) break;
                    for (let sx = 0; sx < cols; sx++) {
                        const x = bx * cols + sx;
                        if (x >= w) break;
                        const luma = (data[i + sy * cols + sx] - ref[0]) * scaleY;
                        const p = (y * w + x) * 4;
                        out[p] = clamp(luma + 1.40200 * cr);
                        out[p + 1] = clamp(luma - 0.34414 * cb - 0.71414 * cr);
                        out[p + 2] = clamp(luma + 1.77200 * cb);
                        out[p + 3] = 255;
                    }
                }
            }
        }
    }
    return out;
}

async function rasterizeTiff(file) {
    const UTIF = await loadTiffDecoder();
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds || ifds.length === 0) throw new Error('no image was found in this TIFF file.');

    const pageCount = Math.min(ifds.length, MAX_DOCUMENT_PAGES);
    const pages = [];

    for (let index = 0; index < pageCount; index++) {
        if (pageCount > 1) els.status.textContent = `Decoding page ${index + 1} of ${pageCount}…`;

        const ifd = ifds[index];
        /* A file that decodes to an IFD without pixel dimensions is not a TIFF
           image at all — an HTML error page saved as .tif, a truncated
           download. Say that, rather than letting the decoder fail later with
           an arithmetic complaint about a zero width. The dimensions live in
           tags t256/t257 until decodeImage() copies them onto the IFD. */
        if (!ifd || !(ifd.t256 && ifd.t256[0] > 0) || !(ifd.t257 && ifd.t257[0] > 0)) {
            throw new Error('this file is not a readable TIFF image.');
        }
        const compression = (ifd.t259 && ifd.t259[0]) || 1;
        if (compression === TIFF_ADOBE_DEFLATE) {
            ifd.t259 = [8];
        } else if (TIFF_READABLE_COMPRESSION.indexOf(compression) === -1) {
            throw new Error(`this TIFF uses compression ${compression}, which is not supported. `
                + 'Re-save it as a standard TIFF or as a PDF.');
        }

        UTIF.decodeImage(buffer, ifd, ifds);

        const width = ifd.width;
        const height = ifd.height;
        const rgba = tiffToRgba(UTIF, ifd);
        /* UTIF hands back a Uint8Array, and ImageData insists on a
           Uint8ClampedArray; view the same bytes rather than copying them. */
        const pixels = (rgba instanceof Uint8ClampedArray)
            ? rgba
            : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);

        pages.push(canvas.toDataURL('image/png'));
    }

    return { pages: pages, totalPages: ifds.length };
}

// -> { pages: [dataURL, ...], totalPages } — totalPages exceeds pages.length
//    when the document has more pages than MAX_DOCUMENT_PAGES.
function rasterizeDocument(file) {
    return fileKind(file) === 'tiff' ? rasterizeTiff(file) : rasterizePdf(file);
}

/* Turns a rasterizer failure into something a visitor can act on. */
function describeFileError(ex) {
    if (ex && ex.name === 'PasswordException') {
        return 'this PDF is password-protected. Remove the password and try again.';
    }
    return (ex && ex.message) ? ex.message : String(ex);
}

/* One capture through the passport/ID template. Returns the text lines, their
   quads and the captured result — no DOM writes, so a multi-page document can
   look at several pages before deciding which one to show. */
async function captureMrz(source, template) {
    const result = await cvr.capture(source, template);
    const texts = [];
    const quads = [];
    for (const item of (result.items || [])) {
        if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE && item.text) {
            texts.push(item.text);
            const location = item.location;
            if (location && location.points) quads.push(location.points);
        }
    }
    return { result: result, texts: texts, quads: quads, template: template };
}

/* Reads the zone from one image, with a second attempt when the first finds
   nothing.

   ReadPassportAndId goes first because it is the only template that also
   locates the document border and the portrait — the two things beside the
   fields that this page shows. It is built around the passport/ID page layout,
   though, and on a document whose layout it does not match (an ID card or visa
   whose zones sit elsewhere) it returns no text at all while still reporting a
   detected document. So when it finds no MRZ, the zone-only template gets a
   turn: reading the MRZ is what the page is for, and a second pass that finds
   it beats a confident "no MRZ detected". The portrait then stays empty, which
   is the honest outcome for a capture the layout-aware pass could not map. */
async function readMrzSource(source) {
    const layoutRead = await captureMrz(source, "ReadPassportAndId");
    if (layoutRead.texts.length) return layoutRead;

    const zoneRead = await captureMrz(source, "ReadMRZ");
    if (!zoneRead.texts.length) return layoutRead;

    return {
        result: zoneRead.result,
        texts: zoneRead.texts,
        quads: zoneRead.quads,
        /* The portrait, if there is one, came from the layout-aware pass. */
        faceResult: layoutRead.result,
        template: zoneRead.template
    };
}

/* Everything the results panel shows for one capture: raw lines, the parsed
   fields and the portrait. */
async function renderMrzRead(read) {
    read.quads.forEach((points) => drawOverlay({ points: points }));

    if (read.texts.length === 0) {
        els.mrzRawText.textContent = "No MRZ detected.";
        els.mrzResults.textContent = "No MRZ detected.";
    } else {
        // Display raw MRZ text with newlines for readability
        els.mrzRawText.textContent = read.texts.join('\\n');

        // Parse MRZ - join all lines into single string (no separators)
        // TD3 passport has 2 lines of 44 chars each = 88 chars total
        const mrzForParsing = read.texts.map(t => t.trim()).join('');
        const parseResults = await parser.parse(mrzForParsing);
        displayParsedMrz(parseResults);
    }

    if (typeof faceProcessor !== 'undefined') {
        await faceProcessor.processCapturedResult(
            read.faceResult || read.result, els.displayImage, els.faceCropCanvas, els.overlayCanvas
        );
    }
}

async function processFile(file) {
    const kind = fileKind(file);
    if (kind === 'pdf' || kind === 'tiff') {
        await processDocument(file);
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        loadImage(base64, file);
    };
    reader.readAsDataURL(file);
}

/* A PDF or a TIFF: rasterize, then scan page by page for the MRZ. The page
   that carries one is the page worth showing — a passport scan saved as a PDF
   usually leads with a cover or a data page, and "no MRZ" on the first page
   would be a true but useless answer. */
async function processDocument(file) {
    resetDocumentPages();
    els.loadingSpinner.classList.add('visible');
    els.status.textContent = 'Reading ' + file.name + '…';
    clearResults();

    /* Set once the chosen page has been handed to the viewer: from that point
       the panel belongs to the display path, and a later failure here must not
       overwrite it. */
    let handedOff = false;

    try {
        const rendered = await rasterizeDocument(file);
        if (!rendered.pages.length) throw new Error('the document has no pages.');

        let chosen = 0;
        let read = null;
        for (let index = 0; index < rendered.pages.length; index++) {
            els.status.textContent = rendered.pages.length > 1
                ? `Looking for an MRZ — page ${index + 1} of ${rendered.pages.length}…`
                : 'Looking for an MRZ…';
            const attempt = await readMrzSource(rendered.pages[index]);
            if (attempt.texts.length) {
                chosen = index;
                read = attempt;
                break;
            }
        }

        documentPages = rendered.pages.map((src, index) => ({
            src: src,
            label: file.name + (rendered.pages.length > 1
                ? ' — page ' + (index + 1) + ' of ' + rendered.pages.length : '')
        }));
        documentPageIndex = chosen;
        handedOff = true;
        showDocumentPage(chosen, read);

        if (!read) {
            els.status.textContent = rendered.pages.length > 1
                ? `No MRZ on any of the ${rendered.pages.length} pages.`
                : 'No MRZ detected.';
        }
        analytics.action('document_open', {
            kind: fileKind(file), pages: rendered.pages.length, mrz_page: read ? chosen + 1 : 0
        });
    } catch (ex) {
        console.error(ex);
        analytics.fail('mrz', 'document');
        els.status.textContent = 'Could not read ' + file.name + ': ' + describeFileError(ex);
        /* Only blank the panel when nothing has been shown yet: a failure in the
           bookkeeping that follows a successful read must not erase a result
           that is already on screen. */
        if (!handedOff) {
            els.mrzRawText.textContent = 'Could not read the file.';
            els.mrzResults.textContent = describeFileError(ex);
        }
    } finally {
        els.loadingSpinner.classList.remove('visible');
    }
}

/* Shows one page of an opened document, reusing a capture that has already
   been made for it when there is one. */
function showDocumentPage(index, read) {
    const page = documentPages[index];
    if (!page) return;
    documentPageIndex = index;
    els.imageView.classList.remove('hidden');
    els.cameraView.classList.add('hidden');
    els.placeholderText.classList.add('hidden');
    clearResults();
    showPageNav();

    loadImage(page.src, null, {
        read: read || null,
        keepPageNav: true,
        onScanned: function (scanned) {
            els.status.textContent = page.label
                + (scanned && scanned.texts.length ? '' : ' — no MRZ detected.');
        }
    });
}

function showPageNav() {
    const nav = document.getElementById('pageNav');
    if (!nav) return;
    nav.hidden = documentPages.length < 2;
    const label = document.getElementById('pageLabel');
    if (label) label.textContent = (documentPageIndex + 1) + ' / ' + documentPages.length;
    const prev = document.getElementById('pagePrevBtn');
    const next = document.getElementById('pageNextBtn');
    if (prev) prev.disabled = documentPageIndex === 0;
    if (next) next.disabled = documentPageIndex === documentPages.length - 1;
}

function hidePageNav() {
    const nav = document.getElementById('pageNav');
    if (nav) nav.hidden = true;
}

/* Forgets the opened document as well as hiding its navigator — called when a
   new file is opened, so a stale "2 / 2" cannot survive into the next one. */
function resetDocumentPages() {
    documentPages = [];
    documentPageIndex = 0;
    hidePageNav();
}

function stepDocumentPage(delta) {
    const index = documentPageIndex + delta;
    if (index < 0 || index >= documentPages.length) return;
    lastInputSource = 'document';
    showDocumentPage(index, null);
}

/* `options.read` reuses a capture already made for this exact image (the
   multi-page path scans its pages before choosing one to show);
   `options.keepPageNav` stops the page navigator from being hidden, which the
   document path needs and every other caller wants;
   `options.onScanned` runs after the results panel is filled. */
function loadImage(base64Image, captureSource = null, options = {}) {
    if (!options.keepPageNav) hidePageNav();
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

        let scanned = null;
        try {
            // Run MRZ detection (only if license is initialized)
            if (isMRZReady && cvr) {
                analytics.start('mrz', lastInputSource);
                try {
                    const source = currentImageCaptureSource ?? els.displayImage;
                    /* Use ReadPassportAndId: one capture returns MRZ text,
                       document border (DetectedQuad), and the intermediate units
                       IdentityProcessor.findPortraitZone() needs. A multi-page
                       document has already run this call for the page it shows,
                       so that result is reused instead of reading twice. */
                    const read = options.read || await readMrzSource(source);
                    scanned = read;
                    await renderMrzRead(read);

                    if (read.texts.length > 0) {
                        analytics.success('mrz', lastInputSource, { mrz_lines: read.texts.length });
                    } else {
                        analytics.fail('mrz', lastInputSource);
                    }
                } catch (mrzEx) {
                    console.error("MRZ detection error:", mrzEx);
                    analytics.fail('mrz', lastInputSource);
                    els.mrzRawText.textContent = "MRZ detection error.";
                    els.mrzResults.textContent = "MRZ detection error.";
                    const faceCtx = els.faceCropCanvas.getContext('2d', { willReadFrequently: true });
                    faceCtx.clearRect(0, 0, els.faceCropCanvas.width, els.faceCropCanvas.height);
                }
            } else {
                els.mrzRawText.textContent = "MRZ not ready yet. Please wait for initialization to finish.";
                els.mrzResults.textContent = "MRZ is still initializing.";
            }
        } catch (ex) {
            console.error(ex);
            els.status.textContent = "Error: " + ex.message;
        } finally {
            // Hide spinner
            els.loadingSpinner.classList.remove('visible');
            els.status.textContent = "Ready";
        }
        if (typeof options.onScanned === 'function') options.onScanned(scanned);
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
    if (!isMRZReady) return;
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            lastInputSource = 'clipboard';
            /* Ctrl+V is a single-scan action, so it leaves the benchmark view
               rather than loading a document under a results table that no
               longer describes what is on screen. */
            if (window.MrzBenchmark && window.MrzBenchmark.isActive()) {
                window.MrzBenchmark.showSingle();
            }
            processFile(blob);
            break;
        }
    }
});
