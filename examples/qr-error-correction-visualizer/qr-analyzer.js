/*
 * QR Analyzer — the inverse of this demo's forward pipeline.
 *
 * The forward side starts from a payload it generated, so it knows every
 * module and can count damage exactly. Given a QR image from anywhere else,
 * nothing about the original is known — but the standard itself still tells
 * us a lot, and Reed-Solomon decoding tells us the rest:
 *
 *   1. Locate the symbol — the caller passes the four corner points the
 *      reader found (Dynamsoft Barcode Reader's location result).
 *   2. Lock the grid — try each version, sample a module matrix through a
 *      perspective transform, and keep the version whose finder patterns and
 *      timing patterns line up. The version is a property of the geometry,
 *      not of the payload.
 *   3. Read the format information — 15 bits stored twice with a BCH(15,5)
 *      code. It survives damage that the payload does not, and it names the
 *      error correction level and the mask. (If both copies are unreadable,
 *      every level/mask combination is tried against step 5.)
 *   4. Rebuild the codewords — unmask the data modules, walk them in the
 *      standard zig-zag order, and reassemble the interleaved codeword
 *      stream. This uses the same placement tables the encoder exposes, so
 *      the forward and reverse walks share one definition of the layout.
 *   5. Run Reed-Solomon decoding — the decoder knows exactly how many
 *      codeword errors it had to repair per block, and whether it ran out of
 *      budget. That count is the honest damage measure for a foreign image:
 *      it does not need the original payload, only the parity the symbol
 *      carries.
 *
 * Everything is synchronous and runs on the sampled matrix, so the whole
 * analysis is a few milliseconds on a normal screenshot.
 *
 * The structural tables (block layout, format code construction, placement
 * order) come from qr-encoder.js — this file never re-declares them.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.QRAnalyzer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ------------------------------------------------------------------ *
     * GF(256), the field QR's Reed-Solomon codes live in. Primitive
     * polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D), same as the encoder's.
     * ------------------------------------------------------------------ */
    var GF_EXP = new Uint8Array(512);
    var GF_LOG = new Uint8Array(256);
    (function () {
        var x = 1;
        for (var i = 0; i < 255; i++) {
            GF_EXP[i] = x;
            GF_LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11D;
        }
        for (i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
    }());

    function gfMul(a, b) {
        if (a === 0 || b === 0) return 0;
        return GF_EXP[GF_LOG[a] + GF_LOG[b]];
    }

    function gfInv(a) {
        /* a === 0 has no inverse; callers never ask for one. */
        return GF_EXP[255 - GF_LOG[a]];
    }

    /* ------------------------------------------------------------------ *
     * Reed-Solomon decoding for a single block.
     *
     * The block is `bytes` = data codewords followed by `ecCount` parity
     * codewords, b[0]..b[n-1] read as a polynomial with b[0] having the
     * highest power. Syndromes S_i = poly(alpha^i) for i = 0..ecCount-1;
     * all-zero means the block is intact. Otherwise Berlekamp-Massey finds
     * the error locator, Chien search finds the error positions, and the
     * magnitudes are solved as a small linear system (the Forney formula in
     * disguise, but easier to check). The corrected block is verified by a
     * fresh syndrome pass — a decoder that cannot verify its own answer
     * must not report one.
     *
     * Returns { ok, corrected, positions } where positions are 0-based
     * indexes into `bytes` (empty when ok and nothing needed repair).
     * ------------------------------------------------------------------ */
    function rsDecodeBlock(bytes, ecCount) {
        var n = bytes.length;
        var synd = new Uint8Array(ecCount);
        var i, j, s, a;

        for (i = 0; i < ecCount; i++) {
            s = 0;
            a = GF_EXP[i];
            for (j = 0; j < n; j++) s = gfMul(s, a) ^ bytes[j];
            synd[i] = s;
        }

        var clean = true;
        for (i = 0; i < ecCount; i++) if (synd[i] !== 0) { clean = false; break; }
        if (clean) return { ok: true, corrected: 0, positions: [] };

        /* Berlekamp-Massey: C(x) is the error locator, degree L = error count. */
        var C = [1];
        var B = [1];
        var L = 0;
        var m = 1;
        var b = 1;
        for (var k = 0; k < ecCount; k++) {
            var d = synd[k];
            for (i = 1; i <= L; i++) {
                if (C[i]) d ^= gfMul(C[i], synd[k - i]);
            }
            if (d === 0) {
                m++;
            } else if (2 * L <= k) {
                var T = C.slice();
                var coef = gfMul(d, gfInv(b));
                for (i = 0; i < B.length; i++) {
                    C[i + m] = (C[i + m] || 0) ^ gfMul(coef, B[i]);
                }
                L = k + 1 - L;
                B = T;
                b = d;
                m = 1;
            } else {
                var coef2 = gfMul(d, gfInv(b));
                for (i = 0; i < B.length; i++) {
                    C[i + m] = (C[i + m] || 0) ^ gfMul(coef2, B[i]);
                }
                m++;
            }
        }

        if (L === 0 || L * 2 > ecCount) return { ok: false, corrected: -1, positions: [] };

        /* Chien search: an error at byte j contributes alpha^(n-1-j), so the
           locator's roots sit at x = alpha^-(n-1-j). A locator of degree L
           must produce exactly L distinct roots or the decode is a lie. */
        var errorPos = [];
        for (j = 0; j < n; j++) {
            var e = (n - 1 - j) % 255;
            var x = GF_EXP[(255 - e) % 255];
            var value = 0;
            var power = 1;
            for (i = 0; i < C.length; i++) {
                if (C[i]) value ^= gfMul(C[i], power);
                power = gfMul(power, x);
            }
            if (value === 0) errorPos.push(j);
        }
        if (errorPos.length !== L) return { ok: false, corrected: -1, positions: [] };

        /* Magnitudes: for i = 0..L-1, S_i = sum_k Y_k * X_k^i with
           X_k = alpha^(n-1-j_k). A tiny Vandermonde system. */
        var mat = [];
        var rhs = [];
        for (i = 0; i < L; i++) {
            var row = new Array(L);
            for (var k2 = 0; k2 < L; k2++) {
                var xk = GF_EXP[(n - 1 - errorPos[k2]) % 255];
                row[k2] = i === 0 ? 1 : GF_EXP[(GF_LOG[xk] * i) % 255];
            }
            mat.push(row);
            rhs.push(synd[i]);
        }
        var mags = solveLinear(mat, rhs);
        if (!mags) return { ok: false, corrected: -1, positions: [] };

        var fixed = bytes.slice();
        for (i = 0; i < L; i++) fixed[errorPos[i]] ^= mags[i];

        /* Verify: the corrected block must have all-zero syndromes. */
        for (i = 0; i < ecCount; i++) {
            s = 0;
            a = GF_EXP[i];
            for (j = 0; j < n; j++) s = gfMul(s, a) ^ fixed[j];
            if (s !== 0) return { ok: false, corrected: -1, positions: [] };
        }

        return { ok: true, corrected: L, positions: errorPos, fixed: fixed };
    }

    /* Erasure decoding: the corrupted positions are KNOWN (from a reference
       original), so each one costs one parity symbol instead of two. A block
       with e parity codewords corrects e erasures — double the ⌊e/2⌋ error
       budget. The unknowns are the e error magnitudes; the syndromes give a
       Vandermonde system in them, which solveLinear already knows how to
       crack. If unknown errors lurk outside the erasure list the verification
       below fails and the caller falls back to failure. */
    function rsDecodeBlockErasure(bytes, ecCount, erasures) {
        var n = bytes.length;
        var e = erasures.length;
        if (!e || e > ecCount) return { ok: false, corrected: -1, positions: [] };

        var synd = new Uint8Array(ecCount);
        var i, j, s, a;
        for (i = 0; i < ecCount; i++) {
            s = 0;
            a = GF_EXP[i];
            for (j = 0; j < n; j++) s = gfMul(s, a) ^ bytes[j];
            synd[i] = s;
        }
        var clean = true;
        for (i = 0; i < ecCount; i++) if (synd[i] !== 0) { clean = false; break; }
        if (clean) return { ok: true, corrected: 0, positions: [] };

        var mat = [];
        var rhs = [];
        for (i = 0; i < e; i++) {
            var row = new Array(e);
            for (var k = 0; k < e; k++) {
                var x = GF_EXP[(n - 1 - erasures[k]) % 255];
                row[k] = i === 0 ? 1 : GF_EXP[(GF_LOG[x] * i) % 255];
            }
            mat.push(row);
            rhs.push(synd[i]);
        }
        var mags = solveLinear(mat, rhs);
        if (!mags) return { ok: false, corrected: -1, positions: [] };

        var fixed = bytes.slice();
        for (var k2 = 0; k2 < e; k2++) fixed[erasures[k2]] ^= mags[k2];

        /* The corrected block must have all-zero syndromes — this is what
           rejects the case where damage also lurks outside the erasure list. */
        for (i = 0; i < ecCount; i++) {
            s = 0;
            a = GF_EXP[i];
            for (j = 0; j < n; j++) s = gfMul(s, a) ^ fixed[j];
            if (s !== 0) return { ok: false, corrected: -1, positions: [] };
        }

        return { ok: true, corrected: e, positions: erasures.slice(), fixed: fixed, erased: true };
    }

    /* Gaussian elimination over GF(256); returns null when singular. */
    function solveLinear(mat, rhs) {
        var n = rhs.length;
        var A = mat.map(function (row) { return row.slice(); });
        var b = rhs.slice();
        var i, j, k;

        for (i = 0; i < n; i++) {
            var pivot = -1;
            for (k = i; k < n; k++) if (A[k][i] !== 0) { pivot = k; break; }
            if (pivot < 0) return null;
            if (pivot !== i) {
                var t = A[pivot]; A[pivot] = A[i]; A[i] = t;
                var tb = b[pivot]; b[pivot] = b[i]; b[i] = tb;
            }
            var inv = gfInv(A[i][i]);
            for (j = i; j < n; j++) A[i][j] = gfMul(A[i][j], inv);
            b[i] = gfMul(b[i], inv);
            for (k = 0; k < n; k++) {
                if (k === i || A[k][i] === 0) continue;
                var f = A[k][i];
                for (j = i; j < n; j++) A[k][j] ^= gfMul(f, A[i][j]);
                b[k] ^= gfMul(f, b[i]);
            }
        }
        return b;
    }

    /* ------------------------------------------------------------------ *
     * Format information. 15 bits, stored twice, protected by the BCH(15,5)
     * code the encoder already builds (`BarcodeQR.formatBits`). At most
     * three bit errors per copy are correctable; try all 32 meanings and
     * keep the closest.
     * ------------------------------------------------------------------ */
    var EC_LETTERS = ['M', 'L', 'H', 'Q'];   /* 2-bit values 0..3 */

    /* Bit positions come from the encoder's writeFormatBits — the single
       definition of where the two copies live on the matrix. */
    function readFormatCandidateBits(matrix, size) {
        var copy1 = 0;
        var copy2 = 0;
        var i;
        for (i = 0; i <= 5; i++) copy1 |= matrix[i][8] << i;
        copy1 |= matrix[7][8] << 6;
        copy1 |= matrix[8][8] << 7;
        copy1 |= matrix[8][7] << 8;
        for (i = 9; i < 15; i++) copy1 |= matrix[8][14 - i] << i;
        for (i = 0; i < 8; i++) copy2 |= matrix[8][size - 1 - i] << i;
        for (i = 8; i < 15; i++) copy2 |= matrix[size - 15 + i][8] << i;
        return [copy1, copy2];
    }

    function popcount(v) {
        var n = 0;
        while (v) { n += v & 1; v >>= 1; }
        return n;
    }

    function readFormat(matrix, size, BarcodeQR) {
        var copies = readFormatCandidateBits(matrix, size);
        var best = null;
        for (var levelIdx = 0; levelIdx < 4; levelIdx++) {
            for (var mask = 0; mask < 8; mask++) {
                var code = BarcodeQR.formatBits(EC_LETTERS[levelIdx], mask);
                var d1 = popcount(copies[0] ^ code);
                var d2 = popcount(copies[1] ^ code);
                var score = Math.min(d1, d2);
                if (!best || score < best.distance) {
                    best = { ecLevel: EC_LETTERS[levelIdx], mask: mask, distance: score, d1: d1, d2: d2 };
                }
            }
        }
        /* The code corrects three errors per copy, but a SINGLE copy within
           three of some codeword happens for well over a third of random
           15-bit words — so both copies must corroborate: the best copy
           within three, and neither wildly far off. Without this, a false
           grid lock on noise could "read" a level that is not there. */
        if (best && best.distance <= 3 && best.d1 + best.d2 <= 8) return best;
        return null;
    }

    /* Version information, versions 7 and up: 18 bits, BCH(18,6), two copies. */
    function readVersion(matrix, size, BarcodeQR) {
        var copy1 = 0;
        var copy2 = 0;
        for (var i = 0; i < 18; i++) {
            var a = size - 11 + (i % 3);
            var b = Math.floor(i / 3);
            copy1 |= matrix[b][a] << i;
            copy2 |= matrix[a][b] << i;
        }
        var best = null;
        for (var v = 7; v <= 40; v++) {
            var code = BarcodeQR.versionBits(v);
            var d = Math.min(popcount(copy1 ^ code), popcount(copy2 ^ code));
            if (!best || d < best.distance) best = { version: v, distance: d };
        }
        if (best && best.distance <= 3) return best;
        return null;
    }

    /* ------------------------------------------------------------------ *
     * Geometry: a homography from module space (0..size) to image pixels,
     * solved from the four corner correspondences.
     * ------------------------------------------------------------------ */
    var CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];   /* unit square, clockwise */

    function solveHomography(quad, size) {
        /* quad: four image points, in the order TL, TR, BR, BL; module-space
           targets are the same four corners scaled by `size`. */
        var A = [];
        var b = [];
        for (var i = 0; i < 4; i++) {
            var X = CORNERS[i][0] * size;
            var Y = CORNERS[i][1] * size;
            var u = quad[i][0];
            var v = quad[i][1];
            A.push([X, Y, 1, 0, 0, 0, -X * u, -Y * u]);
            b.push(u);
            A.push([0, 0, 0, X, Y, 1, -X * v, -Y * v]);
            b.push(v);
        }
        var h = solveLinearReal(A, b);
        if (!h) return null;
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    /* Real-valued Gaussian elimination for the 8x8 homography system. */
    function solveLinearReal(A, b) {
        var n = b.length;
        var M = A.map(function (row) { return row.slice(); });
        var v = b.slice();
        var i, j, k;
        for (i = 0; i < n; i++) {
            var pivot = i;
            for (k = i + 1; k < n; k++) {
                if (Math.abs(M[k][i]) > Math.abs(M[pivot][i])) pivot = k;
            }
            if (Math.abs(M[pivot][i]) < 1e-12) return null;
            if (pivot !== i) {
                var t = M[pivot]; M[pivot] = M[i]; M[i] = t;
                var tv = v[pivot]; v[pivot] = v[i]; v[i] = tv;
            }
            for (k = i + 1; k < n; k++) {
                var f = M[k][i] / M[i][i];
                if (f === 0) continue;
                for (j = i; j < n; j++) M[k][j] -= f * M[i][j];
                v[k] -= f * v[i];
            }
        }
        var x = new Array(n);
        for (i = n - 1; i >= 0; i--) {
            var s = v[i];
            for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
            x[i] = s / M[i][i];
        }
        return x;
    }

    function project(H, x, y) {
        var w = H[6] * x + H[7] * y + 1;
        return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
    }

    /* Bilinear luminance read with edge clamping. `rgba` is RGBA bytes. */
    function luminanceAt(rgba, width, height, x, y) {
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x > width - 1) x = width - 1;
        if (y > height - 1) y = height - 1;
        var x0 = Math.floor(x);
        var y0 = Math.floor(y);
        var x1 = Math.min(x0 + 1, width - 1);
        var y1 = Math.min(y0 + 1, height - 1);
        var fx = x - x0;
        var fy = y - y0;
        var p00 = ((y0 * width) + x0) * 4;
        var p10 = ((y0 * width) + x1) * 4;
        var p01 = ((y1 * width) + x0) * 4;
        var p11 = ((y1 * width) + x1) * 4;
        function lum(p) { return (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000; }
        var top = lum(p00) * (1 - fx) + lum(p10) * fx;
        var bottom = lum(p01) * (1 - fx) + lum(p11) * fx;
        return top * (1 - fy) + bottom * fy;
    }

    /* ------------------------------------------------------------------ *
     * Version lock: sample each candidate version and score how well the
     * finder patterns (three corners) and timing patterns (row/col 6) come
     * out. The right version scores near 1.0 on both; a wrong one turns the
     * periodic patterns into noise.
     * ------------------------------------------------------------------ */
    function finderScoreOf(matrix, size, BarcodeQR) {
        var placements = [[0, 0], [0, size - 7], [size - 7, 0]];
        var matches = 0;
        var total = 0;
        for (var p = 0; p < 3; p++) {
            for (var rr = 0; rr < 7; rr++) {
                for (var cc = 0; cc < 7; cc++) {
                    var expected = BarcodeQR.finderValue(rr, cc);
                    if (matrix[placements[p][0] + rr][placements[p][1] + cc] === expected) matches++;
                    total++;
                }
            }
        }
        return matches / total;
    }

    function timingScoreOf(matrix, size) {
        var changes = 0;
        var pairs = 0;
        var i;
        for (i = 8; i < size - 9; i++) {
            if (matrix[6][i] !== matrix[6][i + 1]) changes++;
            pairs++;
            if (matrix[i][6] !== matrix[i + 1][6]) changes++;
            pairs++;
        }
        return pairs ? changes / pairs : 0;
    }

    function sampleWithTransform(rgba, width, height, H, size, threshold) {
        var matrix = [];
        for (var r = 0; r < size; r++) {
            var row = new Uint8Array(size);
            for (var c = 0; c < size; c++) {
                var pt = project(H, c + 0.5, r + 0.5);
                row[c] = luminanceAt(rgba, width, height, pt[0], pt[1]) < threshold ? 1 : 0;
            }
            matrix.push(row);
        }
        return matrix;
    }

    /* A quick min/max threshold for the scoring pass — finder patterns give
       both extremes in any decent image. */
    function crudeThreshold(rgba, width, height, H, size) {
        var lo = 255;
        var hi = 0;
        var step = size > 60 ? 2 : 1;   /* large versions: sampling every other module is plenty */
        for (var r = 0; r < size; r += step) {
            for (var c = 0; c < size; c += step) {
                var pt = project(H, c + 0.5, r + 0.5);
                var lum = luminanceAt(rgba, width, height, pt[0], pt[1]);
                if (lum < lo) lo = lum;
                if (lum > hi) hi = lum;
            }
        }
        return { threshold: (lo + hi) / 2, contrast: hi - lo };
    }

    /* Try every cyclic rotation of the four given corners (both directions):
       the reader's point order is usually TL,TR,BR,BL, but nothing in the
       protocol promises it, and a wrong order is caught by the scoring. */
    function rotations(points) {
        var out = [];
        for (var dir = 0; dir < 2; dir++) {
            var pts = dir === 0 ? points.slice() : points.slice().reverse();
            for (var i = 0; i < 4; i++) out.push(pts.slice(i).concat(pts.slice(0, i)));
        }
        return out;
    }

    function edgeLength(quad) {
        var total = 0;
        for (var i = 0; i < 4; i++) {
            var a = quad[i];
            var b = quad[(i + 1) % 4];
            total += Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
        }
        return total / 4;
    }

    /* ------------------------------------------------------------------ *
     * Finder-pattern locator — the fallback for images the reader cannot
     * decode at all. A reader only reports a location when it has also
     * decoded the symbol, so beyond-repair images arrive here with no
     * points. The finder patterns themselves are three dark rings on a
     * light field; scanning rows for the standard 1:1:3:1:1 run pattern
     * finds them even when nothing inside the symbol is readable, and the
     * three centers fix the grid up to the fourth corner. The version-lock
     * scoring downstream then decides whether the located quad is credible.
     * ------------------------------------------------------------------ */

    function grayFromRgba(rgba, width, height) {
        var gray = new Uint8Array(width * height);
        for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
            gray[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
        }
        return gray;
    }

    /* Otsu's method on a sampled histogram — black/white split for the scan.
       Tie note: on a perfectly bimodal image the between-class variance is
       constant for every threshold between the two modes; the first
       maximizer then names the dark mode itself, so pixels are classified
       with `<= threshold` (see the callers) rather than `< threshold`. */
    function otsuThreshold(gray) {
        var hist = new Float64Array(256);
        var step = Math.max(1, Math.floor(gray.length / 300000));
        var n = 0;
        for (var i = 0; i < gray.length; i += step) { hist[gray[i]]++; n++; }
        var sum = 0;
        for (i = 0; i < 256; i++) sum += i * hist[i];
        var sumB = 0;
        var wB = 0;
        var best = 0;
        var bestVar = -1;
        for (i = 0; i < 256; i++) {
            wB += hist[i];
            if (wB === 0) continue;
            var wF = n - wB;
            if (wF === 0) break;
            sumB += i * hist[i];
            var mB = sumB / wB;
            var mF = (sum - sumB) / wF;
            var between = wB * wF * (mB - mF) * (mB - mF);
            if (between > bestVar) { bestVar = between; best = i; }
        }
        return best;
    }

    /* 1:1:3:1:1 test for five consecutive run lengths. */
    function finderRatioOk(runs) {
        var total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
        if (total < 7) return 0;
        var unit = total / 7;
        var maxDev = 0;
        var dev;
        dev = Math.abs(runs[0] - unit); if (dev > maxDev) maxDev = dev;
        dev = Math.abs(runs[1] - unit); if (dev > maxDev) maxDev = dev;
        dev = Math.abs(runs[2] - 3 * unit); if (dev > maxDev) maxDev = dev;
        dev = Math.abs(runs[3] - unit); if (dev > maxDev) maxDev = dev;
        dev = Math.abs(runs[4] - unit); if (dev > maxDev) maxDev = dev;
        return maxDev <= unit * 0.5 ? unit : 0;
    }

    function locateSymbol(rgba, width, height) {
        var gray = grayFromRgba(rgba, width, height);
        var thr = otsuThreshold(gray);

        /* Row scan for horizontal finder crossings. */
        var candidates = [];
        var y, i, k;
        var rowStep = Math.max(1, Math.round(height / 400));
        for (y = 0; y < height; y += rowStep) {
            var hits = [];
            var runs = [0, 0, 0, 0, 0];
            var ri = 0;
            var last = -1;
            var runStart = 0;
            for (i = 0; i < width; i++) {
                var dark = gray[y * width + i] <= thr ? 1 : 0;
                if (last < 0) last = dark;
                if (dark === last) continue;
                var len = i - runStart;
                if (ri < 5) runs[ri++] = len;
                else {
                    runs[0] = runs[1]; runs[1] = runs[2]; runs[2] = runs[3]; runs[3] = runs[4]; runs[4] = len;
                }
                if (ri === 5) {
                    var unit = finderRatioOk(runs);
                    if (unit) hits.push({ x: i - runs[4] - runs[3] - runs[2] / 2, unit: unit });
                }
                runStart = i;
                last = dark;
            }

            for (k = 0; k < hits.length; k++) {
                /* Vertical confirmation at the hit — a real finder center
                   shows the same 1:1:3:1:1 pattern down its column. */
                var x = Math.round(hits[k].x);
                if (x < 0 || x >= width) continue;
                var vertical = verticalCenter(gray, width, height, x, y, thr, hits[k].unit);
                if (!vertical) continue;
                candidates.push({ x: hits[k].x, y: vertical.pos, unit: (hits[k].unit + vertical.unit) / 2, hits: 1 });
            }
        }

        /* Cluster nearby candidates (the same finder is crossed by several rows). */
        var clusters = [];
        for (i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var merged = false;
            for (k = 0; k < clusters.length; k++) {
                var cl = clusters[k];
                if (Math.abs(cl.x - c.x) < cl.unit * 2 && Math.abs(cl.y - c.y) < cl.unit * 2) {
                    cl.x = (cl.x * cl.hits + c.x) / (cl.hits + 1);
                    cl.y = (cl.y * cl.hits + c.y) / (cl.hits + 1);
                    cl.unit = Math.max(cl.unit, c.unit);
                    cl.hits++;
                    merged = true;
                    break;
                }
            }
            if (!merged) clusters.push({ x: c.x, y: c.y, unit: c.unit, hits: c.hits });
        }

        clusters.sort(function (a, b) { return b.hits - a.hits; });
        clusters = clusters.slice(0, 12);

        /* Find a triple with the right geometry: two equal sides meeting at
           a right angle (the corner finder), hypotenuse sqrt(2) longer. */
        var best = null;
        for (i = 0; i < clusters.length - 2; i++) {
            for (k = i + 1; k < clusters.length - 1; k++) {
                for (var j = k + 1; j < clusters.length; j++) {
                    var a = clusters[i];
                    var b = clusters[k];
                    var cc = clusters[j];
                    var dAB = dist(a, b);
                    var dAC = dist(a, cc);
                    var dBC = dist(b, cc);
                    /* name the corner (opposite the longest side) */
                    var cornerA = a, sideB = b, sideC = cc;
                    var d1 = dAB, d2 = dAC, hyp = dBC;
                    if (dBC >= dAB && dBC >= dAC) { cornerA = a; sideB = b; sideC = cc; d1 = dAB; d2 = dAC; hyp = dBC; }
                    else if (dAC >= dAB && dAC >= dBC) { cornerA = b; sideB = a; sideC = cc; d1 = dAB; d2 = dBC; hyp = dAC; }
                    else { cornerA = cc; sideB = a; sideC = b; d1 = dAC; d2 = dBC; hyp = dAB; }
                    var legs = [d1, d2];
                    legs.sort(function (p, q) { return p - q; });
                    if (legs[0] < 14) continue;
                    if (Math.abs(legs[0] - legs[1]) > legs[0] * 0.25) continue;
                    if (Math.abs(hyp - legs[0] * Math.SQRT2) > legs[0] * 0.2) continue;
                    var units = [cornerA.unit, sideB.unit, sideC.unit];
                    var unitMin = Math.min(units[0], units[1], units[2]);
                    var unitMax = Math.max(units[0], units[1], units[2]);
                    if (unitMax > unitMin * 1.6) continue;
                    var quality = cornerA.hits + sideB.hits + sideC.hits;
                    if (!best || quality > best.quality) {
                        best = { corner: cornerA, b: sideB, c: sideC, quality: quality, unit: (unitMin + unitMax) / 2 };
                    }
                }
            }
        }
        if (!best) return null;

        var A = best.corner;
        var B = best.b;
        var C = best.c;
        /* With y pointing down, cross((B-A),(C-A)) > 0 puts B on the TR side
           for a TL corner — orientation-preserving regardless of rotation. */
        var v1 = [B.x - A.x, B.y - A.y];
        var v2 = [C.x - A.x, C.y - A.y];
        if (v1[0] * v2[1] - v1[1] * v2[0] < 0) {
            var swap = B; B = C; C = swap;
            v1 = [B.x - A.x, B.y - A.y];
            v2 = [C.x - A.x, C.y - A.y];
        }
        var len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
        var len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
        if (len1 < 14 || len2 < 14) return null;
        var u = [v1[0] / len1, v1[1] / len1];
        var w = [v2[0] / len2, v2[1] / len2];

        var pitch = best.unit;   /* finderRatioOk returns the per-module width */
        if (pitch < 1.2) return null;
        /* The two centre-to-centre spans cover size - 7 modules. */
        var version = Math.round(((len1 + len2) / 2 / pitch - 10) / 4);
        if (version < 1) version = 1;
        if (version > 40) version = 40;
        var size = 17 + 4 * version;
        var p = (len1 + len2) / 2 / (size - 7);   /* refine pitch from the span */

        function corner(a1, a2) {
            return [
                A.x + a1 * u[0] + a2 * w[0],
                A.y + a1 * u[1] + a2 * w[1]
            ];
        }
        return [
            corner(-3.5 * p, -3.5 * p),
            corner((size - 3.5) * p, -3.5 * p),
            corner((size - 3.5) * p, (size - 3.5) * p),
            corner(-3.5 * p, (size - 3.5) * p)
        ];
    }

    function dist(a, b) {
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /* Count consecutive pixels of one colour down column x, stepping `dir`.
       Returns null when the walk runs off the image — a truncated run cannot
       be measured and the pattern must be whole to count. */
    function columnRun(gray, width, x, start, dir, thr, wantDark, height) {
        var count = 0;
        var p = start;
        while (p >= 0 && p < height) {
            var dark = gray[p * width + x] <= thr ? 1 : 0;
            if (dark === (wantDark ? 1 : 0)) { count++; p += dir; }
            else break;
        }
        if (p < 0 || p >= height) return null;
        return { count: count, end: p };
    }

    /* Vertical confirmation at (x, y), where y came from a horizontal hit row
       somewhere across the finder's centre band. Walking both directions from
       y recovers the full vertical cross — the two half-runs of the centre
       (3-unit) run join into one — and the same 1:1:3:1:1 test applies. The
       pattern's vertical centre then biases y to the true finder centre. */
    function verticalCenter(gray, width, height, x, y, thr, expectedUnit) {
        var upMid = columnRun(gray, width, x, y, -1, thr, true, height);
        if (!upMid) return null;
        var upLight = columnRun(gray, width, x, upMid.end, -1, thr, false, height);
        if (!upLight) return null;
        var upBorder = columnRun(gray, width, x, upLight.end, -1, thr, true, height);
        if (!upBorder) return null;

        var downMid = columnRun(gray, width, x, y + 1, 1, thr, true, height);
        if (!downMid) return null;
        var downLight = columnRun(gray, width, x, downMid.end, 1, thr, false, height);
        if (!downLight) return null;
        var downBorder = columnRun(gray, width, x, downLight.end, 1, thr, true, height);
        if (!downBorder) return null;

        var pattern = [
            upBorder.count,
            upLight.count,
            upMid.count + downMid.count,
            downLight.count,
            downBorder.count
        ];
        var unit = finderRatioOk(pattern);
        if (!unit) return null;
        if (unit < expectedUnit * 0.5 || unit > expectedUnit * 2) return null;
        var centerY = y + (downMid.count - upMid.count) / 2;
        return { pos: centerY, unit: unit };
    }

    function lockGrid(rgba, width, height, points, BarcodeQR) {
        var quads = rotations(points);
        var overall = null;
        for (var q = 0; q < quads.length; q++) {
            var quad = quads[q];
            var edge = edgeLength(quad);
            if (edge < 21) continue;
            var maxSize = Math.min(177, Math.floor(edge / 1.5));
            for (var version = 1; version <= 40; version++) {
                var size = 17 + 4 * version;
                if (size > maxSize) break;
                var H = solveHomography(quad, size);
                if (!H) continue;
                var rough = crudeThreshold(rgba, width, height, H, size);
                if (rough.contrast < 40) continue;
                var matrix = sampleWithTransform(rgba, width, height, H, size, rough.threshold);
                var fs = finderScoreOf(matrix, size, BarcodeQR);
                if (fs < 0.82) continue;
                var ts = timingScoreOf(matrix, size);
                var score = fs * 0.7 + ts * 0.3;
                /* Real symbols score well on both patterns; random image
                   structures that happen to fit the run lengths must not
                   count as a lock. */
                if (score < 0.78) continue;
                if (!overall || score > overall.score) {
                    overall = { version: version, size: size, quad: quad, H: H, score: score, fs: fs, ts: ts };
                }
            }
            /* The first corner rotation that locks with a near-perfect score
               is trustworthy; anything less and the remaining rotations get
               their chance before the best candidate wins. */
            if (overall && overall.fs >= 0.98 && overall.ts >= 0.95) break;
        }
        return overall;
    }

    /* ------------------------------------------------------------------ *
     * Codeword rebuild. The zig-zag walk mirrors the encoder's
     * placeCodewords exactly (same loop, same column skip); the bit-order
     * and mask conventions above it are fixed by the standard.
     * ------------------------------------------------------------------ */
    function zigzagCells(size, isDataCell) {
        var cells = [];
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            var upward = ((right + 1) & 2) === 0;
            for (var vert = 0; vert < size; vert++) {
                for (var col = 0; col < 2; col++) {
                    var c = right - col;
                    var r = upward ? size - 1 - vert : vert;
                    if (isDataCell(r, c)) cells.push([r, c]);
                }
            }
        }
        return cells;
    }

    function masked(mask, r, c) {
        switch (mask) {
            case 0: return ((r + c) % 2) === 0;
            case 1: return (r % 2) === 0;
            case 2: return (c % 3) === 0;
            case 3: return ((r + c) % 3) === 0;
            case 4: return ((Math.floor(r / 2) + Math.floor(c / 3)) % 2) === 0;
            case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
            case 6: return (((r * c) % 2 + (r * c) % 3) % 2) === 0;
            case 7: return (((r + c) % 2 + (r * c) % 3) % 2) === 0;
        }
        return false;
    }

    /* Read the interleaved codeword stream out of a sampled matrix, and
       remember which modules carry which stream index (for overlays). */
    function readCodewords(matrix, size, mask, functionMask) {
        var cells = zigzagCells(size, function (r, c) { return functionMask[r][c] === 0; });
        var bytes = [];
        var byte = 0;
        var cellsOf = [];
        for (var i = 0; i < cells.length; i++) {
            var r = cells[i][0];
            var c = cells[i][1];
            var bit = matrix[r][c] ^ (masked(mask, r, c) ? 1 : 0);
            byte = (byte << 1) | bit;
            var byteIndex = Math.floor(i / 8);
            if (i % 8 === 7) {
                bytes.push(byte);
                byte = 0;
            }
            if (!cellsOf[byteIndex]) cellsOf[byteIndex] = [];
            cellsOf[byteIndex].push([r, c]);
        }
        return { bytes: bytes, cellsOf: cellsOf };
    }

    /* For each block, the stream indexes it owns, in its own order — the
       inverse of the encoder's interleaving. */
    function blockStreamIndexes(st) {
        var perBlock = [];
        for (var b = 0; b < st.numBlocks; b++) {
            var idx = [];
            for (var k = 0; k < st.shortLength; k++) idx.push(k * st.numBlocks + b);
            if (b >= st.numShort) idx.push(st.shortLength * st.numBlocks + (b - st.numShort));
            for (k = 0; k < st.ecPerBlock; k++) idx.push(st.dataCodewords + k * st.numBlocks + b);
            perBlock.push(idx);
        }
        return perBlock;
    }

    /* ------------------------------------------------------------------ *
     * The analysis itself.
     *
     * Input: { rgba, width, height, points } — points are the four corner
     * coordinates the reader reported for the symbol, in image pixels.
     * Output: a report object; see README for the fields.
     * ------------------------------------------------------------------ */
    var structureCache = {};

    function structuralMaps(version, ecLevel, BarcodeQR) {
        var key = version + '/' + ecLevel;
        if (!structureCache[key]) {
            /* Placement never depends on the payload — only on the version
               and level — so a minimal encode gives the exact same layout
               the original symbol used. */
            var enc = BarcodeQR.encode('A', { version: version, ecLevel: ecLevel, mask: 0 });
            structureCache[key] = {
                placement: enc.placement,
                functionMask: enc.functionMask,
                size: enc.size
            };
        }
        return structureCache[key];
    }

    function analyze(input, BarcodeQR, reference) {
        BarcodeQR = BarcodeQR || (typeof window !== 'undefined' ? window.BarcodeQR : null);
        if (!BarcodeQR) return { reason: 'no-encoder' };

        var rgba = input.rgba;
        var width = input.width;
        var height = input.height;

        /* The reader only reports a location when it has decoded the symbol,
           so images beyond repair arrive without points — locate them by
           their finder patterns instead. If supplied points fail to lock,
           the finder locator gets a turn as well. */
        var locatedBy = 'reader';
        var points = input.points && input.points.length === 4 ? input.points : null;
        if (!points) {
            points = locateSymbol(rgba, width, height);
            locatedBy = 'finder';
            if (!points) return { reason: 'no-grid', locatedBy: 'finder' };
        }

        var lock = lockGrid(rgba, width, height, points, BarcodeQR);
        if (!lock && locatedBy === 'reader') {
            var alt = locateSymbol(rgba, width, height);
            if (alt) {
                points = alt;
                locatedBy = 'finder';
                lock = lockGrid(rgba, width, height, points, BarcodeQR);
            }
        }
        if (!lock) return { reason: 'no-grid', locatedBy: locatedBy };

        /* Final sampling pass: five probes per module (centre plus the four
           diagonals) so a scratch across a module centre does not flip it
           on its own; the threshold is calibrated from the finder patterns,
           whose values the standard fixes. */
        var size = lock.size;
        var H = lock.H;
        var darkSum = 0;
        var darkN = 0;
        var lightSum = 0;
        var lightN = 0;
        var finderAt = [[0, 0], [0, size - 7], [size - 7, 0]];
        for (var p = 0; p < 3; p++) {
            for (var rr = 0; rr < 7; rr++) {
                for (var cc = 0; cc < 7; cc++) {
                    var expected = BarcodeQR.finderValue(rr, cc);
                    var pt = project(H, finderAt[p][1] + cc + 0.5, finderAt[p][0] + rr + 0.5);
                    var lum = luminanceAt(rgba, width, height, pt[0], pt[1]);
                    if (expected === 1) { darkSum += lum; darkN++; }
                    else { lightSum += lum; lightN++; }
                }
            }
        }
        var darkMean = darkSum / Math.max(darkN, 1);
        var lightMean = lightSum / Math.max(lightN, 1);
        var threshold = (darkMean + lightMean) / 2;
        var contrast = lightMean - darkMean;
        if (contrast < 30) return { reason: 'low-contrast', version: lock.version };

        var matrix = [];
        var probes = [[0.5, 0.5], [0.22, 0.22], [0.22, 0.78], [0.78, 0.22], [0.78, 0.78]];
        for (var r = 0; r < size; r++) {
            var row = new Uint8Array(size);
            for (var c = 0; c < size; c++) {
                var sum = 0;
                for (var k = 0; k < probes.length; k++) {
                    var q = project(H, c + probes[k][0], r + probes[k][1]);
                    sum += luminanceAt(rgba, width, height, q[0], q[1]);
                }
                row[c] = (sum / probes.length) < threshold ? 1 : 0;
            }
            matrix.push(row);
        }

        var format = readFormat(matrix, size, BarcodeQR);
        var versionInfo = size >= 45 ? readVersion(matrix, size, BarcodeQR) : null;

        var report = {
            /* Default verdict: nothing has proved this is a QR code yet.
               Only a read format field or a verified decode upgrades it. */
            reason: 'no-grid',
            version: lock.version,
            size: size,
            locatedBy: locatedBy,
            ecLevel: format ? format.ecLevel : null,
            mask: format ? format.mask : null,
            levelSource: format ? 'format' : null,
            formatDistance: format ? format.distance : null,
            versionInfo: versionInfo,
            modulePx: edgeLength(lock.quad) / size,
            contrast: Math.round(contrast),
            finderScore: lock.fs,
            timingScore: lock.ts,
            quad: lock.quad,
            matrix: matrix,
            H: project.bind(null, H)
        };

        /* Decode every (level, mask) candidate when the format field cannot
           be trusted. Wrong parameters virtually never produce a block that
           decodes and verifies, so a verified decode is its own proof. */
        var candidates;
        if (format) {
            candidates = [{ ecLevel: format.ecLevel, mask: format.mask }];
        } else {
            candidates = [];
            for (var li = 0; li < EC_LETTERS.length; li++) {
                for (var maskId = 0; maskId < 8; maskId++) {
                    candidates.push({ ecLevel: EC_LETTERS[li], mask: maskId });
                }
            }
        }

        /* A trusted reference original — the page still holds the symbol it
           generated. Where the sampled grid disagrees with it, those cells
           become erasures: Reed-Solomon then repairs each for ONE parity
           symbol instead of two, doubling the budget. The reference is only
           accepted when it plausibly IS this symbol — a different QR would
           disagree on about half the modules. */
        var refDiff = null;
        if (reference && reference.matrix && reference.matrix.length === size) {
            var refCells = [];
            for (var rr2 = 0; rr2 < size; rr2++) {
                for (var cc2 = 0; cc2 < size; cc2++) {
                    if (matrix[rr2][cc2] !== reference.matrix[rr2][cc2]) refCells.push([rr2, cc2]);
                }
            }
            if (refCells.length <= size * size * 0.25) refDiff = refCells;
        }

        for (var ci = 0; ci < candidates.length; ci++) {
            var attempt = runDecode(candidates[ci].ecLevel, candidates[ci].mask, matrix, size, BarcodeQR, refDiff);
            if (!attempt) continue;
            var verified = attempt.failedBlocks.length === 0;
            /* With known format information the single candidate is the
               standard's own answer, decode or not. Without it, only a
               candidate whose blocks decode and verify may be accepted —
               otherwise the first wrong combination would ``win''. */
            if (!format && !verified) continue;
            report.ecLevel = candidates[ci].ecLevel;
            report.mask = candidates[ci].mask;
            report.levelSource = format ? 'format' : 'brute-force';
            report.blocks = attempt.blocks;
            report.totalCorrected = attempt.totalCorrected;
            report.totalBudget = attempt.totalBudget;
            report.failedBlocks = attempt.failedBlocks;
            report.correctedCells = attempt.correctedCells;
            report.correctedStreamIndexes = attempt.correctedStreamIndexes;
            report.totalCodewords = attempt.totalCodewords;
            report.damageCells = attempt.damageCells;
            report.damageModules = attempt.damageModules;
            report.damageTotal = attempt.damageTotal;
            report.corruptedLowerBound = attempt.corruptedLowerBound;
            report.erasureCount = attempt.erasureCount;
            report.functionDamage = attempt.functionDamage;
            report.payload = attempt.payload;
            report.cellQuads = attempt.correctedCells.map(function (cell) {
                return cellQuad(report.H, cell[0], cell[1]);
            });
            report.damageQuads = attempt.damageCells.map(function (cell) {
                return cellQuad(report.H, cell[0], cell[1]);
            });
            report.reason = verified ? (attempt.erasureCount > 0 ? 'repaired' : 'decoded') : 'beyond-repair';
            return report;
        }

        /* Grid locked but nothing decodes: still valuable — the symbol
           exceeded every budget its own format could name. */
        return report;
    }

    function cellQuad(H, r, c) {
        return [
            H(c, r), H(c + 1, r), H(c + 1, r + 1), H(c, r + 1)
        ];
    }

    function runDecode(ecLevel, mask, matrix, size, BarcodeQR, refCells) {
        var version = versionOf(size);
        var enc = structuralMaps(version, ecLevel, BarcodeQR);
        if (enc.size !== size) return null;
        var st = BarcodeQR.blockStructure(version, ecLevel);

        var stream = readCodewords(matrix, size, mask, enc.functionMask);
        if (stream.bytes.length !== st.totalCodewords) return null;

        var perBlock = blockStreamIndexes(st);
        var blocks = [];
        var failed = [];
        var totalCorrected = 0;
        var totalBudget = 0;
        var correctedCells = [];
        var correctedStreamIndexes = [];
        var erasureCount = 0;
        var functionDamage = 0;

        /* Reference diffs arrive as cells. Cells carrying a codeword become
           erasures; cells on function patterns are counted separately —
           parity cannot repair those. */
        var erasuresByBlock = null;
        var refEncodingCells = null;
        if (refCells && refCells.length) {
            refEncodingCells = [];
            erasuresByBlock = [];
            for (var rb = 0; rb < st.numBlocks; rb++) erasuresByBlock.push([]);
            var blockOfStream = {};
            for (rb = 0; rb < st.numBlocks; rb++) {
                var idxMap = perBlock[rb];
                for (var k3 = 0; k3 < idxMap.length; k3++) blockOfStream[idxMap[k3]] = { block: rb, pos: k3 };
            }
            for (var ri = 0; ri < refCells.length; ri++) {
                var rcell = refCells[ri];
                var streamIndex = enc.placement[rcell[0]][rcell[1]];
                if (streamIndex === null || streamIndex === undefined) { functionDamage++; continue; }
                refEncodingCells.push(rcell);
                var where = blockOfStream[streamIndex];
                /* Two damaged modules can share one codeword — a duplicated
                   erasure position would make the Vandermonde system
                   singular, so keep each position once. */
                if (where && erasuresByBlock[where.block].indexOf(where.pos) < 0) {
                    erasuresByBlock[where.block].push(where.pos);
                }
            }
        }

        /* The corrected stream: what the codewords should have been. With
           every block decoded this is a complete reference, so the sampled
           matrix can be diffed against it module by module — damaged
           encoding-region modules, which over size × size is the same
           measure the forward half of the page reports. A failed block has
           no reference, so the diff only runs when everything decoded. */
        var fixedStream = stream.bytes.slice();
        var damageCells = [];
        var damageModules = null;
        var corruptedLowerBound = 0;

        for (var b = 0; b < st.numBlocks; b++) {
            var idx = perBlock[b];
            var blockBytes = idx.map(function (p) { return stream.bytes[p]; });
            var budget = Math.floor(st.ecPerBlock / 2);
            totalBudget += budget;
            var res = rsDecodeBlock(blockBytes, st.ecPerBlock);
            var usedErasure = false;
            if (!res.ok && erasuresByBlock && erasuresByBlock[b].length) {
                /* Error decoding is out of budget — but with the damaged
                   positions known, each costs one parity symbol instead of
                   two. This is the repair that rescues symbols past the
                   ordinary error budget. */
                res = rsDecodeBlockErasure(blockBytes, st.ecPerBlock, erasuresByBlock[b]);
                usedErasure = res.ok && res.corrected > 0;
                if (usedErasure) erasureCount += res.corrected;
            }
            if (!res.ok) {
                failed.push(b);
                blocks.push({ dataCount: st.dataCounts[b], ecCount: st.ecPerBlock, budget: budget, corrected: null, ok: false });
                /* Decoding failed, so this block carries more corrupted
                   codewords than its budget — at least budget + 1 of them. */
                corruptedLowerBound += budget + 1;
                continue;
            }
            totalCorrected += res.corrected;
            corruptedLowerBound += res.corrected;
            blocks.push({ dataCount: st.dataCounts[b], ecCount: st.ecPerBlock, budget: budget, corrected: res.corrected, ok: true, erased: usedErasure });
            /* res.fixed is absent when the block was already clean — the
               sampled bytes are then their own reference. */
            if (res.fixed) {
                for (var k2 = 0; k2 < idx.length; k2++) fixedStream[idx[k2]] = res.fixed[k2];
            }
            for (var e = 0; e < res.positions.length; e++) {
                var streamIndex = idx[res.positions[e]];
                correctedStreamIndexes.push(streamIndex);
                var cells = stream.cellsOf[streamIndex] || [];
                for (var m = 0; m < cells.length; m++) correctedCells.push(cells[m]);
            }
        }

        /* Modules whose sampled value differs from the recovered original.
           With a reference the diff IS the answer; otherwise it comes from
           the corrected stream. Bit m2 of a codeword is its m2-th cell, most
           significant first — the order readCodewords assembled the byte in.
           Remainder bits belong to no codeword, so like the forward counter
           they are not part of the total. */
        var damageTotal = 0;
        for (var si2 = 0; si2 < stream.bytes.length; si2++) damageTotal += (stream.cellsOf[si2] || []).length;
        if (refEncodingCells) {
            damageCells = refEncodingCells;
            damageModules = refEncodingCells.length;
        } else if (!failed.length) {
            damageModules = 0;
            for (var si = 0; si < stream.bytes.length; si++) {
                var expect = fixedStream[si];
                var got = stream.bytes[si];
                if (expect === got) continue;
                var cl = stream.cellsOf[si] || [];
                for (var m2 = 0; m2 < cl.length; m2++) {
                    var cr = cl[m2][0];
                    var cc = cl[m2][1];
                    var gotBit = matrix[cr][cc] ^ (masked(mask, cr, cc) ? 1 : 0);
                    var expBit = (expect >> (7 - m2)) & 1;
                    if (gotBit !== expBit) {
                        damageCells.push(cl[m2]);
                        damageModules++;
                    }
                }
            }
        }

        return {
            blocks: blocks,
            failedBlocks: failed,
            totalCorrected: totalCorrected,
            totalBudget: totalBudget,
            correctedCells: correctedCells,
            correctedStreamIndexes: correctedStreamIndexes,
            totalCodewords: stream.bytes.length,
            damageCells: damageCells,
            damageModules: damageModules,
            damageTotal: damageTotal,
            corruptedLowerBound: corruptedLowerBound,
            erasureCount: erasureCount,
            functionDamage: functionDamage,
            dataCodewords: st.dataCodewords,
            payload: failed.length ? null : parseDataPayload(fixedStream, st, version)
        };
    }

    /* Read the message text out of the data codewords. The bit stream is the
       data codewords in stream order (block b's k-th codeword sits at stream
       index k·numBlocks + b), most significant bit first. Byte mode covers
       URLs and free text; numeric and alphanumeric get quick parsers too. */
    function parseDataPayload(data, st, version) {
        var countBits = version < 10 ? { 1: 10, 2: 9, 4: 8, 8: 8 } : version < 27 ? { 1: 12, 2: 11, 4: 16, 8: 10 } : { 1: 14, 2: 13, 4: 16, 8: 12 };
        var bit = 0;
        var totalBits = st.dataCodewords * 8;
        function take(n) {
            var v = 0;
            for (var i = 0; i < n; i++) {
                if (bit >= totalBits) return null;
                v = (v << 1) | ((data[bit >> 3] >> (7 - (bit & 7))) & 1);
                bit++;
            }
            return v;
        }
        var mode = take(4);
        var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
        if (mode === 4) {
            var len = take(countBits[4]);
            var bytes = [];
            for (var i = 0; i < len; i++) bytes.push(take(8));
            try { return decodeURIComponent(escape(String.fromCharCode.apply(null, bytes))); }
            catch (e) { return String.fromCharCode.apply(null, bytes); }
        }
        if (mode === 1) {
            var digits = take(countBits[1]);
            var out = '';
            while (digits >= 3) { out += String(take(10)); digits -= 3; }
            if (digits === 2) out += String(take(7));
            else if (digits === 1) out += String(take(4));
            return out;
        }
        if (mode === 2) {
            var chars = take(countBits[2]);
            var out2 = '';
            while (chars >= 2) {
                var v2 = take(11);
                out2 += ALNUM[Math.floor(v2 / 45)] + ALNUM[v2 % 45];
                chars -= 2;
            }
            if (chars === 1) out2 += ALNUM[take(6)];
            return out2;
        }
        return null;
    }

    function versionOf(size) {
        return (size - 17) / 4;
    }

    return {
        analyze: analyze,
        locateSymbol: locateSymbol,
        /* Exposed for the test suite and for the sample generator. */
        rsDecodeBlock: rsDecodeBlock,
        rsDecodeBlockErasure: rsDecodeBlockErasure,
        readFormat: readFormat,
        zigzagCells: zigzagCells,
        _internal: {
            solveHomography: solveHomography,
            project: project,
            lockedThreshold: crudeThreshold
        }
    };
}));
