/*
 * Online EMV QR Code Scanner.
 *
 * Decoding is Dynamsoft Barcode Reader. A payment QR is an ordinary QR Code
 * to the engine, and anything that decodes is parsed locally afterwards —
 * emv-model.js takes the decoded string apart tag by tag, verifies the
 * CRC-16 BEFORE any field is shown, and names the standard fields (currency,
 * MCC, point of initiation) so the result reads like an explanation rather
 * than a hex dump.
 *
 * Inputs share one sink:
 *   - the live camera, decoded continuously by the SDK's own viewfinder
 *   - an image (drop / choose / paste), decoded then parsed
 *   - a bundled sample image, one click away in Upload mode
 *   - a payload string typed or pasted by hand, parsed with no image at all
 *
 * The camera reads QR symbologies only: a Code 128 in frame cannot win the
 * race and pose as the payment code the visitor was aiming at.
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

var emv = window.EmvModel;

/* ---------------------------------------------------------------------------
   License selection

   The hosted demo runs on dynamsoft.com and uses the Codepool license, which
   is bound to that domain. Anywhere else — localhost, a fork, a plain file
   server — that key cannot activate, so fall back to the SDK's public trial
   key and the page still runs instead of showing an activation error.
   --------------------------------------------------------------------------- */

var BOUND_HOSTS = ['dynamsoft.com'];

var CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';

var TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';

function isBoundHost() {
    var host = window.location.hostname.toLowerCase();
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

   An EMV payment QR is a QR Code — EMVCo also allows Micro QR in the wild.
   Narrowing the reader to those two symbologies means a Code 128 on the same
   shelf label cannot win the decode race and be mistaken for the payment
   code the visitor aimed at.

   Settings are derived from the SDK's own ReadBarcodes_Default preset through
   the simplified-settings API. That is deliberate: hand-written template JSON
   is accepted by initSettings() but rejected later by startCapturing(), while
   reading a preset back, changing one field and writing it back cannot
   produce a settings document the engine disagrees with.

   The mask must be the runtime enum, not a list of names: the simplified
   settings object takes a numeric BigInt mask, and BF values past the
   safe-integer range could never be carried faithfully by a JSON number.
   --------------------------------------------------------------------------- */

var PRESET_TEMPLATE = 'ReadBarcodes_Default';

var QR_FORMAT_NAMES = ['BF_QR_CODE', 'BF_MICRO_QR'];

var qrMaskCache = null;

/* OR the QR formats together once. Returns null when the enum is not loaded
   yet, which leaves the preset's own default mask untouched. */
function qrFormatMask() {
    if (qrMaskCache !== null) return qrMaskCache;

    var table = (window.Dynamsoft && Dynamsoft.DBR && Dynamsoft.DBR.EnumBarcodeFormat) || null;
    if (!table) return null;

    var mask = 0n;
    var unknown = [];
    QR_FORMAT_NAMES.forEach(function (name) {
        if (table[name] === undefined) {
            unknown.push(name);
            return;
        }
        mask |= table[name];
    });
    if (unknown.length) console.warn('Barcode formats missing from this SDK build:', unknown);

    qrMaskCache = mask || null;
    return qrMaskCache;
}

var scopeApplied = false;

function applyQrScope() {
    if (!sdkReady || !cvRouter || scopeApplied) return Promise.resolve();
    var mask = qrFormatMask();
    if (mask === null) return Promise.resolve();

    return cvRouter.getSimplifiedSettings(PRESET_TEMPLATE).then(function (settings) {
        settings.barcodeSettings.barcodeFormatIds = mask;
        return cvRouter.updateSettings(PRESET_TEMPLATE, settings);
    }).then(function () {
        scopeApplied = true;
    }).catch(function (error) {
        /* A failed scope change must not stop the scanner: the preset's own
           format list still reads QR codes, just without the narrowing. */
        console.warn('Could not narrow the scan scope to QR:', error);
        scopeApplied = true;
    });
}

/* ---------------------------------------------------------------------------
   State
   --------------------------------------------------------------------------- */

var cameraView = null;
var cameraEnhancer = null;
var cvRouter = null;
var receiver = null;

var mode = 'camera';
var sdkReady = false;

/* The camera keeps streaming while the results panel is open — the viewfinder
   behind it stays live — but incoming results are ignored until it closes. */
var resultsOpen = false;

/* Only one still-image decode at a time; a second click must not interleave. */
var decodeBusy = false;

/* The payload the Copy button hands out. */
var lastPayloadText = '';

var els = {};

/* Bundled samples: static, dynamic, and a dynamic code whose amount was
   tampered after the checksum was computed. */
var SAMPLES = [
    { label: 'Static code', file: 'sample-images/emv-static.png' },
    { label: 'Dynamic · 12.50', file: 'sample-images/emv-dynamic.png' },
    { label: 'Tampered amount', file: 'sample-images/emv-tampered.png' }
];

/* ---------------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------------- */

async function bootstrap() {
    cacheElements();
    wireEvents();
    buildSamples();
    updateModeUI();

    var startedAt = performance.now();
    showLoading('Initializing Dynamsoft Barcode Reader…');

    try {
        await Dynamsoft.License.LicenseManager.initLicense(resolveLicenseKey(), true);

        showLoading('Loading the barcode module…');
        await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
        await initCameraStack();
        sdkReady = true;
        analytics.ready(performance.now() - startedAt);
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

/* Camera viewfinder + decode router. The license must be activated before any
   component is created, or createInstance() throws. */
async function initCameraStack() {
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

    /* Consecutive frames see the same symbol; without deduplication the
       results panel would be re-opened dozens of times a second. */
    var filter = new Dynamsoft.Utility.MultiFrameResultCrossFilter();
    filter.enableResultDeduplication('barcode', true);
    await cvRouter.addResultFilter(filter);

    /* The SDK's own viewfinder UI renders inside this element. */
    els.cameraView.replaceChildren(cameraView.getUIElement());

    receiver = {
        onDecodedBarcodesReceived: function (result) {
            if (resultsOpen || mode !== 'camera') return;
            var items = (result && result.barcodeResultItems) || [];
            if (!items.length) return;
            var picked = pickBarcodeItem(items);
            presentResult(picked.text, 'camera scan', null, 'camera');
        }
    };
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

    await applyQrScope();
    cvRouter.setInput(cameraEnhancer);
    await cvRouter.startCapturing(PRESET_TEMPLATE);
    cvRouter.addResultReceiver(receiver);

    showTip('Point the camera at a payment QR code.');
    analytics.start('emv_qr', 'camera');
}

function startUploadMode() {
    mode = 'upload';
    updateModeUI();
    els.mainContainer.hidden = true;
    els.uploadZone.hidden = false;

    cvRouter.removeResultReceiver(receiver);
    cvRouter.stopCapturing();
    if (cameraEnhancer.isOpen()) cameraEnhancer.close();

    showTip('Load an image of a payment QR, or paste its payload string.');
    analytics.start('emv_qr', 'upload');
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
    return cvRouter.startCapturing(PRESET_TEMPLATE).then(function () {
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

/* Images wider than this are scaled down before decoding: the symbol stays
   legible and a 12-megapixel phone photo does not cost seconds. */
var MAX_DECODE_WIDTH = 4000;

/* The preview shown with the result never exceeds this side; a payment QR is
   small, and a full-width 12-megapixel render adds nothing. */
var MAX_PREVIEW_SIDE = 900;

/* Build the DSImageData shape CaptureVisionRouter.capture() expects: a raw RGBA
   byte buffer straight out of getImageData(), stride 4 x width, format 10
   (IPF_ABGR_8888). This is what the SDK builds internally for its own image
   view. Passing a Blob / HTMLImageElement / canvas instead takes a different
   internal path, and that one can silently return no results. */
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

    var frameData = ctx.getImageData(0, 0, width, height);
    return {
        bytes: new Uint8Array(frameData.data.buffer, frameData.data.byteOffset, frameData.data.length),
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

function decodeImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
        showTip('That file is not an image. Upload a PNG, JPG, BMP or WebP picture of a payment QR.', true);
        return;
    }
    analytics.action('image_load', { type: file.type, size: file.size });
    readAsDataURL(file).then(function (src) {
        return decodeImageSource(src, file.name || 'the image', 'image');
    }).catch(function (error) {
        console.error(error);
        showTip('That file could not be read.', true);
    });
}

function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (event) { resolve(event.target.result); };
        reader.onerror = function () { reject(new Error('The file could not be read.')); };
        reader.readAsDataURL(file);
    });
}

async function decodeImageSource(src, label, source) {
    if (!sdkReady) {
        showTip('The scanner is still starting. Try again in a moment.', true);
        return;
    }
    if (decodeBusy) return;
    decodeBusy = true;

    showTip('Reading ' + label + '…');

    var image;
    try {
        image = await loadImageElement(src);
    } catch (ex) {
        decodeBusy = false;
        showTip('That image could not be loaded: ' + ex.message, true);
        return;
    }

    /* The preview canvas doubles as the decode source's display: the visitor
       sees exactly what was read, scaled to a sane size. */
    var scale = Math.min(1, MAX_PREVIEW_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    var preview = document.createElement('canvas');
    preview.width = Math.max(1, Math.round(image.naturalWidth * scale));
    preview.height = Math.max(1, Math.round(image.naturalHeight * scale));
    preview.getContext('2d').drawImage(image, 0, 0, preview.width, preview.height);

    try {
        analytics.start('emv_qr', source);
        var dsImage = imageToDsImageData(image);
        var outcome = await feedback.run('Decoding the QR…', function () {
            return cvRouter.capture(dsImage, PRESET_TEMPLATE);
        });
        var items = barcodeItemsFrom(outcome);
        if (!items.length) {
            analytics.fail('emv_qr', source);
            showTip('No QR code was found in that image. A sharper shot, or one where the '
                + 'symbol takes up more of the frame, usually fixes this.', true);
            return;
        }
        var picked = pickBarcodeItem(items);
        presentResult(picked.text, label, { canvas: preview }, source);
    } catch (ex) {
        console.error(ex);
        analytics.error('image_decode_failed', String((ex && ex.message) || ex).slice(0, 120));
        showTip('That image could not be read: ' + ((ex && ex.message) || ex), true);
    } finally {
        decodeBusy = false;
    }
}

/* capture() returns a CapturedResult whose items array holds every decoded
   symbol; type 2 is CRIT_BARCODE. */
function barcodeItemsFrom(result) {
    if (!result) return [];
    if (Array.isArray(result.items)) {
        return result.items.filter(function (item) {
            return item && (item.type === 2 || item.type === 'CRIT_BARCODE'
                || typeof item.formatString === 'string');
        });
    }
    if (Array.isArray(result.barcodeResultItems)) return result.barcodeResultItems;
    return [];
}

/* One image can carry several QR codes. If any of them is an EMV payment QR,
   that is the one the visitor came for; otherwise report the first decode
   rather than nothing — "this is a QR, but not a payment QR" is an answer. */
function pickBarcodeItem(items) {
    for (var i = 0; i < items.length; i++) {
        var text = items[i] && items[i].text != null ? String(items[i].text) : '';
        if (emv.looksLikeEmv(text)) return { text: text };
    }
    var first = items[0] || {};
    return { text: first.text != null ? String(first.text) : '' };
}

/* ---------------------------------------------------------------------------
   Manual payload path
   --------------------------------------------------------------------------- */

function parseManual() {
    var text = els.manualInput.value.trim();
    if (!text) {
        showTip('Paste an EMV QR payload string first — it starts with "0002".', true);
        return;
    }
    presentResult(text, 'manual input', null, 'manual');
}

/* ---------------------------------------------------------------------------
   The result panel

   One sink for every input. Order matters: the CRC verdict is rendered
   before the field table, so a tampered payload is announced as tampered
   before its fields appear — the fields render next to a red verdict, never
   as if they were trustworthy.
   --------------------------------------------------------------------------- */

function presentResult(payload, label, outcome, source) {
    resultsOpen = true;
    lastPayloadText = payload;
    els.resultsContent.replaceChildren();

    if (outcome && outcome.canvas) {
        var figure = document.createElement('figure');
        figure.className = 'source-preview';
        figure.appendChild(outcome.canvas);
        var caption = document.createElement('figcaption');
        caption.textContent = label + ' — ' + outcome.canvas.width + ' × ' + outcome.canvas.height + ' px';
        figure.appendChild(caption);
        els.resultsContent.appendChild(figure);
    }

    /* A QR that decodes to something that is not EMV at all — a URL, a
       Wi-Fi login, a vCard — gets a plain answer, not a table of misread
       fields. */
    if (!emv.looksLikeEmv(payload)) {
        els.resultsTitle.textContent = 'Not an EMV payment QR';
        els.resultsContent.appendChild(buildVerdict('bad', 'Decodes as a QR — but not an EMV payment QR',
            'The text "' + preview(payload) + '" does not start with tag 00 = 01 and carries no 6304 '
            + 'checksum. A payment QR always begins "000201" and ends with its CRC.'));
        els.resultsContent.appendChild(buildRawPayload(payload));
        openResultsPanel();
        analytics.fail('emv_qr', source);
        return;
    }

    var parsed = emv.parsePayload(payload);

    if (!parsed.crcValid) {
        els.resultsTitle.textContent = 'Checksum failed';
        els.resultsContent.appendChild(buildVerdict('bad',
            parsed.isDynamic ? 'Tampered dynamic code' : 'Checksum failed',
            parsed.errors[0] || 'The CRC-16 does not match the payload.'));
        els.resultsContent.appendChild(buildFieldSection(parsed));
        els.resultsContent.appendChild(buildRawPayload(payload));
        openResultsPanel();
        analytics.action('parse_crc_failed');
        return;
    }

    if (parsed.errors.length) {
        els.resultsTitle.textContent = 'Not a version 1 payment QR';
        els.resultsContent.appendChild(buildVerdict('bad',
            'Checksum OK — but not a version 1 payment QR', parsed.errors.join(' ')));
        els.resultsContent.appendChild(buildFieldSection(parsed));
        els.resultsContent.appendChild(buildRawPayload(payload));
        openResultsPanel();
        analytics.fail('emv_qr', source);
        return;
    }

    /* CRC valid and structurally sound: summarise what a wallet would act
       on, in the order a payer would care about it. */
    els.resultsTitle.textContent = parsed.isDynamic
        ? 'Valid dynamic payment QR'
        : 'Valid static payment QR';
    els.resultsContent.appendChild(buildVerdict('ok',
        parsed.isDynamic ? 'Valid dynamic payment QR' : 'Valid static payment QR',
        describeSummary(parsed)));
    els.resultsContent.appendChild(buildFieldSection(parsed));

    var walletLabel = document.createElement('p');
    walletLabel.className = 'result-section-label';
    walletLabel.textContent = 'What a wallet does with this — simulated, no money moves';
    els.resultsContent.appendChild(walletLabel);

    var walletMock = document.createElement('div');
    walletMock.className = 'wallet-mock';
    var walletScreen = document.createElement('div');
    walletScreen.className = 'wallet-screen';
    walletMock.appendChild(walletScreen);
    els.resultsContent.appendChild(walletMock);
    renderWalletForm(parsed, walletScreen);

    els.resultsContent.appendChild(buildRawPayload(payload));
    openResultsPanel();
    analytics.success('emv_qr', source, { payload_length: payload.length });
}

function openResultsPanel() {
    els.results.classList.add('is-open');
    els.resultsContent.scrollTop = 0;
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
   Result blocks
   --------------------------------------------------------------------------- */

var VERDICT_ICONS = {
    ok: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" '
        + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>',
    bad: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" '
        + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" />'
        + '<line x1="9" y1="9" x2="15" y2="15" /></svg>'
};

function buildVerdict(state, title, detail) {
    var strip = document.createElement('div');
    strip.className = 'verify-strip ' + (state === 'ok' ? 'is-ok' : 'is-bad');

    var badge = document.createElement('span');
    badge.className = 'verify-badge';
    badge.innerHTML = VERDICT_ICONS[state] || '';
    badge.appendChild(document.createTextNode(title));
    strip.appendChild(badge);

    if (detail) {
        var detailEl = document.createElement('span');
        detailEl.className = 'verify-detail';
        detailEl.textContent = detail;
        strip.appendChild(detailEl);
    }
    return strip;
}

/* Every top-level tag named, nested templates indented under their parents,
   currency and merchant category resolved from their ISO codes. Same
   rendering contract as the generator's, so the two demos read identically. */
function buildFieldSection(parsed) {
    var label = document.createElement('p');
    label.className = 'result-section-label';
    label.textContent = 'Payload fields';
    els.resultsContent.appendChild(label);

    var table = document.createElement('table');
    table.className = 'tag-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Tag', 'Field', 'Value'].forEach(function (text) {
        var th = document.createElement('th');
        th.scope = 'col';
        th.textContent = text;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    parsed.entries.forEach(function (entry) {
        var name = emv.fieldName(entry.tag);
        var display = entry.value;
        var notes = [];

        if (entry.tag === '53') {
            var currency = emv.currencyName(entry.value);
            if (currency) display = entry.value;
            if (currency) notes.push(currency);
        }
        if (entry.tag === '52') {
            var mcc = emv.mccNote(entry.value);
            if (mcc) notes.push(mcc);
        }
        if (entry.tag === '63') {
            notes.push(parsed.crcValid ? 'verified' : 'does not match');
        }
        if (entry.tag === '01') {
            notes.push(entry.value === '12'
                ? 'dynamic, amount fixed by the merchant'
                : 'static, customer types the amount');
        }

        var row = document.createElement('tr');
        row.appendChild(cell('tag-cell', entry.tag));
        row.appendChild(cell('field-cell', name));
        row.appendChild(valueCell(display, notes));
        tbody.appendChild(row);

        if (entry.children && entry.children.length) {
            var templateRow = document.createElement('tr');
            templateRow.className = 'sub-row';
            var templateCell = document.createElement('td');
            templateCell.className = 'template-label-cell';
            templateCell.colSpan = 3;
            templateCell.appendChild(span('template-label',
                entry.tag === '26' || (parseInt(entry.tag, 10) >= 2 && parseInt(entry.tag, 10) <= 51)
                    ? 'Merchant account information'
                    : 'Additional data'));
            templateRow.appendChild(templateCell);
            tbody.appendChild(templateRow);

            entry.children.forEach(function (child) {
                var childName = entry.tag === '62'
                    ? (emv.additionalDataName(child.tag) || 'Sub-tag ' + child.tag)
                    : (child.tag === '00'
                        ? emv.describeGuid(child.value)
                        : 'Sub-tag ' + child.tag);
                var childRow = document.createElement('tr');
                childRow.className = 'sub-row';
                childRow.appendChild(cell('tag-cell', entry.tag + '.' + child.tag));
                childRow.appendChild(cell('field-cell', childName));
                childRow.appendChild(valueCell(child.value, []));
                tbody.appendChild(childRow);
            });
        }
    });
    table.appendChild(tbody);
    return table;
}

function valueCell(display, notes) {
    var td = document.createElement('td');
    td.className = 'value-cell';
    td.appendChild(document.createTextNode(display == null ? '' : String(display)));
    (notes || []).forEach(function (note, index) {
        var el = span('value-note' + (index === 0 ? ' is-first' : ''), note);
        if (/^(verified)$/.test(note)) el.classList.add('is-ok');
        if (/does not match/.test(note)) el.classList.add('is-bad');
        td.appendChild(el);
    });
    return td;
}

function cell(className, text) {
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
}

function span(className, text) {
    var el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
}

function buildRawPayload(payload) {
    var label = document.createElement('p');
    label.className = 'result-section-label';
    label.textContent = 'Raw payload';
    els.resultsContent.appendChild(label);

    var block = document.createElement('div');
    block.className = 'mono-block';
    block.textContent = payload;
    els.resultsContent.appendChild(block);
    return block;
}

function preview(text) {
    var s = String(text || '');
    return s.length <= 60 ? s : s.slice(0, 30) + '…' + s.slice(-24);
}

function describeSummary(parsed) {
    function valueOf(tag) {
        var e = parsed.entries.find(function (x) { return x.tag === tag; });
        return e ? e.value : null;
    }

    var parts = [];

    var amount = valueOf('54');
    var currency = valueOf('53');
    var currencyName = currency ? emv.currencyName(currency) : null;
    if (parsed.isDynamic && amount) {
        parts.push('Requests ' + currencyName + ' ' + amount);
    } else {
        parts.push('Amount is typed by the customer'
            + (currencyName ? ' in ' + currencyName : ''));
    }

    var name = valueOf('59');
    if (name) parts.push('to ' + name);

    var mcc = valueOf('52');
    var mccNote = mcc ? emv.mccNote(mcc) : null;
    if (mccNote) parts.push('(' + mccNote.toLowerCase() + ')');

    var additional = parsed.entries.find(function (x) { return x.tag === '62'; });
    if (additional && additional.children) {
        var ref = additional.children.find(function (c) { return c.tag === '05' || c.tag === '02' || c.tag === '00'; });
        if (ref) parts.push('· reference ' + ref.value);
    }

    parts.push('· CRC-16 ' + parsed.crcComputed + ' verified.');
    return parts.join(' ');
}

/* ---------------------------------------------------------------------------
   Wallet simulation

   The table answers "what is in the payload"; this answers "so what". The
   screen a payer's wallet shows is built from exactly the fields parsed
   above — no payment provider is contacted, the confirm step produces a
   local mock receipt. Static codes take the other branch a real wallet
   takes: the payer types the amount, because the sticker was printed once
   and carries no figure.
   --------------------------------------------------------------------------- */

var CURRENCY_SYMBOLS = { '840': '$', '978': '€', '826': '£', '156': '¥', '392': '¥', '344': 'HK$', '702': 'S$', '036': 'A$', '124': 'C$', '764': '฿', '410': '₩', '458': 'RM', '608': '₱' };

function valueOfEntry(parsed, tag) {
    var e = parsed.entries.find(function (x) { return x.tag === tag; });
    return e ? e.value : null;
}

function childValueOfEntry(parsed, tag, childTag) {
    var e = parsed.entries.find(function (x) { return x.tag === tag; });
    if (!e || !e.children) return null;
    var c = e.children.find(function (x) { return x.tag === childTag; });
    return c ? c.value : null;
}

function walletButton(label, className) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    return b;
}

function walletMetaRow(term, value) {
    var dt = document.createElement('dt');
    dt.textContent = term;
    var dd = document.createElement('dd');
    dd.textContent = value;
    return [dt, dd];
}

function renderWalletForm(parsed, screen) {
    screen.textContent = '';

    var kicker = document.createElement('div');
    kicker.className = 'wallet-kicker';
    kicker.textContent = parsed.isDynamic ? 'Payment request' : 'Merchant payment code';
    screen.appendChild(kicker);

    var name = document.createElement('div');
    name.className = 'wallet-merchant';
    name.textContent = valueOfEntry(parsed, '59') || 'Unnamed merchant';
    screen.appendChild(name);

    var sub = document.createElement('div');
    sub.className = 'wallet-sub';
    var city = valueOfEntry(parsed, '60');
    var country = valueOfEntry(parsed, '58');
    sub.textContent = [city, country].filter(Boolean).join(', ') || '—';
    screen.appendChild(sub);

    var currency = valueOfEntry(parsed, '53') || '';
    var currencyName = emv.currencyName(currency) || currency;

    if (parsed.isDynamic) {
        var amount = document.createElement('div');
        amount.className = 'wallet-amount';
        var sym = document.createElement('span');
        sym.className = 'wallet-currency';
        sym.textContent = (CURRENCY_SYMBOLS[currency] || currencyName + ' ');
        amount.appendChild(sym);
        amount.appendChild(document.createTextNode(valueOfEntry(parsed, '54') || '0.00'));
        screen.appendChild(amount);
    } else {
        var note = document.createElement('div');
        note.className = 'wallet-type';
        note.textContent = 'Static code: the sticker carries no amount, so the wallet asks you to type one (' + currencyName + ').';
        screen.appendChild(note);
        var inputRow = document.createElement('div');
        inputRow.className = 'wallet-amount-input';
        var input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.placeholder = '0.00';
        input.setAttribute('aria-label', 'Amount in ' + currencyName);
        inputRow.appendChild(input);
        screen.appendChild(inputRow);
    }

    var meta = document.createElement('dl');
    meta.className = 'wallet-meta';
    var mcc = valueOfEntry(parsed, '52');
    if (mcc) walletMetaRow('Category', emv.mccNote(mcc) || ('MCC ' + mcc)).forEach(function (el) { meta.appendChild(el); });
    var bill = childValueOfEntry(parsed, '62', '00');
    if (bill) walletMetaRow('Bill number', bill).forEach(function (el) { meta.appendChild(el); });
    var ref = childValueOfEntry(parsed, '62', '05') || childValueOfEntry(parsed, '62', '02');
    if (ref) walletMetaRow('Reference', ref).forEach(function (el) { meta.appendChild(el); });
    if (meta.children.length) screen.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'wallet-actions';
    var primary = walletButton(parsed.isDynamic ? 'Confirm payment' : 'Continue', 'btn btn-primary');
    var cancel = walletButton('Cancel', 'btn btn-secondary');
    actions.appendChild(primary);
    actions.appendChild(cancel);
    screen.appendChild(actions);

    function typedAmount() {
        return parsed.isDynamic ? valueOfEntry(parsed, '54') : input.value.trim();
    }

    primary.addEventListener('click', function () {
        var amount = typedAmount();
        if (!parsed.isDynamic && !/^[0-9]+([.][0-9]{1,2})?$/.test(amount)) {
            input.focus();
            return;
        }
        showWalletReceipt(parsed, amount, currencyName, screen);
        analytics.action('wallet_confirm', { dynamic: parsed.isDynamic });
    });
    cancel.addEventListener('click', function () {
        renderWalletForm(parsed, screen);
    });
}

function showWalletReceipt(parsed, amount, currencyName, screen) {
    screen.textContent = '';

    var title = document.createElement('div');
    title.className = 'wallet-kicker';
    title.textContent = 'Simulated receipt';
    screen.appendChild(title);

    var head = document.createElement('div');
    head.className = 'wallet-merchant';
    head.textContent = 'Paid to ' + (valueOfEntry(parsed, '59') || 'merchant');
    screen.appendChild(head);

    var amountLine = document.createElement('div');
    amountLine.className = 'wallet-amount';
    var sym = document.createElement('span');
    sym.className = 'wallet-currency';
    sym.textContent = CURRENCY_SYMBOLS[valueOfEntry(parsed, '53')] || (currencyName + ' ');
    amountLine.appendChild(sym);
    amountLine.appendChild(document.createTextNode(amount));
    screen.appendChild(amountLine);

    var receipt = document.createElement('div');
    receipt.className = 'wallet-receipt';
    var receiptTitle = document.createElement('div');
    receiptTitle.className = 'wallet-receipt-title';
    receiptTitle.textContent = 'Authorized (simulated)';
    receipt.appendChild(receiptTitle);

    var auth = 'SIM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    var p1 = document.createElement('p');
    p1.appendChild(document.createTextNode('Auth code '));
    var code = document.createElement('span');
    code.className = 'wallet-authref';
    code.textContent = auth;
    p1.appendChild(code);
    p1.appendChild(document.createTextNode(' — a real wallet would now call its PSP to move ' + currencyName + ' ' + amount + '.'));
    receipt.appendChild(p1);

    var ref = childValueOfEntry(parsed, '62', '05') || childValueOfEntry(parsed, '62', '02') || childValueOfEntry(parsed, '62', '00');
    if (ref) {
        var p2 = document.createElement('p');
        p2.appendChild(document.createTextNode('The reference '));
        var refSpan = document.createElement('span');
        refSpan.className = 'wallet-authref';
        refSpan.textContent = ref;
        p2.appendChild(refSpan);
        p2.appendChild(document.createTextNode(' travels back with the payment, so the merchant reconciles this settlement against bill/invoice ' + ref + ' — that is what tag 62 is for.'));
        receipt.appendChild(p2);
    }
    screen.appendChild(receipt);

    var again = walletButton('Reset the simulation', 'btn btn-secondary');
    var wrap = document.createElement('div');
    wrap.className = 'wallet-actions';
    wrap.appendChild(again);
    screen.appendChild(wrap);
    again.addEventListener('click', function () {
        renderWalletForm(parsed, screen);
    });
}

/* ---------------------------------------------------------------------------
   Bundled samples
   --------------------------------------------------------------------------- */

function buildSamples() {
    SAMPLES.forEach(function (sample) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sample-chip';

        var thumb = document.createElement('img');
        thumb.src = sample.file;
        thumb.alt = '';
        thumb.width = 26;
        thumb.height = 26;
        chip.appendChild(thumb);

        chip.appendChild(document.createTextNode(sample.label));
        chip.addEventListener('click', function (event) {
            event.stopPropagation();
            analytics.action('sample_load', { sample: sample.label });
            decodeImageSource(sample.file, 'sample: ' + sample.label, 'sample');
        });
        els.sampleRow.appendChild(chip);
    });
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

function copyPayload() {
    if (!lastPayloadText) return;

    var button = els.copyPayload;
    var reset = button.textContent;
    function flash(message) {
        button.textContent = message;
        setTimeout(function () { button.textContent = reset; }, 1600);
    }

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        flash('Copy not supported');
        return;
    }
    navigator.clipboard.writeText(lastPayloadText).then(function () {
        analytics.action('copy_payload');
        flash('Copied');
    }, function () {
        flash('Copy blocked');
    });
}

/* ---------------------------------------------------------------------------
   Events
   --------------------------------------------------------------------------- */

function wireEvents() {
    Array.prototype.forEach.call(els.modeSwitch.querySelectorAll('.mode-option'), function (option) {
        option.addEventListener('click', function () { switchMode(option.dataset.mode); });
    });

    els.uploadZone.addEventListener('click', function (event) {
        /* The sample chips and the payload parser live inside the zone; let
           their own handlers own the click so the file dialog opens exactly
           once. */
        if (event.target.closest('.sample-chip') || event.target.closest('.payload-row')) return;
        els.uploadInput.click();
    });
    els.uploadZone.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            els.uploadInput.click();
        }
    });

    els.uploadInput.addEventListener('change', function () {
        if (els.uploadInput.files && els.uploadInput.files[0]) {
            decodeImageFile(els.uploadInput.files[0]);
        }
        els.uploadInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (name) {
        els.uploadZone.addEventListener(name, function (event) {
            event.preventDefault();
            els.uploadZone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (name) {
        els.uploadZone.addEventListener(name, function (event) {
            event.preventDefault();
            els.uploadZone.classList.remove('dragover');
        });
    });
    els.uploadZone.addEventListener('drop', function (event) {
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) decodeImageFile(file);
    });

    /* Paste an image or a payload string anywhere on the page. Screenshot →
       paste is the shortest path from a wallet to a parse. */
    document.addEventListener('paste', function (event) {
        if (resultsOpen) return;
        var items = (event.clipboardData && event.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type && items[i].type.indexOf('image/') === 0) {
                if (mode !== 'upload') switchMode('upload');
                decodeImageFile(items[i].getAsFile());
                return;
            }
        }
        /* Pasted text that looks like a payload goes straight to the parser. */
        var text = event.clipboardData && event.clipboardData.getData('text/plain');
        if (text && emv.looksLikeEmv(text.trim())) {
            if (mode !== 'upload') switchMode('upload');
            els.manualInput.value = text.trim();
            parseManual();
        }
    });

    els.manualButton.addEventListener('click', function (event) {
        event.stopPropagation();
        parseManual();
    });
    els.manualInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') parseManual();
    });

    els.closeResults.addEventListener('click', function () { closeResults(true); });
    els.copyPayload.addEventListener('click', copyPayload);
}

function cacheElements() {
    els.tip = document.getElementById('tip-message');
    els.cameraView = document.getElementById('camera-view');
    els.mainContainer = document.getElementById('main-container');
    els.modeSwitch = document.getElementById('mode-switch-container');
    els.uploadZone = document.getElementById('upload-zone');
    els.uploadInput = document.getElementById('upload-input');
    els.sampleRow = document.getElementById('sample-row');
    els.manualInput = document.getElementById('manual-input');
    els.manualButton = document.getElementById('manual-button');
    els.results = document.getElementById('results');
    els.resultsTitle = document.getElementById('results-title');
    els.resultsContent = document.getElementById('results-content');
    els.copyPayload = document.getElementById('copy-payload-button');
    els.closeResults = document.getElementById('close-results-button');
    els.loading = document.getElementById('loading-overlay');
    els.loadingText = document.getElementById('loading-text');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
