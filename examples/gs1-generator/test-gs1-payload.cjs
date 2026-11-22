/*
 * Test harness for gs1-payload.js.  Run: node test-gs1-payload.cjs
 */
'use strict';

const P = require('./gs1-payload.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ok   ' + name); }
    else {
        failed++;
        console.log('  FAIL ' + name);
        console.log('         expected: ' + JSON.stringify(expected));
        console.log('         actual:   ' + JSON.stringify(actual));
    }
}

function ok(name, condition) { check(name, !!condition, true); }

console.log('\ngs1-payload.js tests\n');

/* -------------------------------------------------- 1. check digit maths */
check('checkDigit(0950600013435) === 2', P.checkDigit('0950600013435'), '2');
check('withCheckDigit completes a GTIN', P.withCheckDigit('0950600013435'), '09506000134352');
check('withCheckDigit completes an SSCC', P.withCheckDigit('34012345000000001'), '340123450000000017');

/* -------------------------------------------------- 2. sample values pass */
{
    const problems = [];
    P.AI_LIST.forEach((entry) => {
        const value = entry.sample();
        const issue = P.validateValue(entry, value);
        if (issue) problems.push(entry.ai + ' -> ' + JSON.stringify(value) + ': ' + issue);
    });
    check('every AI sample value validates', problems, []);
}

/* -------------------------------------------------- 3. every AI is unique */
{
    const seen = {};
    const dupes = [];
    P.AI_LIST.forEach((entry) => {
        if (seen[entry.ai]) dupes.push(entry.ai);
        seen[entry.ai] = true;
    });
    check('AI codes are unique', dupes, []);
}

/* -------------------------------------------------- 4. every AI is 2-4 digits */
{
    const bad = P.AI_LIST.filter((entry) => !/^\d{2,4}$/.test(entry.ai)).map((e) => e.ai);
    check('every AI code is 2-4 digits', bad, []);
}

/* -------------------------------------------------- 5. HRI / element string */
{
    // Every element here has a fixed length except the batch, which is last, so
    // no FNC1 is required anywhere: the AI table alone splits this string.
    const allFixed = [{ ai: '01', value: '09506000134352' }, { ai: '17', value: '270430' }, { ai: '10', value: 'LOT-42' }];
    check('HRI uses the bracketed AI notation',
        P.toHRI(allFixed), '(01)09506000134352(17)270430(10)LOT-42');
    check('a trailing variable-length element needs no separator',
        P.toDecodedText(allFixed), '01095060001343521727043010LOT-42');
    check('the element string shows no separator either',
        P.toElementString(allFixed), '01095060001343521727043010LOT-42');

    // Move the batch into the middle and the FNC1 becomes mandatory, because
    // nothing else tells a parser where the batch stops.
    const midVariable = [{ ai: '01', value: '09506000134352' }, { ai: '10', value: 'LOT-42' }, { ai: '17', value: '270430' }];
    check('a mid-string variable-length element gets exactly one FNC1',
        P.toDecodedText(midVariable).split(P.FNC1).length - 1, 1);
    // The separator belongs after the element's own data — that is where a
    // length-driven parser needs to stop reading.
    check('the FNC1 sits after the variable-length element',
        P.toDecodedText(midVariable), '010950600013435210LOT-42' + P.FNC1 + '17270430');
    check('the element string marks that one boundary',
        P.toElementString(midVariable), '010950600013435210LOT-42|17270430');
}

/* -------------------------------------------------- 6. validation errors    */
{
    const bad = P.validate([{ ai: '01', value: '09506000134357' }]);
    ok('a wrong GTIN check digit is an error',
        bad.some((i) => i.level === 'error' && /Check digit/.test(i.message)));

    const short = P.validate([{ ai: '01', value: '12345' }]);
    ok('a short GTIN is an error',
        short.some((i) => i.level === 'error' && /14 digits/.test(i.message)));

    const good = P.validate([{ ai: '01', value: '09506000134352' }, { ai: '17', value: '270430' }]);
    check('a good payload has no errors',
        P.hasErrors(good) ? good.filter((i) => i.level === 'error') : false, false);

    // A variable-length element in the middle needs an FNC1 terminator, and that
    // is worth saying because it is the usual reason a scanner mangles a value.
    const pharma = P.validate(P.SCENARIOS.find((s) => s.id === 'pharma').build());
    ok('a mid-string variable-length element raises the FNC1 note',
        pharma.some((i) => i.level === 'info' && /FNC1 separator/.test(i.message)));

    // Every element in the fresh-food payload has a fixed length, so no
    // separator is involved and nothing should be reported.
    const fresh = P.validate(P.SCENARIOS.find((s) => s.id === 'fresh').build());
    ok('an all-fixed-length payload raises no separator note',
        !fresh.some((i) => /FNC1 separator/.test(i.message)));
}

/* -------------------------------------------------- 7. symbology decision   */
{
    // recommend() answers one question: given this payload, which symbology
    // would the field use? It is not a substitute for the scenario's own choice.
    check('a 14-digit GTIN alone recommends DataBar Omnidirectional',
        P.recommend([{ ai: '01', value: P.AI_BY_CODE['01'].sample() }]), 'databaromni');
    check('a 13-digit GTIN alone recommends EAN-13',
        P.recommend([{ ai: '01', value: '0950600013435' }]), 'ean13');
    check('weight + price recommends DataBar Expanded Stacked',
        P.recommend(P.SCENARIOS.find((s) => s.id === 'fresh').build()),
        'databarexpandedstacked');
    check('an SSCC recommends GS1-128',
        P.recommend(P.SCENARIOS.find((s) => s.id === 'carton').build()), 'gs1_128');
    check('four elements recommend GS1 DataMatrix',
        P.recommend(P.SCENARIOS.find((s) => s.id === 'pharma').build()), 'gs1datamatrix');

    // Every scenario declares the symbology it is meant to demonstrate, and it
    // must agree with what validate() is then told.
    const mismatched = [];
    P.SCENARIOS.forEach((scenario) => {
        if (!P.SYM_BY_ID[scenario.symbology]) mismatched.push(scenario.id + ' -> unknown symbology');
    });
    check('every scenario names a real symbology', mismatched, []);
}

/* -------------------------------------------------- 8. gtin-only guard      */
{
    const rows = [
        { ai: '01', value: P.AI_BY_CODE['01'].sample() },
        { ai: '10', value: 'LOT-1' }
    ];
    // Against DataBar Omnidirectional the second element cannot be encoded...
    const againstOmni = P.validate(rows, 'databaromni');
    ok('DataBar Omnidirectional + a second AI is reported as unencodable',
        againstOmni.some((i) => i.level === 'error'
            && /carries the GTIN and nothing else/.test(i.message)));

    // ...but the same payload is fine in DataBar Expanded.
    const againstExpanded = P.validate(rows, 'databarexpanded');
    ok('the same payload is valid in DataBar Expanded', !P.hasErrors(againstExpanded));
}

/* -------------------------------------------------- 9. DataBar Limited rule */
{
    const issues = P.validate(
        [{ ai: '01', value: P.withCheckDigit('2950600013435') }], // starts with 2
        'databarlimited');
    ok('DataBar Limited rejects a GTIN that does not start with 0 or 1',
        issues.some((i) => i.level === 'error' && /start with 0 or 1/.test(i.message)));

    const okay = P.validate([{ ai: '01', value: P.withCheckDigit('0950600013435') }], 'databarlimited');
    ok('DataBar Limited accepts a GTIN that starts with 0', !P.hasErrors(okay));
}

/* -------------------------------------------------- 10. encoder arguments   */
{
    const pharma = P.SCENARIOS.find((s) => s.id === 'pharma').build();
    const datamatrix = P.toEncoderInput(pharma, 'gs1datamatrix');
    check('DataMatrix gets the AI syntax', datamatrix.bcid, 'gs1datamatrix');
    ok('DataMatrix text is the bracketed HRI', /^\(01\)/.test(datamatrix.text));
    check('DataMatrix text equals toHRI()', datamatrix.text, P.toHRI(pharma));

    const gtin14 = P.AI_BY_CODE['01'].sample();
    const itf = P.toEncoderInput([{ ai: '01', value: gtin14 }], 'itf14');
    check('ITF-14 gets raw digits', itf.bcid, 'itf14');
    // The GTIN goes in whole. Trimming it to 13 digits would make the encoder
    // compute a second check digit and print a different number.
    check('ITF-14 text is the GTIN unchanged', itf.text, gtin14);

    const ean = P.toEncoderInput([{ ai: '01', value: gtin14 }], 'ean13');
    check('EAN-13 gets raw 12 digits', ean.bcid, 'ean13');
    check('EAN-13 text drops the packaging and check digits', ean.text, gtin14.slice(1, 13));

    const noGtin = P.toEncoderInput([{ ai: '00', value: P.AI_BY_CODE['00'].sample() }], 'itf14');
    ok('ITF-14 refuses a payload with no GTIN', !!noGtin.error);
}

/* -------------------------------------------------- 11. expected result     */
{
    const rows = [{ ai: '01', value: '09506000134352' }, { ai: '17', value: '270430' }, { ai: '10', value: 'LOT-42' }];
    const expected = P.expectedElements(rows);
    check('the oracle reports three elements', expected.length, 3);
    check('the GTIN check digit is verified', expected[0].checkDigit, 'verified');
    check('the expiry date is normalised', expected[1].display, '2027-04-30');
    check('the batch is marked variable-length', expected[2].variable, true);

    check('the digital link carries qualifiers and attributes',
        P.expectedDigitalLink(rows),
        'https://id.gs1.org/01/09506000134352/10/LOT-42?17=270430');
    check('no GTIN means no digital link',
        P.expectedDigitalLink([{ ai: '00', value: '340123450000000017' }]), null);
}

/* -------------------------------------------------- 12. month-precision date */
{
    const expected = P.expectedElements([{ ai: '17', value: '270200' }]);
    check('day 00 resolves to the last day of February', expected[0].display, '2027-02-28');
}

/* -------------------------------------------------- 13. scenario sanity     */
{
    const broken = [];
    P.SCENARIOS.forEach((scenario) => {
        if (scenario.id === 'custom') return;
        const rows = scenario.build();
        const issues = P.validate(rows, scenario.symbology);
        if (P.hasErrors(issues)) broken.push(scenario.id + ': ' + JSON.stringify(issues));
        const encoder = P.toEncoderInput(rows, scenario.symbology);
        if (encoder.error) broken.push(scenario.id + ' encoder: ' + encoder.error);
    });
    check('every built-in scenario validates and encodes', broken, []);
}

/* -------------------------------------------------- 14. every symbology is  */
/*       reachable with a compatible payload                                 */
{
    const problems = [];
    P.SYMBOLOGIES.forEach((sym) => {
        let rows;
        if (sym.id === 'ean13') rows = [{ ai: '01', value: '0950600013435' }];
        else if (sym.id === 'itf14') rows = [{ ai: '01', value: P.AI_BY_CODE['01'].sample() }];
        else if (sym.gtinOnly) rows = [{ ai: '01', value: P.AI_BY_CODE['01'].sample() }];
        else rows = P.SCENARIOS.find((s) => s.id === 'pharma').build();

        const encoder = P.toEncoderInput(rows, sym.id);
        if (encoder.error) problems.push(sym.id + ': ' + encoder.error);
        else if (!encoder.bcid || !encoder.text) problems.push(sym.id + ': empty encoder input');
    });
    check('every symbology produces encoder input', problems, []);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);
