/*
 * Barcode Stress Test — synthetic dataset engine.
 *
 * Turns bwip-js output into test images that carry their own ground truth:
 * a scene of barcode symbols is composed, a configurable set of capture
 * degradations is applied, and for every symbol the engine keeps the payload,
 * the symbology and the four corner points as they land in the *final* image.
 * The result is exported as a PNG plus an `annotations.json` in the
 * `barcode-benchmark/1.0` schema the scanner's benchmark mode reads.
 *
 * Two rules shape the code:
 *
 *   1. The ground truth must survive the pipeline. Degradations that move
 *      pixels (perspective, rotation, crop, downscale) are composed into one
 *      homography, and the same matrix transforms the symbol corners — the
 *      points are computed, never estimated.
 *   2. Every random choice comes from a seeded stream, so a seed reproduces
 *      the same payloads, symbologies, placements and degradation values.
 *      The pixel output is not promised byte-identical (blur, JPEG and
 *      resampling are the browser's), the *test case* is.
 *
 * The oracle is what the value actually decodes to, not what was typed in:
 * EAN-13 gains a check digit, MSI gains a Mod-10 digit, an ITF odd count gains
 * a leading zero and a Codabar decoder strips the start/stop characters.
 *
 * No SDK, no licence and no network: bwip-js is the only dependency and it is
 * already loaded by the page.
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

    function digits(rng, n) {
        var out = '';
        for (var i = 0; i < n; i++) out += String(Math.floor(rng() * 10));
        return out;
    }

    /* ================================================================== *
     * Symbology facts
     *
     * `format` is the name the reference dataset uses (the Dynamsoft enum
     * spelling), `bcid` is bwip-js. `expected` corrects the typed value to the
     * value a decoder returns — null means the payload decodes verbatim.
     * ================================================================== */

    function ean13CheckDigit(twelve) {
        var sum = 0;
        for (var i = 0; i < 12; i++) {
            sum += Number(twelve.charAt(i)) * (i % 2 === 0 ? 1 : 3);
        }
        return String((10 - (sum % 10)) % 10);
    }

    /* MSI's `includecheck` appends one Mod-10 (Luhn) digit over the payload. */
    function msiCheckDigit(text) {
        var sum = 0;
        var double = true;                 // rightmost payload digit is doubled
        for (var i = text.length - 1; i >= 0; i--) {
            var d = Number(text.charAt(i));
            if (double) {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
            double = !double;
        }
        return String((10 - (sum % 10)) % 10);
    }

    var BAR_HEIGHT_MODULES = 40;           // linear bars are 40 modules tall
    /* bwip-js `height` is in millimetres and is multiplied by `scale`, so a
       constant in mm is exactly proportional to the module size. */
    var BAR_HEIGHT_MM = BAR_HEIGHT_MODULES * 25.4 / 72;

    var FACTS = {
        qrcode: { format: 'QR_CODE', payload: 'serial' },
        pdf417: { format: 'PDF417', payload: 'serial' },
        datamatrix: { format: 'DATAMATRIX', payload: 'serial' },
        azteccode: { format: 'AZTEC', payload: 'serial' },
        maxicode: { format: 'MAXICODE', payload: 'serial' },
        dotcode: { format: 'DOTCODE', payload: 'serial' },
        ean13: {
            format: 'EAN_13',
            payload: function (rng) { return digits(rng, 12); },
            expected: function (payload) { return payload + ean13CheckDigit(payload); }
        },
        code128: { format: 'CODE_128', payload: 'serial' },
        code39: {
            format: 'CODE_39',
            payload: function (rng, serial) { return 'DS-' + pad(serial, 4) + digits(rng, 3); }
        },
        interleaved2of5: {
            /* An even digit count needs no padding, which keeps the payload and
               the decoded value identical. */
            format: 'ITF',
            payload: function (rng) { return digits(rng, 14); }
        },
        msi: {
            format: 'MSI_CODE',
            payload: function (rng) { return digits(rng, 10); },
            expected: function (payload) { return payload + msiCheckDigit(payload); }
        },
        pharmacode: {
            format: 'PHARMACODE_ONE_TRACK',
            payload: function (rng) { return String(3 + Math.floor(rng() * 131068)); }
        },
        rationalizedCodabar: {
            /* The decoder strips the start/stop characters, so the oracle holds
               the inner digits only. */
            format: 'CODABAR',
            payload: function (rng) { return 'A' + digits(rng, 10) + 'B'; },
            expected: function (payload) { return payload.slice(1, -1); }
        }
    };

    /* ================================================================== *
     * Degradations
     *
     * Every entry draws one value per sample from its [min, max] range, in
     * table order, so the draw sequence — and therefore the reproduction — is
     * stable. Adding an entry changes the stream: bump a seed, don't expect the
     * old dataset back.
     *
     * The meaning of the two numbers differs per row and is spelled out in
     * `hint`; `invert` is a *rate* (the sample is inverted with that chance),
     * the rest are values.
     * ================================================================== */

    var DEGRADATIONS = [
        {
            id: 'module', label: 'Module size', unit: 'px/module', min: 1, max: 6, step: 1,
            worse: 'high',
            integer: true,
            hint: 'Pixels per module — the encoder scale. 1 px/module is the floor; '
                + 'below that a blurred symbol would test the camera, not the decoder.'
        },
        {
            id: 'frame', label: 'Frame padding', unit: '× symbol', min: 1.2, max: 4, step: 0.1,
            worse: 'low',
            hint: 'The symbol occupies 1/frame of its cell, so a larger value puts a '
                + 'smaller barcode in a larger frame — the harder end is the larger one.'
        },
        {
            id: 'rotate', label: 'Rotation', unit: '°', min: -25, max: 25, step: 1,
            worse: 'symmetric',
            hint: 'Clockwise rotation of the whole frame — the camera was tilted.'
        },
        {
            id: 'tilt', label: 'Symbol tilt', unit: '°', min: -180, max: 180, step: 1,
            worse: 'symmetric', scope: 'symbol',
            hint: 'How far each symbol is rotated on its own, independently of the others and '
                + 'of the frame. Separate from Frame rotation on purpose: a tilted camera turns '
                + 'everything together, while codes affixed to a sheet by hand sit at their own '
                + 'angles — which is what a multi-code image in the wild actually looks like.'
        },
        {
            id: 'persp', label: 'Perspective', unit: 'strength', min: 0, max: 0.3, step: 0.01,
            worse: 'low',
            hint: 'Corner displacement as a fraction of the frame, i.e. photographing '
                + 'a label at an angle.'
        },
        {
            id: 'crop', label: 'Frame kept', unit: '× frame', min: 0.4, max: 1, step: 0.01,
            worse: 'high',
            hint: 'How much of the frame survives — it trims the empty border the scene leaves '
                + 'around its symbols. The frame never cuts into a symbol: a cut barcode cannot '
                + 'be read by anything, so it could only ever be a guaranteed miss. Loose framing '
                + 'therefore crops a lot, tight framing hardly at all, and the value actually '
                + 'used is recorded per image.'
        },
        {
            id: 'blur', label: 'Blur', unit: 'px', min: 0, max: 3, step: 0.1,
            worse: 'low',
            hint: 'Gaussian-ish blur radius (three box passes).'
        },
        {
            id: 'motion', label: 'Motion blur', unit: 'px', min: 0, max: 30, step: 1,
            worse: 'low',
            hint: 'Streak length; the direction is drawn from the seed.'
        },
        {
            id: 'contrast', label: 'Contrast', unit: 'factor', min: 0.3, max: 1, step: 0.01,
            worse: 'high',
            hint: 'Contrast multiplier around mid grey. 1 leaves the image alone; a low '
                + 'value lifts the black level (a faded print or a low-contrast capture).'
        },
        {
            id: 'jpeg', label: 'JPEG quality', unit: 'quality', min: 0.15, max: 1, step: 0.05,
            worse: 'high',
            hint: 'The image is re-encoded as JPEG at this quality and decoded again, so '
                + 'the block artifacts are in the pixels, not just in the file.'
        },
        {
            id: 'noise', label: 'Noise', unit: 'σ', min: 0, max: 30, step: 1,
            worse: 'low',
            hint: 'Uniform sensor noise added to every channel.'
        },
        {
            id: 'light', label: 'Uneven lighting', unit: 'strength', min: 0, max: 0.7, step: 0.01,
            worse: 'low',
            hint: 'Linear illumination falloff across the frame, at a random angle.'
        },
        {
            id: 'glare', label: 'Glare', unit: 'strength', min: 0, max: 0.6, step: 0.01,
            worse: 'low',
            hint: 'A specular highlight that washes out part of the frame.'
        },
        {
            id: 'invert', label: 'Inversion', unit: 'chance', min: 0, max: 0.4, step: 0.01,
            worse: 'low',
            hint: 'Chance that the sample is inverted to white-on-black.'
        },
        {
            id: 'scale', label: 'Output scale', unit: 'factor', min: 0.35, max: 1, step: 0.05,
            worse: 'high',
            hint: 'Final resampling of the whole frame. This is the only step that '
                + 'changes the pixels per module after encoding.'
        }
    ];

    /* Presets fill the range table. `null` turns a degradation off. */
    var PRESETS = {
        clean: {
            label: 'Clean',
            note: 'No degradation — the control group. Everything here should decode, and every '
                + 'symbol sits upright, so this is also the reference for what a clean read looks like.',
            symbols: 1,
            values: {
                module: [3, 3], frame: [1.6, 1.6], contrast: [1, 1], crop: [1, 1], scale: [1, 1]
            }
        },
        easy: {
            label: 'Easy',
            note: 'A well-lit handheld shot: a little blur, a little rotation, mild JPEG.',
            symbols: 2,
            difficulty: true,
            values: {
                module: [3, 4], frame: [1.4, 2.2], rotate: [-6, 6], tilt: [-10, 10], persp: [0, 0.06],
                crop: [0.9, 1], blur: [0, 0.8], motion: [0, 6], contrast: [0.8, 1],
                jpeg: [0.8, 1], noise: [0, 6], light: [0, 0.15], scale: [1, 1]
            }
        },
        medium: {
            label: 'Medium',
            note: 'A phone photo of a label in a room: rotation, some glare, visible noise, and '
                + 'codes that are not all parallel.',
            symbols: 4,
            difficulty: true,
            values: {
                module: [2, 3], frame: [1.4, 2.8], rotate: [-14, 14], tilt: [-35, 35], persp: [0, 0.16],
                crop: [0.8, 1], blur: [0, 1.6], motion: [0, 12], contrast: [0.6, 0.9],
                jpeg: [0.5, 0.85], noise: [0, 14], light: [0, 0.3], glare: [0, 0.15],
                invert: [0, 0.15], scale: [0.6, 1]
            }
        },
        hard: {
            label: 'Hard',
            note: 'The far end: 1–2 px per module, heavy motion blur, aggressive JPEG, and codes '
                + 'turned up to a quarter turn away from each other.',
            symbols: 6,
            difficulty: true,
            values: {
                module: [1, 2], frame: [1.3, 3.5], rotate: [-25, 25], tilt: [-90, 90], persp: [0.05, 0.3],
                crop: [0.6, 0.95], blur: [0.4, 2.6], motion: [4, 26], contrast: [0.35, 0.7],
                jpeg: [0.2, 0.6], noise: [6, 26], light: [0.1, 0.6], glare: [0, 0.35],
                invert: [0, 0.3], scale: [0.4, 0.9]
            }
        },
        mixed: {
            label: 'Mixed',
            note: 'A varied set: every degradation is available, each symbol is tilted on its own, '
                + 'and a per-image difficulty factor scales them, so the set runs from nearly clean '
                + 'to thoroughly degraded.',
            symbols: 4,
            difficulty: true,
            values: {
                module: [1, 5], frame: [1.2, 4], rotate: [-25, 25], tilt: [-90, 90], persp: [0, 0.3],
                crop: [0.5, 1], blur: [0, 2.6], motion: [0, 26], contrast: [0.35, 1],
                jpeg: [0.2, 1], noise: [0, 26], light: [0, 0.6], glare: [0, 0.35],
                invert: [0, 0.3], scale: [0.4, 1]
            }
        }
    };

    var MAX_SAMPLES = 60;
    var MAX_SYMBOLS = 16;
    var MAX_PAGE_SIDE = 1600;              // the pre-crop frame is capped here
    var MIN_FRAME = 1.05;                  // below this the cells stop containing their symbol
    /* Only a symbol entirely inside the exported frame can be an expected value.
       A cut symbol is undecodable by any reader, so counting it as a miss measures
       nothing — and unlike a photograph, this generator chose where to put the
       frame. The threshold is 0.999 rather than 1 so a corner resting on the
       border, or a tenth of a pixel of rounding, does not exclude a symbol that is
       in fact whole. */
    var MIN_VISIBLE = 0.999;
    var NEUTRAL_TOLERANCE = 0.02;          // below 2% of a range, a degradation is absent
    var QUIET_ZONE_MODULES = 4;            // bwip-js padding, per the standards
    var PAGE_MARGIN_MODULES = 8;

    var SYMBOLOGY_IDS = ['qrcode', 'pdf417', 'datamatrix', 'azteccode', 'maxicode',
        'dotcode', 'ean13', 'code128', 'code39', 'interleaved2of5', 'msi',
        'pharmacode', 'rationalizedCodabar'];

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
            if (Math.abs(a[pivot][col]) < 1e-12) continue;
            var tmp = a[col]; a[col] = a[pivot]; a[pivot] = tmp;
            var tb = b[col]; b[col] = b[pivot]; b[pivot] = tb;
            for (var r2 = 0; r2 < 8; r2++) {
                if (r2 === col) continue;
                var f = a[r2][col] / a[col][col];
                if (!f) continue;
                for (var c2 = col; c2 < 8; c2++) a[r2][c2] -= f * a[col][c2];
                b[r2] -= f * b[col];
            }
        }
        var h = new Array(9);
        for (var k = 0; k < 8; k++) h[k] = Math.abs(a[k][k]) < 1e-12 ? 0 : b[k] / a[k][k];
        h[8] = 1;
        return h;
    }

    function multiplyH(m1, m2) {
        var out = new Array(9);
        for (var r = 0; r < 3; r++) {
            for (var c = 0; c < 3; c++) {
                out[r * 3 + c] = m1[r * 3] * m2[c] + m1[r * 3 + 1] * m2[3 + c]
                    + m1[r * 3 + 2] * m2[6 + c];
            }
        }
        return out;
    }

    function applyH(h, x, y) {
        var d = h[6] * x + h[7] * y + h[8];
        if (Math.abs(d) < 1e-12) d = 1e-12;
        return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
    }

    /* Rotate `radians` about (cx, cy), then move that point to (tx, ty). Built
       as a 3x3 so it composes with the perspective matrix. */
    function rotationAbout(radians, cx, cy, tx, ty) {
        var c = Math.cos(radians), s = Math.sin(radians);
        return [c, -s, tx - (c * cx - s * cy),
            s, c, ty - (s * cx + c * cy),
            0, 0, 1];
    }

    function affineInverse(h) {
        var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5];
        var det = a * e - b * d;
        if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        return [e / det, -b / det, (b * f - e * c) / det,
            -d / det, a / det, (d * c - a * f) / det,
            0, 0, 1];
    }

    /* ================================================================== *
     * Polygon helpers
     *
     * The generator needs exactly two things: the area of a quad, and how much
     * of it survives the crop. Both are here rather than in a shared file, so
     * this mode depends on nothing but bwip-js — a page whose engine dies
     * because a second script did not load is broken in a way the visitor
     * cannot act on. (The scanner's benchmark has its own copy for the box
     * overlap it reports; the two share only the shoelace formula below, so
     * there is no metric for them to disagree about.)
     * ================================================================== */

    function polygonArea(poly) {
        if (!poly || poly.length < 3) return 0;
        var sum = 0;
        for (var i = 0; i < poly.length; i++) {
            var a = poly[i], b = poly[(i + 1) % poly.length];
            sum += a[0] * b[1] - b[0] * a[1];
        }
        return Math.abs(sum) / 2;
    }

    /* Sutherland-Hodgman against an axis-aligned box: how much of a symbol is
       still inside the frame. The input quad is in order, so a simple
       inside test per edge is enough here. */
    function clipToRect(points, w, h) {
        function along(a, b, t) {
            if (!isFinite(t)) t = 0;
            t = Math.max(0, Math.min(1, t));
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }
        var edges = [
            { inside: function (p) { return p[0] >= 0; }, cut: function (a, b) { return along(a, b, a[0] / (a[0] - b[0])); } },
            { inside: function (p) { return p[0] <= w; }, cut: function (a, b) { return along(a, b, (a[0] - w) / (a[0] - b[0])); } },
            { inside: function (p) { return p[1] >= 0; }, cut: function (a, b) { return along(a, b, a[1] / (a[1] - b[1])); } },
            { inside: function (p) { return p[1] <= h; }, cut: function (a, b) { return along(a, b, (a[1] - h) / (a[1] - b[1])); } }
        ];
        var poly = points.slice();
        for (var e = 0; e < edges.length; e++) {
            var edge = edges[e];
            var input = poly;
            poly = [];
            for (var i = 0; i < input.length; i++) {
                var cur = input[i];
                var prev = input[(i + input.length - 1) % input.length];
                var curIn = edge.inside(cur);
                var prevIn = edge.inside(prev);
                if (curIn) {
                    if (!prevIn) poly.push(edge.cut(prev, cur));
                    poly.push(cur);
                } else if (prevIn) {
                    poly.push(edge.cut(prev, cur));
                }
            }
            if (poly.length === 0) return [];
        }
        return poly;
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

    function cloneCanvas(source) {
        var canvas = makeCanvas(source.width, source.height);
        canvas.getContext('2d').drawImage(source, 0, 0);
        return canvas;
    }

    /* ================================================================== *
     * Encoding
     * ================================================================== */

    function encodeSymbol(bcid, text, scale) {
        return new Promise(function (resolve, reject) {
            var canvas = document.createElement('canvas');
            var options = {
                bcid: bcid,
                text: text,
                scale: scale,
                /* Exactly the quiet zone the standards require — no more, so the
                   expected box is the symbol, not the symbol on a wide margin. */
                paddingwidth: QUIET_ZONE_MODULES,
                paddingheight: QUIET_ZONE_MODULES
            };
            if (bcid !== 'qrcode' && bcid !== 'pdf417' && bcid !== 'datamatrix'
                && bcid !== 'azteccode' && bcid !== 'maxicode' && bcid !== 'dotcode') {
                options.height = BAR_HEIGHT_MM;
            }
            if (bcid === 'msi') options.includecheck = true;
            var pending;
            try {
                pending = global.bwipjs.toCanvas(canvas, options);
            } catch (error) {
                reject(error);
                return;
            }
            if (pending && typeof pending.then === 'function') {
                pending.then(function () { resolve(canvas); }, reject);
            } else {
                resolve(canvas);
            }
        });
    }

    /* ================================================================== *
     * Payloads
     * ================================================================== */

    function makePayload(bcid, rng, serial, used) {
        var fact = FACTS[bcid];
        var attempt = 0;
        while (attempt < 30) {
            var payload;
            if (fact.payload === 'serial') {
                payload = 'DS-' + pad(serial, 4) + '-' + digits(rng, 4);
            } else {
                payload = fact.payload(rng, serial);
            }
            attempt++;
            if (!used || !used[payload]) return payload;
        }
        return 'DS-' + pad(serial, 4) + '-' + String(attempt) + 'X';
    }

    function expectedValue(bcid, payload) {
        var fact = FACTS[bcid];
        if (!fact || !fact.expected) return payload;
        return fact.expected(payload);
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
        if (length < 1) return;
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
        /* The page colour: a few pixels in, clear of any symbol. */
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
                dd[o + 3] = 255;
            }
        }
        octx.putImageData(od, 0, 0);
        return out;
    }

    /* ================================================================== *
     * Sample rendering
     * ================================================================== */

    /* The axis-aligned box around a set of points. */
    function boundingBox(points) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(function (p) {
            if (p[0] < minX) minX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] > maxY) maxY = p[1];
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /* The axis-aligned box a rectangle occupies once rotated. */
    function rotatedExtent(w, h, degrees) {
        if (!degrees) return { w: w, h: h };
        var rad = degrees * Math.PI / 180;
        var c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
        return { w: w * c + h * s, h: w * s + h * c };
    }

    /* Draws the degradation values for one sample, in table order.
       
       With a difficulty factor, one value is drawn for the whole image and every
       range is interpolated from its undamaged end by that fraction. That is
       what makes a mixed set varied: instead of stacking every degradation at
       full strength (which no real capture does, and which produces images that
       nothing can read), each image gets a coherent amount of damage — some
       nearly clean, some thoroughly degraded.

       Rows flagged `scope: 'symbol'` are skipped here: their range applies to
       each symbol separately, so they are drawn per symbol further down. */
    function drawValues(ranges, rng, useDifficulty) {
        var applied = {};
        var difficulty = useDifficulty ? rng() : 1;
        DEGRADATIONS.forEach(function (degradation) {
            var range = ranges[degradation.id];
            if (!range || degradation.scope === 'symbol') {
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

    /* One sample: layout -> symbols -> degradations -> ground truth. Resolves
       with { canvas, barcodes, applied, dropped }. */
    function renderSample(options) {
        var spec = options.spec;
        var index = options.index;
        var baseSeed = options.baseSeed;
        var used = options.used;
        var rng = makeRng(sampleSeed(baseSeed, index));

        var values = drawValues(spec.degradations, rng, !!spec.difficulty);

        /* ---- choose the symbols ------------------------------------ */
        var pool = spec.symbology === 'mixed' ? SYMBOLOGY_IDS : [spec.symbology];
        var symbols = [];
        for (var k = 0; k < spec.symbols; k++) {
            var bcid = pool.length === 1 ? pool[0] : pool[Math.floor(rng() * pool.length)];
            symbols.push({ bcid: bcid, serial: index * MAX_SYMBOLS + k + 1 });
        }
        symbols.forEach(function (symbol) {
            symbol.payload = makePayload(symbol.bcid, rng, symbol.serial, used);
            used[symbol.payload] = true;
            symbol.expected = expectedValue(symbol.bcid, symbol.payload);
        });

        /* Each symbol gets its own tilt, drawn in its own slot of the stream so
           the sequence stays reproducible. Drawn before the layout solve because
           a rotated symbol needs a bigger cell — and for a linear code a quarter
           turn makes it tall instead of wide, so ignoring this would overlap
           neighbours. */
        var tiltRange = spec.degradations.tilt;
        var widestTilt = 0;
        symbols.forEach(function (symbol) {
            if (!tiltRange) {
                symbol.tilt = 0;
                return;
            }
            var drawn = randRange(rng, tiltRange[0], tiltRange[1]) * values.difficulty;
            /* A tilt past 180 is the same tilt, and the factor can push the
               drawn value outside the range the caller asked for. */
            symbol.tilt = Math.round(Math.max(-180, Math.min(180, drawn)) * 10) / 10;
            widestTilt = Math.max(widestTilt, Math.abs(symbol.tilt));
        });
        /* One number per image in the annotations: the widest tilt actually
           applied. The per-symbol angles are already recoverable from the point
           quads, so they do not need a field of their own. */
        if (tiltRange) values.tilt = widestTilt;

        var module = values.module;
        var frame = values.frame;

        /* Measure every symbol at scale 1 first. Both the symbol and the page
           margin are proportional to the module size, so the page is linear in
           it and the largest module that fits can be solved for rather than
           guessed — which matters, because the alternative (shrinking the cell
           below the symbol) produces overlapping symbols, and an image with
           symbols on top of each other is not a hard test case, it is an
           invalid one. */
        return Promise.all(symbols.map(function (symbol) {
            return encodeSymbol(symbol.bcid, symbol.payload, 1).then(function (probe) {
                return {
                    bcid: symbol.bcid,
                    payload: symbol.payload,
                    expected: symbol.expected,
                    tilt: symbol.tilt,
                    /* The bounding box the symbol occupies once it is turned:
                       the layout must fit that, not the upright symbol. */
                    unitWidth: rotatedExtent(probe.width, probe.height, symbol.tilt).w,
                    unitHeight: rotatedExtent(probe.width, probe.height, symbol.tilt).h,
                    drawnWidth: probe.width,
                    drawnHeight: probe.height
                };
            });
        })).then(function (measured) {
            var unitW = Math.max.apply(null, measured.map(function (m) { return m.unitWidth; }));
            var unitH = Math.max.apply(null, measured.map(function (m) { return m.unitHeight; }));
            var cols = Math.ceil(Math.sqrt(measured.length));
            var rows = Math.ceil(measured.length / cols);

            function extent(m, f) {
                return {
                    cellW: unitW * m * f,
                    cellH: unitH * m * f,
                    margin: m * PAGE_MARGIN_MODULES,
                    w: cols * unitW * m * f + m * PAGE_MARGIN_MODULES * 2,
                    h: rows * unitH * m * f + m * PAGE_MARGIN_MODULES * 2
                };
            }
            function overCap(m, f) {
                var e = extent(m, f);
                return Math.max(e.w, e.h) > MAX_PAGE_SIDE;
            }
            /* The largest padding that fits at this module size. */
            function maxFrameFor(m) {
                var widest = Math.max(cols * unitW * m, rows * unitH * m);
                if (widest <= 0) return Infinity;
                return (MAX_PAGE_SIDE - m * PAGE_MARGIN_MODULES * 2) / widest;
            }

            var usedModule = module;
            var usedFrame = frame;
            var moduleReduced = false;
            var frameClamped = false;

            /* Give up the padding before the module size, in that order. The
               frame only decides how much of the image is white; the module
               decides whether there is a readable symbol in it. */

            if (overCap(usedModule, usedFrame)) {
                var maxFrame = maxFrameFor(usedModule);
                if (maxFrame < usedFrame) {
                    /* Never below MIN_FRAME: at 1.0 the cells exactly touch, and
                       a reported frame smaller than that describes an image with
                       symbols on top of each other, which is not a hard test
                       case — it is an invalid one. */
                    usedFrame = Math.max(MIN_FRAME, maxFrame);
                    frameClamped = true;
                }
            }

            if (overCap(usedModule, usedFrame)) {
                var perModule = Math.max(
                    cols * unitW * usedFrame + PAGE_MARGIN_MODULES * 2,
                    rows * unitH * usedFrame + PAGE_MARGIN_MODULES * 2);
                usedModule = Math.max(1, Math.min(module, Math.floor(MAX_PAGE_SIDE / perModule)));
                moduleReduced = usedModule < module;
                if (moduleReduced) {
                    /* A smaller symbol leaves room for the padding the caller
                       asked for, so take it back where it fits. */
                    usedFrame = Math.max(MIN_FRAME,
                        Math.min(frame, maxFrameFor(usedModule)));
                    frameClamped = usedFrame < frame;
                }
            }

            var layout = extent(usedModule, usedFrame);

            return Promise.all(measured.map(function (m) {
                return encodeSymbol(m.bcid, m.payload, usedModule).then(function (canvas) {
                    return {
                        bcid: m.bcid,
                        payload: m.payload,
                        expected: m.expected,
                        tilt: m.tilt,
                        width: canvas.width,
                        height: canvas.height,
                        canvas: canvas
                    };
                });
            })).then(function (drawn) {
                    var cellW = layout.cellW;
                    var cellH = layout.cellH;
                    var margin = layout.margin;
                    var pageW = Math.round(layout.w);
                    var pageH = Math.round(layout.h);

                    /* Record what the image actually got. A condition list that
                       reports the request instead of the result is a lie about the
                       test case, and this is the one field a reader would use to
                       explain a miss. */
                    values.module = usedModule;
                    values.frame = usedFrame;

                    var scene = makeCanvas(pageW, pageH);
                    var sctx = scene.getContext('2d');
                    sctx.fillStyle = '#ffffff';
                    sctx.fillRect(0, 0, pageW, pageH);

                    var placed = [];
                    drawn.forEach(function (symbol, i) {
                        var col = i % cols, row = Math.floor(i / cols);
                        var cellX = margin + col * cellW, cellY = margin + row * cellH;
                        var jitterX = (rng() * 2 - 1) * cellW * 0.06;
                        var jitterY = (rng() * 2 - 1) * cellH * 0.06;
                        /* Position the turned bounding box, then turn the symbol
                           about its own centre. The quad the ground truth reports
                           is the same rectangle, turned by the same angle — the
                           points still come from the one rectangle, so they cannot
                           drift from what was drawn. */
                        var box = rotatedExtent(symbol.width, symbol.height, symbol.tilt);
                        var x = Math.round(cellX + (cellW - box.w) / 2 + jitterX);
                        var y = Math.round(cellY + (cellH - box.h) / 2 + jitterY);
                        x = Math.max(0, Math.min(Math.max(0, pageW - box.w), x));
                        y = Math.max(0, Math.min(Math.max(0, pageH - box.h), y));
                        var cx = x + box.w / 2, cy = y + box.h / 2;
                        var rad = symbol.tilt * Math.PI / 180;
                        var cos = Math.cos(rad), sin = Math.sin(rad);

                        sctx.save();
                        sctx.translate(cx, cy);
                        sctx.rotate(rad);
                        sctx.drawImage(symbol.canvas, -symbol.width / 2, -symbol.height / 2);
                        sctx.restore();

                        var halfW = symbol.width / 2, halfH = symbol.height / 2;
                        placed.push({
                            bcid: symbol.bcid,
                            payload: symbol.payload,
                            expected: symbol.expected,
                            tilt: symbol.tilt,
                            rect: [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]]
                                .map(function (corner) {
                                    return [
                                        corner[0] * cos - corner[1] * sin + cx,
                                        corner[0] * sin + corner[1] * cos + cy
                                    ];
                                })
                        });
                    });

                /* ---- optical ---------------------------------------------- */
                var inverted = false;
                if (values.invert !== null && rng() < values.invert) {
                    applyInvert(scene);
                    inverted = true;
                }
                applyLighting(scene, spanFor(values, 'light', 0), rng);
                applyGlare(scene, spanFor(values, 'glare', 0), rng);
                applyContrast(scene, spanFor(values, 'contrast', 1));

                /* ---- geometry --------------------------------------------- */
                var rotateDeg = spanFor(values, 'rotate', 0);
                var persp = spanFor(values, 'persp', 0);
                var crop = spanFor(values, 'crop', 1);
                var radians = rotateDeg * Math.PI / 180;

                var amp = persp * 0.15 * Math.min(pageW, pageH);
                var corners = [[0, 0], [pageW, 0], [pageW, pageH], [0, pageH]];
                var distorted = corners.map(function (corner) {
                    return [
                        corner[0] + (rng() * 2 - 1) * amp,
                        corner[1] + (rng() * 2 - 1) * amp
                    ];
                });
                var perspective = persp > 0
                    ? solveQuad(corners, distorted)
                    : [1, 0, 0, 0, 1, 0, 0, 0, 1];

                var rotatedW = Math.abs(pageW * Math.cos(radians)) + Math.abs(pageH * Math.sin(radians));
                var rotatedH = Math.abs(pageW * Math.sin(radians)) + Math.abs(pageH * Math.cos(radians));
                var cropW = Math.max(64, Math.round(rotatedW * crop));
                var cropH = Math.max(64, Math.round(rotatedH * crop));

                /* The crop trims the empty border the scene leaves around its
                   symbols, and stops before it would cut into one. Cutting is not a
                   difficulty: a barcode with part of itself outside the frame
                   cannot be decoded by any reader, so a cut symbol is a guaranteed
                   miss that measures nothing — and this generator, unlike a camera,
                   chose where to put the edge. Trimming the margin still tests the
                   two things worth testing: detection near the boundary, and
                   nothing invented from outside it.

                   The window is measured from where the symbols land in the FINAL
                   frame, perspective included. Measuring them before the warp left
                   a symbol able to sit up to `persp * 0.15 * min(page)` px outside
                   the window — far past the margin below — where the visibility
                   filter then dropped a symbol that was plainly visible and
                   decodable, and the benchmark reported it as a reader error. */
                var cropRequested = crop;
                var CROP_MARGIN = 8;      // px of frame left around the outermost symbol
                var pivot = [pageW / 2, pageH / 2];
                var turn = rotationAbout(radians, pivot[0], pivot[1], pivot[0], pivot[1]);
                /* page -> perspective -> rotation, with no window shift yet */
                var spun = multiplyH(turn, perspective);
                var spunCorners = [];
                placed.forEach(function (symbol) {
                    symbol.rect.forEach(function (corner) {
                        spunCorners.push(applyH(spun, corner[0], corner[1]));
                    });
                });
                var content = boundingBox(spunCorners);

                if (cropW < content.w + CROP_MARGIN * 2 || cropH < content.h + CROP_MARGIN * 2) {
                    cropW = Math.min(Math.max(cropW, Math.ceil(content.w) + CROP_MARGIN * 2),
                        Math.round(rotatedW));
                    cropH = Math.min(Math.max(cropH, Math.ceil(content.h) + CROP_MARGIN * 2),
                        Math.round(rotatedH));
                    values.crop = Math.round((cropW / rotatedW) * 1000) / 1000;
                }

                /* How far the window may move. Two limits, and the tighter one
                   wins: the window must stay inside the turned frame, and — the
                   one that was missing — the content must stay inside the window.
                   Jittering within the frame alone let a shift push the outermost
                   symbol back over the edge, where the visibility filter dropped a
                   symbol that was plainly there. */
                var slackX = Math.max(0, Math.min((rotatedW - cropW) / 2,
                    (cropW - content.w) / 2 - CROP_MARGIN));
                var slackY = Math.max(0, Math.min((rotatedH - cropH) / 2,
                    (cropH - content.h) / 2 - CROP_MARGIN));

                /* Where the content sits once the page is turned, and the shift that
                   brings it to the middle of the window. */
                var contentLands = [content.x + content.w / 2, content.y + content.h / 2];
                var aimX = cropW / 2 - contentLands[0];
                var aimY = cropH / 2 - contentLands[1];

                var attempts = 0;
                var geometry = null;
                while (attempts < 8 && !geometry) {
                    var offsetX = (rng() * 2 - 1) * slackX;
                    var offsetY = (rng() * 2 - 1) * slackY;
                    /* page -> distorted (perspective) -> rotate about its centre ->
                       shift so that centre lands in the crop box */
                    /* A shift applied after the spin: the window is simply moved
                       over the frame, which keeps the ground-truth transform exact
                       and its inverse affine. */
                    var affine = multiplyH(
                        [1, 0, aimX + offsetX, 0, 1, aimY + offsetY, 0, 0, 1], spun);
                    var matrix = multiplyH(affine, perspective);
                    /* The warp samples backwards: destination -> affine -> perspective */
                    var inverse = multiplyH(
                        solveQuad(distorted, corners),
                        affineInverse(affine));

                    var barcodes = [];
                    placed.forEach(function (symbol) {
                        var quad = symbol.rect.map(function (point) {
                            return applyH(matrix, point[0], point[1]);
                        });
                        var area = polygonArea(quad);
                        var visible = area > 0
                            ? polygonArea(clipToRect(quad, cropW, cropH)) / area
                            : 0;
                        if (visible >= MIN_VISIBLE) {
                            barcodes.push({
                                bcid: symbol.bcid,
                                text: symbol.expected,
                                visible: visible,
                                points: quad.map(function (point) {
                                    return [Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10];
                                })
                            });
                        }
                    });

                    attempts++;
                    /* A crop can empty the frame. Re-rolling the window is cheap and
                       keeps the sample honest instead of shipping empty ground
                       truth — and it is still driven by the seeded stream. */
                    if (barcodes.length > 0) {
                        geometry = { matrix: matrix, inverse: inverse, barcodes: barcodes };
                    }
                }

                if (!geometry) {
                    return {
                        index: index,
                        canvas: scene,
                        barcodes: [],
                        applied: values,
                        cropRequested: cropRequested,
                        frameClamped: frameClamped,
                        frameRequested: frame,
                        moduleReduced: moduleReduced,
                        moduleRequested: module,
                        inverted: inverted,
                        moduleSize: usedModule,
                        pixelsPerModule: usedModule,
                        dropped: placed.length,
                        empty: true
                    };
                }

                var warped = warpPerspective(scene, cropW, cropH, geometry.inverse);

                /* ---- sensor ----------------------------------------------- */
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
                       the only thing that changes what one module is worth in the
                       exported image — and the points travel with it. */
                    var pointsScale = finalCanvas.width / jpegged.width;

                    return {
                        index: index,
                        canvas: finalCanvas,
                        barcodes: geometry.barcodes.map(function (barcode) {
                            return {
                                text: barcode.text,
                                format: FACTS[barcode.bcid].format,
                                bcid: barcode.bcid,
                                visible: barcode.visible,
                                points: barcode.points.map(function (point) {
                                    return [
                                        Math.round(point[0] * pointsScale * 10) / 10,
                                        Math.round(point[1] * pointsScale * 10) / 10
                                    ];
                                })
                            };
                        }),
                        applied: values,
                        cropRequested: cropRequested,
                        frameClamped: frameClamped,
                        frameRequested: frame,
                        moduleReduced: moduleReduced,
                        moduleRequested: module,
                        inverted: inverted,
                        moduleSize: usedModule,
                        pixelsPerModule: usedModule * pointsScale,
                        dropped: placed.length - geometry.barcodes.length,
                        empty: false
                    };
                    });
            });
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
            symbols: Math.max(1, Math.min(MAX_SYMBOLS, parseInt(spec.symbols, 10) || 1)),
            symbology: spec.symbology || 'mixed',
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

    /* Render `samples` images and keep the ground truth for each. Payloads are
       unique across the whole dataset, so every expected value appears exactly
       once and a miss can only mean one symbol. */
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
                    if (sample.empty) return next();      // nothing measurable, skip
                    sample.name = fileName(spec, baseSeed, sample.index);
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

    function fileName(spec, baseSeed, index) {
        return 'barcode-stress-' + baseSeed.toString(16) + '-' + pad(index + 1, 3) + '.png';
    }

    function buildAnnotation(spec, baseSeed, samples) {
        var totalBarcodes = 0;
        var images = samples.map(function (sample) {
            totalBarcodes += sample.barcodes.length;
            return {
                file: sample.name,
                width: sample.width,
                height: sample.height,
                degradations: describeApplied(sample, spec.degradations),
                barcodes: sample.barcodes.map(function (barcode) {
                    return {
                        text: barcode.text,
                        format: barcode.format,
                        points: barcode.points
                    };
                })
            };
        });
        return {
            format: 'barcode-benchmark/1.0',
            dataset: 'Codepool barcode stress test',
            generated: new Date().toISOString(),
            total_images: images.length,
            total_barcodes: totalBarcodes,
            generator: {
                tool: 'codepool/demos/barcode-qrcode-generator',
                seed: spec.seed,
                seed_hash: baseSeed,
                samples_requested: spec.samples,
                symbols_per_image: spec.symbols,
                symbology: spec.symbology,
                difficulty_factor: spec.difficulty,
                notes: 'Deterministic: the same seed reproduces the same payloads, '
                    + 'symbologies, placements and degradation values. Degradation '
                    + 'values are per image and list only what was actually applied, '
                    + 'most severe first — a value at the undamaged end of its range is '
                    + 'omitted rather than written as a zero. Points are the symbol quad '
                    + 'in the exported image, in pixels.'
                    + (spec.difficulty ? ' A difficulty factor scales every range from its '
                        + 'undamaged end once per image, so the set spans easy to hard.' : '')
            },
            images: images
        };
    }

    /* The conditions that actually shaped one image.
     *
     * Values sitting at the undamaged end of their range are not conditions —
     * they are the absence of one — and listing them spends a table row on
     * saying nothing. What survives is ordered by how far it moved from
     * undamaged, so a reader that truncates the line keeps the part that can
     * explain a miss. */
    function describeApplied(sample, ranges) {
        var out = { inverted: !!sample.inverted };
        var entries = [];

        DEGRADATIONS.forEach(function (degradation) {
            var value = sample.applied[degradation.id];
            if (value === null || value === undefined) return;
            var range = ranges && ranges[degradation.id];
            var severity = severityOf(degradation, range, value);
            /* Under 2% of its own range, a degradation is not there — a JPEG
               quality of 0.991 is "no compression", and nine of those turned one
               row of the benchmark table into eleven wrapped lines of nothing. */
            if (range && severity <= NEUTRAL_TOLERANCE) return;
            entries.push({ id: degradation.id, value: round2(value), severity: severity });
        });

        entries.sort(function (a, b) { return b.severity - a.severity; });
        entries.forEach(function (entry) { out[entry.id] = entry.value; });

        if (sample.cropRequested !== undefined && sample.cropRequested < sample.applied.crop) {
            out.crop_requested = round2(sample.cropRequested);
        }
        if (sample.frameClamped) out.frame_requested = round2(sample.frameRequested);
        if (sample.moduleReduced) out.module_requested = round2(sample.moduleRequested);
        if (sample.applied.difficulty !== undefined && sample.applied.difficulty < 0.999) {
            out.difficulty = round2(sample.applied.difficulty);
        }
        return out;
    }

    function round2(value) {
        return Math.round(value * 100) / 100;
    }

    /* ================================================================== *
     * ZIP (store only)
     *
     * The dataset is one download: images plus annotations.json. PNG is
     * already compressed, so storing the entries costs nothing, and a stored
     * entry needs no inflate step on the reading side.
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
        var c = 0xffffffff;
        for (var i = 0; i < bytes.length; i++) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
        }
        return (c ^ 0xffffffff) >>> 0;
    }

    function utf8(text) {
        if (global.TextEncoder) return new global.TextEncoder().encode(text);
        var out = [];
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code < 0x80) out.push(code);
            else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            else out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
        return new Uint8Array(out);
    }

    /* entries: [{ name, data: Uint8Array }] */
    function buildZip(entries) {
        var now = new Date();
        var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

        var prepared = entries.map(function (entry) {
            return {
                name: utf8(entry.name),
                data: entry.data,
                crc: crc32(entry.data)
            };
        });

        var localSize = 0;
        var centralSize = 0;
        prepared.forEach(function (entry) {
            localSize += 30 + entry.name.length + entry.data.length;
            centralSize += 46 + entry.name.length;
        });
        var total = localSize + centralSize + 22;

        var buffer = new ArrayBuffer(total);
        var view = new DataView(buffer);
        var bytes = new Uint8Array(buffer);
        var offset = 0;
        var offsets = [];

        prepared.forEach(function (entry) {
            offsets.push(offset);
            view.setUint32(offset, 0x04034b50, true);
            view.setUint16(offset + 4, 20, true);      // version needed
            view.setUint16(offset + 6, 0, true);       // flags: names are ASCII
            view.setUint16(offset + 8, 0, true);       // method: store
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

    global.BarcodeStress = {
        DEGRADATIONS: DEGRADATIONS,
        PRESETS: PRESETS,
        SYMBOLOGY_IDS: SYMBOLOGY_IDS,
        FACTS: FACTS,
        MAX_SAMPLES: MAX_SAMPLES,
        MAX_SYMBOLS: MAX_SYMBOLS,
        QUIET_ZONE_MODULES: QUIET_ZONE_MODULES,
        BAR_HEIGHT_MODULES: BAR_HEIGHT_MODULES,
        MIN_VISIBLE: MIN_VISIBLE,
        hashSeed: hashSeed,
        makeRng: makeRng,
        sampleSeed: sampleSeed,
        generateDataset: generateDataset,
        renderSample: renderSample,
        normalizeSpec: normalizeSpec,
        makePayload: makePayload,
        expectedValue: expectedValue,
        /* Exported so the page's preview describes an image with the same rules
           the annotation was written with — which conditions count, and in what
           order. Two formatters would drift, and the one the visitor reads would
           be the wrong one. */
        describeApplied: describeApplied,
        buildZip: buildZip,
        crc32: crc32,
        /* Geometry is exported both ways: the demo does not use it directly, but
           it is the part that has to be right for the ground truth to mean
           anything, so it is exercised by unit tests under plain node. */
        solveQuad: solveQuad,
        multiplyH: multiplyH,
        applyH: applyH,
        rotationAbout: rotationAbout,
        affineInverse: affineInverse,
        /* Exported for the unit tests: the crop maths is what the ground truth
           depends on, so it has to be exercisable without a browser. */
        clipToRect: clipToRect,
        polygonArea: polygonArea
    };
})(typeof window !== 'undefined' ? window : this);
