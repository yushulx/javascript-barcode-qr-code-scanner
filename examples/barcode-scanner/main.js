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
const pageCaption = document.getElementById('page_caption');
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

// Multi-page state: one entry per displayable page, in display order. A plain
// image contributes one entry; a multi-page PDF or TIFF contributes one entry
// per page, so the preview, the navigator and benchmark mode all treat a page
// exactly like an image.
let imagePages = [];         // [{ name, src }]
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

// ========== Multi-Page Documents (PDF / TIFF) ==========
/* capture() hands a Blob to createImageBitmap()/<img>, so it can only decode
   what the browser itself can — and the web SDK's multi-page entry point,
   captureMultiPages(), accepts application/pdf only. A PDF or a TIFF is
   therefore rasterized into one image per page here, and each page then travels
   the ordinary image path: same capture() call, same overlay canvas, same
   benchmark code.

   PDF uses pdf.js, TIFF uses UTIF (plus pako, which UTIF needs for Deflate).
   Both load from jsDelivr on first use, so a visitor who never opens a document
   never downloads them. */
const PAGE_MAX_SIDE = 2000;   // px, long edge of one rasterized page
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
const UNSUPPORTED_FILES_MESSAGE = 'Unsupported file type. Please upload an image '
    + '(JPG, PNG, GIF, BMP, WebP, TIFF, PDF) or a video file (MP4, WebM, MOV).';

let pdfjsPromise = null;
let tiffPromise = null;
let loadingDepth = 0;  // nested showLoading()/hideLoading() pairs must not clobber

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
/* Which pipeline handles an uploaded file. The extension is checked as well as
   the MIME type because browsers report an empty type for some .tif files and
   for a .pdf served without its registered type. */
function fileKind(file) {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (file.type === 'application/pdf' || extension === 'pdf') return 'pdf';
    if (file.type === 'image/tiff' || extension === 'tif' || extension === 'tiff') return 'tiff';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'unknown';
}

function isScanableImage(file) {
    const kind = fileKind(file);
    return kind === 'image' || kind === 'pdf' || kind === 'tiff';
}

function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function (e) { resolve(e.target.result); };
        reader.onerror = function () { reject(new Error('Could not read ' + file.name)); };
        reader.readAsDataURL(file);
    });
}

async function handleFiles(files) {
    if (!files || files.length === 0) return;

    const documentFiles = files.filter(isScanableImage);
    const videos = files.filter(f => fileKind(f) === 'video');

    if (documentFiles.length > 0) {
        await loadPages(documentFiles);
    } else if (videos.length > 0) {
        handleFile(videos[0]);
    } else {
        alert(UNSUPPORTED_FILES_MESSAGE);
    }
}

async function handleFile(file) {
    if (!file) return;

    if (isScanableImage(file)) {
        await loadPages([file]);
        return;
    }

    if (fileKind(file) === 'video') {
        stopFileScanning();
        detectionResult.value = '';
        fileScanResults = [];
        imagePreviewContainer.style.display = 'none';
        imageNavigator.style.display = 'none';
        imagePages = [];
        loadVideoFile(file);
        return;
    }

    alert(UNSUPPORTED_FILES_MESSAGE);
}

/* Turns every upload into page images and shows the first one. Images pass
   through unchanged; a PDF or TIFF is rasterized page by page. */
async function loadPages(files) {
    stopFileScanning();
    detectionResult.value = '';
    fileScanResults = [];
    videoFileWrapper.style.display = 'none';
    imageNavigator.style.display = 'none';

    let notice = null;
    showLoading('Preparing files…');
    try {
        const pages = [];

        for (const file of files) {
            if (fileKind(file) === 'image') {
                pages.push({ name: file.name, src: await readFileAsDataURL(file) });
                continue;
            }

            setLoadingText((fileKind(file) === 'pdf' ? 'Rendering the pages of ' : 'Decoding ')
                + file.name + '…');
            const rendered = await rasterizeDocument(file);
            rendered.pages.forEach(function (src, index) {
                pages.push({
                    name: rendered.pages.length > 1
                        ? file.name + ' — page ' + (index + 1) + ' of ' + rendered.pages.length
                        : file.name,
                    src: src
                });
            });
            if (rendered.totalPages > rendered.pages.length) {
                notice = 'Only the first ' + rendered.pages.length + ' of '
                    + rendered.totalPages + ' pages were loaded.';
            }
        }

        imagePages = pages;
        currentImageIndex = 0;
        loadImageAtIndex(0);
    } catch (ex) {
        console.error(ex);
        imagePages = [];
        imagePreviewContainer.style.display = 'none';
        detectionResult.value = 'Could not read the file: ' + describeFileError(ex) + '\n';
    } finally {
        hideLoading();
    }

    if (notice) alert(notice);
}

function loadImageAtIndex(index) {
    const page = imagePages[index];
    if (!page) return;

    pageCaption.textContent = page.name;
    loadImage2Canvas(page.src);

    if (imagePages.length > 1) {
        imageNavigator.style.display = 'block';
        navigatorCounter.textContent = `${index + 1} / ${imagePages.length}`;
        const prevBtn = imageNavigator.querySelector('.btn-nav:first-child');
        const nextBtn = imageNavigator.querySelector('.btn-nav:last-child');
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === imagePages.length - 1;
    } else {
        imageNavigator.style.display = 'none';
    }
}

function navigateImage(delta) {
    const newIndex = currentImageIndex + delta;
    if (newIndex < 0 || newIndex >= imagePages.length) return;
    currentImageIndex = newIndex;
    detectionResult.value = '';
    fileScanResults = [];
    loadImageAtIndex(currentImageIndex);
}

// ========== Document Rasterizers (PDF / TIFF) ==========
function loadScript(url) {
    return new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = url;
        script.onload = function () { resolve(); };
        script.onerror = function () {
            script.remove();
            reject(new Error('Could not load ' + url));
        };
        document.head.appendChild(script);
    });
}

function loadPdfJs() {
    if (!pdfjsPromise) {
        pdfjsPromise = import(PDFJS_BASE + '/legacy/build/pdf.min.mjs')
            .then(function (pdfjsLib) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + '/legacy/build/pdf.worker.min.mjs';
                return pdfjsLib;
            })
            .catch(function (ex) {
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
            .then(function () { return loadScript(UTIF_URL); })
            .then(function () {
                if (!window.UTIF) throw new Error('The TIFF decoder did not initialise.');
                return window.UTIF;
            })
            .catch(function (ex) {
                tiffPromise = null;
                throw ex;
            });
    }
    return tiffPromise;
}

// -> { pages: [dataURL, ...], totalPages } — totalPages exceeds pages.length when
//    the document has more pages than MAX_DOCUMENT_PAGES.
function rasterizeDocument(file) {
    return fileKind(file) === 'tiff' ? rasterizeTiff(file) : rasterizePdf(file);
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
            if (pageCount > 1) setLoadingText(`Rendering page ${pageNumber} of ${pageCount}…`);

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

async function rasterizeTiff(file) {
    const UTIF = await loadTiffDecoder();
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds || ifds.length === 0) throw new Error('no image was found in this TIFF file.');

    const pageCount = Math.min(ifds.length, MAX_DOCUMENT_PAGES);
    const pages = [];

    for (let index = 0; index < pageCount; index++) {
        if (pageCount > 1) setLoadingText(`Decoding page ${index + 1} of ${pageCount}…`);

        const ifd = ifds[index];
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
        const pixels = new Uint8ClampedArray(width * height * 4);
        pixels.set(UTIF.toRGBA8(ifd));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);

        pages.push(canvas.toDataURL('image/png'));
    }

    return { pages: pages, totalPages: ifds.length };
}

function describeFileError(ex) {
    if (ex && ex.name === 'PasswordException') {
        return 'this PDF is password-protected. Remove the password and try again.';
    }
    return (ex && ex.message) ? ex.message : String(ex);
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
/* Reference-counted: rasterizing a document runs inside loadPages(), and SDK
   activation can overlap with it, so a bare show/hide pair would let one finish
   hide the other's spinner. Every showLoading() needs its own hideLoading(). */
function showLoading(text) {
    if (!loadingIndicator) return;
    loadingDepth++;
    setLoadingText(text);
    loadingIndicator.style.display = 'flex';
}

/* Progress updates inside a long operation must not touch the count — a
   showLoading() per page with a single hideLoading() at the end would leave the
   overlay up for good and block every click on the page. */
function setLoadingText(text) {
    if (text && loadingText) loadingText.textContent = text;
}

function hideLoading() {
    loadingDepth = Math.max(0, loadingDepth - 1);
    if (loadingDepth > 0 || !loadingIndicator) return;
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

    if (imagePages.length === 0) {
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

    // Build the list of pages to benchmark — a PDF or TIFF contributes one
    // entry per page, so the report breaks down per page.
    let imagesToBenchmark = [];
    if (imagePages.length > 0) {
        for (const page of imagePages) {
            imagesToBenchmark.push({ src: page.src, name: page.name });
        }
    } else {
        imagesToBenchmark.push({ src: img.src, name: 'Current Image' });
    }

    let results = [];

    for (let i = 0; i < imagesToBenchmark.length; i++) {
        let imgInfo = imagesToBenchmark[i];
        progressText.textContent = `Image ${i + 1}/${imagesToBenchmark.length}...`;
        progressBar.style.width = ((i / imagesToBenchmark.length) * 100) + '%';

        let testImg = imgInfo.src ? await loadImageFromSrc(imgInfo.src) : img;

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

function loadImageFromSrc(src) {
    return new Promise((resolve, reject) => {
        let tempImg = new Image();
        tempImg.onload = () => resolve(tempImg);
        tempImg.onerror = () => reject(new Error('Failed to load the image.'));
        tempImg.src = src;
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
