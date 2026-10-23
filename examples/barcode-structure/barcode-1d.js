/*
 * barcode-1d.js — linear (1D) symbology encoders that return the module
 * sequence *together with its structure*.
 *
 * The point of this module is not "draw a barcode". bwip-js already draws
 * barcodes, and far better than anything here. The point is to be able to say,
 * for every single module of a symbol, which named part of the symbology it
 * belongs to: quiet zone, guard, start character, data character, check digit,
 * stop character. That is the data an interactive structure diagram needs, and
 * it is data a raster encoder throws away.
 *
 * Everything here is written from the published symbology rules:
 *   EAN-13   ISO/IEC 15420
 *   Code 128 ISO/IEC 15417
 *   Code 39  ISO/IEC 16388
 *   ITF-14   ISO/IEC 16390 / GS1 General Specifications
 *
 * The encoders are deliberately literal: the tables below are the symbology
 * tables, not a compression of them, because a reader of this file should be
 * able to check a module against the standard without decoding a lookup
 * scheme.
 *
 * Runs in Node (require) and in the browser (window.Barcode1D).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Barcode1D = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* -----------------------------------------------------------------------
       Shared role vocabulary.

       `roles` is the symbology-independent layer: whatever the symbology, a
       module is a bar or a space, and its element is wide or narrow (1D) or
       just a module (2D). Keeping the roles out of the per-symbology group
       code lets the UI offer one legend for every symbol type, and lets a
       decoder read back the drawn symbol without knowing the symbology.
       ----------------------------------------------------------------------- */

    var ROLES = {
        quiet: {
            id: 'quiet',
            label: 'Quiet zone',
            description: 'Blank margin with no marks that lets a scanner find where the symbol starts and ends.',
            color: '#dfe4ea'
        },
        guard: {
            id: 'guard',
            label: 'Guard pattern',
            description: 'Fixed bar/space pattern that frames the symbol and gives the scanner a known reference for the module width.',
            color: '#2f6f7e'
        },
        start: {
            id: 'start',
            label: 'Start character',
            description: 'Tells the decoder which symbology and code set follows, and in which direction the symbol is being read.',
            color: '#1f7a4d'
        },
        stop: {
            id: 'stop',
            label: 'Stop character',
            description: 'Marks the end of the symbol so the decoder knows the message is complete.',
            color: '#a03d1f'
        },
        data: {
            id: 'data',
            label: 'Data character',
            description: 'One encoded character of the payload.',
            color: '#2b5d9b'
        },
        check: {
            id: 'check',
            label: 'Check character',
            description: 'Computed from the data characters and verified by the decoder, so a misread is far more likely to be rejected than accepted.',
            color: '#fe8e14'
        },
        pair: {
            id: 'pair',
            label: 'Interleaved digit pair',
            description: 'Two digits interleaved into one set of five bars: the first digit is written in the bars, the second in the spaces between them.',
            color: '#7a4fbf'
        },
        bearer: {
            id: 'bearer',
            label: 'Bearer bar',
            description: 'The thick frame printed around an ITF-14 symbol. It is not part of the encoded message; it protects the bars from smudging on corrugated board and keeps the symbol height uniform for a fixed scanner.',
            color: '#6b7280'
        }
    };

    /* A palette shared by every symbology, so "green means the start
       character" holds whether the reader is looking at EAN-13 or Code 39.
       Data characters cycle through the blues, digit pairs through the
       purples, so neighbouring characters stay visually distinct. */
    var PALETTE = {
        quiet: ['#dfe4ea'],
        guard: ['#2f6f7e', '#3d8b9c'],
        check: ['#fe8e14'],
        start: ['#1f7a4d', '#2a8f5c'],
        stop: ['#a03d1f'],
        data: ['#2b5d9b', '#3a76c4', '#24507f'],
        pair: ['#7a4fbf', '#9068d6', '#5f3a9e'],
        bearer: ['#6b7280']
    };

    function roleColor(roleId, index) {
        var list = PALETTE[roleId] || PALETTE.data;
        return list[index % list.length];
    }

    /* -----------------------------------------------------------------------
       Small helpers
       ----------------------------------------------------------------------- */

    function digitsOf(text) {
        return String(text == null ? '' : text).replace(/[^0-9]/g, '');
    }

    /* GTIN / EAN check digit.

       Weight 3 and 1 alternately, always ending on weight 1 at the RIGHTMOST
       payload digit, then round the sum up to the next multiple of ten. Which
       weight the leftmost digit gets therefore depends on the parity of the
       payload length — that is a property of the standard, not an accident:
       GTIN-14 specifies its 13-digit payload with the rightmost digit weighted
       1 (equivalently, counting position 1 from the left), while EAN-13's
       12-digit payload works out the same way. Starting the alternating run
       from the right end is what makes one function correct for both. */
    function mod10CheckDigit(payload) {
        return String((10 - (weightedDigitSum(payload) % 10)) % 10);
    }

    /* The weighted sum a check digit is derived from, exposed so the page can
       show the arithmetic instead of just asserting a result. Weights run
       1, 3, 1, 3 ... from the rightmost digit leftwards. */
    function weightedDigitSum(payload) {
        var sum = 0;
        var weight = payload.length % 2 === 0 ? 1 : 3;
        for (var i = payload.length - 1; i >= 0; i--) {
            sum += parseInt(payload.charAt(i), 10) * weight;
            weight = weight === 3 ? 1 : 3;
        }
        return sum;
    }

    function mod43CheckCharacter(payload) {
        var ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
        var sum = 0;
        for (var i = 0; i < payload.length; i++) {
            var at = ALPHABET.indexOf(payload.charAt(i));
            if (at < 0) {
                throw new Error('Code 39 cannot encode "' + payload.charAt(i) +
                    '". Allowed characters: 0-9 A-Z space - . $ / + %');
            }
            sum += at;
        }
        return ALPHABET.charAt(sum % 43);
    }

    /* Turn a "1101" pattern into the element runs the diagram draws as
       individual bars. `wide` marks which elements are wide, in symbology
       order (bars and spaces interleaved). */
    function runsFromPattern(pattern, wideFlags) {
        var runs = [];
        var i = 0;
        var elementIndex = 0;
        while (i < pattern.length) {
            var bit = pattern.charAt(i);
            var length = 1;
            while (i + length < pattern.length && pattern.charAt(i + length) === bit) {
                length++;
            }
            runs.push({
                black: bit === '1',
                length: length,
                width: wideFlags && wideFlags[elementIndex] ? 'wide' : 'narrow'
            });
            i += length;
            elementIndex++;
        }
        return runs;
    }

    /* -----------------------------------------------------------------------
       EAN-13 — ISO/IEC 15420

       A 13-digit number. The first digit is not drawn as a character at all:
       it selects which of the three left-hand tables (A/B) each of the six
       following digits uses, and that pattern of A/B choices — the parity
       pattern — is how the decoder recovers the 13th digit.

       Layout, in modules:
         11 quiet | 101 | 6 digits x 7 | 01010 | 6 digits x 7 | 101 | 7 quiet
         = 11 + 3 + 42 + 5 + 42 + 3 + 7 = 113 modules drawn, 117 with the
         nominal quiet zones.
       ----------------------------------------------------------------------- */

    var EAN_L = [
        '0001101', '0011001', '0010011', '0111101', '0100011',
        '0110001', '0101111', '0111011', '0110111', '0001011'
    ];
    var EAN_G = [
        '0100111', '0110011', '0011011', '0100001', '0011101',
        '0111001', '0000101', '0010001', '0001001', '0010111'
    ];
    var EAN_R = [
        '1110010', '1100110', '1101100', '1000010', '1011100',
        '1001110', '1010000', '1000100', '1001000', '1110100'
    ];
    /* Parity pattern of the left half, indexed by the leading digit.
       A = odd parity (table L), B = even parity (table G). */
    var EAN_PARITY = [
        'AAAAAA', 'AABABB', 'AABBAB', 'AABBBA', 'ABAABB',
        'ABBAAB', 'ABBBAA', 'ABABAB', 'ABABBA', 'ABBABA'
    ];

    function encodeEAN13(input) {
        var raw = digitsOf(input);
        var notes = [];
        var payload;

        if (raw.length === 12) {
            payload = raw;
            notes.push('12 digits supplied — the check digit ' + mod10CheckDigit(raw) + ' was computed and appended.');
        } else if (raw.length === 13) {
            payload = raw.slice(0, 12);
            var given = raw.charAt(12);
            var expected = mod10CheckDigit(payload);
            if (given !== expected) {
                notes.push('The supplied check digit ' + given + ' is wrong for ' + payload +
                    '; the correct digit ' + expected + ' is shown instead.');
            }
            notes.push('13 digits supplied — the last one is the check digit, verified rather than recomputed.');
        } else {
            throw new Error('EAN-13 needs 12 digits (the check digit is computed) or 13 digits (the check digit is verified). Got ' +
                raw.length + ' digit' + (raw.length === 1 ? '' : 's') + '.');
        }

        var check = mod10CheckDigit(payload);
        var full = payload + check;
        var parity = EAN_PARITY[parseInt(full.charAt(0), 10)];
        var left = '';
        var right = '';
        for (var i = 0; i < 6; i++) {
            var digit = parseInt(full.charAt(i + 1), 10);
            left += parity.charAt(i) === 'A' ? EAN_L[digit] : EAN_G[digit];
            right += EAN_R[parseInt(full.charAt(i + 7), 10)];
        }

        /* Groups carry the diagrams; `pattern` is what a decoder actually
           sees, so the two can never drift apart. */
        var groups = [];
        var drawn = 0;
        var cursor = 0;

        function pushGroup(group, pattern) {
            group.pattern = pattern;
            group.modules = pattern.split('').map(function (c) { return c === '1' ? 1 : 0; });
            group.count = pattern.length;
            group.startModule = cursor;
            group.endModule = cursor + pattern.length - 1;
            cursor += pattern.length;
            groups.push(group);
            return group;
        }

        pushGroup({
            id: 'guard-start',
            title: 'Start guard',
            role: 'guard',
            roleLabel: 'Guard pattern',
            patternLabel: '101',
            kind: 'fixed',
            description: 'Two bars with a single space between them. It marks where the symbol begins and, because 101 is the narrowest legal structure in the symbol, it is the first thing a scanner measures to work out how wide one module is.',
            detail: 'Also called the left guard. EAN-13 uses 101 at the start and 101 at the end, but 01010 in the middle — a scanner cannot confuse the two, so it can tell which end of the symbol it is reading and decode a reversed scan correctly.',
            modulesLabel: '3 modules · bar 1 · space 1 · bar 1'
        }, '101');

        pushGroup({
            id: 'left-half',
            title: 'Left half — digits 2 to 7',
            role: 'data',
            roleLabel: 'Data characters',
            kind: 'data',
            description: 'Six digits, 7 modules each, using the L table (odd parity) or the G table (even parity). The choice is dictated by the first digit of the number.',
            detail: 'The left half is where EAN-13 hides its 13th digit: digit 1 never appears as bars, it only picks the parity pattern of these six digits. ' +
                'For ' + full + ' the leading ' + full.charAt(0) + ' selects ' + parity + '.',
            modulesLabel: '6 x 7 = 42 modules',
            parity: parity,
            characters: (function () {
                var out = [];
                for (var k = 1; k <= 6; k++) {
                    var d = parseInt(full.charAt(k), 10);
                    out.push({
                        char: full.charAt(k),
                        pattern: parity.charAt(k - 1) === 'A' ? EAN_L[d] : EAN_G[d],
                        table: parity.charAt(k - 1) === 'A' ? 'L (odd parity)' : 'G (even parity)'
                    });
                }
                return out;
            }())
        }, left);

        pushGroup({
            id: 'guard-centre',
            title: 'Centre guard',
            role: 'guard',
            roleLabel: 'Guard pattern',
            patternLabel: '01010',
            kind: 'fixed',
            description: 'Five modules that split the symbol in two. Because it starts with a space and ends with a space, it can never be produced by data characters on either side — so it is an unambiguous anchor for the middle of the symbol.',
            detail: 'It is also the marker a scanner uses to decide that the left half it just read and the right half it is about to read belong to the same symbol, and to re-synchronise if a bar was misread.',
            modulesLabel: '5 modules · space bar space bar space'
        }, '01010');

        pushGroup({
            id: 'right-half',
            title: 'Right half — digits 8 to 13',
            role: 'data',
            roleLabel: 'Data characters',
            kind: 'data',
            description: 'Six digits, 7 modules each, all using the R table. Every right-hand character starts with a bar and ends with a space, mirroring the left half.',
            detail: 'The R table is the bitwise complement of the L table: where the left half encodes digit 0 as 0001101, the right half encodes it as 1110010. That complement is what stops a scanner from reading the symbol backwards and returning plausible digits.',
            modulesLabel: '6 x 7 = 42 modules',
            characters: (function () {
                var out = [];
                for (var k = 7; k <= 12; k++) {
                    out.push({
                        char: full.charAt(k),
                        pattern: EAN_R[parseInt(full.charAt(k), 10)],
                        table: 'R (right half)'
                    });
                }
                return out;
            }())
        }, right);

        pushGroup({
            id: 'guard-end',
            title: 'End guard',
            role: 'guard',
            roleLabel: 'Guard pattern',
            patternLabel: '101',
            kind: 'fixed',
            description: 'The mirror of the start guard: it closes the symbol and tells the decoder the message is complete.',
            detail: 'A guard and a stop character are not the same thing. In EAN-13 this is a fixed pattern that carries no data; in Code 128 and Code 39 the end of the symbol is a full symbol character with its own meaning.',
            modulesLabel: '3 modules · bar 1 · space 1 · bar 1'
        }, '101');

        /* Human readable text. EAN-13 places digit 1 outside the left guard,
           the six left digits under the left half and the six right digits
           under the right half, so the printed number reads continuously. */
        var hri = [
            { text: full.charAt(0), startModule: 0, endModule: 10, align: 'right', style: 'outside' }
        ];
        for (var leftIndex = 0; leftIndex < 6; leftIndex++) {
            hri.push({
                text: full.charAt(leftIndex + 1),
                startModule: 14 + leftIndex * 7,
                endModule: 14 + leftIndex * 7 + 6,
                align: 'center',
                style: 'under'
            });
        }
        for (var rightIndex = 0; rightIndex < 6; rightIndex++) {
            hri.push({
                text: full.charAt(rightIndex + 7),
                startModule: 61 + rightIndex * 7,
                endModule: 61 + rightIndex * 7 + 6,
                align: 'center',
                style: 'under'
            });
        }

        return {
            symbology: 'ean13',
            symbologyLabel: 'EAN-13',
            payload: payload,
            displayText: full,
            check: {
                value: check,
                label: 'Check digit',
                algorithm: 'Weight the 12 payload digits 3 and 1 alternately from the right, sum them, and take the difference from the next multiple of ten.',
                parts: totalDigitSum(full)
            },
            quietZone: { left: 11, right: 7 },
            humanReadable: hri,
            modules: groups.reduce(function (acc, g) { return acc.concat(g.modules); }, []),
            groups: groups,
            notes: notes
        };
    }

    function totalDigitSum(full) {
        /* The weighted sum the check digit was derived from — over the payload,
           which is every digit except the trailing check digit. */
        return weightedDigitSum(full.slice(0, full.length - 1));
    }

    /* -----------------------------------------------------------------------
       Code 128 — ISO/IEC 15417

       Every symbol character is 11 modules: three bars and three spaces, with
       the widths taken from the table below (the 1-4-1 bar pattern and the
       1-1-3 space pattern in BWIPP terms, written out here as the module
       string a scanner sees). The symbol is:

         quiet | Start | data... | check | Stop | quiet

       The stop character is the one exception: 13 modules, ending in the
       doubled 2-module bar that is unique in the symbology.
       ----------------------------------------------------------------------- */

    /* The symbology table, values 0-106, exactly as the specification prints
       it: six element widths per symbol character, alternating bar and space,
       read left to right. Value 0 is the space character in both set A and
       set B; values 103-105 are the three start characters and 106 is the
       stop character, which is why it is the only entry with seven elements.
       The values are also the check-symbol weights: there is no symbol 106 on
       the checksum side because the stop is never included in the sum. */
    var C128_WIDTHS = [
        '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
        '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
        '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
        '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
        '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
        '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
        '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
        '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
        '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
        '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
        '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
    ];

    /* Symbol values of the three start characters, the stop character, and the
       Code C / Code B / Code A shift and FNC codes in each set. */
    var C128 = {
        START_A: 103, START_B: 104, START_C: 105, STOP: 106,
        /* Code A */
        A_CODE_B: 100, A_CODE_C: 99, A_SHIFT_B: 98,
        /* Code B */
        B_CODE_A: 101, B_CODE_C: 99, B_SHIFT_A: 98,
        /* Code C */
        C_CODE_B: 100, C_CODE_A: 101, C_FNC1: 102,
        FNC1: 102, FNC2: 97, FNC3: 96, FNC4_A: 101, FNC4_B: 100
    };

    function c128Pattern(value) {
        var widths = C128_WIDTHS[value];
        if (!widths) {
            throw new Error('Code 128 has no symbol value ' + value);
        }
        var out = '';
        var black = true;
        for (var i = 0; i < widths.length; i++) {
            var n = parseInt(widths.charAt(i), 10);
            out += (black ? '1' : '0').repeat(n);
            black = !black;
        }
        return out;
    }

    function c128WidthList(value) {
        return C128_WIDTHS[value].split('').map(function (c) { return parseInt(c, 10); });
    }

    function isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }

    /* Where the run of digits starting at `from` ends. Code set C encodes two
       digits per symbol character, so a run of digits is the only thing that
       makes it worth switching — and a run that is not a whole number of pairs
       may still be worth switching when the odd digit can be absorbed by a
       neighbouring code set for free. */
    function digitRunLength(text, from) {
        var n = 0;
        while (from + n < text.length && isDigit(text.charAt(from + n))) {
            n++;
        }
        return n;
    }

    /* Is a run of digits worth a switch into code set C?

       Switching costs one symbol character, so the run has to be worth at least
       two C characters, and it must not leave a half-consumed pair behind: in
       code C the pairs are fixed, so an odd run can only be taken when the odd
       digit is the last character of the message and there is no later
       character that would have to be encoded anyway. */
    function worthSwitchingToC(text, from) {
        var run = digitRunLength(text, from);
        if (run < 4) {
            return false;
        }
        if (run % 2 === 0) {
            return true;
        }
        return run === text.length - from;
    }

    /* Code set selection.

       The standard does not prescribe one algorithm — any sequence of
       characters a decoder can follow is valid — so this follows the widely
       used "switch when it pays" rule: Code C for runs of digits long enough
       to be worth the extra switch symbol, Code A only when a control
       character forces it, Code B otherwise. */
    function encodeCode128(input, options) {
        var text = String(input == null ? '' : input);
        if (!text.length) {
            throw new Error('Code 128 needs at least one character.');
        }
        var forceSet = (options && options.codeSet) || 'auto';

        var symbols = [];   /* { value, label, set, char, kind } */
        var current = null;

        function push(value, label, kind, char) {
            symbols.push({ value: value, label: label, set: current, kind: kind || 'data', char: char });
        }

        var i = 0;
        /* Starting set */
        if (forceSet === 'C' || (forceSet === 'auto' && digitRunLength(text, 0) >= 4)) {
            current = 'C';
        } else if (forceSet === 'A') {
            current = 'A';
        } else {
            current = 'B';
        }
        push(current === 'A' ? C128.START_A : current === 'C' ? C128.START_C : C128.START_B,
            'Start ' + current, 'start');

        while (i < text.length) {
            var ch = text.charAt(i);

            if (current === 'C') {
                var remaining = digitRunLength(text, i);
                if (remaining >= 2) {
                    var value = parseInt(text.substr(i, 2), 10);
                    push(value, text.substr(i, 2), 'data', text.substr(i, 2));
                    i += 2;
                    continue;
                }
                /* Not a digit pair any more: fall back to A or B. */
                if (forceSet === 'C') {
                    throw new Error('Code set C can only encode digits in pairs; "' + ch +
                        '" at position ' + (i + 1) + ' cannot be encoded. Choose code set A, B or auto.');
                }
                current = 'B';
                push(C128.C_CODE_B, 'Code B', 'switch');
                continue;
            }

            if (current === 'B') {
                if (forceSet === 'auto' && worthSwitchingToC(text, i)) {
                    current = 'C';
                    push(C128.B_CODE_C, 'Code C', 'switch');
                    continue;
                }
                var codeB = text.charCodeAt(i);
                if (codeB < 32) {
                    if (forceSet === 'B') {
                        throw new Error('Code set B cannot encode control character U+' +
                            codeB.toString(16).toUpperCase().padStart(4, '0') + '; use code set A or auto.');
                    }
                    current = 'A';
                    push(C128.B_CODE_A, 'Code A', 'switch');
                    continue;
                }
                if (codeB > 126) {
                    throw new Error('Code 128 encodes ASCII 0-127 only; "' + ch + '" is outside that range.');
                }
                push(codeB - 32, ch, 'data', ch);
                i += 1;
                continue;
            }

            /* current === 'A' */
            if (forceSet === 'auto' && worthSwitchingToC(text, i)) {
                current = 'C';
                push(C128.A_CODE_C, 'Code C', 'switch');
                continue;
            }
            var codeA = text.charCodeAt(i);
            if (codeA >= 32 && codeA <= 95) {
                push(codeA - 32, ch, 'data', ch);
            } else if (codeA < 32) {
                push(codeA + 64, 'U+' + codeA.toString(16).toUpperCase().padStart(4, '0'), 'data', ch);
            } else {
                if (forceSet === 'A') {
                    throw new Error('Code set A cannot encode "' + ch + '"; use code set B or auto.');
                }
                current = 'B';
                push(C128.A_CODE_B, 'Code B', 'switch');
                continue;
            }
            i += 1;
        }

        /* Check symbol: the start character is weighted 1, the first data
           symbol 2, and so on, modulo 103. */
        var checksum = symbols[0].value;
        for (var s = 1; s < symbols.length; s++) {
            checksum += symbols[s].value * s;
        }
        var checkValue = checksum % 103;

        /* Build the module sequence and the groups at the same time. */
        var groups = [];
        var cursor = 0;

        function appendGroup(pattern, group) {
            group.pattern = pattern;
            group.modules = pattern.split('').map(function (c) { return c === '1' ? 1 : 0; });
            group.count = pattern.length;
            group.startModule = cursor;
            group.endModule = cursor + pattern.length - 1;
            cursor += pattern.length;
            groups.push(group);
            return group;
        }

        var startSymbol = symbols[0];
        appendGroup(c128Pattern(startSymbol.value), {
            id: 'start',
            title: 'Start ' + startSymbol.set,
            role: 'start',
            roleLabel: 'Start character',
            kind: 'fixed',
            description: 'The start character does two jobs: it tells the decoder that this is a Code 128 symbol, and it declares which of the three code sets the first data characters are written in.',
            detail: 'Code 128 has three start characters — Start A (' + C128.START_A + '), Start B (' + C128.START_B +
                ') and Start C (' + C128.START_C + '). ' + (startSymbol.set === 'C'
                    ? 'Start C was chosen here because the value begins with a run of at least four digits, which set C packs two digits into one 11-module character.'
                    : 'Start ' + startSymbol.set + ' was chosen here because the value contains characters that set C cannot represent.'),
            modulesLabel: '11 modules · 6 elements',
            characters: [characterRow(startSymbol)]
        });

        /* Consecutive data characters are emitted as one hoverable group per
           character, but switch/check symbols get their own labelled group so
           the diagram can say what they are. */
        var dataIndex = 0;
        for (var k = 1; k < symbols.length; k++) {
            var sym = symbols[k];
            var pattern = c128Pattern(sym.value);
            if (sym.kind === 'switch') {
                appendGroup(pattern, {
                    id: 'switch-' + k,
                    title: sym.label,
                    role: 'start',
                    roleLabel: 'Code set switch',
                    kind: 'switch',
                    description: 'A control symbol, not a character: it switches the decoder into ' + sym.label + ' for the characters that follow.',
                    detail: 'Code 128 can change code set in the middle of a symbol, which is why a Code 128 barcode of a phone number uses far fewer bars than Code 39 would for the same digits.',
                    modulesLabel: '11 modules · 6 elements',
                    characters: [characterRow(sym)]
                });
                continue;
            }
            dataIndex += 1;
            appendGroup(pattern, {
                id: 'data-' + k,
                title: 'Data ' + dataIndex + ' — "' + sym.char + '"',
                role: 'data',
                roleLabel: 'Data character',
                kind: 'data',
                description: 'One payload character, encoded as three bars and three spaces whose widths are unique to that value within the code set.',
                detail: 'Character "' + sym.char + '" is symbol value ' + sym.value + ' in code set ' + sym.set +
                    '. The six element widths for this value are ' + c128WidthList(sym.value).join('-') +
                    ' modules, summing to 11 — every Code 128 symbol character is exactly 11 modules wide, which is what makes its density predictable.',
                modulesLabel: '11 modules · 6 elements',
                characters: [characterRow(sym)],
                dataIndex: dataIndex
            });
        }

        appendGroup(c128Pattern(checkValue), {
            id: 'check',
            title: 'Check symbol',
            role: 'check',
            roleLabel: 'Check character',
            kind: 'check',
            description: 'A modulo-103 check: the start symbol is weighted 1, the first data symbol 2, and so on, and the sum is taken modulo 103. The decoder recomputes it and rejects the scan if it does not match.',
            detail: 'The check symbol is a complete 11-module character, not a single parity bit — so a Code 128 scan that survives the check is very unlikely to be a misread. Value here: ' + checkValue +
                ' (' + c128WidthList(checkValue).join('-') + ').',
            modulesLabel: '11 modules · 6 elements',
            characters: [{
                value: checkValue,
                label: String(checkValue),
                set: '—',
                kind: 'check',
                widths: c128WidthList(checkValue),
                pattern: c128Pattern(checkValue),
                sum: checksum
            }],
            checksum: checksum
        });

        var stopPattern = c128Pattern(C128.STOP);
        appendGroup(stopPattern, {
            id: 'stop',
            title: 'Stop character',
            role: 'stop',
            roleLabel: 'Stop character',
            kind: 'fixed',
            description: 'The end of the symbol, and the only 13-module character in Code 128: the final bar is two modules wide, a pattern no data character can produce.',
            detail: 'That doubled bar is what lets a scanner recognise the end of the symbol rather than just running out of bars, and it is why Code 128 can be decoded in either direction.',
            modulesLabel: '13 modules · 7 elements',
            characters: [{
                value: C128.STOP,
                label: 'Stop',
                set: '—',
                kind: 'stop',
                widths: c128WidthList(C128.STOP),
                pattern: stopPattern
            }]
        });

        var switchCount = symbols.filter(function (s2) { return s2.kind === 'switch'; }).length;

        return {
            symbology: 'code128',
            symbologyLabel: 'Code 128',
            payload: text,
            displayText: text,
            codeSet: startSymbol.set,
            codeSetSequence: symbols.filter(function (s2) {
                return s2.kind === 'start' || s2.kind === 'switch';
            }).map(function (s2) { return s2.kind === 'start' ? 'Start ' + s2.set : s2.label; }),
            quietZone: { left: 10, right: 10 },
            humanReadable: [],
            modules: groups.reduce(function (acc, g) { return acc.concat(g.modules); }, []),
            groups: groups,
            notes: [
                'Quiet zone of at least 10 modules on both sides — ten times the narrow module — is part of the specification, not a printing nicety.',
                switchCount
                    ? 'This symbol changes code set ' + switchCount + ' time' + (switchCount === 1 ? '' : 's') +
                      ' (' + symbols.filter(function (s2) { return s2.kind === 'start' || s2.kind === 'switch'; })
                          .map(function (s2) { return s2.kind === 'start' ? 'Start ' + s2.set : s2.label; }).join(' → ') +
                      '), which is normal: a change of code set is itself a symbol character.'
                    : 'This symbol uses code set ' + startSymbol.set + ' from start to stop, with no mid-symbol switch.'
            ]
        };
    }

    function characterRow(sym) {
        return {
            value: sym.value,
            label: sym.label,
            set: sym.set,
            kind: sym.kind,
            widths: c128WidthList(sym.value),
            pattern: c128Pattern(sym.value)
        };
    }

    /* -----------------------------------------------------------------------
       Code 39 — ISO/IEC 16388

       Each character is nine elements: five bars and four spaces, of which
       exactly three are wide. Characters are separated by a narrow space.
       A symbol is:

         quiet | * | gap | char | gap | ... | char | gap | * | quiet

       The asterisk is not data — it is the start/stop character, and it is why
       Code 39 payloads cannot contain a literal `*`.
       ----------------------------------------------------------------------- */

    /* 0 = narrow, 1 = wide, in instrument order (bar, space, bar, space, ...) */
    var CODE39_PATTERNS = {
        '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
        '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
        '8': '100100100', '9': '001100100',
        'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001',
        'E': '100011000', 'F': '001011000', 'G': '000001101', 'H': '100001100',
        'I': '001001100', 'J': '000011100', 'K': '100000011', 'L': '001000011',
        'M': '101000010', 'N': '000010011', 'O': '100010010', 'P': '001010010',
        'Q': '000000111', 'R': '100000110', 'S': '001000110', 'T': '000010110',
        'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001',
        'Y': '110010000', 'Z': '011010000',
        '-': '000101001', '.': '000110010', ' ': '011000100', '$': '010101000',
        '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
    };

    var CODE39_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

    /* Wide:narrow ratio. Code 39 is specified between 2:1 and 3:1; 3:1 is the
       most common choice and the one this diagram draws. */
    var CODE39_WIDE = 3;

    function code39Pattern(char) {
        var spec = CODE39_PATTERNS[char];
        if (!spec) {
            throw new Error('Code 39 cannot encode "' + char + '".');
        }
        var out = '';
        var wideFlags = [];
        var black = true;
        for (var i = 0; i < spec.length; i++) {
            var wide = spec.charAt(i) === '1';
            wideFlags.push(wide);
            out += (black ? '1' : '0').repeat(wide ? CODE39_WIDE : 1);
            black = !black;
        }
        return { pattern: out, wideFlags: wideFlags, spec: spec };
    }

    function encodeCode39(input, options) {
        var text = String(input == null ? '' : input).toUpperCase();
        if (!text.length) {
            throw new Error('Code 39 needs at least one character.');
        }
        if (text.indexOf('*') >= 0) {
            throw new Error('Code 39 reserves "*" as the start/stop character, so it cannot appear in the payload.');
        }
        for (var t = 0; t < text.length; t++) {
            if (CODE39_ALPHABET.indexOf(text.charAt(t)) < 0) {
                throw new Error('Code 39 cannot encode "' + input.charAt(t) +
                    '". Its 43 characters are 0-9, A-Z, space and - . $ / + %' +
                    (input.charAt(t) !== text.charAt(t) ? ' (lowercase is uppercased automatically).' : '.'));
            }
        }

        var withCheck = !!(options && options.checkCharacter);
        var check = withCheck ? mod43CheckCharacter(text) : null;
        var body = withCheck ? text + check : text;

        var groups = [];
        var cursor = 0;

        function appendGroup(pattern, wideFlags, group) {
            group.pattern = pattern;
            group.modules = pattern.split('').map(function (c) { return c === '1' ? 1 : 0; });
            group.count = pattern.length;
            group.startModule = cursor;
            group.endModule = cursor + pattern.length - 1;
            group.elements = runsFromPattern(pattern, wideFlags);
            group.wideFlags = wideFlags;
            cursor += pattern.length;
            groups.push(group);
            return group;
        }

        var start = code39Pattern('*');
        appendGroup(start.pattern, start.wideFlags, {
            id: 'start',
            title: 'Start character " * "',
            role: 'start',
            roleLabel: 'Start character',
            kind: 'fixed',
            description: 'Code 39 is read from its start character, which is always an asterisk. It frames the symbol together with the identical stop character at the other end.',
            detail: 'Because the asterisk is reserved, it can never appear in the payload — and because the start and stop characters are the same, a Code 39 symbol is the same read forwards or backwards. A decoder resolves that by convention: the first asterisk is the start.',
            modulesLabel: '9 elements · 3 wide · ' + start.pattern.length + ' modules at 3:1',
            characters: [{
                label: '*',
                spec: start.spec,
                pattern: start.pattern,
                widths: widthListFromSpec(start.spec, CODE39_WIDE),
                wide: 3,
                note: 'Start / stop'
            }]
        });

        for (var i = 0; i < body.length; i++) {
            var ch = body.charAt(i);
            var encoded = code39Pattern(ch);
            var isCheck = withCheck && i === body.length - 1;
            appendGroup(encoded.pattern, encoded.wideFlags, {
                id: (isCheck ? 'check' : 'data-' + (i + 1)),
                title: isCheck ? 'Check character "' + ch + '"' : 'Data ' + (i + 1) + ' — "' + ch + '"',
                role: isCheck ? 'check' : 'data',
                roleLabel: isCheck ? 'Check character' : 'Data character',
                kind: isCheck ? 'check' : 'data',
                description: isCheck
                    ? 'An optional modulo-43 check character, which the decoder recomputes from the data characters. Code 39 does not require it, which is why many Code 39 symbols have no check at all.'
                    : 'Five bars and four spaces, of which exactly three are wide. Which three are wide is what identifies the character.',
                detail: 'This character is ' + encoded.spec.split('').map(function (b) { return b === '1' ? 'W' : 'n'; }).join('') +
                    ' (W = wide, n = narrow, in bar/space order) and measures ' + encoded.pattern.length +
                    ' modules at a 3:1 wide-to-narrow ratio. Drawn at 2:1 it would be narrower; the ratio is a print decision inside the 2:1-3:1 the standard allows.',
                modulesLabel: '9 elements · 3 wide · ' + encoded.pattern.length + ' modules at 3:1',
                characters: [{
                    label: ch,
                    spec: encoded.spec,
                    pattern: encoded.pattern,
                    widths: widthListFromSpec(encoded.spec, CODE39_WIDE),
                    wide: 3
                }]
            });

            /* The inter-character gap. It is a narrow space and it is part of
               the symbol, not padding, so it is drawn — one module of white
               that keeps two characters from touching. It carries no data, so
               it is its own group rather than being merged into a neighbour. */
            if (i < body.length - 1) {
                appendGroup('0', [false], {
                    id: 'gap-' + (i + 1),
                    title: 'Inter-character gap',
                    role: 'data',
                    roleLabel: 'Inter-character gap',
                    kind: 'gap',
                    description: 'A single narrow space between two Code 39 characters. It carries no data — it exists so the decoder can tell where one character ends and the next begins.',
                    detail: 'The gap is the reason Code 39 is a "discrete" symbology: characters are separate, unlike Code 128 or ITF where neighbouring characters share element boundaries. Discrete encoding costs width, but it makes each character independently recognisable.',
                    modulesLabel: '1 module',
                    characters: []
                });
            }
        }

        var stop = code39Pattern('*');
        appendGroup(stop.pattern, stop.wideFlags, {
            id: 'stop',
            title: 'Stop character " * "',
            role: 'stop',
            roleLabel: 'Stop character',
            kind: 'fixed',
            description: 'Identical to the start character. The decoder treats the second asterisk as the end of the message.',
            detail: 'A Code 39 symbol is not self-clocking the way Code 128 is; the decoder relies on the start and stop asterisks plus the inter-character gaps to segment the scan.',
            modulesLabel: '9 elements · 3 wide · ' + stop.pattern.length + ' modules at 3:1',
            characters: [{
                label: '*',
                spec: stop.spec,
                pattern: stop.pattern,
                widths: widthListFromSpec(stop.spec, CODE39_WIDE),
                wide: 3,
                note: 'Start / stop'
            }]
        });

        var totalModules = groups.reduce(function (acc, g) { return acc + g.count; }, 0);
        return {
            symbology: 'code39',
            symbologyLabel: 'Code 39',
            payload: text,
            displayText: '*' + body + '*',
            check: withCheck ? {
                value: check,
                label: 'Mod-43 check character',
                algorithm: 'Map every character to its index in the 43-character alphabet, sum the indices, and take the remainder modulo 43.',
                parts: null
            } : null,
            quietZone: { left: 10, right: 10 },
            humanReadable: [],
            modules: groups.reduce(function (acc, g) { return acc.concat(g.modules); }, []),
            groups: groups,
            notes: [
                'Code 39 is a discrete symbology: every character is self-contained and separated by an inter-character gap, so ' +
                body.length + ' characters cost ' + totalModules + ' modules at a 3:1 ratio.',
                'Lowercase input was converted to uppercase. Code 39 has no lowercase characters — full ASCII mode can represent them, but only by encoding them as two-character escape sequences.'
            ]
        };
    }

    function widthListFromSpec(spec, wide) {
        return spec.split('').map(function (c) { return c === '1' ? wide : 1; });
    }

    /* -----------------------------------------------------------------------
       ITF-14 — ISO/IEC 16390 + GS1 General Specifications

       Interleaved 2 of 5. Digits are encoded in pairs: five bars carry the
       first digit, the five spaces between them carry the second. Each digit
       has exactly two wide elements out of five, so a digit pair is always
       14 modules — the most compact way to encode digits in a linear symbol.

       ITF-14 is the GS1 application: exactly 14 digits (a GTIN-14), printed
       inside a bearer bar on corrugated shipping cases.
       ----------------------------------------------------------------------- */

    /* Which two of the five elements are wide, per digit.

       The published table is usually printed as bar weights
       (0 = nnwwn, 1 = wnnnw, 2 = nwnnw, 3 = wwnnn, 4 = nnwnw, 5 = wnwnn,
       6 = nwwnn, 7 = nnnww, 8 = wnnwn, 9 = nwnwn), with the five positions
       counted from the leftmost bar of the character. The same table gives the
       widths of the five spaces between those bars — position for position, in
       printing order — so one table serves both halves of the pair.

       Every digit is exactly two wide elements and three narrow ones. That is
       the rule the whole symbology is built on: two wide bars from the first
       digit plus two wide spaces from the second gives four wide elements in
       every pair. */
    var ITF_DIGIT_PATTERNS = [
        'nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw',
        'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'
    ];

    /* Wide:narrow ratio for ITF. GS1 permits 2.25:1 to 3.0:1 with 2.5:1 as the
       target; a module grid can only draw whole modules, so this diagram draws
       the top of the permitted range, 3:1, which is also what most shipping
       cases carry. */
    var ITF_WIDE = 3;

    function encodeITF14(input, options) {
        var raw = String(input == null ? '' : input).trim();
        var notes = [];
        if (!/^[0-9]+$/.test(raw)) {
            throw new Error('ITF-14 encodes digits only. "' + input + '" contains other characters.');
        }
        var payload;
        if (raw.length === 14) {
            payload = raw.slice(0, 13);
            var given = raw.charAt(13);
            var expectedDigit = mod10CheckDigit(payload);
            if (given !== expectedDigit) {
                notes.push('The supplied check digit ' + given + ' is wrong for ' + payload +
                    '; the correct digit ' + expectedDigit + ' is shown instead.');
            } else {
                notes.push('14 digits supplied — the last one is the check digit, verified rather than recomputed.');
            }
        } else if (raw.length === 13) {
            payload = raw;
            notes.push('13 digits supplied — the GTIN-14 check digit ' + mod10CheckDigit(raw) + ' was computed and appended.');
        } else if (raw.length % 2 === 0) {
            payload = raw;
            notes.push('This is not a 14-digit GTIN, so no check digit was added — an ITF symbol of ' +
                raw.length + ' digits is a valid symbol, but it is not a GS1 ITF-14.');
        } else {
            throw new Error('ITF needs an even number of digits (each character encodes a pair). ' +
                'Got ' + raw.length + '. A GS1 ITF-14 takes 13 digits (check digit computed) or all 14.');
        }

        /* A 13-digit payload gains its GTIN-14 check digit; a 14-digit payload
           is already a complete GTIN and is used as supplied — appending the
           check digit again would encode a 15-digit number and quietly change
           the value the reader asked for. Short even counts are plain ITF and
           get no check digit at all. */
        var full = raw.length === 13 ? raw + mod10CheckDigit(raw) : raw;
        var isGTIN = full.length === 14;
        var checkDigit = isGTIN ? mod10CheckDigit(full.slice(0, 13)) : null;

        var groups = [];
        var cursor = 0;

        function appendGroup(pattern, group) {
            group.pattern = pattern;
            group.modules = pattern.split('').map(function (c) { return c === '1' ? 1 : 0; });
            group.count = pattern.length;
            group.startModule = cursor;
            group.endModule = cursor + pattern.length - 1;
            cursor += pattern.length;
            groups.push(group);
            return group;
        }

        appendGroup('1010', {
            id: 'start',
            title: 'Start pattern',
            role: 'guard',
            roleLabel: 'Start pattern',
            kind: 'fixed',
            description: 'Narrow bar, narrow space, narrow bar, narrow space — 1010. It tells the decoder that an interleaved 2 of 5 symbol begins here.',
            detail: 'The start pattern is what distinguishes ITF from other linear symbologies. Interleaved 2 of 5 has no start or stop characters in the Code 39 sense: the start and stop are fixed guard patterns with no data value.',
            modulesLabel: '4 modules'
        });

        for (var pair = 0; pair < full.length; pair += 2) {
            var first = parseInt(full.charAt(pair), 10);
            var second = parseInt(full.charAt(pair + 1), 10);
            var barSpec = ITF_DIGIT_PATTERNS[first];
            var spaceSpec = ITF_DIGIT_PATTERNS[second];

            /* Interleave: bar widths come from the first digit, the widths of
               the five spaces between them from the second. Each element is
               expanded to its module count — 'w' means three modules at the
               3:1 ratio this diagram draws — and only then are bars and spaces
               woven together. */
            var barWidths = [];
            var spaceWidths = [];
            var pattern = '';
            for (var e = 0; e < 5; e++) {
                var barWidth = barSpec.charAt(e) === 'w' ? ITF_WIDE : 1;
                var spaceWidth = spaceSpec.charAt(e) === 'w' ? ITF_WIDE : 1;
                barWidths.push(barWidth);
                spaceWidths.push(spaceWidth);
                pattern += '1'.repeat(barWidth) + '0'.repeat(spaceWidth);
            }

            appendGroup(pattern, {
                id: 'pair-' + (pair / 2 + 1),
                title: 'Digit pair ' + first + '' + second,
                role: 'pair',
                roleLabel: 'Interleaved digit pair',
                kind: 'data',
                description: 'Two digits in one character: "' + first + '" is written in the widths of the five bars, "' + second + '" in the widths of the five spaces between them.',
                detail: 'Digit ' + first + ' uses ' + barSpec + ' across the bars and digit ' + second + ' uses ' +
                    spaceSpec + ' across the spaces (w = wide, n = narrow, in printing order). Every digit is two wide elements and three narrow ones, so a pair always holds four wide elements — which is why an ITF character is measurably wider than a Code 128 character carrying the same two digits, and why ITF needs an even number of digits: there is no way to encode a lone digit.',
                modulesLabel: pattern.length + ' modules · 5 bars + 5 spaces · 4 wide elements',
                digits: [first, second],
                barWidths: barWidths,
                spaceWidths: spaceWidths,
                barSpec: barSpec,
                spaceSpec: spaceSpec
            });
        }

        appendGroup('11101', {
            id: 'stop',
            title: 'Stop pattern',
            role: 'guard',
            roleLabel: 'Stop pattern',
            kind: 'fixed',
            description: 'Wide bar, wide bar, wide bar, narrow space, narrow bar — 11101. The widest mark in the symbol, so it cannot be confused with a data character.',
            detail: 'Because the stop pattern is asymmetric with the start pattern, an ITF symbol has a defined direction. A decoder can still read it in reverse, but only by reversing the digit pairs as well.',
            modulesLabel: '5 modules'
        });

        var hri = [];
        for (var d = 0; d < full.length; d++) {
            hri.push({
                text: full.charAt(d),
                startModule: 14 + d * 7,
                endModule: 14 + d * 7 + 6,
                align: 'center',
                style: 'under'
            });
        }

        return {
            symbology: 'itf14',
            symbologyLabel: isGTIN ? 'ITF-14' : 'Interleaved 2 of 5',
            payload: isGTIN ? full.slice(0, 13) : full,
            displayText: full,
            check: isGTIN ? {
                value: checkDigit,
                label: 'GTIN-14 check digit',
                algorithm: 'Weight the 13 digits 3 and 1 alternately from the right, sum them, and take the difference from the next multiple of ten.',
                parts: totalDigitSum(full)
            } : null,
            bearerBar: isGTIN,
            quietZone: { left: 10, right: 10 },
            humanReadable: hri,
            modules: groups.reduce(function (acc, g) { return acc.concat(g.modules); }, []),
            groups: groups,
            notes: notes.concat(isGTIN ? [
                'ITF-14 must be printed with a bearer bar — a solid frame about 4.8 mm thick — around the symbol. It is not part of the encoded data.',
                'The 14 digits are a GTIN-14: 1 packaging indicator + 12 digits of company prefix and item reference + 1 check digit.'
            ] : [])
        };
    }

    /* -----------------------------------------------------------------------
       Public surface
       ----------------------------------------------------------------------- */

    var SYMBOLOGIES = [
        {
            id: 'ean13',
            label: 'EAN-13',
            kind: '1D',
            status: 'Published',
            sample: '5901234123457',
            hint: '12 digits (check digit computed) or 13 digits (check digit verified). The retail symbol on almost every product.',
            inputMode: 'numeric'
        },
        {
            id: 'code128',
            label: 'Code 128',
            kind: '1D',
            status: 'Published',
            sample: 'Codepool-2026',
            hint: 'Any ASCII text. Three code sets and a modulo-103 check character; the densest common linear symbology.',
            inputMode: 'text'
        },
        {
            id: 'code39',
            label: 'Code 39',
            kind: '1D',
            status: 'Published',
            sample: 'CODE-39',
            hint: 'Digits, A-Z, space and - . $ / + %. Three wide elements per character and a lot of white space — old, wide, and very tolerant of poor printing.',
            inputMode: 'text'
        },
        {
            id: 'itf14',
            label: 'ITF-14',
            kind: '1D',
            status: 'Published',
            sample: '1540014128876',
            hint: '13 digits (GTIN-14 check digit computed) or all 14. Digits only, in pairs, printed inside a bearer bar on shipping cases.',
            inputMode: 'numeric'
        },
        {
            id: 'qrcode',
            label: 'QR Code',
            kind: '2D',
            status: 'Published',
            sample: 'https://www.dynamsoft.com/codepool/',
            hint: 'Any text or URL. A grid rather than a line: finder patterns, timing patterns and four levels of error correction.',
            inputMode: 'text'
        }
    ];

    function encode(symbologyId, text, options) {
        switch (String(symbologyId || '').toLowerCase()) {
            case 'ean13':
            case 'ean-13':
            case 'ean':
                return encodeEAN13(text);
            case 'code128':
            case 'code-128':
                return encodeCode128(text, options);
            case 'code39':
            case 'code-39':
                return encodeCode39(text, options);
            case 'itf14':
            case 'itf-14':
            case 'itf':
            case 'interleaved2of5':
                return encodeITF14(text, options);
            default:
                throw new Error('Unknown 1D symbology "' + symbologyId + '".');
        }
    }

    /* Element groups as a decoder sees them: a run-length sequence of black
       and white with each element's width class. Used by the tests to check
       the drawn symbol against the symbology rules, and by the page to render
       the "run-length sequence" panel. */
    function toElements(encoded) {
        var out = [];
        var value = null;
        encoded.modules.forEach(function (module) {
            var black = module === 1;
            if (value && value.black === black) {
                value.length += 1;
            } else {
                value = { black: black, length: 1 };
                out.push(value);
            }
        });
        var narrow = out.reduce(function (min, run) { return Math.min(min, run.length); }, Infinity);
        return out.map(function (run) {
            return {
                black: run.black,
                length: run.length,
                width: run.length === narrow ? 'narrow' : 'wide'
            };
        });
    }

    return {
        ROLES: ROLES,
        SYMBOLOGIES: SYMBOLOGIES,
        encode: encode,
        encodeEAN13: encodeEAN13,
        encodeCode128: encodeCode128,
        encodeCode39: encodeCode39,
        encodeITF14: encodeITF14,
        toElements: toElements,
        mod10CheckDigit: mod10CheckDigit,
        weightedDigitSum: weightedDigitSum,
        mod43CheckCharacter: mod43CheckCharacter,
        roleColor: roleColor,
        tables: {
            eanL: EAN_L,
            eanG: EAN_G,
            eanR: EAN_R,
            eanParity: EAN_PARITY,
            code128Widths: C128_WIDTHS,
            code39Patterns: CODE39_PATTERNS,
            code39Alphabet: CODE39_ALPHABET,
            itfBarPatterns: ITF_DIGIT_PATTERNS,
            itfWide: ITF_WIDE
        }
    };
}));
