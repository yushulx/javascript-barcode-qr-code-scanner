/*
 * Online UPC Barcode Lookup.
 *
 * Decoding is Dynamsoft Barcode Reader, restricted to the four retail
 * symbologies: UPC-A, UPC-E, EAN-13 and EAN-8. Everything after the decode is
 * local: the check digit is verified here, UPC-E is expanded back to UPC-A
 * with the GS1 zero-compression rules, and the GS1 prefix is resolved to a
 * country or region. The product lookup then queries two open databases,
 * Open Food Facts and Open Products Facts, whose v2 APIs are CORS-open.
 *
 * Works with an uploaded / pasted / dropped / bundled image, or a number
 * typed by hand. A bundled sample is decoded automatically on page load.
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

var RETAIL_FORMAT_NAMES = ['BF_EAN_13', 'BF_EAN_8', 'BF_UPC_A', 'BF_UPC_E'];

var cvRouter = null;
var cameraView = null;
var cameraEnhancer = null;
var receiver = null;
var sdkReady = false;
var configured = false;

function retailFormatMask() {
    var table = (window.Dynamsoft && Dynamsoft.DBR && Dynamsoft.DBR.EnumBarcodeFormat) || null;
    if (!table) return null;
    var mask = 0n;
    RETAIL_FORMAT_NAMES.forEach(function (name) {
        if (table[name] !== undefined) mask |= table[name];
    });
    return mask || null;
}

async function applySettings() {
    if (!sdkReady || configured) return;
    var settings = await cvRouter.getSimplifiedSettings(PRESET_TEMPLATE);
    var mask = retailFormatMask();
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
var DEFAULT_SAMPLE = { label: 'Nutella (EAN-13)', src: 'sample-images/ean13-nutella.png' };

var SAMPLES = [
    DEFAULT_SAMPLE,
    { label: 'Cheerios (UPC-A)', src: 'sample-images/upca-cheerios.png' },
    { label: 'Coca-Cola (EAN-13)', src: 'sample-images/ean13-coca-cola.png' }
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
        setTip('Drop in a barcode image, or try a sample below.');

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
        setTip('Point the camera at a UPC or EAN barcode.');
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

    setTip('Drop in a barcode image, or try a sample below.');
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
            setTip('No UPC or EAN barcode was found in that image. Try a sharper or larger picture.', true);
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
   Barcode analysis — all local, no network.

   Everything funnels into a GTIN-13: UPC-A prepends a zero, UPC-E expands to
   UPC-A first, EAN-8 pads. The GTIN-13 is what the product databases key on.
   --------------------------------------------------------------------------- */

/* GTIN (EAN/UPC) check digit: from the right of the data digits the weights
   alternate 3, 1, 3, 1, … */
function gtinCheckDigit(data) {
    var sum = 0;
    for (var i = data.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) {
        sum += (data.charCodeAt(i) - 48) * weight;
    }
    return String((10 - sum % 10) % 10);
}

function verifyCheckDigit(allDigits) {
    return gtinCheckDigit(allDigits.slice(0, -1)) === allDigits.slice(-1);
}

/* UPC-E → UPC-A, the GS1 zero-compression rules. `digits` is the six UPC-E
   digits X1..X6 that follow the number-system digit; `ns` is 0 or 1.
   Verified against the published table: 654321 (NS 0) → 06510000432. */
function expandUpcE(digits, ns) {
    var d1 = digits[0], d2 = digits[1], d3 = digits[2],
        d4 = digits[3], d5 = digits[4], d6 = digits[5];
    switch (d6) {
        case '0': return ns + d1 + d2 + '00000' + d3 + d4 + d5;
        case '1': return ns + d1 + d2 + '10000' + d3 + d4 + d5;
        case '2': return ns + d1 + d2 + '20000' + d3 + d4 + d5;
        case '3': return ns + d1 + d2 + d3 + '00000' + d4 + d5;
        case '4': return ns + d1 + d2 + d3 + d4 + '00000' + d5;
        default: return ns + d1 + d2 + d3 + d4 + d5 + '0000' + d6; // 5..9
    }
}

/* GS1 prefix ranges (first three digits of a GTIN-13) to country or region.
   Ranges that GS1 assigns in sub-blocks are collapsed to the common label;
   restricted ranges mean the number is managed by a retailer, not GS1. */
var GS1_PREFIX_RANGES = [
    [0, 19, 'United States & Canada (UPC origins)'],
    [20, 29, 'Restricted distribution (in-store use)'],
    [30, 39, 'United States (drugs, NDC)'],
    [40, 49, 'Restricted distribution (in-store use)'],
    [50, 59, 'Coupons'],
    [60, 139, 'United States & Canada'],
    [200, 299, 'Restricted distribution (in-store use)'],
    [300, 379, 'France & Monaco'],
    [380, 380, 'Bulgaria'],
    [383, 383, 'Slovenia'],
    [385, 385, 'Croatia'],
    [387, 387, 'Bosnia-Herzegovina'],
    [389, 389, 'Montenegro'],
    [400, 440, 'Germany'],
    [450, 459, 'Japan'],
    [460, 469, 'Russia'],
    [470, 470, 'Kyrgyzstan'],
    [471, 471, 'Taiwan, China'],
    [474, 474, 'Estonia'],
    [475, 475, 'Latvia'],
    [476, 476, 'Azerbaijan'],
    [477, 477, 'Lithuania'],
    [478, 478, 'Uzbekistan'],
    [479, 479, 'Sri Lanka'],
    [480, 480, 'Philippines'],
    [481, 481, 'Belarus'],
    [482, 482, 'Ukraine'],
    [483, 483, 'Turkmenistan'],
    [484, 484, 'Moldova'],
    [485, 485, 'Armenia'],
    [486, 486, 'Georgia'],
    [487, 487, 'Kazakhstan'],
    [488, 488, 'Tajikistan'],
    [489, 489, 'Hong Kong, China'],
    [490, 499, 'Japan'],
    [500, 509, 'United Kingdom'],
    [520, 521, 'Greece'],
    [528, 528, 'Lebanon'],
    [529, 529, 'Cyprus'],
    [530, 530, 'Albania'],
    [531, 531, 'North Macedonia'],
    [535, 535, 'Malta'],
    [539, 539, 'Ireland'],
    [540, 549, 'Belgium & Luxembourg'],
    [560, 560, 'Portugal'],
    [569, 569, 'Iceland'],
    [570, 579, 'Denmark, Faroe Islands & Greenland'],
    [590, 590, 'Poland'],
    [594, 594, 'Romania'],
    [599, 599, 'Hungary'],
    [600, 601, 'South Africa'],
    [603, 603, 'Ghana'],
    [608, 608, 'Bahrain'],
    [609, 609, 'Mauritius'],
    [611, 611, 'Morocco'],
    [613, 613, 'Algeria'],
    [615, 615, 'Nigeria'],
    [616, 616, 'Kenya'],
    [617, 617, 'Cameroon'],
    [618, 618, 'Côte d’Ivoire'],
    [619, 619, 'Tunisia'],
    [620, 620, 'Tanzania'],
    [621, 621, 'Syria'],
    [622, 622, 'Egypt'],
    [623, 623, 'Brunei'],
    [624, 624, 'Libya'],
    [625, 625, 'Jordan'],
    [626, 626, 'Iran'],
    [627, 627, 'Kuwait'],
    [628, 628, 'Saudi Arabia'],
    [629, 629, 'United Arab Emirates'],
    [640, 649, 'Finland'],
    [690, 699, 'China'],
    [700, 709, 'Norway'],
    [729, 729, 'Israel'],
    [730, 739, 'Sweden'],
    [740, 745, 'Central America'],
    [746, 746, 'Dominican Republic'],
    [750, 750, 'Mexico'],
    [754, 755, 'Canada'],
    [759, 759, 'Venezuela'],
    [760, 769, 'Switzerland & Liechtenstein'],
    [770, 771, 'Colombia'],
    [773, 773, 'Uruguay'],
    [775, 775, 'Peru'],
    [777, 777, 'Bolivia'],
    [778, 779, 'Argentina'],
    [780, 780, 'Chile'],
    [784, 784, 'Paraguay'],
    [786, 786, 'Ecuador'],
    [789, 790, 'Brazil'],
    [800, 839, 'Italy, San Marino & Vatican City'],
    [840, 849, 'Spain & Andorra'],
    [850, 850, 'Cuba'],
    [858, 858, 'Slovakia'],
    [859, 859, 'Czechia'],
    [860, 860, 'Serbia'],
    [865, 865, 'Mongolia'],
    [867, 867, 'North Korea'],
    [868, 869, 'Turkey'],
    [870, 879, 'Netherlands'],
    [880, 880, 'South Korea'],
    [883, 883, 'Myanmar'],
    [884, 884, 'Cambodia'],
    [885, 885, 'Thailand'],
    [888, 888, 'Singapore'],
    [890, 890, 'India'],
    [893, 893, 'Vietnam'],
    [896, 896, 'Pakistan'],
    [899, 899, 'Indonesia'],
    [900, 919, 'Austria'],
    [930, 939, 'Australia'],
    [940, 949, 'New Zealand'],
    [950, 950, 'GS1 Global Office'],
    [955, 955, 'Malaysia'],
    [958, 958, 'Macau, China'],
    [977, 977, 'ISSN — serial publications'],
    [978, 979, 'ISBN — books (Bookland)'],
    [980, 980, 'Refund receipts'],
    [981, 984, 'Coupons'],
    [990, 999, 'Coupons']
];

function gs1PrefixRegion(gtin13) {
    var prefix = parseInt(gtin13.slice(0, 3), 10);
    for (var i = 0; i < GS1_PREFIX_RANGES.length; i++) {
        var range = GS1_PREFIX_RANGES[i];
        if (prefix >= range[0] && prefix <= range[1]) return range[2];
    }
    return null;
}

/* Turn any accepted input into a structured analysis:
   { ok, format, raw, gtin13, expansion, checkVerified, region, lookupCodes,
     notes[], errors[] } */
function analyzeNumber(rawInput, forcedFormat) {
    var analysis = {
        ok: false,
        format: forcedFormat || 'Unknown',
        raw: rawInput,
        gtin13: null,
        expansion: null,
        checkVerified: null,
        region: null,
        lookupCodes: [],
        notes: [],
        errors: []
    };

    var digits = rawInput.replace(/\D/g, '');
    if (!digits.length) {
        analysis.errors.push('No digits found in the input.');
        return analysis;
    }

    var len = digits.length;

    /* --- UPC-E -------------------------------------------------------------
       The decoder returns the six compressed digits, or the same six plus the
       number-system digit and/or the encoded check digit. A hand-typed 6- or
       7-digit number is treated as UPC-E too. */
    var asUpcE = forcedFormat === 'UPC_E' && len >= 6 && len <= 8;
    if (!asUpcE && !forcedFormat && (len === 6 || len === 7)) asUpcE = true;

    if (asUpcE) {
        var ns = '0';
        var core = digits;
        var statedCheck = null;
        if (len === 7) { ns = digits[0]; core = digits.slice(1); }
        else if (len === 8) { ns = digits[0]; core = digits.slice(1, 7); statedCheck = digits[7]; }
        if (!/^[01]$/.test(ns)) {
            analysis.errors.push('UPC-E number system digit must be 0 or 1, got "' + ns + '".');
            return analysis;
        }
        var expanded = expandUpcE(core, ns);
        var expandedFull = expanded + gtinCheckDigit(expanded);
        analysis.format = 'UPC_E';
        analysis.expansion = expandedFull;
        analysis.checkVerified = statedCheck === null ? null : statedCheck === expandedFull.slice(-1);
        if (statedCheck !== null && statedCheck !== expandedFull.slice(-1)) {
            analysis.errors.push('The UPC-E check digit does not match the expansion (expected '
                + expandedFull.slice(-1) + ').');
        }
        analysis.gtin13 = '0' + expandedFull;
        analysis.notes.push('UPC-E is a zero-compressed UPC-A. Expanded with the GS1 rules, '
            + ns + ' ' + core + ' becomes the UPC-A ' + expandedFull + '.');
    } else if (len === 8) {
        /* An 8-digit number is usually an EAN-8; if the EAN-8 check digit
           fails, try reading it as a full UPC-E before giving up. */
        if (verifyCheckDigit(digits)) {
            analysis.format = 'EAN_8';
            analysis.checkVerified = true;
            analysis.gtin13 = '000000' + digits;
            analysis.notes.push('EAN-8: product databases index the compact 8-digit code '
                + 'under the number itself, and its GTIN-13 form is ' + analysis.gtin13 + '.');
            analysis.lookupCodes = [digits, analysis.gtin13];
            analysis.region = gs1PrefixRegion(digits);
            analysis.ok = true;
            applyPrefixNotes(analysis);
            return analysis;
        }
        if (/^[01]/.test(digits)) {
            var viaUpcE = analyzeNumber(digits, 'UPC_E');
            if (viaUpcE.checkVerified !== false) return viaUpcE;
        }
        analysis.format = 'EAN_8';
        analysis.checkVerified = false;
        analysis.errors.push('The EAN-8 check digit does not match — please re-check the number.');
        return analysis;
    } else if (len === 12 || forcedFormat === 'UPC_A') {
        analysis.format = 'UPC_A';
        analysis.checkVerified = verifyCheckDigit(digits);
        if (!analysis.checkVerified) {
            analysis.errors.push('The UPC-A check digit does not match — please re-check the number.');
        }
        analysis.gtin13 = '0' + digits;
    } else if (len === 13) {
        analysis.format = 'EAN_13';
        analysis.checkVerified = verifyCheckDigit(digits);
        if (!analysis.checkVerified) {
            analysis.errors.push('The EAN-13 check digit does not match — please re-check the number.');
        }
        analysis.gtin13 = digits;
    } else if (len === 14) {
        analysis.format = 'GTIN_14';
        analysis.checkVerified = verifyCheckDigit(digits);
        if (!analysis.checkVerified) {
            analysis.errors.push('The GTIN-14 check digit does not match — please re-check the number.');
        }
        analysis.gtin13 = digits.slice(1);
        analysis.notes.push('GTIN-14 indicator digit "' + digits[0]
            + '" dropped: product databases key on the GTIN-13.');
    } else {
        analysis.format = forcedFormat || (len + ' digits');
        analysis.errors.push('Expected 8, 12, 13 or 14 digits — got ' + len + '.');
        return analysis;
    }

    analysis.ok = analysis.checkVerified !== false;
    analysis.lookupCodes = [analysis.gtin13];
    analysis.region = gs1PrefixRegion(analysis.gtin13);
    applyPrefixNotes(analysis);
    return analysis;
}

/* Flag the prefixes whose meaning changes what a lookup can promise. */
function applyPrefixNotes(analysis) {
    if (!analysis.region) return;
    var prefix = analysis.gtin13.slice(0, 3);
    if (/Restricted distribution/.test(analysis.region)) {
        analysis.notes.push('The GS1 prefix ' + prefix + ' is restricted: the number is managed '
            + 'by a retailer for in-store use, so no global product registry exists for it.');
    } else if (/ISBN/.test(analysis.region)) {
        analysis.notes.push('The prefix 978/979 marks Bookland EAN-13 codes: the number is an '
            + 'ISBN-13, and product databases index it under the book title.');
    }
}

/* ---------------------------------------------------------------------------
   Product lookup — Open Food Facts first (the larger corpus), then Open
   Products Facts for the non-food rest of the shelf. Both APIs are CORS-open
   and need no key. UPCitemdb, the database behind some commercial lookups,
   only sends CORS headers to its own origin, so a browser page cannot use it.
   --------------------------------------------------------------------------- */

var LOOKUP_SOURCES = [
    {
        name: 'Open Food Facts',
        endpoint: 'https://world.openfoodfacts.org/api/v2/product/',
        page: 'https://world.openfoodfacts.org/product/',
        fields: 'product_name,product_name_en,generic_name,brands,quantity,categories,image_front_small_url,image_url'
    },
    {
        name: 'Open Products Facts',
        endpoint: 'https://world.openproductsfacts.org/api/v2/product/',
        page: 'https://world.openproductsfacts.org/product/',
        fields: 'product_name,product_name_en,generic_name,brands,quantity,categories,image_front_small_url,image_url'
    }
];

var LOOKUP_TIMEOUT_MS = 10000;

async function lookupProduct(analysis) {
    for (var s = 0; s < LOOKUP_SOURCES.length; s++) {
        var source = LOOKUP_SOURCES[s];
        for (var c = 0; c < analysis.lookupCodes.length; c++) {
            var code = analysis.lookupCodes[c];
            try {
                var controller = new AbortController();
                var timer = setTimeout(function () { controller.abort(); }, LOOKUP_TIMEOUT_MS);
                var response = await fetch(
                    source.endpoint + encodeURIComponent(code)
                    + '.json?fields=' + encodeURIComponent(source.fields),
                    { signal: controller.signal });
                clearTimeout(timer);
                if (!response.ok) continue;
                var data = await response.json();
                if (data && data.status === 1 && data.product) {
                    return { source: source, code: code, product: data.product };
                }
            } catch (error) {
                console.warn('Lookup failed at ' + source.name + ' (' + code + '):', error);
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
        setTip('Looking up ' + analysis.gtin13 + '…');
        analysis.lookup = await lookupProduct(analysis);
        cards.push(analysis);
    }

    lastPayload = cards.map(function (analysis) {
        return {
            format: analysis.format,
            raw: analysis.raw,
            gtin13: analysis.gtin13,
            checkDigit: analysis.checkVerified === true ? 'verified'
                : (analysis.checkVerified === false ? 'failed' : null),
            region: analysis.region,
            expansion: analysis.expansion,
            product: analysis.lookup ? {
                source: analysis.lookup.source.name,
                name: analysis.lookup.product.product_name || null,
                brands: analysis.lookup.product.brands || null,
                quantity: analysis.lookup.product.quantity || null
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
        products_found: found,
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

    /* --- product panel ---------------------------------------------------- */
    var lookup = analysis.lookup;
    if (lookup) {
        var p = lookup.product;
        var product = node('div', 'product-panel');
        var image = p.image_front_small_url || p.image_url;
        if (image) {
            var img = document.createElement('img');
            img.className = 'product-image';
            img.src = image;
            img.alt = p.product_name || 'Product photo';
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            product.appendChild(img);
        }

        var body = node('div', 'product-body');
        var name = p.product_name_en || p.product_name || p.generic_name;
        if (name) body.appendChild(node('h2', 'product-name', name));
        if (p.brands) body.appendChild(factLine('Brand', p.brands));
        if (p.quantity) body.appendChild(factLine('Quantity', p.quantity));
        if (p.categories) {
            /* The categories string is longest first; keep the three most
               specific and trim the tail. */
            var cats = p.categories.split(',').slice(0, 3).join(', ');
            body.appendChild(factLine('Categories', cats));
        }
        var pageLink = document.createElement('a');
        pageLink.href = lookup.source.page + encodeURIComponent(lookup.code);
        pageLink.target = '_blank';
        pageLink.rel = 'noopener noreferrer';
        pageLink.textContent = 'View on ' + lookup.source.name + ' →';
        body.appendChild(pageLink);
        product.appendChild(body);
        card.appendChild(product);

        card.appendChild(node('p', 'card-note', 'Product data from ' + lookup.source.name
            + ' — a crowd-sourced open database, so details can be missing or outdated.'));
    } else if (analysis.ok) {
        var empty = node('div', 'product-panel is-empty');
        empty.appendChild(node('p', 'card-note',
            'This barcode number is valid, but no product was found in Open Food Facts or Open '
            + 'Products Facts. Both databases are crowd-sourced: private-label products, '
            + 'discontinued items and restricted in-store numbers are often absent.'));
        card.appendChild(empty);
    }

    /* --- facts ------------------------------------------------------------ */
    var facts = node('dl', 'facts');
    addFact(facts, 'Barcode number', analysis.raw, true);
    if (analysis.gtin13 && analysis.gtin13 !== analysis.raw) {
        addFact(facts, 'GTIN-13 (normalized)', analysis.gtin13, true);
    }
    if (analysis.expansion) {
        addFact(facts, 'UPC-E expansion', analysis.expansion, true);
    }
    if (analysis.region) {
        addFact(facts, 'GS1 prefix ' + analysis.gtin13.slice(0, 3), analysis.region);
    } else if (analysis.gtin13) {
        addFact(facts, 'GS1 prefix ' + analysis.gtin13.slice(0, 3), 'Not in the GS1 prefix table');
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
    if (decodeBusy) {
        setTip('Still decoding the previous image — try again in a moment.', true);
        return;
    }

    var value = els.manualInput.value.trim();
    if (!value) {
        setTip('Type a barcode number first — 8, 12 or 13 digits.', true);
        return;
    }

    decodeBusy = true;
    try {
        var analysis = analyzeNumber(value, null);
        if (analysis.errors.length && !analysis.gtin13) {
            els.results.hidden = true;
            setTip(analysis.errors[0], true);
            analytics.fail('manual', 'invalid');
            return;
        }
        setTip('Looking up ' + analysis.gtin13 + '…');
        analysis.lookup = await lookupProduct(analysis);

        els.resultsContent.replaceChildren();
        lastPayload = [];
        els.resultsTitle.textContent = 'Lookup result';
        els.resultsContent.appendChild(buildCard(analysis));
        lastPayload = [{
            format: analysis.format,
            raw: analysis.raw,
            gtin13: analysis.gtin13,
            checkDigit: analysis.checkVerified === true ? 'verified'
                : (analysis.checkVerified === false ? 'failed' : null),
            region: analysis.region,
            expansion: analysis.expansion,
            product: analysis.lookup ? {
                source: analysis.lookup.source.name,
                name: analysis.lookup.product.product_name || null,
                brands: analysis.lookup.product.brands || null,
                quantity: analysis.lookup.product.quantity || null
            } : null,
            notes: analysis.notes,
            errors: analysis.errors
        }];

        els.results.hidden = false;
        els.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        analytics.success('manual', 'lookup', {
            count: 1,
            products_found: analysis.lookup ? 1 : 0,
            format: analysis.format
        });

        setTip(analysis.lookup
            ? 'Found it. Type another number any time.'
            : 'Valid barcode, but no product found in the open databases.', !!analysis.lookup);
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
