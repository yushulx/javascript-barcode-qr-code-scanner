/*
 * make-samples.cjs — regenerate the bundled sample images.
 *
 * Run (needs the bwip-js package, e.g. via NODE_PATH):
 *   node make-samples.cjs
 *
 * Every VIN is asserted to be check-digit correct (or deliberately valid
 * without one, for the European form) before it is rendered — a sample image
 * whose ground truth is wrong poisons everything downstream.
 */

'use strict';

const { toBuffer } = require('bwip-js/node');
const { writeFileSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

const here = __dirname;
const outDir = join(here, 'sample-images');

/* --- VIN model (mirrors app.js) ----------------------------------------- */

const VIN_VALUES = {};
for (let d = 0; d <= 9; d++) VIN_VALUES[String(d)] = d;
Object.assign(VIN_VALUES, {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1,
    K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4,
    V: 5, W: 6, X: 7, Y: 8, Z: 9
});
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function vinCheckDigit(vin17) {
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += (VIN_VALUES[vin17[i]] || 0) * VIN_WEIGHTS[i];
    const check = sum % 11;
    return check === 10 ? 'X' : String(check);
}

/* --- Samples ------------------------------------------------------------- */

/* The classic Honda Accord example VIN: position 9 must be 3. */
const HONDA = '1HGCM82633A004352';
if (vinCheckDigit(HONDA) !== HONDA[8]) {
    throw new Error('Honda sample VIN fails its own check digit: expected '
        + vinCheckDigit(HONDA) + ' in position 9, got ' + HONDA[8]);
}

/* Toyota-style VIN with a valid check digit in position 9, carried behind a
   leading "I" (the import marker the 18-character North American form has). */
const TOYOTA = 'JTDKN3DU6A0123456';
if (vinCheckDigit(TOYOTA) !== TOYOTA[8]) {
    throw new Error('Toyota sample VIN fails its own check digit: expected '
        + vinCheckDigit(TOYOTA) + ' in position 9, got ' + TOYOTA[8]);
}

/* A European-form VIN: no check digit required, position 9 is a filler. */
const VW = 'WVWZZZ1JZXW000000';

const SAMPLES = [
    {
        file: 'vin-honda-code39.png',
        bcid: 'code39',
        text: HONDA,
        options: { scale: 3, height: 14, includetext: true, textsize: 10, textyoffset: 2, textxalign: 'center' }
    },
    {
        file: 'vin-toyota-import-code39.png',
        bcid: 'code39',
        text: 'I' + TOYOTA, // 18 characters: leading I import marker
        options: { scale: 3, height: 14, includetext: true, textsize: 10, textyoffset: 2, textxalign: 'center' }
    },
    {
        file: 'vin-vw-code128.png',
        bcid: 'code128',
        text: VW,
        options: { scale: 3, height: 14, includetext: true, textsize: 10, textyoffset: 2, textxalign: 'center' }
    },
    {
        file: 'vin-honda-datamatrix.png',
        bcid: 'datamatrix',
        text: HONDA,
        options: { scale: 6 }
    }
];

mkdirSync(outDir, { recursive: true });

(async () => {
    for (const sample of SAMPLES) {
        const png = await toBuffer({
            bcid: sample.bcid,
            text: sample.text,
            backgroundcolor: 'FFFFFF',
            paddingwidth: 16,
            paddingheight: 14,
            ...sample.options
        });
        const out = join(outDir, sample.file);
        writeFileSync(out, png);
        console.log('wrote', out, png.length, 'bytes', '(' + sample.bcid + ':', sample.text + ')');
    }
    console.log('All sample VINs verified: check digits correct where the standard requires one.');
})();
