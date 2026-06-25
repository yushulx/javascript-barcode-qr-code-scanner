// Configuration
const INPUT_SIZE = 384;
const OPENCV_SCRIPT_URL = 'https://docs.opencv.org/4.x/opencv.js';

// State
let worker = null;
let isWebcamActive = false;
let webcamStream = null;
let isProcessing = false;
let frameCount = 0;
let fpsInterval = null;
let latestResult = null;
let latestDetectionSource = null;
let images = []; // Array of {url, img} objects
let currentImageIndex = -1;
let currentImageElement = null; // Reference to the currently displayed image
let openCvReadyPromise = null;

// DOM Elements
const statusText = document.getElementById('status-text');
const statusDot = document.querySelector('.status-dot');
const webcamBtn = document.getElementById('webcam-btn');
const fileInput = document.getElementById('file-input');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const webcamVideo = document.getElementById('webcam-video');
const sourceImage = document.getElementById('source-image');
const backendSelect = document.getElementById('backend-select');
const analysisCanvas = document.createElement('canvas');
const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
const boundaryCanvas = document.createElement('canvas');
const boundaryCtx = boundaryCanvas.getContext('2d', { willReadFrequently: true });
const snapshotCanvas = document.createElement('canvas');
const snapshotCtx = snapshotCanvas.getContext('2d', { willReadFrequently: true });
const MIN_BOUNDARY_GRADIENT_MEAN = 1.5;
const MIN_BOUNDARY_GRADIENT_P90 = 4.1;
const MIN_BOUNDARY_INSIDE_OUTSIDE_CONTRAST = 0.25;
const MIN_MODEL_BOUNDARY_MARGIN = 0.5;

// Navigator Elements
const imageNavigator = document.querySelector('.image-navigator');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const imageCounter = document.getElementById('image-counter');

// Drag and Drop Elements
const dropZone = document.getElementById('drop-zone');
const dropOverlay = document.getElementById('drop-overlay');

// Metrics Elements
const preprocessEl = document.getElementById('preprocess-time');
const inferenceEl = document.getElementById('inference-time');
const postprocessEl = document.getElementById('postprocess-time');
const totalEl = document.getElementById('total-time');
const fpsEl = document.getElementById('fps-counter');

// Initialization
async function init(backend = 'wasm') {
    webcamBtn.disabled = true;
    updateStatus('Loading OpenCV...', 'loading');

    try {
        await ensureOpenCvReady();
    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, 'error');
        return;
    }

    updateStatus(`Initializing ${backend}...`, 'loading');

    if (worker) {
        worker.terminate();
    }

    worker = new Worker('worker.js');

    worker.onmessage = (e) => {
        const { type, data, backend: backendName, output, timings, error } = e.data;

        if (type === 'init_complete') {
            console.log('Inference Session created with provider:', backendName);
            document.getElementById('backend-type').textContent = backendName;
            updateStatus('Ready', 'ready');
            webcamBtn.disabled = false;
        } else if (type === 'detect_complete') {
            handleDetectionResult(output, timings);
        } else if (type === 'error') {
            console.error(error);
            updateStatus(`Error: ${error}`, 'error');
        }
    };

    worker.postMessage({ type: 'init', data: { backend } });
}

function ensureOpenCvReady() {
    if (globalThis.cv && typeof globalThis.cv.Mat === 'function') {
        return Promise.resolve();
    }

    if (openCvReadyPromise) {
        return openCvReadyPromise;
    }

    openCvReadyPromise = new Promise((resolve, reject) => {
        const existingModule = globalThis.Module || {};
        const previousInit = existingModule.onRuntimeInitialized;
        globalThis.Module = {
            ...existingModule,
            onRuntimeInitialized() {
                if (typeof previousInit === 'function') {
                    previousInit();
                }
                resolve();
            }
        };

        const existingScript = document.querySelector('script[data-opencv-loader="true"]');
        if (existingScript) {
            return;
        }

        const script = document.createElement('script');
        script.src = OPENCV_SCRIPT_URL;
        script.async = true;
        script.dataset.opencvLoader = 'true';
        script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
        document.head.appendChild(script);
    });

    return openCvReadyPromise;
}

// Handle Backend Change
backendSelect.addEventListener('change', (e) => {
    init(e.target.value);
});

// Start initialization immediately
init(backendSelect.value);

// Helper: Update Status
function updateStatus(text, type) {
    statusText.textContent = text;
    statusDot.className = `status-dot ${type}`;
}

function orderPoints(points) {
    if (!points || points.length !== 4) {
        return points;
    }

    const sums = points.map(point => point.x + point.y);
    const diffs = points.map(point => point.y - point.x);

    return [
        points[sums.indexOf(Math.min(...sums))],
        points[diffs.indexOf(Math.min(...diffs))],
        points[sums.indexOf(Math.max(...sums))],
        points[diffs.indexOf(Math.max(...diffs))]
    ];
}

function rotatedRectToPoints(rect) {
    const angle = rect.angle * Math.PI / 180;
    const halfWidth = rect.size.width / 2;
    const halfHeight = rect.size.height / 2;
    const widthVector = {
        x: Math.cos(angle) * halfWidth,
        y: Math.sin(angle) * halfWidth
    };
    const heightVector = {
        x: -Math.sin(angle) * halfHeight,
        y: Math.cos(angle) * halfHeight
    };

    return [
        {
            x: rect.center.x - widthVector.x - heightVector.x,
            y: rect.center.y - widthVector.y - heightVector.y
        },
        {
            x: rect.center.x + widthVector.x - heightVector.x,
            y: rect.center.y + widthVector.y - heightVector.y
        },
        {
            x: rect.center.x + widthVector.x + heightVector.x,
            y: rect.center.y + widthVector.y + heightVector.y
        },
        {
            x: rect.center.x - widthVector.x + heightVector.x,
            y: rect.center.y - widthVector.y + heightVector.y
        }
    ];
}

function extractBoundaryWithOpenCv(mask, originalWidth, originalHeight) {
    const maskData = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        maskData[i] = mask[i] > 0 ? 255 : 0;
    }

    const maskMat = cv.matFromArray(INPUT_SIZE, INPUT_SIZE, cv.CV_8UC1, maskData);
    const resizedMask = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const approx = new cv.Mat();

    try {
        cv.resize(
            maskMat,
            resizedMask,
            new cv.Size(originalWidth, originalHeight),
            0,
            0,
            cv.INTER_NEAREST
        );
        cv.findContours(resizedMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() === 0) {
            return null;
        }

        let largestContourIndex = 0;
        let largestArea = -1;
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            contour.delete();
            if (area > largestArea) {
                largestArea = area;
                largestContourIndex = i;
            }
        }

        const largestContour = contours.get(largestContourIndex);
        try {
            const epsilon = 0.02 * cv.arcLength(largestContour, true);
            cv.approxPolyDP(largestContour, approx, epsilon, true);

            let corners;
            if (approx.rows === 4) {
                const data = approx.data32S;
                corners = [];
                for (let i = 0; i < 4; i++) {
                    corners.push({
                        x: data[i * 2],
                        y: data[i * 2 + 1]
                    });
                }
            } else {
                corners = rotatedRectToPoints(cv.minAreaRect(largestContour));
            }

            return orderPoints(corners);
        } finally {
            largestContour.delete();
        }
    } finally {
        approx.delete();
        hierarchy.delete();
        contours.delete();
        resizedMask.delete();
        maskMat.delete();
    }
}

// === Pure JS Geometry Utils ===// Find convex hull using Monotone Chain algorithm
function convexHull(points) {
    points.sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    for (let p of points) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

// Find 4 corners from a set of points (simplified approximation)
function findCorners(points) {
    if (points.length < 4) return null;

    // Find center
    let cx = 0, cy = 0;
    for (let p of points) {
        cx += p.x;
        cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    // Find top-left, top-right, bottom-right, bottom-left
    // based on quadrants relative to center
    let tl = points[0], tr = points[0], br = points[0], bl = points[0];
    let maxDistTL = -1, maxDistTR = -1, maxDistBR = -1, maxDistBL = -1;

    for (let p of points) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = dx * dx + dy * dy;

        if (dx < 0 && dy < 0 && dist > maxDistTL) { tl = p; maxDistTL = dist; }
        if (dx > 0 && dy < 0 && dist > maxDistTR) { tr = p; maxDistTR = dist; }
        if (dx > 0 && dy > 0 && dist > maxDistBR) { br = p; maxDistBR = dist; }
        if (dx < 0 && dy > 0 && dist > maxDistBL) { bl = p; maxDistBL = dist; }
    }

    return [tl, tr, br, bl];
}

function getBoundaryEvidenceMetrics(imageSource, corners) {
    if (!imageSource || !corners || !analysisCtx || !boundaryCtx) {
        return {
            mean: Number.POSITIVE_INFINITY,
            p90: Number.POSITIVE_INFINITY,
            contrast: Number.POSITIVE_INFINITY
        };
    }

    const width = imageSource.width || imageSource.videoWidth || imageSource.naturalWidth || INPUT_SIZE;
    const height = imageSource.height || imageSource.videoHeight || imageSource.naturalHeight || INPUT_SIZE;
    if (!width || !height) {
        return {
            mean: Number.POSITIVE_INFINITY,
            p90: Number.POSITIVE_INFINITY,
            contrast: Number.POSITIVE_INFINITY
        };
    }

    const boundaryBandWidth = Math.max(5, Math.round(Math.min(width, height) * 0.015));
    let contrastBandWidth = Math.max(15, Math.round(Math.min(width, height) * 0.05));
    if (contrastBandWidth % 2 === 0) {
        contrastBandWidth += 1;
    }

    analysisCanvas.width = width;
    analysisCanvas.height = height;
    boundaryCanvas.width = width;
    boundaryCanvas.height = height;

    analysisCtx.clearRect(0, 0, width, height);
    analysisCtx.drawImage(imageSource, 0, 0, width, height);

    const imageData = analysisCtx.getImageData(0, 0, width, height).data;
    const grayscale = new Float32Array(width * height);
    const gradients = new Float32Array(width * height);

    for (let i = 0; i < grayscale.length; i++) {
        const offset = i * 4;
        grayscale[i] = (
            imageData[offset] * 0.299 +
            imageData[offset + 1] * 0.587 +
            imageData[offset + 2] * 0.114
        );
    }

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const topLeft = grayscale[i - width - 1];
            const top = grayscale[i - width];
            const topRight = grayscale[i - width + 1];
            const left = grayscale[i - 1];
            const right = grayscale[i + 1];
            const bottomLeft = grayscale[i + width - 1];
            const bottom = grayscale[i + width];
            const bottomRight = grayscale[i + width + 1];

            const gradX = (
                -topLeft + topRight -
                2 * left + 2 * right -
                bottomLeft + bottomRight
            );
            const gradY = (
                -topLeft - 2 * top - topRight +
                bottomLeft + 2 * bottom + bottomRight
            );

            gradients[i] = Math.hypot(gradX, gradY);
        }
    }

    boundaryCtx.clearRect(0, 0, width, height);
    boundaryCtx.lineWidth = boundaryBandWidth;
    boundaryCtx.strokeStyle = '#fff';
    boundaryCtx.lineJoin = 'round';
    boundaryCtx.lineCap = 'round';
    boundaryCtx.beginPath();
    boundaryCtx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
        boundaryCtx.lineTo(corners[i].x, corners[i].y);
    }
    boundaryCtx.closePath();
    boundaryCtx.stroke();

    const boundaryMask = boundaryCtx.getImageData(0, 0, width, height).data;
    let boundaryGradientSum = 0;
    const boundaryGradientValues = [];
    let boundaryPixelCount = 0;

    for (let i = 0; i < gradients.length; i++) {
        if (boundaryMask[i * 4 + 3] > 0) {
            boundaryGradientSum += gradients[i];
            boundaryGradientValues.push(gradients[i]);
            boundaryPixelCount++;
        }
    }

    if (boundaryPixelCount === 0) {
        return { mean: 0, p90: 0, contrast: 0 };
    }

    const sortedGradients = boundaryGradientValues.sort((a, b) => a - b);
    const p90Index = Math.min(
        sortedGradients.length - 1,
        Math.floor(sortedGradients.length * 0.9)
    );

    const fillMask = new Uint8Array(width * height);
    const outerMask = new Uint8Array(width * height);
    const expandedCorners = corners.map((point, index) => {
        const previous = corners[(index + corners.length - 1) % corners.length];
        const next = corners[(index + 1) % corners.length];
        const prevEdge = { x: point.x - previous.x, y: point.y - previous.y };
        const nextEdge = { x: next.x - point.x, y: next.y - point.y };
        const prevNormal = normalizeVector({ x: prevEdge.y, y: -prevEdge.x });
        const nextNormal = normalizeVector({ x: nextEdge.y, y: -nextEdge.x });
        const combinedNormal = normalizeVector({
            x: prevNormal.x + nextNormal.x,
            y: prevNormal.y + nextNormal.y
        });
        const offset = combinedNormal.x === 0 && combinedNormal.y === 0
            ? { x: 0, y: 0 }
            : { x: combinedNormal.x * contrastBandWidth, y: combinedNormal.y * contrastBandWidth };
        return { x: point.x + offset.x, y: point.y + offset.y };
    });

    fillPolygon(fillMask, width, height, corners);
    fillPolygon(outerMask, width, height, expandedCorners);

    let innerSum = 0;
    let innerCount = 0;
    let outerSum = 0;
    let outerCount = 0;
    for (let i = 0; i < grayscale.length; i++) {
        if (fillMask[i]) {
            innerSum += grayscale[i];
            innerCount++;
        } else if (outerMask[i]) {
            outerSum += grayscale[i];
            outerCount++;
        }
    }

    const contrast = innerCount > 0 && outerCount > 0
        ? Math.abs((innerSum / innerCount) - (outerSum / outerCount))
        : 0;

    return {
        mean: boundaryGradientSum / boundaryPixelCount,
        p90: sortedGradients[p90Index],
        contrast
    };
}

function hasBoundaryEvidence(imageSource, corners, modelBoundaryMargin = Number.POSITIVE_INFINITY) {
    if (modelBoundaryMargin < MIN_MODEL_BOUNDARY_MARGIN) {
        return false;
    }

    const metrics = getBoundaryEvidenceMetrics(imageSource, corners);
    return (
        metrics.mean >= MIN_BOUNDARY_GRADIENT_MEAN &&
        metrics.p90 >= MIN_BOUNDARY_GRADIENT_P90 &&
        metrics.contrast >= MIN_BOUNDARY_INSIDE_OUTSIDE_CONTRAST
    );
}

function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (!length) {
        return { x: 0, y: 0 };
    }

    return {
        x: vector.x / length,
        y: vector.y / length
    };
}

function fillPolygon(mask, width, height, points) {
    if (!points || points.length < 3) {
        return;
    }

    const intersections = [];
    for (let y = 0; y < height; y++) {
        intersections.length = 0;
        const scanY = y + 0.5;

        for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) {
                const t = (scanY - a.y) / (b.y - a.y);
                intersections.push(a.x + t * (b.x - a.x));
            }
        }

        intersections.sort((a, b) => a - b);
        for (let i = 0; i + 1 < intersections.length; i += 2) {
            const start = Math.max(0, Math.ceil(intersections[i]));
            const end = Math.min(width - 1, Math.floor(intersections[i + 1]));
            for (let x = start; x <= end; x++) {
                mask[y * width + x] = 1;
            }
        }
    }
}

function createDetectionSnapshot(imageSource) {
    const width = canvas.width || imageSource.videoWidth || imageSource.naturalWidth || imageSource.width;
    const height = canvas.height || imageSource.videoHeight || imageSource.naturalHeight || imageSource.height;

    snapshotCanvas.width = width;
    snapshotCanvas.height = height;
    snapshotCtx.clearRect(0, 0, width, height);
    snapshotCtx.drawImage(imageSource, 0, 0, width, height);

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    frameCanvas.getContext('2d').drawImage(snapshotCanvas, 0, 0);
    return frameCanvas;
}

function computeModelBoundaryMargin(outputData, mask) {
    const size = INPUT_SIZE * INPUT_SIZE;
    let boundaryMarginSum = 0;
    let boundaryCount = 0;

    for (let y = 0; y < INPUT_SIZE; y++) {
        for (let x = 0; x < INPUT_SIZE; x++) {
            const i = y * INPUT_SIZE + x;
            const value = mask[i];
            let isBoundary = false;

            for (let dy = -2; dy <= 2 && !isBoundary; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= INPUT_SIZE) {
                    continue;
                }

                for (let dx = -2; dx <= 2; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= INPUT_SIZE) {
                        continue;
                    }

                    if (mask[ny * INPUT_SIZE + nx] !== value) {
                        isBoundary = true;
                        break;
                    }
                }
            }

            if (!isBoundary) {
                continue;
            }

            const bgScore = outputData[i];
            const docScore = outputData[size + i];
            const maxScore = Math.max(bgScore, docScore);
            const bgExp = Math.exp(bgScore - maxScore);
            const docExp = Math.exp(docScore - maxScore);
            const denom = bgExp + docExp;
            const margin = Math.abs(docExp - bgExp) / denom;

            boundaryMarginSum += margin;
            boundaryCount++;
        }
    }

    return boundaryCount > 0 ? boundaryMarginSum / boundaryCount : 0;
}

// Helper: Postprocess
function postprocess(outputData, originalWidth, originalHeight, imageSource) {
    const startTime = performance.now();

    const data = outputData;
    const size = INPUT_SIZE * INPUT_SIZE;

    // Create mask array (0 or 1)
    const mask = new Uint8Array(size);
    let maskPixelCount = 0;

    for (let y = 0; y < INPUT_SIZE; y++) {
        for (let x = 0; x < INPUT_SIZE; x++) {
            const i = y * INPUT_SIZE + x;
            const bgScore = data[i];
            const docScore = data[size + i];

            if (docScore > bgScore) {
                mask[i] = 1;
                maskPixelCount++;
            } else {
                mask[i] = 0;
            }
        }
    }

    // No document pixels found
    if (maskPixelCount === 0) {
        return {
            mask,
            corners: null,
            time: performance.now() - startTime
        };
    }

    const modelBoundaryMargin = computeModelBoundaryMargin(outputData, mask);
    let corners = null;
    const extractedCorners = extractBoundaryWithOpenCv(mask, originalWidth, originalHeight);
    if (extractedCorners && hasBoundaryEvidence(imageSource, extractedCorners, modelBoundaryMargin)) {
        corners = extractedCorners;
    }

    return {
        mask,
        corners,
        time: performance.now() - startTime
    };
}

// Helper: Calculate polygon area using Shoelace formula
function polygonArea(points) {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
}

// Helper: Draw Overlay
function drawOverlay(mask, corners) {
    const showBoundary = document.getElementById('show-boundary').checked;

    if (showBoundary && corners) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw corners
        ctx.fillStyle = 'blue';
        corners.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
}

function handleDetectionResult(output, timings) {
    // 3. Postprocess
    const postResult = postprocess(output, canvas.width, canvas.height, latestDetectionSource);
    postprocessEl.textContent = `${postResult.time.toFixed(1)} ms`;

    // Update timings
    preprocessEl.textContent = `${timings.preprocess.toFixed(1)} ms`;
    inferenceEl.textContent = `${timings.inference.toFixed(1)} ms`;

    // Total Time
    const totalTime = timings.preprocess + timings.inference + postResult.time;
    totalEl.textContent = `${totalTime.toFixed(1)} ms`;

    // Update global state
    latestResult = postResult;

    // If not webcam, we need to explicitly draw because there is no loop
    if (!isWebcamActive) {
        // Use currentImageElement if available, fallback to sourceImage
        const imgToDraw = currentImageElement || sourceImage;
        ctx.drawImage(imgToDraw, 0, 0, canvas.width, canvas.height);
        drawOverlay(postResult.mask, postResult.corners);
    }

    isProcessing = false;
    frameCount++;
}

// Main Processing Loop
async function processFrame(imageSource) {
    if (isProcessing) return;
    isProcessing = true;
    latestDetectionSource = createDetectionSnapshot(imageSource);

    try {
        // Create ImageBitmap to send to worker (transferable and efficient)
        const bitmap = await createImageBitmap(latestDetectionSource);
        worker.postMessage({ type: 'detect', data: { image: bitmap } }, [bitmap]);
    } catch (e) {
        console.error(e);
        isProcessing = false;
    }
}

// Event Listeners
fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
        handleFiles(files);
    }
});

// Navigator button handlers
prevBtn.addEventListener('click', () => {
    if (currentImageIndex > 0) {
        displayImage(currentImageIndex - 1);
    }
});

nextBtn.addEventListener('click', () => {
    if (currentImageIndex < images.length - 1) {
        displayImage(currentImageIndex + 1);
    }
});

// Handle files from upload or drag-and-drop
function handleFiles(files) {
    // Stop webcam if active
    if (isWebcamActive) stopWebcam();

    // Clean up old image URLs
    images.forEach(img => {
        if (img.url) URL.revokeObjectURL(img.url);
    });
    images = [];

    // Load all images
    let loadedCount = 0;
    files.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            loadedCount++;
            if (loadedCount === files.length) {
                // All images loaded, display first one
                updateNavigator();
                displayImage(0);
            }
        };
        img.onerror = () => {
            loadedCount++;
            console.error(`Failed to load image ${index}`);
            if (loadedCount === files.length) {
                updateNavigator();
                if (images.length > 0) {
                    displayImage(0);
                }
            }
        };
        img.src = url;
        images.push({ url, img, file });
    });
}

// Display image at given index and trigger detection
function displayImage(index) {
    if (index < 0 || index >= images.length) return;

    currentImageIndex = index;
    const { img } = images[index];

    // Helper to render and detect
    const renderAndDetect = () => {
        const aspect = img.naturalWidth / img.naturalHeight;
        const maxWidth = 800;
        canvas.width = Math.min(img.naturalWidth, maxWidth);
        canvas.height = canvas.width / aspect;

        // Draw the image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Store reference for detection result handler
        currentImageElement = img;

        // Update source image for detection (fallback)
        sourceImage.src = img.src;

        // Reset latest result and trigger detection
        latestResult = null;
        processFrame(img);

        updateNavigator();
    };

    // Image should already be loaded from handleFiles, but check anyway
    if (img.complete && img.naturalWidth > 0) {
        renderAndDetect();
    } else {
        img.onload = renderAndDetect;
    }
}

// Update navigator UI
function updateNavigator() {
    if (images.length === 0) {
        imageNavigator.style.display = 'none';
        return;
    }

    imageNavigator.style.display = 'flex';
    imageCounter.textContent = `${currentImageIndex + 1} / ${images.length}`;

    prevBtn.disabled = currentImageIndex <= 0;
    nextBtn.disabled = currentImageIndex >= images.length - 1;
}

// Drag and Drop Event Handlers
let dragCounter = 0;

dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    dropOverlay.classList.add('active');
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
        dropOverlay.classList.remove('active');
    }
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropOverlay.classList.remove('active');

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
        handleFiles(files);
    }
});

webcamBtn.addEventListener('click', () => {
    if (isWebcamActive) {
        stopWebcam();
    } else {
        startWebcam();
    }
});

async function startWebcam() {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        webcamVideo.srcObject = webcamStream;
        webcamVideo.play();

        webcamVideo.onloadedmetadata = () => {
            canvas.width = webcamVideo.videoWidth;
            canvas.height = webcamVideo.videoHeight;
            isWebcamActive = true;
            latestResult = null; // Reset result
            webcamBtn.textContent = 'Stop Webcam';
            webcamBtn.classList.replace('primary', 'secondary');

            // Start loop
            requestAnimationFrame(webcamLoop);

            // Start FPS counter
            frameCount = 0;
            fpsInterval = setInterval(() => {
                fpsEl.textContent = frameCount;
                frameCount = 0;
            }, 1000);
        };
    } catch (e) {
        console.error(e);
        alert('Failed to access webcam');
    }
}

function stopWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    isWebcamActive = false;
    webcamBtn.textContent = 'Start Webcam';
    webcamBtn.classList.replace('secondary', 'primary');
    if (fpsInterval) clearInterval(fpsInterval);
}

function webcamLoop() {
    if (!isWebcamActive) return;

    // 1. Render immediately
    const width = canvas.width;
    const height = canvas.height;
    ctx.drawImage(webcamVideo, 0, 0, width, height);

    // 2. Draw overlay if available
    if (latestResult) {
        drawOverlay(latestResult.mask, latestResult.corners);
    }

    // 3. Try to process frame (will skip if busy)
    processFrame(webcamVideo);

    // 4. Loop
    requestAnimationFrame(webcamLoop);
}
