/*
 * Online VIN Barcode Generator.
 *
 * Pure client side: bwip-js encodes, nothing else runs. No SDK and no license
 * key are involved — the companion scanner demo (../vin-barcode-scanner/) is
 * where Dynamsoft Barcode Reader comes in.
 *
 * Two standard presets shape validation and the random generator:
 *
 *   North America (FMVSS 115 / 49 CFR Part 565) — the check digit in
 *   position 9 is required (mismatch is an error with a one-click fix), the
 *   model year and plant code positions are meaningful, and the last five
 *   characters are digits. Real labels use Code 39.
 *
 *   Europe (ISO 3779) — no check digit rule, so position 9 is a free
 *   character (often a filler like X) and is shown but not judged. Real
 *   labels commonly use Code 128.
 *
 * The barcode renders as you type; there is no render button to forget.
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

var vinModel = window.VinModel;

var STANDARDS = [
    {
        id: 'na',
        label: 'North America',
        tag: 'FMVSS 115',
        hint: 'The strict rule set: position 9 must be the check digit (recalculated here), position 10 '
            + 'the model year, position 11 the plant code, and the last five characters digits. Labels '
            + 'use Code 39.',
        symbology: 'code39'
    },
    {
        id: 'eu',
        label: 'Europe',
        tag: 'ISO 3779',
        hint: 'The base ISO standard: no check digit requirement, so position 9 is whatever the '
            + 'manufacturer put there — often a filler like X. Labels commonly use Code 128.',
        symbology: 'code128'
    }
];

var SYMBOLOGIES = [
    {
        id: 'code39',
        label: 'Code 39',
        tag: 'North American VIN label',
        bcid: 'code39',
        textCapable: true,
        hint: 'The symbology North American regulations (FMVSS 115) require on the VIN label. Some '
            + 'vehicles carry an extra leading I inside the data — an import marker the scanner strips.'
    },
    {
        id: 'code128',
        label: 'Code 128',
        tag: 'European labels',
        bcid: 'code128',
        textCapable: true,
        hint: 'Denser than Code 39 and common on European VIN labels and import paperwork.'
    },
    {
        id: 'qrcode',
        label: 'QR Code',
        tag: 'Window stickers',
        bcid: 'qrcode',
        textCapable: false,
        hint: 'A 17-character VIN fits with room to spare — used on window stickers and service documents.'
    },
    {
        id: 'datamatrix',
        label: 'Data Matrix',
        tag: 'Parts and plates',
        bcid: 'datamatrix',
        textCapable: false,
        hint: 'A compact 2D symbol for tight spaces — parts, plates and etched labels.'
    }
];

var DEFAULT_VIN = '1HGCM82633A004352'; // the classic Honda Accord example VIN

var state = {
    vin: DEFAULT_VIN,
    standard: STANDARDS[0],
    symbology: SYMBOLOGIES[0]
};

var els = {};
var lastPayload = [];
var renderTimer = null;

function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
}

/* ---------------------------------------------------------------------------
   Rendering — bwip-js
   --------------------------------------------------------------------------- */

function barcodeOptions() {
    var options = {
        bcid: state.symbology.bcid,
        text: state.vin,
        backgroundcolor: 'FFFFFF',
        paddingwidth: 12,
        paddingheight: 10
    };
    if (state.symbology.textCapable && els.includeText.checked) {
        options.includetext = true;
        options.textsize = 10;
        options.textyoffset = 2;
        options.textxalign = 'center';
    }
    if (state.symbology.bcid === 'code39' || state.symbology.bcid === 'code128') {
        options.scale = 3;
        options.height = 14;
    } else {
        options.scale = 6;
    }
    return options;
}

function renderBarcode() {
    if (!state.vin) {
        els.barcodeCanvas.width = 10;
        els.barcodeCanvas.height = 10;
        els.renderStatus.textContent = 'Type a VIN — the barcode renders as you type.';
        return;
    }
    var pending;
    try {
        pending = window.bwipjs.toCanvas(els.barcodeCanvas, barcodeOptions());
    } catch (error) {
        console.error(error);
        els.renderStatus.textContent = 'This value cannot be encoded: ' + (error.message || error);
        return;
    }
    els.renderStatus.textContent = state.vin + ' · ' + state.symbology.label
        + (state.symbology.textCapable && els.includeText.checked
            ? ' with human-readable text' : '');
    if (pending && typeof pending.then === 'function') {
        pending.then(function () { }, function (error) {
            console.error(error);
            els.renderStatus.textContent = 'This value cannot be encoded: ' + (error.message || error);
        });
    }
}

function downloadBarcode() {
    if (!state.vin) return;
    els.barcodeCanvas.toBlob(function (blob) {
        if (!blob) return;
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'vin-' + state.vin + '-' + state.symbology.id + '.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 4000);
        analytics.action('download_png', { symbology: state.symbology.id });
    }, 'image/png');
}

/* ---------------------------------------------------------------------------
   Facts table — the structured parse of the VIN in the form
   --------------------------------------------------------------------------- */

function addFactRow(tbody, label, value, mono) {
    var tr = node('tr');
    var th = node('td', 'fact-label', label);
    var td = node('td', mono ? 'mono' : null, value);
    tr.appendChild(th);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function buildVinFacts(analysis) {
    var tbody = els.vinFacts;
    tbody.replaceChildren();

    if (!analysis.ok) {
        var tr = node('tr');
        tr.appendChild(node('td', 'fact-label', 'Error'));
        tr.appendChild(node('td', 'fact-error', analysis.errors[0] || 'Not a VIN.'));
        tbody.appendChild(tr);
        return;
    }

    addFactRow(tbody, 'VIN', analysis.vin, true);
    addFactRow(tbody, 'WMI (pos. 1–3)', analysis.wmi
        + (analysis.region ? ' — ' + analysis.region : ''));
    addFactRow(tbody, 'VDS (pos. 4–8)', analysis.vds);
    if (state.standard.id === 'eu') {
        addFactRow(tbody, 'Position 9', analysis.checkChar + ' — free character (no check digit rule)');
    } else {
        addFactRow(tbody, 'Check digit (pos. 9)', analysis.checkChar
            + (analysis.checkVerified ? ' — correct' : ' — expected ' + analysis.checkExpected));
    }
    if (analysis.modelYears) {
        addFactRow(tbody, 'Model year (pos. 10)', analysis.modelYears[0] + ' or ' + analysis.modelYears[1]);
    }
    addFactRow(tbody, 'Plant code (pos. 11)', analysis.plant);
    addFactRow(tbody, 'Serial number (pos. 12–17)', analysis.serial);

    els.vinNotes.replaceChildren();
    if (analysis.notes.length) {
        var box = node('ul', 'note-list');
        analysis.notes.forEach(function (message) {
            box.appendChild(node('li', null, message));
        });
        els.vinNotes.appendChild(box);
    }
}

/* ---------------------------------------------------------------------------
   Update pipeline — validate, render, refresh the facts and the check line
   --------------------------------------------------------------------------- */

function update() {
    var raw = els.vinInput.value.trim().toUpperCase();
    var normalized = vinModel.normalizeVinFromBarcode(raw);
    var analysis;

    if (!raw.length) {
        analysis = vinModel.analyzeVin(null);
        state.vin = null;
    } else if (normalized.vin && vinModel.VIN_CHARSET.test(normalized.vin)) {
        analysis = vinModel.analyzeVin(normalized.vin, null, state.standard.id);
        analysis.notes = normalized.notes.concat(analysis.notes);
        state.vin = normalized.vin;
    } else {
        analysis = vinModel.analyzeBarcodeText(raw, null, state.standard.id);
        state.vin = normalized.vin && vinModel.VIN_CHARSET.test(normalized.vin)
            ? normalized.vin
            : null;
    }

    renderBarcode();

    /* The check line sits beside the input: tag + optional one-click fix. */
    if (analysis.ok && state.standard.id === 'na') {
        els.checkLine.hidden = false;
        if (analysis.checkVerified) {
            els.checkTag.textContent = 'correct: ' + analysis.checkChar;
            els.checkTag.className = 'check-tag is-ok';
            els.fixCheckButton.hidden = true;
        } else {
            els.checkTag.textContent = 'expected ' + analysis.checkExpected;
            els.checkTag.className = 'check-tag is-bad';
            els.fixCheckButton.hidden = false;
            els.expectedCheck.textContent = analysis.checkExpected;
        }
    } else {
        els.checkLine.hidden = true;
        els.fixCheckButton.hidden = true;
    }

    buildVinFacts(analysis);
    lastPayload = [{
        vin: analysis.vin || null,
        standard: state.standard.id,
        checkDigit: state.standard.id === 'eu'
            ? 'not-applicable'
            : (analysis.checkVerified === true ? 'verified'
                : (analysis.checkVerified === false ? 'failed' : null)),
        wmi: analysis.wmi,
        region: analysis.region,
        vds: analysis.vds,
        modelYear: analysis.modelYears,
        plant: analysis.plant,
        serial: analysis.serial,
        symbology: state.symbology.id,
        notes: analysis.notes,
        errors: analysis.errors
    }];
}

/* ---------------------------------------------------------------------------
   Input handling
   --------------------------------------------------------------------------- */

function handleVinInput() {
    var caret = els.vinInput.selectionStart;
    var cleaned = els.vinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned !== els.vinInput.value) {
        els.vinInput.value = cleaned;
        if (typeof caret === 'number') els.vinInput.setSelectionRange(caret, caret);
    }
    clearTimeout(renderTimer);
    renderTimer = setTimeout(update, 140);
}

function handleRandomVin() {
    var made = vinModel.randomVin(state.standard.id);
    els.vinInput.value = made.vin;
    update();
    els.renderStatus.textContent = 'Random VIN from ' + made.wmiNote
        + ', valid under the ' + state.standard.label + ' rules.';
    analytics.action('random_vin', { standard: state.standard.id });
}

function handleFixCheck() {
    if (!state.vin) return;
    var fixed = state.vin.slice(0, 8) + vinModel.vinCheckDigit(state.vin) + state.vin.slice(9);
    els.vinInput.value = fixed;
    update();
    analytics.action('fix_check_digit', {});
}

function handleStandardPick(spec) {
    state.standard = spec;
    Array.prototype.forEach.call(els.standardRow.querySelectorAll('.chip-btn'), function (chip) {
        chip.classList.toggle('active', chip.dataset.standard === spec.id);
    });
    els.standardHint.textContent = spec.hint;

    /* Follow the standard to the symbology its labels actually use. */
    var recommended = SYMBOLOGIES.filter(function (s) { return s.id === spec.symbology; })[0];
    if (recommended && state.symbology.id !== spec.symbology) {
        pickSymbology(recommended, true);
    }
    update();
    analytics.action('standard', { standard: spec.id });
}

function pickSymbology(spec, fromStandard) {
    state.symbology = spec;
    Array.prototype.forEach.call(els.symbologyRow.querySelectorAll('.chip-btn'), function (chip) {
        chip.classList.toggle('active', chip.dataset.symbology === spec.id);
    });
    els.symbologyHint.textContent = spec.hint;
    /* The readable-text line only makes sense for the linear symbols. */
    els.includeTextWrap.hidden = !spec.textCapable;
    update();
    if (!fromStandard) analytics.action('symbology', { symbology: spec.id });
}

function buildChips(row, list, datasetKey, activeId, onPick) {
    list.forEach(function (spec) {
        var chip = node('button', 'chip-btn' + (spec.id === activeId ? ' active' : ''), spec.label);
        chip.type = 'button';
        chip.dataset[datasetKey] = spec.id;
        chip.title = spec.tag;
        chip.addEventListener('click', function (event) {
            event.stopPropagation();
            onPick(spec);
        });
        row.appendChild(chip);
    });
}

/* ---------------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------------- */

function bootstrap() {
    els.vinInput = document.getElementById('vin-input');
    els.randomVinButton = document.getElementById('random-vin-button');
    els.downloadButton = document.getElementById('download-button');
    els.checkLine = document.getElementById('check-line');
    els.checkTag = document.getElementById('check-tag');
    els.fixCheckButton = document.getElementById('fix-check-button');
    els.expectedCheck = document.getElementById('expected-check');
    els.standardRow = document.getElementById('standard-row');
    els.standardHint = document.getElementById('standard-hint');
    els.symbologyRow = document.getElementById('symbology-row');
    els.symbologyHint = document.getElementById('symbology-hint');
    els.includeText = document.getElementById('include-text');
    els.includeTextWrap = document.getElementById('include-text-wrap');
    els.barcodeCanvas = document.getElementById('barcode-canvas');
    els.renderStatus = document.getElementById('render-status');
    els.vinFacts = document.getElementById('vin-facts');
    els.vinNotes = document.getElementById('vin-notes');
    els.copyGen = document.getElementById('copy-gen-button');

    buildChips(els.standardRow, STANDARDS, 'standard', state.standard.id, handleStandardPick);
    buildChips(els.symbologyRow, SYMBOLOGIES, 'symbology', state.symbology.id, pickSymbology);
    els.standardHint.textContent = state.standard.hint;
    els.symbologyHint.textContent = state.symbology.hint;
    els.includeTextWrap.hidden = !state.symbology.textCapable;

    els.randomVinButton.addEventListener('click', handleRandomVin);
    els.downloadButton.addEventListener('click', downloadBarcode);
    els.fixCheckButton.addEventListener('click', handleFixCheck);
    els.includeText.addEventListener('change', update);
    els.vinInput.addEventListener('input', handleVinInput);
    els.copyGen.addEventListener('click', copyResults);

    /* The page opens with a worked example: a valid North American VIN,
       rendered and parsed before the visitor touches anything. */
    els.vinInput.value = DEFAULT_VIN;
    update();
}

function copyResults() {
    if (!lastPayload.length) return;

    var text = JSON.stringify(lastPayload, null, 2);
    var button = els.copyGen;
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
        analytics.action('copy_json', {});
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
