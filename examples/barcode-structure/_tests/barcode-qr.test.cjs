'use strict';
/*
 * Tests for demos/barcode-structure/barcode-qr.js
 *
 *   node --test demos/barcode-structure/_tests/barcode-qr.test.cjs
 *
 * Four kinds of evidence, strongest first:
 *
 *   1. Reference matrices.  Five symbols are compared module by module against
 *      matrices produced by an independent encoder (python-qrcode) with the
 *      mask pinned, so the comparison does not depend on how either encoder
 *      scores masks.  A further 160 symbols — every version from 1 to 40 at
 *      every error correction level — are compared through a checksum of the
 *      whole matrix, so table errors anywhere in the version range are caught.
 *      The '01234567' 1-M vector is the worked example from ISO/IEC 18004 and
 *      its data and error correction codewords are asserted byte for byte.
 *   2. A decoder written here, from the standard rather than from the module:
 *      it rebuilds the function map, unmaskes, walks the zigzag placement,
 *      de-interleaves and parses the segment.  It never reads `placement`,
 *      `functionMask` or `reservedMask`, so a placement bug cannot hide behind
 *      a symmetric one in the metadata.
 *   3. Independent maths: Reed-Solomon syndromes recomputed with a different
 *      GF(256) multiply, BCH format and version fields decoded by polynomial
 *      division, and the standard's format and version tables embedded whole.
 *   4. Structural invariants: component coverage, placement coverage, the
 *      function module count for all 40 versions and all four levels, the
 *      penalty rules on hand-computed matrices, and determinism.
 *
 * The reference data at the top was generated with python-qrcode and with the
 * ISO/IEC 18004 worked example; it is embedded so the test needs no network and
 * no installed package.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const BarcodeQR = require(path.join(__dirname, '..', 'barcode-qr.js'));
const internals = BarcodeQR._internals;

/* -------------------------------------------------------------------- *
 * Reference data, generated outside this repository.
 *
 *   matrices      python-qrcode (an independent encoder), mask pinned
 *   sweep         FNV-1a over the whole matrix of "A" at mask 0, every
 *                 version 1-40 at every level, from the same encoder
 *   formatBits    BCH(15,5) values from the same library
 *   versionBits   BCH(18,6) values from the same library
 *   isoCodewords  the ISO/IEC 18004 worked example, 01234567 at 1-M
 * -------------------------------------------------------------------- */

const REFERENCE_VECTORS = [
    {
        id: "iso-01234567",
        text: "01234567",
        ecLevel: "M",
        version: 1,
        mask: 2,
        pythonRules: {"n1":206,"n2":111,"n4":0},
        rows: [
            "111111100101101111111",
            "100000100111101000001",
            "101110101000001011101",
            "101110101100001011101",
            "101110101011101011101",
            "100000101000101000001",
            "111111101010101111111",
            "000000001001100000000",
            "101111100100101111100",
            "000101011010100101100",
            "001000110101010011111",
            "000010000100000111100",
            "000111111001010010000",
            "000000001011111001100",
            "111111100110101100000",
            "100000101011111000101",
            "101110101000100101100",
            "101110101100100100000",
            "101110101011010010100",
            "100000100000000110110",
            "111111101111010010100"
        ]
    },
    {
        id: "hello-world",
        text: "HELLO WORLD",
        ecLevel: "Q",
        version: 1,
        mask: 0,
        pythonRules: {"n1":177,"n2":90,"n4":0},
        rows: [
            "111111101100001111111",
            "100000101001001000001",
            "101110101001101011101",
            "101110101000001011101",
            "101110101010001011101",
            "100000100010001000001",
            "111111101010101111111",
            "000000001000000000000",
            "011010110000101011111",
            "010000001111000010001",
            "001101110110001011000",
            "011011010011010101110",
            "100010101011101110101",
            "000000001101001000101",
            "111111101010000101100",
            "100000100101101101000",
            "101110101010001111111",
            "101110100101010100010",
            "101110101001011101001",
            "100000101011110001011",
            "111111100001011100001"
        ]
    },
    {
        id: "utf8-cn",
        text: "\u4f60\u597d\uff0c\u4e16\u754c \u2014 QR",
        ecLevel: "H",
        version: 3,
        mask: 1,
        pythonRules: {"n1":246,"n2":222,"n4":0},
        rows: [
            "11111110011111110011001111111",
            "10000010110111100001001000001",
            "10111010111110110010001011101",
            "10111010110100101001101011101",
            "10111010101000011100101011101",
            "10000010100001111001001000001",
            "11111110101010101010101111111",
            "00000000001110011010100000000",
            "00100111111001100111110111110",
            "00010000100010001010010011011",
            "11000011001101001011100110110",
            "10000101101010100101010000100",
            "01101010000001110001100001101",
            "11110101101011010001101011110",
            "00000011110000001010101010110",
            "10101001000010001110100100111",
            "11101011000010111110011111001",
            "00011000010111111000101011101",
            "11010110111101000011000101100",
            "00110100010001110100011000001",
            "11111111011000011101111111001",
            "00000000100010100100100010001",
            "11111110101100100101101011100",
            "10000010110111101000100011101",
            "10111010010100011110111111001",
            "10111010010111100000001010010",
            "10111010101100011110000101111",
            "10000010001101100011000101100",
            "11111110001000110000111011001"
        ]
    },
    {
        id: "byte-v5",
        text: "https://www.dynamsoft.com/demos/barcode-structure/",
        ecLevel: "M",
        version: 5,
        mask: 2,
        pythonRules: {"n1":400,"n2":360,"n4":0},
        rows: [
            "1111111001110100100000000011001111111",
            "1000001001010111001011111001101000001",
            "1011101010001010000001110011001011101",
            "1011101010110110010000011111001011101",
            "1011101010110111010111010100101011101",
            "1000001010101101110001000111001000001",
            "1111111010101010101010101010101111111",
            "0000000011011110111101110100100000000",
            "1011111001101001100001010010001111100",
            "1110010100110011001010101101101111010",
            "1101001100110011111100100010011010111",
            "1000100011110111001111101010110110001",
            "1000111101111111110100101110011110111",
            "1010110001000110101110010010110100000",
            "0001101101011001101010100001101111011",
            "0001100001011010000110011011011110011",
            "1001001100000001001111101000101000111",
            "0100010100111011100001000011011000010",
            "1101111001101000011011111101111111011",
            "1001000010000100100001010011010110001",
            "0000011101101100110000111111111010100",
            "1100000001111100111101010100110001010",
            "1100011001101101110011001111010111011",
            "0111110011100111111101110101100110000",
            "0100001011010100100001010011010010101",
            "1000110110001101011011101101101000000",
            "1011011110110001110101100110011100011",
            "1010010100111001000111101010110100000",
            "1000111010100111010110101110111110101",
            "0000000011111100001110011001100011010",
            "1111111001011011101010101000101010111",
            "1000001010101111100110000010100011001",
            "1011101011001111001111101001111110111",
            "1011101010001001100000000011101011010",
            "1011101011111110000011111110100001101",
            "1000001001011110101001110000001010001",
            "1111111011010000010000110111011011111"
        ]
    },
    {
        id: "alpha-v7",
        text: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ecLevel: "Q",
        version: 7,
        mask: 2,
        pythonRules: {"n1":541,"n2":552,"n4":0},
        rows: [
            "111111101100010010100111100010111000101111111",
            "100000100100110100010010100101010001001000001",
            "101110100110001000101000000001000101001011101",
            "101110100110001101001010110100100101101011101",
            "101110101000010001001111100111011111101011101",
            "100000101101110110011000110000100100001000001",
            "111111101010101010101010101010101010101111111",
            "000000000000011101001000101010110110100000000",
            "011111110000110010111111110101000001100110001",
            "101110000011001010010100001100101110110100100",
            "100101101011000010010010000010110100011110111",
            "101000011101010111000101011100011011100011010",
            "001101111001000001001101000101100100110100000",
            "100001011001100001111000111010000010011010011",
            "010111111100011110001100000100111101100000110",
            "110000001001111111000000011101011100010111100",
            "110010111101000001011010101010110000011001001",
            "111110000010011010010001110101000011100111010",
            "100000110101000000101111101010101100011010100",
            "110000010010000010100111111101010001000100100",
            "100111111000011100101111101010000011111111011",
            "001010001101111000111000111111101100100011000",
            "100110101110111010001010100010010010101010111",
            "110010001000000100111000101010100010100011010",
            "001111111110000100001111100000101100111110100",
            "100111001111111111011110111101010011011010110",
            "111110100111001011101110110110001100001101001",
            "111010011101110010110000000110111011110010111",
            "010110101011110101001111001011010110100100100",
            "101000010011001100010010010100000000010111011",
            "101000101110001011010010000101101111011000100",
            "000000010011000010110010011101001001000110111",
            "000100101001011111101110011010011010100111010",
            "101000001001011110010111001001100100100001101",
            "000010110100111110101000101100000011111110010",
            "011110011000100000111100000011100101001010101",
            "100110101000101011101111110001011011111111111",
            "000000001000110001111000101100110110100010110",
            "111111101100000010111010111111000000101011001",
            "100000101110110010011000111000110010100010111",
            "101110101110101100101111101101001100111110100",
            "101110101101000111000011110110011101000000011",
            "101110101010101111110111101001100010111111100",
            "100000101001100011110000101100101100100010001",
            "111111100011010001010100010100111101000100100"
        ]
    }
];

/* FNV-1a (32 bit) of the concatenated rows of each reference matrix. */
const REFERENCE_SWEEP = {
    "v1-L": 3704631555,
    "v2-L": 626357607,
    "v3-L": 2361099221,
    "v4-L": 3669686755,
    "v5-L": 839716025,
    "v6-L": 3433651499,
    "v7-L": 2812478985,
    "v8-L": 2522646765,
    "v9-L": 3463425503,
    "v10-L": 1722978467,
    "v11-L": 1818995333,
    "v12-L": 714850301,
    "v13-L": 2676059933,
    "v14-L": 2918861043,
    "v15-L": 1924374971,
    "v16-L": 846943291,
    "v17-L": 3786169795,
    "v18-L": 4104659023,
    "v19-L": 675880055,
    "v20-L": 242900461,
    "v21-L": 2097083145,
    "v22-L": 3507932293,
    "v23-L": 1111278043,
    "v24-L": 412177349,
    "v25-L": 226095185,
    "v26-L": 1250980695,
    "v27-L": 1174570375,
    "v28-L": 1653168187,
    "v29-L": 1482409277,
    "v30-L": 4082472651,
    "v31-L": 3361436639,
    "v32-L": 3925489479,
    "v33-L": 2724272927,
    "v34-L": 3715981775,
    "v35-L": 3134635833,
    "v36-L": 895827447,
    "v37-L": 3134730273,
    "v38-L": 3646139743,
    "v39-L": 2096499635,
    "v40-L": 1962129571,
    "v1-M": 4096519923,
    "v2-M": 1763981599,
    "v3-M": 3572831941,
    "v4-M": 998407999,
    "v5-M": 2987407947,
    "v6-M": 4171312163,
    "v7-M": 1147987787,
    "v8-M": 923666381,
    "v9-M": 1281573041,
    "v10-M": 2908374115,
    "v11-M": 648702265,
    "v12-M": 1696659171,
    "v13-M": 3782018187,
    "v14-M": 1164130275,
    "v15-M": 1585638855,
    "v16-M": 3312209183,
    "v17-M": 4059250135,
    "v18-M": 934664335,
    "v19-M": 1690222791,
    "v20-M": 795215911,
    "v21-M": 1168718421,
    "v22-M": 3061234475,
    "v23-M": 2572038723,
    "v24-M": 1769045911,
    "v25-M": 1807651931,
    "v26-M": 2871115015,
    "v27-M": 4175109995,
    "v28-M": 1246489255,
    "v29-M": 2431973563,
    "v30-M": 3434794277,
    "v31-M": 1601447613,
    "v32-M": 153278797,
    "v33-M": 3375527879,
    "v34-M": 3069811209,
    "v35-M": 553270857,
    "v36-M": 3844588837,
    "v37-M": 1146415569,
    "v38-M": 2036583267,
    "v39-M": 840143375,
    "v40-M": 2562442803,
    "v1-Q": 1583675945,
    "v2-Q": 1550642705,
    "v3-Q": 10675983,
    "v4-Q": 1894220963,
    "v5-Q": 1222002411,
    "v6-Q": 3736897839,
    "v7-Q": 2862999403,
    "v8-Q": 1104601231,
    "v9-Q": 3567639171,
    "v10-Q": 883809035,
    "v11-Q": 109104635,
    "v12-Q": 3642209475,
    "v13-Q": 3992900251,
    "v14-Q": 2343757487,
    "v15-Q": 3618098987,
    "v16-Q": 1984420529,
    "v17-Q": 3960560833,
    "v18-Q": 902086065,
    "v19-Q": 2963282301,
    "v20-Q": 1527274747,
    "v21-Q": 3610860653,
    "v22-Q": 3431674969,
    "v23-Q": 3645507431,
    "v24-Q": 1165089995,
    "v25-Q": 3647063155,
    "v26-Q": 2264447927,
    "v27-Q": 3560083393,
    "v28-Q": 2230451461,
    "v29-Q": 577853129,
    "v30-Q": 1345663491,
    "v31-Q": 3500250599,
    "v32-Q": 541339893,
    "v33-Q": 959285193,
    "v34-Q": 1788159473,
    "v35-Q": 565782825,
    "v36-Q": 1154841615,
    "v37-Q": 2018551479,
    "v38-Q": 1725385177,
    "v39-Q": 925079027,
    "v40-Q": 2128454511,
    "v1-H": 3549293261,
    "v2-H": 2573382925,
    "v3-H": 3902003237,
    "v4-H": 2214852305,
    "v5-H": 3492178197,
    "v6-H": 533704187,
    "v7-H": 3549888463,
    "v8-H": 2459642493,
    "v9-H": 2103814673,
    "v10-H": 12922097,
    "v11-H": 4045269173,
    "v12-H": 415177541,
    "v13-H": 3322754985,
    "v14-H": 2155292859,
    "v15-H": 125949267,
    "v16-H": 1643995079,
    "v17-H": 2613839621,
    "v18-H": 430707627,
    "v19-H": 1641512079,
    "v20-H": 2089970855,
    "v21-H": 3466606859,
    "v22-H": 1101746659,
    "v23-H": 736421421,
    "v24-H": 1240112697,
    "v25-H": 3338541807,
    "v26-H": 610152189,
    "v27-H": 2166986245,
    "v28-H": 514621261,
    "v29-H": 1491633925,
    "v30-H": 2791392509,
    "v31-H": 3858129701,
    "v32-H": 1746437559,
    "v33-H": 2841461071,
    "v34-H": 4041227539,
    "v35-H": 2848200233,
    "v36-H": 4290119319,
    "v37-H": 836955527,
    "v38-H": 316286097,
    "v39-H": 3577767397,
    "v40-H": 2841368753
};

const REFERENCE_FORMAT_BITS = {
    "L-0": 30660,
    "L-1": 29427,
    "L-2": 32170,
    "L-3": 30877,
    "L-4": 26159,
    "L-5": 25368,
    "L-6": 27713,
    "L-7": 26998,
    "M-0": 21522,
    "M-1": 20773,
    "M-2": 24188,
    "M-3": 23371,
    "M-4": 17913,
    "M-5": 16590,
    "M-6": 20375,
    "M-7": 19104,
    "Q-0": 13663,
    "Q-1": 12392,
    "Q-2": 16177,
    "Q-3": 14854,
    "Q-4": 9396,
    "Q-5": 8579,
    "Q-6": 11994,
    "Q-7": 11245,
    "H-0": 5769,
    "H-1": 5054,
    "H-2": 7399,
    "H-3": 6608,
    "H-4": 1890,
    "H-5": 597,
    "H-6": 3340,
    "H-7": 2107
};

const REFERENCE_VERSION_BITS = {
    7: 31892,
    8: 34236,
    9: 39577,
    10: 42195,
    11: 48118,
    12: 51042,
    13: 55367,
    14: 58893,
    15: 63784,
    16: 68472,
    17: 70749,
    18: 76311,
    19: 79154,
    20: 84390,
    21: 87683,
    22: 92361,
    23: 96236,
    24: 102084,
    25: 102881,
    26: 110507,
    27: 110734,
    28: 117786,
    29: 119615,
    30: 126325,
    31: 127568,
    32: 133589,
    33: 136944,
    34: 141498,
    35: 145311,
    36: 150283,
    37: 152622,
    38: 158308,
    39: 161089,
    40: 167017
};

/* The complete interleaved codeword sequence of the ISO worked example. */
const ISO_CODEWORDS = [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17, 165, 36, 212, 193, 237, 54, 199, 135, 44, 85];
const ISO_DATA_CODEWORDS = ISO_CODEWORDS.slice(0, 16);
const ISO_EC_CODEWORDS = ISO_CODEWORDS.slice(16);

const MASK_CASES = [
    { id: "iso-01234567", text: "01234567", ecLevel: "M", version: 1, expectedMask: 2 },
    { id: "hello-world", text: "HELLO WORLD", ecLevel: "Q", version: 1, expectedMask: 0 },
    { id: "utf8-cn", text: "\u4f60\u597d\uff0c\u4e16\u754c \u2014 QR", ecLevel: "H", version: 3, expectedMask: 1 },
    { id: "byte-url", text: "https://www.dynamsoft.com/demos/barcode-structure/", ecLevel: "M", version: 5, expectedMask: 2 },
    { id: "alpha-v7", text: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", ecLevel: "Q", version: 7, expectedMask: 2 },
    { id: "numeric-v10", text: "99999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999", ecLevel: "H", version: 10, expectedMask: 5 }
];

/* ==================================================================== *
 * Helpers: an independent decoder
 * ==================================================================== */

/* Alignment pattern coordinates computed from the spacing rule (ISO/IEC 18004
   Annex E) rather than read from the module's table, so the two can be
   compared. */
function derivedAlignmentPositions(version) {
    if (version === 1) return [];
    const size = version * 4 + 17;
    const count = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26
        : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
    const positions = [6];
    for (let i = count - 2; i >= 0; i--) positions.push(size - 7 - i * step);
    return positions;
}

/* Which cells are fixed by the standard, rebuilt from the version alone. */
function buildFunctionMap(version) {
    const size = version * 4 + 17;
    const map = Array.from({ length: size }, () => new Array(size).fill(0));
    const mark = (row, col) => {
        if (row >= 0 && col >= 0 && row < size && col < size) map[row][col] = 1;
    };

    /* Finder patterns with their separators: the 7x7 pattern plus the
       one-module ring on its inner sides. */
    for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) mark(top + r, left + c);
        }
    }

    /* Alignment patterns, skipping the three corners that hold finders. */
    const positions = derivedAlignmentPositions(version);
    for (let i = 0; i < positions.length; i++) {
        for (let j = 0; j < positions.length; j++) {
            const last = positions.length - 1;
            if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) mark(positions[i] + dr, positions[j] + dc);
            }
        }
    }

    /* Timing patterns. */
    for (let i = 8; i <= size - 9; i++) {
        mark(6, i);
        mark(i, 6);
    }

    /* Format information, both copies, plus the dark module. */
    for (let i = 0; i <= 5; i++) {
        mark(i, 8);
        mark(8, i);
    }
    mark(7, 8);
    mark(8, 7);
    mark(8, 8);
    for (let i = 0; i < 8; i++) mark(8, size - 1 - i);
    for (let i = 8; i < 15; i++) mark(size - 15 + i, 8);
    mark(size - 8, 8);

    /* Version information, two copies, version 7 and above. */
    if (version >= 7) {
        for (let i = 0; i < 18; i++) {
            const a = size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            mark(a, b);
            mark(b, a);
        }
    }

    return map;
}

const MASK_FUNCS = [
    (row, col) => (row + col) % 2 === 0,
    (row, col) => row % 2 === 0,
    (row, col) => col % 3 === 0,
    (row, col) => (row + col) % 3 === 0,
    (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
    (row, col) => (row * col) % 2 + (row * col) % 3 === 0,
    (row, col) => ((row * col) % 2 + (row * col) % 3) % 2 === 0,
    (row, col) => ((row + col) % 2 + (row * col) % 3) % 2 === 0
];

/* Polynomial division: the remainder of `value` divided by `poly`, both read as
   bit strings whose highest power is at `topBit`. */
function bchRemainder(value, poly, degree, topBit) {
    let rest = value;
    for (let bit = topBit; bit >= degree; bit--) {
        if (rest & (1 << bit)) rest ^= poly << (bit - degree);
    }
    return rest;
}

/* Read both copies of the format field and check the BCH(15,5) code. */
function readFormatInfo(matrix) {
    const size = matrix.length;
    const copy1 = [];
    const copy2 = [];
    for (let i = 0; i <= 5; i++) copy1.push([i, 8]);
    copy1.push([7, 8], [8, 8], [8, 7]);
    for (let i = 9; i < 15; i++) copy1.push([8, 14 - i]);
    for (let i = 0; i < 8; i++) copy2.push([8, size - 1 - i]);
    for (let i = 8; i < 15; i++) copy2.push([size - 15 + i, 8]);

    const read = (cells) => cells.reduce((value, [row, col], bit) => value | (matrix[row][col] << bit), 0);
    const decode = (raw) => {
        /* Unmask with 0x5412; the five data bits sit above the ten BCH bits. */
        const codeword = raw ^ 0x5412;
        return {
            raw,
            codeword,
            data: (codeword >> 10) & 0x1f,
            valid: bchRemainder(codeword, 0x537, 10, 14) === 0
        };
    };
    return { copy1: decode(read(copy1)), copy2: decode(read(copy2)) };
}

const EC_LEVEL_FROM_BITS = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

/* Read the 18-bit version field from both copies (version 7 and above). */
function readVersionInfo(matrix) {
    const version = (matrix.length - 17) / 4;
    if (version < 7) return null;
    const size = matrix.length;
    let copy1 = 0;
    let copy2 = 0;
    for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        copy1 |= matrix[a][b] << i;
        copy2 |= matrix[b][a] << i;
    }
    return { copy1, copy2 };
}

/* Reverse the placement: unmask the data region and walk the zigzag. */
function readCodewords(matrix, version, mask) {
    const size = matrix.length;
    const isFunction = buildFunctionMap(version);
    const bits = [];
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        const upward = ((right + 1) & 2) === 0;
        for (let vertical = 0; vertical < size; vertical++) {
            for (let j = 0; j < 2; j++) {
                const col = right - j;
                const row = upward ? size - 1 - vertical : vertical;
                if (isFunction[row][col]) continue;
                bits.push(matrix[row][col] ^ (MASK_FUNCS[mask](row, col) ? 1 : 0));
            }
        }
    }
    const words = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        let value = 0;
        for (let k = 0; k < 8; k++) value = (value << 1) | bits[i + k];
        words.push(value);
    }
    return { words, totalBits: bits.length };
}

/* Undo the interleaving, using only the block sizes the encoder reports. */
function deinterleave(words, result) {
    const dataEntries = result.blocks.filter((b) => b.kind === 'data')
        .sort((a, b) => a.ecBlockIndex - b.ecBlockIndex);
    const ecEntries = result.blocks.filter((b) => b.kind === 'ec')
        .sort((a, b) => a.ecBlockIndex - b.ecBlockIndex);
    const dataCounts = dataEntries.map((b) => b.codewordCount);
    const ecCount = ecEntries[0].codewordCount;
    const numBlocks = dataCounts.length;
    const dataBlocks = dataCounts.map(() => []);
    const ecBlocks = dataCounts.map(() => []);
    let position = 0;

    for (let i = 0; i < Math.max.apply(null, dataCounts); i++) {
        for (let b = 0; b < numBlocks; b++) {
            if (i < dataCounts[b]) dataBlocks[b].push(words[position++]);
        }
    }
    for (let i = 0; i < ecCount; i++) {
        for (let b = 0; b < numBlocks; b++) ecBlocks[b].push(words[position++]);
    }
    return { dataBlocks, ecBlocks, dataCounts, ecCount };
}

const MODE_NAMES = { 1: 'numeric', 2: 'alphanumeric', 4: 'byte' };
const COUNT_BITS = { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] };

/* Parse the first segment out of the de-interleaved data codewords. */
function parseSegment(dataBlocks, version) {
    const bits = [];
    for (const block of dataBlocks) {
        for (const word of block) {
            for (let k = 7; k >= 0; k--) bits.push((word >> k) & 1);
        }
    }
    let cursor = 0;
    const take = (n) => {
        let value = 0;
        for (let k = 0; k < n; k++) value = (value << 1) | bits[cursor++];
        return value;
    };

    const indicator = take(4);
    const mode = MODE_NAMES[indicator];
    if (!mode) throw new Error('unknown mode indicator ' + indicator);
    const band = version <= 9 ? 0 : (version <= 26 ? 1 : 2);
    const charCount = take(COUNT_BITS[mode][band]);

    if (mode === 'numeric') {
        let text = '';
        let left = charCount;
        while (left >= 3) {
            text += String(take(10)).padStart(3, '0');
            left -= 3;
        }
        if (left === 2) text += String(take(7)).padStart(2, '0');
        else if (left === 1) text += String(take(4));
        return { mode, charCount, text };
    }

    if (mode === 'alphanumeric') {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
        let text = '';
        let left = charCount;
        while (left >= 2) {
            const value = take(11);
            text += chars[Math.floor(value / 45)] + chars[value % 45];
            left -= 2;
        }
        if (left === 1) text += chars[take(6)];
        return { mode, charCount, text };
    }

    const bytes = [];
    for (let i = 0; i < charCount; i++) bytes.push(take(8));
    return { mode, charCount, text: Buffer.from(bytes).toString('utf8'), bytes };
}

/* The whole independent decode path, ending in text. */
function decodePayload(result) {
    const matrix = result.matrix;
    const format = readFormatInfo(matrix);
    const ecLevel = EC_LEVEL_FROM_BITS[(format.copy1.data >> 3) & 3];
    const mask = format.copy1.data & 7;
    const { words, totalBits } = readCodewords(matrix, result.version, mask);
    const blocks = deinterleave(words, result);
    return {
        ecLevel,
        mask,
        format,
        words,
        totalBits,
        dataBlocks: blocks.dataBlocks,
        ecBlocks: blocks.ecBlocks,
        dataCounts: blocks.dataCounts,
        ecCount: blocks.ecCount,
        segment: parseSegment(blocks.dataBlocks, result.version),
        versionInfo: readVersionInfo(matrix)
    };
}

/* ==================================================================== *
 * Helpers: independent maths and matrices
 * ==================================================================== */

/* GF(256) multiply by shift and conditional XOR — no lookup tables, so it
   shares no code path with the module. */
function gfMultiply(a, b) {
    let result = 0;
    let left = a;
    let right = b;
    while (right > 0) {
        if (right & 1) result ^= left;
        left <<= 1;
        if (left & 0x100) left ^= 0x11d;
        right >>= 1;
    }
    return result;
}

function gfPowerOfTwo(exponent) {
    let result = 1;
    for (let i = 0; i < exponent; i++) result = gfMultiply(result, 2);
    return result;
}

/* A Reed-Solomon codeword is divisible by the generator polynomial, so it
   evaluates to zero at each of the generator's roots a^0 .. a^(ecCount-1). */
function rsSyndromes(codewords, ecCount) {
    const syndromes = [];
    for (let i = 0; i < ecCount; i++) {
        const root = gfPowerOfTwo(i);
        let value = 0;
        for (const word of codewords) value = gfMultiply(value, root) ^ word;
        syndromes.push(value);
    }
    return syndromes;
}

/* FNV-1a, computed the same way in the reference generator. */
function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function rowsOf(result) {
    return result.matrix.map((row) => row.join(''));
}

function firstDifference(actual, expected) {
    for (let r = 0; r < expected.length; r++) {
        if (actual[r] === expected[r]) continue;
        for (let c = 0; c < expected[r].length; c++) {
            if (actual[r][c] !== expected[r][c]) {
                return 'row ' + r + ', col ' + c + ': got ' + actual[r][c] + ', expected ' + expected[r][c];
            }
        }
        return 'row ' + r + ' has length ' + actual[r].length + ', expected ' + expected[r].length;
    }
    return 'no difference found';
}

function assertReferenceMatrix(result, rows, label) {
    const actual = rowsOf(result);
    assert.equal(actual.length, rows.length, label + ': symbol size');
    for (let r = 0; r < rows.length; r++) {
        assert.equal(actual[r], rows[r], label + ': ' + firstDifference(actual, rows));
    }
}

/* A 21x21 light matrix with one row filled in at the given coordinates. */
function lightMatrix() {
    return Array.from({ length: 21 }, () => new Array(21).fill(0));
}

function matrixWithPattern(cells) {
    const matrix = lightMatrix();
    for (const [col, value] of cells) matrix[10][col] = value;
    return matrix;
}

function finderLikeAt(startCol) {
    return [1, 0, 1, 1, 1, 0, 1].map((value, i) => [startCol + i, value]);
}

/* ==================================================================== *
 * 1. API surface
 * ==================================================================== */

test('encode returns the documented shape', () => {
    const result = BarcodeQR.encode('HELLO WORLD', { ecLevel: 'Q' });
    const keys = ['text', 'version', 'ecLevel', 'mask', 'size', 'mode', 'segments',
        'maskFormula', 'matrix', 'functionMask', 'reservedMask', 'placement',
        'dataCodewords', 'ecCodewords', 'totalCodewords', 'blocks', 'moduleColors',
        'components', 'summary', 'stages'];
    for (const key of keys) assert.ok(key in result, 'missing key ' + key);

    assert.equal(result.text, 'HELLO WORLD');
    assert.equal(result.ecLevel, 'Q');
    assert.equal(result.mode, 'alphanumeric');
    assert.ok(result.version >= 1 && result.version <= 40);
    assert.equal(result.size, result.version * 4 + 17);
    assert.ok(result.mask >= 0 && result.mask <= 7);
    assert.equal(result.maskFormula, BarcodeQR.maskFormula(result.mask));

    for (const key of ['matrix', 'functionMask', 'reservedMask', 'placement', 'moduleColors']) {
        assert.ok(Array.isArray(result[key]), key + ' is an array');
        assert.equal(result[key].length, result.size, key + ' has size rows');
        for (const row of result[key]) {
            assert.ok(Array.isArray(row), key + ' rows are arrays');
            assert.equal(row.length, result.size, key + ' rows have size columns');
        }
    }
    for (const row of result.matrix) {
        for (const value of row) assert.ok(value === 0 || value === 1, 'matrix is 0/1');
    }

    assert.equal(result.segments.length, 1);
    assert.deepEqual(Object.keys(result.segments[0]).sort(), ['bits', 'charCount', 'mode']);
    assert.equal(result.segments[0].mode, result.mode);
    assert.equal(result.segments[0].charCount, 11);
    assert.equal(result.segments[0].bits, 4 + 9 + 61, '4 mode + 9 count + 11 alphanumeric chars');

    assert.equal(result.totalCodewords, result.dataCodewords + result.ecCodewords);
    assert.equal(result.totalCodewords, BarcodeQR.totalCodewords(result.version));
});

test('summary, blocks and stages are self consistent', () => {
    const result = BarcodeQR.encode('https://example.com/a/b/c', { ecLevel: 'M' });
    const summary = result.summary;

    assert.equal(summary.moduleCount, result.size * result.size);
    assert.equal(summary.dataModules, result.dataCodewords * 8);
    assert.equal(summary.ecModules, result.ecCodewords * 8);
    assert.equal(summary.dataModules + summary.ecModules + summary.functionModules, summary.moduleCount);
    assert.equal(summary.functionModules, summary.moduleCount - result.totalCodewords * 8);
    assert.equal(summary.dataCapacityBytes, BarcodeQR.byteCapacity(result.version, result.ecLevel));
    assert.equal(summary.errorCorrectionPercent,
        Math.round(result.ecCodewords / result.totalCodewords * 1000) / 10);

    assert.equal(result.blocks.filter((b) => b.kind === 'data').length,
        result.blocks.filter((b) => b.kind === 'ec').length);
    const blockKeys = ['index', 'kind', 'ecBlockIndex', 'startCodeword', 'codewordCount',
        'dataCodewords', 'ecCodewords', 'totalCodewords'];
    result.blocks.forEach((block, i) => {
        for (const key of blockKeys) assert.ok(key in block, 'block key ' + key);
        assert.equal(block.index, i);
        assert.equal(block.totalCodewords, block.dataCodewords + block.ecCodewords);
    });

    assert.ok(result.stages.length >= 3 && result.stages.length <= 6);
    for (const stage of result.stages) {
        assert.equal(typeof stage.id, 'string');
        assert.ok(stage.title.length > 0);
        assert.ok(stage.description.length > 20);
    }
    assert.equal(new Set(result.stages.map((s) => s.id)).size, result.stages.length);
});

test('walking moduleColors reaches every cell of the matrix', () => {
    const specs = [
        { text: '01234567', opts: { ecLevel: 'M', version: 1 } },
        { text: 'HELLO WORLD', opts: { ecLevel: 'Q' } },
        { text: 'https://www.dynamsoft.com/demos/barcode-structure/', opts: { ecLevel: 'H' } }
    ];
    for (const spec of specs) {
        const result = BarcodeQR.encode(spec.text, spec.opts);
        const claimed = new Set();
        result.components.forEach((component, index) => {
            for (const [row, col] of component.cells) claimed.add(row + ',' + col + '=' + index);
        });
        for (let r = 0; r < result.size; r++) {
            for (let c = 0; c < result.size; c++) {
                const index = result.moduleColors[r][c];
                assert.ok(index >= 0, 'moduleColors is set at ' + r + ',' + c);
                assert.ok(index < result.components.length, 'moduleColors in range at ' + r + ',' + c);
                assert.ok(claimed.has(r + ',' + c + '=' + index),
                    'component ' + result.components[index].id + ' claims ' + r + ',' + c);
            }
        }
    }
});

/* ==================================================================== *
 * 2. Reference matrices
 * ==================================================================== */

for (const vector of REFERENCE_VECTORS) {
    test('reference matrix: ' + vector.id, () => {
        const result = BarcodeQR.encode(vector.text, {
            ecLevel: vector.ecLevel,
            version: vector.version,
            mask: vector.mask
        });

        assert.equal(result.version, vector.version, 'version');
        assert.equal(result.ecLevel, vector.ecLevel, 'ec level');
        assert.equal(result.mask, vector.mask, 'mask');
        assert.equal(result.size, vector.rows.length, 'size');
        assertReferenceMatrix(result, vector.rows, vector.id);

        /* The same symbol through the independent decoder. */
        const decoded = decodePayload(result);
        assert.equal(decoded.ecLevel, vector.ecLevel, 'format info reports the level');
        assert.equal(decoded.mask, vector.mask, 'format info reports the mask');
        assert.ok(decoded.format.copy1.valid, 'copy 1 is a valid BCH(15,5) codeword');
        assert.ok(decoded.format.copy2.valid, 'copy 2 is a valid BCH(15,5) codeword');
        assert.equal(decoded.format.copy2.data, decoded.format.copy1.data, 'the copies agree');
        assert.equal(decoded.words.length, result.totalCodewords, 'codeword count');
        assert.equal(decoded.totalBits,
            result.totalCodewords * 8 + BarcodeQR.remainderBits(result.version), 'data region size');
        assert.equal(decoded.segment.text, vector.text, 'decoded text');
    });
}

test('all 40 versions at all 4 levels match the reference encoder', () => {
    for (let version = 1; version <= 40; version++) {
        for (const ecLevel of BarcodeQR.EC_LEVELS) {
            const id = 'v' + version + '-' + ecLevel;
            assert.ok(id in REFERENCE_SWEEP, 'missing reference sweep entry ' + id);
            const result = BarcodeQR.encode('A', { ecLevel, version, mask: 0 });
            assert.equal(fnv1a(rowsOf(result).join('')), REFERENCE_SWEEP[id], id + ' matrix');
        }
    }
});

test('ISO/IEC 18004 worked example: 01234567 at version 1-M', () => {
    const result = BarcodeQR.encode('01234567', { ecLevel: 'M', version: 1 });
    assert.equal(result.mode, 'numeric');
    assert.equal(result.version, 1);
    assert.equal(result.segments[0].charCount, 8);
    assert.equal(result.segments[0].bits, 41, '4 mode + 10 count + 27 payload');

    /* This encoder's penalty rules select mask 010 for the worked payload, and
       010 is the mask the standard's format-information example uses: level M
       with mask 010 gives the BCH remainder 1001101110, which is the value the
       module's formatBits produces (checked against the BCH table above). */
    assert.equal(result.mask, 2, 'mask 010');
    assert.equal(result.maskFormula, 'col % 3 == 0');

    const decoded = decodePayload(result);
    const symbol = decoded.words.slice(0, result.totalCodewords);
    assert.equal(symbol.length, 26);
    assert.deepEqual(symbol, ISO_CODEWORDS, 'interleaved codewords of the worked example');
    assert.deepEqual(symbol.slice(0, 16), ISO_DATA_CODEWORDS, 'data codewords');
    assert.deepEqual(symbol.slice(16), ISO_EC_CODEWORDS, 'error correction codewords');
    assert.equal(decoded.segment.text, '01234567');
});

test('every version and level produces a structurally valid symbol', () => {
    for (let version = 1; version <= 40; version++) {
        for (const ecLevel of BarcodeQR.EC_LEVELS) {
            const result = BarcodeQR.encode('A', { ecLevel, version });
            const label = 'v' + version + '-' + ecLevel;
            const codewordModules = BarcodeQR.totalCodewords(version) * 8;
            const dataRegion = codewordModules + BarcodeQR.remainderBits(version);

            /* The standard's Table 1 relation: the encoding region holds one
               codeword's worth of modules per codeword plus the remainder. */
            const decoded = decodePayload(result);
            assert.equal(decoded.totalBits, dataRegion, label + ' encoding region size');
            assert.equal(result.summary.dataModules + result.summary.ecModules, codewordModules,
                label + ' codeword modules');
            assert.equal(result.summary.functionModules, result.size * result.size - codewordModules,
                label + ' non-data modules');
            assert.equal(result.size * result.size - result.summary.functionModules, codewordModules,
                label + ' nothing else is counted as data');

            assert.equal(decoded.segment.text, 'A', label + ' round trip');
            assert.equal(decoded.ecLevel, ecLevel, label + ' decoded level');
            assert.equal(decoded.mask, result.mask, label + ' decoded mask');
            assert.equal(decoded.words.length, result.totalCodewords, label + ' codeword count');
        }
    }
});

test('the alignment pattern derivation agrees with the module table', () => {
    for (let version = 1; version <= 40; version++) {
        assert.deepEqual(BarcodeQR.alignmentPositions(version), derivedAlignmentPositions(version),
            'version ' + version);
    }
});

/* ==================================================================== *
 * 3. Format and version information
 * ==================================================================== */

test('format information matches the standard table for all 32 combinations', () => {
    for (const ecLevel of BarcodeQR.EC_LEVELS) {
        for (let mask = 0; mask < 8; mask++) {
            assert.equal(BarcodeQR.formatBits(ecLevel, mask), REFERENCE_FORMAT_BITS[ecLevel + '-' + mask],
                ecLevel + ' mask ' + mask);
        }
    }
});

test('format information is written twice and decodes back to the chosen level and mask', () => {
    for (const ecLevel of BarcodeQR.EC_LEVELS) {
        const result = BarcodeQR.encode('format information', { ecLevel });
        const format = readFormatInfo(result.matrix);
        assert.ok(format.copy1.valid, ecLevel + ': copy 1 is valid BCH');
        assert.ok(format.copy2.valid, ecLevel + ': copy 2 is valid BCH');
        assert.equal(format.copy1.data, format.copy2.data, ecLevel + ': the copies agree');
        assert.equal((format.copy1.data >> 3) & 3, { L: 1, M: 0, Q: 3, H: 2 }[ecLevel]);
        assert.equal(format.copy1.data & 7, result.mask);
    }
});

test('version information matches the standard table for versions 7 to 40', () => {
    for (let version = 7; version <= 40; version++) {
        const expected = REFERENCE_VERSION_BITS[version];
        assert.equal(BarcodeQR.versionBits(version), expected, 'version ' + version);
        assert.equal(bchRemainder(expected, 0x1f25, 12, 17), 0, 'version ' + version + ' BCH(18,6)');
    }
    for (let version = 1; version <= 6; version++) {
        const result = BarcodeQR.encode('A', { ecLevel: 'L', version });
        assert.equal(readVersionInfo(result.matrix), null, 'version ' + version + ' has no version field');
    }
});

test('version information is written in two places that agree', () => {
    for (const version of [7, 10, 20, 26, 32, 40]) {
        const result = BarcodeQR.encode('A', { ecLevel: 'M', version });
        const info = readVersionInfo(result.matrix);
        assert.ok(info, 'version ' + version + ' has a version field');
        assert.equal(info.copy1, REFERENCE_VERSION_BITS[version]);
        assert.equal(info.copy2, REFERENCE_VERSION_BITS[version]);
    }
});

/* ==================================================================== *
 * 4. Structure
 * ==================================================================== */

test('finder patterns, separators, timing patterns and the dark module', () => {
    for (const version of [1, 2, 6, 7, 14, 21, 32, 40]) {
        const result = BarcodeQR.encode('A', { ecLevel: 'M', version });
        const size = result.size;
        const matrix = result.matrix;

        for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 7; c++) {
                    const distance = Math.max(Math.abs(r - 3), Math.abs(c - 3));
                    assert.equal(matrix[top + r][left + c], distance === 2 ? 0 : 1,
                        'finder module at ' + (top + r) + ',' + (left + c));
                }
            }
        }

        /* The separator is every module of the 8x8 block that is not part of
           the 7x7 finder pattern, and it is light. */
        for (const [top, left, finderTop, finderLeft] of [
            [0, 0, 0, 0], [0, size - 8, 0, 1], [size - 8, 0, 1, 0]
        ]) {
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const inside = r >= finderTop && r < finderTop + 7
                        && c >= finderLeft && c < finderLeft + 7;
                    if (inside) continue;
                    assert.equal(matrix[top + r][left + c], 0,
                        'separator module at ' + (top + r) + ',' + (left + c));
                }
            }
        }

        /* Timing modules alternate and start dark; alignment patterns sitting
           on row 6 or column 6 own their cells instead. */
        for (let i = 8; i <= size - 9; i++) {
            const rowComponent = result.components[result.moduleColors[6][i]];
            if (rowComponent.kind === 'timing') {
                assert.equal(matrix[6][i], i % 2 === 0 ? 1 : 0, 'timing row at column ' + i);
            } else {
                assert.equal(rowComponent.kind, 'alignment', 'row 6 cell ' + i + ' is timed or aligned');
            }
            const columnComponent = result.components[result.moduleColors[i][6]];
            if (columnComponent.kind === 'timing') {
                assert.equal(matrix[i][6], i % 2 === 0 ? 1 : 0, 'timing column at row ' + i);
            } else {
                assert.equal(columnComponent.kind, 'alignment', 'column 6 cell ' + i + ' is timed or aligned');
            }
        }

        assert.equal(matrix[4 * version + 9][8], 1, 'dark module');
        assert.equal(4 * version + 9, size - 8, 'dark module position');
    }
});

test('alignment patterns are where the standard puts them', () => {
    for (const version of [2, 7, 14, 32, 40]) {
        const result = BarcodeQR.encode('A', { ecLevel: 'M', version });
        const positions = derivedAlignmentPositions(version);
        const expected = [];
        for (let i = 0; i < positions.length; i++) {
            for (let j = 0; j < positions.length; j++) {
                const last = positions.length - 1;
                if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
                expected.push(positions[i] + '-' + positions[j]);
            }
        }
        const found = result.components.filter((c) => c.kind === 'alignment')
            .map((c) => c.label.match(/\((\d+), (\d+)\)/).slice(1).join('-'));
        assert.deepEqual(found.slice().sort(), expected.slice().sort(), 'version ' + version);

        for (const component of result.components.filter((c) => c.kind === 'alignment')) {
            assert.equal(component.cells.length, 25, 'alignment pattern is 5x5');
            const centre = component.label.match(/\((\d+), (\d+)\)/).slice(1).map(Number);
            for (const [r, c] of component.cells) {
                const distance = Math.max(Math.abs(r - centre[0]), Math.abs(c - centre[1]));
                assert.equal(result.matrix[r][c], distance === 1 ? 0 : 1, 'alignment module');
            }
        }
    }
});

test('there is no quiet zone in the matrix', () => {
    const result = BarcodeQR.encode('HELLO WORLD', { ecLevel: 'Q' });
    assert.equal(result.matrix.length, 4 * result.version + 17);
    assert.equal(result.matrix[0].length, result.size);
});

/* ==================================================================== *
 * 5. Component coverage
 * ==================================================================== */

test('components partition the symbol exactly', () => {
    const specs = [
        { text: '01234567', opts: { ecLevel: 'M', version: 1 } },
        { text: 'HELLO WORLD', opts: { ecLevel: 'Q' } },
        { text: 'https://www.dynamsoft.com/demos/barcode-structure/', opts: { ecLevel: 'H' } },
        { text: 'A'.repeat(120), opts: { ecLevel: 'Q', version: 7 } },
        { text: 'q'.repeat(150), opts: { ecLevel: 'H', version: 13 } }
    ];

    for (const spec of specs) {
        const result = BarcodeQR.encode(spec.text, spec.opts);
        const size = result.size;
        const seen = Array.from({ length: size }, () => new Array(size).fill(0));
        const ids = new Set();
        const kinds = new Set(BarcodeQR.FUNCTION_KINDS.concat(BarcodeQR.DATA_KINDS, ['quiet']));

        assert.ok(result.components.length > 0);

        result.components.forEach((component, index) => {
            assert.equal(typeof component.id, 'string');
            assert.ok(component.id.length > 0);
            assert.ok(!ids.has(component.id), 'duplicate component id ' + component.id);
            ids.add(component.id);
            assert.ok(kinds.has(component.kind), 'unknown kind ' + component.kind);
            assert.ok(['function', 'data', 'header'].includes(component.group), 'group ' + component.group);
            assert.ok(component.description.length > 10, component.id + ' description');
            assert.ok(component.detail.length > 20, component.id + ' detail');
            assert.ok(component.cells.length > 0, component.id + ' has cells');

            let minRow = Infinity, minCol = Infinity, maxRow = -Infinity, maxCol = -Infinity;
            let previousRow = -1;
            let previousCol = -1;
            for (const [row, col] of component.cells) {
                assert.ok(row >= 0 && row < size && col >= 0 && col < size,
                    component.id + ' cell inside the symbol');
                assert.ok(row > previousRow || (row === previousRow && col > previousCol),
                    component.id + ' cells are unique and in raster order');
                previousRow = row;
                previousCol = col;
                seen[row][col]++;
                assert.equal(result.moduleColors[row][col], index,
                    component.id + ' is what moduleColors reports');
                minRow = Math.min(minRow, row);
                maxRow = Math.max(maxRow, row);
                minCol = Math.min(minCol, col);
                maxCol = Math.max(maxCol, col);
            }
            assert.deepEqual(component.bounds, {
                row: minRow, col: minCol, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1
            }, component.id + ' bounds');
        });

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                assert.equal(seen[r][c], 1, 'cell ' + r + ',' + c + ' belongs to exactly one component');
            }
        }
    }
});

test('the required structural components are all present', () => {
    const result = BarcodeQR.encode('A'.repeat(120), { ecLevel: 'Q', version: 7 });
    const byId = new Map(result.components.map((c) => [c.id, c]));

    for (const id of ['finder-tl', 'finder-tr', 'finder-bl',
        'separator-tl', 'separator-tr', 'separator-bl',
        'timing-row', 'timing-col', 'format-1', 'format-2',
        'version-1', 'version-2', 'dark-module']) {
        assert.ok(byId.has(id), 'missing component ' + id);
    }
    assert.equal(byId.get('finder-tl').cells.length, 49, 'finder is 7x7');
    assert.equal(byId.get('separator-tl').cells.length, 15, 'separator is an 8+8-1 L shape');
    assert.equal(byId.get('separator-tr').cells.length, 15);
    assert.equal(byId.get('separator-bl').cells.length, 15);
    assert.equal(byId.get('format-1').cells.length, 15, 'format field is 15 bits');
    assert.equal(byId.get('format-2').cells.length, 15, 'the second copy is 15 bits');
    assert.equal(byId.get('version-1').cells.length, 18, 'version field is 18 bits');
    assert.equal(byId.get('version-2').cells.length, 18, 'the second copy is 18 bits');
    assert.equal(byId.get('dark-module').cells.length, 1);
    assert.deepEqual(byId.get('dark-module').cells[0], [4 * 7 + 9, 8]);
    assert.equal(byId.get('finder-tl').group, 'function');
    assert.equal(byId.get('format-1').group, 'header');
    assert.equal(byId.get('cw-0').group, 'data');

    /* Version 1 has neither alignment patterns nor a version field. */
    const small = BarcodeQR.encode('01234567', { ecLevel: 'M', version: 1 });
    assert.equal(small.components.filter((c) => c.kind === 'version').length, 0);
    assert.equal(small.components.filter((c) => c.kind === 'alignment').length, 0);

    /* A version with remainder bits reports them. */
    const remainder = BarcodeQR.encode('A', { ecLevel: 'L', version: 2 });
    const bits = remainder.components.filter((c) => c.id === 'remainder-bits');
    assert.equal(bits.length, 1, 'remainder bits are a component of their own');
    assert.equal(bits[0].cells.length, BarcodeQR.remainderBits(2));
});

test('data and error correction components follow the placement map', () => {
    const result = BarcodeQR.encode('https://www.dynamsoft.com/demos/barcode-structure/',
        { ecLevel: 'M' });
    const size = result.size;

    let dataCells = 0;
    let ecCells = 0;
    const placementCounts = new Array(result.totalCodewords).fill(0);

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const index = result.placement[r][c];
            const component = result.components[result.moduleColors[r][c]];
            if (index === null) {
                assert.notEqual(component.kind, 'data', 'no data component without a codeword');
                assert.notEqual(component.kind, 'ec', 'no ec component without a codeword');
                continue;
            }
            placementCounts[index]++;
            if (index < result.dataCodewords) {
                assert.equal(component.kind, 'data');
                assert.equal(component.id, 'cw-' + index);
                dataCells++;
            } else {
                assert.equal(component.kind, 'ec');
                assert.equal(component.id, 'cw-' + index);
                ecCells++;
            }
        }
    }

    /* Every codeword is exactly eight modules. */
    for (let i = 0; i < result.totalCodewords; i++) {
        assert.equal(placementCounts[i], 8, 'codeword ' + i + ' occupies eight modules');
    }
    assert.equal(dataCells, result.dataCodewords * 8);
    assert.equal(ecCells, result.ecCodewords * 8);
});

test('the non-data masks agree with the placement map', () => {
    const specs = [
        { text: '01234567', opts: { ecLevel: 'M', version: 1 } },
        { text: 'HELLO WORLD', opts: { ecLevel: 'Q' } },
        { text: 'A'.repeat(40), opts: { ecLevel: 'H', version: 9 } },
        { text: 'A'.repeat(120), opts: { ecLevel: 'Q', version: 7 } },
        { text: 'A', opts: { ecLevel: 'L', version: 2 } }
    ];
    for (const spec of specs) {
        const result = BarcodeQR.encode(spec.text, spec.opts);
        for (let r = 0; r < result.size; r++) {
            for (let c = 0; c < result.size; c++) {
                const reserved = result.reservedMask[r][c];
                assert.equal(reserved, result.functionMask[r][c], 'the two masks agree at ' + r + ',' + c);
                assert.equal(reserved, result.placement[r][c] === null ? 1 : 0,
                    'reserved means no codeword bit at ' + r + ',' + c);
            }
        }
    }
});

/* ==================================================================== *
 * 6. Reed-Solomon
 * ==================================================================== */

test('every block is a valid Reed-Solomon codeword', () => {
    const specs = [
        { text: '01234567', opts: { ecLevel: 'M', version: 1 } },
        { text: 'HELLO WORLD', opts: { ecLevel: 'Q', version: 1 } },
        { text: 'https://www.dynamsoft.com/demos/barcode-structure/', opts: { ecLevel: 'M', version: 5 } },
        { text: 'A'.repeat(120), opts: { ecLevel: 'Q', version: 7 } },
        { text: 'q'.repeat(150), opts: { ecLevel: 'H', version: 13 } }
    ];
    for (const spec of specs) {
        const result = BarcodeQR.encode(spec.text, spec.opts);
        const decoded = decodePayload(result);
        const label = 'v' + result.version + result.ecLevel;

        assert.equal(decoded.dataBlocks.length, decoded.dataCounts.length, label + ' block count');
        decoded.dataBlocks.forEach((block, i) => {
            assert.equal(block.length, decoded.dataCounts[i], label + ' block ' + i + ' length');
            assert.deepEqual(rsSyndromes(block.concat(decoded.ecBlocks[i]), decoded.ecCount),
                new Array(decoded.ecCount).fill(0), label + ' block ' + i + ' syndromes');
        });
    }
});

test('the block structure matches the standard tables for known versions', () => {
    const expectations = [
        { version: 1, ecLevel: 'M', dataCounts: [16], ecPerBlock: 10 },
        { version: 5, ecLevel: 'Q', dataCounts: [15, 15, 16, 16], ecPerBlock: 18 },
        { version: 7, ecLevel: 'H', dataCounts: [13, 13, 13, 13, 14], ecPerBlock: 26 },
        { version: 10, ecLevel: 'L', dataCounts: [68, 68, 69, 69], ecPerBlock: 18 },
        { version: 13, ecLevel: 'H', dataCounts: new Array(16).fill(11).map((v, i) => (i < 12 ? 11 : 12)), ecPerBlock: 22 },
        { version: 40, ecLevel: 'H', dataCounts: new Array(81).fill(16).map((v, i) => (i < 20 ? 15 : 16)), ecPerBlock: 30 }
    ];

    for (const expectation of expectations) {
        const label = 'v' + expectation.version + '-' + expectation.ecLevel;
        const structure = BarcodeQR.blockStructure(expectation.version, expectation.ecLevel);
        assert.deepEqual(structure.dataCounts, expectation.dataCounts, label + ' data counts');
        assert.equal(structure.ecPerBlock, expectation.ecPerBlock, label + ' ec per block');
        assert.equal(structure.dataCounts.reduce((a, b) => a + b, 0), structure.dataCodewords,
            label + ' data codewords add up');

        const result = BarcodeQR.encode('A', { ecLevel: expectation.ecLevel, version: expectation.version });
        const dataEntries = result.blocks.filter((b) => b.kind === 'data');
        assert.deepEqual(dataEntries.map((b) => b.codewordCount), expectation.dataCounts);
        assert.deepEqual(dataEntries.map((b) => b.ecBlockIndex), expectation.dataCounts.map((v, i) => i));
        for (const entry of result.blocks.filter((b) => b.kind === 'ec')) {
            assert.equal(entry.codewordCount, expectation.ecPerBlock);
            assert.equal(entry.startCodeword, result.dataCodewords + entry.ecBlockIndex);
        }
    }
});

test('the standard byte capacities are respected', () => {
    assert.equal(BarcodeQR.byteCapacity(1, 'L'), 17);
    assert.equal(BarcodeQR.byteCapacity(1, 'M'), 14);
    assert.equal(BarcodeQR.byteCapacity(1, 'Q'), 11);
    assert.equal(BarcodeQR.byteCapacity(1, 'H'), 7);
    assert.equal(BarcodeQR.byteCapacity(40, 'L'), 2953);

    const fits = BarcodeQR.encode('x'.repeat(17), { ecLevel: 'L', version: 1 });
    assert.equal(fits.version, 1);
    assert.equal(fits.summary.dataCapacityBytes, 17);
    assert.throws(() => BarcodeQR.encode('x'.repeat(18), { ecLevel: 'L', version: 1 }), /too long/);
});

/* ==================================================================== *
 * 7. Modes, text and round trips
 * ==================================================================== */

test('numeric, alphanumeric and byte modes round trip at every level', () => {
    const payloads = [
        { text: '01234567', mode: 'numeric' },
        { text: 'HELLO WORLD', mode: 'alphanumeric' },
        { text: 'https://www.dynamsoft.com/demos/barcode-structure/', mode: 'byte' },
        { text: '\u4f60\u597d\uff0c\u4e16\u754c \u2014 QR', mode: 'byte' },
        { text: 'A'.repeat(120), mode: 'alphanumeric' },
        { text: '9'.repeat(200), mode: 'numeric' }
    ];

    for (const payload of payloads) {
        for (const ecLevel of BarcodeQR.EC_LEVELS) {
            const result = BarcodeQR.encode(payload.text, { ecLevel });
            assert.equal(result.mode, payload.mode, payload.text.slice(0, 20) + ' mode');
            const decoded = decodePayload(result);
            assert.equal(decoded.segment.text, payload.text,
                payload.text.slice(0, 20) + ' at level ' + ecLevel);
            assert.equal(decoded.segment.mode, payload.mode);
            assert.equal(decoded.ecLevel, ecLevel);
        }
    }
});

test('a multi-byte UTF-8 payload is measured in bytes, not characters', () => {
    const text = '\u4f60\u597d\uff0c\u4e16\u754c';
    const result = BarcodeQR.encode(text, { ecLevel: 'H' });
    const bytes = internals.utf8Bytes(text);

    assert.equal(result.mode, 'byte');
    assert.equal(result.segments[0].charCount, bytes.length);
    assert.equal(bytes.length, 15, 'five three-byte code points');
    assert.equal(text.length, 5, 'but only five characters');
    assert.equal(decodePayload(result).segment.text, text);
});

test('the Latin-1 fallback matches TextEncoder outside the Latin-1 range', () => {
    const samples = ['HELLO', 'hello, world', '\u4f60\u597d\u4e16\u754c',
        '\u2014 dash', '\ud83d\ude80 rocket', 'mixed \u4f60\u597d ASCII'];
    for (const sample of samples) {
        assert.deepEqual(internals.manualBytes(sample), internals.utf8Bytes(sample),
            JSON.stringify(sample));
    }

    /* Inside the Latin-1 supplement the fallback deliberately writes one byte
       per character, which is what byte mode meant before UTF-8. */
    assert.deepEqual(internals.manualBytes('\u00e9'), [0xe9]);
    assert.deepEqual(internals.utf8Bytes('\u00e9'), [0xc3, 0xa9]);
    assert.equal(internals.manualBytes('\u00e9').length, 1);
});

test('encode is deterministic', () => {
    const first = BarcodeQR.encode('determinism', { ecLevel: 'Q' });
    const second = BarcodeQR.encode('determinism', { ecLevel: 'Q' });
    assert.deepEqual(rowsOf(second), rowsOf(first));
    assert.equal(second.mask, first.mask);
    assert.deepEqual(second.components.map((c) => c.id), first.components.map((c) => c.id));

    const forced = BarcodeQR.encode('determinism', { ecLevel: 'Q', mask: (first.mask + 1) % 8 });
    assert.notDeepEqual(rowsOf(forced), rowsOf(first));
    assert.equal(forced.mask, (first.mask + 1) % 8);
});

test('higher error correction levels spend more codewords on parity', () => {
    const text = 'https://www.dynamsoft.com/demos/barcode-structure/';
    const results = BarcodeQR.EC_LEVELS.map((ecLevel) =>
        BarcodeQR.encode(text, { ecLevel, version: 6 }));
    for (let i = 1; i < results.length; i++) {
        assert.ok(results[i].ecCodewords > results[i - 1].ecCodewords,
            'parity grows from ' + results[i - 1].ecLevel + ' to ' + results[i].ecLevel);
    }
    for (const result of results) {
        assert.equal(decodePayload(result).segment.text, text);
    }
});

test('the smallest version that fits is chosen, and the byte mode cap holds', () => {
    assert.equal(BarcodeQR.encode('12345', { ecLevel: 'H' }).version, 1);

    assert.equal(BarcodeQR.encode('x'.repeat(858), { ecLevel: 'L' }).version, 20);
    assert.throws(() => BarcodeQR.encode('x'.repeat(859), { ecLevel: 'L' }), /too long/,
        'byte mode stops at version 20');

    /* An explicit version beyond the cap is still honoured, and numeric and
       alphanumeric payloads reach version 40. */
    const numeric = BarcodeQR.encode('7'.repeat(3000), { ecLevel: 'L', version: 40 });
    assert.equal(numeric.version, 40);
    assert.equal(decodePayload(numeric).segment.text, '7'.repeat(3000));
});

/* ==================================================================== *
 * 8. Mask selection and penalty rules
 * ==================================================================== */

test('the mask is the one with the lowest penalty', () => {
    for (const spec of MASK_CASES) {
        const options = { ecLevel: spec.ecLevel, version: spec.version };
        const auto = BarcodeQR.encode(spec.text, options);
        const scores = [];
        for (let mask = 0; mask < 8; mask++) {
            const candidate = BarcodeQR.encode(spec.text, Object.assign({ mask }, options));
            scores.push(internals.penaltyScore(candidate.matrix));
        }
        const lowest = Math.min.apply(null, scores);
        assert.equal(auto.mask, scores.indexOf(lowest), spec.id + ' picks the lowest penalty');
        assert.equal(internals.penaltyScore(auto.matrix), lowest, spec.id + ' score');
        assert.equal(auto.mask, spec.expectedMask, spec.id + ' expected mask');

        const forced = BarcodeQR.encode(spec.text, Object.assign({ mask: auto.mask }, options));
        assert.deepEqual(rowsOf(forced), rowsOf(auto));
    }
});

test('the penalty rules match the reference implementation for rules 1, 2 and 4', () => {
    for (const vector of REFERENCE_VECTORS) {
        const result = BarcodeQR.encode(vector.text, {
            ecLevel: vector.ecLevel, version: vector.version, mask: vector.mask
        });
        const breakdown = internals.penaltyBreakdown(result.matrix);
        assert.equal(breakdown.n1, vector.pythonRules.n1, vector.id + ' rule 1');
        assert.equal(breakdown.n2, vector.pythonRules.n2, vector.id + ' rule 2');
        assert.equal(breakdown.n4, vector.pythonRules.n4, vector.id + ' rule 4');
        assert.equal(breakdown.total, breakdown.n1 + breakdown.n2 + breakdown.n3 + breakdown.n4);
        assert.equal(internals.penaltyScore(result.matrix), breakdown.total);
    }
});

test('hand-computed penalty scores', () => {
    const checkerboard = Array.from({ length: 21 }, (_, r) =>
        Array.from({ length: 21 }, (_, c) => (r + c) % 2));
    assert.equal(internals.penaltyScore(checkerboard), 0,
        'no runs of five, no 2x2 block, no finder pattern, and a 50% dark share');

    const allDark = Array.from({ length: 21 }, () => new Array(21).fill(1));
    /* N1: 21 rows and 21 columns of length 21 -> 42 * (3 + 16).
       N2: 20 * 20 blocks of four modules.
       N4: the dark share is as far from 50% as it gets, k = 10 -> 100. */
    assert.deepEqual(internals.penaltyBreakdown(allDark), {
        n1: 42 * 19, n2: 400 * 3, n3: 0, n4: 100, total: 42 * 19 + 1200 + 100
    });

    const allLight = Array.from({ length: 21 }, () => new Array(21).fill(0));
    assert.deepEqual(internals.penaltyBreakdown(allLight), internals.penaltyBreakdown(allDark));
});

test('rule 1 penalises long runs and rule 2 penalises 2x2 blocks', () => {
    const run = lightMatrix();
    for (let c = 4; c <= 12; c++) run[10][c] = 1;    /* nine dark modules in a row */

    /* Rows: twenty all-light rows score 3 + 16. The pattern row splits into a
       light run of 4 (no score), a dark run of 9 (7 points) and a light run of
       8 (6 points). Columns: four all-light, nine split 10/1/10 (8 + 8 each),
       eight all-light. */
    assert.equal(internals.penaltyBreakdown(run).n1,
        20 * 19 + 7 + 6 + 4 * 19 + 9 * (8 + 8) + 8 * 19);

    const block = lightMatrix();
    block[10][10] = 1;
    block[10][11] = 1;
    block[11][10] = 1;
    block[11][11] = 1;
    /* Nine 2x2 windows overlap the dark square; exactly one of them is all
       dark, the other eight mix colours, so 392 windows are uniform. */
    assert.equal(internals.penaltyBreakdown(block).n2, (400 - 9 + 1) * 3);
});

test('rule 3 counts a 1:1:3:1:1 pattern with a light area on one side', () => {
    /* Four light modules to the left of the pattern. */
    assert.equal(internals.penaltyBreakdown(matrixWithPattern(finderLikeAt(4))).n3, 40);

    /* Light on both sides is still one occurrence, not two. */
    assert.equal(internals.penaltyBreakdown(matrixWithPattern(finderLikeAt(8))).n3, 40);

    /* The pattern hard against the left edge counts: the quiet zone is the
       light area. This is the reading ZXing and qrcodegen use. */
    assert.equal(internals.penaltyBreakdown(matrixWithPattern(finderLikeAt(0))).n3, 40);

    /* Three light modules on one side and dark on the other does not count. */
    const noLightArea = matrixWithPattern(finderLikeAt(8).concat([[7, 1], [15, 1]]));
    assert.equal(internals.penaltyBreakdown(noLightArea).n3, 0);
});

/* ==================================================================== *
 * 9. Errors and options
 * ==================================================================== */

test('bad input is rejected with a clear message', () => {
    assert.throws(() => BarcodeQR.encode(null), /must be a string/);
    assert.throws(() => BarcodeQR.encode('A', { ecLevel: 'Z' }), /error correction level/);
    assert.throws(() => BarcodeQR.encode('A', { mode: 'kanji' }), /unknown mode/);
    assert.throws(() => BarcodeQR.encode('abc', { mode: 'numeric' }), /digits only/);
    assert.throws(() => BarcodeQR.encode('abc', { mode: 'alphanumeric' }), /alphanumeric mode/);
    assert.throws(() => BarcodeQR.encode('A', { version: 0 }), /version must be/);
    assert.throws(() => BarcodeQR.encode('A', { version: 41 }), /version must be/);
    assert.throws(() => BarcodeQR.encode('A', { version: 2.5 }), /version must be/);
    assert.throws(() => BarcodeQR.encode('A', { mask: 8 }), /mask must be/);
    assert.throws(() => BarcodeQR.encode('A'.repeat(5000), { ecLevel: 'H' }), /too long/);
});

test('options are normalised and defaults applied', () => {
    const defaults = BarcodeQR.encode('01234567');
    assert.equal(defaults.ecLevel, 'M');
    assert.equal(defaults.mode, 'numeric');

    assert.equal(BarcodeQR.encode('01234567', { ecLevel: 'h' }).ecLevel, 'H');

    const explicit = BarcodeQR.encode('hello', { mode: 'byte' });
    assert.equal(explicit.mode, 'byte');
    assert.equal(explicit.segments[0].charCount, 5);
    assert.equal(decodePayload(explicit).segment.text, 'hello');

    const numeric = BarcodeQR.encode('0123456789', { mode: 'numeric' });
    assert.equal(numeric.segments[0].bits, 4 + 10 + 34, 'three 10-bit groups plus one 4-bit group');

    const forced = BarcodeQR.encode('01234567', { version: 4, mask: 5 });
    assert.equal(forced.version, 4);
    assert.equal(forced.mask, 5);
    assert.equal(decodePayload(forced).segment.text, '01234567');

    /* An empty payload still produces a valid symbol. */
    const empty = BarcodeQR.encode('', { ecLevel: 'L' });
    assert.equal(empty.version, 1);
    assert.equal(empty.mode, 'numeric');
    assert.equal(decodePayload(empty).segment.text, '');

    /* Empty strings, which is what an untouched form control sends, behave
       like a missing option rather than raising. */
    const blank = BarcodeQR.encode('01234567', { ecLevel: '', mode: '', version: '' });
    assert.equal(blank.ecLevel, 'M');
    assert.equal(blank.mode, 'numeric');
    assert.equal(blank.version, 1);
});

test('mask formulas are the standard conditions', () => {
    assert.equal(BarcodeQR.maskFormulas.length, 8);
    for (let mask = 0; mask < 8; mask++) {
        const formula = BarcodeQR.maskFormulas[mask];
        assert.equal(formula, BarcodeQR.maskFormula(mask));
        /* Evaluate the published formula and compare with the implementation. */
        const evaluate = new Function('row', 'col', 'return (' + formula + ');');
        for (let row = 0; row < 21; row++) {
            for (let col = 0; col < 21; col++) {
                assert.equal(internals.isValidMask(mask, row, col), evaluate(row, col),
                    'mask ' + mask + ' at ' + row + ',' + col + ' (' + formula + ')');
            }
        }
    }
});

test('the module is usable as a plain script', () => {
    /* Same UMD footer as the other demo modules: a browser gets a global. */
    const fs = require('node:fs');
    const source = fs.readFileSync(path.join(__dirname, '..', 'barcode-qr.js'), 'utf8');
    assert.ok(source.includes('root.BarcodeQR = factory();'), 'browser global');
    assert.ok(source.includes("if (typeof module === 'object' && module.exports)"), 'CommonJS branch');

    const root = {};
    new Function('self', 'module', 'window', source).call(root, root, undefined, root);
    assert.equal(typeof root.BarcodeQR.encode, 'function');
    const result = root.BarcodeQR.encode('script tag', { ecLevel: 'L' });
    assert.equal(result.text, 'script tag');
    assert.equal(result.matrix.length, result.size);
});
