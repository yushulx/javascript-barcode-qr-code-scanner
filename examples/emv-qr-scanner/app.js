/*
 * Online EMV QR Code Scanner.
 *
 * Decoding is Dynamsoft Barcode Reader, on the stock ReadBarcodes_Default
 * template: a payment QR is an ordinary QR Code to the engine, and anything
 * that decodes is parsed locally afterwards. The parse is where this demo
 * earns its place next to the generic barcode scanner — emv-model.js takes
 * the decoded string apart tag by tag, verifies the CRC-16 BEFORE any field
 * is shown, and names the standard fields (currency, MCC, point of
 * initiation) so the result reads like an explanation rather than a hex dump.
 *
 * Three inputs share one sink:
 *   - an image (drop / choose / paste), decoded then parsed
 *   - a bundled sample, decoded automatically on load
 *   - a payload string typed or pasted by hand, parsed with no image at all
 *
 * There is deliberately no camera mode here. The generic barcode scanner
 * demo already does live decoding well; this page's value is the EMV parse,
 * and a screenshot of a payment QR carries the same payload as a live shot.
 */

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
   State
   --------------------------------------------------------------------------- */

var els = {};
var cvRouter = null;
var sdkReady = false;
var decodeBusy = false;

var PRESET_TEMPLATE = 'ReadBarcodes_Default';

var SAMPLES = [
    { label: 'Static code', file: 'sample-images/emv-static.png', expectation: 'valid' },
    { label: 'Dynamic · 12.50', file: 'sample-images/emv-dynamic.png', expectation: 'valid' },
    { label: 'Tampered amount', file: 'sample-images/emv-tampered.png', expectation: 'bad-crc' }
];

/* ---------------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------------- */

async function bootstrap() {
    cacheElements();
    wireEvents();
    buildSamples();

    var startedAt = performance.now();
    setVerdict('pending', 'Starting the barcode reader…', 'The SDK activates and loads its WASM module before the first decode.');

    try {
        await Dynamsoft.License.LicenseManager.initLicense(resolveLicenseKey(), true);
        setVerdict('pending', 'Loading the barcode module…', 'One moment.');
        await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
        cvRouter = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
        sdkReady = true;
        analytics.ready(performance.now() - startedAt);

        setVerdict('pending', 'Reader ready.', 'Drop an image, pick a sample, or paste a payload string below.');

        /* The page opens with a worked example, same convention as the
           scanner demos it sits beside. */
        decodeImageSource(SAMPLES[1].file, 'sample: ' + SAMPLES[1].label);
    } catch (error) {
        var message = (error && (error.message || error)) || 'Unknown error';
        console.error(error);
        analytics.error('activate_failed', message);
        setVerdict('bad', 'Barcode reader unavailable',
            'Dynamsoft Barcode Reader could not start: ' + message + ' — please refresh and try again.');
    }
}

function cacheElements() {
    els.dropZone = document.getElementById('drop-zone');
    els.fileInput = document.getElementById('file-input');
    els.sampleRow = document.getElementById('sample-row');
    els.scanStage = document.getElementById('scan-stage');
    els.scanCanvas = document.getElementById('scan-canvas');
    els.resultBadge = document.getElementById('result-badge');
    els.verdict = document.getElementById('verdict');
    els.verdictBadge = document.getElementById('verdict-badge');
    els.verdictDetail = document.getElementById('verdict-detail');
    els.tagTable = document.getElementById('tag-table');
    els.tagTableBody = document.getElementById('tag-table-body');
    els.resultNote = document.getElementById('result-note');
    els.walletCard = document.getElementById('wallet-card');
    els.walletScreen = document.getElementById('wallet-screen');
    els.manualInput = document.getElementById('manual-input');
    els.manualButton = document.getElementById('manual-button');
}

function wireEvents() {
    els.dropZone.addEventListener('click', function (event) {
        /* The Choose button lives inside the zone; let its own handler own
           the click so the file dialog opens exactly once. */
        if (event.target.closest('label')) return;
        els.fileInput.click();
    });

    els.fileInput.addEventListener('change', function () {
        if (els.fileInput.files && els.fileInput.files[0]) {
            decodeImageFile(els.fileInput.files[0]);
        }
        els.fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (name) {
        els.dropZone.addEventListener(name, function (event) {
            event.preventDefault();
            els.dropZone.classList.add('is-over');
        });
    });
    ['dragleave', 'drop'].forEach(function (name) {
        els.dropZone.addEventListener(name, function (event) {
            event.preventDefault();
            els.dropZone.classList.remove('is-over');
        });
    });
    els.dropZone.addEventListener('drop', function (event) {
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) decodeImageFile(file);
    });

    /* Paste an image anywhere on the page. Screenshot → paste is the
       shortest path from a wallet to a parse. */
    document.addEventListener('paste', function (event) {
        var items = (event.clipboardData && event.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf('image/') === 0) {
                decodeImageFile(items[i].getAsFile());
                return;
            }
        }
        /* Pasted text looks like a payload? Send it to the manual parser. */
        var text = event.clipboardData && event.clipboardData.getData('text/plain');
        if (text && emv.looksLikeEmv(text.trim())) {
            els.manualInput.value = text.trim();
            parseManual();
        }
    });

    els.manualButton.addEventListener('click', parseManual);
    els.manualInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') parseManual();
    });
}

function buildSamples() {
    SAMPLES.forEach(function (sample) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sample-chip';

        var thumb = document.createElement('img');
        thumb.src = sample.file;
        thumb.alt = '';
        thumb.width = 28;
        thumb.height = 28;
        chip.appendChild(thumb);

        chip.appendChild(document.createTextNode(sample.label));
        chip.addEventListener('click', function () {
            decodeImageSource(sample.file, 'sample: ' + sample.label);
        });
        els.sampleRow.appendChild(chip);
    });
}

/* ---------------------------------------------------------------------------
   Image path
   --------------------------------------------------------------------------- */

function decodeImageFile(file) {
    if (!file || !/^image\//.test(file.type)) {
        setVerdict('bad', 'Not an image', file ? ('"' + file.name + '" is ' + (file.type || 'of an unknown type')
            + '. A PNG, JPEG or WebP containing a QR code is what this page reads.') : 'No file.');
        return;
    }
    var reader = new FileReader();
    reader.onload = function (event) {
        decodeImageSource(event.target.result, file.name);
    };
    reader.onerror = function () {
        setVerdict('bad', 'Could not read the file', 'The browser refused to read "' + file.name + '".');
    };
    reader.readAsDataURL(file);
}

async function decodeImageSource(src, label) {
    if (!sdkReady) {
        setVerdict('pending', 'Waiting for the barcode reader…', 'Try again in a moment.');
        return;
    }
    if (decodeBusy) return;
    decodeBusy = true;

    setVerdict('pending', 'Decoding…', 'Reading the QR code with Dynamsoft Barcode Reader.');

    /* Draw the image so the visitor sees what was decoded, and so the decode
       dimensions are pinned to the symbol rather than the layout. */
    var image = new Image();
    var loaded = new Promise(function (resolve, reject) {
        image.onload = function () { resolve(); };
        image.onerror = function () { reject(new Error('The image could not be loaded.')); };
        image.src = src;
    });

    try {
        await loaded;
        var maxSide = 900;
        var scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        els.scanCanvas.width = Math.round(image.naturalWidth * scale);
        els.scanCanvas.height = Math.round(image.naturalHeight * scale);
        els.scanCanvas.getContext('2d').drawImage(image, 0, 0, els.scanCanvas.width, els.scanCanvas.height);
        els.scanStage.hidden = false;
    } catch (ex) {
        decodeBusy = false;
        setVerdict('bad', 'Could not load the image', ex.message + ' (' + label + ')');
        return;
    }

    var decoded = null;
    try {
        analytics.start('emv_qr', 'image');
        var result = await cvRouter.capture(els.scanCanvas);
        var items = (result && result.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) {
                decoded = items[i];
                break;
            }
        }
    } catch (ex) {
        console.error(ex);
        decodeBusy = false;
        analytics.fail('emv_qr', 'image');
        setVerdict('bad', 'Decode failed', 'Dynamsoft Barcode Reader returned an error: ' + ex.message);
        return;
    }

    decodeBusy = false;

    if (!decoded) {
        analytics.fail('emv_qr', 'image');
        setVerdict('bad', 'No QR code found',
            'The reader did not find a QR code in "' + label + '". A sharper image, or one where the '
            + 'symbol takes up more of the frame, usually fixes this.');
        return;
    }

    analytics.success('emv_qr', 'image', { payload_length: decoded.text.length });
    presentPayload(decoded.text, label);
}

/* ---------------------------------------------------------------------------
   Manual payload path
   --------------------------------------------------------------------------- */

function parseManual() {
    var text = els.manualInput.value.trim();
    if (!text) {
        setVerdict('bad', 'Nothing to parse', 'Paste an EMV QR payload string first — it starts with "0002".');
        return;
    }
    els.scanStage.hidden = true;
    presentPayload(text, 'manual input');
}

/* ---------------------------------------------------------------------------
   The parse

   One sink for every input. Order matters: the CRC verdict is rendered
   before the field table, so a tampered payload is announced as tampered
   before its fields appear — the fields render struck-through-adjacent to a
   red verdict, never as if they were trustworthy.
   --------------------------------------------------------------------------- */

function presentPayload(payload, label) {
    /* A QR that decodes to something that is not EMV at all — a URL, a
       Wi-Fi login, a vCard — gets a plain answer, not a table of misread
       fields. */
    if (!emv.looksLikeEmv(payload)) {
        hideWallet();
        els.resultBadge.textContent = 'Not EMV';
        els.tagTable.hidden = true;
        els.resultNote.textContent = '';
        setVerdict('bad', 'Decodes as a QR — but not an EMV payment QR',
            'The text "' + preview(payload) + '" does not start with tag 00 = 01 and carries no 6304 '
            + 'checksum. A payment QR always begins "000201" and ends with its CRC.');
        return;
    }

    var parsed = emv.parsePayload(payload);
    renderTagTable(parsed);

    if (!parsed.crcValid) {
        hideWallet();
        els.resultBadge.textContent = 'CRC mismatch';
        els.resultNote.textContent = '';
        setVerdict('bad', parsed.isDynamic ? 'Tampered dynamic code' : 'Checksum failed',
            parsed.errors[0] || 'The CRC-16 does not match the payload.');
        analytics.action('parse_crc_failed');
        return;
    }
    if (parsed.errors.length) {
        hideWallet();
        els.resultBadge.textContent = 'Not a payment QR';
        els.resultNote.textContent = '';
        setVerdict('bad', 'Checksum OK — but not a version 1 payment QR',
            parsed.errors.join(' '));
        return;
    }

    /* CRC valid and structurally sound: summarise what a wallet would act
       on, in the order a payer would care about it. */
    var summary = describeSummary(parsed);
    els.resultBadge.textContent = parsed.isDynamic ? 'Dynamic · valid' : 'Static · valid';
    els.resultNote.textContent = '';
    setVerdict('ok', parsed.isDynamic ? 'Valid dynamic payment QR' : 'Valid static payment QR', summary);
    showWallet(parsed);
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

function showWallet(parsed) {
    els.walletCard.hidden = false;
    renderWalletForm(parsed);
}

function hideWallet() {
    els.walletCard.hidden = true;
    els.walletScreen.textContent = '';
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

function renderWalletForm(parsed) {
    var screen = els.walletScreen;
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
        sym.textContent = (CURRENCY_SYMBOLS[currency] || currencyName + ' ') ;
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
        showWalletReceipt(parsed, amount, currencyName);
        analytics.action('wallet_confirm', { dynamic: parsed.isDynamic });
    });
    cancel.addEventListener('click', function () {
        renderWalletForm(parsed);
    });
}

function showWalletReceipt(parsed, amount, currencyName) {
    var screen = els.walletScreen;
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
        renderWalletForm(parsed);
    });
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

function preview(text) {
    var s = String(text || '');
    return s.length <= 60 ? s : s.slice(0, 30) + '…' + s.slice(-24);
}

function setVerdict(state, title, detail) {
    els.verdict.hidden = false;
    els.verdict.classList.remove('is-ok', 'is-bad');
    if (state === 'ok') els.verdict.classList.add('is-ok');
    if (state === 'bad') els.verdict.classList.add('is-bad');
    els.verdictBadge.textContent = title;
    els.verdictDetail.textContent = detail;
}

/* ---------------------------------------------------------------------------
   Field table — same rendering contract as the generator's, so the two
   demos read identically.
   --------------------------------------------------------------------------- */

function renderTagTable(parsed) {
    els.tagTable.hidden = false;
    els.tagTableBody.textContent = '';

    parsed.entries.forEach(function (entry) {
        var name = emv.fieldName(entry.tag);
        var display = entry.value;

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
        if (entry.tag === '01') {
            display = entry.value + (entry.value === '12'
                ? ' — dynamic, amount fixed by the merchant'
                : ' — static, customer types the amount');
        }

        var row = document.createElement('tr');
        row.appendChild(cell('tag-cell', entry.tag));
        row.appendChild(cell('', name));
        row.appendChild(cell('value-cell', display));
        els.tagTableBody.appendChild(row);

        if (entry.children && entry.children.length) {
            var label = document.createElement('tr');
            label.className = 'sub-row';
            var labelCell = cell('template-label-cell', '');
            labelCell.appendChild(span('template-label',
                entry.tag === '26' || (parseInt(entry.tag, 10) >= 2 && parseInt(entry.tag, 10) <= 51)
                    ? 'Merchant account information'
                    : 'Additional data'));
            labelCell.colSpan = 3;
            label.appendChild(labelCell);
            els.tagTableBody.appendChild(label);

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
                els.tagTableBody.appendChild(childRow);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}