/*
 * barcode-qr.js — QR Code (ISO/IEC 18004) encoder with a structural map.
 *
 * A structure diagram does not just need black and white modules, it needs to
 * know what every module *is*: which ones are finder patterns, where the format
 * bits sit, which modules carry data codewords and which carry Reed-Solomon
 * parity. So encode() returns the finished module matrix plus three parallel
 * maps and a flat component list:
 *
 *   matrix         the symbol, 1 = dark. Core symbol only, no quiet zone.
 *   functionMask   1 = a module fixed by the standard: a function pattern
 *                  (finder, separator, timing, alignment, dark module), a
 *                  format or version field, or one of the 0-7 remainder
 *                  modules left unused at the end of the data region. These
 *                  modules never carry message data.
 *   reservedMask   1 = a module excluded from the data placement area — the
 *                  same set, stated from the other side ("no codeword bit may
 *                  be written here"). The two agree cell for cell, and both
 *                  agree with `placement[row][col] === null`; the tests assert
 *                  all three invariants.
 *   placement      codeword index (position in the interleaved codeword
 *                  sequence that the symbol carries) for every cell that holds
 *                  a codeword bit, null for every other cell.
 *   components     named regions that partition the symbol: every cell belongs
 *                  to exactly one component. `kind` is the coarse category
 *                  ('fixed', 'timing', 'alignment', 'format', 'version',
 *                  'dark', 'data', 'ec'), `group` is the three-way split the
 *                  legend uses ('function', 'header', 'data').
 *
 * summary.dataModules and summary.ecModules count the modules that carry data
 * and parity codewords; summary.functionModules is everything else, which
 * includes the 0 to 7 remainder modules a version leaves unused at the end of
 * the encoding region (they are always light and carry no information).
 * The three add up to size * size.
 *
 * Dependency free, no DOM, no network, no build step. Loads as a plain script
 * (window.BarcodeQR) and is require()-able for tests. Runs on ES5 engines: the
 * only modern API used is TextEncoder, and that is feature detected.
 *
 *   var result = BarcodeQR.encode('HELLO WORLD', { ecLevel: 'Q' });
 *   result.matrix[0][0]        // 1 — top-left finder pattern
 *   result.components[0].id    // 'finder-tl'
 *
 * Options: { ecLevel: 'L'|'M'|'Q'|'H' (default 'M'),
 *            version: 1..40 | null (null = smallest version that fits),
 *            mode: 'auto'|'numeric'|'alphanumeric'|'byte' (default 'auto'),
 *            mask: 0..7 (optional; forces a mask instead of scoring all eight) }
 *
 * Byte mode is capped at version 20 when the version is chosen automatically —
 * a demo does not need a 177x177 symbol, and the cap keeps the page honest
 * about what it can draw. An explicit version up to 40 is still honoured.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BarcodeQR = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ================================================================== *
     * Symbol tables (ISO/IEC 18004 Tables 1, 9 and Annex D/E)
     * ================================================================== */

    var EC_LEVELS = ['L', 'M', 'Q', 'H'];

    /* The two bits the error correction level contributes to the format
       information. The order is not alphabetical: L=01, M=00, Q=11, H=10. */
    var EC_LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

    /* Total codewords per version, index 0 unused. */
    var TOTAL_CODEWORDS = [
        0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
        404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
        1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
        2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706
    ];

    /* Error correction codewords per block, indexed [level][version]. */
    var EC_CODEWORDS_PER_BLOCK = {
        L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
            20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
            28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26,
            30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
            26, 28, 28, 28, 28, 28, 28, 28, 28, 28,
            28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
        Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24,
            28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
            28, 30, 30, 30, 30, 28, 30, 30, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28,
            24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
            30, 24, 30, 30, 30, 30, 30, 30, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
    };

    /* Number of error correction blocks, indexed [level][version]. */
    var EC_BLOCK_COUNT = {
        L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
            4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
            8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
            16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
        M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,
            5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
            17, 17, 18, 20, 21, 23, 25, 26, 28, 29,
            31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
        Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,
            8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
            23, 23, 25, 27, 29, 34, 34, 35, 38, 40,
            43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
        H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8,
            11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
            25, 34, 30, 32, 35, 37, 40, 42, 45, 48,
            51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
    };

    /* Alignment pattern centre coordinates (ISO/IEC 18004 Annex E), index 0
       unused. The patterns sit at every combination of two coordinates except
       the three that would collide with a finder pattern. */
    var ALIGNMENT_POSITIONS = [
        [],
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ];

    /* Modules left over at the end of the data region: the data capacity is not
       a whole number of codewords, so 0 to 7 modules stay unused (always
       light). ISO/IEC 18004 Table 1. */
    var REMAINDER_BITS = [
        0,
        0, 7, 7, 7, 7, 7,
        0, 0, 0, 0, 0, 0, 0,
        3, 3, 3, 3, 3, 3, 3,
        4, 4, 4, 4, 4, 4, 4,
        3, 3, 3, 3, 3, 3, 3,
        0, 0, 0, 0, 0, 0
    ];

    /* Mode indicator (4 bits) and character count field widths per version
       band: versions 1-9, 10-26, 27-40. */
    var MODES = {
        numeric: { indicator: 1, ccBits: [10, 12, 14] },
        alphanumeric: { indicator: 2, ccBits: [9, 11, 13] },
        byte: { indicator: 4, ccBits: [8, 16, 16] }
    };

    var ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

    /* The eight mask conditions, written the way the standard writes them
       (Table 10) with `row` and `col` as the two coordinates. */
    var MASK_FORMULAS = [
        '(row + col) % 2 == 0',
        'row % 2 == 0',
        'col % 3 == 0',
        '(row + col) % 3 == 0',
        '(Math.floor(row / 2) + Math.floor(col / 3)) % 2 == 0',
        '(row * col) % 2 + (row * col) % 3 == 0',
        '((row * col) % 2 + (row * col) % 3) % 2 == 0',
        '((row + col) % 2 + (row * col) % 3) % 2 == 0'
    ];

    var MAX_AUTO_BYTE_VERSION = 20;

    /* ================================================================== *
     * GF(256) arithmetic and Reed-Solomon
     *
     * QR Codes use the field generated by the primitive polynomial
     * x^8 + x^4 + x^3 + x^2 + 1 (0x11d), with 2 as the primitive element.
     * ================================================================== */

    var GF_EXP = new Array(512);
    var GF_LOG = new Array(256);

    (function buildLogTables() {
        var x = 1;
        for (var i = 0; i < 255; i++) {
            GF_EXP[i] = x;
            GF_LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (var j = 255; j < 512; j++) GF_EXP[j] = GF_EXP[j - 255];
        GF_LOG[0] = 0; /* log(0) is undefined; gfMul guards against it. */
    }());

    function gfMul(a, b) {
        if (a === 0 || b === 0) return 0;
        return GF_EXP[GF_LOG[a] + GF_LOG[b]];
    }

    /* The generator polynomial for `degree` error correction codewords:
       (x - a^0)(x - a^1)...(x - a^(degree-1)), coefficients highest power
       first, leading coefficient 1. */
    var generatorCache = {};

    function rsGenerator(degree) {
        if (generatorCache[degree]) return generatorCache[degree];
        var poly = [1];
        for (var i = 0; i < degree; i++) {
            var factor = GF_EXP[i];
            var next = new Array(poly.length + 1);
            for (var k = 0; k < next.length; k++) next[k] = 0;
            for (var j = 0; j < poly.length; j++) {
                next[j] ^= poly[j];
                next[j + 1] ^= gfMul(poly[j], factor);
            }
            poly = next;
        }
        generatorCache[degree] = poly;
        return poly;
    }

    /* Systematic Reed-Solomon encoding: the remainder of data(x) * x^degree
       divided by the generator polynomial. */
    function rsEncode(data, degree) {
        var generator = rsGenerator(degree);
        var remainder = new Array(degree);
        for (var i = 0; i < degree; i++) remainder[i] = 0;

        for (var d = 0; d < data.length; d++) {
            var factor = data[d] ^ remainder[0];
            for (var s = 0; s < degree - 1; s++) remainder[s] = remainder[s + 1];
            remainder[degree - 1] = 0;
            if (factor !== 0) {
                for (var g = 0; g < degree; g++) {
                    remainder[g] ^= gfMul(generator[g + 1], factor);
                }
            }
        }
        return remainder;
    }

    /* ================================================================== *
     * Text, modes and the bit stream
     * ================================================================== */

    function versionSize(version) {
        return version * 4 + 17;
    }

    function versionBand(version) {
        return version <= 9 ? 0 : (version <= 26 ? 1 : 2);
    }

    /* The byte encoder the standard's byte mode actually means: UTF-8. */
    function utf8Bytes(text) {
        if (typeof TextEncoder !== 'undefined') {
            var encoded = new TextEncoder().encode(text);
            var out = new Array(encoded.length);
            for (var i = 0; i < encoded.length; i++) out[i] = encoded[i];
            return out;
        }
        return manualBytes(text);
    }

    /* Fallback for engines without TextEncoder. Code points 0x00-0xFF are
       written as Latin-1, which is what byte mode meant before UTF-8 became the
       convention; anything above that is written as UTF-8 so nothing is lost.
       Both branches match TextEncoder for ASCII text, and the UTF-8 branches
       match it for everything outside the Latin-1 supplement. */
    function manualBytes(text) {
        var out = [];
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);

            /* A surrogate pair is one code point: decode and re-encode it. */
            if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
                var low = text.charCodeAt(i + 1);
                if (low >= 0xdc00 && low <= 0xdfff) {
                    var point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                    out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f),
                        0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
                    i++;
                    continue;
                }
            }

            if (code < 0x100) {
                out.push(code);
            } else if (code < 0x800) {
                out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            } else if (code >= 0xd800 && code <= 0xdfff) {
                /* Unpaired surrogate: write the replacement character. */
                out.push(0xef, 0xbf, 0xbd);
            } else {
                out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            }
        }
        return out;
    }

    function detectMode(text) {
        if (/^[0-9]*$/.test(text)) return 'numeric';
        if (/^[0-9A-Z $%*+\-./:]*$/.test(text)) return 'alphanumeric';
        return 'byte';
    }

    function normalizeMode(mode, text) {
        if (mode === undefined || mode === null || mode === '' || mode === 'auto') return detectMode(text);
        var name = String(mode).toLowerCase();
        if (!MODES[name]) {
            throw new Error('BarcodeQR: unknown mode "' + mode + '"; use auto, numeric, alphanumeric or byte.');
        }
        if (name === 'numeric' && !/^[0-9]*$/.test(text)) {
            throw new Error('BarcodeQR: numeric mode accepts digits only.');
        }
        if (name === 'alphanumeric' && !/^[0-9A-Z $%*+\-./:]*$/.test(text)) {
            throw new Error('BarcodeQR: alphanumeric mode accepts ' + ALPHANUMERIC_CHARS + ' only.');
        }
        return name;
    }

    function normalizeEcLevel(level) {
        if (level === undefined || level === null || level === '') return 'M';
        var name = String(level).toUpperCase();
        if (EC_LEVELS.indexOf(name) === -1) {
            throw new Error('BarcodeQR: unknown error correction level "' + level + '"; use L, M, Q or H.');
        }
        return name;
    }

    /* The payload of one segment, as a bit array, without the mode indicator or
       the character count field. */
    function segmentPayloadBits(mode, text) {
        var bits = [];
        var i;

        function put(value, length) {
            for (var b = length - 1; b >= 0; b--) bits.push((value >>> b) & 1);
        }

        if (mode === 'numeric') {
            for (i = 0; i + 3 <= text.length; i += 3) put(Number(text.substr(i, 3)), 10);
            var rest = text.length - i;
            if (rest === 2) put(Number(text.substr(i, 2)), 7);
            else if (rest === 1) put(Number(text.substr(i, 1)), 4);
        } else if (mode === 'alphanumeric') {
            for (i = 0; i + 2 <= text.length; i += 2) {
                put(ALPHANUMERIC_CHARS.indexOf(text.charAt(i)) * 45
                    + ALPHANUMERIC_CHARS.indexOf(text.charAt(i + 1)), 11);
            }
            if (i < text.length) put(ALPHANUMERIC_CHARS.indexOf(text.charAt(i)), 6);
        } else {
            var bytes = utf8Bytes(text);
            for (i = 0; i < bytes.length; i++) put(bytes[i], 8);
        }
        return bits;
    }

    function segmentCharCount(mode, text) {
        return mode === 'byte' ? utf8Bytes(text).length : text.length;
    }

    /* Total bits one segment contributes: mode indicator + character count
       field + payload. */
    function segmentBitCount(mode, text, version) {
        return 4 + MODES[mode].ccBits[versionBand(version)] + segmentPayloadBits(mode, text).length;
    }

    /* ================================================================== *
     * Block structure and codewords
     * ================================================================== */

    /* How a version/level combination splits into blocks. Short blocks come
       first, which is the order the standard uses for interleaving. */
    function blockStructure(version, ecLevel) {
        var ecPerBlock = EC_CODEWORDS_PER_BLOCK[ecLevel][version];
        var numBlocks = EC_BLOCK_COUNT[ecLevel][version];
        var totalCodewords = TOTAL_CODEWORDS[version];
        var dataCodewords = totalCodewords - ecPerBlock * numBlocks;
        var numShort = numBlocks - (dataCodewords % numBlocks);
        var shortLength = Math.floor(dataCodewords / numBlocks);
        var blocks = [];
        for (var b = 0; b < numBlocks; b++) {
            blocks.push(b < numShort ? shortLength : shortLength + 1);
        }
        return {
            version: version,
            ecLevel: ecLevel,
            ecPerBlock: ecPerBlock,
            numBlocks: numBlocks,
            totalCodewords: totalCodewords,
            dataCodewords: dataCodewords,
            ecCodewords: ecPerBlock * numBlocks,
            dataCounts: blocks,
            numShort: numShort,
            shortLength: shortLength
        };
    }

    /* Largest byte-mode payload that fits, in bytes. */
    function byteCapacity(version, ecLevel) {
        var structure = blockStructure(version, ecLevel);
        var overhead = 4 + MODES.byte.ccBits[versionBand(version)];
        return Math.floor((structure.dataCodewords * 8 - overhead) / 8);
    }

    function dataCodewordCapacity(version, ecLevel) {
        return blockStructure(version, ecLevel).dataCodewords;
    }

    /* Turn the message into the data codewords, including terminator and pad
       bytes (0xEC / 0x11 alternating, ISO/IEC 18004 8.4.9). */
    function buildDataCodewords(mode, text, version, dataCodewords) {
        var capacityBits = dataCodewords * 8;
        var ccBits = MODES[mode].ccBits[versionBand(version)];
        var charCount = segmentCharCount(mode, text);
        var payload = segmentPayloadBits(mode, text);
        var bits = [];
        var i;

        function put(value, length) {
            for (var b = length - 1; b >= 0; b--) bits.push((value >>> b) & 1);
        }

        var headerBits = 4 + ccBits;
        if (headerBits + payload.length > capacityBits) {
            throw new Error('BarcodeQR: payload does not fit this version.');
        }

        put(MODES[mode].indicator, 4);
        put(charCount, ccBits);
        for (i = 0; i < payload.length; i++) bits.push(payload[i]);

        /* Terminator: up to four zero bits, truncated at capacity. */
        var terminator = Math.min(4, capacityBits - bits.length);
        for (i = 0; i < terminator; i++) bits.push(0);

        /* Pad to a codeword boundary, then alternate the two pad bytes. */
        while (bits.length % 8 !== 0) bits.push(0);
        var padBytes = [0xec, 0x11];
        var padIndex = 0;
        while (bits.length < capacityBits) {
            put(padBytes[padIndex % 2], 8);
            padIndex++;
        }

        var codewords = [];
        for (i = 0; i < bits.length; i += 8) {
            var value = 0;
            for (var b2 = 0; b2 < 8; b2++) value = (value << 1) | bits[i + b2];
            codewords.push(value);
        }
        return codewords;
    }

    /* Split into blocks, add parity to each, then interleave the way the symbol
       stores them: every block's first data codeword, then every block's second,
       and so on, followed by the parity codewords in the same round-robin. */
    function buildSymbolCodewords(structure, dataCodewords) {
        var dataBlocks = [];
        var ecBlocks = [];
        var offset = 0;
        var b;

        for (b = 0; b < structure.numBlocks; b++) {
            var block = dataCodewords.slice(offset, offset + structure.dataCounts[b]);
            offset += structure.dataCounts[b];
            dataBlocks.push(block);
            ecBlocks.push(rsEncode(block, structure.ecPerBlock));
        }

        var interleaved = [];
        var maxData = structure.shortLength + (structure.numShort < structure.numBlocks ? 1 : 0);
        var i;
        for (i = 0; i < maxData; i++) {
            for (b = 0; b < structure.numBlocks; b++) {
                if (i < dataBlocks[b].length) interleaved.push(dataBlocks[b][i]);
            }
        }
        for (i = 0; i < structure.ecPerBlock; i++) {
            for (b = 0; b < structure.numBlocks; b++) interleaved.push(ecBlocks[b][i]);
        }

        return { dataBlocks: dataBlocks, ecBlocks: ecBlocks, interleaved: interleaved };
    }

    /* ================================================================== *
     * Format and version information
     * ================================================================== */

    /* BCH(15,5) over the level bits and the mask, XORed with 0x5412. */
    function formatBits(ecLevel, mask) {
        var data = (EC_LEVEL_BITS[ecLevel] << 3) | mask;
        var rem = data;
        for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        return ((data << 10) | rem) ^ 0x5412;
    }

    /* BCH(18,6) over the version number; required from version 7 up. */
    function versionBits(version) {
        var rem = version;
        for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        return (version << 12) | rem;
    }

    /* ================================================================== *
     * Matrix construction
     * ================================================================== */

    function grid(size, fill) {
        var out = new Array(size);
        for (var r = 0; r < size; r++) {
            out[r] = new Array(size);
            for (var c = 0; c < size; c++) out[r][c] = fill;
        }
        return out;
    }

    function copyGrid(source) {
        var out = new Array(source.length);
        for (var r = 0; r < source.length; r++) out[r] = source[r].slice();
        return out;
    }

    /* The three finder blocks. Each is an 8x8 region made of the 7x7 finder
       pattern plus the one-module light separator on its inner sides, so inside
       that region the finder sits in the corner nearest the symbol corner:
       top-left for the top-left block, top-right for the top-right block, and
       bottom-left for the bottom-left one. */
    function cornerBlocks(size) {
        return [
            { slug: 'tl', top: 0, left: 0, finderTop: 0, finderLeft: 0 },
            { slug: 'tr', top: 0, left: size - 8, finderTop: 0, finderLeft: 1 },
            { slug: 'bl', top: size - 8, left: 0, finderTop: 1, finderLeft: 0 }
        ];
    }

    /* Every cell of the symbol with a label saying which fixed region it
       belongs to, or null where a codeword bit goes. Claiming runs in priority
       order: finders and separators, alignment patterns, timing patterns,
       format information, version information, dark module. */
    function buildSlots(version) {
        var size = versionSize(version);
        var slots = grid(size, null);
        var alignmentSlugs = [];
        var r, c, i, j;

        function claim(row, col, key) {
            if (row < 0 || col < 0 || row >= size || col >= size) return;
            if (slots[row][col] === null) slots[row][col] = key;
        }

        var corners = cornerBlocks(size);
        for (i = 0; i < corners.length; i++) {
            for (r = 0; r < 8; r++) {
                for (c = 0; c < 8; c++) {
                    var inside = r >= corners[i].finderTop && r < corners[i].finderTop + 7
                        && c >= corners[i].finderLeft && c < corners[i].finderLeft + 7;
                    claim(corners[i].top + r, corners[i].left + c,
                        (inside ? 'finder-' : 'separator-') + corners[i].slug);
                }
            }
        }

        /* Alignment patterns: every pair of coordinates except the three that
           would sit on top of a finder pattern. */
        var positions = ALIGNMENT_POSITIONS[version];
        for (i = 0; i < positions.length; i++) {
            for (j = 0; j < positions.length; j++) {
                var lastIndex = positions.length - 1;
                if ((i === 0 && j === 0) || (i === 0 && j === lastIndex)
                    || (i === lastIndex && j === 0)) continue;
                var centreRow = positions[i];
                var centreCol = positions[j];
                var slug = 'alignment-' + centreRow + '-' + centreCol;
                for (r = centreRow - 2; r <= centreRow + 2; r++) {
                    for (c = centreCol - 2; c <= centreCol + 2; c++) claim(r, c, slug);
                }
                alignmentSlugs.push(slug);
            }
        }

        /* Timing patterns run between the finder patterns along row 6 and
           column 6, and start dark. */
        for (i = 8; i <= size - 9; i++) {
            claim(6, i, 'timing-row');
            claim(i, 6, 'timing-col');
        }

        /* Format information, first copy around the top-left finder pattern. */
        for (i = 0; i <= 5; i++) claim(i, 8, 'format-1');
        claim(7, 8, 'format-1');
        claim(8, 8, 'format-1');
        claim(8, 7, 'format-1');
        for (i = 0; i <= 5; i++) claim(8, i, 'format-1');

        /* Second copy: under the top-right finder pattern and beside the
           bottom-left one. */
        for (i = 0; i < 8; i++) claim(8, size - 1 - i, 'format-2');
        for (i = 8; i < 15; i++) claim(size - 15 + i, 8, 'format-2');

        /* Version information, two 3x6 blocks, version 7 and above. */
        if (version >= 7) {
            for (i = 0; i < 18; i++) {
                var a = size - 11 + (i % 3);
                var b = Math.floor(i / 3);
                claim(a, b, 'version-1');
                claim(b, a, 'version-2');
            }
        }

        /* The dark module. ISO/IEC 18004 requires it at (4 * version + 9, 8). */
        claim(size - 8, 8, 'dark-module');

        return { slots: slots, alignmentSlugs: alignmentSlugs };
    }

    /* A finder pattern is dark except for the one-module light ring between the
       3x3 centre and the outer border. Takes block-relative coordinates. */
    function finderValue(row, col) {
        var distance = Math.max(Math.abs(row - 3), Math.abs(col - 3));
        return distance === 2 ? 0 : 1;
    }

    /* Draw every fixed value that does not depend on the mask. The format and
       version fields stay light here and are written once the mask is known. */
    function drawFixedPatterns(matrix, slots, version) {
        var size = matrix.length;
        var corners = {};
        var blocks = cornerBlocks(size);
        var i;
        for (i = 0; i < blocks.length; i++) corners['finder-' + blocks[i].slug] = blocks[i];
        var r, c, key;

        for (r = 0; r < size; r++) {
            for (c = 0; c < size; c++) {
                key = slots[r][c];
                if (key === null) continue;
                if (key.indexOf('finder-') === 0) {
                    var corner = corners[key];
                    matrix[r][c] = finderValue(r - corner.top - corner.finderTop,
                        c - corner.left - corner.finderLeft);
                } else if (key.indexOf('separator-') === 0) {
                    matrix[r][c] = 0;
                } else if (key.indexOf('alignment-') === 0) {
                    var parts = key.split('-');
                    var distance = Math.max(Math.abs(r - Number(parts[1])),
                        Math.abs(c - Number(parts[2])));
                    matrix[r][c] = distance === 1 ? 0 : 1;
                } else if (key === 'timing-row') {
                    matrix[r][c] = c % 2 === 0 ? 1 : 0;
                } else if (key === 'timing-col') {
                    matrix[r][c] = r % 2 === 0 ? 1 : 0;
                } else if (key === 'dark-module') {
                    matrix[r][c] = 1;
                } else {
                    matrix[r][c] = 0;
                }
            }
        }
    }

    /* Walk the data region in the standard order: two-module-wide columns from
       the bottom right, alternating upwards and downwards, skipping the
       vertical timing column. */
    function placeCodewords(matrix, slots, codewords, version) {
        var size = matrix.length;
        var bits = [];
        var i, b;
        for (i = 0; i < codewords.length; i++) {
            for (b = 7; b >= 0; b--) bits.push((codewords[i] >>> b) & 1);
        }

        var placement = grid(size, null);
        var index = 0;

        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            var upward = ((right + 1) & 2) === 0;
            for (var vert = 0; vert < size; vert++) {
                for (var col = 0; col < 2; col++) {
                    var c = right - col;
                    var r = upward ? size - 1 - vert : vert;
                    if (slots[r][c] === null && index < bits.length) {
                        matrix[r][c] = bits[index];
                        placement[r][c] = Math.floor(index / 8);
                        index++;
                    }
                }
            }
        }
        return placement;
    }

    function isValidMask(mask, row, col) {
        switch (mask) {
            case 0: return ((row + col) % 2) === 0;
            case 1: return (row % 2) === 0;
            case 2: return (col % 3) === 0;
            case 3: return ((row + col) % 3) === 0;
            case 4: return ((Math.floor(row / 2) + Math.floor(col / 3)) % 2) === 0;
            case 5: return ((row * col) % 2 + (row * col) % 3) === 0;
            case 6: return (((row * col) % 2 + (row * col) % 3) % 2) === 0;
            case 7: return (((row + col) % 2 + (row * col) % 3) % 2) === 0;
            default: throw new Error('BarcodeQR: mask pattern must be 0-7, got ' + mask + '.');
        }
    }

    /* Apply a mask to the data modules only. */
    function applyMask(matrix, slots, mask) {
        var size = matrix.length;
        for (var r = 0; r < size; r++) {
            for (var c = 0; c < size; c++) {
                if (slots[r][c] === null && isValidMask(mask, r, c)) matrix[r][c] ^= 1;
            }
        }
    }

    function writeFormatBits(matrix, ecLevel, mask) {
        var size = matrix.length;
        var bits = formatBits(ecLevel, mask);
        var i;

        /* First copy: up column 8 beside the top-left finder pattern, then
           left along row 8. Bits 0-5, 6, 7, 8, then 9-14. */
        for (i = 0; i <= 5; i++) matrix[i][8] = (bits >>> i) & 1;
        matrix[7][8] = (bits >>> 6) & 1;
        matrix[8][8] = (bits >>> 7) & 1;
        matrix[8][7] = (bits >>> 8) & 1;
        for (i = 9; i < 15; i++) matrix[8][14 - i] = (bits >>> i) & 1;

        /* Second copy: bits 0-7 right to left along row 8 under the top-right
           finder pattern, then bits 8-14 down column 8 to the dark module. */
        for (i = 0; i < 8; i++) matrix[8][size - 1 - i] = (bits >>> i) & 1;
        for (i = 8; i < 15; i++) matrix[size - 15 + i][8] = (bits >>> i) & 1;
    }

    function writeVersionBits(matrix, version) {
        if (version < 7) return;
        var size = matrix.length;
        var bits = versionBits(version);
        for (var i = 0; i < 18; i++) {
            var bit = (bits >>> i) & 1;
            var a = size - 11 + (i % 3);
            var b = Math.floor(i / 3);
            matrix[b][a] = bit;
            matrix[a][b] = bit;
        }
    }

    /* ================================================================== *
     * Mask scoring (ISO/IEC 18004 Table 11)
     * ================================================================== */

    var N1 = 3, N2 = 3, N3 = 40, N4 = 10;
    var FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1];

    function isLightRun(get, length, from, to) {
        if (from < 0) from = 0;
        if (to > length) to = length;
        for (var i = from; i < to; i++) {
            if (get(i) !== 0) return false;
        }
        return true;
    }

    /* Rule 3: the 1:1:3:1:1 pattern with a light area four modules wide on one
       side. The area outside the symbol counts as light, which is what the
       quiet zone provides in a printed symbol. */
    function countFinderLike(get, length) {
        var count = 0;
        for (var x = 0; x + 7 <= length; x++) {
            var match = true;
            for (var k = 0; k < 7; k++) {
                if (get(x + k) !== FINDER_LIKE[k]) { match = false; break; }
            }
            if (!match) continue;
            if (isLightRun(get, length, x - 4, x) || isLightRun(get, length, x + 7, x + 11)) count++;
        }
        return count;
    }

    /* Penalty score of a finished symbol (format and version bits included),
       broken down by rule. The lowest total wins the mask.

       Rule 3 note: a 1:1:3:1:1 pattern that touches the symbol edge counts,
       because the light area four modules wide is then supplied by the quiet
       zone. That is how ZXing and qrcodegen read the rule; engines that only
       look inside the symbol score a symbol built this way a little lower, but
       the difference is confined to the mask search. */
    function penaltyBreakdown(matrix) {
        var size = matrix.length;
        var n1 = 0, n2 = 0, n3 = 0, n4 = 0;
        var r, c, run, dark;

        /* N1: runs of five or more modules of the same colour. */
        for (r = 0; r < size; r++) {
            run = 1;
            for (c = 1; c < size; c++) {
                if (matrix[r][c] === matrix[r][c - 1]) run++;
                else {
                    if (run >= 5) n1 += N1 + (run - 5);
                    run = 1;
                }
            }
            if (run >= 5) n1 += N1 + (run - 5);
        }
        for (c = 0; c < size; c++) {
            run = 1;
            for (r = 1; r < size; r++) {
                if (matrix[r][c] === matrix[r - 1][c]) run++;
                else {
                    if (run >= 5) n1 += N1 + (run - 5);
                    run = 1;
                }
            }
            if (run >= 5) n1 += N1 + (run - 5);
        }

        /* N2: 2x2 blocks of one colour. */
        for (r = 0; r < size - 1; r++) {
            for (c = 0; c < size - 1; c++) {
                var value = matrix[r][c];
                if (value === matrix[r][c + 1] && value === matrix[r + 1][c]
                    && value === matrix[r + 1][c + 1]) n2 += N2;
            }
        }

        /* N3: finder-like 1:1:3:1:1 patterns in rows and columns. */
        for (r = 0; r < size; r++) {
            n3 += N3 * countFinderLike((function (row) {
                return function (i) { return matrix[row][i]; };
            }(r)), size);
        }
        for (c = 0; c < size; c++) {
            n3 += N3 * countFinderLike((function (col) {
                return function (i) { return matrix[i][col]; };
            }(c)), size);
        }

        /* N4: deviation of the dark module share from 50%, in steps of 5%. */
        dark = 0;
        for (r = 0; r < size; r++) {
            for (c = 0; c < size; c++) dark += matrix[r][c];
        }
        var total = size * size;
        n4 += N4 * Math.floor(Math.abs(dark * 20 - total * 10) / total);

        return { n1: n1, n2: n2, n3: n3, n4: n4, total: n1 + n2 + n3 + n4 };
    }

    function penaltyScore(matrix) {
        return penaltyBreakdown(matrix).total;
    }

    /* ================================================================== *
     * Components: the named regions a diagram can point at
     * ================================================================== */

    var FUNCTION_KINDS = ['fixed', 'timing', 'alignment', 'format', 'version', 'dark'];
    var DATA_KINDS = ['data', 'ec'];

    function boundsOf(cells) {
        var minRow = Infinity, minCol = Infinity, maxRow = -Infinity, maxCol = -Infinity;
        for (var i = 0; i < cells.length; i++) {
            if (cells[i][0] < minRow) minRow = cells[i][0];
            if (cells[i][0] > maxRow) maxRow = cells[i][0];
            if (cells[i][1] < minCol) minCol = cells[i][1];
            if (cells[i][1] > maxCol) maxCol = cells[i][1];
        }
        return {
            row: minRow,
            col: minCol,
            rows: maxRow - minRow + 1,
            cols: maxCol - minCol + 1
        };
    }

    function hexByte(value) {
        var text = value.toString(16).toUpperCase();
        return text.length < 2 ? '0x0' + text : '0x' + text;
    }

    var FIXED_META = {
        'finder-tl': {
            label: 'Finder pattern (top left)', kind: 'fixed', group: 'function',
            description: 'One of the three 7x7 bullseyes a scanner uses to find the symbol and its orientation.',
            detail: 'Every QR Code has three finder patterns, in three corners. A scanner looks for the 1:1:3:1:1 dark-to-light ratio across any line through the centre; because three corners are marked and the fourth is not, the symbol also tells the scanner which way up it is.'
        },
        'finder-tr': {
            label: 'Finder pattern (top right)', kind: 'fixed', group: 'function',
            description: 'The second of the three finder patterns, in the top right corner.',
            detail: 'Two finder patterns on one edge give the scanner the symbol width and the rotation; the third fixes the corner, and the empty fourth corner is what makes the orientation unambiguous.'
        },
        'finder-bl': {
            label: 'Finder pattern (bottom left)', kind: 'fixed', group: 'function',
            description: 'The third finder pattern, in the bottom left corner.',
            detail: 'Together the three finder patterns give a scanner position, scale and rotation before it reads a single data module.'
        },
        'separator-tl': {
            label: 'Separator (top left)', kind: 'fixed', group: 'function',
            description: 'The one-module light border that keeps the top-left finder pattern clear of the data.',
            detail: 'Each finder pattern is surrounded by a light separator on its inner sides. Without it, data modules touching the finder pattern would blur the 1:1:3:1:1 signature a scanner is looking for.'
        },
        'separator-tr': {
            label: 'Separator (top right)', kind: 'fixed', group: 'function',
            description: 'The light border around the top-right finder pattern.',
            detail: 'A one-module light gutter separates each finder pattern from the encoding region so the ratio test still works when a printed module bleeds.'
        },
        'separator-bl': {
            label: 'Separator (bottom left)', kind: 'fixed', group: 'function',
            description: 'The light border around the bottom-left finder pattern.',
            detail: 'The separator is part of the function pattern area: no data codeword bit is ever placed in it.'
        },
        'timing-row': {
            label: 'Timing pattern (row 6)', kind: 'timing', group: 'function',
            description: 'The alternating dark and light modules running between the finder patterns along row 6.',
            detail: 'The timing pattern is a module ruler. A scanner counts the alternations between two finder patterns to work out how wide one module is on this particular print, which is what makes perspective correction possible.'
        },
        'timing-col': {
            label: 'Timing pattern (column 6)', kind: 'timing', group: 'function',
            description: 'The alternating modules running between the finder patterns down column 6.',
            detail: 'Row 6 and column 6 cross in the middle of the symbol, giving the scanner a horizontal and a vertical ruler that meet at a known point.'
        },
        'format-1': {
            label: 'Format information (copy 1)', kind: 'format', group: 'header',
            description: 'Fifteen bits that state the error correction level and the mask pattern in use.',
            detail: 'The format field is a 5-bit value protected by a BCH(15,5) code and XORed with 0x5412. It is written twice, so a scanner can still recover the level and mask when one copy is damaged. Copy 1 sits around the top-left finder pattern.'
        },
        'format-2': {
            label: 'Format information (copy 2)', kind: 'format', group: 'header',
            description: 'The second copy of the fifteen format bits, split between the other two finder patterns.',
            detail: 'Copy 2 is placed under the top-right finder pattern and beside the bottom-left one. Reading both copies and voting is what lets a scanner decode a symbol with a scratch across one corner.'
        },
        'version-1': {
            label: 'Version information (copy 1)', kind: 'version', group: 'header',
            description: 'Eighteen bits that name the symbol version, for version 7 and above.',
            detail: 'Versions 1 to 6 have a size a scanner can infer from the finder pattern spacing, so they carry no version field. From version 7 the gap is ambiguous, and an 18-bit BCH(18,6) version field is written in two copies.'
        },
        'version-2': {
            label: 'Version information (copy 2)', kind: 'version', group: 'header',
            description: 'The second copy of the version field, above the bottom-left finder pattern.',
            detail: 'The two version blocks sit in opposite corners — the same redundancy idea as the format information, so a damaged corner does not make the symbol size unknowable.'
        },
        'dark-module': {
            label: 'Dark module', kind: 'dark', group: 'function',
            description: 'The single module that ISO/IEC 18004 requires to be dark in every symbol.',
            detail: 'The dark module sits at (4 x version + 9, 8), immediately beside the second format copy. It is always dark regardless of the data or the mask, and gives a scanner a fixed reference next to the format field.'
        },
        'remainder-bits': {
            label: 'Remainder bits', kind: 'fixed', group: 'function',
            description: 'The zero to seven unused modules left at the end of the data region.',
            detail: 'A version holds a whole number of codewords, but the data region is not always a multiple of eight modules. The leftover modules are placed last, are always light, and carry no information — this version has ' 
        }
    };

    function fixedComponent(key, cells, version) {
        if (key.indexOf('alignment-') === 0) {
            var parts = key.split('-');
            var alignRow = Number(parts[1]);
            var alignCol = Number(parts[2]);
            return {
                id: 'alignment-' + alignRow + '-' + alignCol,
                label: 'Alignment pattern at (' + alignRow + ', ' + alignCol + ')',
                kind: 'alignment',
                group: 'function',
                description: 'A 5x5 bullseye that gives a scanner a known shape away from the corners.',
                detail: 'Alignment patterns sit on a grid whose spacing grows with the version — the older the symbol, the more of them. A scanner uses the nearest one as a local reference, which is what keeps a curved or warped label readable.',
                cells: cells,
                bounds: boundsOf(cells)
            };
        }

        var meta = FIXED_META[key];
        if (!meta) {
            throw new Error('BarcodeQR: no metadata for fixed region "' + key + '".');
        }
        var detail = meta.detail;

        if (key === 'remainder-bits') {
            detail = detail + cells.length + (cells.length === 1 ? ' module.' : ' modules.');
        }

        return {
            id: key,
            label: meta.label,
            kind: meta.kind,
            group: meta.group,
            description: meta.description,
            detail: detail,
            cells: cells,
            bounds: boundsOf(cells)
        };
    }

    /* Which block and which position inside that block a symbol codeword
       occupies, plus the byte value that was placed there. */
    function codewordInfo(structure, interleaved) {
        var info = [];
        var b, p, i;
        var firstStride = structure.shortLength * structure.numBlocks;

        for (p = 0; p < structure.dataCodewords; p++) {
            if (p < firstStride) {
                b = p % structure.numBlocks;
                i = Math.floor(p / structure.numBlocks);
            } else {
                b = structure.numShort + (p - firstStride);
                i = structure.shortLength;
            }
            info.push({
                kind: 'data',
                blockIndex: b,
                indexInBlock: i,
                blockLength: structure.dataCounts[b],
                value: interleaved[p]
            });
        }

        for (p = structure.dataCodewords; p < structure.totalCodewords; p++) {
            var e = p - structure.dataCodewords;
            b = e % structure.numBlocks;
            i = Math.floor(e / structure.numBlocks);
            info.push({
                kind: 'ec',
                blockIndex: b,
                indexInBlock: i,
                blockLength: structure.ecPerBlock,
                value: interleaved[p]
            });
        }
        return info;
    }

    function codewordComponent(index, cells, info, structure) {
        var isData = info.kind === 'data';
        var blockLabel = 'block ' + (info.blockIndex + 1) + ' of ' + structure.numBlocks;
        return {
            id: 'cw-' + index,
            label: (isData ? 'Data codeword ' : 'Error correction codeword ') + index,
            kind: info.kind,
            group: 'data',
            description: isData
                ? 'Eight bits of the encoded message, placed as eight consecutive modules.'
                : 'Eight Reed-Solomon parity bits that let a scanner repair damage.',
            detail: (isData
                ? 'Data codeword ' + index + ' of ' + structure.dataCodewords + ' carries byte ' + hexByte(info.value)
                    + ' — codeword ' + (info.indexInBlock + 1) + ' of ' + info.blockLength + ' in ' + blockLabel + '.'
                : 'Error correction codeword ' + index + ' carries byte ' + hexByte(info.value)
                    + ' — parity ' + (info.indexInBlock + 1) + ' of ' + info.blockLength + ' for ' + blockLabel + '. '
                    + 'The ' + structure.ecPerBlock + ' parity codewords of a block are computed with Reed-Solomon over GF(256), which is what lets a scanner rebuild whole codewords a scratch or a smudge destroyed.'),
            cells: cells,
            bounds: boundsOf(cells)
        };
    }

    /* Build the component list and the per-cell component index map. */
    function buildComponents(version, structure, slots, placement, interleaved, alignmentSlugs) {
        var size = placement.length;
        var groups = {};
        var r, c, key;

        function add(groupKey, row, col) {
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push([row, col]);
        }

        for (r = 0; r < size; r++) {
            for (c = 0; c < size; c++) {
                key = slots[r][c];
                if (key !== null) add(key, r, c);
                else if (placement[r][c] === null) add('remainder-bits', r, c);
                else add('cw-' + placement[r][c], r, c);
            }
        }

        var order = [
            'finder-tl', 'separator-tl', 'finder-tr', 'separator-tr',
            'finder-bl', 'separator-bl', 'timing-row', 'timing-col'
        ];
        order = order.concat(alignmentSlugs);
        order = order.concat(['format-1', 'format-2']);
        if (version >= 7) order = order.concat(['version-1', 'version-2']);
        order.push('dark-module');
        for (var i = 0; i < structure.totalCodewords; i++) order.push('cw-' + i);
        order.push('remainder-bits');

        var info = codewordInfo(structure, interleaved);
        var components = [];
        var indexByKey = {};

        for (i = 0; i < order.length; i++) {
            var componentKey = order[i];
            var cells = groups[componentKey];
            if (!cells) continue;
            var component;
            if (componentKey.indexOf('cw-') === 0) {
                component = codewordComponent(Number(componentKey.slice(3)), cells,
                    info[Number(componentKey.slice(3))], structure);
            } else {
                component = fixedComponent(componentKey, cells, version);
            }
            indexByKey[componentKey] = components.length;
            components.push(component);
        }

        var moduleColors = grid(size, -1);
        for (r = 0; r < size; r++) {
            for (c = 0; c < size; c++) {
                key = slots[r][c];
                if (key === null) {
                    key = placement[r][c] === null ? 'remainder-bits' : 'cw-' + placement[r][c];
                }
                moduleColors[r][c] = indexByKey[key] === undefined ? -1 : indexByKey[key];
            }
        }

        return { components: components, moduleColors: moduleColors };
    }

    /* ================================================================== *
     * Pipeline description for the diagram
     * ================================================================== */

    function buildStages(mode, text, version, structure, mask, penalty, size, scores) {
        var maskDescription;
        if (scores) {
            var others = scores.slice();
            others.splice(mask, 1);
            var runnerUp = Math.min.apply(null, others);
            maskDescription = 'All eight mask patterns are applied in turn and scored with the four penalty rules '
                + '(N1=3, N2=3, N3=40, N4=10). Mask ' + mask + ' scored lowest at ' + penalty
                + ' points, ahead of the runner up at ' + runnerUp + '.';
        } else {
            maskDescription = 'Mask ' + mask + ' was pinned by the caller instead of being scored; it scores '
                + penalty + ' points under the four penalty rules (N1=3, N2=3, N3=40, N4=10).';
        }
        return [
            {
                id: 'segment',
                title: 'Text becomes a segment',
                description: 'The ' + segmentCharCount(mode, text) + ' character payload is encoded in '
                    + mode + ' mode: a 4-bit mode indicator, a '
                    + MODES[mode].ccBits[versionBand(version)] + '-bit character count, then the packed values.'
            },
            {
                id: 'bitstream',
                title: 'Segment becomes data codewords',
                description: 'The bit stream is terminated, padded to a codeword boundary and filled to '
                    + structure.dataCodewords + ' data codewords with the alternating pad bytes 0xEC and 0x11.'
            },
            {
                id: 'error-correction',
                title: 'Reed-Solomon parity',
                description: 'Version ' + version + ' at level ' + structure.ecLevel + ' splits the data into '
                    + structure.numBlocks + ' block' + (structure.numBlocks === 1 ? '' : 's')
                    + ' of ' + (structure.numShort === structure.numBlocks
                        ? String(structure.shortLength)
                        : structure.numShort + 'x' + structure.shortLength + ' plus '
                            + (structure.numBlocks - structure.numShort) + 'x' + (structure.shortLength + 1))
                    + ' codewords, each gaining ' + structure.ecPerBlock + ' parity codewords.'
            },
            {
                id: 'interleave',
                title: 'Blocks interleave',
                description: 'Codewords are interleaved block by block — first codeword of every block, then the '
                    + 'second, and so on — so a burst of damage is spread across all '
                    + structure.numBlocks + ' Reed-Solomon blocks. ' + structure.dataCodewords
                    + ' data and ' + structure.ecCodewords + ' parity codewords make '
                    + structure.totalCodewords + ' in total.'
            },
            {
                id: 'placement',
                title: 'Codewords fill the matrix',
                description: 'The ' + structure.totalCodewords * 8 + ' bits are placed in the encoding region in the '
                    + 'standard zig-zag order, two modules at a time, from the bottom right corner upwards, '
                    + 'skipping the function patterns. ' + REMAINDER_BITS[version]
                    + ' remainder modules are left light at the end.'
            },
            {
                id: 'mask',
                title: 'Mask and format information',
                description: maskDescription + ' The mask is XORed into the encoding region only, its '
                    + '15-bit format field is protected by BCH(15,5) and written twice, and the '
                    + size + 'x' + size + ' symbol is complete.'
            }
        ];
    }

    /* ================================================================== *
     * encode()
     * ================================================================== */

    function chooseVersion(mode, text, ecLevel, requested) {
        if (requested !== undefined && requested !== null && requested !== '') {
            var version = Number(requested);
            if (!isFinite(version) || Math.floor(version) !== version || version < 1 || version > 40) {
                throw new Error('BarcodeQR: version must be an integer from 1 to 40, got "' + requested + '".');
            }
            if (segmentBitCount(mode, text, version) > dataCodewordCapacity(version, ecLevel) * 8) {
                throw new Error('BarcodeQR: data too long for version ' + version + ' at level '
                    + ecLevel + ' — ' + segmentCharCount(mode, text) + ' characters do not fit.');
            }
            return version;
        }

        var limit = mode === 'byte' ? MAX_AUTO_BYTE_VERSION : 40;
        for (var candidate = 1; candidate <= limit; candidate++) {
            if (segmentBitCount(mode, text, candidate) <= dataCodewordCapacity(candidate, ecLevel) * 8) {
                return candidate;
            }
        }
        throw new Error('BarcodeQR: data too long — ' + segmentCharCount(mode, text) + ' characters in '
            + mode + ' mode do not fit a version ' + limit + ' symbol at error correction level '
            + ecLevel + (mode === 'byte' && limit < 40 ? ' (byte mode is capped at version '
                + MAX_AUTO_BYTE_VERSION + ')' : '') + '.');
    }

    function encode(text, opts) {
        opts = opts || {};

        if (typeof text !== 'string') {
            if (text === undefined || text === null) {
                throw new TypeError('BarcodeQR.encode(text, opts): text must be a string.');
            }
            text = String(text);
        }

        var ecLevel = normalizeEcLevel(opts.ecLevel);
        var mode = normalizeMode(opts.mode, text);
        var version = chooseVersion(mode, text, ecLevel, opts.version);
        var size = versionSize(version);
        var structure = blockStructure(version, ecLevel);

        var dataCodewords = buildDataCodewords(mode, text, version, structure.dataCodewords);
        var built = buildSymbolCodewords(structure, dataCodewords);
        var interleaved = built.interleaved;

        /* Fixed patterns, then the codeword bits. */
        var slotMap = buildSlots(version);
        var slots = slotMap.slots;
        var base = grid(size, 0);
        drawFixedPatterns(base, slots, version);
        var placement = placeCodewords(base, slots, interleaved, version);
        writeVersionBits(base, version);

        /* Score all eight masks, unless the caller pinned one. */
        var forcedMask = opts.mask;
        if (forcedMask !== undefined && forcedMask !== null) {
            forcedMask = Number(forcedMask);
            if (!isFinite(forcedMask) || Math.floor(forcedMask) !== forcedMask || forcedMask < 0 || forcedMask > 7) {
                throw new Error('BarcodeQR: mask must be an integer from 0 to 7, got "' + opts.mask + '".');
            }
        }

        var bestMask = forcedMask === undefined || forcedMask === null ? 0 : forcedMask;
        var bestScore = null;
        var scores = null;
        if (forcedMask === undefined || forcedMask === null) {
            scores = [];
            for (var m = 0; m < 8; m++) {
                var candidate = copyGrid(base);
                applyMask(candidate, slots, m);
                writeFormatBits(candidate, ecLevel, m);
                var score = penaltyScore(candidate);
                scores.push(score);
                if (bestScore === null || score < bestScore) {
                    bestScore = score;
                    bestMask = m;
                }
            }
        }

        var matrix = copyGrid(base);
        applyMask(matrix, slots, bestMask);
        writeFormatBits(matrix, ecLevel, bestMask);
        var finalScore = bestScore === null ? penaltyScore(matrix) : bestScore;

        /* The two masks the diagram shows: what is fixed by the standard, and
           what is therefore off limits to the data placement. A module that
           holds no codeword bit — a function pattern, a format or version
           field, or one of the remainder modules — is marked in both. */
        var functionMask = grid(size, 0);
        var reservedMask = grid(size, 0);
        for (var r = 0; r < size; r++) {
            for (var c = 0; c < size; c++) {
                if (slots[r][c] !== null || placement[r][c] === null) {
                    functionMask[r][c] = 1;
                    reservedMask[r][c] = 1;
                }
            }
        }

        /* Error correction blocks, described from both sides: the data half and
           the parity half of each block. startCodeword is the position in the
           interleaved sequence the symbol carries, which is the same index
           space as `placement` and the cw-* components. */
        var blocks = [];
        for (var b = 0; b < structure.numBlocks; b++) {
            blocks.push({
                index: blocks.length,
                kind: 'data',
                ecBlockIndex: b,
                startCodeword: b,
                codewordCount: structure.dataCounts[b],
                dataCodewords: structure.dataCounts[b],
                ecCodewords: structure.ecPerBlock,
                totalCodewords: structure.dataCounts[b] + structure.ecPerBlock
            });
            blocks.push({
                index: blocks.length,
                kind: 'ec',
                ecBlockIndex: b,
                startCodeword: structure.dataCodewords + b,
                codewordCount: structure.ecPerBlock,
                dataCodewords: structure.dataCounts[b],
                ecCodewords: structure.ecPerBlock,
                totalCodewords: structure.dataCounts[b] + structure.ecPerBlock
            });
        }

        var built2 = buildComponents(version, structure, slots, placement, interleaved,
            slotMap.alignmentSlugs);

        var summary = {
            moduleCount: size * size,
            dataModules: structure.dataCodewords * 8,
            ecModules: structure.ecCodewords * 8,
            functionModules: size * size - structure.dataCodewords * 8 - structure.ecCodewords * 8,
            dataCapacityBytes: byteCapacity(version, ecLevel),
            errorCorrectionPercent: Math.round(structure.ecCodewords / structure.totalCodewords * 1000) / 10
        };

        return {
            text: text,
            version: version,
            ecLevel: ecLevel,
            mask: bestMask,
            size: size,
            mode: mode,
            segments: [{
                mode: mode,
                charCount: segmentCharCount(mode, text),
                bits: 4 + MODES[mode].ccBits[versionBand(version)] + segmentPayloadBits(mode, text).length
            }],
            maskFormula: MASK_FORMULAS[bestMask],
            matrix: matrix,
            functionMask: functionMask,
            reservedMask: reservedMask,
            placement: placement,
            dataCodewords: structure.dataCodewords,
            ecCodewords: structure.ecCodewords,
            totalCodewords: structure.totalCodewords,
            blocks: blocks,
            moduleColors: built2.moduleColors,
            components: built2.components,
            summary: summary,
            stages: buildStages(mode, text, version, structure, bestMask, finalScore, size, scores)
        };
    }

    /* ================================================================== *
     * Exports
     * ================================================================== */

    return {
        encode: encode,
        EC_LEVELS: EC_LEVELS,
        MAX_AUTO_BYTE_VERSION: MAX_AUTO_BYTE_VERSION,
        /* Component kinds, so a legend can be built without hard-coding them. */
        FUNCTION_KINDS: FUNCTION_KINDS.slice(),
        DATA_KINDS: DATA_KINDS.slice(),
        maskFormulas: MASK_FORMULAS.slice(),
        versionSize: versionSize,
        alignmentPositions: function (version) {
            return (ALIGNMENT_POSITIONS[version] || []).slice();
        },
        remainderBits: function (version) {
            return REMAINDER_BITS[version];
        },
        totalCodewords: function (version) {
            return TOTAL_CODEWORDS[version];
        },
        ecCodewords: function (version, ecLevel) {
            var structure = blockStructure(version, normalizeEcLevel(ecLevel));
            return structure.ecCodewords;
        },
        dataCodewords: function (version, ecLevel) {
            return dataCodewordCapacity(version, normalizeEcLevel(ecLevel));
        },
        byteCapacity: function (version, ecLevel) {
            return byteCapacity(version, normalizeEcLevel(ecLevel));
        },
        blockStructure: function (version, ecLevel) {
            return blockStructure(version, normalizeEcLevel(ecLevel));
        },
        formatBits: formatBits,
        versionBits: versionBits,
        finderValue: finderValue,
        maskFormula: function (mask) {
            return MASK_FORMULAS[mask];
        },
        /* Internals the test suite leans on. Not part of the demo's contract. */
        _internals: {
            TOTAL_CODEWORDS: TOTAL_CODEWORDS,
            EC_CODEWORDS_PER_BLOCK: EC_CODEWORDS_PER_BLOCK,
            EC_BLOCK_COUNT: EC_BLOCK_COUNT,
            ALIGNMENT_POSITIONS: ALIGNMENT_POSITIONS,
            REMAINDER_BITS: REMAINDER_BITS,
            MODES: MODES,
            ALPHANUMERIC_CHARS: ALPHANUMERIC_CHARS,
            gfMul: gfMul,
            rsGenerator: rsGenerator,
            rsEncode: rsEncode,
            utf8Bytes: utf8Bytes,
            manualBytes: manualBytes,
            detectMode: detectMode,
            segmentPayloadBits: segmentPayloadBits,
            penaltyScore: penaltyScore,
            penaltyBreakdown: penaltyBreakdown,
            isValidMask: isValidMask,
            applyMask: applyMask,
            writeFormatBits: writeFormatBits,
            buildSlots: buildSlots
        }
    };
}));
