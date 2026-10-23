/**
 * MRZ scanner — dataset benchmark.
 *
 * Closes the loop the MRZ generator opens: the generator renders synthetic
 * documents, records the exact fields each one was built from, and exports the
 * whole thing as one ZIP (`images/*.png` + `annotations.json` in the
 * `mrz-benchmark/1.0` schema). This file reads that archive, runs the reader
 * over every image the way the page's single-scan mode does, and scores what
 * came back against the ground truth:
 *
 *     Document number: correct
 *     Surname:         correct
 *     Date of birth:   wrong   (read 951024, expected 951025)
 *     ...
 *     Fields correct: 6 / 7
 *
 * Two rules keep the numbers honest:
 *
 *   1. The oracle is the parsed field, never the raw MRZ string. A reader that
 *      reports the right document number through different filler characters
 *      has read the document; scoring the byte string would call that a miss.
 *      The verbatim MRZ line is reported beside the fields as a separate row so
 *      the difference between "read the data" and "read the line exactly" stays
 *      visible instead of folded into one number.
 *   2. Dates are compared in the century the MRZ encodes — YYMMDD. Which
 *      century a reader assumes is its own convention (the parser here returns
 *      1910-01-01 for a passport expiring in 2010), so the century is dropped
 *      before comparing rather than scored.
 *
 * Runs after script.js: it uses that file's globals (cvr, parser, isMRZReady,
 * els, analytics) the way a second classic script on the page sees them.
 */

/* ========================================================================
 * ZIP (the archive the MRZ generator exports)
 * ======================================================================== */

/* The generator stores its entries uncompressed — PNG is already compressed —
   so reading its archives needs no inflate step. A deflated entry from some
   other writer is handled when the browser has DecompressionStream, and
   refused with a message that says which writer to use. */
const BENCH_ZIP_IMAGE_RE = /\.(png|jpe?g|bmp|gif|webp)$/i;
const BENCH_MIME_BY_EXTENSION = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp',
    gif: 'image/gif', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff'
};

function benchMimeForName(name) {
    const extension = (name.split('.').pop() || '').toLowerCase();
    return BENCH_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

async function benchInflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
        throw new Error('This archive uses compression and this browser cannot inflate it. '
            + 'Re-export the dataset from the MRZ generator — its archives are stored, not compressed.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function benchReadZipEntries(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    /* The end-of-central-directory record sits at the end of the archive, but a
       comment may follow it, so scan backwards over the largest comment a ZIP
       allows. */
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
            || BENCH_ZIP_IMAGE_RE.test(entry.name.split('/').pop() || '');
    });

    for (const entry of wanted) {
        if (entry.method === 0) entry.data = entry.raw;
        else if (entry.method === 8) entry.data = await benchInflateRaw(entry.raw);
        else throw new Error('The archive entry "' + entry.name + '" uses an unsupported '
            + 'compression method (' + entry.method + '). Export the dataset from the MRZ generator instead.');
    }
    return wanted;
}

function benchBlobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function (e) { resolve(e.target.result); };
        reader.onerror = function () { reject(new Error('Could not read the image data.')); };
        reader.readAsDataURL(blob);
    });
}

/* The template the benchmark reads with.
 *
 * The single-scan mode uses ReadPassportAndId, which is built around the
 * passport/ID page layout: it locates the portrait and reads the MRZ from the
 * ROIs that layout implies. Pointed at a visa-format or TD2 mock it detects the
 * document and returns no text at all, which would report 0% for image sets the
 * generator can legitimately produce (TD1, TD2, MRVA, MRVB) and would measure
 * the template's layout assumption rather than the reader.
 *
 * ReadMRZ is the MRZ-only template of the same SDK: it finds and reads the zone
 * on any of those documents. The benchmark scores MRZ reading, so it uses that
 * one — and says so in the panel, because a number produced by a different
 * template should never be read as a claim about single-scan mode. */
const BENCH_TEMPLATE = 'ReadMRZ';

/* ========================================================================
 * Field model and comparison
 * ======================================================================== */

/* Keeps only what the comparison cares about: an alphanumeric code, upper case.
   `<` is filler, not data, and a reader that keeps it has still read the field. */
function benchNormalizeCode(value) {
    return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/* Names come back separated by filler, spaces or newlines depending on the
   reader; what has to match is the sequence of words. */
function benchNormalizeName(value) {
    return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* YYMMDD, the century dropped. A parser that hands back 1910-01-01 for a 2010
   expiry has made a century choice the MRZ does not carry, so it is not scored. */
function benchNormalizeDate(value) {
    const digits = String(value == null ? '' : value).replace(/\D/g, '');
    return digits.length === 8 ? digits.slice(2) : digits;
}

function benchNormalizeSex(value) {
    const text = String(value == null ? '' : value).toUpperCase().replace(/[^A-Z]/g, '');
    return text ? text[0] : '';
}

/* What a correct reader must return, and where the reader's answer lives. Each
   entry reads from the ground truth on one side and from the parsed MRZ on the
   other, so adding a field means adding one row here and nothing else. */
const BENCH_FIELDS = [
    {
        id: 'documentNumber', label: 'Document number', head: 'Doc no.',
        expected: function (truth) { return truth.fields.documentNumber; },
        actual: function (read) { return read.documentNumber; },
        normalize: benchNormalizeCode
    },
    {
        id: 'surname', label: 'Surname', head: 'Surname',
        expected: function (truth) { return truth.fields.surname; },
        actual: function (read) { return read.surname; },
        normalize: benchNormalizeName
    },
    {
        id: 'givenNames', label: 'Given names', head: 'Given',
        expected: function (truth) { return truth.fields.givenNames; },
        actual: function (read) { return read.givenNames; },
        normalize: benchNormalizeName
    },
    {
        id: 'nationality', label: 'Nationality', head: 'Nat.',
        expected: function (truth) { return truth.fields.nationality; },
        actual: function (read) { return read.nationality; },
        normalize: benchNormalizeCode
    },
    {
        id: 'birthDate', label: 'Date of birth', head: 'DOB',
        expected: function (truth) { return truth.fields.birthDate; },
        actual: function (read) { return read.dateOfBirth; },
        normalize: benchNormalizeDate
    },
    {
        id: 'sex', label: 'Sex', head: 'Sex',
        expected: function (truth) { return truth.fields.sex; },
        actual: function (read) { return read.gender; },
        normalize: benchNormalizeSex
    },
    {
        id: 'expiryDate', label: 'Date of expiry', head: 'Expiry',
        expected: function (truth) { return truth.fields.expiryDate; },
        actual: function (read) { return read.dateOfExpiry; },
        normalize: benchNormalizeDate
    }
];

/* The parser reports each field twice: `Value` is mapped for display ("China",
   "male", "United States of America (the)"), and `RawValue` is what the MRZ
   encodes ("CHN", "M", "USA"). The ground truth is the encoded form, so the
   benchmark compares RawValue — comparing the display form would score the
   parser's country table instead of the read. Fields with no distinct raw form
   (the identifiers inside `name`) carry only Value, which is the fallback. */
function benchParsedField(tree, name) {
    const found = benchFindField(tree, name);
    if (!found) return '';
    if (found.RawValue != null && found.RawValue !== '') return String(found.RawValue);
    return found.Value == null ? '' : String(found.Value);
}

function benchFindField(node, name) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = benchFindField(item, name);
            if (found) return found;
        }
        return null;
    }
    if (node.FieldName === name) return node;
    return benchFindField(node.ChildFields, name) || benchFindField(node.ResultInfo, name);
}

function benchParsedTree(parsed) {
    if (!parsed || typeof parsed.jsonString !== 'string') return null;
    try {
        return JSON.parse(parsed.jsonString);
    } catch (e) {
        return null;
    }
}

/* The parsed MRZ in the shape BENCH_FIELDS reads. */
function benchReadFields(parsed) {
    const tree = benchParsedTree(parsed);
    const digits = function (name) {
        return benchParsedField(tree, name).replace(/\D/g, '');
    };
    return {
        documentNumber: benchParsedField(tree, 'passportNumber') || benchParsedField(tree, 'documentNumber'),
        surname: benchParsedField(tree, 'primaryIdentifier'),
        givenNames: benchParsedField(tree, 'secondaryIdentifier'),
        nationality: benchParsedField(tree, 'nationality'),
        /* The Mrz dates come back as separate year/month/day fields already in
           the MRZ's own YY/MM/DD form; joining them is how the ground truth
           stores them. */
        dateOfBirth: digits('birthYear') + digits('birthMonth') + digits('birthDay'),
        gender: benchParsedField(tree, 'sex'),
        dateOfExpiry: digits('expiryYear') + digits('expiryMonth') + digits('expiryDay'),
        issuingState: benchParsedField(tree, 'issuingState'),
        documentType: (tree && tree.CodeType) || ''
    };
}

/* A field is correct only when both sides carry a value and they agree. An
   empty answer is never correct — "not read" and "read as blank" would
   otherwise score as a match against missing ground truth. Both sides go
   through the field's own normalizer: normalizing them differently would make
   the comparison a test of the whitespace between two spellings. */
function benchFieldVerdict(field, truth, read) {
    const expected = truth ? field.expected(truth) : null;
    const actual = read ? field.actual(read) : null;
    const normalizedExpected = field.normalize(expected);
    const normalizedActual = field.normalize(actual);
    return {
        id: field.id,
        label: field.label,
        expected: expected == null ? '' : String(expected),
        actual: actual == null ? '' : String(actual),
        correct: normalizedActual !== '' && normalizedActual === normalizedExpected,
        missing: normalizedActual === ''
    };
}

/* The MRZ lines the reader returned, as opposed to the other text it may see on
   the document. Every MRZ line is at least 30 characters (TD1) and nothing else
   on the page is, which is the whole filter. */
function benchMrzLines(lines) {
    return (lines || []).filter(function (line) {
        const stripped = String(line).replace(/\s/g, '');
        return stripped.length >= 30 && /^[A-Z0-9<]+$/.test(stripped);
    });
}

function benchScore(truth, read, rawLines) {
    const fields = BENCH_FIELDS.map(function (field) {
        return benchFieldVerdict(field, truth, read);
    });
    const correct = fields.filter(function (field) { return field.correct; }).length;

    const expectedLine = truth ? String(truth.text || '').replace(/\s/g, '') : '';
    const actualLine = benchMrzLines(rawLines).map(function (line) {
        return String(line).replace(/\s/g, '');
    }).join('');

    return {
        fields: fields,
        correct: correct,
        total: fields.length,
        mrzLine: {
            expected: expectedLine,
            actual: actualLine,
            correct: expectedLine !== '' && actualLine === expectedLine
        }
    };
}

/* ========================================================================
 * State
 * ======================================================================== */

const benchEls = {};
const BENCH_IDS = ['modeTabSingle', 'modeTabBenchmark', 'singleToolbar', 'benchToolbar',
    'singleResults', 'benchResults', 'benchLoadBtn', 'benchRunBtn', 'benchStopBtn',
    'benchStatus', 'benchProgress', 'benchProgressBar', 'benchProgressText', 'benchDataset',
    'benchSummary', 'benchTableCaption', 'benchHeadRow', 'benchRows', 'benchDetail',
    'benchExportJsonBtn', 'benchExportCsvBtn'];

const benchState = {
    dataset: null,   // { file, generator, images: [{ name, dataUrl, width, height, truth }] }
    results: [],
    running: false,
    cancel: false,
    selected: -1
};

/* ========================================================================
 * Loading
 * ======================================================================== */

function benchAccepts(file) {
    if (!file) return false;
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    return file.type === 'application/zip' || extension === 'zip';
}

async function benchLoad(file) {
    if (!benchAccepts(file)) return;
    benchSetMode('benchmark');
    benchSetStatus('Reading ' + file.name + '…');
    benchShowProgress(true, 0, 'Reading ' + file.name + '…');
    benchShowError(null);

    try {
        const entries = await benchReadZipEntries(file);
        let annotation = null;
        const images = [];

        entries.forEach(function (entry) {
            const base = entry.name.split('/').pop();
            if (entry.name.toLowerCase().endsWith('annotations.json')) {
                annotation = JSON.parse(new TextDecoder().decode(entry.data));
                return;
            }
            images.push({ name: base, blob: new Blob([entry.data], { type: benchMimeForName(base) }) });
        });

        if (images.length === 0) {
            throw new Error('The archive contains no images.');
        }

        const truthByFile = {};
        if (annotation && Array.isArray(annotation.images)) {
            annotation.images.forEach(function (image) { truthByFile[image.file] = image; });
        }

        let matched = 0;
        for (const image of images) {
            const entry = truthByFile[image.name] || truthByFile['images/' + image.name] || null;
            /* The annotation entry is flattened here: scoring wants the MRZ
               ground truth itself (fields, text, band quad), while the viewer
               also needs the document quad and the degradation list that came
               beside it. One shape, filled once, instead of every reader of it
               knowing where the wrapper hides the parts. */
            image.truth = entry ? {
                fields: entry.mrz.fields,
                text: entry.mrz.text,
                points: entry.mrz.points,
                checkDigits: entry.mrz.checkDigits,
                format: entry.mrz.format,
                issuingState: entry.mrz.issuingState,
                degradations: entry.degradations || {},
                documentPoints: (entry.document && entry.document.points) || null
            } : null;
            if (image.truth) matched++;
            image.dataUrl = await benchBlobToDataUrl(image.blob);
            image.width = entry ? entry.width : 0;
            image.height = entry ? entry.height : 0;
        }

        benchState.dataset = {
            file: file.name,
            format: annotation ? annotation.format : null,
            generator: annotation ? annotation.generator : null,
            annotated: matched,
            images: images
        };
        benchState.results = [];
        benchState.selected = -1;

        benchRenderDataset();
        benchRenderTable();
        benchRenderSummary();
        benchShowDetail(-1);
        if (images.length) benchShowImage(0);

        benchShowProgress(false);
        benchSetStatus(images.length + ' image' + (images.length === 1 ? '' : 's') + ' loaded'
            + (matched ? '.' : ' — no ground truth in this archive.'));
        benchEls.benchRunBtn.disabled = !(matched > 0) || !benchReaderReady();
        analytics.action('benchmark_load', { images: images.length, annotated: matched });
    } catch (ex) {
        console.error(ex);
        benchShowProgress(false);
        benchSetStatus('Could not read the dataset.');
        benchShowError('Could not read ' + file.name + ': ' + ex.message
            + ' Build the dataset with the MRZ generator and drop its ZIP here.');
        analytics.fail('benchmark', 'load');
    }
}

function benchReaderReady() {
    return typeof isMRZReady !== 'undefined' && isMRZReady && typeof cvr !== 'undefined' && cvr;
}

function benchRenderDataset() {
    const dataset = benchState.dataset;
    if (!dataset) return;
    const generator = dataset.generator || {};
    const lines = [
        dataset.file,
        dataset.images.length + ' image' + (dataset.images.length === 1 ? '' : 's')
        + (dataset.annotated ? ', ' + dataset.annotated + ' with ground truth' : ''),
        'schema ' + (dataset.format || 'unknown'),
        'read with the ' + BENCH_TEMPLATE + ' template'
    ];
    if (generator.seed) {
        lines.push('seed "' + generator.seed + '" — ' + (generator.doc_type || 'mixed')
            + ', ' + (generator.samples_requested || dataset.images.length) + ' requested');
    }
    const box = benchEls.benchDataset;
    box.textContent = '';
    lines.forEach(function (line) {
        const row = document.createElement('div');
        row.textContent = line;
        box.appendChild(row);
    });
}

/* ========================================================================
 * Running
 * ======================================================================== */

/* One image, through the same reader the single-scan mode uses. Returns the
   score row whether or not anything was read — a miss is a result. */
async function benchReadImage(image, index) {
    const started = performance.now();
    const rawLines = [];
    const quads = [];
    let read = null;
    let error = null;

    try {
        const result = await cvr.capture(image.dataUrl, BENCH_TEMPLATE);
        const items = (result && result.items) || [];
        for (const item of items) {
            if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE && item.text) {
                rawLines.push(item.text);
                if (item.location && item.location.points) quads.push(item.location.points);
            }
        }
        const mrzLines = benchMrzLines(rawLines);
        if (mrzLines.length) {
            const parsed = await parser.parse(mrzLines.join(''));
            read = benchReadFields(parsed);
        }
    } catch (ex) {
        console.error('benchmark: image ' + (index + 1) + ' failed', ex);
        error = String((ex && ex.message) || ex);
    }

    const milliseconds = Math.round(performance.now() - started);
    const score = benchScore(image.truth, read, rawLines);

    return {
        index: index,
        file: image.name,
        degradations: image.truth ? (image.truth.degradations || {}) : {},
        milliseconds: milliseconds,
        mrzRead: rawLines.length > 0,
        rawLines: rawLines,
        quads: quads,
        read: read,
        score: score,
        error: error
    };
}

async function benchRun() {
    if (benchState.running || !benchState.dataset) return;
    if (!benchReaderReady()) {
        benchShowError('The MRZ reader is still initializing. Run the benchmark once the '
            + 'page reports it is ready.');
        return;
    }

    benchShowError(null);
    benchState.running = true;
    benchState.cancel = false;
    benchState.results = [];
    benchEls.benchRunBtn.disabled = true;
    benchEls.benchLoadBtn.disabled = true;
    benchEls.benchStopBtn.hidden = false;
    benchEls.benchExportJsonBtn.disabled = true;
    benchEls.benchExportCsvBtn.disabled = true;

    const images = benchState.dataset.images;
    const startedAll = performance.now();

    for (let i = 0; i < images.length; i++) {
        if (benchState.cancel) break;
        benchShowProgress(true, i / images.length, 'Reading image ' + (i + 1) + ' of ' + images.length + '…');
        benchSetStatus('Reading image ' + (i + 1) + ' of ' + images.length + '…');
        benchShowImage(i);

        const row = await benchReadImage(images[i], i);
        benchState.results.push(row);

        benchRenderTable();
        benchRenderSummary();
        benchSetStatus('Scored ' + (i + 1) + ' of ' + images.length + '.');
        await benchNextPaint();
    }

    const elapsed = Math.round(performance.now() - startedAll);
    benchState.running = false;
    benchEls.benchLoadBtn.disabled = false;
    benchEls.benchStopBtn.hidden = true;
    benchEls.benchRunBtn.disabled = false;
    benchShowProgress(false);

    const summary = benchSummary();
    benchSetStatus(benchState.cancel
        ? 'Stopped after ' + summary.images + ' of ' + images.length + ' images.'
        : summary.images + ' images in ' + elapsed + ' ms — ' + summary.totalCorrect + ' of '
            + summary.totalFields + ' fields correct.');
    benchEls.benchExportJsonBtn.disabled = summary.images === 0;
    benchEls.benchExportCsvBtn.disabled = summary.images === 0;

    if (summary.images) {
        analytics.action('benchmark_run', {
            images: summary.images,
            mrz_read: summary.mrzRead,
            fields_correct: summary.totalCorrect,
            fields_total: summary.totalFields
        });
    }
}

function benchNextPaint() {
    return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
}

/* ========================================================================
 * Scoring summary
 * ======================================================================== */

function benchSummary() {
    const results = benchState.results;
    const summary = {
        images: results.length,
        mrzRead: results.filter(function (r) { return r.mrzRead; }).length,
        fullyCorrect: results.filter(function (r) {
            return r.score.total > 0 && r.score.correct === r.score.total;
        }).length,
        lineCorrect: results.filter(function (r) { return r.score.mrzLine.correct; }).length,
        fields: {},
        totalCorrect: 0,
        totalFields: 0,
        totalMs: 0,
        averageMs: 0,
        medianMs: 0
    };

    BENCH_FIELDS.forEach(function (field) {
        summary.fields[field.id] = { label: field.label, correct: 0, total: 0 };
    });

    results.forEach(function (row) {
        summary.totalCorrect += row.score.correct;
        summary.totalFields += row.score.total;
        summary.totalMs += row.milliseconds;
        row.score.fields.forEach(function (field) {
            const entry = summary.fields[field.id];
            entry.total++;
            if (field.correct) entry.correct++;
        });
    });

    if (results.length) {
        summary.averageMs = Math.round(summary.totalMs / results.length);
        const sorted = results.map(function (r) { return r.milliseconds; }).sort(function (a, b) { return a - b; });
        const middle = Math.floor(sorted.length / 2);
        summary.medianMs = sorted.length % 2
            ? sorted[middle]
            : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    }
    return summary;
}

function benchPercent(correct, total) {
    return total ? Math.round((correct / total) * 1000) / 10 : 0;
}

function benchRenderSummary() {
    const box = benchEls.benchSummary;
    box.textContent = '';
    const results = benchState.results;
    if (!results.length) {
        const empty = document.createElement('p');
        empty.className = 'bench-empty';
        empty.textContent = benchState.dataset
            ? 'Loaded — press Run benchmark to score it.'
            : 'Run the benchmark to score this dataset.';
        box.appendChild(empty);
        return;
    }

    const summary = benchSummary();
    const tiles = [
        ['Images', String(summary.images)],
        ['MRZ read', summary.mrzRead + ' / ' + summary.images],
        ['Every field correct', summary.fullyCorrect + ' / ' + summary.images],
        ['Fields correct', summary.totalCorrect + ' / ' + summary.totalFields],
        ['Field accuracy', benchPercent(summary.totalCorrect, summary.totalFields) + '%'],
        ['Median time', summary.medianMs + ' ms']
    ];

    const grid = document.createElement('div');
    grid.className = 'bench-tiles';
    tiles.forEach(function (tile) {
        const cell = document.createElement('div');
        cell.className = 'bench-tile';
        const value = document.createElement('span');
        value.className = 'bench-tile-value';
        value.textContent = tile[1];
        const label = document.createElement('span');
        label.className = 'bench-tile-label';
        label.textContent = tile[0];
        cell.appendChild(value);
        cell.appendChild(label);
        grid.appendChild(cell);
    });
    box.appendChild(grid);

    const table = document.createElement('table');
    table.className = 'bench-table bench-field-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Field', 'Correct', 'Accuracy'].forEach(function (text) {
        const th = document.createElement('th');
        th.textContent = text;
        headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    BENCH_FIELDS.forEach(function (field) {
        const entry = summary.fields[field.id];
        const tr = document.createElement('tr');
        const name = document.createElement('th');
        name.scope = 'row';
        name.textContent = field.label;
        const count = document.createElement('td');
        count.textContent = entry.correct + ' / ' + entry.total;
        const accuracy = document.createElement('td');
        accuracy.textContent = benchPercent(entry.correct, entry.total) + '%';
        accuracy.className = entry.correct === entry.total ? 'bench-ok' : (entry.correct ? '' : 'bench-bad');
        tr.appendChild(name);
        tr.appendChild(count);
        tr.appendChild(accuracy);
        body.appendChild(tr);
    });

    const lineRow = document.createElement('tr');
    const lineName = document.createElement('th');
    lineName.scope = 'row';
    lineName.textContent = 'MRZ lines verbatim';
    const lineCount = document.createElement('td');
    lineCount.textContent = summary.lineCorrect + ' / ' + summary.images;
    const lineAccuracy = document.createElement('td');
    lineAccuracy.textContent = benchPercent(summary.lineCorrect, summary.images) + '%';
    lineRow.appendChild(lineName);
    lineRow.appendChild(lineCount);
    lineRow.appendChild(lineAccuracy);
    body.appendChild(lineRow);
    table.appendChild(body);

    /* The verbatim row is reported but not part of the field total, and saying
       so here is cheaper than a reader wondering why the two disagree. */
    const note = document.createElement('p');
    note.className = 'bench-note';
    note.textContent = 'Fields are scored on the parsed values. The verbatim row only counts '
        + 'images whose MRZ lines came back character for character (filler included), so it '
        + 'reads lower than the field score whenever a reader pads or splits a line differently.';

    box.appendChild(table);
    box.appendChild(note);
}

/* ========================================================================
 * Results table and detail
 * ======================================================================== */

function benchRenderTable() {
    const head = benchEls.benchHeadRow;
    const body = benchEls.benchRows;
    head.textContent = '';
    body.textContent = '';

    if (!benchState.dataset) {
        benchEls.benchTableCaption.textContent = 'No results yet.';
        return;
    }

    [''].concat(BENCH_FIELDS.map(function (field) { return field.head; })).concat(['ms'])
        .forEach(function (text, position) {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = text || '#';
            head.appendChild(th);
        });
    /* The per-field columns are abbreviations; the detail panel spells them out
       for whichever row is selected. */
    benchEls.benchTableCaption.textContent = benchState.results.length
        ? 'One row per image — click a row to inspect it. ' + BENCH_FIELDS.map(function (f) {
            return f.head + ' = ' + f.label;
        }).join(', ') + '.'
        : 'Loaded ' + benchState.dataset.images.length + ' image(s) — nothing scored yet.';

    if (!benchState.results.length) return;

    benchState.results.forEach(function (row) {
        const tr = document.createElement('tr');
        tr.className = 'bench-row';
        if (row.index === benchState.selected) tr.classList.add('is-selected');

        const index = document.createElement('td');
        index.textContent = String(row.index + 1);
        tr.appendChild(index);

        row.score.fields.forEach(function (field) {
            const td = document.createElement('td');
            td.className = 'bench-mark ' + (field.correct ? 'bench-ok' : (field.missing ? 'bench-missing' : 'bench-bad'));
            td.textContent = field.correct ? '✓' : (field.missing ? '—' : '✗');
            td.title = field.label + ': read "' + field.actual + '", expected "' + field.expected + '"';
            tr.appendChild(td);
        });

        const ms = document.createElement('td');
        ms.textContent = String(row.milliseconds);
        tr.appendChild(ms);

        tr.addEventListener('click', function () { benchSelect(row.index); });
        body.appendChild(tr);
    });
}

function benchSelect(index) {
    benchState.selected = index;
    benchRenderTable();
    benchShowDetail(index);
    benchShowImage(index);
}

function benchShowDetail(index) {
    const box = benchEls.benchDetail;
    box.textContent = '';
    const row = benchState.results.find(function (r) { return r.index === index; });
    if (!row) {
        box.textContent = 'Click a row to see what was read and what was expected.';
        return;
    }

    const lines = [];
    lines.push(row.file + ' — ' + row.milliseconds + ' ms');
    if (row.error) lines.push('reader error: ' + row.error);
    const conditions = Object.keys(row.degradations || {}).filter(function (id) {
        const value = row.degradations[id];
        return value !== false && value !== null && value !== undefined;
    }).map(function (id) { return id + ' ' + row.degradations[id]; }).join(', ');
    lines.push(conditions ? 'applied: ' + conditions : 'applied: nothing');

    const table = document.createElement('table');
    table.className = 'bench-table bench-detail-table';
    row.score.fields.forEach(function (field) {
        const tr = document.createElement('tr');
        const name = document.createElement('th');
        name.scope = 'row';
        name.textContent = field.label;
        const verdict = document.createElement('td');
        verdict.className = 'bench-mark ' + (field.correct ? 'bench-ok' : (field.missing ? 'bench-missing' : 'bench-bad'));
        verdict.textContent = field.correct ? 'correct' : (field.missing ? 'not read' : 'wrong');
        const detail = document.createElement('td');
        detail.textContent = field.correct
            ? field.expected
            : 'read "' + field.actual + '" · expected "' + field.expected + '"';
        tr.appendChild(name);
        tr.appendChild(verdict);
        tr.appendChild(detail);
        table.appendChild(tr);
    });

    const lineState = document.createElement('p');
    lineState.className = 'bench-note';
    lineState.textContent = row.score.mrzLine.correct
        ? 'MRZ lines came back character for character.'
        : 'MRZ lines read: ' + (row.rawLines.join(' | ') || '(none)');

    box.appendChild(document.createTextNode(lines.join('\n')));
    box.appendChild(table);
    box.appendChild(lineState);
}

/* ========================================================================
 * Viewer
 * ======================================================================== */

/* Shows one dataset image and draws both quads: what the generator says the
   MRZ band is (orange, dashed) and what the reader found (green). The two
   drifting apart is a localization answer the field scores cannot give. */
function benchShowImage(index) {
    if (!benchState.dataset || !benchState.dataset.images[index]) return;
    const image = benchState.dataset.images[index];
    const target = els.displayImage;

    els.placeholderText.classList.add('hidden');
    els.imageView.classList.remove('hidden');
    els.cameraView.classList.add('hidden');

    const paint = function () {
        resizeCanvas();
        benchDrawQuads(index);
    };
    if (target.src === image.dataUrl && target.complete) {
        paint();
        return;
    }
    target.onload = paint;
    target.src = image.dataUrl;
}

function benchDrawQuads(index) {
    const image = benchState.dataset.images[index];
    const ctx = els.overlayCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);

    if (image.truth && image.truth.documentPoints) {
        benchPolygon(ctx, image.truth.documentPoints, 'rgba(255, 255, 255, 0.35)', [10, 6], 1);
    }
    if (image.truth && image.truth.points) {
        benchPolygon(ctx, image.truth.points, '#fe8e14', [6, 4], 2);
    }

    const row = benchState.results.find(function (r) { return r.index === index; });
    if (row) {
        row.quads.forEach(function (points) {
            benchPolygon(ctx, points, '#00ff00', [], 2);
        });
    }
}

function benchPolygon(ctx, points, color, dash, width) {
    if (!points || !points.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash.length) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

/* ========================================================================
 * Export
 * ======================================================================== */

function benchDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

function benchSeedSlug() {
    const generator = benchState.dataset && benchState.dataset.generator;
    const seed = (generator && generator.seed) || (benchState.dataset && benchState.dataset.file) || 'dataset';
    return String(seed).replace(/[^A-Za-z0-9_-]+/g, '_') || 'dataset';
}

function benchResultsPayload() {
    const summary = benchSummary();
    return {
        format: 'mrz-benchmark-results/1.0',
        generated: new Date().toISOString(),
        dataset: {
            file: benchState.dataset.file,
            schema: benchState.dataset.format,
            generator: benchState.dataset.generator
        },
        summary: {
            images: summary.images,
            mrz_read: summary.mrzRead,
            fully_correct: summary.fullyCorrect,
            fields_correct: summary.totalCorrect,
            fields_total: summary.totalFields,
            field_accuracy: benchPercent(summary.totalCorrect, summary.totalFields),
            mrz_lines_verbatim_correct: summary.lineCorrect,
            total_ms: summary.totalMs,
            average_ms: summary.averageMs,
            median_ms: summary.medianMs,
            per_field: summary.fields
        },
        images: benchState.results.map(function (row) {
            return {
                file: row.file,
                milliseconds: row.milliseconds,
                mrz_read: row.mrzRead,
                error: row.error,
                degradations: row.degradations,
                fields_correct: row.score.correct,
                fields_total: row.score.total,
                mrz_lines_verbatim: row.score.mrzLine.correct,
                fields: row.score.fields.map(function (field) {
                    return {
                        id: field.id,
                        label: field.label,
                        expected: field.expected,
                        read: field.actual,
                        correct: field.correct
                    };
                })
            };
        })
    };
}

function benchExportJson() {
    if (!benchState.results.length) return;
    benchDownload(new Blob([JSON.stringify(benchResultsPayload(), null, 2)],
        { type: 'application/json' }), 'mrz-benchmark-results-' + benchSeedSlug() + '.json');
    analytics.action('benchmark_export', { kind: 'json', images: benchState.results.length });
}

function benchCsvCell(value) {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function benchExportCsv() {
    if (!benchState.results.length) return;
    const header = ['image', 'mrz_read', 'ms'].concat(BENCH_FIELDS.map(function (field) { return field.id; }));
    const rows = benchState.results.map(function (row) {
        return [row.file, row.mrzRead ? 'yes' : 'no', row.milliseconds].concat(
            row.score.fields.map(function (field) {
                return field.correct ? 'correct' : (field.missing ? 'not_read' : 'wrong');
            }));
    });
    const csv = [header].concat(rows).map(function (row) {
        return row.map(benchCsvCell).join(',');
    }).join('\n');
    benchDownload(new Blob([csv], { type: 'text/csv' }), 'mrz-benchmark-results-' + benchSeedSlug() + '.csv');
    analytics.action('benchmark_export', { kind: 'csv', images: benchState.results.length });
}

/* ========================================================================
 * Chrome: mode switch, status, progress, wiring
 * ======================================================================== */

function benchSetMode(mode) {
    const benchmark = mode === 'benchmark';
    benchEls.singleToolbar.hidden = benchmark;
    benchEls.singleResults.hidden = benchmark;
    benchEls.benchToolbar.hidden = !benchmark;
    benchEls.benchResults.hidden = !benchmark;
    benchEls.modeTabSingle.classList.toggle('is-active', !benchmark);
    benchEls.modeTabBenchmark.classList.toggle('is-active', benchmark);
    benchEls.modeTabSingle.setAttribute('aria-selected', String(!benchmark));
    benchEls.modeTabBenchmark.setAttribute('aria-selected', String(benchmark));
    if (benchmark && typeof isCameraRunning !== 'undefined' && isCameraRunning && typeof stopCamera === 'function') {
        stopCamera();
    }
    if (!benchmark) benchShowProgress(false);
    analytics.action('scanner_mode', { mode: mode });
}

function benchSetStatus(text) {
    benchEls.benchStatus.textContent = text;
}

function benchShowProgress(visible, fraction, text) {
    benchEls.benchProgress.hidden = !visible;
    if (!visible) return;
    benchEls.benchProgressBar.style.width = Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100) + '%';
    if (text) benchEls.benchProgressText.textContent = text;
}

function benchShowError(message) {
    const box = document.getElementById('benchError');
    if (!box) return;
    box.textContent = message || '';
    box.classList.toggle('is-visible', !!message);
}

function benchErrorBox() {
    /* Created here rather than in the markup so the notice only exists when
       there is something to say. */
    const box = document.createElement('div');
    box.id = 'benchError';
    box.className = 'bench-error';
    box.setAttribute('role', 'alert');
    benchEls.benchToolbar.parentNode.insertBefore(box, benchEls.dropZone);
    return box;
}

function benchBind() {
    benchEls.modeTabSingle.addEventListener('click', function () { benchSetMode('single'); });
    benchEls.modeTabBenchmark.addEventListener('click', function () { benchSetMode('benchmark'); });

    benchEls.benchLoadBtn.addEventListener('click', function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,application/zip';
        input.onchange = function (e) {
            if (e.target.files.length > 0) benchLoad(e.target.files[0]);
        };
        input.click();
    });

    benchEls.benchRunBtn.addEventListener('click', function () { benchRun(); });
    benchEls.benchStopBtn.addEventListener('click', function () {
        benchState.cancel = true;
        benchSetStatus('Stopping after the current image…');
    });
    benchEls.benchExportJsonBtn.addEventListener('click', benchExportJson);
    benchEls.benchExportCsvBtn.addEventListener('click', benchExportCsv);
}

function benchInit() {
    BENCH_IDS.forEach(function (id) { benchEls[id] = document.getElementById(id); });
    if (!benchEls.benchToolbar) return;   // markup not present — leave single mode alone
    benchErrorBox();
    benchBind();
    benchSetMode('single');

    /* The reader loads asynchronously; the run button waits for it. */
    const waitForReader = setInterval(function () {
        if (benchReaderReady()) {
            clearInterval(waitForReader);
            benchEls.benchRunBtn.disabled = !(benchState.dataset && benchState.dataset.annotated > 0);
        }
    }, 1000);
}

/* Exposed so script.js can route a dropped or pasted ZIP here — and so the
   single-scan path can take the page back out of benchmark mode. */
window.MrzBenchmark = {
    accepts: benchAccepts,
    load: benchLoad,
    isActive: function () { return !benchEls.benchResults.hidden; },
    showSingle: function () { benchSetMode('single'); }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', benchInit);
} else {
    benchInit();
}
