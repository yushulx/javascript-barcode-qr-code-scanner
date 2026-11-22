/**
 * Barcode Scanner
 *
 * Built on Dynamsoft Barcode Reader (dynamsoft-barcode-reader-bundle 11.6.3200).
 * Scans 1D/2D barcodes from image files, video files, and a live camera stream.
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
// Why the currently loaded images have (or have not) ground truth to compare
// against — a ZIP drop, an annotations.json import, or nothing.
let benchmarkNotice = '';
// An optional follow-up link for the notice, so a failure that has an obvious
// next step offers it instead of only naming it in prose.
let benchmarkNoticeAction = null;

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
    if (file.type === 'application/zip' || extension === 'zip') return 'zip';
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

// ========== Dataset archive (exported by the barcode generator) ==========
/* The generator exports a whole test dataset as one ZIP: `images/*.png` plus
   `annotations.json` in the barcode-benchmark/1.0 schema. Reading the archive
   here means a dataset can be benchmarked as a single drop with its ground
   truth already attached, instead of extracting it and matching filenames by
   hand. Its archives store their entries uncompressed (PNG is already
   compressed), so no inflate step is normally needed; a deflated entry from
   some other writer goes through DecompressionStream. */
const ZIP_IMAGE_RE = /\.(png|jpe?g|bmp|gif|webp)$/i;
const MIME_BY_EXTENSION = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp',
    gif: 'image/gif', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff'
};

function mimeForName(name) {
    const extension = (name.split('.').pop() || '').toLowerCase();
    return MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
        throw new Error('This archive uses compression and this browser cannot inflate it. '
            + 'Re-export the dataset from the barcode generator — its archives are stored, not compressed.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    /* The end-of-central-directory record is at the end, but a comment may
       follow it, so scan backwards over the largest comment a ZIP allows. */
    let eocd = -1;
    for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 65535; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record found).');

    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const entries = [];

    for (let n = 0; n < count; n++) {
        if (offset + 46 > buffer.length || view.getUint32(offset, true) !== 0x02014b50) break;
        const method = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const name = new TextDecoder().decode(buffer.subarray(offset + 46, offset + 46 + nameLength));

        /* The sizes in the local header may be zeroed when a data descriptor is
           used, so the central directory's values are the ones to trust; the
           local header is only read to find where the data starts. */
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const raw = buffer.subarray(dataStart, dataStart + compressedSize);

        entries.push({ name: name, method: method, raw: raw });
        offset += 46 + nameLength + extraLength + commentLength;
    }

    if (entries.length === 0) throw new Error('The archive contains no entries.');

    const wanted = entries.filter(function (entry) {
        return entry.name.toLowerCase().endsWith('annotations.json')
            || ZIP_IMAGE_RE.test(entry.name.split('/').pop() || '');
    });

    for (const entry of wanted) {
        if (entry.method === 0) entry.data = entry.raw;
        else if (entry.method === 8) entry.data = await inflateRaw(entry.raw);
        else throw new Error('The archive entry "' + entry.name + '" uses an unsupported '
            + 'compression method (' + entry.method + '). Export the dataset from the barcode generator instead.');
    }
    return wanted;
}

async function loadDatasetZip(file) {
    showLoading('Reading ' + file.name + '…');
    try {
        const entries = await readZipEntries(file);
        const images = [];
        let annotation = null;

        entries.forEach(function (entry) {
            const base = entry.name.split('/').pop();
            if (entry.name.toLowerCase().endsWith('annotations.json')) {
                annotation = JSON.parse(new TextDecoder().decode(entry.data));
                return;
            }
            images.push(new File([entry.data], base, { type: mimeForName(base) }));
        });

        if (images.length === 0) {
            throw new Error('The archive contains an annotations file but no images.');
        }
        if (annotation) applyAnnotationData(annotation);
        hideLoading();

        await loadPages(images);
        setLoadingText('');

        if (annotation) {
            const matched = images.filter(function (image) {
                return annotationData && annotationData[image.name];
            }).length;
            const unmatched = images.length - matched;
            /* An image with no annotation is still benchmarked — it just has no
               expected values, so its row reports what was found and nothing
               else. Say so rather than silently reporting fewer images. */
            setBenchmarkNotice(images.length + ' image' + (images.length === 1 ? '' : 's')
                + ' and ' + Object.keys(annotationData || {}).length + ' annotated file'
                + (Object.keys(annotationData || {}).length === 1 ? '' : 's')
                + ' loaded from ' + file.name + '.'
                + (unmatched ? ' ' + unmatched + ' image' + (unmatched === 1 ? ' has' : 's have')
                    + ' no ground truth entry.' : ''));
        } else {
            setBenchmarkNotice(images.length + ' image' + (images.length === 1 ? '' : 's')
                + ' loaded from ' + file.name + ', but the archive carries no annotations.json, '
                + 'so there is nothing to score against. A dataset exported by the generator '
                + 'includes it:',
            { label: 'build one with the barcode generator', href: '../barcode-qrcode-generator/' });
        }
        analytics.action('dataset_zip', { images: images.length, annotated: annotation ? 1 : 0 });
    } catch (ex) {
        console.error(ex);
        hideLoading();
        alert('Could not read ' + file.name + ': ' + ex.message);
        /* The alert says what broke; the notice stays on the page with the way
           out, which a dismissed alert cannot do. */
        setBenchmarkNotice('Could not read ' + file.name + '. Export a fresh dataset with:',
            { label: 'the barcode generator', href: '../barcode-qrcode-generator/' });
        analytics.fail('barcode', 'dataset_zip');
    }
}

async function handleFiles(files) {
    if (!files || files.length === 0) return;

    const archives = files.filter(f => fileKind(f) === 'zip');
    if (archives.length > 0) {
        await loadDatasetZip(archives[0]);
        return;
    }

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

async function handleFile(file, focus) {
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
        loadVideoFile(file, focus);
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
        analytics.fail('barcode', 'image_file');
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
            detectionResult.value = 'Dynamsoft Barcode Reader is still initializing. Please try again in a moment.\n';
            return;
        }

        let context = overlayCanvas.getContext('2d');
        context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        try {
                analytics.start('barcode', 'image_file');
                await resetOrReapplyDynamsoftSettings();
                let result = await feedback.run('Scanning the image…', () =>
                    cvr.capture(img.src, dynamsoftTemplate)
                );
            showFileResult(context, result);
            analytics.success('barcode', 'image_file', {
                barcode_count: (result.items || []).filter(
                    i => i.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE
                ).length
            });
        } catch (ex) {
            console.error(ex);
            detectionResult.value += 'Scanning failed: ' + ex.message + '\n';
            analytics.fail('barcode', 'image_file');
        }
    };
}

function loadVideoFile(file, focus) {
    let url = URL.createObjectURL(file);
    videoFilePlayer.src = url;

    videoFilePlayer.onloadedmetadata = async function () {
        videoFileWrapper.style.display = 'block';
        imagePreviewContainer.style.display = 'none';
        /* A clip handed over from the camera was requested from a button far
           below the player, so it is brought into view. An upload is already
           beside the drop zone and is left where the user is looking. */
        if (focus) videoFileWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        videoOverlay.width = videoFilePlayer.videoWidth;
        videoOverlay.height = videoFilePlayer.videoHeight;

        /* The wrapper is a fixed 4:3 box and the player fills it with
           `object-fit: cover`, so a 16:9 clip is cropped left and right. The
           overlay canvas is stretched over the whole box, which would put its
           boxes outside the pixels they were measured in. Matching the box to
           the clip's own aspect keeps canvas coordinates and video pixels the
           same — one video pixel, one canvas pixel. */
        if (videoFilePlayer.videoWidth && videoFilePlayer.videoHeight) {
            videoFileWrapper.style.paddingBottom =
                (videoFilePlayer.videoHeight / videoFilePlayer.videoWidth * 100) + '%';
        }

        if (!isSDKReady) {
            detectionResult.value = 'Dynamsoft Barcode Reader is still initializing. Please try again in a moment.\n';
            return;
        }

        /* A clip recorded in the browser has no duration in its header. Wait for
           the gauge to settle before playing, or the playback and the seek fight
           each other and the frame loop stops on the first tick. */
        await fixInfiniteDuration(videoFilePlayer);
        startFileScanning();
    };
}

// ========== Video File Scanning ==========
function startFileScanning() {
    fileScanning = true;
    fileScanResults = [];
    detectionResult.value = '';
    analytics.start('barcode', 'video_file');
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
                /* No clearRect here: scanVideoFrameDynamsoft clears the canvas
                   itself, after capture() resolves, so the previous frame's
                   boxes stay on screen instead of blinking off during the
                   decode. */
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

    /* The boxes are cleared here, once the new result is in hand, and not before
       the await above — clearing first leaves the canvas blank for the two or
       three animation frames that capture() takes, so the box blinks on and off
       at about 15 Hz instead of sitting still. */
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (!result.items || result.items.length === 0) return;

    let newResult = false;
    for (let item of result.items) {
        if (item.type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
            continue;
        }

        /* Every barcode found in this frame is boxed, on every frame. Gating the
           drawing on the result list below (as it used to be) drew a box for the
           single frame that first decoded the code and skipped it afterwards —
           one frame out of a hundred, which reads as no overlay at all. */
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

        let type = item.formatString || 'Unknown';
        let key = `[${type}] ${item.text}`;
        if (!fileScanResults.includes(key)) {
            fileScanResults.push(key);
            newResult = true;
        }
    }

    if (newResult) {
        detectionResult.value = fileScanResults.join('\n') + '\n\n';
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
/* The demos hosted under /codepool/demos/ share one license that is bound to
   dynamsoft.com, so activation runs on page load and there is no license input
   in Settings.

   The bound key only activates on dynamsoft.com, so on any other host
   (localhost, staging, a fork) we fall back to the SDK's public 24-hour trial
   key, which is accepted on localhost. */
const BOUND_HOSTS = ['dynamsoft.com'];
const CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
const TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';

function isBoundHost() {
    const host = window.location.hostname.toLowerCase();
    return BOUND_HOSTS.some((bound) => host === bound || host.endsWith('.' + bound));
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

let activationPromise = null;

async function activateDynamsoft() {
    if (isSDKReady) return;
    if (activationPromise) return activationPromise;

    activationPromise = (async () => {
        const startedAt = performance.now();
        showLoading('Initializing Dynamsoft Barcode Reader...');
        try {
            const licenseKey = resolveLicenseKey();
            await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);

            if (!wasmLoaded) {
                await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
                wasmLoaded = true;
            }

            if (!cvr) {
                cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
            }

            // Apply any custom template that was loaded before activation finished
            if (dynamsoftCustomTemplateContent) {
                await applyDynamsoftTemplateContent(dynamsoftCustomTemplateContent);
            } else {
                await extendDefaultBarcodeFormats(dynamsoftTemplate);
            }

            activatedLicenseKey = licenseKey;
            isSDKReady = true;
            updateSDKBadge();
            analytics.ready(performance.now() - startedAt);

            // If the live camera is already open, start scanning right away
            if (dropdown.value === 'camera' && stream) {
                startCameraScanning();
            }
        } catch (ex) {
            console.error(ex);
            isSDKReady = false;
            updateSDKBadge();
            analytics.error('activate_failed', (ex && (ex.message || ex)) || 'unknown');
        } finally {
            hideLoading();
        }
    })();

    return activationPromise;
}

// Activate as soon as the page is interactive — no user action required.
window.addEventListener('DOMContentLoaded', function () {
    updateSDKBadge();
    activateDynamsoft();
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
        fitPreviewToStream();
        startCameraScanning();
        updateRecordButton();
    } catch (error) {
        console.error('Error accessing camera:', error);
        updateRecordButton();
    }
}

/* The preview box is a fixed 4:3 and the stream is filled into it with
   `object-fit: cover`, so a 16:9 camera is cropped left and right. The overlay
   canvas is stretched across the whole box, which slides every box it draws off
   the barcode it belongs to. Matching the box to the stream keeps one video
   pixel equal to one canvas pixel. */
function fitPreviewToStream() {
    const videoview = document.getElementById('videoview');
    if (!videoview || !stream) return;

    const track = stream.getVideoTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : {};
    if (settings.width && settings.height) {
        videoview.style.paddingBottom = (settings.height / settings.width * 100) + '%';
    }
}

function startCameraScanning() {
    if (!isSDKReady) return;

    cameraScanning = true;
    cameraScanResults = [];
    scanResult.value = '';
    analytics.start('barcode', 'camera');
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
    /* A take cannot outlive the stream it is recording: stop the recorder first,
       or the MediaRecorder callback never fires and the button stays on "Stop". */
    if (recorder) stopRecording();

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
    updateRecordButton();
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
        analytics.success('barcode', 'camera', { barcode_count: txts.length });
    }
}

// ========== Clip Recording ==========
/* A live camera is a hard thing to test against: the frame that failed is gone
   the moment it is gone. Recording the stream turns that into something you can
   replay — the blob goes straight into the ordinary video path (same preview,
   same frame loop, same overlay), so the clip is decoded exactly the way an
   uploaded MP4/WebM would be.

   RecordRTC is fetched from jsDelivr on the first click, like the PDF/TIFF
   decoders, so a visitor who never records never pays for it. */
const RECORDRTC_URL = 'https://cdn.jsdelivr.net/npm/recordrtc@5.6.2/RecordRTC.min.js';

const recordBtn = document.getElementById('record_btn');
const recordBtnLabel = document.getElementById('record_btn_label');
const recordTimer = document.getElementById('record_timer');
const recordingResultCard = document.getElementById('recording_result');
const recordingPreview = document.getElementById('recording_preview');
const recordingMeta = document.getElementById('recording_meta');
const recordingDownload = document.getElementById('recording_download');

let recordRtcPromise = null;
let recorder = null;        // live RecordRTC instance while a take is running
let recordingBusy = false;  // a take is starting, or being flushed to a blob
let recordTimerId = null;
let recordStartedAt = 0;
let recording = null;       // { blob, url, file, seconds, width, height }

function loadRecordRTC() {
    if (!recordRtcPromise) {
        recordRtcPromise = loadScript(RECORDRTC_URL).then(function () {
            if (!window.RecordRTC) throw new Error('RecordRTC did not initialise.');
            return window.RecordRTC;
        }).catch(function (ex) {
            recordRtcPromise = null;   // let the next click retry
            throw ex;
        });
    }
    return recordRtcPromise;
}

function formatClipTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

/* MediaRecorder writes a WebM header with no duration, so an element loading the
   blob reports `Infinity` and its seek bar cannot be dragged — which defeats the
   point of scrubbing back to the frame that failed. Seeking far past the end
   makes the browser measure the real duration; the element is then put back at
   the start. Files that carry a proper header are left untouched.

   Resolves once the seek has settled, so a caller that wants to play the clip
   does not start in the middle of one. */
function fixInfiniteDuration(video) {
    if (video.duration !== Infinity) return Promise.resolve();

    return new Promise(function (resolve) {
        let settled = false;
        const finish = function () {
            if (settled) return;
            settled = true;
            video.removeEventListener('timeupdate', measure);
            video.removeEventListener('seeked', rewound);
            clearTimeout(guard);
            resolve();
        };
        const measure = function () {
            video.removeEventListener('timeupdate', measure);
            try {
                video.currentTime = 0;
            } catch (e) {
                finish();
                return;
            }
            video.addEventListener('seeked', rewound);
        };
        const rewound = function () { finish(); };
        const guard = setTimeout(finish, 1500);   // never hold a caller hostage

        video.addEventListener('timeupdate', measure);
        try {
            video.currentTime = 1e101;
        } catch (e) {
            finish();
        }
    });
}

/* One owner for the button's three states — idle, recording, unavailable —
   because the camera can be swapped or switched off underneath it. */
function updateRecordButton() {
    if (!recordBtn) return;
    const cameraLive = !!stream && !!videoElement.srcObject;

    if (recorder) {
        recordBtn.classList.add('is-recording');
        recordBtnLabel.textContent = 'Stop recording';
        recordBtn.disabled = false;
        recordTimer.hidden = false;
        return;
    }

    recordBtn.classList.remove('is-recording');
    recordBtnLabel.textContent = 'Start recording';
    recordBtn.disabled = recordingBusy || !cameraLive;
    recordTimer.hidden = true;
    if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
    }
}

function toggleRecording() {
    if (recorder) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    if (recorder || recordingBusy) return;
    if (!stream) {
        alert('The camera is not running. Pick a camera first.');
        return;
    }

    recordingBusy = true;
    recordBtn.disabled = true;
    recordBtnLabel.textContent = 'Starting…';

    try {
        const RecordRTC = await loadRecordRTC();
        hideRecording();                       // a new take replaces the old clip
        recorder = new RecordRTC(stream, { type: 'video' });
        recorder.startRecording();

        recordStartedAt = Date.now();
        recordTimer.textContent = '0:00';
        recordTimerId = setInterval(function () {
            recordTimer.textContent = formatClipTime((Date.now() - recordStartedAt) / 1000);
        }, 200);
        analytics.action('record_start', { resolution: videoElement.videoWidth + 'x' + videoElement.videoHeight });
    } catch (ex) {
        console.error(ex);
        alert('Could not start the recorder: ' + ex.message);
    } finally {
        recordingBusy = false;
        updateRecordButton();
    }
}

function stopRecording() {
    if (!recorder || recordingBusy) return;

    const instance = recorder;
    recordingBusy = true;
    recordBtn.disabled = true;
    if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
    }

    const seconds = (Date.now() - recordStartedAt) / 1000;
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;

    instance.stopRecording(function () {
        const blob = instance.getBlob();

        /* The blob is read before the instance is torn down — destroy() clears
           the recorder's copy. The stream itself is untouched: the preview and
           the next take both keep using it. */
        instance.destroy();
        recorder = null;
        recordingBusy = false;
        updateRecordButton();

        if (!blob || blob.size === 0) {
            alert('The recording came back empty. Check that the camera is still running, then try again.');
            return;
        }

        showRecording(blob, seconds, width, height);
        analytics.action('record_stop', { seconds: Math.round(seconds), kb: Math.round(blob.size / 1024) });
    });
}

function showRecording(blob, seconds, width, height) {
    hideRecording();

    const extension = blob.type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    const url = URL.createObjectURL(blob);

    /* A File, not the raw blob: the scan path and the download both expect a
       name, and the extension is what tells the upload handler this is a video
       when the browser reports an empty MIME type. */
    recording = {
        blob: blob,
        url: url,
        seconds: seconds,
        width: width,
        height: height,
        file: new File([blob], 'camera-clip.' + extension, {
            type: blob.type || 'video/' + extension
        })
    };

    recordingPreview.onloadedmetadata = function () {
        fixInfiniteDuration(recordingPreview);
    };
    recordingPreview.src = url;
    recordingMeta.textContent = formatClipTime(seconds) + ' · ' + width + '×' + height + ' · '
        + (blob.size / 1048576).toFixed(1) + ' MB · ' + extension.toUpperCase();
    recordingDownload.href = url;
    recordingDownload.setAttribute('download', 'camera-clip.' + extension);
    recordingResultCard.style.display = 'block';
    /* The camera preview is taller than the viewport on most screens, and the
       clip appears under it — bring it into view or the click looks like it did
       nothing. */
    recordingResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* Hidden, not deleted: the object URL keeps the preview alive, so it is revoked
   here and nowhere else. */
function hideRecording() {
    if (recordingResultCard) recordingResultCard.style.display = 'none';
    if (recordingPreview) {
        recordingPreview.pause();
        recordingPreview.removeAttribute('src');
        recordingPreview.load();
    }
    if (recording && recording.url) URL.revokeObjectURL(recording.url);
    recording = null;
}

function discardRecording() {
    hideRecording();
    analytics.action('record_discard', {});
}

async function scanRecording() {
    if (!recording) return;

    const file = recording.file;
    analytics.action('record_scan', { seconds: Math.round(recording.seconds) });

    /* Hand the clip to the upload path instead of writing a second decoder loop:
       switching to File mode stops the camera, and loadVideoFile() then plays the
       clip frame by frame through the same capture() call an upload uses. */
    dropdown.value = 'file';
    await selectChanged();
    handleFile(file, true);
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
        if (isSDKReady) {
            badge.className = 'sdk-badge badge-active';
            badge.textContent = 'Activated';
        } else if (activationPromise) {
            badge.className = 'sdk-badge badge-inactive';
            badge.textContent = 'Activation Failed';
        } else {
            badge.className = 'sdk-badge badge-inactive';
            badge.textContent = 'Initializing...';
        }
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
    analytics.action('mode_switch', { mode: mode });
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
        alert('Dynamsoft Barcode Reader is still initializing. Please try again in a moment.');
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

        // Ground truth for this image, matched by filename. The whole entry is
        // passed through, not just the text: the symbology and the box are
        // compared as well.
        let groundTruth = null;
        let conditions = null;
        if (annotationData && annotationData[imgInfo.name]) {
            groundTruth = annotationData[imgInfo.name].barcodes;
            conditions = annotationData[imgInfo.name].degradations;
        }

        results.push(await benchmarkSingleImage(testImg, imgInfo.name, groundTruth, conditions));
    }

    progressBar.style.width = '100%';
    progressText.textContent = 'Done!';

    renderBenchmarkResults(results);
    benchmarkRunning = false;
    analytics.success('benchmark', 'image_set', {
        image_count: results.length,
        barcode_count: results.reduce((sum, r) => sum + r.barcodes.length, 0)
    });

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

// Returns { imageName, barcodes: [{type, text, points}], time, error, conditions, gtResult }
async function benchmarkSingleImage(testImg, imageName, groundTruth = null, conditions = null) {
    let barcodes = [];
    let startTime = performance.now();

    try {
        await resetOrReapplyDynamsoftSettings();
        let result = await cvr.capture(testImg.src, dynamsoftTemplate);
        if (result.items && result.items.length > 0) {
            for (let item of result.items) {
                if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                    /* The box is kept so the benchmark can compare it with the
                       annotated one; it is never used to decide a match. */
                    let points = null;
                    if (item.location && Array.isArray(item.location.points) && item.location.points.length >= 3) {
                        points = item.location.points.map(function (p) { return [p.x, p.y]; });
                    }
                    barcodes.push({ type: item.formatString || 'Unknown', text: item.text, points: points });
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
            conditions,
            gtResult: groundTruth ? computeGTResult([], groundTruth) : null
        };
    }

    return {
        imageName,
        barcodes,
        time: performance.now() - startTime,
        error: null,
        conditions,
        gtResult: groundTruth ? computeGTResult(barcodes, groundTruth) : null
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

/* What the ground-truth columns say about the whole run. Kept in one place so
   the page and the exported report cannot disagree. */
function describeGroundTruthSummary(results, totals) {
    const lines = [];
    lines.push('Ground truth: <strong>' + totals.tp + '/' + totals.expected + '</strong> decoded'
        + ' — recall <span class="' + gtRateClass(totals.recall) + '">'
        + (totals.recall * 100).toFixed(1) + '%</span>'
        + ', precision <span class="' + gtRateClass(totals.precision) + '">'
        + (totals.precision * 100).toFixed(1) + '%</span>');
    if (totals.missed > 0) {
        lines.push('Missed: <strong class="gt-poor">' + totals.missed + '</strong> expected value'
            + (totals.missed === 1 ? '' : 's') + ' never came back');
    }
    if (totals.spurious > 0) {
        lines.push('Unmatched decodes: <strong>' + totals.spurious + '</strong> — values that read'
            + ' but matched no expected value (a wrong read, or a value the annotations do not cover)');
    }
    if (totals.formatChecked > 0) {
        lines.push('Symbology agreement: <strong>' + totals.formatMatched + '/' + totals.formatChecked
            + '</strong> correct values reported as the annotated symbology');
    }
    if (totals.overlapChecked > 0) {
        lines.push('Box overlap (IoU \u2265 ' + OVERLAP_THRESHOLD + '): <strong>'
            + totals.overlapOk + '/' + totals.overlapChecked + '</strong> — mean '
            + (totals.meanOverlap * 100).toFixed(0) + '%. Informational: the annotated box is the'
            + ' symbol plus its quiet zone, the reported one is the bars.');
    }
    return lines;
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
    let totalMissed = 0;
    let totalSpurious = 0;
    let totalFormatMatched = 0;
    let totalFormatChecked = 0;
    let totalOverlapOk = 0;
    let totalOverlapChecked = 0;
    let overlapSum = 0;

    for (let r of results) {
        totalBarcodes += r.barcodes.length;
        totalTime += r.time;
        if (r.error) errors++;
        for (let b of r.barcodes) allTexts.add(b.text);
        if (r.gtResult) {
            totalTP += r.gtResult.tp;
            totalFP += r.gtResult.fp;
            totalExpected += r.gtResult.total;
            totalMissed += r.gtResult.fn;
            totalSpurious += r.gtResult.spurious.length;
            totalFormatMatched += r.gtResult.formatMatched;
            totalFormatChecked += r.gtResult.formatChecked;
            totalOverlapOk += r.gtResult.overlapOk;
            totalOverlapChecked += r.gtResult.overlapChecked;
            if (r.gtResult.meanOverlap !== null) {
                overlapSum += r.gtResult.meanOverlap * r.gtResult.overlapChecked;
            }
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
        describeGroundTruthSummary(results, {
            tp: totalTP,
            expected: totalExpected,
            recall: detectionRate,
            precision: precision,
            missed: totalMissed,
            spurious: totalSpurious,
            formatMatched: totalFormatMatched,
            formatChecked: totalFormatChecked,
            overlapOk: totalOverlapOk,
            overlapChecked: totalOverlapChecked,
            meanOverlap: totalOverlapChecked ? overlapSum / totalOverlapChecked : 0
        }).forEach(function (line) {
            html += `<li>${line}</li>`;
        });
    }
    if (errors > 0) {
        html += `<li>Errors: <strong style="color:#dc2626;">${errors}</strong></li>`;
    }
    html += '</ul></div>';

    // ---- Per-image table ----
    html += '<div class="benchmark-table-wrap"><table class="benchmark-table">';
    if (hasAnyGT) {
        html += '<thead><tr><th>Image</th><th>Found</th><th>Expected</th><th>Correct</th>'
            + '<th>Missed</th><th>Recall</th><th>Symbology</th><th>Box IoU</th><th>Time</th>'
            + '<th>Details</th></tr></thead>';
    } else {
        html += '<thead><tr><th>Image</th><th>Barcodes Found</th><th>Time</th><th>Details</th></tr></thead>';
    }
    html += '<tbody>';

    let maxCount = Math.max(...results.map(r => r.barcodes.length));

    for (let r of results) {
        let count = r.barcodes.length;
        let countClass = (count === maxCount && count > 0) ? 'count-col best-count' : 'count-col';

        let detailHtml = '';
        if (r.conditions) {
            detailHtml += detailBlock('Conditions',
                joinCapped(conditionParts(r.conditions), DETAIL_LIST_LIMIT));
        }
        if (r.error) {
            detailHtml += detailBlock('Error', r.error, 'missed');
        } else if (count > 0) {
            detailHtml += detailBlock('Decoded',
                joinCapped(r.barcodes.map(b => '[' + b.type + '] ' + b.text), DETAIL_LIST_LIMIT));
        } else {
            detailHtml += detailBlock('Decoded', 'nothing found', 'muted');
        }
        if (r.gtResult && r.gtResult.missed.length > 0) {
            /* The actionable half: the exact values that never came back. */
            detailHtml += detailBlock('Missed',
                joinCapped(r.gtResult.missed, DETAIL_LIST_LIMIT), 'missed');
        }
        if (r.gtResult && r.gtResult.formatMismatches.length > 0) {
            /* Worth naming rather than counting: a value that decoded correctly
               under an unexpected symbology name is usually a naming difference
               (UPC-A reported for an EAN-13), not a reading error. */
            detailHtml += detailBlock('Symbology differs',
                Array.from(new Set(r.gtResult.formatMismatches)).join(' · '), 'muted');
        }

        if (hasAnyGT) {
            let gt = r.gtResult;
            let tp = gt ? gt.tp : '-';
            let expected = gt ? gt.total : '-';
            let missed = gt ? gt.fn : '-';
            let rateHtml = gt ? `<span class="${gtRateClass(gt.detectionRate)}">${(gt.detectionRate * 100).toFixed(1)}%</span>` : '<em>N/A</em>';
            let formatHtml = gt && gt.formatChecked
                ? `<span class="${gtRateClass(gt.formatMatched / gt.formatChecked)}">${gt.formatMatched}/${gt.formatChecked}</span>`
                : '<em>—</em>';
            let overlapHtml = gt && gt.overlapChecked
                ? `<span class="${gtRateClass(gt.overlapOk / gt.overlapChecked)}">${gt.overlapOk}/${gt.overlapChecked}</span>`
                    + `<br><small>${(gt.meanOverlap * 100).toFixed(0)}%</small>`
                : '<em>—</em>';
            html += `<tr>
                <td class="sdk-col">${escapeHtml(r.imageName)}</td>
                <td class="${countClass}">${count}</td>
                <td class="count-col">${expected}</td>
                <td class="count-col">${tp}</td>
                <td class="count-col${missed > 0 ? ' missed-count' : ''}">${missed}</td>
                <td class="rate-col">${rateHtml}</td>
                <td class="rate-col">${formatHtml}</td>
                <td class="rate-col">${overlapHtml}</td>
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

/* The per-image conditions recorded by the generator, as one readable line. */
/* ---- The per-image details cell ---------------------------------------
   Everything about a row that is not a number goes here, and it is the only
   cell whose height is not fixed. Rendering it as three one-line blocks with
   capped, inline values keeps a row readable: an unbounded <ul> of decoded and
   missed values, next to a conditions line of eighteen raw key/value pairs, made
   one row 450 px tall — which stretched every other column of that row and read
   as enormous gaps between rows. The full text stays in the element's title, so
   nothing is lost, it is just not printed by default. */
const DETAIL_LIST_LIMIT = 6;

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function joinCapped(items, limit) {
    if (items.length <= limit) return items.join(' · ');
    return items.slice(0, limit).join(' · ') + '  +' + (items.length - limit) + ' more';
}

function detailBlock(label, text, kind) {
    return '<div class="detail-block' + (kind ? ' is-' + kind : '') + '">'
        + '<span class="detail-label">' + escapeHtml(label) + '</span> '
        + '<span class="detail-values" title="' + escapeAttr(text) + '">'
        + escapeHtml(text) + '</span></div>';
}

/* The per-image conditions recorded by the generator, one entry per condition.
   The generator writes them most-severe-first, so capping the list keeps the
   part that can explain a miss and drops the tail. */
function conditionParts(conditions) {
    const parts = [];
    Object.keys(conditions).forEach(function (key) {
        const value = conditions[key];
        if (key === 'inverted') {
            if (value) parts.push('inverted');
            return;
        }
        if (value === null || value === undefined) return;
        parts.push(key + ' ' + (typeof value === 'number' ? trimNumber(value) : value));
    });
    return parts;
}

/* Annotations written before the generator trimmed its conditions carry three
   decimals of precision nobody reads. */
function trimNumber(value) {
    const fixed = Number(value).toFixed(2);
    return fixed.replace(/\.?0+$/, '') || '0';
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
  .count-col.missed-count { color: #dc2626; }
  .detail-block { margin-bottom: 4px; line-height: 1.5; }
  .detail-block:last-child { margin-bottom: 0; }
  .detail-label { display: inline; font-size: 0.68rem; font-weight: 700; letter-spacing: .05em;
    text-transform: uppercase; color: #64748b; margin-right: 6px; }
  .detail-values { display: inline; font-family: monospace; font-size: 0.74rem;
    word-break: break-word; }
  .benchmark-table td:last-child { min-width: 340px; max-width: 520px; }
  .benchmark-table tbody td { vertical-align: middle; }
  .benchmark-table tbody td:last-child { vertical-align: top; }
  .detail-block.is-missed .detail-values, .detail-block.is-missed .detail-label { color: #dc2626; }
  .detail-block.is-muted .detail-values { color: #64748b; font-family: inherit; font-style: italic; }
  .report-note { background: #fff8ee; border: 1px solid #f6c893; border-left: 4px solid #fe8e14;
    border-radius: 4px; padding: 10px 14px; font-size: 0.85rem; color: #323234; margin-bottom: 16px; }
  .benchmark-summary { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 4px rgba(0,0,0,.07); margin-top: 8px; }
  .benchmark-summary h4 { margin: 0 0 10px; font-size: 1rem; color: #334155; }
  .benchmark-summary ul { margin: 8px 0 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.8; }
  .benchmark-image-title { font-size: 0.95rem; font-weight: 600; color: #475569; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="report-header">
  <h1>Barcode scanner benchmark report</h1>
  <p><strong>Generated:</strong> ${escapeHtml(timestamp)}</p>
  <p><strong>Images tested:</strong> ${imageCount}</p>
  <p><strong>SDK:</strong> Dynamsoft Barcode Reader</p>
  ${annotationData
            ? `<p><strong>Ground truth:</strong> annotations loaded for ${Object.keys(annotationData).length} image(s)</p>`
            : `<p class="report-note">This run had no ground truth, so it reports what was found and how
       fast, not whether it was right. A dataset with expected values for every symbol can be
       generated at
       <a href="https://www.dynamsoft.com/codepool/demos/barcode-qrcode-generator/">dynamsoft.com/codepool/demos/barcode-qrcode-generator</a>
       — export the ZIP and drop it on the scanner.</p>`}
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

/* The stock `ReadBarcodes_Default` preset enables 32 of the 52 formats it
   knows about and leaves DotCode and both Pharmacode tracks out. That is a
   reasonable default for a general scanner, and a trap for this page: the
   barcode generator produces those two as well, so a benchmark run against a
   dataset containing them reports misses that are not reading failures — the
   reader was never asked. Measured on bundle 11.6.3200: a clean DotCode and a
   clean Pharmacode both decode as soon as the bits are set, and neither decodes
   with the preset alone.
   
   The extra bits are added through the simplified-settings API rather than a
   hand-written template — see `initSettings()` vs `updateSettings()` in the
   notes at the top of this file's README. */
const EXTRA_BARCODE_FORMATS = ['BF_DOTCODE', 'BF_PHARMACODE_ONE_TRACK', 'BF_PHARMACODE_TWO_TRACK'];

async function extendDefaultBarcodeFormats(taskName) {
    if (!window.Dynamsoft || !Dynamsoft.DBR || !Dynamsoft.DBR.EnumBarcodeFormat) return;
    const enumFormats = Dynamsoft.DBR.EnumBarcodeFormat;
    const settings = await cvr.getSimplifiedSettings(taskName);
    let mask = BigInt(settings.barcodeSettings.barcodeFormatIds);
    const added = [];
    EXTRA_BARCODE_FORMATS.forEach(function (name) {
        const bit = enumFormats[name];
        if (bit === undefined) return;
        if ((mask & BigInt(bit)) !== BigInt(bit)) {
            mask |= BigInt(bit);
            added.push(name);
        }
    });
    if (added.length === 0) return;
    settings.barcodeSettings.barcodeFormatIds = mask;
    await cvr.updateSettings(taskName, settings);
    console.log('Dynamsoft Barcode Reader: enabled ' + added.join(', ')
        + ' on top of the default preset.');
}

async function resetOrReapplyDynamsoftSettings() {
    if (dynamsoftCustomTemplateContent) {
        await cvr.initSettings(dynamsoftCustomTemplateContent);
    } else {
        await cvr.resetSettings();
        /* resetSettings() restores the stock preset, so the extra formats have
           to be re-applied or the first capture after a reset silently loses
           them — which is exactly the case the benchmark runs in. */
        await extendDefaultBarcodeFormats(dynamsoftTemplate);
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
        /* Resetting restores the stock preset, so the extra formats this demo
           adds have to be re-applied — otherwise clearing a template silently
           costs DotCode and Pharmacode until the page is reloaded. */
        cvr.resetSettings()
            .then(function () { return extendDefaultBarcodeFormats(dynamsoftTemplate); })
            .catch(function () { });
    }
}

// ========== Annotation Ground Truth ==========
/* Shared by the annotations.json import and the dataset ZIP, so both paths
   agree on what a valid annotation file is. The schema is the one the reference
   datasets use (`barcode-benchmark/1.0`):
     { images: [ { file, barcodes: [ { text, format, points, ... } ], degradations } ] }
   `format`, `points` and `degradations` are optional; `text` is what the
   benchmark matches on. Everything else is carried through so the report can
   name the conditions an image was captured under. */
function applyAnnotationData(data) {
    if (!data || !data.images || !Array.isArray(data.images)) {
        throw new Error('Invalid format. Expected an "images" array.');
    }
    const map = {};
    for (const entry of data.images) {
        if (entry.file && Array.isArray(entry.barcodes)) {
            map[entry.file] = {
                barcodes: entry.barcodes,
                degradations: entry.degradations || null,
                width: entry.width || null,
                height: entry.height || null
            };
        }
    }
    annotationData = map;
    return map;
}

function describeAnnotationSet(map) {
    const files = Object.keys(map);
    const totalBarcodes = files.reduce((sum, file) => sum + map[file].barcodes.length, 0);
    const withFormat = files.some(file => map[file].barcodes.some(b => b.format));
    const withPoints = files.some(file => map[file].barcodes
        .some(b => Array.isArray(b.points) && b.points.length >= 3));
    const details = [];
    if (withFormat) details.push('symbologies');
    if (withPoints) details.push('boxes');
    return '\u2713 ' + files.length + ' image' + (files.length === 1 ? '' : 's') + ', '
        + totalBarcodes + ' barcode' + (totalBarcodes === 1 ? '' : 's') + ' loaded'
        + (details.length ? ' (' + details.join(' + ') + ' compared)' : '');
}

function importAnnotations(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const statusEl = document.getElementById('annotation_status');
        try {
            const map = applyAnnotationData(JSON.parse(e.target.result));
            statusEl.textContent = describeAnnotationSet(map);
            statusEl.style.color = 'var(--success-color)';
            document.getElementById('annotation_clear_btn').style.display = 'inline-flex';
            setBenchmarkNotice('', null);
        } catch (err) {
            annotationData = null;
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
    setBenchmarkNotice('', null);
}

/* Built as DOM nodes rather than markup: a message can contain a file name from
   an uploaded archive, which is not ours to trust. */
function renderBenchmarkNotice() {
    const el = document.getElementById('benchmark_notice');
    if (!el) return;
    el.textContent = '';
    if (!benchmarkNotice) {
        el.style.display = 'none';
        return;
    }
    el.appendChild(document.createTextNode(benchmarkNotice + ' '));
    if (benchmarkNoticeAction) {
        const link = document.createElement('a');
        link.href = benchmarkNoticeAction.href;
        link.className = 'link';
        link.setAttribute('data-demo-cta', 'generator');
        link.textContent = benchmarkNoticeAction.label;
        el.appendChild(link);
    }
    el.style.display = 'block';
}

/* `action` is { label, href }, always pointing at the barcode generator: that is
   where a dataset with expected values comes from. */
function setBenchmarkNotice(text, action) {
    benchmarkNotice = text || '';
    benchmarkNoticeAction = action || null;
    renderBenchmarkNotice();
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

/* Format names arrive in two spellings: `EnumBarcodeFormat` (QR_CODE,
   DATAMATRIX, EAN_13 — what an annotation file carries) and `formatString`
   (QRCode, DataMatrix, EAN13 — what the reader reports). Strip everything that
   is not alphanumeric and compare upper case. */
function normalizeFormatName(name) {
    return String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/* A few spellings mean the same symbology and would otherwise be reported as a
   disagreement. Kept small and explicit: every entry here was observed by
   round-tripping the barcode generator's output through this reader.
     CODE_39 vs CODE_39_EXTENDED — the reader reports the decoding mode; the
       symbology is Code 39 either way.
     MSI / PHARMACODE — the enum carries the variant, the format string may not.
     UPC_A vs EAN_13 — an EAN-13 whose first digit is 0 is reported as a
       12-digit UPC-A. The text comparison already accepts that pair as the same
       value, so the symbology has to follow, or a correct read would be
       reported as a disagreement.
     AZTEC_CODE / DATA_MATRIX — common alternative spellings. */
const FORMAT_ALIASES = {
    CODE39EXTENDED: 'CODE39',
    MSI: 'MSICODE',
    PHARMACODE: 'PHARMACODEONETRACK',
    PHARMACODETWOTRACK: 'PHARMACODEONETRACK',
    AZTECCODE: 'AZTEC',
    DATAMATRIXCODE: 'DATAMATRIX',
    UPCA: 'EAN13'
};

function canonicalFormatKey(name) {
    const normalized = normalizeFormatName(name);
    return FORMAT_ALIASES[normalized] || normalized;
}

function formatsAgree(a, b) {
    return canonicalFormatKey(a) === canonicalFormatKey(b);
}

/* A detected box counts as overlapping when its intersection over union with
   the annotated box reaches this. Loose on purpose: the annotated quad is the
   symbol plus its quiet zone, while a reader reports the bars, and a rotated
   symbol read axis-aligned loses area. The figure is reported as information —
   a text match is never downgraded because the box disagrees. */
const OVERLAP_THRESHOLD = 0.5;

/* ---- Box overlap (the "Box IoU" column) -------------------------------
   Intersection over union of two quads. This lives here rather than in a
   shared file so the page has no cross-directory script that can fail to
   load and silently cost a column. The generator's dataset mode has its own
   copy for the crop maths; the only thing the two share is the shoelace
   formula, so there is no metric for them to disagree about.

   `hull()` normalises the point order first: a detector may start at any
   corner and wind either way, and an inside test that assumes one winding
   returns an empty intersection for the other — a quiet way to report zero
   overlap for a box that is right. */
function hull(points) {
    var cx = 0, cy = 0;
    for (var i = 0; i < points.length; i++) { cx += points[i][0]; cy += points[i][1]; }
    cx /= points.length; cy /= points.length;
    return points.slice().sort(function (p, q) {
        return Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx);
    });
}

function polygonArea(poly) {
    if (!poly || poly.length < 3) return 0;
    var sum = 0;
    for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length];
        sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
}

function crossPoint(p1, p2, a, b) {
    var d1 = p2[0] - p1[0], d2 = p2[1] - p1[1];
    var e1 = b[0] - a[0], e2 = b[1] - a[1];
    var denom = d1 * e2 - d2 * e1;
    if (Math.abs(denom) < 1e-12) return p1.slice();
    var t = ((a[0] - p1[0]) * e2 - (a[1] - p1[1]) * e1) / denom;
    return [p1[0] + d1 * t, p1[1] + d2 * t];
}

function clipPoly(subject, clip) {
    if (!subject || subject.length < 3 || !clip || clip.length < 3) return [];
    var cx = 0, cy = 0;
    for (var i = 0; i < clip.length; i++) { cx += clip[i][0]; cy += clip[i][1]; }
    cx /= clip.length; cy /= clip.length;

    var out = subject.slice();
    var eps = 1e-9;
    for (var e = 0; e < clip.length && out.length; e++) {
        var a = clip[e], b = clip[(e + 1) % clip.length];
        var ex = b[0] - a[0], ey = b[1] - a[1];
        var side = ex * (cy - a[1]) - ey * (cx - a[0]);
        var input = out;
        out = [];
        for (var j = 0; j < input.length; j++) {
            var cur = input[j];
            var prev = input[(j + input.length - 1) % input.length];
            var curV = ex * (cur[1] - a[1]) - ey * (cur[0] - a[0]);
            var prevV = ex * (prev[1] - a[1]) - ey * (prev[0] - a[0]);
            var curIn = side > 0 ? curV >= -eps : curV <= eps;
            var prevIn = side > 0 ? prevV >= -eps : prevV <= eps;
            if (curIn) {
                if (!prevIn) out.push(crossPoint(prev, cur, a, b));
                out.push(cur);
            } else if (prevIn) {
                out.push(crossPoint(prev, cur, a, b));
            }
        }
    }
    return out;
}

function quadIoU(quadA, quadB) {
    if (!quadA || !quadB || quadA.length < 3 || quadB.length < 3) return 0;
    var a = hull(quadA), b = hull(quadB);
    var interArea = polygonArea(clipPoly(a, b));
    var unionArea = polygonArea(a) + polygonArea(b) - interArea;
    return unionArea > 0 ? interArea / unionArea : 0;
}

/* The annotated points are [[x,y], ...]; the reader reports [{x,y}, ...]. */
function toPairs(points) {
    if (!points || !points.length) return null;
    var out = [];
    for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
        out.push([p.x, p.y]);
    }
    return out.length >= 3 ? out : null;
}

/* Compare what was decoded against the ground truth for one image.
   `detected`: [{ type, text, points }]   `expected`: [{ text, format, points }]
   Text decides correctness. Format agreement and box overlap are reported
   separately and never change the match — a reader that returns the right
   value in an unexpected symbology name still read the barcode. */
function computeGTResult(detectedItems, expectedItems) {
    const matchedExpectedIndices = new Set();
    const matchedDetectedIndices = new Set();
    const pairs = [];

    for (let i = 0; i < expectedItems.length; i++) {
        for (let j = 0; j < detectedItems.length; j++) {
            if (!matchedDetectedIndices.has(j) && matchBarcodeText(detectedItems[j].text, expectedItems[i].text)) {
                matchedExpectedIndices.add(i);
                matchedDetectedIndices.add(j);
                pairs.push({ expected: i, detected: j });
                break;
            }
        }
    }

    let formatMatched = 0, formatChecked = 0;
    let overlapChecked = 0, overlapOk = 0, overlapSum = 0;
    pairs.forEach(function (pair) {
        const detected = detectedItems[pair.detected];
        const expected = expectedItems[pair.expected];

        if (normalizeFormatName(detected.type) && normalizeFormatName(expected.format)) {
            formatChecked++;
            if (formatsAgree(detected.type, expected.format)) formatMatched++;
        }

        const expectedQuad = expected.points && expected.points.length >= 3 ? expected.points : null;
        const detectedQuad = detected.points;
        if (expectedQuad && detectedQuad) {
            const iou = quadIoU(
                toPairs(expectedQuad.map(p => ({ x: p[0], y: p[1] }))),
                toPairs(detectedQuad.map(p => ({ x: p[0], y: p[1] })))
            );
            overlapChecked++;
            overlapSum += iou;
            if (iou >= OVERLAP_THRESHOLD) overlapOk++;
        }
    });

    const tp = matchedExpectedIndices.size;
    const fp = detectedItems.length - matchedDetectedIndices.size;
    const detectionRate = expectedItems.length > 0 ? tp / expectedItems.length : 0;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : (tp > 0 ? 1 : 0);

    return {
        tp,
        fp,
        fn: expectedItems.length - tp,
        total: expectedItems.length,
        detectionRate,
        precision,
        formatMatched,
        formatChecked,
        overlapChecked,
        overlapOk,
        meanOverlap: overlapChecked ? overlapSum / overlapChecked : null,
        // The specific values that were expected and never came back — the
        // actionable half of the report.
        missed: expectedItems
            .filter(function (item, index) { return !matchedExpectedIndices.has(index); })
            .map(function (item) { return item.text; }),
        // Decodes that matched no expected value: spurious reads, or a value the
        // annotation does not know about.
        spurious: detectedItems
            .filter(function (item, index) { return !matchedDetectedIndices.has(index); })
            .map(function (item) { return item.text; }),
        formatMismatches: pairs
            .filter(function (pair) {
                const a = normalizeFormatName(detectedItems[pair.detected].type);
                const b = normalizeFormatName(expectedItems[pair.expected].format);
                return a && b && !formatsAgree(a, b);
            })
            .map(function (pair) {
                return expectedItems[pair.expected].format + ' → ' + detectedItems[pair.detected].type;
            })
    };
}

function gtRateClass(rate) {
    if (rate >= 0.9) return 'gt-good';
    if (rate >= 0.7) return 'gt-ok';
    return 'gt-poor';
}
