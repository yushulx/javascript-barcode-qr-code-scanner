/*
 * gs1.js — GS1 Application Identifier parser.
 *
 * Turns a raw GS1 element string into structured data elements, without asking
 * the barcode decoder to have kept the FNC1 separators. The split is driven by
 * the AI table, exactly the way a GS1 decoder is supposed to: fixed-length data
 * is consumed by length, variable-length data runs to the next FNC1 or to the
 * end of the string.
 *
 * Also does the three checks a "did this scan read correctly?" question needs:
 * the GTIN/SSCC check digit, the date sanity rules, and an HRI rendering.
 *
 * No dependencies, no DOM. Loads as a plain script (window.GS1) and is
 * require()-able for tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GS1 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* The FNC1 <GS> separator has three forms in the wild: the literal byte 29,
       the "{GS}" placeholder some decoders print, and "]C1" from the AIM symbology
       identifier convention. Normalise all of them to "|" so the parser and the
       UI can both work on one representation. */
    var SEP = '|';
    var FNC1 = String.fromCharCode(29);

    function normalize(text) {
        if (text == null) return '';
        var out = String(text)
            .replace(/\{GS\}/g, SEP)
            .replace(/\{FNC1\}/g, SEP)
            .replace(/\]C1/g, SEP)
            .replace(new RegExp(FNC1, 'g'), SEP)
            .replace(/\r?\n/g, '');
        /* Decoders restate either end as FNC1: a leading one announces "this is
           a GS1 symbol" (the AIM convention) and a trailing one is just padding.
           Neither separates two data elements, so drop them — otherwise the
           rendered element string starts with an empty segment. */
        return out.replace(/^\|+/, '').replace(/\|+$/, '');
    }

    function hasSeparator(text) {
        return normalize(text).indexOf(SEP) !== -1;
    }

    /* ------------------------------------------------------------------ *
     * AI table
     *
     * `len`      fixed data length in characters
     * `max`      maximum length; the element is variable-length
     * `kind`     how the raw value should be presented
     * `check`    check-digit family for validation
     * ------------------------------------------------------------------ */

    var AI = {
        '00': { title: 'SSCC', len: 18, kind: 'number', check: 'sscc', group: 'Identification' },
        '01': { title: 'GTIN', len: 14, kind: 'number', check: 'gtin', group: 'Identification' },
        '02': { title: 'CONTENT', len: 14, kind: 'number', check: 'gtin', group: 'Identification' },
        '10': { title: 'BATCH/LOT', max: 20, kind: 'text', group: 'Traceability' },
        '11': { title: 'PRODUCTION DATE', len: 6, kind: 'date', group: 'Dates' },
        '12': { title: 'DUE DATE', len: 6, kind: 'date', group: 'Dates' },
        '13': { title: 'PACKAGING DATE', len: 6, kind: 'date', group: 'Dates' },
        '15': { title: 'BEST BEFORE DATE', len: 6, kind: 'date', group: 'Dates' },
        '16': { title: 'SELL BY DATE', len: 6, kind: 'date', group: 'Dates' },
        '17': { title: 'EXPIRATION DATE', len: 6, kind: 'date', group: 'Dates' },
        '20': { title: 'PRODUCT VARIANT', len: 2, kind: 'number', group: 'Identification' },
        '21': { title: 'SERIAL NUMBER', max: 20, kind: 'text', group: 'Traceability' },
        '22': { title: 'CONSUMER PRODUCT VARIANT', max: 20, kind: 'text', group: 'Traceability' },
        '30': { title: 'VARIABLE COUNT', max: 8, kind: 'number', group: 'Measurements' },
        '37': { title: 'COUNT OF TRADE ITEMS', max: 8, kind: 'number', group: 'Measurements' },
        '235': { title: 'THIRD PARTY CONTROLLED SERIAL NUMBER', max: 28, kind: 'text', group: 'Traceability' },
        '240': { title: 'ADDITIONAL PRODUCT IDENTIFICATION', max: 30, kind: 'text', group: 'Identification' },
        '241': { title: 'CUSTOMER PART NUMBER', max: 30, kind: 'text', group: 'Identification' },
        '242': { title: 'MTO VARIANT NUMBER', max: 6, kind: 'text', group: 'Identification' },
        '243': { title: 'PACKAGING COMPONENT NUMBER', max: 20, kind: 'text', group: 'Identification' },
        '250': { title: 'SECONDARY SERIAL NUMBER', max: 30, kind: 'text', group: 'Traceability' },
        '251': { title: 'SOURCE ENTITY OF THE INITIAL SERIAL NUMBER', max: 30, kind: 'text', group: 'Traceability' },
        '253': { title: 'GDTI', len: 13, kind: 'number', group: 'Identification' },
        '254': { title: 'GLN EXTENSION COMPONENT', max: 20, kind: 'text', group: 'Identification' },
        '255': { title: 'GCN', len: 13, kind: 'number', group: 'Identification' },
        '400': { title: 'ORDER NUMBER', max: 30, kind: 'text', group: 'Logistics' },
        '401': { title: 'GINC', max: 30, kind: 'text', group: 'Logistics' },
        '402': { title: 'GSIN', len: 17, kind: 'number', group: 'Logistics' },
        '403': { title: 'ROUTING CODE', max: 30, kind: 'text', group: 'Logistics' },
        '410': { title: 'SHIP TO / DELIVER TO - GLN', len: 13, kind: 'number', group: 'Parties' },
        '411': { title: 'BILL TO / INVOICE TO - GLN', len: 13, kind: 'number', group: 'Parties' },
        '412': { title: 'PURCHASE FROM - GLN', len: 13, kind: 'number', group: 'Parties' },
        '413': { title: 'SHIP FOR / DELIVER FOR - GLN', len: 13, kind: 'number', group: 'Parties' },
        '414': { title: 'IDENTIFICATION OF A PHYSICAL LOCATION - GLN', len: 13, kind: 'number', group: 'Parties' },
        '415': { title: 'INVOICING PARTY - GLN', len: 13, kind: 'number', group: 'Parties' },
        '416': { title: 'PRODUCTION OR SERVICE LOCATION - GLN', len: 13, kind: 'number', group: 'Parties' },
        '417': { title: 'PARTY - GLN', len: 13, kind: 'number', group: 'Parties' },
        '420': { title: 'SHIP TO POSTAL CODE', max: 20, kind: 'text', group: 'Parties' },
        '421': { title: 'SHIP TO POSTAL CODE WITH ISO COUNTRY CODE', max: 12, kind: 'text', group: 'Parties' },
        '422': { title: 'COUNTRY OF ORIGIN', len: 3, kind: 'country', group: 'Parties' },
        '423': { title: 'COUNTRIES OF PROCESSING', max: 15, kind: 'country-list', group: 'Parties' },
        '424': { title: 'COUNTRY OF PROCESSING', len: 3, kind: 'country', group: 'Parties' },
        '425': { title: 'COUNTRY OF DISASSEMBLY', len: 3, kind: 'country', group: 'Parties' },
        '426': { title: 'COUNTRY COVERING FULL PRODUCTION CYCLE', len: 3, kind: 'country', group: 'Parties' },
        '427': { title: 'COUNTRY SUBDIVISION OF ORIGIN', max: 3, kind: 'text', group: 'Parties' },
        '4300': { title: 'SHIP TO COMPANY NAME', max: 35, kind: 'text', group: 'Parties' },
        '4301': { title: 'SHIP TO CONTACT', max: 35, kind: 'text', group: 'Parties' },
        '4302': { title: 'SHIP TO ADDRESS LINE 1', max: 70, kind: 'text', group: 'Parties' },
        '4303': { title: 'SHIP TO ADDRESS LINE 2', max: 70, kind: 'text', group: 'Parties' },
        '4304': { title: 'SHIP TO SUBDIVISION', max: 70, kind: 'text', group: 'Parties' },
        '4305': { title: 'SHIP TO CITY', max: 70, kind: 'text', group: 'Parties' },
        '4306': { title: 'SHIP TO REGION', max: 70, kind: 'text', group: 'Parties' },
        '4307': { title: 'SHIP TO COUNTRY', len: 2, kind: 'country-alpha2', group: 'Parties' },
        '4308': { title: 'SHIP TO PHONE', max: 30, kind: 'text', group: 'Parties' },
        '4309': { title: 'SHIP TO GEO LOCATION', max: 20, kind: 'text', group: 'Parties' },
        '7001': { title: 'NSN', len: 13, kind: 'number', group: 'Assets' },
        '7002': { title: 'MEAT CUT AND PROCESSING', max: 30, kind: 'text', group: 'Assets' },
        '7003': { title: 'EXPIRATION DATE AND TIME', len: 10, kind: 'datetime', group: 'Dates' },
        '7004': { title: 'ACTIVE POTENCY', max: 4, kind: 'text', group: 'Assets' },
        '7005': { title: 'HARVEST DATE', len: 12, kind: 'date-range', group: 'Dates' },
        '7006': { title: 'FIRST FREEZE DATE', len: 12, kind: 'date-range', group: 'Dates' },
        '7007': { title: 'HARVEST DATE', len: 12, kind: 'date-range', group: 'Dates' },
        '7008': { title: 'SPECIES FOR FISHERY', max: 3, kind: 'text', group: 'Assets' },
        '7009': { title: 'FISHING GEAR TYPE', max: 10, kind: 'text', group: 'Assets' },
        '7010': { title: 'PRODUCTION METHOD', max: 2, kind: 'text', group: 'Assets' },
        '7020': { title: 'REFURBISHMENT LOT NUMBER', max: 20, kind: 'text', group: 'Assets' },
        '7021': { title: 'FUNCTIONAL STAT', max: 20, kind: 'text', group: 'Assets' },
        '7022': { title: 'REVISION STAT', max: 20, kind: 'text', group: 'Assets' },
        '7023': { title: 'GIAI - ASSEMBLY', max: 30, kind: 'text', group: 'Assets' },
        '7040': { title: 'UIC + EXTENSION', len: 4, kind: 'text', group: 'Assets' },
        '710': { title: 'NHRN - PZN', max: 20, kind: 'text', group: 'Healthcare' },
        '711': { title: 'NHRN - CIP', max: 20, kind: 'text', group: 'Healthcare' },
        '712': { title: 'NHRN - CN', max: 20, kind: 'text', group: 'Healthcare' },
        '713': { title: 'NHRN - DRN', max: 20, kind: 'text', group: 'Healthcare' },
        '714': { title: 'NHRN - AIM', max: 20, kind: 'text', group: 'Healthcare' },
        '715': { title: 'NHRN - NDC', max: 20, kind: 'text', group: 'Healthcare' },
        '7230': { title: 'CERTIFICATION REFERENCE', max: 30, kind: 'text', group: 'Assets' },
        '7240': { title: 'PROTOCOL', max: 20, kind: 'text', group: 'Assets' },
        '8001': { title: 'ROLL PRODUCTS', len: 14, kind: 'roll', group: 'Assets' },
        '8002': { title: 'CMT NUMBER', max: 20, kind: 'text', group: 'Assets' },
        '8003': { title: 'GRAI', max: 30, kind: 'text', group: 'Assets' },
        '8004': { title: 'GIAI', max: 30, kind: 'text', group: 'Assets' },
        '8005': { title: 'PRICE PER UNIT OF MEASURE', len: 6, kind: 'price-per-unit', group: 'Measurements' },
        '8006': { title: 'ITIP', len: 18, kind: 'itip', group: 'Identification' },
        '8007': { title: 'INTERNATIONAL BANK ACCOUNT NUMBER', max: 34, kind: 'text', group: 'Logistics' },
        '8008': { title: 'PRODUCTION DATE AND TIME', max: 12, kind: 'datetime-flex', group: 'Dates' },
        '8010': { title: 'CPID', max: 30, kind: 'text', group: 'Identification' },
        '8011': { title: 'CPID SERIAL NUMBER', max: 12, kind: 'text', group: 'Identification' },
        '8012': { title: 'SOFTWARE VERSION', max: 20, kind: 'text', group: 'Assets' },
        '8013': { title: 'GMN', max: 30, kind: 'text', group: 'Assets' },
        '8017': { title: 'GSRN - PROVIDER', len: 18, kind: 'number', check: 'sscc', group: 'Parties' },
        '8018': { title: 'GSRN - RECIPIENT', len: 18, kind: 'number', check: 'sscc', group: 'Parties' },
        '8019': { title: 'SRIN', max: 10, kind: 'text', group: 'Assets' },
        '8020': { title: 'PAYMENT SLIP REFERENCE NUMBER', max: 25, kind: 'text', group: 'Logistics' },
        '8026': { title: 'ITIP CONTENT', len: 18, kind: 'itip', group: 'Identification' }
    };

    /* AIs 90-99 are reserved for in-company use: same shape, no fixed meaning. */
    for (var i = 90; i <= 99; i++) {
        AI[String(i)] = {
            title: 'INTERNAL / IN-COMPANY USE (AI ' + i + ')',
            max: 30,
            kind: 'text',
            group: 'Internal'
        };
    }

    /* ------------------------------------------------------------------ *
     * Four-digit measurement AIs: 3Ndd
     *   N  = the measured quantity
     *   dd = how many of the 6 data characters are decimals
     *
     * AIs 393x and 391x prefix a three-digit ISO 4217 currency code, so their
     * data field is 9 characters, not 6.
     * ------------------------------------------------------------------ */

    var MEASURES = {
        // Net measures in metric
        '310': { title: 'NET WEIGHT', unit: 'kg' },
        '311': { title: 'LENGTH', unit: 'm' },
        '312': { title: 'WIDTH', unit: 'm' },
        '313': { title: 'HEIGHT', unit: 'm' },
        '314': { title: 'AREA', unit: 'm²' },
        '315': { title: 'NET VOLUME', unit: 'l' },
        '316': { title: 'NET VOLUME', unit: 'm³' },
        // Legacy imperial
        '320': { title: 'NET WEIGHT', unit: 'lb' },
        '321': { title: 'LENGTH', unit: 'in' },
        '322': { title: 'LENGTH', unit: 'ft' },
        '323': { title: 'LENGTH', unit: 'yd' },
        '324': { title: 'WIDTH', unit: 'in' },
        '325': { title: 'WIDTH', unit: 'ft' },
        '326': { title: 'WIDTH', unit: 'yd' },
        '327': { title: 'HEIGHT', unit: 'in' },
        '328': { title: 'HEIGHT', unit: 'ft' },
        '329': { title: 'HEIGHT', unit: 'yd' },
        // Gross measures in metric
        '330': { title: 'GROSS WEIGHT', unit: 'kg' },
        '331': { title: 'LENGTH', unit: 'm' },
        '332': { title: 'WIDTH', unit: 'm' },
        '333': { title: 'HEIGHT', unit: 'm' },
        '334': { title: 'AREA', unit: 'm²' },
        '335': { title: 'GROSS VOLUME', unit: 'l' },
        '336': { title: 'GROSS VOLUME', unit: 'm³' },
        '337': { title: 'KILOGRAMS PER SQUARE METRE', unit: 'kg/m²' },
        // Gross measures in imperial
        '340': { title: 'GROSS WEIGHT', unit: 'lb' },
        '341': { title: 'LENGTH', unit: 'in' },
        '342': { title: 'LENGTH', unit: 'ft' },
        '343': { title: 'LENGTH', unit: 'yd' },
        '344': { title: 'WIDTH', unit: 'in' },
        '345': { title: 'WIDTH', unit: 'ft' },
        '346': { title: 'WIDTH', unit: 'yd' },
        '347': { title: 'HEIGHT', unit: 'in' },
        '348': { title: 'HEIGHT', unit: 'ft' },
        '349': { title: 'HEIGHT', unit: 'yd' },
        '350': { title: 'AREA', unit: 'in²' },
        '351': { title: 'AREA', unit: 'ft²' },
        '352': { title: 'AREA', unit: 'yd²' },
        '353': { title: 'GROSS AREA', unit: 'in²' },
        '354': { title: 'GROSS AREA', unit: 'ft²' },
        '355': { title: 'GROSS AREA', unit: 'yd²' },
        '356': { title: 'NET WEIGHT', unit: 't' },
        '357': { title: 'NET VOLUME', unit: 'oz' },
        '360': { title: 'NET VOLUME', unit: 'qt' },
        '361': { title: 'NET VOLUME', unit: 'gal' },
        '362': { title: 'GROSS VOLUME', unit: 'qt' },
        '363': { title: 'GROSS VOLUME', unit: 'gal' },
        '364': { title: 'NET VOLUME', unit: 'in³' },
        '365': { title: 'NET VOLUME', unit: 'ft³' },
        '366': { title: 'NET VOLUME', unit: 'yd³' },
        '367': { title: 'GROSS VOLUME', unit: 'in³' },
        '368': { title: 'GROSS VOLUME', unit: 'ft³' },
        '369': { title: 'GROSS VOLUME', unit: 'yd³' },
        // Money and ratios
        '390': { title: 'AMOUNT PAYABLE', unit: 'local currency' },
        '391': { title: 'AMOUNT PAYABLE', unit: 'ISO currency', currency: true },
        '392': { title: 'PRICE', unit: 'local currency' },
        '393': { title: 'PRICE', unit: 'ISO currency', currency: true },
        '394': { title: 'PERCENTAGE DISCOUNT', unit: '%' },
        '395': { title: 'AMOUNT PAYABLE PER SQUARE METRE', unit: 'local currency/m²' }
    };

    /* Look up a four-digit AI. Returns a table entry or null. */
    function matchMeasure(ai) {
        var family = ai.slice(0, 3);
        var measure = MEASURES[family];
        if (!measure) return null;
        var decimals = Number(ai.slice(3, 4));
        if (!(decimals >= 0 && decimals <= 9)) return null;
        return {
            title: measure.title + (measure.unit ? ' (' + measure.unit + ')' : ''),
            len: measure.currency ? 9 : 6,
            kind: 'decimal',
            decimals: decimals,
            unit: measure.unit,
            currency: !!measure.currency,
            family: family,
            group: 'Measurements'
        };
    }

    /* Resolve the AI at `pos`. AIs are prefix-free in the GS1 standard — no
       two-digit AI is the prefix of a three- or four-digit one — so longest
       match first is unambiguous. */
    function matchAI(text, pos) {
        for (var size = 4; size >= 2; size--) {
            var code = text.substr(pos, size);
            if (code.length < size || !/^\d+$/.test(code)) continue;
            if (size === 4) {
                var measure = matchMeasure(code);
                if (measure) return { code: code, entry: measure };
                if (AI[code]) return { code: code, entry: AI[code] };
            } else if (AI[code]) {
                return { code: code, entry: AI[code] };
            }
        }
        return null;
    }

    /* ------------------------------------------------------------------ *
     * Check digits
     * ------------------------------------------------------------------ */

    /* Mod-10 check digit used by GTIN-8/12/13/14, SSCC, GLN and GSRN: weight
       every other digit by 3, starting from the right of the data. */
    function checkDigit(data) {
        var sum = 0;
        var weight = 3;
        for (var i = data.length - 1; i >= 0; i--) {
            sum += Number(data.charAt(i)) * weight;
            weight = weight === 3 ? 1 : 3;
        }
        return String((10 - (sum % 10)) % 10);
    }

    /* Returns true / false for a GTIN-family value, or null when the value is
       not a GTIN-family length so the caller can skip the check. */
    function isValidCheckDigit(value, family) {
        var lengths = family === 'sscc' ? [18] : [8, 12, 13, 14];
        if (lengths.indexOf(value.length) === -1) return null;
        if (!/^\d+$/.test(value)) return null;
        return checkDigit(value.slice(0, -1)) === value.slice(-1);
    }

    /* ------------------------------------------------------------------ *
     * Value formatting
     * ------------------------------------------------------------------ */

    function pad(number, width) {
        var out = String(number);
        while (out.length < width) out = '0' + out;
        return out;
    }

    /* GS1 dates are YYMMDD. Day 00 means "the last day of that month" — that is
       how a month-precision expiry is encoded. Year window: 00-49 is 20xx,
       50-99 is 19xx, which is the convention the GS1 General Specifications
       prescribe for interpreting a two-digit year. */
    function formatGs1Date(value, digits) {
        if (!/^\d{6}$/.test(value)) return null;
        var yy = Number(value.substr(0, 2));
        var month = Number(value.substr(2, 2));
        var day = Number(value.substr(4, 2));
        var year = yy <= 49 ? 2000 + yy : 1900 + yy;
        if (month < 1 || month > 12) return null;
        var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        var exact = day !== 0;
        if (!exact) day = lastDay;
        if (day < 1 || day > lastDay) return null;
        var iso = pad(year, 4) + '-' + pad(month, 2) + '-' + pad(day, 2);
        return { iso: iso, exactDay: exact, year: year, month: month, day: day };
    }

    var CURRENCIES = {
        '036': 'AUD', '124': 'CAD', '156': 'CNY', '208': 'DKK', '344': 'HKD',
        '348': 'HUF', '356': 'INR', '376': 'ILS', '392': 'JPY', '410': 'KRW',
        '446': 'MOP', '484': 'MXN', '554': 'NZD', '578': 'NOK', '616': 'PLN',
        '643': 'RUB', '682': 'SAR', '702': 'SGD', '710': 'ZAR', '752': 'SEK',
        '756': 'CHF', '764': 'THB', '784': 'AED', '792': 'TRY', '826': 'GBP',
        '840': 'USD', '978': 'EUR'
    };

    function formatDecimal(value, decimals, currency) {
        var body = value;
        var code = '';
        if (currency) {
            code = value.substr(0, 3);
            body = value.substr(3);
        }
        if (!/^\d+$/.test(body)) return null;
        var cut = body.length - decimals;
        if (cut <= 0) {
            var zeros = '';
            for (var k = 0; k < -cut; k++) zeros += '0';
            body = '0.' + zeros + body;
        } else {
            /* Drop the leading zeros the fixed 6-digit field is padded with —
               "000250" is 0.250, not 000.250 — but keep at least one digit. */
            var whole = body.slice(0, cut).replace(/^0+(?=\d)/, '');
            body = whole + '.' + body.slice(cut);
        }
        return { number: body, currencyCode: code };
    }

    /* ------------------------------------------------------------------ *
     * Region / country names
     * ------------------------------------------------------------------ */

    var COUNTRIES = {
        '036': 'Australia', '040': 'Austria', '056': 'Belgium', '076': 'Brazil',
        '124': 'Canada', '156': 'China', '158': 'Taiwan, China', '191': 'Croatia',
        '203': 'Czechia', '208': 'Denmark', '246': 'Finland', '250': 'France',
        '276': 'Germany', '300': 'Greece', '344': 'Hong Kong, China', '348': 'Hungary',
        '356': 'India', '372': 'Ireland', '376': 'Israel', '380': 'Italy',
        '392': 'Japan', '410': 'Republic of Korea', '446': 'Macao, China',
        '458': 'Malaysia', '484': 'Mexico', '528': 'Netherlands', '554': 'New Zealand',
        '578': 'Norway', '604': 'Peru', '608': 'Philippines', '616': 'Poland',
        '620': 'Portugal', '642': 'Romania', '643': 'Russian Federation',
        '682': 'Saudi Arabia', '702': 'Singapore', '705': 'Slovenia',
        '710': 'South Africa', '724': 'Spain', '752': 'Sweden', '756': 'Switzerland',
        '764': 'Thailand', '792': 'Türkiye', '784': 'United Arab Emirates',
        '826': 'United Kingdom', '840': 'United States of America', '704': 'Viet Nam'
    };

    /* ------------------------------------------------------------------ *
     * Element-string parsing
     * ------------------------------------------------------------------ */

    /* Parse a GS1 element string into data elements.
     *
     * options.prefixGtin  prepend AI 01 when the string starts with a bare GTIN
     *                     (DataBar and Composite linear components omit it)
     * options.format      the symbology name, kept on the result for context
     */
    function parseElementString(rawText, options) {
        options = options || {};
        var text = normalize(rawText);
        var warnings = [];
        var errors = [];
        var elements = [];

        if (!text) {
            return emptyResult(text, warnings, ['The barcode decoded to an empty string.']);
        }

        var separated = text.indexOf(SEP) !== -1;

        /* DataBar-14 and the linear half of a GS1 Composite carry a bare GTIN-14
           with no AI. Put the AI back before parsing, or nothing matches. */
        if (options.prefixGtin) {
            var first = matchAI(text, 0);
            /* A leading run of 12-14 digits is a bare GTIN; anything after it is
               the rest of the element string, separated by FNC1. */
            if (!first && /^\d{12,14}(?=\||$)/.test(text)) {
                text = '01' + text;
                warnings.push('The symbol carries a GTIN with no AI; AI 01 was inferred from the '
                    + 'symbology.');
            }
        }

        var pos = 0;
        var guard = 0;
        while (pos < text.length) {
            if (guard++ > 200) {
                errors.push('Parsing stopped after 200 elements — the string does not look like GS1 data.');
                break;
            }
            if (text.charAt(pos) === SEP) { pos++; continue; }

            var match = matchAI(text, pos);
            if (!match) {
                var rest = text.substr(pos);
                errors.push('Unrecognised AI at offset ' + pos
                    + (rest.length > 24 ? ' ("' + rest.slice(0, 24) + '…")' : ' ("' + rest + '")')
                    + '. The element string cannot be split reliably past this point.');
                break;
            }

            pos += match.code.length;
            var entry = match.entry;
            var value = '';
            var terminatedBy = 'end';

            if (entry.len) {
                value = text.substr(pos, entry.len);
                pos += value.length;
                if (value.length < entry.len) {
                    errors.push('AI ' + match.code + ' (' + entry.title + ') needs '
                        + entry.len + ' characters but only ' + value.length + ' remain.');
                    terminatedBy = 'truncated';
                }
            } else {
                var end = text.indexOf(SEP, pos);
                if (end === -1) {
                    /* A variable-length element that runs to the end of the
                       string is the normal case, not a problem: that is exactly
                       how GS1 terminates the last data element. It is only worth
                       mentioning when the decoder also dropped the FNC1
                       separators, because then the length of this element rests
                       on the AI table's own rules rather than on the encoder. */
                    value = text.substr(pos);
                    pos = text.length;
                    if (separated === false && elements.length > 0) {
                        warnings.push('The decoder returned no FNC1 separators, so the length of '
                            + 'AI ' + match.code + ' was taken from the AI table rather than from '
                            + 'a separator. Check the value against the label if it looks short.');
                    }
                } else {
                    value = text.substr(pos, end - pos);
                    pos = end;
                    terminatedBy = 'fnc1';
                }
                if (!value) {
                    errors.push('AI ' + match.code + ' (' + entry.title + ') has no data.');
                }
                if (entry.max && value.length > entry.max && terminatedBy === 'end') {
                    /* A value longer than its AI allows is proof that the current
                       reading is impossible, and the usual cause is a decoder
                       that stripped the FNC1 terminators. Look for the shortest
                       split whose remainder parses cleanly as further AIs. */
                    var repair = splitOverlongVariable(match.code, entry, value);
                    if (repair) {
                        elements.push(repair.head);
                        repair.tail.forEach(function (element) { elements.push(element); });
                        warnings.push(repair.warning);
                        break;
                    }
                    warnings.push('AI ' + match.code + ' carries ' + value.length
                        + ' characters; the maximum is ' + entry.max + '.');
                } else if (value.length > entry.max) {
                    warnings.push('AI ' + match.code + ' carries ' + value.length
                        + ' characters; the maximum is ' + entry.max + '.');
                }
            }

            elements.push(buildElement(match.code, entry, value, terminatedBy));
        }

        return finish(text, elements, warnings, errors, options.format);
    }

    /* Re-split a variable-length element that swallowed the rest of the string.
     *
     * Only ever called when the value is longer than its AI permits — the one
     * case where the current reading is provably impossible. Among the splits
     * whose remainder parses cleanly, the LONGEST head wins. Shortest-first looks
     * tempting but is wrong: an over-long value like "1215270827" splits cleanly
     * as AI 30 = "1" plus AI 21 = "5270827" (a variable-length AI will happily
     * swallow whatever is left), while the real reading is AI 30 = "12" plus a
     * six-digit date. Preferring the longest head keeps the data in the element
     * the encoder actually declared and invents the fewest extra elements. */
    function splitOverlongVariable(code, entry, value) {
        for (var length = Math.min(entry.max, value.length - 1); length >= 1; length--) {
            var head = value.slice(0, length);
            var tail = value.slice(length);
            var tailResult = parseElementString(tail, {});
            if (tailResult.errors.length === 0 && tailResult.count > 0) {
                return {
                    head: buildElement(code, entry, head, 'end'),
                    tail: tailResult.elements,
                    warning: 'AI ' + code + ' read ' + value.length + ' characters, more than the '
                        + entry.max + ' this AI allows, so the value was re-split: AI ' + code
                        + ' = "' + head + '" and the remainder parsed as '
                        + tailResult.elements.map(function (element) {
                            return 'AI ' + element.ai;
                        }).join(', ')
                        + '. The decoder returned no FNC1 separators — check this against the label.'
                };
            }
        }
        return null;
    }

    function buildElement(code, entry, raw, terminatedBy) {
        var element = {
            ai: code,
            title: entry.title,
            value: raw,
            variable: !entry.len,
            terminatedBy: terminatedBy,
            group: entry.group || 'Other'
        };

        switch (entry.kind) {
            case 'date':
                var date = formatGs1Date(raw, 6);
                if (date) {
                    element.display = date.iso;
                    element.note = date.exactDay ? null : 'Day not specified — shown as the last day of the month.';
                } else {
                    element.display = raw;
                    element.note = 'Not a valid YYMMDD date.';
                    element.invalid = true;
                }
                break;
            case 'date-range':
                if (/^\d{12}$/.test(raw)) {
                    var from = formatGs1Date(raw.substr(0, 6), 6);
                    var to = formatGs1Date(raw.substr(6, 6), 6);
                    element.display = (from ? from.iso : raw.substr(0, 6)) + ' → '
                        + (to ? to.iso : raw.substr(6, 6));
                } else {
                    element.display = raw;
                }
                break;
            case 'datetime':
                if (/^\d{10}$/.test(raw)) {
                    var d = formatGs1Date(raw.substr(0, 6), 6);
                    element.display = (d ? d.iso : raw.substr(0, 6)) + ' '
                        + raw.substr(6, 2) + ':' + raw.substr(8, 2);
                } else {
                    element.display = raw;
                }
                break;
            case 'datetime-flex':
                if (/^\d{8}$/.test(raw)) {
                    var d8 = formatGs1Date(raw.substr(0, 6), 6);
                    element.display = (d8 ? d8.iso : raw.substr(0, 6)) + ' '
                        + raw.substr(6, 2) + ':00';
                } else if (/^\d{10}$/.test(raw)) {
                    var d10 = formatGs1Date(raw.substr(0, 6), 6);
                    element.display = (d10 ? d10.iso : raw.substr(0, 6)) + ' '
                        + raw.substr(6, 2) + ':' + raw.substr(8, 2);
                } else if (/^\d{12}$/.test(raw)) {
                    var d12 = formatGs1Date(raw.substr(0, 6), 6);
                    element.display = (d12 ? d12.iso : raw.substr(0, 6)) + ' '
                        + raw.substr(6, 2) + ':' + raw.substr(8, 2) + ':' + raw.substr(10, 2);
                } else {
                    element.display = raw;
                }
                break;
            case 'decimal':
                var dec = formatDecimal(raw, entry.decimals, entry.currency);
                if (dec) {
                    var unit = entry.unit ? ' ' + entry.unit : '';
                    if (dec.currencyCode) {
                        var name = CURRENCIES[dec.currencyCode];
                        element.display = dec.currencyCode + (name ? ' (' + name + ')' : '')
                            + ' ' + dec.number;
                        element.currencyCode = dec.currencyCode;
                    } else {
                        element.display = dec.number + unit;
                    }
                    element.decimals = entry.decimals;
                } else {
                    element.display = raw;
                    element.invalid = true;
                }
                break;
            case 'price-per-unit':
                if (/^\d{6}$/.test(raw)) {
                    var places = Number(raw.charAt(0));
                    var money = formatDecimal(raw.substr(1), places, false);
                    element.display = money ? money.number : raw;
                    element.decimals = places;
                } else {
                    element.display = raw;
                }
                break;
            case 'country':
                element.display = COUNTRIES[raw] ? COUNTRIES[raw] + ' (' + raw + ')' : raw;
                break;
            case 'country-alpha2':
                element.display = raw;
                break;
            case 'country-list':
                if (/^\d+$/.test(raw) && raw.length % 3 === 0) {
                    var names = [];
                    for (var c = 0; c < raw.length; c += 3) {
                        var code = raw.substr(c, 3);
                        names.push(COUNTRIES[code] || code);
                    }
                    element.display = names.join(', ');
                } else {
                    element.display = raw;
                }
                break;
            case 'roll':
                /* AI 8001: width in 1/10 mm, length in 1/100 m, core diameter in
                   1/10 mm, then a roll-direction digit. */
                if (/^\d{14}$/.test(raw)) {
                    element.display = (Number(raw.substr(0, 4)) / 10) + ' mm wide, '
                        + (Number(raw.substr(4, 6)) / 100) + ' m long, '
                        + (Number(raw.substr(10, 3)) / 10) + ' mm core, direction '
                        + raw.substr(13, 1);
                } else {
                    element.display = raw;
                }
                break;
            case 'itip':
                if (/^\d{18}$/.test(raw)) {
                    element.display = 'GTIN ' + raw.substr(0, 14) + ', piece ' + raw.substr(14, 2)
                        + ' of ' + raw.substr(16, 2);
                } else {
                    element.display = raw;
                }
                break;
            case 'number':
                element.display = raw;
                if (entry.check) {
                    var digits = isValidCheckDigit(raw, entry.check);
                    if (digits === false) {
                        element.invalid = true;
                        element.note = 'Check digit is wrong — expected '
                            + checkDigit(raw.slice(0, -1)) + ', the symbol carries '
                            + raw.slice(-1) + '. The symbol was probably misread.';
                    } else if (digits === true) {
                        element.verified = true;
                    }
                }
                break;
            default:
                element.display = raw;
        }

        return element;
    }

    function emptyResult(text, warnings, errors) {
        return {
            elementString: text,
            elements: [],
            warnings: warnings,
            errors: errors,
            hri: '',
            digitalLink: null,
            gtin: null,
            count: 0
        };
    }

    function finish(elementString, elements, warnings, errors, format) {
        var gtin = null;
        for (var i = 0; i < elements.length; i++) {
            if (elements[i].ai === '01' || elements[i].ai === '02') {
                gtin = elements[i];
                break;
            }
        }
        return {
            elementString: elementString,
            elements: elements,
            warnings: warnings,
            errors: errors,
            hri: toHRI(elements),
            digitalLink: toDigitalLink(elements),
            gtin: gtin,
            format: format || null,
            count: elements.length
        };
    }

    /* ------------------------------------------------------------------ *
     * Renderings
     * ------------------------------------------------------------------ */

    /* Human readable interpretation: the AI in parentheses followed by the data,
       which is how GS1 prints a symbol's content underneath the bars. */
    function toHRI(elements) {
        if (!elements || !elements.length) return '';
        var out = '';
        for (var i = 0; i < elements.length; i++) {
            out += '(' + elements[i].ai + ')' + elements[i].value;
        }
        return out;
    }

    /* GS1 Digital Link: the primary key (GTIN) becomes the path, traceability
       data follows as path segments, and everything else becomes a query
       attribute. Resolver host is the GS1-operated id.gs1.org. */
    var PRIMARY_KEYS = { '01': 1, '8006': 1, '8010': 1, '8013': 1, '8017': 1, '8018': 1 };
    var PATH_QUALIFIERS = { '10': 1, '21': 1, '22': 1, '235': 1, '254': 1, '400': 1, '401': 1, '402': 1, '403': 1 };

    function toDigitalLink(elements) {
        if (!elements || !elements.length) return null;
        var primary = null;
        for (var i = 0; i < elements.length; i++) {
            if (PRIMARY_KEYS[elements[i].ai]) { primary = elements[i]; break; }
        }
        if (!primary) return null;

        var path = '/' + primary.ai + '/' + encodeURIComponent(primary.value);
        var query = [];
        for (var j = 0; j < elements.length; j++) {
            var element = elements[j];
            if (element === primary) continue;
            if (PATH_QUALIFIERS[element.ai]) {
                path += '/' + element.ai + '/' + encodeURIComponent(element.value);
            } else {
                query.push(element.ai + '=' + encodeURIComponent(element.value));
            }
        }
        return 'https://id.gs1.org' + path + (query.length ? '?' + query.join('&') : '');
    }

    /* ------------------------------------------------------------------ *
     * Symbology helpers
     * ------------------------------------------------------------------ */

    /* Which symbologies carry a GS1 element string, and which of them omit the
       AI for the GTIN. */
    var GS1_FORMATS = [
        'GS1 DataBar',
        'GS1 DataBar Omnidirectional',
        'GS1 DataBar Truncated',
        'GS1 DataBar Stacked',
        'GS1 DataBar Stacked Omnidirectional',
        'GS1 DataBar Limited',
        'GS1 DataBar Expanded',
        'GS1 DataBar Expanded Stacked',
        'GS1 Composite Code',
        'GS1 DataMatrix',
        'GS1 QR Code',
        'GS1-128',
        'Code 128',
        'ITF',
        'Interleaved 2 of 5',
        'EAN-13',
        'EAN-8',
        'UPC-A',
        'UPC-E',
        'Data Matrix',
        'QR Code',
        'PDF417',
        'AZTEC',
        'Aztec Code',
        'MaxiCode',
        'DotCode'
    ];

    function isGs1Format(format) {
        if (!format) return false;
        return /GS1/i.test(format);
    }

    /* DataBar-14 (every variant except Expanded) and the linear half of a
       Composite encode a GTIN-14 with no AI. */
    function omitsGtinAI(format) {
        if (!format) return false;
        if (/Composite/i.test(format)) return true;
        return /DataBar/i.test(format) && !/Expanded/i.test(format);
    }

    /* ------------------------------------------------------------------ *
     * Top level
     * ------------------------------------------------------------------ */

    function parse(rawText, options) {
        options = options || {};
        var format = options.format || null;
        var text = normalize(rawText);

        var direct = parseElementString(text, {
            prefixGtin: omitsGtinAI(format),
            format: format
        });

        /* A symbol that carries a bare GTIN does not always announce it. A DataBar
           does not, and neither does an ITF-14 or EAN-13 that a GS1 system
           printed as a plain GTIN. When the direct reading fails and the payload
           is nothing but a 12- to 14-digit number, the GTIN reading is the only
           one that works, so take it — and say so. */
        if (direct.errors.length && /^\d{12,14}$/.test(text)) {
            var asGtin = parseElementString('01' + text, { prefixGtin: false, format: format });
            if (asGtin.errors.length === 0) {
                asGtin.warnings.unshift('The symbol carries a GTIN with no application identifier. '
                    + 'AI 01 was inferred: a DataBar, ITF-14 or EAN-13 encodes the GTIN and '
                    + 'nothing else.');
                return asGtin;
            }
        }

        return direct;
    }

    return {
        SEP: SEP,
        FNC1: FNC1,
        AI: AI,
        MEASURES: MEASURES,
        COUNTRIES: COUNTRIES,
        CURRENCIES: CURRENCIES,
        GS1_FORMATS: GS1_FORMATS,
        normalize: normalize,
        hasSeparator: hasSeparator,
        matchAI: matchAI,
        checkDigit: checkDigit,
        isValidCheckDigit: isValidCheckDigit,
        formatGs1Date: formatGs1Date,
        formatDecimal: formatDecimal,
        isGs1Format: isGs1Format,
        omitsGtinAI: omitsGtinAI,
        toHRI: toHRI,
        toDigitalLink: toDigitalLink,
        parse: parse
    };
}));
