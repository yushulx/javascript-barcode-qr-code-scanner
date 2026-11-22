/*
 * MRZ Stress Test — synthetic test-image engine.
 *
 * Turns the mock documents this page draws into test images that carry their
 * own ground truth: a synthetic identity is drawn from a seeded stream, its
 * ICAO 9303 MRZ is built with valid check digits, the document is rendered
 * through the same renderer the interactive preview uses, and a configurable
 * set of capture degradations is applied. The result is exported as a ZIP of
 * PNG images plus an `annotations.json` in the `mrz-benchmark/1.0` schema the
 * MRZ scanner's benchmark mode reads.
 *
 * The rules this engine keeps are the ones the barcode stress test set,
 * narrowed to a single document per image:
 *
 *   1. The ground truth must survive the pipeline. Rotation, perspective,
 *      crop and downscale are composed into one homography, and the same
 *      matrix transforms the MRZ band corners — the quad is computed, never
 *      estimated.
 *   2. The MRZ is never cut. A partial MRZ cannot be parsed by any reader,
 *      so the crop trims the border around the document and stops before the
 *      edge would reach the MRZ band. What the crop actually kept is recorded.
 *   3. Every random choice comes from a seeded stream, so a seed reproduces
 *      the same identities, document types and degradation values. The pixel
 *      output is not promised byte-identical (blur, JPEG and resampling are
 *      the browser's), the *test case* is.
 *   4. The oracle is the parsed field, not the MRZ line: document number
 *      without filler, surname and given names, nationality, birth date, sex
 *      and expiry date, plus the check digits a parser can validate.
 *
 * No SDK, no licence and no network: the only dependencies are the MRZ
 * classes and the document renderer already loaded by the page.
 */
(function (global) {
    'use strict';

    /* ================================================================== *
     * Seeded randomness
     * ================================================================== */

    /* FNV-1a over the seed text, so a memorable seed ("monday") works as well
       as a number. */
    function hashSeed(text) {
        var h = 0x811c9dc5;
        for (var i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h >>> 0;
    }

    /* mulberry32 — small, fast, and identical in every browser. */
    function makeRng(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6d2b79f5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* One stream per sample, derived from the base seed and the sample index,
       so changing the sample count never changes sample 0. */
    function sampleSeed(baseSeed, index) {
        return (baseSeed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    }

    function randRange(rng, min, max) {
        if (max <= min) return min;
        return min + rng() * (max - min);
    }

    function randInt(rng, min, max) {
        return Math.round(randRange(rng, min, max));
    }

    function pad(value, width) {
        var out = String(value);
        while (out.length < width) out = '0' + out;
        return out;
    }

    function pick(rng, list) {
        return list[Math.floor(rng() * list.length)];
    }

    /* ================================================================== *
     * Synthetic identities
     *
     * Names and countries are small fixed lists on purpose: a benchmark does
     * not need believable diversity, it needs values inside the MRZ alphabet
     * (A-Z, 0-9, '<') that a reader can only get right by reading them.
     * ================================================================== */

    var COUNTRIES = ['USA', 'CAN', 'GBR', 'AUS', 'FRA', 'CHN', 'IND', 'BRA', 'JPN',
        'ZAF', 'RUS', 'MEX', 'ITA', 'ESP', 'NLD', 'SWE', 'ARG', 'BEL', 'CHE',
        'DEU', 'NOR', 'FIN', 'POL', 'KOR'];

    var SURNAMES = ['SMITH', 'JOHNSON', 'BROWN', 'MILLER', 'DAVIS', 'GARCIA',
        'WILSON', 'ANDERSON', 'THOMAS', 'TAYLOR', 'MOORE', 'MARTIN', 'LEE',
        'WALKER', 'HALL', 'YOUNG', 'KING', 'WRIGHT', 'SCOTT', 'GREEN',
        'BAKER', 'ADAMS', 'NELSON', 'CARTER', 'MITCHELL', 'PEREZ', 'ROBERTS',
        'TURNER', 'PHILLIPS', 'CAMPBELL', 'PARKER', 'EVANS', 'EDWARDS',
        'COLLINS', 'STEWART', 'MORRIS', 'MURPHY', 'RIVERA', 'COOK', 'ROGERS'];

    var GIVEN_M = ['JAMES', 'JOHN', 'ROBERT', 'MICHAEL', 'WILLIAM', 'DAVID',
        'RICHARD', 'JOSEPH', 'THOMAS', 'CHARLES', 'DANIEL', 'MATTHEW',
        'ANTHONY', 'MARK', 'DONALD', 'STEVEN', 'PAUL', 'ANDREW', 'KEVIN',
        'BRIAN', 'GEORGE', 'TIMOTHY', 'EDWARD', 'JASON', 'ERIC'];

    var GIVEN_F = ['MARY', 'PATRICIA', 'JENNIFER', 'LINDA', 'ELIZABETH',
        'BARBARA', 'SUSAN', 'JESSICA', 'SARAH', 'KAREN', 'NANCY', 'LISA',
        'MARGARET', 'BETTY', 'SANDRA', 'ASHLEY', 'DOROTHY', 'KIMBERLY',
        'MICHELLE', 'EMILY', 'AMANDA', 'MELISSA', 'DEBORAH', 'LAURA', 'ANNA'];

    var DOC_KINDS = ['passport', 'idcard', 'visa'];

    /* A valid YYMMDD inside [minYear, maxYear] — full years, so the date
       exists by construction. */
    function randomDate(rng, minYear, maxYear) {
        var year = randInt(rng, minYear, maxYear);
        var month = randInt(rng, 1, 12);
        var days = [4, 6, 9, 11].indexOf(month) !== -1 ? 30
            : (month === 2 ? (((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28) : 31);
        return pad(year % 100, 2) + pad(month, 2) + pad(randInt(rng, 1, days), 2);
    }

    /* Document numbers mix letters and digits, and are unique across the whole
       dataset (the caller's `used` map), so a miss can only mean one document. */
    function randomDocumentNumber(rng, used) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var number;
        do {
            number = '';
            for (var i = 0; i < 9; i++) number += chars.charAt(Math.floor(rng() * chars.length));
        } while (used && used[number]);
        if (used) used[number] = true;
        return number;
    }

    /* One random identity. The draws happen in a fixed order so the stream —
       and therefore the dataset — is reproducible. */
    function randomRecord(rng, docKind, used) {
        var sex = rng() < 0.5 ? 'M' : 'F';
        var now = new Date().getFullYear();
        /* A second given name roughly one time in four — the '<<'/'<' name
           split is part of what the benchmark checks. */
        var given = pick(rng, sex === 'M' ? GIVEN_M : GIVEN_F)
            + (rng() < 0.25 ? ' ' + pick(rng, sex === 'M' ? GIVEN_M : GIVEN_F) : '');
        return {
            docKind: docKind,
            documentType: docKind === 'visa' ? 'V' : (docKind === 'passport' ? 'P' : 'ID'),
            countryCode: pick(rng, COUNTRIES),          // issuing state
            surname: pick(rng, SURNAMES),
            givenNames: given,
            documentNumber: randomDocumentNumber(rng, used),
            nationality: pick(rng, COUNTRIES),
            birthDate: randomDate(rng, now - 80, now - 18),
            sex: sex,
            expiryDate: randomDate(rng, now - 1, now + 10),
            optionalData: '',
            visaFormat: null                              // 'MRVA' | 'MRVB' for visas
        };
    }

    /* ================================================================== *
     * MRZ construction
     *
     * The MRZ strings come from the same generator classes the interactive
     * mode uses — a second implementation would drift, and the one the
     * visitor sees would be the wrong one. What this adds on top is the
     * parsed ground truth: the field values a benchmark compares against and
     * the check digits a parser can validate.
     * ================================================================== */

    function paddedField(value, width) {
        return (String(value || '') + '<'.repeat(width)).substring(0, width);
    }

    function stripFiller(value) {
        return String(value || '').replace(/<+$/g, '');
    }

    function buildMrz(record) {
        /* The MRZ classes are declared at the top level of mrz-generator.js,
           so they resolve as bare identifiers — they are lexical globals, not
           properties of window. */
        var Ctor = record.docKind === 'passport' ? TD3CodeGenerator
            : record.docKind === 'idcard' ? TD2CodeGenerator
                : record.visaFormat === 'MRVA' ? MRVACodeGenerator
                    : MRVBCodeGenerator;
        var lines = new Ctor(record.documentType, record.countryCode,
            record.surname, record.givenNames, record.documentNumber,
            record.nationality, record.birthDate, record.sex,
            record.expiryDate, record.optionalData).generate().split('\n');

        /* Check digits, recomputed over the padded fields per ICAO 9303. TD3
           adds the composite digit over document number, birth, expiry and
           the optional-data field. */
        var docNumField = paddedField(record.documentNumber, 9);
        var birthField = paddedField(record.birthDate, 6);
        var expiryField = paddedField(record.expiryDate, 6);
        var digits = {
            documentNumber: MRZGenerator.calculateCheckDigit(docNumField),
            birthDate: MRZGenerator.calculateCheckDigit(birthField),
            expiryDate: MRZGenerator.calculateCheckDigit(expiryField),
            composite: null
        };
        if (record.docKind === 'passport') {
            digits.composite = MRZGenerator.calculateCheckDigit(
                docNumField + digits.documentNumber + birthField + digits.birthDate
                + expiryField + digits.expiryDate + paddedField(record.optionalData, 16));
        }

        /* What the benchmark compares against — the values a correct parse
           must produce. Dates are YYMMDD exactly as encoded; the century
           guess is the parser's own convention and is not scored. */
        var fields = {
            documentNumber: record.documentNumber,
            surname: record.surname,
            givenNames: record.givenNames,
            nationality: MRZGenerator.normalizeCountryCode(record.nationality),
            birthDate: record.birthDate,
            sex: record.sex,
            expiryDate: record.expiryDate
        };

        var formatName = record.docKind === 'passport' ? 'TD3'
            : record.docKind === 'idcard' ? 'TD2'
                : record.visaFormat;

        return {
            lines: lines,
            formatName: formatName,
            mrzText: lines.join('\n'),
            fields: fields,
            checkDigits: digits,
            issuingState: MRZGenerator.normalizeCountryCode(record.countryCode)
        };
    }

    /* ================================================================== *
     * Degradations
     *
     * Same pattern as the barcode stress test: every entry draws one value
     * per sample from its [min, max] range, in table order, so the draw
     * sequence — and therefore the reproduction — is stable. Adding an entry
     * changes the stream: bump a seed, don't expect the old dataset back.
     *
     * The meaning of the two numbers differs per row and is spelled out in
     * `hint`; `invert` is a *rate* (the sample is inverted with that chance),
     * the rest are values.
     * ================================================================== */

    var DEGRADATIONS = [
        { id: 'rotate', label: 'Rotation', unit: '°', min: -15, max: 15, step: 1,
            worse: 'symmetric',
            hint: 'Clockwise rotation of the whole frame — the camera was tilted.' },
        { id: 'persp', label: 'Perspective', unit: 'strength', min: 0, max: 0.3, step: 0.01,
            worse: 'low',
            hint: 'Corner displacement as a fraction of the frame, i.e. photographing '
                + 'a document at an angle.' },
        { id: 'crop', label: 'Frame kept', unit: '× frame', min: 0.4, max: 1, step: 0.01,
            worse: 'high',
            hint: 'How much of the frame survives. The crop trims the border the scene '
                + 'leaves around the document and always stops before the MRZ band — a '
                + 'cut MRZ cannot be parsed by anything, so it would only ever be a '
                + 'guaranteed miss.' },
        { id: 'blur', label: 'Blur', unit: 'px', min: 0, max: 3, step: 0.1,
            worse: 'low',
            hint: 'Gaussian-ish blur radius (three box passes).' },
        { id: 'motion', label: 'Motion blur', unit: 'px', min: 0, max: 20, step: 1,
            worse: 'low',
            hint: 'Streak length; the direction is drawn from the seed.' },
        { id: 'contrast', label: 'Contrast', unit: 'factor', min: 0.3, max: 1, step: 0.01,
            worse: 'high',
            hint: 'Linear contrast around mid grey. 1 leaves the image untouched, the '
                + 'lower end is a washed-out capture.' },
        { id: 'jpeg', label: 'JPEG quality', unit: '0-1', min: 0.15, max: 1, step: 0.01,
            worse: 'high',
            hint: 'Re-encoded through the browser JPEG codec at this quality.' },
        { id: 'noise', label: 'Noise', unit: '± level', min: 0, max: 28, step: 1,
            worse: 'low',
            hint: 'Uniform per-pixel noise added to every channel.' },
        { id: 'light', label: 'Uneven lighting', unit: '0-1', min: 0, max: 0.6, step: 0.01,
            worse: 'low',
            hint: 'Linear illumination falloff multiplied over the frame; the direction '
                + 'is drawn from the seed.' },
        { id: 'glare', label: 'Glare', unit: '0-1', min: 0, max: 0.4, step: 0.01,
            worse: 'low',
            hint: 'A soft specular blob added over a random spot — it can wash out part '
                + 'of a line without hiding the whole document.' },
        { id: 'invert', label: 'Inversion', unit: 'chance', min: 0, max: 0.5, step: 0.01,
            worse: 'low', rate: true,
            hint: 'Probability that the image is inverted (light text on dark). '
                + 'Everything else about the image stays the same.' },
        { id: 'scale', label: 'Output scale', unit: '×', min: 0.4, max: 1, step: 0.01,
            worse: 'high',
            hint: 'The final resample. Small values shrink the MRZ characters towards '
                + 'the resolution floor of the recognizer.' }
    ];

    var PRESETS = {
        clean: {
            label: 'Clean',
            note: 'No degradations at all — the reader sees exactly what the generator '
                + 'drew. A baseline for regression runs.',
            difficulty: false,
            values: {}
        },
        easy: {
            label: 'Easy',
            note: 'Light capture noise: a little rotation, mild blur and JPEG, no glare. '
                + 'A competent reader should get everything.',
            difficulty: true,
            values: {
                rotate: [-4, 4], persp: [0, 0.05], crop: [0.8, 1],
                blur: [0, 0.6], motion: [0, 3], contrast: [0.8, 1],
                jpeg: [0.7, 1], noise: [0, 5], light: [0, 0.1],
                glare: [0, 0.05], invert: [0, 0], scale: [0.85, 1]
            }
        },
        hard: {
            label: 'Hard',
            note: 'The far end: strong perspective, heavy motion blur, aggressive JPEG '
                + 'and uneven lighting at once.',
            difficulty: true,
            values: {
                rotate: [-15, 15], persp: [0.05, 0.3], crop: [0.55, 0.9],
                blur: [0.4, 2.4], motion: [4, 20], contrast: [0.35, 0.7],
                jpeg: [0.15, 0.55], noise: [6, 28], light: [0.1, 0.6],
                glare: [0, 0.4], invert: [0, 0.2], scale: [0.4, 0.8]
            }
        },
        mixed: {
            label: 'Mixed',
            note: 'A varied set: every degradation is available and a per-image '
                + 'difficulty factor scales them, so the set runs from nearly clean to '
                + 'thoroughly degraded.',
            difficulty: true,
            values: {
                rotate: [-15, 15], persp: [0, 0.3], crop: [0.5, 1],
                blur: [0, 2.4], motion: [0, 20], contrast: [0.35, 1],
                jpeg: [0.15, 1], noise: [0, 28], light: [0, 0.6],
                glare: [0, 0.4], invert: [0, 0.2], scale: [0.4, 1]
            }
        }
    };

    var MAX_SAMPLES = 100;
    var NEUTRAL_TOLERANCE = 0.02;      // below 2% of a range, a degradation is absent

    /* ================================================================== *
     * Homography
     * ================================================================== */

    /* Solve the 3x3 matrix that maps the four `src` points onto the four `dst`
       points (projective, h33 = 1). Eight unknowns, eight equations. */
    function solveQuad(src, dst) {
        var a = [];
        var b = [];
        for (var i = 0; i < 4; i++) {
            var x = src[i][0], y = src[i][1], X = dst[i][0], Y = dst[i][1];
            a.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
            a.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
        }
        for (var col = 0; col < 8; col++) {
            var pivot = col;
            for (var r = col + 1; r < 8; r++) {
                if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
            }
            var tmp = a[col]; a[col] = a[pivot]; a[pivot] = tmp;
            var tb = b[col]; b[col] = b[pivot]; b[pivot] = tb;
            for (var row = col + 1; row < 8; row++) {
                var f = a[row][col] / a[col][col];
                for (var k = col; k < 8; k++) a[row][k] -= f * a[col][k];
                b[row] -= f * b[col];
            }
        }
        var h = new Array(8);
        for (var c = 7; c >= 0; c--) {
            var s = b[c];
            for (var j = c + 1; j < 8; j++) s -= a[c][j] * h[j];
            h[c] = s / a[c][c];
        }
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    function multiplyH(m1, m2) {
        var out = new Array(9);
        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 3; j++) {
                out[i * 3 + j] = m1[i * 3] * m2[j] + m1[i * 3 + 1] * m2[3 + j]
                    + m1[i * 3 + 2] * m2[6 + j];
            }
        }
        return out;
    }

    function applyH(h, x, y) {
        var w = h[6] * x + h[7] * y + h[8];
        return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
    }

    /* Affine rotation by `radians` about (`cx`, `cy`), then translate by
       (`tx`, `ty`) — as a 3x3, so it composes with the perspective matrix. */
    function rotationAbout(radians, cx, cy, tx, ty) {
        var c = Math.cos(radians), s = Math.sin(radians);
        return [c, -s, tx + cx - c * cx + s * cy,
            s, c, ty + cy - s * cx - c * cy,
            0, 0, 1];
    }

    function affineInverse(h) {
        var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5];
        var det = a * e - b * d;
        return [e / det, -b / det, (b * f - e * c) / det,
            -d / det, a / det, (d * c - a * f) / det,
            0, 0, 1];
    }

    function polygonArea(points) {
        var sum = 0;
        for (var i = 0; i < points.length; i++) {
            var p = points[i], q = points[(i + 1) % points.length];
            sum += p[0] * q[1] - q[0] * p[1];
        }
        return sum / 2;
    }

    function boundingBox(points) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(function (p) {
            minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
            maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /* ================================================================== *
     * Canvas helpers
     * ================================================================== */

    function makeCanvas(w, h) {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        return canvas;
    }

    /* ================================================================== *
     * Degradation primitives
     * ================================================================== */

    /* Per-pixel contrast around mid grey. sRGB-ish and always available —
       ctx.filter is not, and a silently ignored filter would make a preset
       lie about what it applied. */
    function applyContrast(canvas, factor) {
        if (factor >= 0.999) return;
        var ctx = canvas.getContext('2d');
        var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data = image.data;
        for (var i = 0; i < data.length; i += 4) {
            for (var c = 0; c < 3; c++) {
                var v = 128 + (data[i + c] - 128) * factor;
                data[i + c] = v < 0 ? 0 : (v > 255 ? 255 : v);
            }
        }
        ctx.putImageData(image, 0, 0);
    }

    function applyInvert(canvas) {
        var ctx = canvas.getContext('2d');
        var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data = image.data;
        for (var i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
        }
        ctx.putImageData(image, 0, 0);
    }

    /* Linear illumination falloff: a gradient from full white to grey,
       multiplied over the frame. */
    function applyLighting(canvas, strength, rng) {
        if (strength <= 0) return;
        var ctx = canvas.getContext('2d');
        var angle = rng() * Math.PI * 2;
        var w = canvas.width, h = canvas.height;
        var cx = w / 2, cy = h / 2;
        var reach = Math.abs(w * Math.cos(angle)) / 2 + Math.abs(h * Math.sin(angle)) / 2;
        var floor = Math.round(255 * (1 - strength));
        var gradient = ctx.createLinearGradient(
            cx - Math.cos(angle) * reach, cy - Math.sin(angle) * reach,
            cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
        gradient.addColorStop(0, 'rgb(255,255,255)');
        gradient.addColorStop(1, 'rgb(' + floor + ',' + floor + ',' + floor + ')');
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    function applyGlare(canvas, strength, rng) {
        if (strength <= 0) return;
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var cx = rng() * w, cy = rng() * h;
        var radius = (0.25 + rng() * 0.35) * Math.max(w, h);
        var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, 'rgba(255,255,255,' + strength.toFixed(3) + ')');
        gradient.addColorStop(0.55, 'rgba(255,255,255,' + (strength * 0.45).toFixed(3) + ')');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    /* Separable box blur, run three times — a cheap stand-in for a Gaussian,
       done in JS so the result is the same everywhere. */
    function applyBlur(canvas, radius) {
        if (radius < 0.4) return;
        var r = Math.max(1, Math.round(radius));
        var ctx = canvas.getContext('2d');
        var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (var pass = 0; pass < 3; pass++) {
            boxBlur(image, r);
        }
        ctx.putImageData(image, 0, 0);
    }

    function boxBlur(image, r) {
        var w = image.width, h = image.height, data = image.data;
        var window = r * 2 + 1;
        var copy = new Uint8ClampedArray(data);
        /* horizontal */
        for (var y = 0; y < h; y++) {
            var row = y * w * 4;
            var sum = [0, 0, 0];
            for (var k = -r; k <= r; k++) {
                var sx = Math.min(w - 1, Math.max(0, k));
                sum[0] += copy[row + sx * 4]; sum[1] += copy[row + sx * 4 + 1]; sum[2] += copy[row + sx * 4 + 2];
            }
            for (var x = 0; x < w; x++) {
                var o = row + x * 4;
                data[o] = sum[0] / window; data[o + 1] = sum[1] / window; data[o + 2] = sum[2] / window;
                var add = Math.min(w - 1, x + r + 1), sub = Math.max(0, x - r);
                sum[0] += copy[row + add * 4] - copy[row + sub * 4];
                sum[1] += copy[row + add * 4 + 1] - copy[row + sub * 4 + 1];
                sum[2] += copy[row + add * 4 + 2] - copy[row + sub * 4 + 2];
            }
        }
        copy.set(data);
        /* vertical */
        for (var x2 = 0; x2 < w; x2++) {
            var col = x2 * 4;
            var sum2 = [0, 0, 0];
            for (var k2 = -r; k2 <= r; k2++) {
                var sy = Math.min(h - 1, Math.max(0, k2));
                sum2[0] += copy[col + sy * w * 4]; sum2[1] += copy[col + sy * w * 4 + 1]; sum2[2] += copy[col + sy * w * 4 + 2];
            }
            for (var y2 = 0; y2 < h; y2++) {
                var o2 = col + y2 * w * 4;
                data[o2] = sum2[0] / window; data[o2 + 1] = sum2[1] / window; data[o2 + 2] = sum2[2] / window;
                var add2 = Math.min(h - 1, y2 + r + 1), sub2 = Math.max(0, y2 - r);
                sum2[0] += copy[col + add2 * w * 4] - copy[col + sub2 * w * 4];
                sum2[1] += copy[col + add2 * w * 4 + 1] - copy[col + sub2 * w * 4 + 1];
                sum2[2] += copy[col + add2 * w * 4 + 2] - copy[col + sub2 * w * 4 + 2];
            }
        }
    }

    /* Average `length` one-pixel shifts along `angle`. `lighter` accumulates
       premultiplied colour, so N layers at alpha 1/N sum to the mean and the
       frame stays opaque — drawing them with source-over would not. */
    function applyMotionBlur(canvas, length, angle) {
        if (length < 1) return canvas;
        var steps = Math.min(40, Math.round(length));
        var out = makeCanvas(canvas.width, canvas.height);
        var ctx = out.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 / (steps + 1);
        var dx = Math.cos(angle), dy = Math.sin(angle);
        for (var i = 0; i <= steps; i++) {
            ctx.drawImage(canvas, dx * i, dy * i, out.width, out.height);
        }
        return out;
    }

    function applyNoise(canvas, sigma, rng) {
        if (sigma <= 0) return;
        var ctx = canvas.getContext('2d');
        var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data = image.data;
        for (var i = 0; i < data.length; i += 4) {
            var n = (rng() * 2 - 1) * sigma;
            data[i] = data[i] + n;
            data[i + 1] = data[i + 1] + n;
            data[i + 2] = data[i + 2] + n;
        }
        ctx.putImageData(image, 0, 0);
    }

    function applyJpeg(canvas, quality) {
        if (quality >= 0.999) return Promise.resolve(canvas);
        return new Promise(function (resolve) {
            var image = new Image();
            image.onload = function () {
                canvas.getContext('2d').drawImage(image, 0, 0);
                resolve(canvas);
            };
            image.onerror = function () { resolve(canvas); };
            image.src = canvas.toDataURL('image/jpeg', quality);
        });
    }

    function applyScale(canvas, factor) {
        if (factor >= 0.999) return canvas;
        var out = makeCanvas(canvas.width * factor, canvas.height * factor);
        var ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, out.width, out.height);
        return out;
    }

    /* Bilinear inverse warp. Everything outside the source stays at the
       background colour sampled from the scene's top-left corner, so the
       perspective fill matches the page instead of showing a white band on a
       darkened frame. */
    function warpPerspective(source, outW, outH, inverse) {
        var out = makeCanvas(outW, outH);
        var octx = out.getContext('2d');
        var sctx = source.getContext('2d');
        var src = sctx.getImageData(0, 0, source.width, source.height);
        var sd = src.data;
        var sw = source.width, sh = source.height;
        /* The page colour: a few pixels in, clear of the document. */
        var bg = [sd[0], sd[1], sd[2]];
        var od = octx.createImageData(out.width, out.height);
        var dd = od.data;
        for (var i = 0; i < dd.length; i += 4) {
            dd[i] = bg[0]; dd[i + 1] = bg[1]; dd[i + 2] = bg[2]; dd[i + 3] = 255;
        }
        for (var y = 0; y < out.height; y++) {
            var yy = y + 0.5;
            for (var x = 0; x < out.width; x++) {
                var p = applyH(inverse, x + 0.5, yy);
                var u = p[0] - 0.5, v = p[1] - 0.5;
                if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) continue;
                var x0 = u | 0, y0 = v | 0;
                var x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
                var fx = u - x0, fy = v - y0;
                var i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
                var i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
                var o = (y * out.width + x) * 4;
                for (var c = 0; c < 3; c++) {
                    var top = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
                    var bottom = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
                    dd[o + c] = top + (bottom - top) * fy;
                }
            }
        }
        octx.putImageData(od, 0, 0);
        return out;
    }

    /* ================================================================== *
     * Value drawing
     * ================================================================== */

    /* Draws the degradation values for one sample, in table order.

       With a difficulty factor, one value is drawn for the whole image and
       every range is interpolated from its undamaged end by that fraction.
       That is what makes a mixed set varied: instead of stacking every
       degradation at full strength (which no real capture does, and which
       produces images that nothing can read), each image gets a coherent
       amount of damage — some nearly clean, some thoroughly degraded. */
    function drawValues(ranges, rng, useDifficulty) {
        var applied = {};
        var difficulty = useDifficulty ? rng() : 1;
        DEGRADATIONS.forEach(function (degradation) {
            var range = ranges[degradation.id];
            if (!range) {
                applied[degradation.id] = null;
                return;
            }
            var draw = randRange(rng, range[0], range[1]);
            var neutral = neutralValue(degradation, range);
            var value = neutral + (draw - neutral) * difficulty;
            if (degradation.integer) value = Math.round(value);
            applied[degradation.id] = Math.max(degradation.min,
                Math.min(degradation.max, value));
        });
        applied.difficulty = difficulty;
        return applied;
    }

    /* The end of the range at which the image is undamaged, which is what the
       difficulty factor scales away from. Always inside the range, so the
       interpolated value is too. */
    function neutralValue(degradation, range) {
        if (degradation.worse === 'high') return range[1];
        if (degradation.worse === 'symmetric') return Math.max(range[0], Math.min(range[1], 0));
        return range[0];
    }

    /* How far a value moved from undamaged, 0..1, measured against the longest
       arm of its range rather than the range width — a two-sided range has no
       "width" the value can be read against, and dividing by it would halve
       every symmetric severity. */
    function severityOf(degradation, range, value) {
        if (!range) return 0;
        var neutral = neutralValue(degradation, range);
        var denominator = Math.max(Math.abs(range[0] - neutral), Math.abs(range[1] - neutral));
        if (denominator <= 0) return 0;
        return Math.abs(value - neutral) / denominator;
    }

    function spanFor(values, id, fallback) {
        var v = values[id];
        return v === null || v === undefined ? fallback : v;
    }

    /* ================================================================== *
     * Scene composition
     *
     * The document renderer fills the whole canvas — the "page" IS the
     * document image, at the same fixed size the interactive preview uses.
     * ================================================================== */

    var PAGE_W = 900;
    /* Passports render taller than ID cards and visas. */
    var PAGE_H = { passport: 640, idcard: 580, visa: 580 };
    /* px of frame left around the MRZ band when the crop comes in close. */
    var MRZ_MARGIN = 8;

    /* The band the MRZ occupies on the rendered page.

       The renderer decides the zone — it has to, because the character pitch
       is the font's and only the renderer knows it — and reports the glyph
       extent back through renderPage(). mrzRegion() therefore prefers that
       rect and only falls back to layout constants when there is none, which
       is the case in the unit tests where no canvas is drawn.

       The crop is never allowed to cut into this band: a partial MRZ is a
       guaranteed miss for any reader, which would measure nothing. */
    function mrzRegion(docKind, lineCount, drawn) {
        var pageH = PAGE_H[docKind] || PAGE_H.idcard;
        if (drawn) {
            return { x: drawn.textX, y: drawn.textY, w: drawn.textW, h: drawn.textH, pageH: pageH };
        }
        var margin = 40;
        var x = margin + 50;
        var h = lineCount * 30 + 50;
        var y = pageH - margin - h;
        return { x: x, y: y + 5, w: PAGE_W - x * 2, h: h - 15, pageH: pageH };
    }

    function regionCorners(region) {
        return [[region.x, region.y], [region.x + region.w, region.y],
        [region.x + region.w, region.y + region.h], [region.x, region.y + region.h]];
    }

    /* The left edge of a `window`-sized crop that must contain [contentMin,
       contentMin+contentLen] grown by the margin, and should stay inside
       [frameMin, frameMin+frameLen]. Containing the content wins; when both
       are possible the origin is drawn uniformly between the extremes, so
       the same seed reproduces the same framing. */
    function pickWindowOrigin(rng, contentMin, contentLen, frameMin, frameLen, window) {
        var lo = Math.max(frameMin, contentMin + contentLen + MRZ_MARGIN - window);
        var hi = Math.min(frameMin + frameLen - window, contentMin - MRZ_MARGIN);
        if (lo > hi) {
            /* The window cannot both stay in the frame and keep the margin —
               the margin loses, the content does not. */
            lo = contentMin + contentLen + MRZ_MARGIN - window;
            hi = contentMin - MRZ_MARGIN;
            if (lo > hi) {
                /* Even without the margin it does not fit — that case is
                   ruled out by the crop clamp above; centre and carry on. */
                return contentMin + contentLen / 2 - window / 2;
            }
        }
        return lo + rng() * (hi - lo);
    }

    function renderPage(record, mrz) {
        var canvas = makeCanvas(PAGE_W, PAGE_H[record.docKind] || PAGE_H.idcard);
        /* The renderer lives in app.js and draws exactly what the interactive
           preview shows — one drawing routine, so the test images cannot
           drift from what the page demonstrates. It hands back the MRZ zone
           it drew, which is what the ground truth marks. */
        var layout = global.renderDocument(canvas, {
            docType: record.docKind === 'passport' ? 'Passport(TD3)'
                : record.docKind === 'idcard' ? 'ID Card(TD2)' : 'Visa(A)',
            countryCode: record.countryCode,
            surname: record.surname,
            givenNames: record.givenNames,
            docNumber: record.documentNumber,
            birthDate: record.birthDate,
            expiryDate: record.expiryDate,
            sex: record.sex,
            nationality: record.nationality,
            mrzText: mrz.mrzText
        });
        canvas.mrz = layout && layout.mrz;
        return canvas;
    }

    /* One sample: identity -> document -> degradations -> ground truth.
       Resolves with { canvas, mrz, applied, ... }. */
    function renderSample(options) {
        var spec = options.spec;
        var index = options.index;
        var baseSeed = options.baseSeed;
        var used = options.used;
        var rng = makeRng(sampleSeed(baseSeed, index));

        var values = drawValues(spec.degradations, rng, !!spec.difficulty);

        /* ---- the document -------------------------------------------- */
        var docKind = spec.docType === 'mixed' ? pick(rng, DOC_KINDS) : spec.docType;
        var record = randomRecord(rng, docKind, used);
        if (docKind === 'visa') record.visaFormat = rng() < 0.5 ? 'MRVA' : 'MRVB';
        var mrz = buildMrz(record);
        var scene = renderPage(record, mrz);
        var region = mrzRegion(record.docKind, mrz.lines.length, scene.mrz);
        var pageH = region.pageH;

        /* ---- optical ------------------------------------------------- */
        var inverted = false;
        if (values.invert !== null && rng() < values.invert) {
            applyInvert(scene);
            inverted = true;
        }
        applyLighting(scene, spanFor(values, 'light', 0), rng);
        applyGlare(scene, spanFor(values, 'glare', 0), rng);
        applyContrast(scene, spanFor(values, 'contrast', 1));

        /* ---- geometry ------------------------------------------------ */
        var rotateDeg = spanFor(values, 'rotate', 0);
        var persp = spanFor(values, 'persp', 0);
        var crop = spanFor(values, 'crop', 1);
        var cropRequested = crop;
        var radians = rotateDeg * Math.PI / 180;

        var amp = persp * 0.15 * Math.min(PAGE_W, pageH);
        var corners = [[0, 0], [PAGE_W, 0], [PAGE_W, pageH], [0, pageH]];
        var distorted = corners.map(function (corner) {
            return [corner[0] + (rng() * 2 - 1) * amp,
            corner[1] + (rng() * 2 - 1) * amp];
        });
        var perspective = persp > 0
            ? solveQuad(corners, distorted)
            : [1, 0, 0, 0, 1, 0, 0, 0, 1];

        var rotatedW = Math.abs(PAGE_W * Math.cos(radians)) + Math.abs(pageH * Math.sin(radians));
        var rotatedH = Math.abs(PAGE_W * Math.sin(radians)) + Math.abs(pageH * Math.cos(radians));
        var cropW = Math.max(64, Math.round(rotatedW * crop));
        var cropH = Math.max(64, Math.round(rotatedH * crop));

        /* page -> perspective -> rotation about the page centre. */
        var pivot = [PAGE_W / 2, pageH / 2];
        var spun = multiplyH(rotationAbout(radians, pivot[0], pivot[1], 0, 0), perspective);

        /* Where the MRZ band lands in the final frame, perspective included.
           The crop must keep all of it: a cut MRZ is undecodable by any
           reader, so counting one as a miss measures nothing — and unlike a
           photograph, this generator chose where to put the edge. */
        var mrzBox = boundingBox(regionCorners(region).map(function (p) {
            return applyH(spun, p[0], p[1]);
        }));

        if (cropW < mrzBox.w + MRZ_MARGIN * 2 || cropH < mrzBox.h + MRZ_MARGIN * 2) {
            cropW = Math.min(Math.max(cropW, Math.ceil(mrzBox.w) + MRZ_MARGIN * 2), Math.round(rotatedW));
            cropH = Math.min(Math.max(cropH, Math.ceil(mrzBox.h) + MRZ_MARGIN * 2), Math.round(rotatedH));
            values.crop = Math.round(Math.min(cropW / rotatedW, cropH / rotatedH) * 1000) / 1000;
        }

        /* The crop window, in turned-page coordinates. It must contain the
           whole MRZ band plus its margin, and it should stay inside the
           turned frame — in that order: a window that pokes past the page
           edge is filled with the background colour, a window that clips the
           MRZ is a guaranteed miss that measures nothing. The window origin
           is drawn from the feasible range, so placement is reproducible. */
        var frameBox = boundingBox(corners.map(function (p) {
            return applyH(spun, p[0], p[1]);
        }));
        var originX = pickWindowOrigin(rng, mrzBox.x, mrzBox.w, frameBox.x, frameBox.w, cropW);
        var originY = pickWindowOrigin(rng, mrzBox.y, mrzBox.h, frameBox.y, frameBox.h, cropH);

        /* page -> perspective -> rotation -> shift the window to the origin */
        var affine = multiplyH([1, 0, -originX, 0, 1, -originY, 0, 0, 1], spun);
        var matrix = multiplyH(affine, perspective);

        /* The warp samples backwards: destination -> affine -> perspective. */
        var inverse = multiplyH(solveQuad(distorted, corners), affineInverse(affine));

        /* The document and MRZ band corners in the exported frame. */
        var docQuad = corners.map(function (p) {
            return applyH(matrix, p[0], p[1]);
        });
        var mrzQuad = regionCorners(region).map(function (p) {
            return applyH(matrix, p[0], p[1]);
        });

        var warped = warpPerspective(scene, cropW, cropH, inverse);

        /* ---- sensor -------------------------------------------------- */
        applyBlur(warped, spanFor(values, 'blur', 0));
        var motion = spanFor(values, 'motion', 0);
        var output = motion >= 1
            ? applyMotionBlur(warped, motion, rng() * Math.PI * 2)
            : warped;
        applyNoise(output, spanFor(values, 'noise', 0), rng);

        return applyJpeg(output, spanFor(values, 'jpeg', 1)).then(function (jpegged) {
            var scale = spanFor(values, 'scale', 1);
            var finalCanvas = applyScale(jpegged, scale);
            /* Crop and perspective do not resample, so the output scale is
               the only thing that changes what a pixel is worth in the
               exported image — and the points travel with it. */
            var pointsScale = finalCanvas.width / jpegged.width;
            function scaled(quad) {
                return quad.map(function (p) {
                    return [Math.round(p[0] * pointsScale * 10) / 10,
                    Math.round(p[1] * pointsScale * 10) / 10];
                });
            }

            return {
                index: index,
                canvas: finalCanvas,
                record: record,
                mrz: mrz,
                applied: values,
                cropRequested: cropRequested,
                inverted: inverted,
                docQuad: scaled(docQuad),
                mrzQuad: scaled(mrzQuad)
            };
        });
    }

    /* ================================================================== *
     * Dataset
     * ================================================================== */

    function normalizeSpec(input) {
        var spec = input || {};
        return {
            seed: spec.seed === undefined ? 'codepool' : String(spec.seed),
            samples: Math.max(1, Math.min(MAX_SAMPLES, parseInt(spec.samples, 10) || 1)),
            docType: spec.docType || 'mixed',
            difficulty: !!spec.difficulty,
            degradations: spec.degradations || {}
        };
    }

    function canvasToBlob(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (blob) resolve(blob);
                else reject(new Error('The browser could not encode the PNG.'));
            }, 'image/png');
        });
    }

    /* Render `samples` images and keep the ground truth for each. Document
       numbers are unique across the whole dataset, so every expected value
       appears exactly once and a miss can only mean one document. */
    function generateDataset(input, onProgress) {
        var spec = normalizeSpec(input);
        var baseSeed = hashSeed(spec.seed);
        var used = {};
        var samples = [];
        var i = 0;

        function next() {
            if (i >= spec.samples) return Promise.resolve(finish());
            var index = i++;
            if (onProgress) onProgress(index, spec.samples);
            return renderSample({ spec: spec, index: index, baseSeed: baseSeed, used: used })
                .then(function (sample) {
                    sample.name = fileName(baseSeed, sample.index);
                    return canvasToBlob(sample.canvas).then(function (blob) {
                        sample.blob = blob;
                        sample.width = sample.canvas.width;
                        sample.height = sample.canvas.height;
                        samples.push(sample);
                        return next();
                    });
                });
        }

        function finish() {
            return {
                spec: spec,
                seedHash: baseSeed,
                samples: samples,
                annotation: buildAnnotation(spec, baseSeed, samples)
            };
        }

        return next();
    }

    function fileName(baseSeed, index) {
        return 'mrz-stress-' + baseSeed.toString(16) + '-' + pad(index + 1, 3) + '.png';
    }

    function buildAnnotation(spec, baseSeed, samples) {
        var images = samples.map(function (sample) {
            return {
                file: sample.name,
                width: sample.width,
                height: sample.height,
                degradations: describeApplied(sample, spec.degradations),
                mrz: {
                    format: sample.mrz.formatName,
                    issuingState: sample.mrz.issuingState,
                    text: sample.mrz.mrzText,
                    fields: sample.mrz.fields,
                    checkDigits: sample.mrz.checkDigits,
                    points: sample.mrzQuad
                },
                document: { points: sample.docQuad }
            };
        });
        return {
            format: 'mrz-benchmark/1.0',
            dataset: 'Codepool MRZ stress test',
            generated: new Date().toISOString(),
            total_images: images.length,
            generator: {
                tool: 'codepool/demos/mrz-generator',
                seed: spec.seed,
                seed_hash: baseSeed,
                samples_requested: spec.samples,
                doc_type: spec.docType,
                difficulty_factor: spec.difficulty,
                notes: 'Deterministic: the same seed reproduces the same identities, '
                    + 'document types and degradation values. Degradation values are '
                    + 'per image and list only what was actually applied, most severe '
                    + 'first — a value at the undamaged end of its range is omitted '
                    + 'rather than written as a zero. mrz.points and document.points '
                    + 'are the quads in the exported image, in pixels. Dates are YYMMDD '
                    + 'as encoded in the MRZ.'
                    + (spec.difficulty ? ' A difficulty factor scales every range from '
                        + 'its undamaged end once per image, so the set spans easy to hard.' : '')
            },
            images: images
        };
    }

    /* The conditions that actually shaped one image.

       Values sitting at the undamaged end of their range are not conditions —
       they are the absence of one — and listing them spends a table row on
       saying nothing. What survives is ordered by how far it moved from
       undamaged, so a reader that truncates the line keeps the part that can
       explain a miss. */
    function describeApplied(sample, ranges) {
        var out = { inverted: !!sample.inverted };
        var entries = [];

        DEGRADATIONS.forEach(function (degradation) {
            var value = sample.applied[degradation.id];
            if (value === null || value === undefined) return;
            var range = ranges && ranges[degradation.id];
            var severity = severityOf(degradation, range, value);
            /* Under 2% of its own range, a degradation is not there — a JPEG
               quality of 0.991 is "no compression". */
            if (range && severity <= NEUTRAL_TOLERANCE) return;
            entries.push({ id: degradation.id, value: round2(value), severity: severity });
        });

        entries.sort(function (a, b) { return b.severity - a.severity; });
        entries.forEach(function (entry) { out[entry.id] = entry.value; });

        if (sample.cropRequested !== undefined && sample.cropRequested < sample.applied.crop) {
            out.crop_requested = round2(sample.cropRequested);
        }
        if (sample.applied.difficulty !== undefined && sample.applied.difficulty < 0.999) {
            out.difficulty = round2(sample.applied.difficulty);
        }
        return out;
    }

    function round2(value) {
        return Math.round(value * 100) / 100;
    }

    /* ================================================================== *
     * ZIP (store only — no compression, no dependencies)
     * ================================================================== */

    var CRC_TABLE = (function () {
        var table = new Uint32Array(256);
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        var crc = 0xffffffff;
        for (var i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function utf8(text) {
        var out = [];
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code < 0x80) out.push(code);
            else if (code < 0x800) {
                out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            } else if (code >= 0xd800 && code < 0xdc00) {
                var next = text.charCodeAt(++i);
                var cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
                    0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
            } else {
                out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            }
        }
        return new Uint8Array(out);
    }

    /* A minimal uncompressed ZIP: local headers, central directory, end
       record. Enough for the OS, for PowerShell's Expand-Archive and for the
       scanner's own reader — and small enough to audit at a glance. */
    function buildZip(entries) {
        var prepared = entries.map(function (entry) {
            return {
                name: utf8(entry.name),
                data: entry.data instanceof Uint8Array ? entry.data : utf8(entry.data)
            };
        });
        prepared.forEach(function (entry) { entry.crc = crc32(entry.data); });

        var size = 22;
        prepared.forEach(function (entry) {
            size += 30 + entry.name.length + entry.data.length;   // local header
            size += 46 + entry.name.length;                       // central record
        });
        var buffer = new ArrayBuffer(size);
        var bytes = new Uint8Array(buffer);
        var view = new DataView(buffer);
        var offset = 0;
        var offsets = [];

        var now = new Date();
        var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        var dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9)
            | ((now.getMonth() + 1) << 5) | now.getDate();

        prepared.forEach(function (entry) {
            offsets.push(offset);
            view.setUint32(offset, 0x04034b50, true);
            view.setUint16(offset + 4, 20, true);       // version needed
            view.setUint16(offset + 6, 0, true);        // flags
            view.setUint16(offset + 8, 0, true);        // method: store
            view.setUint16(offset + 10, dosTime, true);
            view.setUint16(offset + 12, dosDate, true);
            view.setUint32(offset + 14, entry.crc, true);
            view.setUint32(offset + 18, entry.data.length, true);
            view.setUint32(offset + 22, entry.data.length, true);
            view.setUint16(offset + 26, entry.name.length, true);
            view.setUint16(offset + 28, 0, true);
            offset += 30;
            bytes.set(entry.name, offset);
            offset += entry.name.length;
            bytes.set(entry.data, offset);
            offset += entry.data.length;
        });

        var centralStart = offset;
        prepared.forEach(function (entry, index) {
            view.setUint32(offset, 0x02014b50, true);
            view.setUint16(offset + 4, 20, true);      // version made by
            view.setUint16(offset + 6, 20, true);      // version needed
            view.setUint16(offset + 8, 0, true);
            view.setUint16(offset + 10, 0, true);
            view.setUint16(offset + 12, dosTime, true);
            view.setUint16(offset + 14, dosDate, true);
            view.setUint32(offset + 16, entry.crc, true);
            view.setUint32(offset + 20, entry.data.length, true);
            view.setUint32(offset + 24, entry.data.length, true);
            view.setUint16(offset + 28, entry.name.length, true);
            view.setUint16(offset + 30, 0, true);
            view.setUint16(offset + 32, 0, true);
            view.setUint16(offset + 34, 0, true);
            view.setUint16(offset + 36, 0, true);
            view.setUint32(offset + 38, 0, true);
            view.setUint32(offset + 42, offsets[index], true);
            offset += 46;
            bytes.set(entry.name, offset);
            offset += entry.name.length;
        });

        view.setUint32(offset, 0x06054b50, true);
        view.setUint16(offset + 4, 0, true);
        view.setUint16(offset + 6, 0, true);
        view.setUint16(offset + 8, prepared.length, true);
        view.setUint16(offset + 10, prepared.length, true);
        view.setUint32(offset + 12, offset - centralStart, true);
        view.setUint32(offset + 16, centralStart, true);
        view.setUint16(offset + 20, 0, true);

        return new Blob([buffer], { type: 'application/zip' });
    }

    /* ================================================================== *
     * Export
     * ================================================================== */

    global.MrzStress = {
        DEGRADATIONS: DEGRADATIONS,
        PRESETS: PRESETS,
        DOC_KINDS: DOC_KINDS,
        MAX_SAMPLES: MAX_SAMPLES,
        MRZ_MARGIN: MRZ_MARGIN,
        PAGE_W: PAGE_W,
        PAGE_H: PAGE_H,
        hashSeed: hashSeed,
        makeRng: makeRng,
        sampleSeed: sampleSeed,
        randomRecord: randomRecord,
        buildMrz: buildMrz,
        mrzRegion: mrzRegion,
        drawValues: drawValues,
        generateDataset: generateDataset,
        renderSample: renderSample,
        normalizeSpec: normalizeSpec,
        /* Exported so the page's preview describes an image with the same rules
           the annotation was written with — which conditions count, and in what
           order. Two formatters would drift, and the one the visitor reads would
           be the wrong one. */
        describeApplied: describeApplied,
        buildZip: buildZip,
        crc32: crc32,
        /* Geometry is exported both ways: the demo does not use it directly,
           but it is the part that has to be right for the ground truth to mean
           anything, so it is exercised by unit tests under plain node. */
        solveQuad: solveQuad,
        multiplyH: multiplyH,
        applyH: applyH,
        rotationAbout: rotationAbout,
        affineInverse: affineInverse,
        pickWindowOrigin: pickWindowOrigin,
        polygonArea: polygonArea
    };
})(typeof window !== 'undefined' ? window : this);