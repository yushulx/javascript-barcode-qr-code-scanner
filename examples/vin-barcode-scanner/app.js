/*
 * Online VIN Barcode Scanner.
 *
 * Decoding is Dynamsoft Barcode Reader, restricted to the four symbologies a
 * VIN label actually uses — Code 39 (the North American label symbology), Code
 * 128, QR Code and Data Matrix. Everything after the decode is local: the
 * 18-character import-prefix form (a leading I) is stripped per the North
 * American VIN barcode convention, the check digit in position 9 is verified,
 * and the VIN is parsed into WMI, region, VDS, model year, plant code and
 * serial number (shared model in vin-model.js).
 *
 * Works with a live camera, an uploaded / pasted / dropped / bundled image, or
 * a VIN typed by hand. A bundled sample is decoded automatically on load.
 *
 * There is deliberately no OCR here: Dynamsoft reads VINs from barcodes. The
 * stamped or engraved characters on the chassis are not a barcode and cannot
 * be recognized by this SDK — the notice banner on the page says so in plain
 * text, because older tutorials pointed users the other way.
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

var vinModel = window.VinModel;

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

/* The four symbologies VIN labels and paperwork actually use. A VIN may ride
   on any of them, but the label on a North American vehicle is always the
   Code 39 form. */
var VIN_FORMAT_NAMES = ['BF_CODE_39', 'BF_CODE_128', 'BF_QR_CODE', 'BF_DATAMATRIX'];

var cvRouter = null;
var cameraView = null;
var cameraEnhancer = null;
var receiver = null;
var sdkReady = false;
var configured = false;

function vinFormatMask() {
    var table = (window.Dynamsoft && Dynamsoft.DBR && Dynamsoft.DBR.EnumBarcodeFormat) || null;
    if (!table) return null;
    var mask = 0n;
    VIN_FORMAT_NAMES.forEach(function (name) {
        if (table[name] !== undefined) mask |= table[name];
    });
    return mask || null;
}

async function applySettings() {
    if (!sdkReady || configured) return;
    var settings = await cvRouter.getSimplifiedSettings(PRESET_TEMPLATE);
    var mask = vinFormatMask();
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
var scanMode = 'upload';
var cameraStarting = false;

/* The bundled sample decoded automatically on page load. */
var DEFAULT_SAMPLE = { label: 'Honda · Code 39', src: 'sample-images/vin-honda-code39.png' };

var SAMPLES = [
    DEFAULT_SAMPLE,
    { label: 'Import (leading I) · Code 39', src: 'sample-images/vin-toyota-import-code39.png' },
    { label: 'European · Code 128', src: 'sample-images/vin-vw-code128.png' },
    { label: 'Data Matrix', src: 'sample-images/vin-honda-datamatrix.png' }
];

/* ---------------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------------- */

async function bootstrap() {
    els.tip = document.getElementById('tip-message');
    els.loading = document.getElementById('loading-overlay');
    els.loadingText = document.getElementById('loading-text');
    els.scanModeSwitch = document.getElementById('scan-mode-switch');
    els.cameraSection = document.getElementById('camera-section');
    els.cameraView = document.getElementById('camera-view');
    els.scanWorkbench = document.getElementById('scan-workbench');
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
    updateScanModeUI();

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
                if (scanMode !== 'camera' || decodeBusy) return;
                var items = (result && result.barcodeResultItems) || [];
                if (items.length) showResults(items, 'camera');
            }
        };

        sdkReady = true;
        await applySettings();
        analytics.ready(now() - startedAt);
        hideLoading();
        setTip('Drop in a VIN barcode image, or try a sample below. '
            + 'Point a camera at a real label with the switch above.');

        /* The page always opens with a worked example: the bundled sample is
           decoded and parsed without the visitor clicking anything. */
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
        scanMode = 'camera';
        updateScanModeUI();
        els.cameraSection.hidden = false;
        els.scanWorkbench.hidden = true;
        els.results.hidden = true;

        await cvRouter.stopCapturing();
        if (cameraEnhancer.isOpen()) await cameraEnhancer.close();
        cameraEnhancer.singleFrameMode = 'disabled';
        await openCamera();
        cvRouter.setInput(cameraEnhancer);
        await applySettings();
        await cvRouter.startCapturing(PRESET_TEMPLATE);
        cvRouter.addResultReceiver(receiver);
        setTip('Point the camera at the VIN barcode on the label or windshield sticker.');
        analytics.start('camera', 'camera');
    } finally {
        cameraStarting = false;
    }
}

function startUploadMode() {
    scanMode = 'upload';
    updateScanModeUI();
    els.cameraSection.hidden = true;
    els.scanWorkbench.hidden = false;

    if (cvRouter && receiver) cvRouter.removeResultReceiver(receiver);
    if (cvRouter) cvRouter.stopCapturing();
    if (cameraEnhancer && cameraEnhancer.isOpen()) cameraEnhancer.close();

    setTip('Drop in a VIN barcode image, or try a sample below.');
    analytics.start('upload', 'upload');
}

async function switchScanMode(next) {
    if (next === scanMode || cameraStarting) return;
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

function updateScanModeUI() {
    els.scanModeSwitch.dataset.active = scanMode;
    Array.prototype.forEach.call(els.scanModeSwitch.querySelectorAll('.mode-option'), function (option) {
        option.classList.toggle('active', option.dataset.mode === scanMode);
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
            setTip('No VIN barcode was found in that image. VIN barcodes are Code 39 on most '
                + 'vehicles — make sure the symbol is inside the frame and in focus. A stamped VIN '
                + 'without a barcode cannot be scanned at all.', true);
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
        setTip('That file is not an image. Upload a PNG, JPG, BMP or WebP picture of a VIN barcode.', true);
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
   Rendering
   --------------------------------------------------------------------------- */

function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
}

async function showResults(items, source, imageSrc, imageLabel) {
    els.resultsContent.replaceChildren();
    lastPayload = [];

    var cards = [];
    for (var i = 0; i < items.length; i++) {
        var rawText = items[i].text == null ? '' : String(items[i].text);
        var format = items[i].formatString || null;
        cards.push(vinModel.analyzeBarcodeText(rawText, format, 'na'));
    }

    lastPayload = cards.map(function (analysis) {
        return {
            format: analysis.source,
            vin: analysis.vin,
            checkDigit: analysis.checkVerified === true ? 'verified'
                : (analysis.checkVerified === false ? 'failed' : null),
            wmi: analysis.wmi,
            region: analysis.region,
            modelYear: analysis.modelYears,
            plant: analysis.plant,
            serial: analysis.serial,
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

    els.resultsTitle.textContent = cards.length === 1
        ? '1 barcode found'
        : cards.length + ' barcodes found';

    cards.forEach(function (analysis) {
        els.resultsContent.appendChild(buildVinCard(analysis));
    });

    els.results.hidden = false;
    els.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    analytics.success(source, 'decode', {
        count: cards.length,
        format: cards[0].source
    });

    var decoded = cards.filter(function (a) { return a.ok; }).length;
    if (decoded === cards.length) {
        setTip('Decoded. Upload another image, or switch to the camera for a live label.');
    } else {
        setTip('Decoded, but the value does not read as a VIN — see the notes below.', true);
    }
}

function buildVinCard(analysis) {
    var card = node('article', 'barcode-card');

    var header = node('div', 'barcode-card-header');
    header.appendChild(node('span', 'format-chip', analysis.source || 'Barcode'));

    if (analysis.ok && analysis.checkVerified === true) {
        header.appendChild(node('span', 'tag-ok', 'check digit verified'));
    } else if (analysis.ok && analysis.checkVerified === false) {
        header.appendChild(node('span', 'tag-warn', 'check digit mismatch'));
    } else {
        header.appendChild(node('span', 'tag-bad', 'not a VIN'));
    }
    card.appendChild(header);

    if (analysis.errors.length) {
        card.appendChild(noteList(analysis.errors, 'error'));
    }

    if (analysis.ok) {
        var facts = node('dl', 'facts');
        addFact(facts, 'VIN', analysis.vin, true);
        addFact(facts, 'WMI (pos. 1–3)', analysis.wmi
            + (analysis.region ? ' — ' + analysis.region : ''));
        addFact(facts, 'VDS (pos. 4–8)', analysis.vds);
        addFact(facts, 'Check digit (pos. 9)', analysis.checkChar
            + (analysis.checkVerified ? ' — correct'
                : ' — expected ' + analysis.checkExpected));
        if (analysis.modelYears) {
            addFact(facts, 'Model year (pos. 10)', analysis.modelYears[0] + ' or ' + analysis.modelYears[1]);
        }
        addFact(facts, 'Plant code (pos. 11)', analysis.plant);
        addFact(facts, 'Serial number (pos. 12–17)', analysis.serial);
        card.appendChild(facts);
    }

    if (analysis.notes.length) card.appendChild(noteList(analysis.notes, 'warn'));

    return card;
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
   Manual entry — same validation pipeline as a scan.
   --------------------------------------------------------------------------- */

function handleManualSubmit(event) {
    event.preventDefault();
    if (decodeBusy) {
        setTip('Still decoding the previous image — try again in a moment.', true);
        return;
    }

    var value = els.manualInput.value.trim();
    if (!value) {
        setTip('Type a VIN first — 17 characters.', true);
        return;
    }

    els.results.hidden = false;
    els.resultsContent.replaceChildren();
    els.resultsTitle.textContent = 'Parsed VIN';

    var analysis = vinModel.analyzeBarcodeText(value, 'manual', 'na');
    els.resultsContent.appendChild(buildVinCard(analysis));
    lastPayload = [{
        format: 'manual',
        vin: analysis.vin,
        checkDigit: analysis.checkVerified === true ? 'verified'
            : (analysis.checkVerified === false ? 'failed' : null),
        wmi: analysis.wmi,
        region: analysis.region,
        modelYear: analysis.modelYears,
        plant: analysis.plant,
        serial: analysis.serial,
        notes: analysis.notes,
        errors: analysis.errors
    }];

    if (analysis.ok) {
        setTip('Parsed. The same rules run on every scan.');
        analytics.success('manual', 'parse', { check_ok: analysis.checkVerified });
    } else {
        setTip(analysis.errors[0] || 'That value does not read as a VIN.', true);
        analytics.fail('manual', 'invalid');
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
    Array.prototype.forEach.call(els.scanModeSwitch.querySelectorAll('.mode-option'), function (option) {
        option.addEventListener('click', function () { switchScanMode(option.dataset.mode); });
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
