/*
 * vin-model.js — the shared VIN model for the generator and scanner demos.
 *
 * UMD: attaches window.VinModel in the browser, module.exports under Node
 * (so make-samples.cjs and the unit checks can require the exact same code
 * the page runs). Everything here is pure data-in/data-out: no DOM, no SDK.
 *
 * Standards, briefly:
 *   - The 17-character layout is ISO 3779; I, O and Q never appear.
 *   - North America (FMVSS 115 / 49 CFR Part 565) additionally requires the
 *     check digit in position 9, the model year in position 10, the plant
 *     code in position 11 and a numeric tail (last five digits).
 *   - Europe works on ISO 3779 alone: no check digit requirement, so
 *     position 9 is often a filler character.
 *   - China (GB 16735) follows the North American check digit rule.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VinModel = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var VIN_CHARSET = /^[A-HJ-NPR-Z0-9]{17}$/;

    /* Transliteration for the check digit: digits keep their value; letters
       map through the table (I, O and Q never appear in a VIN). */
    var VIN_VALUES = {};
    for (var d = 0; d <= 9; d++) VIN_VALUES[String(d)] = d;
    (function () {
        var letters = {
            A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1,
            K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4,
            V: 5, W: 6, X: 7, Y: 8, Z: 9
        };
        Object.keys(letters).forEach(function (k) { VIN_VALUES[k] = letters[k]; });
    })();

    /* Weight per position; position 9 holds the check digit itself (weight 0). */
    var VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

    function vinCheckDigit(vin17) {
        var sum = 0;
        for (var i = 0; i < 17; i++) {
            sum += (VIN_VALUES[vin17[i]] || 0) * VIN_WEIGHTS[i];
        }
        var check = sum % 11;
        return check === 10 ? 'X' : String(check);
    }

    /* Model year code, position 10. One character per year, repeating every
       30 years — the code says the year but not the century. */
    var MODEL_YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

    function modelYearCandidates(code) {
        var index = MODEL_YEAR_CODES.indexOf(code);
        if (index < 0) return null;
        return [1980 + index, 2010 + index];
    }

    /* Region from the first WMI character (the SAE country blocks). R is the
       code for Taiwan, China. */
    var WMI_REGIONS = [
        ['1', 'United States'], ['4', 'United States'], ['5', 'United States'],
        ['2', 'Canada'], ['3', 'Mexico'],
        ['6', 'Australia'], ['7', 'New Zealand'],
        ['8', 'South America (Argentina, Chile, Peru, Venezuela)'],
        ['9', 'Brazil'],
        ['J', 'Japan'], ['K', 'South Korea'], ['L', 'China'], ['M', 'India'],
        ['N', 'Turkey, Iran'], ['P', 'Philippines'], ['R', 'Taiwan, China'],
        ['S', 'United Kingdom'], ['T', 'Switzerland, Czech Republic'],
        ['V', 'France, Spain'], ['W', 'Germany'], ['X', 'Russia'],
        ['Y', 'Sweden, Finland'], ['Z', 'Italy'],
        ['A', 'Africa (South Africa, Ghana, …)'], ['B', 'Africa (Angola, Kenya, …)'],
        ['C', 'Africa (Tanzania, …)'], ['D', 'Africa (Egypt, …)'],
        ['E', 'Ethiopia, Mozambique'], ['F', 'Ghana, Nigeria'],
        ['G', 'DR Congo, Madagascar'], ['H', 'Uganda, Tanzania']
    ];

    function wmiRegion(wmi) {
        var first = wmi[0];
        for (var i = 0; i < WMI_REGIONS.length; i++) {
            if (WMI_REGIONS[i][0] === first) return WMI_REGIONS[i][1];
        }
        return null;
    }

    /* The 18-character form carries a leading I (an import marker), and a few
       plants emit 19 or 20 characters with frame digits around the VIN. Strip
       the padding the way the VIN barcode convention defines it, and say so. */
    function normalizeVinFromBarcode(raw) {
        var text = String(raw || '').toUpperCase().replace(/[\s\-]/g, '');
        var notes = [];

        if (text.length === 17) return { vin: text, notes: notes };

        if (text.length === 18) {
            notes.push('The decoded value is 18 characters. A VIN barcode may prefix an extra "I" '
                + '(an import marker) before the 17 real characters — stripped here: ' + text[0] + '.');
            return { vin: text.slice(1), notes: notes };
        }
        if (text.length === 19) {
            notes.push('The decoded value is 19 characters. Per the VIN barcode convention the first '
                + 'and last characters are frame digits — stripped: ' + text[0] + ' and ' + text[18] + '.');
            return { vin: text.slice(1, 18), notes: notes };
        }
        if (text.length === 20) {
            notes.push('The decoded value is 20 characters. Per the VIN barcode convention the first two '
                + 'and the last characters are frame digits — stripped: ' + text.slice(0, 2) + ' and '
                + text[19] + '.');
            return { vin: text.slice(2, 19), notes: notes };
        }

        return {
            vin: null,
            notes: notes,
            errors: ['A VIN barcode decodes to 17 characters (or 18–20 with frame/prefix characters) — '
                + 'got ' + text.length + '. This does not look like a VIN symbol.']
        };
    }

    /* Full analysis of a 17-character VIN. Used by the generator (with the VIN
       currently in the form) and by the scanner (with what the barcode decoded).
       standard: 'na' applies the North American strictness notes; 'eu' treats
       position 9 as a free character and says so. */
    function analyzeVin(vin, sourceLabel, standard) {
        var analysis = {
            ok: false,
            source: sourceLabel || null,
            standard: standard || 'na',
            vin: null,
            wmi: null, region: null,
            vds: null,
            checkChar: null, checkExpected: null, checkVerified: null,
            modelYears: null, plant: null, serial: null,
            lastFiveNumeric: null,
            notes: [], errors: []
        };

        if (!vin) {
            analysis.errors.push('No VIN to analyze.');
            return analysis;
        }

        if (!VIN_CHARSET.test(vin)) {
            var bad = [];
            for (var i = 0; i < vin.length; i++) {
                if ('IOQ'.indexOf(vin[i]) >= 0) bad.push('position ' + (i + 1) + ' (' + vin[i] + ')');
            }
            if (bad.length) {
                analysis.errors.push('The letters I, O and Q are never used in a VIN — found in '
                    + bad.join(', ') + '. Did you mean 1, 0 or 9?');
            } else {
                analysis.errors.push('A VIN is exactly 17 characters from A–Z and 0–9 — got '
                    + vin.length + '.');
            }
            return analysis;
        }

        analysis.ok = true;
        analysis.vin = vin;
        analysis.wmi = vin.slice(0, 3);
        analysis.region = wmiRegion(analysis.wmi);
        analysis.vds = vin.slice(3, 9);
        analysis.checkChar = vin[8];
        analysis.checkExpected = vinCheckDigit(vin);
        analysis.checkVerified = analysis.checkChar === analysis.checkExpected;
        analysis.modelYears = modelYearCandidates(vin[9]);
        analysis.plant = vin[10];
        analysis.serial = vin.slice(11);
        analysis.lastFiveNumeric = /^\d{5}$/.test(vin.slice(12));

        if (analysis.standard === 'eu') {
            analysis.notes.push('Europe (ISO 3779) has no check digit rule — position 9 is whatever '
                + 'the manufacturer put there, so it is shown but not judged.');
        } else if (!analysis.checkVerified) {
            analysis.notes.push('Position 9 is "' + analysis.checkChar + '", but the North American '
                + 'check-digit rule expects "' + analysis.checkExpected + '". European VINs have no check '
                + 'digit, so this can still be a valid EU VIN.');
        }
        if (analysis.standard === 'na' && !analysis.lastFiveNumeric) {
            analysis.notes.push('The North American rule requires the last five characters to be digits.');
        }
        return analysis;
    }

    /* Turn a decoded barcode string (or a typed value) into a full analysis. */
    function analyzeBarcodeText(rawText, sourceLabel, standard) {
        var normalized = normalizeVinFromBarcode(rawText);
        var analysis = analyzeVin(normalized.vin, sourceLabel, standard);
        analysis.notes = normalized.notes.concat(analysis.notes);
        if (normalized.errors) analysis.errors = normalized.errors.concat(analysis.errors);
        return analysis;
    }

    /* --- Random VIN ------------------------------------------------------- */

    var SAMPLE_WMIS = [
        ['1HG', 'Honda — United States'],
        ['JTD', 'Toyota — Japan'],
        ['WVW', 'Volkswagen — Germany'],
        ['1FT', 'Ford — United States'],
        ['WBA', 'BMW — Germany'],
        ['5YJ', 'Tesla — United States'],
        ['2T1', 'Toyota — Canada'],
        ['LVS', 'Ford — China'],
        ['KNA', 'Kia — South Korea'],
        ['3VW', 'Volkswagen — Mexico']
    ];

    var VIN_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

    /* Always valid under the chosen standard:
       'na' — computed check digit, numeric serial (FMVSS 115 shape);
       'eu' — a free character in position 9 (no check digit rule), numeric
              serial, which real European VINs also carry. */
    function randomVin(standard) {
        var na = standard !== 'eu';
        var pick = SAMPLE_WMIS[Math.floor(Math.random() * SAMPLE_WMIS.length)];
        var chars = [];
        function randomAllowed() {
            return VIN_ALPHABET[Math.floor(Math.random() * VIN_ALPHABET.length)];
        }
        /* VDS (positions 4–8) — position 9 is the check digit under NA. */
        for (var i = 0; i < 5; i++) chars.push(randomAllowed());
        /* Year (position 10), plant (11), serial (12–17, digits). The check
           digit covers every position except 9, so the placeholder string must
           already carry the final tail before it is computed. */
        var year = MODEL_YEAR_CODES[Math.floor(Math.random() * MODEL_YEAR_CODES.length)];
        var plant = 'ABCDEFGHJKLMNPRSTVWXYZ'[Math.floor(Math.random() * 22)];
        var serial = '';
        for (var j = 0; j < 6; j++) serial += Math.floor(Math.random() * 10);

        var position9;
        if (na) {
            position9 = vinCheckDigit(pick[0] + chars.join('') + '0' + year + plant + serial);
        } else {
            /* A filler like the X many European brands print there. */
            position9 = Math.random() < 0.5 ? 'X' : randomAllowed();
        }

        var vin = pick[0] + chars.join('') + position9 + year + plant + serial;

        /* Belt and braces: a random generator that can emit an invalid VIN
           under its own standard would poison every downstream test. */
        if (na && vinCheckDigit(vin) !== position9) {
            throw new Error('randomVin produced an invalid check digit');
        }
        if (!VIN_CHARSET.test(vin)) {
            throw new Error('randomVin produced a malformed VIN');
        }
        return { vin: vin, wmiNote: pick[1], standard: na ? 'na' : 'eu' };
    }

    return {
        VIN_CHARSET: VIN_CHARSET,
        VIN_VALUES: VIN_VALUES,
        VIN_WEIGHTS: VIN_WEIGHTS,
        MODEL_YEAR_CODES: MODEL_YEAR_CODES,
        WMI_REGIONS: WMI_REGIONS,
        SAMPLE_WMIS: SAMPLE_WMIS,
        VIN_ALPHABET: VIN_ALPHABET,
        vinCheckDigit: vinCheckDigit,
        modelYearCandidates: modelYearCandidates,
        wmiRegion: wmiRegion,
        normalizeVinFromBarcode: normalizeVinFromBarcode,
        analyzeVin: analyzeVin,
        analyzeBarcodeText: analyzeBarcodeText,
        randomVin: randomVin
    };
});
