/*
 * Online EMV QR Code Generator.
 *
 * The form collects merchant and transaction fields, emv-model.js assembles
 * them into an EMVCo merchant-presented TLV payload with its CRC-16 checksum,
 * and bwip-js renders the symbol at error-correction level M. All of that is
 * local: no license, no SDK, no network beyond fonts and the bwip-js script.
 *
 * On demand — the "Verify it scans" button — Dynamsoft Barcode Reader
 * activates and decodes the rendered image, and the result is compared
 * against the payload that was just built.
 *
 * That last step is the point of the demo, and it is deliberately not
 * automatic. A QR image that renders is not evidence of anything: it looks
 * identical whether the payload is a valid payment QR or a truncated string
 * of digits. Decoding the symbol back and diffing it field by field is what
 * makes "this QR scans" a statement you can check rather than assume — but
 * the reader is scanner-side machinery, so a generator that activated it on
 * page load (license handshake, WASM download, a trial dialog) before the
 * visitor asked for anything would be the wrong trade. The strip keeps the
 * verdict until the payload changes, so editing a field flips it to
 * "verify again" instead of re-running on every keystroke.
 */

/* Analytics shim: the shared tracker is optional. If it fails to load (ad
   blocker, offline, opened from a plain folder) the demo still runs. */
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

   The hosted demo runs on dynamsoft.com and uses the Codepool license, which is
   bound to that domain. Anywhere else — localhost, a fork, a plain file server —
   that key cannot activate, so fall back to the SDK's public trial key and the
   page still runs instead of showing an activation error.
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
   State
   --------------------------------------------------------------------------- */

var els = {};
var cvRouter = null;
var readerActivated = false;   // DBR activates lazily, on the first Verify click
var readerActivating = false;
var verifyBusy = false;
var verifiedPayload = null;    // payload that has passed the round trip
var lastPayload = '';

/* The symbology the reader should look for. EMV payment QR is always a QR
   Code. The format list is deliberately NOT narrowed: ReadBarcodes_Balance
   already reads QR alongside the other common 2D symbols, and replacing its
   format set with a QR-only mask was observed to return nothing on a clean,
   freshly rendered symbol. Leaving the preset's own format list alone decodes
   the same symbol without that risk, and an image containing only one QR has
   nothing else for the extra formats to match. */
var PRESET_TEMPLATE = 'ReadBarcodes_Balance';

async function applySettings() {
    /* Read a preset back and write it back unchanged, rather than
       hand-writing template JSON: a hand-written document is accepted by
       initSettings() and then rejected by startCapturing() with [-10038]. */
    var settings = await cvRouter.getSimplifiedSettings(PRESET_TEMPLATE);
    await cvRouter.updateSettings(PRESET_TEMPLATE, settings);
}

/* ---------------------------------------------------------------------------
   Randomization

   A visitor's first move is rarely typing a merchant name; it is clicking
   "randomize" and looking at what changes. The pool keeps every combination
   internally consistent — the city belongs to the country, the country to
   the currency — because a random US merchant in Berlin with a yen amount
   teaches the wrong lesson about fields that travel together.
   --------------------------------------------------------------------------- */

var RANDOM_SCHEMES = [
    { currency: '840', country: 'US', cities: ['NEW YORK', 'SEATTLE', 'AUSTIN', 'CHICAGO'], postal: function () { return digits(5); } },
    { currency: '978', country: 'DE', cities: ['BERLIN', 'MUNICH', 'HAMBURG'], postal: function () { return digits(5); } },
    { currency: '978', country: 'FR', cities: ['PARIS', 'LYON'], postal: function () { return digits(5); } },
    { currency: '826', country: 'GB', cities: ['LONDON', 'MANCHESTER', 'LEEDS'], postal: function () { return 'LS' + digits(2) + ' ' + digits(2) + digit() + String.fromCharCode(65 + randomInt(0, 25)) + String.fromCharCode(65 + randomInt(0, 25)); } },
    { currency: '156', country: 'CN', cities: ['SHANGHAI', 'BEIJING', 'SHENZHEN'], postal: function () { return digits(6); } },
    { currency: '344', country: 'HK', cities: ['HONG KONG'], postal: function () { return '999077'; } },
    { currency: '702', country: 'SG', cities: ['SINGAPORE'], postal: function () { return digits(6); } },
    { currency: '392', country: 'JP', cities: ['TOKYO', 'OSAKA'], postal: function () { return String(100 + randomInt(0, 899)) + '-' + digits(4); } }
];

var RANDOM_NAMES = [
    'BLUE ANCHOR GRILL', 'PAPER LANTERN', 'COPPER GATE BOOKS',
    'NORTH LOOP COFFEE', 'SUNRISE MARKET', 'HARBOR BAKERY',
    'ORCHARD ELECTRONICS', 'RIVERSIDE FLOWERS', 'STATIONERY AND CO'
];

/* Only MCCs the table can name — a random code the page cannot explain is a
   wasted teachable moment. */
var RANDOM_MCCS = ['5411', '5812', '5814', '4121', '5912', '7011'];

function digits(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += randomInt(0, 9);
    return s;
}

function digit() {
    return String(randomInt(0, 9));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
    return list[randomInt(0, list.length - 1)];
}

function randomFields() {
    var scheme = pick(RANDOM_SCHEMES);
    var amount = randomInt(3, 180) + '.' + String(randomInt(0, 99)).padStart(2, '0');
    var refChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    var ref = 'REF-';
    for (var i = 0; i < 6; i++) ref += refChars[randomInt(0, refChars.length - 1)];

    return {
        pointOfInitiation: els.poi.value,
        maiTag: '26',
        guid: 'com.dynamsoft.demo',
        merchantId: 'MERCHANT-' + digits(4),
        mcc: pick(RANDOM_MCCS),
        currency: scheme.currency,
        amount: els.poi.value === '12' ? amount : '',
        tipIndicator: '',
        country: scheme.country,
        merchantName: pick(RANDOM_NAMES),
        merchantCity: pick(scheme.cities),
        postalCode: scheme.postal(),
        billNumber: 'INV-2026-' + digits(4),
        referenceLabel: ref
    };
}

function randomize() {
    var before = captureFormValues();
    writeFields(randomFields());
    markChanged(before);
    render();
    analytics.action('randomize');
}

/* ---------------------------------------------------------------------------
   "Just changed" marker

   Same pattern as the GS1 generator: remember the values before a Randomize
   or preset swap, then wash whichever inputs differ so the click visibly did
   something. The class removes itself on a timer; a follow-up render never
   re-applies it.
   --------------------------------------------------------------------------- */

var HIGHLIGHT_MS = 1700;
var highlightTimer = null;

/* The inputs a Randomize or preset can move, in a fixed order so before/after
   indexes line up. */
function highlightableInputs() {
    return [els.guid, els.merchantId, els.mcc, els.currency, els.amount,
    els.tip, els.country, els.merchantName, els.merchantCity, els.postal,
    els.bill, els.reference, els.poi];
}

function captureFormValues() {
    return highlightableInputs().map(function (input) { return input.value; });
}

function markChanged(before) {
    var inputs = highlightableInputs();
    var changed = [];
    inputs.forEach(function (input, index) {
        if (input.value === before[index]) return;
        var group = input.closest('.form-group');
        if (!group || group.offsetParent === null) return;  // skip hidden (amount on static)
        /* Force a reflow so a second click on the same field restarts the
           animation instead of looking like nothing happened. */
        group.classList.remove('just-changed');
        void group.offsetWidth;
        group.classList.add('just-changed');
        changed.push(group);
    });

    if (highlightTimer) clearTimeout(highlightTimer);
    if (changed.length) {
        highlightTimer = setTimeout(function () {
            changed.forEach(function (group) { group.classList.remove('just-changed'); });
        }, HIGHLIGHT_MS);
    }
}

/* ---------------------------------------------------------------------------
   Form <-> fields
   --------------------------------------------------------------------------- */

function readFields() {
    return {
        pointOfInitiation: els.poi.value,
        maiTag: '26',
        guid: els.guid.value.trim(),
        merchantId: els.merchantId.value.trim(),
        mcc: els.mcc.value.trim(),
        currency: els.currency.value.trim(),
        amount: els.amount.value.trim(),
        tipIndicator: els.tip.value.trim(),
        country: els.country.value.trim().toUpperCase(),
        merchantName: els.merchantName.value.trim(),
        merchantCity: els.merchantCity.value.trim(),
        postalCode: els.postal.value.trim(),
        billNumber: els.bill.value.trim(),
        referenceLabel: els.reference.value.trim()
    };
}

function writeFields(fields) {
    els.poi.value = fields.pointOfInitiation || '12';
    els.guid.value = fields.guid || '';
    els.merchantId.value = fields.merchantId || '';
    els.mcc.value = fields.mcc || '';
    els.currency.value = fields.currency || '';
    els.amount.value = fields.amount || '';
    els.tip.value = fields.tipIndicator || '';
    els.country.value = fields.country || '';
    els.merchantName.value = fields.merchantName || '';
    els.merchantCity.value = fields.merchantCity || '';
    els.postal.value = fields.postalCode || '';
    els.bill.value = fields.billNumber || '';
    els.reference.value = fields.referenceLabel || '';
}

/* A static code leaves the amount to the customer, so the amount field is
   hidden rather than disabled: a disabled field that still holds a value is a
   trap, and hiding it says plainly that the value is not in the payload. */
function updateAmountVisibility() {
    els.amountRow.hidden = els.poi.value !== '12';
}

/* ---------------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------------- */

/* EMVCo specifies error-correction level M for payment QR codes. Level M
   survives roughly 15% damage, which is what makes a payment code readable
   from a screen at an angle.

   backgroundcolor is not cosmetic: without it bwip-js leaves the background
   TRANSPARENT. On the page that looks fine (the white page shows through),
   but toDataURL keeps the alpha channel and a decoder composites transparent
   onto black — the whole symbol reads as one dark rectangle and decodes to
   nothing. White here is what makes the round trip below possible. */
function renderQr(payload) {
    var scale = 6;
    var padding = 12;

    var ok = bwipjs.toCanvas(els.canvas, {
        bcid: 'qrcode',
        text: payload,
        scale: scale,
        padding: padding,
        eclevel: 'M',
        backgroundcolor: 'FFFFFF',
        includetext: false
    });

    if (!ok) {
        els.renderHint.textContent = 'The payload could not be rendered as a QR code.';
        return false;
    }

    els.renderHint.textContent = 'QR Code, error-correction level M, ' + scale
        + ' px per module. White background, quiet zone intact — both required for a symbol to decode.';
    return true;
}

function downloadPng() {
    if (!lastPayload) return;
    try {
        var url = els.canvas.toDataURL('image/png');
        var link = document.createElement('a');
        link.href = url;
        link.download = 'emv-qr-' + (els.poi.value === '12' ? 'dynamic' : 'static') + '.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        analytics.action('download_png');
    } catch (ex) {
        console.error(ex);
        alert('Could not export the PNG: ' + ex.message);
    }
}

/* ---------------------------------------------------------------------------
   Field table

   Shows what the payload actually contains, not what was typed. The sub-tags
   of a nested template are indented under their parent so the structure reads
   the way the specification describes it.
   --------------------------------------------------------------------------- */

function renderTagTable(parsed) {
    var body = els.tagTableBody;
    body.textContent = '';

    parsed.entries.forEach(function (entry) {
        var name = emv.fieldName(entry.tag);
        var display = entry.value;

        /* Name the things a reader would otherwise have to look up. */
        if (entry.tag === '53') {
            var currency = emv.currencyName(entry.value);
            if (currency) display = entry.value + ' — ' + currency;
        }
        if (entry.tag === '52') {
            var mcc = emv.mccNote(entry.value);
            if (mcc) display = entry.value + ' — ' + mcc;
        }
        if (entry.tag === '63') {
            display = entry.value + (parsed.crcValid ? ' — verified' : ' — does not match');
        }
        if (entry.tag === '00' && entry.children && entry.children[0]) {
            display = entry.value + ' (' + emv.describeGuid(entry.children[0].value) + ')';
        }

        var row = document.createElement('tr');
        row.appendChild(cell('tag-cell', entry.tag));
        row.appendChild(cell('', name));
        row.appendChild(cell('value-cell', display));
        body.appendChild(row);

        if (entry.children && entry.children.length) {
            var label = document.createElement('tr');
            label.className = 'sub-row';
            var labelCell = cell('template-label-cell', '');
            labelCell.appendChild(span('template-label',
                entry.tag === '26' || entry.tag === '51'
                    ? 'Merchant account information'
                    : 'Additional data'));
            labelCell.colSpan = 3;
            label.appendChild(labelCell);
            body.appendChild(label);

            entry.children.forEach(function (child) {
                var childName = entry.tag === '62'
                    ? (emv.additionalDataName(child.tag) || 'Sub-tag ' + child.tag)
                    : (child.tag === '00'
                        ? emv.describeGuid(child.value)
                        : 'Sub-tag ' + child.tag);
                var childRow = document.createElement('tr');
                childRow.className = 'sub-row';
                childRow.appendChild(cell('tag-cell', entry.tag + '.' + child.tag));
                childRow.appendChild(cell('', childName));
                childRow.appendChild(cell('value-cell', child.value));
                body.appendChild(childRow);
            });
        }
    });
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

/* ---------------------------------------------------------------------------
   The round trip — on demand

   The generator's job is to build a payload and render it; that happens
   locally and needs nothing but bwip-js. Decoding the symbol back is how the
   page PROVES the payload scans, but Dynamsoft Barcode Reader belongs to the
   scanner side of this pair, so it is activated lazily: nothing loads, no
   license is touched, and no trial dialog appears until the visitor clicks
   "Verify it scans". A generator that phones home on page load — to activate
   a license for a feature the visitor may never use — would be the wrong
   trade for a page whose whole payload is built locally.

   The strip keeps its verdict until the payload changes: editing a field
   flips it to "payload changed" rather than re-verifying on every keystroke.
   --------------------------------------------------------------------------- */

async function runVerify() {
    if (verifyBusy || !lastPayload) return;
    verifyBusy = true;
    els.verifyButton.disabled = true;

    try {
        if (!readerActivated) {
            setVerifyState('pending', 'Activating the barcode reader…',
                'First verification only: the SDK activates and loads its module.');
            await Dynamsoft.License.LicenseManager.initLicense(resolveLicenseKey(), true);
            await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
            cvRouter = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
            await applySettings();
            readerActivated = true;
        }

        setVerifyState('pending', 'Decoding…', 'Reading the rendered symbol back with Dynamsoft Barcode Reader.');

        var decoded = null;
        var result = await cvRouter.capture(els.canvas.toDataURL('image/png'));
        var items = (result && result.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                decoded = items[i];
                break;
            }
        }

        if (!decoded) {
            setVerifyState('bad', 'Nothing decoded',
                'The reader did not find a QR code in the rendered image. This is a rendering failure, not a '
                + 'payload failure — try a larger scale or a shorter payload.');
            return;
        }

        if (decoded.text !== lastPayload) {
            /* A mismatch here is the interesting case: it means the symbol
               carries something other than what was built, and the two are
               shown side by side so the difference is visible rather than
               merely asserted. */
            setVerifyState('bad', 'Round trip mismatch',
                'The decoded text differs from the payload that produced it. Built: '
                + preview(lastPayload) + ' · Decoded: ' + preview(decoded.text));
            return;
        }

        /* The decoded string matched byte for byte. Now parse it as EMV, which
           is the check that actually matters: a matching string with a broken
           checksum is still not a payment QR. */
        var parsed = emv.parsePayload(decoded.text);
        if (!parsed.crcValid) {
            setVerifyState('bad', 'Decoded, but the checksum fails',
                parsed.errors[0] || 'The CRC-16 does not match the payload.');
            return;
        }
        if (parsed.errors.length) {
            setVerifyState('bad', 'Decoded, but not a valid payment QR',
                parsed.errors.join(' '));
            return;
        }

        verifiedPayload = lastPayload;
        setVerifyState('ok', 'Round trip verified',
            'Dynamsoft Barcode Reader decoded the symbol, and its text matches the payload byte for byte. '
            + 'CRC-16 ' + parsed.crcComputed + ' checks out against the payload.');

        analytics.success('emv_qr', 'round_trip', {
            dynamic: parsed.isDynamic,
            payload_length: decoded.text.length
        });
    } catch (ex) {
        console.error(ex);
        analytics.error('verify_failed', (ex && ex.message) || String(ex));
        setVerifyState('bad', 'Verification failed',
            'Dynamsoft Barcode Reader could not complete: ' + ((ex && ex.message) || ex)
            + ' — the QR and the payload above are still correct; you can retry.');
    } finally {
        verifyBusy = false;
        els.verifyButton.disabled = false;
        syncVerifyButton();
    }
}

/* After every render, decide what the strip should say based on whether the
   payload on screen is the one that was verified. */
function syncVerifyState() {
    if (!lastPayload) {
        setVerifyState('pending', 'Fix the fields above',
            'The payload is not built while the form is invalid, so nothing stale is left on screen.');
        syncVerifyButton();
        return;
    }
    if (verifiedPayload === lastPayload) {
        setVerifyState('ok', 'Round trip verified',
            'Dynamsoft Barcode Reader decoded this exact payload byte for byte and its CRC-16 checks out.');
    } else if (verifiedPayload !== null || readerActivated) {
        setVerifyState('pending', 'Payload changed — verify again',
            'The symbol on screen has not been read back yet.');
    } else {
        setVerifyState('pending', 'Not yet verified',
            'The payload above is rendered as a QR Code. To prove it scans, the symbol is decoded '
            + 'back and compared byte for byte.');
    }
    syncVerifyButton();
}

function syncVerifyButton() {
    var show = !verifyBusy && lastPayload && verifiedPayload !== lastPayload;
    els.verifyButton.hidden = !show;
}

function preview(text) {
    var s = String(text || '');
    return s.length <= 60 ? s : s.slice(0, 30) + '…' + s.slice(-24);
}

function setVerifyState(state, title, detail) {
    els.verifyStrip.classList.remove('is-ok', 'is-bad');
    if (state === 'ok') els.verifyStrip.classList.add('is-ok');
    if (state === 'bad') els.verifyStrip.classList.add('is-bad');
    els.verifyBadge.textContent = title;
    els.verifyDetail.textContent = detail;
}

/* ---------------------------------------------------------------------------
   Hints and validation
   --------------------------------------------------------------------------- */

/* The currency and MCC hints name the codes as the visitor types. Naming a
   4217 currency is the difference between "840" being usable and being a
   puzzle; the raw code stays visible either way. */
function updateHints() {
    var currency = els.currency.value.trim();
    var currencyName = emv.currencyName(currency);
    els.currencyHint.textContent = currency
        ? (currencyName
            ? currency + ' = ' + currencyName
            : (currency.length === 3 ? 'Not an active ISO 4217 numeric code.' : 'Three digits, ISO 4217 numeric.'))
        : 'Three digits, ISO 4217 numeric — 840 is USD, 978 is EUR.';

    var mcc = els.mcc.value.trim();
    var mccNote = emv.mccNote(mcc);
    els.mccHint.textContent = mcc
        ? (mccNote || 'ISO 18245, four digits.')
        : 'ISO 18245, four digits.';

    var guid = els.guid.value.trim();
    els.guidHint.textContent = guid
        ? emv.describeGuid(guid) + ' — shown verbatim.'
        : 'Shown verbatim — an unknown GUID is not an error.';

    /* Character counters against the EMVCo limits, so the limit is discovered
       while typing instead of at submission. */
    var nameLen = els.merchantName.value.length;
    els.merchantNameHint.textContent = nameLen
        ? nameLen + ' / 25 characters'
        : 'Up to 25 characters.';
    els.merchantNameHint.style.color = nameLen > 25 ? 'var(--dy-error)' : '';

    var cityLen = els.merchantCity.value.length;
    els.merchantCityHint.textContent = cityLen
        ? cityLen + ' / 15 characters'
        : 'Up to 15 characters.';
    els.merchantCityHint.style.color = cityLen > 15 ? 'var(--dy-error)' : '';
}

function showValidationErrors(errors) {
    if (!errors.length) {
        els.validationErrors.hidden = true;
        els.validationErrors.textContent = '';
        return;
    }
    els.validationErrors.hidden = false;
    els.validationErrors.textContent = '';

    var list = document.createElement('ul');
    list.className = 'note-list';
    errors.forEach(function (message) {
        var li = document.createElement('li');
        li.textContent = message;
        list.appendChild(li);
    });
    els.validationErrors.appendChild(list);
}

/* ---------------------------------------------------------------------------
   Main render
   --------------------------------------------------------------------------- */

function render() {
    var fields = readFields();
    updateAmountVisibility();
    updateHints();

    /* The amount field is hidden on a static code, so an amount left in the
       DOM from switching modes must not leak into the payload. */
    if (fields.pointOfInitiation === '11') {
        fields.amount = '';
        fields.tipIndicator = '';
    }

    var errors = emv.validateFields(Object.assign({ formatIndicator: '01' }, fields));
    showValidationErrors(errors);

    if (errors.length) {
        /* Validation failed: clear the symbol rather than leave a stale QR
           on screen that no longer matches the form. A QR that does not match
           the fields above it is worse than no QR. */
        lastPayload = '';
        clearCanvas();
        els.payloadText.textContent = '';
        els.tagTableBody.textContent = '';
        els.payloadLength.textContent = '';
        els.crcNote.textContent = '';
        syncVerifyState();
        return;
    }

    var payload;
    try {
        payload = emv.buildPayload(fields);
    } catch (ex) {
        /* tlv() throws on a value longer than 99 characters; validateFields()
           does not check every field, so the throw is the backstop. */
        console.error(ex);
        showValidationErrors([ex.message]);
        lastPayload = '';
        clearCanvas();
        return;
    }

    lastPayload = payload;
    els.payloadText.textContent = payload;
    els.payloadLength.textContent = payload.length + ' characters';

    var parsed = emv.parsePayload(payload);
    renderTagTable(parsed);
    els.crcNote.textContent = parsed.crcValid
        ? 'CRC-16/CCITT-FALSE ' + parsed.crcComputed + ', computed over the payload up to and including '
            + 'the 6304 header. "Verify it scans" below decodes the rendered symbol and confirms it.'
        : parsed.errors.join(' ');

    els.versionBadge.textContent = parsed.isDynamic
        ? 'Dynamic · 01 = 12'
        : 'Static · 01 = 11';

    if (renderQr(payload)) {
        syncVerifyState();
    }
}

function clearCanvas() {
    var ctx = els.canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
    els.renderHint.textContent = '';
}

/* ---------------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------------- */

function cacheElements() {
    els.preset = document.getElementById('preset-select');
    els.randomButton = document.getElementById('random-button');
    els.poi = document.getElementById('poi-select');
    els.guid = document.getElementById('guid-input');
    els.merchantId = document.getElementById('merchant-id-input');
    els.mcc = document.getElementById('mcc-input');
    els.mccHint = document.getElementById('mcc-hint');
    els.currency = document.getElementById('currency-input');
    els.currencyHint = document.getElementById('currency-hint');
    els.amount = document.getElementById('amount-input');
    els.tip = document.getElementById('tip-input');
    els.country = document.getElementById('country-input');
    els.merchantName = document.getElementById('merchant-name-input');
    els.merchantNameHint = document.getElementById('merchant-name-hint');
    els.merchantCity = document.getElementById('merchant-city-input');
    els.merchantCityHint = document.getElementById('merchant-city-hint');
    els.guidHint = document.getElementById('guid-hint');
    els.postal = document.getElementById('postal-input');
    els.bill = document.getElementById('bill-input');
    els.reference = document.getElementById('reference-input');
    els.canvas = document.getElementById('qr-canvas');
    els.payloadText = document.getElementById('payload-text');
    els.payloadLength = document.getElementById('payload-length');
    els.tagTableBody = document.getElementById('tag-table-body');
    els.crcNote = document.getElementById('crc-note');
    els.renderHint = document.getElementById('render-hint');
    els.verifyStrip = document.getElementById('verify-strip');
    els.verifyBadge = document.getElementById('verify-badge');
    els.verifyDetail = document.getElementById('verify-detail');
    els.verifyButton = document.getElementById('verify-button');
    els.validationErrors = document.getElementById('validation-errors');
    els.amountRow = document.getElementById('amount-row');
    els.versionBadge = document.getElementById('version-badge');
    els.downloadButton = document.getElementById('download-button');
    els.copyButton = document.getElementById('copy-payload-button');
}

function buildPresets() {
    emv.presets.forEach(function (preset) {
        var option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.label;
        els.preset.appendChild(option);
    });

    els.preset.addEventListener('change', function () {
        var preset = emv.presets.find(function (p) { return p.id === els.preset.value; });
        if (!preset) return;
        var before = captureFormValues();
        writeFields(preset.fields);
        markChanged(before);
        render();
        analytics.action('preset_selected', { preset: preset.id });
    });

    els.randomButton.addEventListener('click', randomize);
}

function wireEvents() {
    /* Every field re-renders on input. There is no submit button: the symbol
       and the payload are the output, and they update as you type. */
    [els.poi, els.guid, els.merchantId, els.mcc, els.currency, els.amount,
    els.tip, els.country, els.merchantName, els.merchantCity, els.postal,
    els.bill, els.reference].forEach(function (input) {
        input.addEventListener('input', render);
    });

    els.poi.addEventListener('change', function () {
        updateAmountVisibility();
        render();
    });

    els.downloadButton.addEventListener('click', downloadPng);

    els.verifyButton.addEventListener('click', function () {
        analytics.action('verify_click');
        runVerify();
    });

    els.copyButton.addEventListener('click', function () {
        if (!lastPayload) return;
        var done = function () {
            els.copyButton.querySelector('.btn-label').textContent = 'Copied';
            setTimeout(function () {
                els.copyButton.querySelector('.btn-label').textContent = 'Copy payload';
            }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lastPayload).then(done).catch(function () {
                selectPayloadForManualCopy();
            });
        } else {
            selectPayloadForManualCopy();
        }
    });
}

/* Clipboard access is refused outside a secure context. Falling back to a
   selection lets the visitor copy it by hand rather than losing the payload
   with no explanation. */
function selectPayloadForManualCopy() {
    var range = document.createRange();
    range.selectNodeContents(els.payloadText);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

async function bootstrap() {
    cacheElements();
    buildPresets();
    wireEvents();

    /* Render immediately from the dynamic preset: it carries the amount and
       the additional-data template, so the tag table below shows every
       mechanism the format has. No SDK handshake, no license, no network
       dependency beyond fonts and bwip-js — the payload is built and the
       symbol is drawn before anything else happens. */
    var defaultPreset = emv.presets.find(function (p) { return p.id === 'dynamic-usd'; })
        || emv.presets[0];
    els.preset.value = defaultPreset.id;
    writeFields(defaultPreset.fields);
    render();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}