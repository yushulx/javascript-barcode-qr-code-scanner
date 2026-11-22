/*
 * Online GS1 Barcode Scanner.
 *
 * Decoding is Dynamsoft Barcode Reader; the AI structure comes from Dynamsoft
 * Code Parser (GS1_AI), merged with the local AI table in gs1.js — which adds
 * what a raw AI/value list cannot tell you: whether the GTIN check digit is
 * right, what a YYMMDD date actually resolves to, the HRI rendering and the
 * GS1 Digital Link.
 *
 * Works with a live camera or an uploaded / pasted / dropped / bundled image.
 */

/* ---------------------------------------------------------------------------
   Shared shims. Both shared files are optional: if they fail to load (ad
   blocker, offline, opened from a plain folder) the scanner still works, it
   just reports nothing.
   --------------------------------------------------------------------------- */

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
   Scan scope

   The Formats control decides which symbologies the reader looks for. The narrow
   setting lists only the symbologies that can legally carry a GS1 element
   string, so an unrelated Code 39 or a postal barcode cannot win the race and
   hide the symbol the operator was aiming at.

   Settings are derived from the SDK's own ReadBarcodes_Balance preset through
   the simplified-settings API. That is deliberate: hand-written template JSON is
   accepted by initSettings() but rejected later by startCapturing() with
   [-10038] "BarcodeReaderTaskSettingOptions[0].BarcodeFormatIds: The parameter
   value is invalid or out of range" — a message that names the format list while
   the real problem is the hand-rolled template around it (a stock preset streams
   fine, and that same preset with one edited field streams fine; only the custom
   document fails). Reading a preset back, changing one field and writing it back
   cannot produce a settings document the engine disagrees with.

   The mask must be the runtime enum, not a list of names: BarcodeFormatIds in
   template JSON takes names, while the simplified settings object takes the
   numeric mask — and those values are BigInt. BF_ALL alone is
   18446744069414584319, past the safe-integer range, so a JSON number could
   never have carried it faithfully.
   --------------------------------------------------------------------------- */

var PRESET_TEMPLATE = 'ReadBarcodes_Balance';

/* The symbologies that may carry a GS1 element string. */
var GS1_FORMAT_NAMES = [
    'BF_GS1_DATABAR_OMNIDIRECTIONAL',
    'BF_GS1_DATABAR_TRUNCATED',
    'BF_GS1_DATABAR_STACKED',
    'BF_GS1_DATABAR_STACKED_OMNIDIRECTIONAL',
    'BF_GS1_DATABAR_LIMITED',
    'BF_GS1_DATABAR_EXPANDED',
    'BF_GS1_DATABAR_EXPANDED_STACKED',
    'BF_GS1_COMPOSITE',
    'BF_DATAMATRIX',
    'BF_MICRO_QR',
    'BF_QR_CODE',
    'BF_CODE_128',
    'BF_CODE_39',
    'BF_CODE_93',
    'BF_ITF',
    'BF_EAN_13',
    'BF_EAN_8',
    'BF_UPC_A',
    'BF_UPC_E',
    'BF_PDF417',
    'BF_MICRO_PDF417',
    'BF_AZTEC',
    'BF_MAXICODE',
    'BF_DOTCODE'
];

var gs1MaskCache = null;

function formatEnum() {
    return (window.Dynamsoft && Dynamsoft.DBR && Dynamsoft.DBR.EnumBarcodeFormat) || null;
}

/* OR the GS1 formats together once. Returns null when the enum is not loaded
   yet, which leaves the preset's own default mask untouched. */
function gs1FormatMask() {
    if (gs1MaskCache !== null) return gs1MaskCache;

    var table = formatEnum();
    if (!table) return null;

    var mask = 0n;
    var unknown = [];
    GS1_FORMAT_NAMES.forEach(function (name) {
        if (table[name] === undefined) {
            unknown.push(name);
            return;
        }
        mask |= table[name];
    });
    if (unknown.length) console.warn('Barcode formats missing from this SDK build:', unknown);

    gs1MaskCache = mask || null;
    return gs1MaskCache;
}

function scopeMask() {
    if (scope !== 'all') return gs1FormatMask();
    var table = formatEnum();
    return (table && table.BF_ALL !== undefined) ? table.BF_ALL : null;
}

/* Which scope the router is currently configured for, so the preset is only
   rewritten when the answer would actually change. */
var configuredScope = null;

function applySettings(force) {
    if (!sdkReady || !cvRouter) return Promise.resolve();
    if (!force && configuredScope === scope) return Promise.resolve();

    return cvRouter.getSimplifiedSettings(PRESET_TEMPLATE).then(function (settings) {
        var mask = scopeMask();
        if (mask !== null) settings.barcodeSettings.barcodeFormatIds = mask;
        return cvRouter.updateSettings(PRESET_TEMPLATE, settings);
    }).then(function () {
        configuredScope = scope;
    });
}

/* ---------------------------------------------------------------------------
   State
   --------------------------------------------------------------------------- */

var parser = null;
var cameraView = null;
var cameraEnhancer = null;
var cvRouter = null;
var receiver = null;

var scope = 'gs1';
var mode = 'camera';
var sdkReady = false;

/* The camera keeps streaming while the results panel is open — the viewfinder
   behind it stays live — but incoming results are ignored until it closes. */
var resultsOpen = false;

/* Only one still-image decode at a time; a second click must not interleave. */
var decodeBusy = false;

var lastPayload = [];
var els = {};

/* ---------------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------------- */

async function bootstrap() {
    els.loading = document.getElementById('loading-overlay');
    els.loadingText = document.getElementById('loading-text');
    els.tip = document.getElementById('tip-message');
    els.cameraView = document.getElementById('camera-view');
    els.mainContainer = document.getElementById('main-container');
    els.modeSwitch = document.getElementById('mode-switch-container');
    els.scopeSelect = document.getElementById('scope-select');
    els.results = document.getElementById('results');
    els.resultsTitle = document.getElementById('results-title');
    els.resultsContent = document.getElementById('results-content');
    els.uploadZone = document.getElementById('upload-zone');
    els.uploadInput = document.getElementById('upload-input');
    els.sampleRow = document.getElementById('sample-row');
    els.copyAll = document.getElementById('copy-all-button');
    els.closeResults = document.getElementById('close-results-button');

    wireEvents();
    buildSamples();
    updateModeUI();

    var startedAt = now();
    showLoading('Initializing Dynamsoft Barcode Reader…');

    try {
        await initSDK();
        analytics.ready(now() - startedAt);
        hideLoading();
        try {
            await startCameraMode();
        } catch (cameraError) {
            /* No camera, permission denied, or the device is still tearing down
               from a previous session. Upload mode needs no camera, so fall back
               rather than stranding the visitor on a black rectangle. */
            console.error('Camera unavailable, falling back to Upload mode:', cameraError);
            analytics.action('camera_fallback', {
                reason: String((cameraError && cameraError.message) || cameraError).slice(0, 120)
            });
            startUploadMode();
        }
    } catch (error) {
        var message = (error && (error.message || error)) || 'Unknown error';
        console.error(error);
        analytics.error('activate_failed', message);
        showLoading('Failed to start the scanner: ' + message
            + '\n\nPlease refresh the page and try again.');
    }
}

async function initSDK() {
    /* The license must be activated before any component is created, or
       createInstance() throws. The second argument runs the check in a worker. */
    await Dynamsoft.License.LicenseManager.initLicense(resolveLicenseKey(), true);

    showLoading('Loading the barcode and parsing modules…');
    await Dynamsoft.Core.CoreModule.loadWasm(['DBR', 'DCP']);

    showLoading('Loading the GS1 application identifier spec…');
    await Dynamsoft.DCP.CodeParserModule.loadSpec('GS1_AI');
    parser = await Dynamsoft.DCP.CodeParser.createInstance();

    showLoading('Starting the camera…');
    cameraView = await Dynamsoft.DCE.CameraView.createInstance();
    /* DCE defaults to object-fit "contain", which letterboxes a portrait
       camera stream inside a wide-short viewfinder (a phone held upright
       shows a narrow pillar with black bars). "cover" fills the viewfinder
       and crops the overflow instead; decoding still uses the full frames,
       so this changes only the picture, never what the reader sees. */
    if (typeof cameraView.setVideoFit === 'function') cameraView.setVideoFit('cover');
    cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance(cameraView);
    cvRouter = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

    /* Consecutive frames see the same symbol; without deduplication the results
       panel would be re-opened dozens of times a second. */
    var filter = new Dynamsoft.Utility.MultiFrameResultCrossFilter();
    filter.enableResultDeduplication('barcode', true);
    await cvRouter.addResultFilter(filter);

    /* The SDK's own viewfinder UI renders inside this element. */
    els.cameraView.replaceChildren(cameraView.getUIElement());

    receiver = {
        onDecodedBarcodesReceived: function (result) {
            if (resultsOpen || mode !== 'camera') return;
            var items = (result && result.barcodeResultItems) || [];
            if (items.length) showResults(items, 'camera');
        }
    };

    sdkReady = true;
}

/* ---------------------------------------------------------------------------
   Camera mode: continuous frames are pushed through the router by the SDK
   --------------------------------------------------------------------------- */

async function startCameraMode() {
    mode = 'camera';
    updateModeUI();
    els.mainContainer.hidden = false;
    els.uploadZone.hidden = true;

    cvRouter.removeResultReceiver(receiver);
    await cvRouter.stopCapturing();
    /* singleFrameMode has to change while the camera is closed. */
    if (cameraEnhancer.isOpen()) await cameraEnhancer.close();
    cameraEnhancer.singleFrameMode = 'disabled';

    await openCamera();

    cvRouter.setInput(cameraEnhancer);
    await applySettings();
    await cvRouter.startCapturing(PRESET_TEMPLATE);
    cvRouter.addResultReceiver(receiver);

    showTip('Point the camera at a GS1 barcode.');
    analytics.start('camera', 'camera');
}

function startUploadMode() {
    mode = 'upload';
    updateModeUI();
    els.mainContainer.hidden = true;
    els.uploadZone.hidden = false;

    cvRouter.removeResultReceiver(receiver);
    cvRouter.stopCapturing();
    if (cameraEnhancer.isOpen()) cameraEnhancer.close();

    showTip('Load an image of a GS1 barcode.');
    analytics.start('upload', 'upload');
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

/* Re-arm the stream after the results panel closes. */
function resumeCamera() {
    cvRouter.removeResultReceiver(receiver);
    cvRouter.setInput(cameraEnhancer);
    return applySettings().then(function () {
        return cvRouter.startCapturing(PRESET_TEMPLATE);
    }).then(function () {
        cvRouter.addResultReceiver(receiver);
    });
}

async function switchMode(next) {
    if (next === mode) return;
    closeResults(false);
    analytics.action('mode_change', { mode: next });
    if (next === 'upload') {
        startUploadMode();
        return;
    }
    try {
        await startCameraMode();
    } catch (error) {
        console.error(error);
        startUploadMode();
        showTip('The camera could not be opened on this device. Upload an image instead.', true);
    }
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

async function decodeImage(src, label) {
    var img = await loadImageElement(src);
    await applySettings();
    var dsImage = imageToDsImageData(img);
    var result = await cvRouter.capture(dsImage, PRESET_TEMPLATE);
    return {
        items: barcodeItemsFrom(result),
        src: src,
        label: label || 'Uploaded image',
        width: dsImage.width,
        height: dsImage.height
    };
}

async function scanImageSource(src, label, source) {
    if (!sdkReady) {
        showTip('The scanner is still starting. Try again in a moment.', true);
        return;
    }
    if (decodeBusy) return;

    decodeBusy = true;
    showTip('Reading ' + label + '…');
    try {
        var outcome = await feedback.run('Decoding the barcode…', function () {
            return decodeImage(src, label);
        });
        if (!outcome.items.length) {
            showTip('No barcode was found in that image. Try a sharper or larger crop — small '
                + 'DataBar symbols need a lot of pixels.', true);
            analytics.fail(source, 'none');
            return;
        }
        await showResults(outcome.items, source, outcome);
    } catch (error) {
        console.error(error);
        showTip('That image could not be read: ' + ((error && error.message) || error), true);
        analytics.error('image_decode_failed', String((error && error.message) || error).slice(0, 120));
    } finally {
        decodeBusy = false;
    }
}

async function handleImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
        showTip('That file is not an image. Upload a PNG, JPG, BMP or WebP picture of a GS1 barcode.', true);
        return;
    }
    analytics.action('image_load', { type: file.type, size: file.size });
    try {
        var src = await readAsDataURL(file);
        await scanImageSource(src, file.name || 'the image', 'upload');
    } catch (error) {
        console.error(error);
        showTip('That file could not be read.', true);
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

/* ---------------------------------------------------------------------------
   Result extraction
   --------------------------------------------------------------------------- */

/* The streaming receiver hands barcodes over in barcodeResultItems; capture()
   returns a CapturedResult with the same items in `items` (type 2 =
   CRIT_BARCODE). Accept both shapes. */
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
   GS1 parsing
   --------------------------------------------------------------------------- */

/* The decoder reports where each symbol sits as a quad of points in the
   captured image's pixel coordinates. Copied into plain objects so nothing
   downstream depends on the SDK's own class instances surviving. */
function locationPoints(item) {
    var points = item.location && item.location.points;
    if (!points || !points.length) return null;

    var list = [];
    for (var i = 0; i < points.length; i++) {
        var point = points[i];
        if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
        list.push({ x: point.x, y: point.y });
    }
    return list.length >= 3 ? list : null;
}

/* Dynamsoft Code Parser with the GS1_AI spec loaded turns the element string
   into AI / description / value triples. It gets two attempts: the raw text as
   the decoder returned it, and the AI-normalised string from gs1.js — which is
   what a DataBar needs, because its GTIN-14 arrives without an AI.

   This is an enhancement, never a dependency: the local AI table in gs1.js
   parses the same string on its own. Code Parser is a separately licensed
   component, so a deployment whose licence does not cover it still gets a fully
   structured result. */
async function runCodeParser(rawText, gs1Result) {
    if (!parser) return { fields: null, error: 'The Code Parser module was not loaded.' };

    var attempts = [rawText];
    if (gs1Result && gs1Result.elementString && gs1Result.elementString !== rawText) {
        attempts.push(gs1Result.elementString.split(GS1.SEP).join(GS1.FNC1));
    }

    var lastError = null;
    for (var i = 0; i < attempts.length; i++) {
        var text = attempts[i];
        if (!text) continue;
        try {
            var parsed = await parser.parse(text);
            if (!parsed || !parsed.jsonString) continue;
            var data = JSON.parse(parsed.jsonString);
            var info = data && data.ResultInfo;
            if (!info) continue;
            var fields = flattenParsedFields(info);
            if (fields.length) return { fields: fields, error: null };
        } catch (error) {
            lastError = String((error && error.message) || error);
            console.warn('Code Parser attempt ' + (i + 1) + ' failed:', error);
        }
    }
    return { fields: null, error: lastError };
}

/* The GS1_AI result nests an "AI" child (RawValue = the digits, Value = the
   human description) and a "Data" child holding the payload. A date payload
   arrives as a Date object rather than a string. */
function flattenParsedFields(info) {
    var fields = [];
    info.forEach(function (entry) {
        var ai = '';
        var title = '';
        var value = '';
        var children = (entry.ChildFields && entry.ChildFields[0]) || [];
        children.forEach(function (child) {
            var name = child.FieldName || '';
            if (/AI$/.test(name)) {
                ai = child.RawValue || ai;
                title = child.Value != null ? String(child.Value) : title;
            } else if (/Data$/.test(name)) {
                var raw = child.Value;
                value = (raw instanceof Date) ? isoDate(raw) : (raw == null ? '' : String(raw));
            }
        });
        if (ai || value) fields.push({ ai: ai, title: title, value: value });
    });
    return fields;
}

function isoDate(date) {
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/* Merge the local AI-table parse with the Code Parser fields. The local parse
   drives the row order and supplies the formatted value and the validation
   verdict; the Code Parser supplies the authoritative data-element name. */
function mergeFields(elements, parsedFields) {
    var pool = (parsedFields || []).slice();

    var merged = elements.map(function (element) {
        var index = -1;
        for (var i = 0; i < pool.length; i++) {
            if (pool[i].ai === element.ai) { index = i; break; }
        }
        var row = {
            ai: element.ai,
            title: element.title,
            value: element.value,
            display: element.display,
            verified: element.verified,
            invalid: element.invalid,
            note: element.note,
            variable: element.variable,
            fromCodeParser: false
        };
        if (index !== -1) {
            var field = pool.splice(index, 1)[0];
            if (field.title) row.title = field.title;
            row.parserValue = field.value;
            row.fromCodeParser = true;
        }
        return row;
    });

    /* AIs the local table does not know — newer than this build, or an
       in-company AI with no fixed shape. */
    pool.forEach(function (field) {
        if (!field.ai) return;
        merged.push({
            ai: field.ai,
            title: field.title || field.ai,
            value: field.value,
            display: field.value,
            fromCodeParser: true,
            unmatched: true
        });
    });

    return merged;
}

async function analyzeItem(item) {
    var rawText = item.text == null ? '' : String(item.text);
    var format = item.formatString || 'Unknown';

    var gs1Result = GS1.parse(rawText, { format: format });
    var parsedFields = null;
    var parserError = null;

    /* Only ask the Code Parser when the string could plausibly be GS1 data.
       Running it over a plain Code 39 payload just produces noise. */
    if (gs1Result.count > 0) {
        var attempt = await runCodeParser(rawText, gs1Result);
        parsedFields = attempt.fields;
        parserError = attempt.error;
    }

    var parserLabel;
    if (parsedFields && parsedFields.length) {
        parserLabel = 'Dynamsoft Code Parser (GS1_AI) + built-in AI table';
    } else if (gs1Result.count) {
        parserLabel = 'Built-in AI table'
            + (parserError ? ' — Code Parser unavailable (' + parserError + ')' : '');
    } else {
        parserLabel = '—';
    }

    return {
        format: format,
        text: rawText,
        location: locationPoints(item),
        bytes: item.bytes || null,
        confidence: typeof item.confidence === 'number' ? item.confidence : null,
        elements: mergeFields(gs1Result.elements, parsedFields),
        elementString: gs1Result.elementString,
        hri: gs1Result.hri,
        digitalLink: gs1Result.digitalLink,
        gtin: gs1Result.gtin,
        warnings: gs1Result.warnings,
        errors: gs1Result.errors,
        parser: parserLabel,
        parserError: (parsedFields && parsedFields.length) ? null : parserError
    };
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

/* Industry parsing hints (GS1 presets). A GS1 payload whose elements read
   DI + a date (production or expiry) + a lot or serial follows the GS1 UDI
   structure — the medical-device set a quality system traces. The tag names
   the vertical; the note maps the AIs to the UDI fields. */
function isUdiPayload(elements) {
    var ais = {};
    elements.forEach(function (row) { ais[row.ai] = true; });
    return !!ais['01'] && (!!ais['11'] || !!ais['17']) && (!!ais['10'] || !!ais['21']);
}

/* When one image carries the same GTIN in several symbols — the Sunrise 2027
   packaging pattern, a 2D symbol beside the legacy EAN/UPC — say so, because
   the duplicate line is the point: a retail system deduplicates the reads into
   one product, and a naive results list would look wrong doing the same. */
function gtinDeduplication(analyses) {
    var byGtin = {};
    analyses.forEach(function (analysis) {
        if (!analysis.gtin || !analysis.gtin.value) return;
        var key = analysis.gtin.value;
        if (!byGtin[key]) byGtin[key] = [];
        byGtin[key].push(analysis.format);
    });

    var duplicated = Object.keys(byGtin).filter(function (key) {
        return byGtin[key].length > 1;
    });
    if (!duplicated.length) return null;

    var box = node('div', 'dedup-note');
    duplicated.forEach(function (key) {
        box.appendChild(node('p', 'dedup-line',
            'GTIN ' + key + ' was read from ' + byGtin[key].length + ' symbols ('
            + unique(byGtin[key]).join(', ') + '). One product, one scan: a retail '
            + 'system deduplicates these into a single GTIN — the Sunrise 2027 pattern of '
            + 'a 2D symbol beside the legacy EAN/UPC.'));
    });
    return box;
}

function unique(list) {
    var seen = {};
    return list.filter(function (item) {
        if (seen[item]) return false;
        seen[item] = true;
        return true;
    });
}

async function showResults(items, source, outcome) {
    resultsOpen = true;
    els.resultsContent.replaceChildren();

    var analyses = [];
    for (var i = 0; i < items.length; i++) {
        analyses.push(await analyzeItem(items[i]));
    }
    lastPayload = analyses;

    var overlay = { el: null, markers: [] };
    if (outcome && outcome.src) {
        var preview = node('figure', 'source-preview');
        var stage = node('div', 'preview-stage');
        var previewImg = document.createElement('img');
        previewImg.src = outcome.src;
        previewImg.alt = 'The image that was scanned';
        stage.appendChild(previewImg);

        overlay = buildOverlay(analyses, outcome);
        stage.appendChild(overlay.el);
        preview.appendChild(stage);

        var caption = outcome.label + ' — ' + outcome.width + ' × ' + outcome.height + ' px';
        if (overlay.markers.length && analyses.length > 1) {
            caption += ' · the numbered markers match the results below';
        }
        preview.appendChild(node('figcaption', null, caption));
        els.resultsContent.appendChild(preview);
    }

    var dedup = gtinDeduplication(analyses);
    if (dedup) els.resultsContent.appendChild(dedup);

    els.resultsTitle.textContent = analyses.length === 1
        ? '1 barcode found'
        : analyses.length + ' barcodes found';

    var cards = analyses.map(function (analysis, index) {
        return buildBarcodeCard(analysis, index, analyses.length);
    });
    cards.forEach(function (card) {
        els.resultsContent.appendChild(card);
    });

    /* Marker in the image ↔ card in the list: hovering one lights up the
       other, tapping a marker scrolls its card into view. Sparse on purpose —
       a symbol without a reported location keeps its slot empty. */
    overlay.markers.forEach(function (marker, index) {
        if (marker && cards[index]) linkMarkerToCard(marker, cards[index], index, analyses.length);
    });

    els.results.classList.add('is-open');
    els.resultsContent.scrollTop = 0;

    analytics.success(source, 'barcode', {
        count: analyses.length,
        gs1_symbols: analyses.filter(function (a) { return a.elements.length; }).length,
        format: analyses[0].format
    });
}

/* Position markers over the scanned image, one per decoded symbol, so the
   numbered cards below can be matched to the symbols in the picture.
   Coordinates are percentages, not pixels: the preview shows the original
   file while the decode ran on the (possibly downscaled) copy, and the two
   share the aspect ratio — a point's share of the decoded width is its share
   of the displayed image. Only a multi-symbol scan gets number chips; a lone
   symbol still gets its outline but no "#1" that matches no card header. */
function buildOverlay(analyses, outcome) {
    var layer = node('div', 'preview-overlay');
    var markers = [];
    if (!(outcome.width > 0 && outcome.height > 0)) return { el: layer, markers: markers };

    var numbered = analyses.length > 1;

    analyses.forEach(function (analysis, index) {
        var points = analysis.location;
        if (!points) return;

        var xs = points.map(function (p) { return p.x; });
        var ys = points.map(function (p) { return p.y; });
        var minX = Math.min.apply(null, xs);
        var minY = Math.min.apply(null, ys);
        var boxW = Math.max.apply(null, xs) - minX;
        var boxH = Math.max.apply(null, ys) - minY;
        if (!(boxW > 0) || !(boxH > 0)) return;

        var marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'preview-marker';
        marker.style.left = (minX / outcome.width * 100) + '%';
        marker.style.top = (minY / outcome.height * 100) + '%';
        marker.style.width = (boxW / outcome.width * 100) + '%';
        marker.style.height = (boxH / outcome.height * 100) + '%';

        /* The quad itself, stretched over the bounding box. The non-uniform
           scale would smear a plain stroke, so the polygon keeps its width in
           screen pixels instead of user units. */
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points.map(function (p) {
            return ((p.x - minX) / boxW * 100) + ',' + ((p.y - minY) / boxH * 100);
        }).join(' '));
        polygon.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(polygon);
        marker.appendChild(svg);

        if (numbered) {
            var anchor = points[0];
            var chip = node('span', 'preview-marker-tag', '#' + (index + 1));
            chip.style.left = ((anchor.x - minX) / boxW * 100) + '%';
            chip.style.top = ((anchor.y - minY) / boxH * 100) + '%';
            /* A symbol whose anchor sits at the very top edge would push its
               chip outside the image; flip it below the anchor instead. */
            if (anchor.y / outcome.height * 100 < 6) chip.classList.add('is-below');
            marker.appendChild(chip);
            marker.setAttribute('aria-label', 'Result #' + (index + 1) + ' of ' + analyses.length
                + ' — ' + analysis.format + '. Show its details below.');
            marker.title = '#' + (index + 1) + ' ' + analysis.format;
        } else {
            marker.setAttribute('aria-label', 'Where the ' + analysis.format
                + ' symbol was found in the image');
            marker.title = analysis.format;
        }

        layer.appendChild(marker);
        markers[index] = marker;
    });

    return { el: layer, markers: markers };
}

function linkMarkerToCard(marker, card, index, total) {
    function highlight(on) {
        marker.classList.toggle('is-active', on);
        card.classList.toggle('is-active', on);
    }

    marker.addEventListener('mouseenter', function () { highlight(true); });
    marker.addEventListener('mouseleave', function () { highlight(false); });
    marker.addEventListener('focus', function () { highlight(true); });
    marker.addEventListener('blur', function () { highlight(false); });
    marker.addEventListener('click', function () {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        analytics.action('preview_marker_click', { index: index + 1, total: total });
    });

    card.addEventListener('mouseenter', function () { highlight(true); });
    card.addEventListener('mouseleave', function () { highlight(false); });
}

function buildBarcodeCard(analysis, index, total) {
    var card = node('article', 'barcode-card');

    /* --- header --------------------------------------------------------- */
    var header = node('div', 'barcode-card-header');
    if (total > 1) header.appendChild(node('span', 'barcode-index', '#' + (index + 1)));
    header.appendChild(node('span', 'format-chip', analysis.format));

    var isGs1 = analysis.elements.length > 0;
    header.appendChild(node('span', isGs1 ? 'gs1-badge' : 'gs1-badge is-plain',
        isGs1 ? 'GS1 element string' : 'No GS1 data elements'));
    if (isGs1 && isUdiPayload(analysis.elements)) {
        header.appendChild(node('span', 'gs1-badge', 'GS1 UDI'));
    }
    if (analysis.confidence != null) {
        header.appendChild(node('span', 'mm-confidence', analysis.confidence + '% confidence'));
    }
    card.appendChild(header);

    /* --- nothing parsed -------------------------------------------------- */
    if (!analysis.elements.length) {
        card.appendChild(node('p', 'card-note',
            'This symbol does not carry a GS1 element string, or its data could not be split into '
            + 'application identifiers. The decoded text is shown below.'));
        card.appendChild(node('p', 'mono-block', analysis.text || '(empty)'));
        if (analysis.errors.length) card.appendChild(noteList(analysis.errors, 'error'));
        return card;
    }

    /* --- HRI ------------------------------------------------------------- */
    if (analysis.hri) {
        card.appendChild(node('p', 'field-label', 'Human readable interpretation'));
        card.appendChild(node('p', 'hri-block', analysis.hri));
    }

    /* --- AI table -------------------------------------------------------- */
    var table = node('table', 'ai-table');
    var thead = node('thead');
    var headRow = node('tr');
    ['AI', 'Data element', 'Value'].forEach(function (label, columnIndex) {
        var th = node('th', null, label);
        th.scope = 'col';
        if (columnIndex === 0) th.className = 'col-ai';
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = node('tbody');
    analysis.elements.forEach(function (row) {
        tr(tbody, row);
    });
    table.appendChild(tbody);
    card.appendChild(table);

    /* --- per-element notes ---------------------------------------------- */
    var notes = [];
    analysis.elements.forEach(function (row) {
        if (row.note) notes.push('AI ' + row.ai + ': ' + row.note);
    });
    if (isGs1 && isUdiPayload(analysis.elements)) {
        notes.push('GS1 UDI structure: the Device Identifier (DI) is AI 01, and the lot (10), '
            + 'production date (11), expiry (17) and serial (21) are the production identifiers '
            + 'a healthcare quality system traces against it.');
    }
    if (notes.length) card.appendChild(noteList(notes, 'warn'));

    /* --- facts ----------------------------------------------------------- */
    var facts = node('dl', 'facts');
    addFact(facts, 'Parser', analysis.parser);

    if (analysis.gtin) {
        var gtin = analysis.gtin;
        addFact(facts, 'Product identifier', gtin.verified
            ? gtin.value + ' — GTIN check digit verified'
            : (gtin.invalid
                ? gtin.value + ' — GTIN check digit failed'
                : gtin.value));
    }

    if (analysis.digitalLink) {
        var link = document.createElement('a');
        link.href = analysis.digitalLink;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = analysis.digitalLink;
        addFact(facts, 'GS1 Digital Link', link);
    }

    addFact(facts, 'Element string', analysis.elementString.split(GS1.SEP).join(' | '), true);
    addFact(facts, 'Separators', separatorSummary(analysis));

    if (analysis.bytes) {
        addFact(facts, 'Bytes', Array.prototype.slice.call(analysis.bytes).join(', '), true);
    }

    if (analysis.parserError) addFact(facts, 'Code Parser error', analysis.parserError);
    card.appendChild(facts);

    /* --- diagnostics ----------------------------------------------------- */
    if (analysis.errors.length) card.appendChild(noteList(analysis.errors, 'error'));
    if (analysis.warnings.length) card.appendChild(noteList(analysis.warnings, 'warn'));

    return card;

    function tr(tbodyElement, row) {
        var rowEl = node('tr', row.invalid ? 'is-invalid' : (row.unmatched ? 'is-unmatched' : ''));

        var aiCell = node('td', 'col-ai');
        aiCell.appendChild(node('code', 'ai-code', '(' + row.ai + ')'));
        rowEl.appendChild(aiCell);

        var titleCell = node('td', null, row.title);
        if (row.variable) titleCell.appendChild(node('span', 'tag-variable', 'variable length'));
        rowEl.appendChild(titleCell);

        var valueCell = node('td', 'col-value');
        valueCell.appendChild(node('span', 'ai-value', row.display != null ? String(row.display) : ''));
        if (String(row.display) !== row.value) {
            valueCell.appendChild(node('span', 'ai-raw', 'raw: ' + row.value));
        }
        if (row.verified) valueCell.appendChild(node('span', 'tag-ok', 'check digit verified'));
        if (row.invalid) valueCell.appendChild(node('span', 'tag-bad', 'check digit failed'));
        if (row.unmatched) valueCell.appendChild(node('span', 'tag-note', 'not in the local AI table'));
        rowEl.appendChild(valueCell);

        tbodyElement.appendChild(rowEl);
    }
}

function addFact(list, label, value, mono) {
    list.appendChild(node('dt', null, label));
    var dd = node('dd', mono ? 'mono' : null);
    if (value && value.nodeType) {
        dd.appendChild(value);
    } else {
        dd.textContent = value;
    }
    list.appendChild(dd);
}

/* Whether the decoder kept the FNC1 separators decides how much of the split
   rested on the encoder versus on the AI table, which is the first thing worth
   knowing when a value looks wrong. */
function separatorSummary(analysis) {
    var count = analysis.elementString.split(GS1.SEP).length - 1;
    if (count > 0) {
        return 'FNC1 (0x1D) present — ' + count
            + (count === 1 ? ' separator' : ' separators');
    }
    var variable = analysis.elements.filter(function (row) { return row.variable; }).length;
    return variable
        ? 'None returned — the AI table split the string by its own length rules'
        : 'None needed — every element has a fixed length';
}

function noteList(messages, kind) {
    var box = node('ul', 'note-list is-' + kind);
    messages.forEach(function (message) {
        box.appendChild(node('li', null, message));
    });
    return box;
}

function closeResults(resume) {
    resultsOpen = false;
    els.results.classList.remove('is-open');
    if (resume !== false && mode === 'camera' && sdkReady) {
        resumeCamera().catch(function (error) {
            console.warn('Could not resume the camera stream:', error);
        });
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

function showTip(message, isError) {
    if (!els.tip) return;
    els.tip.textContent = message;
    els.tip.classList.toggle('is-error', !!isError);
}

function updateModeUI() {
    els.modeSwitch.dataset.active = mode;
    Array.prototype.forEach.call(els.modeSwitch.querySelectorAll('.mode-option'), function (option) {
        option.classList.toggle('active', option.dataset.mode === mode);
    });
}

function buildSamples() {
    /* A page may predefine window.GS1_SAMPLES to point at its own fixtures. */
    var samples = window.GS1_SAMPLES || [
        { label: 'GS1 DataMatrix', src: 'sample-images/gs1-datamatrix.jpg' },
        { label: 'DataBar Expanded Stacked', src: 'sample-images/databar-expanded-stacked.png' }
    ];
    samples.forEach(function (sample) {
        var button = node('button', 'sample-chip', sample.label);
        button.type = 'button';
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            analytics.action('sample_load', { sample: sample.label });
            scanImageSource(sample.src, sample.label, 'upload');
        });
        els.sampleRow.appendChild(button);
    });
    if (!samples.length) els.sampleRow.hidden = true;
}

function applyScope() {
    if (!sdkReady) return Promise.resolve();
    /* Force a re-apply: this is exactly the "scope changed" case. */
    configuredScope = null;
    if (mode !== 'camera') return applySettings();
    /* startCapturing has to be re-issued for the new template to take effect. */
    return cvRouter.stopCapturing()
        .then(function () { return applySettings(true); })
        .then(function () { return cvRouter.startCapturing(PRESET_TEMPLATE); });
}

function wireEvents() {
    Array.prototype.forEach.call(els.modeSwitch.querySelectorAll('.mode-option'), function (option) {
        option.addEventListener('click', function () { switchMode(option.dataset.mode); });
    });

    els.scopeSelect.addEventListener('change', function () {
        scope = els.scopeSelect.value === 'all' ? 'all' : 'gs1';
        analytics.action('scope_change', { scope: scope });
        applyScope().catch(function (error) { console.warn(error); });
        showTip(scope === 'gs1'
            ? 'Reading GS1 symbologies only.'
            : 'Reading every symbology the SDK supports.');
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
        if (mode !== 'upload') return;
        var items = (event.clipboardData && event.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
                handleImageFile(items[i].getAsFile());
                return;
            }
        }
    });

    els.closeResults.addEventListener('click', function () { closeResults(true); });

    els.copyAll.addEventListener('click', copyResults);
}

function copyResults() {
    if (!lastPayload.length) return;

    var text = JSON.stringify(lastPayload.map(function (analysis) {
        return {
            format: analysis.format,
            text: analysis.text,
            hri: analysis.hri,
            digitalLink: analysis.digitalLink,
            parser: analysis.parser,
            elements: analysis.elements.map(function (row) {
                return {
                    ai: row.ai,
                    title: row.title,
                    value: row.value,
                    display: row.display,
                    checkDigit: row.verified ? 'verified' : (row.invalid ? 'failed' : null),
                    note: row.note || null
                };
            }),
            warnings: analysis.warnings,
            errors: analysis.errors
        };
    }), null, 2);

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
