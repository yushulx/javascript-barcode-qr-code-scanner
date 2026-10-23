/*
 * Online ISBN Barcode Lookup.
 *
 * Decoding is Dynamsoft Barcode Reader, restricted to EAN-13 — the Bookland
 * symbol every printed ISBN rides on. Everything after the decode is local:
 * the ISBN-13 check digit is verified, ISBN-10 forms are validated with the
 * mod-11 rule (including the X check digit), the two ISBN standards are
 * converted into each other, and the registration group (language or country
 * area) is resolved. The book lookup then queries Open Library, with Google
 * Books as fallback.
 *
 * Works with a live camera, an uploaded / pasted / dropped / bundled image, or
 * an ISBN typed by hand. A bundled sample is decoded automatically on load.
 */

/* ---------------------------------------------------------------------------
   Shared shims. The shared file is optional: if it fails to load (ad blocker,
   offline, opened from a plain folder) the page still works, it just reports
   nothing.
   --------------------------------------------------------------------------- */

var analytics = window.DemoAnalytics || {
    ready: function () { },
    error: function () { },
    start: function () { },
    success: function () { },
    fail: function () { },
    action: function () { },
    trialClick: function () { }
};

/* ---------------------------------------------------------------------------
   License selection

   The hosted demo runs on dynamsoft.com and uses the Codepool license, which is
   bound to that domain. Anywhere else — localhost, a fork, a plain file server —
   that key cannot activate, so fall back to the SDK's public trial key and the
   page still runs instead of showing an activation error.
   --------------------------------------------------------------------------- */

var BOUND_HOSTS = ['dynamsoft.com'];

const CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';

const TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';

function isBoundHost() {
    const host = window.location.hostname.toLowerCase();
    return BOUND_HOSTS.some(function (bound) {
        return host === bound || host.endsWith('.' + bound);
    });
}

function resolveLicenseKey() {
    if (isBoundHost()) return CODEPOOL_LICENSE_KEY;
    console.info('[demo] Using the SDK trial license: the Codepool license is bound to '
        + BOUND_HOSTS.join(', ') + ' and cannot activate on "' + window.location.hostname + '".');
    analytics.action('license_fallback', { host: window.location.hostname });
    return TRIAL_LICENSE_KEY;
}

/* ---------------------------------------------------------------------------
   SDK setup. A hand-written template JSON is accepted by initSettings() but
   rejected later by startCapturing() with [-10038]; reading a preset back,
   changing one field and writing it back cannot produce a document the engine
   disagrees with. BarcodeFormatIds in simplified settings take the numeric
   runtime mask, and those values are BigInt.
   --------------------------------------------------------------------------- */

var PRESET_TEMPLATE = 'ReadBarcodes_Balance';

/* Books print their ISBN as a Bookland EAN-13; there is no separate ISBN
   symbology, and the 5-digit price add-on is not read. */
var BOOK_FORMAT_NAMES = ['BF_EAN_13'];

var cvRouter = null;
var cameraView = null;
var cameraEnhancer = null;
var receiver = null;
var sdkReady = false;
var configured = false;

function bookFormatMask() {
    var table = (window.Dynamsoft && Dynamsoft.DBR && Dynamsoft.DBR.EnumBarcodeFormat) || null;
    if (!table) return null;
    var mask = 0n;
    BOOK_FORMAT_NAMES.forEach(function (name) {
        if (table[name] !== undefined) mask |= table[name];
    });
    return mask || null;
}

async function applySettings() {
    if (!sdkReady || configured) return;
    var settings = await cvRouter.getSimplifiedSettings(PRESET_TEMPLATE);
    var mask = bookFormatMask();
    if (mask !== null) settings.barcodeSettings.barcodeFormatIds = mask;
    await cvRouter.updateSettings(PRESET_TEMPLATE, settings);
    configured = true;
}

/* ---------------------------------------------------------------------------
   State
   --------------------------------------------------------------------------- */

var els = {};
var decodeBusy = false;
var lastPayload = [];

/* Mode: 'upload' is the default (the bundled sample decodes into it); the
   camera is opt-in via the mode switch and streams continuously while active. */
var mode = 'upload';
var cameraStarting = false;

/* The bundled sample decoded automatically on page load. */
var DEFAULT_SAMPLE = { label: 'Clean Code (Prentice Hall)', src: 'sample-images/isbn13-clean-code.png' };

var SAMPLES = [
    DEFAULT_SAMPLE,
    { label: 'Fantastic Mr. Fox (Puffin)', src: 'sample-images/isbn13-fantastic-mr-fox.png' },
    { label: 'Harry Potter (Bloomsbury)', src: 'sample-images/isbn13-harry-potter.png' }
];

/* ---------------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------------- */

async function bootstrap() {
    els.tip = document.getElementById('tip-message');
    els.loading = document.getElementById('loading-overlay');
    els.loadingText = document.getElementById('loading-text');
    els.modeSwitch = document.getElementById('mode-switch-container');
    els.cameraSection = document.getElementById('camera-section');
    els.cameraView = document.getElementById('camera-view');
    els.workbench = document.getElementById('workbench');
    els.uploadZone = document.getElementById('upload-zone');
    els.uploadInput = document.getElementById('upload-input');
    els.sampleRow = document.getElementById('sample-row');
    els.manualForm = document.getElementById('manual-form');
    els.manualInput = document.getElementById('manual-input');
    els.manualButton = document.getElementById('manual-button');
    els.results = document.getElementById('results');
    els.resultsTitle = document.getElementById('results-title');
    els.resultsContent = document.getElementById('results-content');
    els.copyAll = document.getElementById('copy-all-button');

    wireEvents();
    buildSamples();
    updateModeUI();

    var startedAt = now();
    showLoading('Initializing Dynamsoft Barcode Reader…');

    try {
        await Dynamsoft.License.LicenseManager.initLicense(resolveLicenseKey(), true);
        showLoading('Loading the barcode module…');
        await Dynamsoft.Core.CoreModule.loadWasm(['DBR', 'DCE']);
        cvRouter = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        /* Consecutive video frames see the same symbol; without deduplication a
           steady shot would re-render the results panel dozens of times. */
        var filter = new Dynamsoft.Utility.MultiFrameResultCrossFilter();
        filter.enableResultDeduplication('barcode', true);
        await cvRouter.addResultFilter(filter);

        receiver = {
            onDecodedBarcodesReceived: function (result) {
                if (mode !== 'camera' || decodeBusy) return;
                var items = (result && result.barcodeResultItems) || [];
                if (items.length) showResults(items, 'camera');
            }
        };

        sdkReady = true;
        await applySettings();
        analytics.ready(now() - startedAt);
        hideLoading();
        setTip('Drop in a book barcode image, or try a sample below.');

        /* The page always opens with a worked example: the bundled sample is
           decoded and looked up without the visitor clicking anything. */
        scanImageSource(DEFAULT_SAMPLE.src, DEFAULT_SAMPLE.label, 'sample');
    } catch (error) {
        var message = (error && (error.message || error)) || 'Unknown error';
        console.error(error);
        analytics.error('activate_failed', message);
        showLoading('Failed to start the barcode reader: ' + message
            + '\n\nPlease refresh the page and try again.');
    }
}

/* ---------------------------------------------------------------------------
   Camera mode: continuous frames are pushed through the router by the SDK.
   The camera components are created lazily on the first switch, so visitors
   who only ever paste a number never pay for them.
   --------------------------------------------------------------------------- */

async function ensureCamera() {
    if (cameraView) return;
    showLoading('Starting the camera…');
    cameraView = await Dynamsoft.DCE.CameraView.createInstance();
    /* DCE defaults to object-fit "contain", which letterboxes a portrait
       camera stream inside a wide-short viewfinder (a phone held upright
       shows a narrow pillar with black bars). "cover" fills the viewfinder
       and crops the overflow instead; decoding still uses the full frames,
       so this changes only the picture, never what the reader sees. */
    if (typeof cameraView.setVideoFit === 'function') cameraView.setVideoFit('cover');
    cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance(cameraView);
    els.cameraView.replaceChildren(cameraView.getUIElement());
    hideLoading();
}

/* Open the camera, retrying once. Right after a mode switch the previous
   session may still be releasing the device and the SDK then rejects with
   "Error opening camera: Camera closed." */
async function openCamera() {
    try {
        await cameraEnhancer.open();
    } catch (error) {
        console.warn('Camera open failed, retrying once:', error);
        await delay(400);
        await cameraEnhancer.open();
    }
}

async function startCameraMode() {
    if (cameraStarting) return;
    cameraStarting = true;
    try {
        await ensureCamera();
        mode = 'camera';
        updateModeUI();
        els.cameraSection.hidden = false;
        els.workbench.hidden = true;
        els.results.hidden = true;

        await cvRouter.stopCapturing();
        if (cameraEnhancer.isOpen()) await cameraEnhancer.close();
        cameraEnhancer.singleFrameMode = 'disabled';
        await openCamera();
        cvRouter.setInput(cameraEnhancer);
        await applySettings();
        await cvRouter.startCapturing(PRESET_TEMPLATE);
        cvRouter.addResultReceiver(receiver);
        setTip('Point the camera at the barcode on the back cover.');
        analytics.start('camera', 'camera');
    } finally {
        cameraStarting = false;
    }
}

function startUploadMode() {
    mode = 'upload';
    updateModeUI();
    els.cameraSection.hidden = true;
    els.workbench.hidden = false;

    if (cvRouter && receiver) cvRouter.removeResultReceiver(receiver);
    if (cvRouter) cvRouter.stopCapturing();
    if (cameraEnhancer && cameraEnhancer.isOpen()) cameraEnhancer.close();

    setTip('Drop in a book barcode image, or try a sample below.');
    analytics.start('upload', 'upload');
}

async function switchMode(next) {
    if (next === mode || cameraStarting) return;
    if (next === 'upload') {
        startUploadMode();
        return;
    }
    try {
        await startCameraMode();
    } catch (error) {
        console.error(error);
        analytics.action('camera_fallback', {
            reason: String(error && (error.message || error)).slice(0, 120)
        });
        startUploadMode();
        setTip('The camera could not be opened on this device. Upload an image instead.', true);
    }
}

function updateModeUI() {
    els.modeSwitch.dataset.active = mode;
    Array.prototype.forEach.call(els.modeSwitch.querySelectorAll('.mode-option'), function (option) {
        option.classList.toggle('active', option.dataset.mode === mode);
    });
}

/* ---------------------------------------------------------------------------
   Still-image input
   --------------------------------------------------------------------------- */

/* Images wider than this are scaled down before decoding: the barcode stays
   legible and a 12-megapixel phone photo does not cost seconds. */
var MAX_DECODE_WIDTH = 4000;

/* Build the DSImageData shape CaptureVisionRouter.capture() expects: a raw RGBA
   byte buffer straight out of getImageData(), stride 4 x width, format 10
   (IPF_ABGR_8888). This is what the SDK builds internally for its own image
   view. Passing a Blob / HTMLImageElement / canvas instead takes a different
   internal path, and that one silently returns no results. */
function imageToDsImageData(img) {
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    if (width > MAX_DECODE_WIDTH) {
        height = Math.round(height * MAX_DECODE_WIDTH / width);
        width = MAX_DECODE_WIDTH;
    }

    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);

    var pixels = ctx.getImageData(0, 0, width, height);
    return {
        bytes: new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.length),
        width: width,
        height: height,
        stride: 4 * width,
        format: 10 // IPF_ABGR_8888
    };
}

function loadImageElement(src) {
    return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('The image could not be decoded.')); };
        img.src = src;
    });
}

async function decodeImage(src) {
    var img = await loadImageElement(src);
    await applySettings();
    var dsImage = imageToDsImageData(img);
    var result = await cvRouter.capture(dsImage, PRESET_TEMPLATE);
    return {
        items: barcodeItemsFrom(result),
        src: src,
        width: dsImage.width,
        height: dsImage.height
    };
}

async function scanImageSource(src, label, source) {
    if (!sdkReady) {
        setTip('The barcode reader is still starting. Try again in a moment.', true);
        return;
    }
    if (decodeBusy) {
        setTip('Still decoding the previous image — try again in a moment.', true);
        return;
    }

    decodeBusy = true;
    setTip('Reading ' + label + '…');
    try {
        var outcome = await decodeImage(src);
        if (!outcome.items.length) {
            setTip('No book barcode was found in that image. Try a sharper or larger picture '
                + 'of the back cover.', true);
            analytics.fail(source, 'none');
            return;
        }
        await showResults(outcome.items, source, outcome.src, label);
    } catch (error) {
        console.error(error);
        setTip('That image could not be read: ' + ((error && error.message) || error), true);
        analytics.error('image_decode_failed', String((error && error.message) || error).slice(0, 120));
    } finally {
        decodeBusy = false;
    }
}

async function handleImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
        setTip('That file is not an image. Upload a PNG, JPG, BMP or WebP picture of a barcode.', true);
        return;
    }
    analytics.action('image_load', { type: file.type, size: file.size });
    try {
        var src = await readAsDataURL(file);
        await scanImageSource(src, file.name || 'the image', 'upload');
    } catch (error) {
        console.error(error);
        setTip('That file could not be read.', true);
    }
}

function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (event) { resolve(event.target.result); };
        reader.onerror = function () { reject(new Error('The file could not be read.')); };
        reader.readAsDataURL(file);
    });
}

/* The capture() result returns a CapturedResult with barcode items in `items`
   (type 2 = CRIT_BARCODE). */
function barcodeItemsFrom(result) {
    if (!result) return [];

    if (Array.isArray(result.items)) {
        var typed = result.items.filter(function (item) {
            return item && (item.type === 2 || item.type === 'CRIT_BARCODE'
                || typeof item.formatString === 'string');
        });
        if (typed.length) return typed;
    }

    if (result.decodedBarcodesResult
        && Array.isArray(result.decodedBarcodesResult.barcodeResultItems)) {
        return result.decodedBarcodesResult.barcodeResultItems;
    }

    if (Array.isArray(result.barcodeResultItems)) return result.barcodeResultItems;

    return [];
}

/* ---------------------------------------------------------------------------
   ISBN analysis — all local, no network.

   A printed book barcode is a Bookland EAN-13: 978 or 979, followed by the
   ISBN's registration group and registrant, the publication title, and a
   recalculated EAN check digit. ISBN-10 numbers (with their own mod-11 check,
   which may be the letter X) never appear in the barcode, but both directions
   of conversion are computed so the user sees the two standard forms.
   --------------------------------------------------------------------------- */

/* GTIN (EAN-13) check digit: from the right of the data digits the weights
   alternate 3, 1, 3, 1, … */
function gtinCheckDigit(data) {
    var sum = 0;
    for (var i = data.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) {
        sum += (data.charCodeAt(i) - 48) * weight;
    }
    return String((10 - sum % 10) % 10);
}

function verifyGtin(allDigits) {
    return gtinCheckDigit(allDigits.slice(0, -1)) === allDigits.slice(-1);
}

/* ISBN-10 check digit: the nine data digits get weights 10 down to 2, the
   check is (11 - sum % 11) % 11, and 10 is written as the letter X. */
function isbn10CheckDigit(data9) {
    var sum = 0;
    for (var i = 0; i < 9; i++) {
        sum += (data9.charCodeAt(i) - 48) * (10 - i);
    }
    var check = (11 - sum % 11) % 11;
    return check === 10 ? 'X' : String(check);
}

function verifyIsbn10(allTen) {
    var sum = 0;
    for (var i = 0; i < 10; i++) {
        var value = allTen[i] === 'X' || allTen[i] === 'x' ? 10 : allTen.charCodeAt(i) - 48;
        if (value < 0 || value > 10) return false;
        sum += value * (10 - i);
    }
    return sum % 11 === 0;
}

/* ISBN-10 → ISBN-13: prepend 978, drop the old check digit, recompute. */
function isbn10To13(isbn10) {
    var core = '978' + isbn10.slice(0, 9);
    return core + gtinCheckDigit(core);
}

/* ISBN-13 (978 block) → ISBN-10: drop the 978 prefix and the EAN check,
   recompute the mod-11 check. Only defined for the 978 block. */
function isbn13To10(isbn13) {
    var core9 = isbn13.slice(3, 12);
    return core9 + isbn10CheckDigit(core9);
}

/* Registration group: the digits right after 978/979 name the language or
   country area whose agency issued the ISBN. Simplified table — a real
   registry splits these ranges much finer by registrant length. */
var ISBN_GROUPS = [
    ['0', 'English-speaking area'],
    ['1', 'English-speaking area'],
    ['2', 'French-speaking area'],
    ['3', 'German-speaking area'],
    ['4', 'Japan'],
    ['5', 'Russia & former USSR'],
    ['7', 'China'],
    ['80', 'Czechia & Slovakia'],
    ['81', 'India'],
    ['82', 'Norway'],
    ['83', 'Poland'],
    ['84', 'Spain'],
    ['85', 'Brazil'],
    ['86', 'Serbia'],
    ['87', 'Denmark'],
    ['88', 'Italy'],
    ['89', 'South Korea'],
    ['90', 'Netherlands & Benelux'],
    ['91', 'Sweden'],
    ['92', 'International organizations'],
    ['93', 'India'],
    ['94', 'Netherlands']
];

function isbnRegistrationGroup(isbn13) {
    var rest = isbn13.slice(3);
    /* Two-digit groups first, then single-digit. */
    for (var i = 0; i < ISBN_GROUPS.length; i++) {
        if (rest.indexOf(ISBN_GROUPS[i][0]) === 0) return ISBN_GROUPS[i][1];
    }
    return null;
}

/* Turn any accepted input into a structured analysis:
   { ok, format, raw, isbn13, isbn10, checkVerified, group, notBook,
     lookupCodes, notes[], errors[] } */
function analyzeNumber(rawInput, forcedFormat) {
    var analysis = {
        ok: false,
        format: forcedFormat || 'Unknown',
        raw: rawInput,
        isbn13: null,
        isbn10: null,
        checkVerified: null,
        group: null,
        notBook: false,
        lookupCodes: [],
        notes: [],
        errors: []
    };

    var cleaned = rawInput.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (!cleaned.length) {
        analysis.errors.push('No digits found in the input.');
        return analysis;
    }

    /* A trailing X only makes sense as the ISBN-10 check digit. */
    var hasX = cleaned.slice(-1) === 'X';
    var digits = hasX ? cleaned.slice(0, -1) : cleaned;

    if (hasX && digits.length === 9) {
        /* ISBN-10 typed with its X check digit. */
        var isbn10 = digits + 'X';
        analysis.format = 'ISBN-10';
        analysis.checkVerified = verifyIsbn10(isbn10);
        if (!analysis.checkVerified) {
            analysis.errors.push('The ISBN-10 check digit does not match — expected '
                + isbn10CheckDigit(digits) + ', got X.');
            return analysis;
        }
        analysis.isbn10 = isbn10;
        analysis.isbn13 = isbn10To13(isbn10);
        analysis.lookupCodes = [analysis.isbn13, isbn10];
        analysis.notes.push('Converted to the ISBN-13 form printed on the book: '
            + analysis.isbn13 + '.');
        finishBook(analysis);
        return analysis;
    }

    if (!/^\d+$/.test(digits)) {
        analysis.errors.push('Only digits are allowed (the letter X may appear once, as the '
            + 'ISBN-10 check digit).');
        return analysis;
    }

    if (digits.length === 10) {
        var ten = digits;
        analysis.format = 'ISBN-10';
        analysis.checkVerified = verifyIsbn10(ten);
        if (!analysis.checkVerified) {
            analysis.errors.push('The ISBN-10 check digit does not match — expected '
                + isbn10CheckDigit(ten.slice(0, 9)) + ', got ' + ten.slice(-1) + '.');
            return analysis;
        }
        analysis.isbn10 = ten;
        analysis.isbn13 = isbn10To13(ten);
        analysis.lookupCodes = [analysis.isbn13, ten];
        analysis.notes.push('Converted to the ISBN-13 form printed on the book: '
            + analysis.isbn13 + '.');
        finishBook(analysis);
        return analysis;
    }

    if (digits.length === 13) {
        analysis.format = 'ISBN-13';
        analysis.checkVerified = verifyGtin(digits);
        if (!analysis.checkVerified) {
            analysis.errors.push('The ISBN-13 check digit does not match — expected '
                + gtinCheckDigit(digits.slice(0, 12)) + ', got ' + digits.slice(-1) + '.');
            return analysis;
        }
        if (digits.slice(0, 3) === '978') {
            analysis.isbn13 = digits;
            analysis.isbn10 = isbn13To10(digits);
            analysis.lookupCodes = [digits, analysis.isbn10];
            analysis.notes.push('Equivalent ISBN-10 form: ' + analysis.isbn10 + '.');
            finishBook(analysis);
            return analysis;
        }
        if (digits.slice(0, 3) === '979') {
            analysis.isbn13 = digits;
            analysis.lookupCodes = [digits];
            analysis.notes.push('The 979 block is ISBN-13-only: these numbers have no ISBN-10 '
                + 'equivalent.');
            finishBook(analysis);
            return analysis;
        }
        /* A valid EAN-13 that is not a book number. */
        analysis.notBook = true;
        analysis.notes.push('This is a valid EAN-13 product code, but it does not start with '
            + '978 or 979, so it is not a book ISBN. General product codes are looked up by '
            + 'the UPC barcode lookup demo.');
        return analysis;
    }

    analysis.errors.push('Expected 10 or 13 digits — got '
        + (digits.length + (hasX ? 1 : 0)) + '.');
    return analysis;
}

/* Shared tail of every book-shaped analysis. */
function finishBook(analysis) {
    analysis.ok = true;
    analysis.group = isbnRegistrationGroup(analysis.isbn13);
}

/* ---------------------------------------------------------------------------
   Book lookup — Open Library (Internet Archive) first: an open catalog whose
   /isbn/ endpoint sends CORS headers through its redirect chain. Author names
   need one extra request per author, capped at two. Google Books is the
   fallback: a single call with richer metadata, subject to Google's anonymous
   per-IP quota.
   --------------------------------------------------------------------------- */

var LOOKUP_TIMEOUT_MS = 10000;

async function fetchJson(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, LOOKUP_TIMEOUT_MS);
    try {
        var response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function lookupOpenLibrary(code) {
    var book = await fetchJson('https://openlibrary.org/isbn/' + encodeURIComponent(code) + '.json');
    if (!book || !book.title) return null;

    var authors = [];
    var authorKeys = (book.authors || []).slice(0, 2);
    for (var i = 0; i < authorKeys.length; i++) {
        try {
            var author = await fetchJson('https://openlibrary.org' + authorKeys[i].key + '.json');
            if (author && author.name) authors.push(author.name);
        } catch (error) { /* author name is optional decoration */ }
    }

    var coverId = (book.covers || []).find(function (id) { return id > 0; });
    return {
        source: 'Open Library',
        pageUrl: 'https://openlibrary.org/isbn/' + encodeURIComponent(code),
        title: book.title,
        subtitle: book.subtitle || null,
        authors: authors,
        publisher: (book.publishers || [])[0] || null,
        published: book.publish_date || null,
        pages: book.number_of_pages || null,
        cover: coverId
            ? 'https://covers.openlibrary.org/b/id/' + coverId + '-M.jpg'
            : 'https://covers.openlibrary.org/b/isbn/' + encodeURIComponent(code) + '-M.jpg'
    };
}

async function lookupGoogleBooks(code) {
    var data = await fetchJson('https://www.googleapis.com/books/v1/volumes?q=isbn:'
        + encodeURIComponent(code));
    var volume = data && data.items && data.items[0] && data.items[0].volumeInfo;
    if (!volume) return null;

    var links = volume.imageLinks || {};
    var cover = links.thumbnail || links.smallThumbnail || null;
    if (cover) cover = cover.replace(/^http:\/\//, 'https://');
    return {
        source: 'Google Books',
        pageUrl: volume.infoLink || ('https://books.google.com/books?isbn=' + encodeURIComponent(code)),
        title: volume.title,
        subtitle: volume.subtitle || null,
        authors: (volume.authors || []).slice(0, 2),
        publisher: volume.publisher || null,
        published: volume.publishedDate || null,
        pages: volume.pageCount || null,
        cover: cover
    };
}

var LOOKUP_SOURCES = [lookupOpenLibrary, lookupGoogleBooks];

async function lookupBook(analysis) {
    for (var s = 0; s < LOOKUP_SOURCES.length; s++) {
        for (var c = 0; c < analysis.lookupCodes.length; c++) {
            try {
                var found = await LOOKUP_SOURCES[s](analysis.lookupCodes[c]);
                if (found) return found;
            } catch (error) {
                console.warn('Lookup failed at source ' + s + ':', error);
            }
        }
    }
    return null;
}

/* ---------------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------------- */

function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
}

/* One render at a time: in camera mode the receiver can fire again while the
   previous lookups are still in flight, and interleaved renders would race on
   els.resultsContent. A superseded batch simply waits for the current one. */
var renderBusy = false;

async function showResults(items, source, imageSrc, imageLabel) {
    if (renderBusy) return;
    renderBusy = true;
    try {
        await renderResults(items, source, imageSrc, imageLabel);
    } finally {
        renderBusy = false;
    }
}

async function renderResults(items, source, imageSrc, imageLabel) {
    els.resultsContent.replaceChildren();
    lastPayload = [];

    var cards = [];
    for (var i = 0; i < items.length; i++) {
        var rawText = items[i].text == null ? '' : String(items[i].text);
        var format = items[i].formatString || null;
        var analysis = analyzeNumber(rawText, format);
        if (analysis.lookupCodes.length) {
            setTip('Looking up ' + analysis.isbn13 + '…');
            analysis.lookup = await lookupBook(analysis);
        }
        cards.push(analysis);
    }

    lastPayload = cards.map(function (analysis) {
        return {
            format: analysis.format,
            raw: analysis.raw,
            isbn13: analysis.isbn13,
            isbn10: analysis.isbn10,
            checkDigit: analysis.checkVerified === true ? 'verified'
                : (analysis.checkVerified === false ? 'failed' : null),
            group: analysis.group,
            notBook: analysis.notBook || null,
            book: analysis.lookup ? {
                source: analysis.lookup.source,
                title: analysis.lookup.title,
                authors: analysis.lookup.authors,
                publisher: analysis.lookup.publisher
            } : null,
            notes: analysis.notes,
            errors: analysis.errors
        };
    });

    if (imageSrc) {
        var preview = node('figure', 'source-preview');
        var previewImg = document.createElement('img');
        previewImg.src = imageSrc;
        previewImg.alt = 'The image that was scanned';
        preview.appendChild(previewImg);
        preview.appendChild(node('figcaption', null,
            imageLabel + ' — ' + cards.length
            + (cards.length === 1 ? ' barcode found' : ' barcodes found')));
        els.resultsContent.appendChild(preview);
    }

    els.resultsTitle.textContent = source === 'manual'
        ? 'Lookup result'
        : (cards.length === 1 ? '1 barcode found' : cards.length + ' barcodes found');

    cards.forEach(function (analysis) {
        els.resultsContent.appendChild(buildCard(analysis));
    });

    els.results.hidden = false;
    els.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var found = cards.filter(function (a) { return a.lookup; }).length;
    analytics.success(source, 'lookup', {
        count: cards.length,
        books_found: found,
        format: cards[0].format
    });

    if (found === cards.length) {
        setTip('Scanned and looked up. Drop another image any time.');
    } else {
        setTip('Decoded. Some numbers may be missing from the open databases — see the notes below.', found < 1);
    }
}

function buildCard(analysis) {
    var card = node('article', 'barcode-card');

    /* --- header --------------------------------------------------------- */
    var header = node('div', 'barcode-card-header');
    header.appendChild(node('span', 'format-chip', analysis.format.replace('_', '-')));
    if (analysis.checkVerified === true) {
        header.appendChild(node('span', 'tag-ok', 'check digit verified'));
    } else if (analysis.checkVerified === false) {
        header.appendChild(node('span', 'tag-bad', 'check digit failed'));
    }
    card.appendChild(header);

    if (analysis.errors.length) {
        card.appendChild(noteList(analysis.errors, 'error'));
    }

    /* --- book panel ------------------------------------------------------- */
    var lookup = analysis.lookup;
    if (lookup) {
        var product = node('div', 'product-panel');
        if (lookup.cover) {
            var img = document.createElement('img');
            img.className = 'product-image';
            img.src = lookup.cover;
            img.alt = lookup.title || 'Book cover';
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', function () { img.style.display = 'none'; });
            product.appendChild(img);
        }

        var body = node('div', 'product-body');
        var name = lookup.title;
        if (name) body.appendChild(node('h2', 'product-name', name));
        if (lookup.subtitle) body.appendChild(node('p', 'product-subtitle', lookup.subtitle));
        if (lookup.authors && lookup.authors.length) {
            body.appendChild(factLine('Authors', lookup.authors.join(', ')));
        }
        if (lookup.publisher) body.appendChild(factLine('Publisher', lookup.publisher));
        if (lookup.published) body.appendChild(factLine('Published', lookup.published));
        if (lookup.pages) body.appendChild(factLine('Pages', String(lookup.pages)));
        var pageLink = document.createElement('a');
        pageLink.href = lookup.pageUrl;
        pageLink.target = '_blank';
        pageLink.rel = 'noopener noreferrer';
        pageLink.textContent = 'View on ' + lookup.source + ' →';
        body.appendChild(pageLink);
        product.appendChild(body);
        card.appendChild(product);

        card.appendChild(node('p', 'card-note', 'Book data from ' + lookup.source
            + ' — an open, crowd-sourced catalog, so details can be missing or outdated.'));
    } else if (analysis.notBook) {
        var notBook = node('div', 'product-panel is-empty');
        notBook.appendChild(node('p', 'card-note',
            'This barcode is not a book ISBN. It is a general product code — the UPC barcode '
            + 'lookup demo resolves numbers like this.'));
        var upcLink = document.createElement('a');
        upcLink.href = '../upc-barcode-lookup/';
        upcLink.textContent = 'Open the UPC barcode lookup →';
        notBook.appendChild(upcLink);
        card.appendChild(notBook);
    } else if (analysis.ok) {
        var empty = node('div', 'product-panel is-empty');
        empty.appendChild(node('p', 'card-note',
            'This ISBN is valid, but no book was found in Open Library or Google Books. Both '
            + 'catalogs are crowd-sourced: self-published, regional and out-of-commerce titles '
            + 'are often absent.'));
        card.appendChild(empty);
    }

    /* --- facts ------------------------------------------------------------ */
    var facts = node('dl', 'facts');
    addFact(facts, 'Barcode number', analysis.raw, true);
    if (analysis.isbn13 && analysis.isbn13 !== analysis.raw) {
        addFact(facts, 'ISBN-13', analysis.isbn13, true);
    }
    if (analysis.isbn10) {
        addFact(facts, 'ISBN-10', analysis.isbn10, true);
    }
    if (analysis.group) {
        addFact(facts, 'Registration group', analysis.group);
    }
    card.appendChild(facts);

    if (analysis.notes.length) card.appendChild(noteList(analysis.notes, 'warn'));

    return card;
}

function factLine(label, value) {
    var line = node('p', 'product-fact');
    line.appendChild(node('span', 'product-fact-label', label + ' '));
    line.appendChild(node('span', null, value));
    return line;
}

function addFact(list, label, value, mono) {
    list.appendChild(node('dt', null, label));
    var dd = node('dd', mono ? 'mono' : null);
    dd.textContent = value;
    list.appendChild(dd);
}

function noteList(messages, kind) {
    var box = node('ul', 'note-list is-' + kind);
    messages.forEach(function (message) {
        box.appendChild(node('li', null, message));
    });
    return box;
}

/* ---------------------------------------------------------------------------
   Manual entry — same validation and lookup pipeline as a scan.
   --------------------------------------------------------------------------- */

async function handleManualSubmit(event) {
    event.preventDefault();
    if (renderBusy) {
        setTip('Still rendering the previous result — try again in a moment.', true);
        return;
    }
    if (decodeBusy) {
        setTip('Still decoding the previous image — try again in a moment.', true);
        return;
    }

    var value = els.manualInput.value.trim();
    if (!value) {
        setTip('Type an ISBN first — 10 or 13 digits.', true);
        return;
    }

    decodeBusy = true;
    try {
        var analysis = analyzeNumber(value, null);
        if (analysis.errors.length && !analysis.lookupCodes.length) {
            els.results.hidden = true;
            setTip(analysis.errors[0], true);
            analytics.fail('manual', 'invalid');
            return;
        }
        if (analysis.notBook) {
            els.results.hidden = false;
            els.resultsContent.replaceChildren(buildCard(analysis));
            els.resultsTitle.textContent = 'Lookup result';
            lastPayload = [{ format: analysis.format, raw: analysis.raw, notBook: true, notes: analysis.notes, errors: analysis.errors }];
            setTip('Valid EAN-13, but not a book ISBN.', true);
            analytics.fail('manual', 'not-book');
            return;
        }

        setTip('Looking up ' + analysis.isbn13 + '…');
        analysis.lookup = await lookupBook(analysis);

        els.resultsContent.replaceChildren();
        lastPayload = [];
        els.resultsTitle.textContent = 'Lookup result';
        els.resultsContent.appendChild(buildCard(analysis));
        lastPayload = [{
            format: analysis.format,
            raw: analysis.raw,
            isbn13: analysis.isbn13,
            isbn10: analysis.isbn10,
            checkDigit: analysis.checkVerified === true ? 'verified'
                : (analysis.checkVerified === false ? 'failed' : null),
            group: analysis.group,
            book: analysis.lookup ? {
                source: analysis.lookup.source,
                title: analysis.lookup.title,
                authors: analysis.lookup.authors,
                publisher: analysis.lookup.publisher
            } : null,
            notes: analysis.notes,
            errors: analysis.errors
        }];

        els.results.hidden = false;
        els.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        analytics.success('manual', 'lookup', {
            count: 1,
            books_found: analysis.lookup ? 1 : 0,
            format: analysis.format
        });

        setTip(analysis.lookup
            ? 'Found it. Type another ISBN any time.'
            : 'Valid ISBN, but no book found in the open catalogs.', !!analysis.lookup);
    } catch (error) {
        console.error(error);
        setTip('The lookup failed: ' + ((error && error.message) || error), true);
        analytics.error('manual_lookup_failed', String((error && error.message) || error).slice(0, 120));
    } finally {
        decodeBusy = false;
    }
}

/* ---------------------------------------------------------------------------
   UI plumbing
   --------------------------------------------------------------------------- */

function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
}

function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function showLoading(message) {
    if (els.loadingText) els.loadingText.textContent = message;
    if (els.loading) els.loading.classList.remove('hidden');
}

function hideLoading() {
    if (els.loading) els.loading.classList.add('hidden');
}

function setTip(message, isError) {
    if (!els.tip) return;
    els.tip.textContent = message;
    els.tip.classList.toggle('is-error', !!isError);
}

function buildSamples() {
    SAMPLES.forEach(function (sample) {
        var button = node('button', 'sample-chip', sample.label);
        button.type = 'button';
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            analytics.action('sample_load', { sample: sample.label });
            scanImageSource(sample.src, sample.label, 'sample');
        });
        els.sampleRow.appendChild(button);
    });
}

function wireEvents() {
    Array.prototype.forEach.call(els.modeSwitch.querySelectorAll('.mode-option'), function (option) {
        option.addEventListener('click', function () { switchMode(option.dataset.mode); });
    });

    els.uploadZone.addEventListener('click', function () { els.uploadInput.click(); });
    els.uploadZone.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            els.uploadInput.click();
        }
    });

    els.uploadInput.addEventListener('change', function () {
        if (els.uploadInput.files && els.uploadInput.files[0]) {
            handleImageFile(els.uploadInput.files[0]);
        }
        els.uploadInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (type) {
        els.uploadZone.addEventListener(type, function (event) {
            event.preventDefault();
            els.uploadZone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (type) {
        els.uploadZone.addEventListener(type, function (event) {
            event.preventDefault();
            els.uploadZone.classList.remove('dragover');
        });
    });
    els.uploadZone.addEventListener('drop', function (event) {
        var files = event.dataTransfer && event.dataTransfer.files;
        if (files && files[0]) handleImageFile(files[0]);
    });

    document.addEventListener('paste', function (event) {
        var items = (event.clipboardData && event.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
                handleImageFile(items[i].getAsFile());
                return;
            }
        }
    });

    els.manualForm.addEventListener('submit', handleManualSubmit);
    els.copyAll.addEventListener('click', copyResults);
}

function copyResults() {
    if (!lastPayload.length) return;

    var text = JSON.stringify(lastPayload, null, 2);
    var button = els.copyAll;
    var reset = button.textContent;
    function flash(message) {
        button.textContent = message;
        setTimeout(function () { button.textContent = reset; }, 1600);
    }

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        flash('Copy not supported');
        return;
    }
    navigator.clipboard.writeText(text).then(function () {
        analytics.action('copy_json', { count: lastPayload.length });
        flash('Copied');
    }, function () {
        flash('Copy blocked');
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
