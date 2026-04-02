const DEFAULT_LICENSE_KEY = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";
const TEMPLATE_PATH = "./DBR_and_DDN_detect_PresetTemplates.json";
const DETECT_TEMPLATE = "DetectDocumentBoundaries_Default";
const NORMALIZE_TEMPLATE = "NormalizeDocument_Default";

const licenseScreen = document.getElementById("license-screen");
const licenseInput = document.getElementById("license-input");
const activateBtn = document.getElementById("activate-btn");
const initOverlay = document.getElementById("init-overlay");
const initStatus = document.getElementById("init-status");
const scannerScreen = document.getElementById("scanner-screen");
const resultScreen = document.getElementById("result-screen");

const videoElement = document.getElementById("camera-video");
const overlayCanvas = document.getElementById("camera-overlay");
const overlayCtx = overlayCanvas.getContext("2d");

const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const autoToggle = document.getElementById("auto-toggle");
const iouInput = document.getElementById("iou-threshold");
const areaInput = document.getElementById("area-threshold");
const stableInput = document.getElementById("stable-frame-count");
const iouValue = document.getElementById("iou-threshold-value");
const areaValue = document.getElementById("area-threshold-value");
const stableValue = document.getElementById("stable-frame-count-value");

const autoIndicator = document.getElementById("auto-indicator");
const thumbnailBar = document.getElementById("thumbnail-bar");
const captureBtn = document.getElementById("capture-btn");
const galleryBtn = document.getElementById("gallery-btn");
const galleryInput = document.getElementById("gallery-input");
const nextBtn = document.getElementById("next-btn");

const continueBtn = document.getElementById("continue-btn");
const retakeBtn = document.getElementById("retake-btn");
const editBtn = document.getElementById("edit-btn");
const rotateBtn = document.getElementById("rotate-btn");
const sortBtn = document.getElementById("sort-btn");
const saveBtn = document.getElementById("save-btn");
const saveMenu = document.getElementById("save-menu");
const savePdfBtn = document.getElementById("save-pdf-btn");
const saveImagesBtn = document.getElementById("save-images-btn");

const pageIndicator = document.getElementById("page-indicator");
const resultCanvas = document.getElementById("result-canvas");
const resultCtx = resultCanvas.getContext("2d");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");

const filterColorBtn = document.getElementById("filter-color");
const filterGrayBtn = document.getElementById("filter-grayscale");
const filterBinaryBtn = document.getElementById("filter-binary");
const toast = document.getElementById("toast");

const sortOverlay = document.getElementById("sort-overlay");
const sortList = document.getElementById("sort-list");
const sortDoneBtn = document.getElementById("sort-done-btn");
const editScreen = document.getElementById("edit-screen");
const editCanvasEl = document.getElementById("edit-canvas");
const editCtx2 = editCanvasEl.getContext("2d");
const editCancelBtn = document.getElementById("edit-cancel-btn");
const editApplyBtn = document.getElementById("edit-apply-btn");

let cvr = null;
let mediaStream = null;
let isScanning = false;
let isCaptureInProgress = false;
let scanLoopId = null;
let isProcessingFrame = false;
let captureTimeoutId = null;
let coolDown = false;
let manualCapturePending = false;

let pages = [];
let currentPageIndex = 0;
let retakeIndex = -1;

let latestDetectedQuad = null;
let lastQuad = null;
let stableCounter = 0;
let editState = null;

const quadStabilizer = {
    enabled: true,
    iouThreshold: 0.85,
    areaDeltaThreshold: 0.15,
    stableFrameCount: 3,
};

function updateInitStatus(message) {
    initStatus.textContent = message;
}

function showToast(message, duration = 2000) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), duration);
}

function setFilterButtons(mode) {
    filterColorBtn.classList.toggle("active", mode === "color");
    filterGrayBtn.classList.toggle("active", mode === "grayscale");
    filterBinaryBtn.classList.toggle("active", mode === "binary");
}

function updateNextButtonState() {
    const hasPages = pages.length > 0;
    nextBtn.classList.toggle("disabled", !hasPages);
}

function resizeOverlay() {
    const rect = videoElement.getBoundingClientRect();
    overlayCanvas.width = rect.width;
    overlayCanvas.height = rect.height;
}

function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function showAutoCaptureIndicator() {
    autoIndicator.classList.remove("hidden");
    setTimeout(() => autoIndicator.classList.add("hidden"), 1500);
}

function pointsToBoundingBox(points) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function computeIoU(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    const interW = Math.max(0, x2 - x1);
    const interH = Math.max(0, y2 - y1);
    const inter = interW * interH;
    const union = a.w * a.h + b.w * b.h - inter;
    if (union <= 0) return 0;
    return inter / union;
}

function polygonArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const next = (i + 1) % points.length;
        sum += points[i].x * points[next].y - points[next].x * points[i].y;
    }
    return Math.abs(sum) * 0.5;
}

function isQuadStable(current, previous) {
    if (!current || !previous || current.length !== 4 || previous.length !== 4) return false;
    const boxA = pointsToBoundingBox(current);
    const boxB = pointsToBoundingBox(previous);
    const iou = computeIoU(boxA, boxB);

    const areaA = polygonArea(current);
    const areaB = polygonArea(previous);
    const areaDelta = areaB === 0 ? 1 : Math.abs(areaA - areaB) / areaB;

    return iou >= quadStabilizer.iouThreshold && areaDelta <= quadStabilizer.areaDeltaThreshold;
}

function resetStabilizer() {
    stableCounter = 0;
    lastQuad = null;
    latestDetectedQuad = null;
}

function drawOverlay(points) {
    if (!points || points.length !== 4) return;
    resizeOverlay();
    clearOverlay();

    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    const displayWidth = overlayCanvas.width;
    const displayHeight = overlayCanvas.height;
    const videoAspect = videoWidth / videoHeight;
    const displayAspect = displayWidth / displayHeight;

    let scale;
    let offsetX = 0;
    let offsetY = 0;

    if (displayAspect > videoAspect) {
        scale = displayWidth / videoWidth;
        offsetY = (displayHeight - videoHeight * scale) / 2;
    } else {
        scale = displayHeight / videoHeight;
        offsetX = (displayWidth - videoWidth * scale) / 2;
    }

    const transformed = points.map((p) => ({
        x: p.x * scale + offsetX,
        y: p.y * scale + offsetY,
    }));

    overlayCtx.beginPath();
    overlayCtx.moveTo(transformed[0].x, transformed[0].y);
    for (let i = 1; i < transformed.length; i++) {
        overlayCtx.lineTo(transformed[i].x, transformed[i].y);
    }
    overlayCtx.closePath();
    overlayCtx.fillStyle = "rgba(106, 196, 187, 0.2)";
    overlayCtx.fill();
    overlayCtx.strokeStyle = "#6ac4bb";
    overlayCtx.lineWidth = 3;
    overlayCtx.stroke();
}

function ensurePageImage(page) {
    if (!page.renderedCanvas) {
        page.renderedCanvas = document.createElement("canvas");
        page.renderedCanvas.width = page.baseCanvas.width;
        page.renderedCanvas.height = page.baseCanvas.height;
        const ctx = page.renderedCanvas.getContext("2d");
        ctx.drawImage(page.baseCanvas, 0, 0);
    }
}

function buildFilteredCanvas(page) {
    ensurePageImage(page);
    const src = page.baseCanvas;
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);

    if (page.filter === "color") {
        return out;
    }

    const image = ctx.getImageData(0, 0, out.width, out.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        if (page.filter === "grayscale") {
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        } else {
            const binary = gray > 140 ? 255 : 0;
            data[i] = binary;
            data[i + 1] = binary;
            data[i + 2] = binary;
        }
    }
    ctx.putImageData(image, 0, 0);
    return out;
}

function rotateCanvas90(canvas) {
    const out = document.createElement("canvas");
    out.width = canvas.height;
    out.height = canvas.width;
    const ctx = out.getContext("2d");
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
}

function updateThumbnailBar() {
    thumbnailBar.innerHTML = "";
    if (retakeIndex >= 0 || pages.length === 0) {
        thumbnailBar.classList.add("hidden");
        return;
    }

    thumbnailBar.classList.remove("hidden");
    pages.forEach((page, index) => {
        const wrapper = document.createElement("button");
        wrapper.className = "thumbnail-item";
        wrapper.setAttribute("aria-label", `Open page ${index + 1}`);
        wrapper.addEventListener("click", () => {
            currentPageIndex = index;
            showResultPage();
        });

        const thumb = buildFilteredCanvas(page);
        const img = document.createElement("img");
        img.src = thumb.toDataURL("image/png");
        img.alt = `Page ${index + 1}`;

        const remove = document.createElement("button");
        remove.className = "thumbnail-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "Remove page");
        remove.addEventListener("click", (event) => {
            event.stopPropagation();
            pages.splice(index, 1);
            if (currentPageIndex >= pages.length) currentPageIndex = Math.max(0, pages.length - 1);
            updateThumbnailBar();
            updateNextButtonState();
        });

        wrapper.appendChild(img);
        wrapper.appendChild(remove);
        thumbnailBar.appendChild(wrapper);
    });
}

function copyCanvas(c) {
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    out.getContext("2d").drawImage(c, 0, 0);
    return out;
}

function addPage(baseCanvas, opts = {}) {
    const page = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        baseCanvas: copyCanvas(baseCanvas),
        filter: "color",
        hasOriginal: !!opts.originalCanvas,
        originalCanvas: opts.originalCanvas ? copyCanvas(opts.originalCanvas) : null,
        quadPoints: opts.quadPoints ? opts.quadPoints.map(p => ({ x: p.x, y: p.y })) : null,
    };

    if (retakeIndex >= 0) {
        pages[retakeIndex] = page;
        retakeIndex = -1;
        showResultScreen();
        renderResult();
    } else {
        pages.push(page);
        updateThumbnailBar();
        updateNextButtonState();
    }
}

function openSettings() {
    settingsOverlay.classList.remove("hidden");
}

function closeSettings() {
    settingsOverlay.classList.add("hidden");
}

function bindSettingRanges() {
    const sync = () => {
        quadStabilizer.iouThreshold = Number(iouInput.value);
        quadStabilizer.areaDeltaThreshold = Number(areaInput.value);
        quadStabilizer.stableFrameCount = Number(stableInput.value);
        quadStabilizer.enabled = autoToggle.checked;
        iouValue.textContent = quadStabilizer.iouThreshold.toFixed(2);
        areaValue.textContent = quadStabilizer.areaDeltaThreshold.toFixed(2);
        stableValue.textContent = String(quadStabilizer.stableFrameCount);
    };
    iouInput.addEventListener("input", sync);
    areaInput.addEventListener("input", sync);
    stableInput.addEventListener("input", sync);
    autoToggle.addEventListener("change", sync);
    sync();
}

function pointerTap(element, handler) {
    element.addEventListener("pointerup", (event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.preventDefault();
        handler();
    });
}

function showScannerScreen() {
    resultScreen.classList.add("hidden");
    scannerScreen.classList.remove("hidden");
    nextBtn.classList.toggle("hidden", retakeIndex >= 0);
    galleryBtn.classList.toggle("hidden", retakeIndex >= 0);
}

function showResultScreen() {
    scannerScreen.classList.add("hidden");
    resultScreen.classList.remove("hidden");
}

function hideSaveMenu() {
    saveMenu.classList.add("hidden");
}

function toggleSaveMenu() {
    const hidden = saveMenu.classList.contains("hidden");
    if (!hidden) {
        hideSaveMenu();
        return;
    }
    saveMenu.classList.remove("hidden");
    const rect = saveBtn.getBoundingClientRect();
    saveMenu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    saveMenu.style.top = `${rect.bottom + 6}px`;
}

async function initCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: { ideal: "environment" },
        },
        audio: false,
    });

    mediaStream = stream;
    videoElement.srcObject = stream;

    await new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            resolve();
        };
    });

    resizeOverlay();
    window.addEventListener("resize", resizeOverlay);
}

async function initSDK(licenseKey) {
    updateInitStatus("Activating license...");
    await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);

    updateInitStatus("Loading modules...");
    await Dynamsoft.Core.CoreModule.loadWasm(["DDN"]);

    updateInitStatus("Initializing scanner...");
    cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
    await cvr.initSettings(TEMPLATE_PATH);

    updateInitStatus("Opening camera...");
    await initCamera();
}

async function captureCurrentFrameCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoElement, 0, 0);
    return canvas;
}

async function normalizeDocument(frameCanvas, points) {
    try {
        const settings = await cvr.getSimplifiedSettings(NORMALIZE_TEMPLATE);
        settings.roi.points = points;
        settings.roiMeasuredInPercentage = 0;
        await cvr.updateSettings(NORMALIZE_TEMPLATE, settings);

        const normalizedResult = await cvr.capture(frameCanvas, NORMALIZE_TEMPLATE);
        for (const item of normalizedResult.items || []) {
            if (item.toCanvas && typeof item.toCanvas === "function") {
                return item.toCanvas();
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

async function performCapture({ autoCaptured = false, quadPoints = null } = {}) {
    if (isCaptureInProgress || coolDown) return;
    isCaptureInProgress = true;
    captureBtn.classList.add("capturing");

    try {
        const frameCanvas = await captureCurrentFrameCanvas();
        let resultCanvas = null;

        if (quadPoints && quadPoints.length === 4) {
            resultCanvas = await normalizeDocument(frameCanvas, quadPoints);
        }

        if (!resultCanvas) {
            resultCanvas = frameCanvas;
            if (!autoCaptured) {
                showToast("No document detected. Using original image.");
            }
        }

        addPage(resultCanvas, { originalCanvas: frameCanvas, quadPoints: quadPoints });
        if (autoCaptured) showAutoCaptureIndicator();
    } catch (error) {
        console.error(error);
        showToast("Capture failed.");
    } finally {
        captureBtn.classList.remove("capturing");
        isCaptureInProgress = false;
        coolDown = true;
        setTimeout(() => {
            coolDown = false;
        }, 1500);
    }
}

async function processGalleryFile(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = bitmap.width;
    baseCanvas.height = bitmap.height;
    baseCanvas.getContext("2d").drawImage(bitmap, 0, 0);

    try {
        const detectResult = await cvr.capture(baseCanvas, DETECT_TEMPLATE);
        let quad = null;
        for (const item of detectResult.items || []) {
            if (item.location && item.location.points && item.location.points.length === 4) {
                quad = item.location.points;
                break;
            }
        }

        if (quad) {
            const normalized = await normalizeDocument(baseCanvas, quad);
            if (normalized) {
                addPage(normalized, { originalCanvas: baseCanvas, quadPoints: quad });
                updateThumbnailBar();
                updateNextButtonState();
                return;
            }
        }

        showToast("No document detected. Using original image.");
        addPage(baseCanvas, {});
        updateThumbnailBar();
        updateNextButtonState();
    } catch (error) {
        console.error(error);
        showToast("Failed to process gallery image.");
    }
}

async function scanLoop() {
    if (!isScanning) return;

    if (isProcessingFrame || isCaptureInProgress) {
        scanLoopId = requestAnimationFrame(scanLoop);
        return;
    }

    isProcessingFrame = true;
    try {
        const result = await cvr.capture(videoElement, DETECT_TEMPLATE);
        let quad = null;

        for (const item of result.items || []) {
            if (item.location && item.location.points && item.location.points.length === 4) {
                quad = item.location.points;
                break;
            }
        }

        if (quad) {
            latestDetectedQuad = quad;
            drawOverlay(quad);

            if (manualCapturePending) {
                manualCapturePending = false;
                if (captureTimeoutId) {
                    clearTimeout(captureTimeoutId);
                    captureTimeoutId = null;
                }
                resetStabilizer();
                await performCapture({ autoCaptured: false, quadPoints: quad });
                isProcessingFrame = false;
                if (isScanning) {
                    scanLoopId = requestAnimationFrame(scanLoop);
                }
                return;
            }

            if (!lastQuad) {
                lastQuad = quad;
                stableCounter = 1;
            } else if (isQuadStable(quad, lastQuad)) {
                stableCounter += 1;
                lastQuad = quad;
            } else {
                stableCounter = 0;
                lastQuad = quad;
            }

            if (quadStabilizer.enabled && stableCounter >= quadStabilizer.stableFrameCount) {
                resetStabilizer();
                await performCapture({ autoCaptured: true, quadPoints: quad });
            }
        } else {
            clearOverlay();
            resetStabilizer();
        }
    } catch (_) {
        clearOverlay();
    }

    isProcessingFrame = false;
    if (isScanning) {
        scanLoopId = requestAnimationFrame(scanLoop);
    }
}

function startScanning() {
    if (isScanning) return;
    isScanning = true;
    scanLoop();
}

function stopScanning() {
    isScanning = false;
    manualCapturePending = false;
    if (captureTimeoutId) {
        clearTimeout(captureTimeoutId);
        captureTimeoutId = null;
    }
    if (scanLoopId) {
        cancelAnimationFrame(scanLoopId);
        scanLoopId = null;
    }
    clearOverlay();
}

function renderResult() {
    if (pages.length === 0) {
        showScannerScreen();
        return;
    }

    currentPageIndex = Math.max(0, Math.min(currentPageIndex, pages.length - 1));
    const page = pages[currentPageIndex];
    const filtered = buildFilteredCanvas(page);

    const rect = resultCanvas.getBoundingClientRect();
    const cw = Math.round(rect.width);
    const ch = Math.round(rect.height);
    if (cw > 0 && ch > 0) {
        resultCanvas.width = cw;
        resultCanvas.height = ch;
    }

    const scale = Math.min(resultCanvas.width / filtered.width, resultCanvas.height / filtered.height);
    const dw = Math.round(filtered.width * scale);
    const dh = Math.round(filtered.height * scale);
    const dx = Math.round((resultCanvas.width - dw) / 2);
    const dy = Math.round((resultCanvas.height - dh) / 2);

    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCtx.drawImage(filtered, dx, dy, dw, dh);

    pageIndicator.textContent = `${currentPageIndex + 1} / ${pages.length}`;
    prevPageBtn.classList.toggle("disabled", currentPageIndex <= 0);
    nextPageBtn.classList.toggle("disabled", currentPageIndex >= pages.length - 1);
    editBtn.classList.toggle("disabled", !page.originalCanvas || !page.quadPoints);
    setFilterButtons(page.filter);
}

function showResultPage() {
    showResultScreen();
    stopScanning();
    renderResult();
}

function applyFilter(mode) {
    if (pages.length === 0) return;
    pages[currentPageIndex].filter = mode;
    renderResult();
}

function openSort() {
    if (pages.length < 2) {
        showToast("Need at least 2 pages to reorder.");
        return;
    }
    const workingOrder = pages.map((_, i) => i);
    let dragIdx = -1;

    function rebuild() {
        sortList.innerHTML = "";
        workingOrder.forEach((pageIdx, pos) => {
            const item = document.createElement("div");
            item.className = "sort-item";
            item.draggable = true;
            item.dataset.pos = pos;

            item.addEventListener("dragstart", (e) => {
                dragIdx = pos;
                item.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
            });
            item.addEventListener("dragend", () => {
                item.classList.remove("dragging");
                dragIdx = -1;
                sortList.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
            });
            item.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                sortList.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
                item.classList.add("drag-over");
            });
            item.addEventListener("dragleave", () => {
                item.classList.remove("drag-over");
            });
            item.addEventListener("drop", (e) => {
                e.preventDefault();
                item.classList.remove("drag-over");
                const dropPos = Number(item.dataset.pos);
                if (dragIdx >= 0 && dragIdx !== dropPos) {
                    const [moved] = workingOrder.splice(dragIdx, 1);
                    workingOrder.splice(dropPos, 0, moved);
                    rebuild();
                }
            });

            // Touch drag support
            let touchClone = null;
            let touchStartPos = pos;
            item.addEventListener("touchstart", (e) => {
                touchStartPos = pos;
                dragIdx = pos;
                const touch = e.touches[0];
                touchClone = item.cloneNode(true);
                touchClone.style.position = "fixed";
                touchClone.style.left = touch.clientX - 30 + "px";
                touchClone.style.top = touch.clientY - 24 + "px";
                touchClone.style.width = item.offsetWidth + "px";
                touchClone.style.opacity = "0.8";
                touchClone.style.zIndex = "200";
                touchClone.style.pointerEvents = "none";
                document.body.appendChild(touchClone);
                item.classList.add("dragging");
            }, { passive: true });
            item.addEventListener("touchmove", (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                if (touchClone) {
                    touchClone.style.left = touch.clientX - 30 + "px";
                    touchClone.style.top = touch.clientY - 24 + "px";
                }
                const overEl = document.elementFromPoint(touch.clientX, touch.clientY);
                sortList.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
                if (overEl) {
                    const overItem = overEl.closest(".sort-item");
                    if (overItem && overItem.dataset.pos !== undefined) {
                        overItem.classList.add("drag-over");
                    }
                }
            });
            item.addEventListener("touchend", (e) => {
                item.classList.remove("dragging");
                if (touchClone) { touchClone.remove(); touchClone = null; }
                const touch = e.changedTouches[0];
                const overEl = document.elementFromPoint(touch.clientX, touch.clientY);
                sortList.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
                if (overEl) {
                    const overItem = overEl.closest(".sort-item");
                    if (overItem && overItem.dataset.pos !== undefined) {
                        const dropPos = Number(overItem.dataset.pos);
                        if (dragIdx >= 0 && dragIdx !== dropPos) {
                            const [moved] = workingOrder.splice(dragIdx, 1);
                            workingOrder.splice(dropPos, 0, moved);
                            rebuild();
                        }
                    }
                }
                dragIdx = -1;
            });

            const thumb = buildFilteredCanvas(pages[pageIdx]);
            const img = document.createElement("img");
            img.src = thumb.toDataURL("image/png");
            img.draggable = false;

            const label = document.createElement("span");
            label.className = "sort-label";
            label.textContent = "Page " + (pageIdx + 1);

            const handle = document.createElement("span");
            handle.className = "sort-handle";
            handle.textContent = "\u2630";

            item.appendChild(img);
            item.appendChild(label);
            item.appendChild(handle);
            sortList.appendChild(item);
        });
    }

    rebuild();
    sortOverlay.classList.remove("hidden");

    sortDoneBtn.onclick = () => {
        pages = workingOrder.map(i => pages[i]);
        currentPageIndex = 0;
        sortOverlay.classList.add("hidden");
        renderResult();
        updateThumbnailBar();
    };
}

function openEdit() {
    const page = pages[currentPageIndex];
    if (!page.originalCanvas || !page.quadPoints) {
        showToast("No quad data available for editing.");
        return;
    }
    editState = {
        originalCanvas: page.originalCanvas,
        quadPoints: page.quadPoints.map(p => ({ x: p.x, y: p.y })),
        draggingCorner: -1,
        imgRect: null,
    };
    resultScreen.classList.add("hidden");
    editScreen.classList.remove("hidden");
    requestAnimationFrame(renderEditCanvas);
}

function renderEditCanvas() {
    if (!editState) return;
    const rect = editCanvasEl.getBoundingClientRect();
    const cw = Math.round(rect.width);
    const ch = Math.round(rect.height);
    if (cw === 0 || ch === 0) return;
    editCanvasEl.width = cw;
    editCanvasEl.height = ch;

    const img = editState.originalCanvas;
    const scale = Math.min(cw / img.width, ch / img.height);
    const imgW = Math.round(img.width * scale);
    const imgH = Math.round(img.height * scale);
    const imgX = Math.round((cw - imgW) / 2);
    const imgY = Math.round((ch - imgH) / 2);
    editState.imgRect = { x: imgX, y: imgY, w: imgW, h: imgH };

    editCtx2.clearRect(0, 0, cw, ch);
    editCtx2.drawImage(img, imgX, imgY, imgW, imgH);

    const pts = editState.quadPoints.map(p => ({
        x: imgX + (p.x / img.width) * imgW,
        y: imgY + (p.y / img.height) * imgH,
    }));

    editCtx2.beginPath();
    editCtx2.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) editCtx2.lineTo(pts[i].x, pts[i].y);
    editCtx2.closePath();
    editCtx2.fillStyle = "rgba(106,196,187,0.2)";
    editCtx2.fill();
    editCtx2.strokeStyle = "#6ac4bb";
    editCtx2.lineWidth = 2;
    editCtx2.stroke();

    const HANDLE_R = 14;
    pts.forEach((p, i) => {
        editCtx2.beginPath();
        editCtx2.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
        editCtx2.fillStyle = i === editState.draggingCorner ? "#fe8e14" : "#6ac4bb";
        editCtx2.fill();
        editCtx2.strokeStyle = "#fff";
        editCtx2.lineWidth = 2;
        editCtx2.stroke();
    });
}

function editFindCorner(cx, cy) {
    if (!editState || !editState.imgRect) return -1;
    const ir = editState.imgRect;
    const img = editState.originalCanvas;
    for (let i = 0; i < editState.quadPoints.length; i++) {
        const p = editState.quadPoints[i];
        const px = ir.x + (p.x / img.width) * ir.w;
        const py = ir.y + (p.y / img.height) * ir.h;
        if (Math.hypot(px - cx, py - cy) < 30) return i;
    }
    return -1;
}

function cancelEdit() {
    editState = null;
    editScreen.classList.add("hidden");
    resultScreen.classList.remove("hidden");
}

async function applyEdit() {
    if (!editState) return;
    editApplyBtn.disabled = true;
    try {
        const normalized = await normalizeDocument(editState.originalCanvas, editState.quadPoints);
        if (!normalized) {
            showToast("Normalization failed. Adjust corners and try again.");
            return;
        }
        pages[currentPageIndex].baseCanvas = copyCanvas(normalized);
        pages[currentPageIndex].quadPoints = editState.quadPoints.map(p => ({ x: p.x, y: p.y }));
        editState = null;
        editScreen.classList.add("hidden");
        resultScreen.classList.remove("hidden");
        renderResult();
        updateThumbnailBar();
    } catch (e) {
        console.error(e);
        showToast("Edit failed: " + (e?.message || "Unknown error"));
    } finally {
        editApplyBtn.disabled = false;
    }
}

function downloadDataUrl(dataUrl, fileName) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function exportImages() {
    if (!pages.length) return;
    const stamp = Date.now();
    pages.forEach((page, i) => {
        const canvas = buildFilteredCanvas(page);
        downloadDataUrl(canvas.toDataURL("image/png"), `document_${stamp}_${i + 1}.png`);
    });
    showToast("Images exported.");
}

async function exportPdf() {
    if (!pages.length || !window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    for (let i = 0; i < pages.length; i++) {
        const canvas = buildFilteredCanvas(pages[i]);
        const imageData = canvas.toDataURL("image/jpeg", 0.95);
        if (i > 0) pdf.addPage("a4", "portrait");

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const drawWidth = canvas.width * ratio;
        const drawHeight = canvas.height * ratio;
        const x = (pageWidth - drawWidth) / 2;
        const y = (pageHeight - drawHeight) / 2;

        pdf.addImage(imageData, "JPEG", x, y, drawWidth, drawHeight);
    }

    const blob = pdf.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    showToast("PDF exported.");
}

function wireEvents() {
    pointerTap(settingsBtn, openSettings);
    pointerTap(closeSettingsBtn, closeSettings);
    pointerTap(saveSettingsBtn, closeSettings);

    pointerTap(captureBtn, async () => {
        if (coolDown) return;
        manualCapturePending = true;
        latestDetectedQuad = null;

        if (captureTimeoutId) clearTimeout(captureTimeoutId);
        captureTimeoutId = setTimeout(async () => {
            if (manualCapturePending) {
                manualCapturePending = false;
                await performCapture({ autoCaptured: false, quadPoints: null });
            }
        }, 500);
    });

    pointerTap(galleryBtn, () => galleryInput.click());
    galleryInput.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await processGalleryFile(file);
        galleryInput.value = "";
    });

    pointerTap(nextBtn, () => {
        if (!pages.length) return;
        currentPageIndex = Math.max(0, pages.length - 1);
        showResultPage();
    });

    pointerTap(continueBtn, () => {
        showScannerScreen();
        startScanning();
    });

    pointerTap(retakeBtn, () => {
        if (!pages.length) return;
        retakeIndex = currentPageIndex;
        showScannerScreen();
        startScanning();
        showToast("Capture a new image to replace this page.");
    });

    pointerTap(editBtn, () => {
        if (!pages.length) return;
        openEdit();
    });

    pointerTap(rotateBtn, () => {
        if (!pages.length) return;
        pages[currentPageIndex].baseCanvas = rotateCanvas90(pages[currentPageIndex].baseCanvas);
        renderResult();
        updateThumbnailBar();
    });

    pointerTap(sortBtn, openSort);
    pointerTap(saveBtn, toggleSaveMenu);
    pointerTap(savePdfBtn, async () => {
        hideSaveMenu();
        await exportPdf();
    });
    pointerTap(saveImagesBtn, () => {
        hideSaveMenu();
        exportImages();
    });

    document.addEventListener("pointerdown", (event) => {
        if (!saveMenu.contains(event.target) && event.target !== saveBtn) {
            hideSaveMenu();
        }
    });

    pointerTap(prevPageBtn, () => {
        if (currentPageIndex <= 0) return;
        currentPageIndex -= 1;
        renderResult();
    });

    pointerTap(nextPageBtn, () => {
        if (currentPageIndex >= pages.length - 1) return;
        currentPageIndex += 1;
        renderResult();
    });

    pointerTap(filterColorBtn, () => applyFilter("color"));
    pointerTap(filterGrayBtn, () => applyFilter("grayscale"));
    pointerTap(filterBinaryBtn, () => applyFilter("binary"));

    editCanvasEl.addEventListener("pointerdown", (e) => {
        if (!editState) return;
        const rect = editCanvasEl.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const corner = editFindCorner(cx, cy);
        if (corner >= 0) {
            editState.draggingCorner = corner;
            editCanvasEl.setPointerCapture(e.pointerId);
            e.preventDefault();
        }
    });

    editCanvasEl.addEventListener("pointermove", (e) => {
        if (!editState || editState.draggingCorner < 0) return;
        e.preventDefault();
        const rect = editCanvasEl.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const ir = editState.imgRect;
        const imgW = editState.originalCanvas.width;
        const imgH = editState.originalCanvas.height;
        const x = Math.max(0, Math.min(imgW, ((cx - ir.x) / ir.w) * imgW));
        const y = Math.max(0, Math.min(imgH, ((cy - ir.y) / ir.h) * imgH));
        editState.quadPoints[editState.draggingCorner] = { x, y };
        renderEditCanvas();
    });

    editCanvasEl.addEventListener("pointerup", () => {
        if (!editState) return;
        editState.draggingCorner = -1;
        renderEditCanvas();
    });

    pointerTap(editCancelBtn, cancelEdit);
    pointerTap(editApplyBtn, applyEdit);
}

async function bootstrap() {
    bindSettingRanges();
    wireEvents();

    const startScanner = async () => {
        const key = (licenseInput.value || "").trim() || DEFAULT_LICENSE_KEY;
        activateBtn.disabled = true;
        licenseScreen.classList.add("hidden");
        initOverlay.classList.remove("hidden");

        try {
            await initSDK(key);
            initOverlay.classList.add("hidden");
            showScannerScreen();
            startScanning();
        } catch (error) {
            console.error(error);
            updateInitStatus(`Initialization failed: ${error?.message || "Unknown error"}`);
            initOverlay.classList.add("hidden");
            licenseScreen.classList.remove("hidden");
            showToast("Initialization failed. Check your license key.", 3200);
        } finally {
            activateBtn.disabled = false;
        }
    };

    pointerTap(activateBtn, startScanner);
    licenseInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            startScanner();
        }
    });
}

bootstrap();
