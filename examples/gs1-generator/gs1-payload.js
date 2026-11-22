/*
 * gs1-payload.js — GS1 test payload builder.
 *
 * Builds, validates and renders GS1 element strings for the generator demo, and
 * states what a conformant scanner should report back. That "expected result" is
 * the whole point: the generated image plus this table is a test case.
 *
 * No dependencies, no DOM. Loads as a plain script (window.GS1Payload) and is
 * require()-able for tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GS1Payload = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SEP = '|';
    var FNC1 = String.fromCharCode(29);

    /* A GS1 demo prefix. Using a fixed one keeps generated numbers plausible —
       and stays clear of any real company's allocation. */
    var DEMO_PREFIX = '0950600';

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function digits(n) {
        var out = '';
        for (var i = 0; i < n; i++) out += String(randInt(0, 9));
        return out;
    }

    function pick(list) {
        return list[randInt(0, list.length - 1)];
    }

    function pad(number, width) {
        var out = String(number);
        while (out.length < width) out = '0' + out;
        return out;
    }

    /* Mod-10 check digit shared by GTIN, SSCC, GLN and GSRN. */
    function checkDigit(data) {
        var sum = 0;
        var weight = 3;
        for (var i = data.length - 1; i >= 0; i--) {
            sum += Number(data.charAt(i)) * weight;
            weight = weight === 3 ? 1 : 3;
        }
        return String((10 - (sum % 10)) % 10);
    }

    /* The scanner validates the check digit, so a test payload that fails it is
       a test of the failure path, not a valid sample. Complete it by default and
       let the caller deliberately break it. */
    function withCheckDigit(dataWithoutCheck) {
        return dataWithoutCheck + checkDigit(dataWithoutCheck);
    }

    function formatDate(date) {
        return pad(date.getFullYear() % 100, 2) + pad(date.getMonth() + 1, 2) + pad(date.getDate(), 2);
    }

    function daysFromNow(days) {
        var date = new Date();
        date.setDate(date.getDate() + days);
        return date;
    }

    /* A YYMMDD value the scanner will render back to the same calendar day. */
    function sampleDate(minDays, maxDays) {
        return formatDate(daysFromNow(randInt(minDays, maxDays)));
    }

    /* ------------------------------------------------------------------ *
     * AI catalogue
     *
     * `kind` drives both validation and the input hint:
     *   gtin | sscc | gln   check-digit families
     *   date                YYMMDD
     *   number              fixed-length digits
     *   decimal             the 3Nxx measurement families
     *   country             ISO 3166-1 numeric
     *   text                variable-length alphanumeric
     *
     * `fixed` is the data length for fixed-length AIs; `max` is the limit for
     * variable-length ones.
     * ------------------------------------------------------------------ */

    var AI_LIST = [
        { ai: '00', title: 'SSCC', kind: 'sscc', fixed: 18, group: 'Logistics',
            sample: function () { return withCheckDigit('3' + DEMO_PREFIX + digits(9)); } },
        { ai: '01', title: 'GTIN', kind: 'gtin', fixed: 14, group: 'Retail',
            sample: function () { return withCheckDigit('0' + DEMO_PREFIX + digits(5)); } },
        { ai: '02', title: 'CONTENT', kind: 'gtin', fixed: 14, group: 'Retail',
            sample: function () { return withCheckDigit('0' + DEMO_PREFIX + digits(5)); } },
        { ai: '10', title: 'BATCH/LOT', kind: 'text', max: 20, group: 'Traceability',
            sample: function () { return 'LOT-' + digits(5); } },
        { ai: '11', title: 'PRODUCTION DATE', kind: 'date', fixed: 6, group: 'Dates',
            sample: function () { return sampleDate(-120, -30); } },
        { ai: '13', title: 'PACKAGING DATE', kind: 'date', fixed: 6, group: 'Dates',
            sample: function () { return sampleDate(-90, -10); } },
        { ai: '15', title: 'BEST BEFORE DATE', kind: 'date', fixed: 6, group: 'Dates',
            sample: function () { return sampleDate(60, 400); } },
        { ai: '17', title: 'EXPIRATION DATE', kind: 'date', fixed: 6, group: 'Dates',
            sample: function () { return sampleDate(90, 700); } },
        { ai: '20', title: 'PRODUCT VARIANT', kind: 'number', fixed: 2, group: 'Retail',
            sample: function () { return digits(2); } },
        { ai: '21', title: 'SERIAL NUMBER', kind: 'text', max: 20, group: 'Traceability',
            sample: function () { return 'SN' + digits(8); } },
        { ai: '22', title: 'CONSUMER PRODUCT VARIANT', kind: 'text', max: 20, group: 'Retail',
            sample: function () { return digits(6); } },
        { ai: '30', title: 'VARIABLE COUNT', kind: 'number', max: 8, group: 'Measurements',
            sample: function () { return String(randInt(2, 24)); } },
        { ai: '37', title: 'COUNT OF TRADE ITEMS', kind: 'number', max: 8, group: 'Measurements',
            sample: function () { return String(randInt(2, 48)); } },
        { ai: '240', title: 'ADDITIONAL PRODUCT ID', kind: 'text', max: 30, group: 'Retail',
            sample: function () { return 'ADDL-' + digits(4); } },
        { ai: '241', title: 'CUSTOMER PART NUMBER', kind: 'text', max: 30, group: 'Retail',
            sample: function () { return 'CPN' + digits(7); } },
        { ai: '250', title: 'SECONDARY SERIAL NUMBER', kind: 'text', max: 30, group: 'Traceability',
            sample: function () { return 'SSN' + digits(6); } },
        { ai: '251', title: 'SOURCE ENTITY', kind: 'text', max: 30, group: 'Traceability',
            sample: function () { return 'SOURCE-' + digits(3); } },
        { ai: '400', title: 'ORDER NUMBER', kind: 'text', max: 30, group: 'Logistics',
            sample: function () { return 'PO' + digits(8); } },
        { ai: '401', title: 'GINC', kind: 'text', max: 30, group: 'Logistics',
            sample: function () { return 'GINC' + digits(10); } },
        { ai: '403', title: 'ROUTING CODE', kind: 'text', max: 30, group: 'Logistics',
            sample: function () { return 'RT' + digits(6); } },
        { ai: '410', title: 'SHIP TO - GLN', kind: 'gln', fixed: 13, group: 'Parties',
            sample: function () { return withCheckDigit(DEMO_PREFIX + digits(5)); } },
        { ai: '414', title: 'PHYSICAL LOCATION - GLN', kind: 'gln', fixed: 13, group: 'Parties',
            sample: function () { return withCheckDigit(DEMO_PREFIX + digits(5)); } },
        { ai: '421', title: 'SHIP TO POSTAL CODE', kind: 'text', max: 12, group: 'Parties',
            sample: function () { return '156' + digits(6); } },
        { ai: '422', title: 'COUNTRY OF ORIGIN', kind: 'country', fixed: 3, group: 'Parties',
            sample: function () { return pick(['156', '840', '276', '826', '392', '704']); } },
        { ai: '7001', title: 'NSN', kind: 'number', fixed: 13, group: 'Assets',
            sample: function () { return '1' + digits(12); } },
        { ai: '7003', title: 'EXPIRATION DATE AND TIME', kind: 'number', fixed: 10, group: 'Dates',
            sample: function () { return sampleDate(90, 700) + pad(randInt(0, 23), 2) + pad(randInt(0, 59), 2); } },
        { ai: '8003', title: 'GRAI', kind: 'text', max: 30, group: 'Assets',
            sample: function () { return withCheckDigit('0' + DEMO_PREFIX + digits(5)) + '21' + digits(4); } },
        { ai: '8006', title: 'ITIP', kind: 'text', fixed: 18, group: 'Logistics',
            sample: function () { return withCheckDigit('0' + DEMO_PREFIX + digits(5)) + pad(randInt(1, 20), 2) + pad(randInt(20, 60), 2); } },
        { ai: '8013', title: 'GMN', kind: 'text', max: 30, group: 'Assets',
            sample: function () { return 'GMN-' + digits(8); } },
        { ai: '8017', title: 'GSRN - PROVIDER', kind: 'sscc', fixed: 18, group: 'Parties',
            sample: function () { return withCheckDigit('5' + DEMO_PREFIX + digits(9)); } },
        { ai: '8020', title: 'PAYMENT SLIP REFERENCE', kind: 'text', max: 25, group: 'Logistics',
            sample: function () { return 'PSR' + digits(10); } },
        { ai: '91', title: 'INTERNAL - IN-COMPANY', kind: 'text', max: 30, group: 'Internal',
            sample: function () { return 'WEB-' + digits(6); } }
    ];

    /* The 3Ndd measurement families, as four-digit AIs with a fixed 6-digit value
       (9 digits for the currency-prefixed ones). */
    var MEASURE_FAMILIES = [
        { family: '310', title: 'NET WEIGHT', unit: 'kg', decimals: 3 },
        { family: '320', title: 'NET WEIGHT', unit: 'lb', decimals: 3 },
        { family: '330', title: 'GROSS WEIGHT', unit: 'kg', decimals: 3 },
        { family: '392', title: 'PRICE', unit: 'local currency', decimals: 2 },
        { family: '394', title: 'PERCENTAGE DISCOUNT', unit: '%', decimals: 1 }
    ];

    MEASURE_FAMILIES.forEach(function (measure) {
        var ai = measure.family + measure.decimals;
        AI_LIST.push({
            ai: ai,
            title: measure.title + ' (' + measure.unit + ')',
            kind: 'decimal',
            fixed: 6,
            decimals: measure.decimals,
            group: 'Measurements',
            unit: measure.unit,
            sample: function () {
                /* A plausible value: kg between 0.05 and 4.00, price under 100. */
                if (measure.family === '310' || measure.family === '320' || measure.family === '330') {
                    return pad(randInt(50, 4000), 6);
                }
                if (measure.family === '394') {
                    return pad(randInt(0, 300), 6);
                }
                return pad(randInt(1, 9999), 6);
            }
        });
    });

    /* The money-with-currency form: 3-digit ISO 4217 code + 6 digits. */
    ['391', '393'].forEach(function (family) {
        AI_LIST.push({
            ai: family + '2',
            title: (family === '391' ? 'AMOUNT PAYABLE' : 'PRICE') + ' (ISO currency)',
            kind: 'decimal',
            fixed: 9,
            decimals: 2,
            currency: true,
            group: 'Measurements',
            sample: function () { return '978' + pad(randInt(1, 99999), 6); }
        });
    });

    var AI_BY_CODE = {};
    AI_LIST.forEach(function (entry) { AI_BY_CODE[entry.ai] = entry; });

    /* Order the picker so the AIs people actually reach for come first. */
    var COMMON_AIS = ['01', '10', '17', '21', '3103', '3922', '00', '11', '15',
        '13', '30', '37', '240', '241', '410', '422', '8003', '8006', '91'];

    /* ------------------------------------------------------------------ *
     * Scenarios
     *
     * Each one is a payload a real GS1 system would produce, paired with the
     * symbology that carries it in the field.
     * ------------------------------------------------------------------ */

    var SCENARIOS = [
        {
            id: 'retail',
            label: 'Retail unit — GTIN only',
            note: 'A fixed-weight retail item. GS1 DataBar Omnidirectional is what a '
                + 'supermarket scanner reads at the till.',
            symbology: 'databaromni',
            build: function () { return [row('01')]; }
        },
        {
            id: 'fresh',
            label: 'Fresh food — GTIN + weight + price',
            note: 'Variable-measure produce weighed at the counter. DataBar Expanded is the '
                + 'only DataBar that can carry the weight and the price beside the GTIN.',
            symbology: 'databarexpandedstacked',
            build: function () {
                return [row('01'), row('3103'), row('3922')];
            }
        },
        {
            id: 'pharma',
            label: 'Healthcare unit — GTIN + expiry + batch + serial',
            note: 'A serialised medicine pack. This is the payload GS1 DataMatrix carries '
                + 'on unit-of-use healthcare products.',
            symbology: 'gs1datamatrix',
            build: function () {
                return [row('01'), row('17'), row('10'), row('21')];
            }
        },
        {
            id: 'carton',
            label: 'Logistics carton — SSCC',
            note: 'A shipping carton identified by its Serial Shipping Container Code. '
                + 'GS1-128 is the usual carrier because the SSCC is only 18 digits.',
            symbology: 'gs1_128',
            build: function () { return [row('00')]; }
        },
        {
            id: 'itf',
            label: 'ITF-14 carton — GTIN only',
            note: 'A plain corrugated carton. ITF-14 is printed directly on the board and '
                + 'carries nothing but the GTIN, so batch data goes in a second label.',
            symbology: 'itf14',
            build: function () { return [row('01')]; }
        },
        {
            id: 'ordered',
            label: 'Order + delivery — GTIN, batch, order, ship-to',
            note: 'A pallet label payload: what it is, which batch, against which order, '
                + 'and where it is going.',
            symbology: 'gs1_128',
            build: function () {
                return [row('01'), row('10'), row('400'), row('410'), row('422')];
            }
        },
        {
            id: 'ratio',
            label: 'Ratio pack — GTIN + count + best before',
            note: 'A multipack priced per unit, where the count of trade items matters.',
            symbology: 'databarexpanded',
            build: function () { return [row('01'), row('30'), row('15')]; }
        },
        {
            id: 'asset',
            label: 'Returnable asset — GRAI',
            note: 'A returnable asset rather than a saleable product, identified by its Global '
                + 'Returnable Asset Identifier. The GRAI carries its own serial component, which '
                + 'is why no AI 21 is needed here — a bare serial requires AI 01, 03 or 8006.',
            symbology: 'gs1datamatrix',
            build: function () { return [row('8003')]; }
        },
        {
            id: 'pricemarked',
            label: 'Price-marked pack — GTIN + weight + price in EUR',
            note: 'A pack labelled with its own price. AI 393x states the price in an ISO 4217 '
                + 'currency, and GS1 requires it to be accompanied by the quantity it applies '
                + 'to — here the net weight in AI 3103.',
            symbology: 'databarexpanded',
            build: function () { return [row('01'), row('3103'), row('3932')]; }
        },
        {
            id: 'qr',
            label: 'Consumer-facing — GTIN + batch + serial',
            note: 'The same identifiers as the healthcare unit, carried in a GS1 QR Code '
                + 'so a phone can also read it.',
            symbology: 'gs1qrcode',
            build: function () { return [row('01'), row('10'), row('21')]; }
        },
        {
            id: 'custom',
            label: 'Custom — build your own',
            note: 'Start from the elements below and add whatever the test needs.',
            symbology: 'gs1datamatrix',
            build: function () { return [row('01'), row('17'), row('10')]; }
        }
    ];

    function row(ai) {
        var entry = AI_BY_CODE[ai];
        return { ai: ai, value: entry ? entry.sample() : '' };
    }

    /* ------------------------------------------------------------------ *
     * Symbologies
     *
     * `aiSyntax` is the crucial column: the GS1 encoders in BWIPP (bwip-js's
     * engine) take the human-readable "(01)…(10)…" form and work out the FNC1
     * placement themselves, while plain ITF-14 and EAN-13 take raw digits.
     * ------------------------------------------------------------------ */

    var SYMBOLOGIES = [
        { id: 'databaromni', label: 'GS1 DataBar Omnidirectional', aiSyntax: true, kind: '1D',
            minWidth: 300, gtinOnly: true, note: 'The full-height retail symbol.' },
        { id: 'databartruncated', label: 'GS1 DataBar Truncated', aiSyntax: true, kind: '1D',
            minWidth: 300, gtinOnly: true, note: 'Shorter bars, for small packaging.' },
        { id: 'databarstacked', label: 'GS1 DataBar Stacked', aiSyntax: true, kind: '1D',
            minWidth: 200, gtinOnly: true, note: 'Two rows, for narrow labels.' },
        { id: 'databarstackedomni', label: 'GS1 DataBar Stacked Omnidirectional', aiSyntax: true, kind: '1D',
            minWidth: 200, gtinOnly: true, note: 'Two full-height rows, omnidirectional.' },
        { id: 'databarlimited', label: 'GS1 DataBar Limited', aiSyntax: true, kind: '1D',
            minWidth: 200, gtinOnly: true, limitedGtin: true,
            note: 'Smallest DataBar. The GTIN must start with 0 or 1.' },
        { id: 'databarexpanded', label: 'GS1 DataBar Expanded', aiSyntax: true, kind: '1D',
            minWidth: 500, note: 'Carries GTIN plus up to 74 more characters.' },
        { id: 'databarexpandedstacked', label: 'GS1 DataBar Expanded Stacked', aiSyntax: true, kind: '1D',
            minWidth: 300, note: 'Expanded, wrapped into rows to fit a label.' },
        { id: 'gs1datamatrix', label: 'GS1 DataMatrix', aiSyntax: true, kind: '2D',
            size: 10, note: 'The healthcare and small-part workhorse.' },
        { id: 'gs1qrcode', label: 'GS1 QR Code', aiSyntax: true, kind: '2D',
            size: 4, note: 'GS1 data in a consumer-readable symbol.' },
        { id: 'gs1_128', label: 'GS1-128', aiSyntax: true, kind: '1D',
            minWidth: 700, note: 'Code 128 with a leading FNC1. The logistics default.' },
        { id: 'itf14', label: 'ITF-14', aiSyntax: false, kind: '1D',
            minWidth: 600, gtinOnly: true, note: 'The carton code. GTIN only, no other AIs.' },
        { id: 'ean13', label: 'EAN-13', aiSyntax: false, kind: '1D',
            minWidth: 300, gtinOnly: true, gtin13: true, note: 'The retail POS symbol. GTIN-13 only.' }
    ];

    var SYM_BY_ID = {};
    SYMBOLOGIES.forEach(function (entry) { SYM_BY_ID[entry.id] = entry; });

    /* ------------------------------------------------------------------ *
     * Validation
     * ------------------------------------------------------------------ */

    function validateValue(entry, value) {
        if (!entry) return 'This AI is not in the table.';
        if (!value) return 'Enter a value, or use Randomize data.';

        switch (entry.kind) {
            case 'gtin':
                if (!/^\d+$/.test(value)) return 'GTIN is digits only.';
                if (value.length !== entry.fixed) {
                    return 'GTIN must be ' + entry.fixed + ' digits — got ' + value.length + '.';
                }
                if (checkDigit(value.slice(0, -1)) !== value.slice(-1)) {
                    return 'Check digit should be ' + checkDigit(value.slice(0, -1)) + '.';
                }
                return null;
            case 'sscc':
                if (!/^\d+$/.test(value)) return 'This element is digits only.';
                if (value.length !== entry.fixed) {
                    return 'Must be ' + entry.fixed + ' digits — got ' + value.length + '.';
                }
                if (checkDigit(value.slice(0, -1)) !== value.slice(-1)) {
                    return 'Check digit should be ' + checkDigit(value.slice(0, -1)) + '.';
                }
                return null;
            case 'gln':
                if (!/^\d+$/.test(value)) return 'A GLN is digits only.';
                if (value.length !== 13) return 'A GLN is exactly 13 digits — got ' + value.length + '.';
                if (checkDigit(value.slice(0, -1)) !== value.slice(-1)) {
                    return 'Check digit should be ' + checkDigit(value.slice(0, -1)) + '.';
                }
                return null;
            case 'date':
                if (!/^\d{6}$/.test(value)) return 'A GS1 date is exactly 6 digits (YYMMDD).';
                var month = Number(value.substr(2, 2));
                var day = Number(value.substr(4, 2));
                if (month < 1 || month > 12) return 'Month must be 01-12.';
                if (day > 31) return 'Day must be 00-31 (00 means the last day of the month).';
                return null;
            case 'decimal':
                var expected = entry.fixed;
                if (!/^\d+$/.test(value)) return 'This element is digits only.';
                if (value.length !== expected) {
                    return 'Must be exactly ' + expected + ' digits — got ' + value.length + '.';
                }
                return null;
            case 'country':
                if (!/^\d{3}$/.test(value)) return 'An ISO 3166-1 country code is 3 digits.';
                return null;
            default:
                if (value.length > entry.max) {
                    return 'At most ' + entry.max + ' characters — got ' + value.length + '.';
                }
                if (/[\u0000-\u001f]/.test(value)) return 'Control characters are not allowed.';
                return null;
        }
    }

    /* Per-row problems plus problems with the payload as a whole.
       `symbologyId` is the symbology the user selected. It matters: a GTIN plus
       a batch is perfectly encodable in DataBar Expanded and completely
       unencodable in DataBar Omnidirectional, so "is this payload valid?" only
       has an answer relative to a chosen symbol. When omitted, the recommended
       symbology is assumed. */
    function validate(rows, symbologyId) {
        var issues = [];
        var seen = {};

        if (!rows.length) {
            issues.push({ level: 'error', ai: null, message: 'Add at least one data element.' });
            return issues;
        }

        rows.forEach(function (item) {
            var entry = AI_BY_CODE[item.ai];
            if (!entry) {
                issues.push({ level: 'error', ai: item.ai,
                    message: 'AI ' + item.ai + ' is not in this generator\'s table.' });
                return;
            }
            var problem = validateValue(entry, item.value);
            if (problem) issues.push({ level: 'error', ai: item.ai, message: problem });

            if (seen[item.ai]) {
                issues.push({ level: 'warn', ai: item.ai,
                    message: 'AI ' + item.ai + ' appears more than once.' });
            }
            seen[item.ai] = true;
        });

        /* A variable-length element that is not last must be terminated by FNC1.
           The encoders do that for us, but it is worth saying out loud because
           it is the single most common reason a scanner returns a mangled value. */
        for (var i = 0; i < rows.length - 1; i++) {
            var entry = AI_BY_CODE[rows[i].ai];
            if (entry && !entry.fixed) {
                issues.push({ level: 'info', ai: rows[i].ai,
                    message: 'AI ' + rows[i].ai + ' has no fixed length, so it is followed by an '
                        + 'FNC1 separator. If a scanner drops that separator the value runs into '
                        + 'the element after it.' });
                break;
            }
        }

        /* Symbology compatibility. */
        var symbology = SYM_BY_ID[symbologyId] || SYM_BY_ID[recommend(rows)];
        if (symbology && symbology.gtinOnly) {
            var extra = rows.filter(function (item) { return item.ai !== '01'; });
            if (extra.length) {
                issues.push({ level: 'error', ai: null,
                    message: 'A DataBar, ITF-14 or EAN-13 symbol carries the GTIN and nothing else. '
                        + extra.length + ' extra element' + (extra.length > 1 ? 's' : '')
                        + ' cannot be encoded — switch to GS1 DataMatrix, GS1 QR Code or GS1-128 for those.' });
            }
        }
        if (symbology && symbology.limitedGtin) {
            var gtinRow = rows.filter(function (item) { return item.ai === '01'; })[0];
            if (gtinRow && gtinRow.value && !/^[01]/.test(gtinRow.value)) {
                issues.push({ level: 'error', ai: '01',
                    message: 'GS1 DataBar Limited only encodes GTINs that start with 0 or 1.' });
            }
        }

        return issues;
    }

    function hasErrors(issues) {
        return issues.some(function (issue) { return issue.level === 'error'; });
    }

    /* ------------------------------------------------------------------ *
     * Rendering
     * ------------------------------------------------------------------ */

    /* The element string as one line: AI and data concatenated, with the
       separator drawn only where an FNC1 byte genuinely has to be — after a
       variable-length element that is not last. Putting a separator after every
       element would be easier to read and wrong: a fixed-length element needs no
       terminator, and showing one invites the reader to think it does. */
    function toElementString(rows) {
        return toDecodedText(rows).split(FNC1).join(SEP);
    }

    /* The bracketed notation GS1 prints under a symbol — and, conveniently, the
       form every GS1 encoder in BWIPP accepts as input. */
    function toHRI(rows) {
        return rows.map(function (item) { return '(' + item.ai + ')' + item.value; }).join('');
    }

    /* What the raw decoder output looks like: FNC1 only where an element with no
       fixed length has to be terminated. */
    function toDecodedText(rows) {
        var out = '';
        rows.forEach(function (item, index) {
            var entry = AI_BY_CODE[item.ai];
            out += item.ai + item.value;
            var isLast = index === rows.length - 1;
            if (!isLast && entry && !entry.fixed) out += FNC1;
        });
        return out;
    }

    /* The elements in the order a length-driven parser would read them, with the
       value a scanner should report. This is the test oracle. */
    function expectedElements(rows) {
        return rows.map(function (item) {
            var entry = AI_BY_CODE[item.ai];
            var out = {
                ai: item.ai,
                title: entry ? entry.title : item.ai,
                value: item.value,
                display: item.value,
                variable: !(entry && entry.fixed),
                checkDigit: 'n/a'
            };

            if (entry && (entry.kind === 'gtin' || entry.kind === 'sscc' || entry.kind === 'gln')) {
                out.checkDigit = checkDigit(item.value.slice(0, -1)) === item.value.slice(-1)
                    ? 'verified' : 'failed';
            }

            if (entry && entry.kind === 'date' && /^\d{6}$/.test(item.value)) {
                var yy = Number(item.value.substr(0, 2));
                var year = yy <= 49 ? 2000 + yy : 1900 + yy;
                var month = Number(item.value.substr(2, 2));
                var day = Number(item.value.substr(4, 2));
                if (day === 0) day = new Date(Date.UTC(year, month, 0)).getUTCDate();
                out.display = year + '-' + pad(month, 2) + '-' + pad(day, 2);
            }

            if (entry && entry.kind === 'decimal') {
                out.display = formatMeasure(entry, item.value);
            }

            return out;
        });
    }

    /* Render a 3Ndd measurement the way the scanner demo does: the last dd
       characters are decimals, and 391x/393x prefix a 3-digit ISO 4217 code.
       Keeping the two implementations identical is the point — the oracle is
       only useful if it predicts what the reader will actually print. */
    var CURRENCIES = {
        '036': 'AUD', '124': 'CAD', '156': 'CNY', '208': 'DKK', '344': 'HKD',
        '392': 'JPY', '410': 'KRW', '702': 'SGD', '752': 'SEK', '756': 'CHF',
        '826': 'GBP', '840': 'USD', '978': 'EUR'
    };

    function formatMeasure(entry, value) {
        var body = value;
        var code = '';

        if (entry.currency) {
            if (value.length !== 9) return value;
            code = value.substr(0, 3);
            body = value.substr(3);
        }
        if (!/^\d+$/.test(body)) return value;

        var cut = body.length - entry.decimals;
        var formatted;
        if (cut <= 0) {
            formatted = '0.' + new Array(-cut + 1).join('0') + body;
        } else {
            formatted = body.slice(0, cut).replace(/^0+(?=\d)/, '') + '.' + body.slice(cut);
        }

        var label = code
            ? code + (CURRENCIES[code] ? ' (' + CURRENCIES[code] + ')' : '') + ' ' + formatted
            : formatted + (entry.unit ? ' ' + entry.unit : '');
        return label;
    }

    function expectedDigitalLink(rows) {
        var primary = null;
        var pathQualifiers = { '10': 1, '21': 1, '22': 1, '235': 1, '400': 1, '401': 1, '402': 1, '403': 1 };
        rows.forEach(function (item) {
            if (!primary && (item.ai === '01' || item.ai === '8006')) primary = item;
        });
        if (!primary) return null;

        var path = '/' + primary.ai + '/' + primary.value;
        var query = [];
        rows.forEach(function (item) {
            if (item === primary) return;
            if (pathQualifiers[item.ai]) path += '/' + item.ai + '/' + item.value;
            else query.push(item.ai + '=' + item.value);
        });
        return 'https://id.gs1.org' + path + (query.length ? '?' + query.join('&') : '');
    }

    /* ------------------------------------------------------------------ *
     * Symbology recommendation
     * ------------------------------------------------------------------ */

    function recommend(rows) {
        return decide(rows).symbology;
    }

    /* Pick the symbology the field would use, and say why. */
    function decide(rows) {
        var ais = rows.map(function (item) { return item.ai; });
        var extra = ais.filter(function (ai) { return ai !== '01'; });
        var gtinRow = rows.filter(function (item) { return item.ai === '01'; })[0];

        if (ais.length === 0) {
            return { symbology: 'gs1datamatrix', reason: 'No elements yet.' };
        }

        if (ais[0] === '00') {
            return { symbology: 'gs1_128',
                reason: 'An SSCC is 18 digits with no GTIN, so a linear GS1-128 is the carrier.' };
        }

        if (!extra.length && gtinRow) {
            var gtin = gtinRow.value || '';
            if (/^\d{13}$/.test(gtin)) {
                return { symbology: 'ean13',
                    reason: 'A 13-digit GTIN with no other element is the retail POS case: EAN-13.' };
            }
            return { symbology: 'databaromni',
                reason: 'A GTIN plus nothing else is exactly what GS1 DataBar Omnidirectional encodes.' };
        }

        if (ais.length <= 3 && ais.indexOf('3103') === -1 && ais.indexOf('3922') === -1
            && ais.indexOf('30') === -1) {
            return { symbology: 'databarexpanded',
                reason: 'A GTIN with ' + extra.length + ' extra element'
                    + (extra.length > 1 ? 's' : '') + ' fits a single-row DataBar Expanded.' };
        }

        if (ais.indexOf('3103') !== -1 || ais.indexOf('3922') !== -1 || ais.indexOf('30') !== -1) {
            return { symbology: 'databarexpandedstacked',
                reason: 'Weight and price make the element string too long for one row, so it stacks.' };
        }

        if (ais.length >= 4) {
            return { symbology: 'gs1datamatrix',
                reason: ais.length + ' elements is dense enough that a 2D symbol is the right choice.' };
        }

        return { symbology: 'gs1_128', reason: 'A linear GS1-128 carries any element string.' };
    }

    /* ------------------------------------------------------------------ *
     * Encoder arguments
     * ------------------------------------------------------------------ */

    /* Turn the rows into the (bcid, text, options) triple bwip-js needs.
     * Returns null when the payload cannot be encoded by that symbology. */
    function toEncoderInput(rows, symbologyId) {
        var symbology = SYM_BY_ID[symbologyId] || SYM_BY_ID.databarexpanded;
        var gtinRow = rows.filter(function (item) { return item.ai === '01'; })[0];
        var gtin = gtinRow ? gtinRow.value : '';

        if (!symbology.aiSyntax) {
            /* ITF-14 and EAN-13 are plain symbologies: raw digits, no AI syntax. */
            if (!gtin) {
                return { error: symbology.label + ' encodes a GTIN and nothing else — add AI 01.' };
            }
            if (symbology.id === 'ean13') {
                /* A GTIN-14 whose packaging indicator is 0 is a GTIN-13 with a
                   leading zero. Any other indicator has no GTIN-13 equivalent,
                   and printing one anyway would produce a symbol that decodes to
                   a different product. */
                if (gtin.length === 14) {
                    if (gtin.charAt(0) !== '0') {
                        return { error: 'EAN-13 carries a GTIN-13 only. This GTIN-14 has packaging '
                            + 'indicator ' + gtin.charAt(0) + ', which has no GTIN-13 equivalent.' };
                    }
                    gtin = gtin.slice(1);
                }
                if (!/^\d{13}$/.test(gtin)) {
                    return { error: 'EAN-13 needs a 13-digit GTIN — this one has '
                        + gtin.length + ' digits.' };
                }
                return { bcid: 'ean13', text: gtin.slice(0, 12), options: {} };
            }
            /* Hand BWIPP the GTIN as it stands. Trimming it to 13 digits would
               make BWIPP compute a *second* check digit over data that already
               contained one, and the symbol would then decode to a different
               number than the payload says it does. */
            if (!/^\d{13,14}$/.test(gtin)) {
                return { error: 'ITF-14 needs a 13- or 14-digit GTIN — this one has '
                    + gtin.length + ' digits.' };
            }
            return { bcid: 'itf14', text: gtin, options: {} };
        }

        return { bcid: symbology.id, text: toHRI(rows), options: {} };
    }

    return {
        SEP: SEP,
        FNC1: FNC1,
        DEMO_PREFIX: DEMO_PREFIX,
        AI_LIST: AI_LIST,
        AI_BY_CODE: AI_BY_CODE,
        COMMON_AIS: COMMON_AIS,
        SCENARIOS: SCENARIOS,
        SYMBOLOGIES: SYMBOLOGIES,
        SYM_BY_ID: SYM_BY_ID,
        checkDigit: checkDigit,
        withCheckDigit: withCheckDigit,
        randInt: randInt,
        row: row,
        validate: validate,
        hasErrors: hasErrors,
        validateValue: validateValue,
        toElementString: toElementString,
        toHRI: toHRI,
        toDecodedText: toDecodedText,
        expectedElements: expectedElements,
        expectedDigitalLink: expectedDigitalLink,
        recommend: recommend,
        decide: decide,
        toEncoderInput: toEncoderInput
    };
}));
