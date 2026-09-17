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
        if (issue) problems.push(entry.ai + ' -> ' + JSON.stringify(value) + ': ' + issue.message);
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

/* -------------------------------------------------- 15. one-click fixes     */
/* Every message that diagnoses a problem should also be able to resolve it:
   the GS1 length rules, check digits and AI pairings are specialist knowledge,
   and a dead end is not much use to the audience for this page. */

/* Apply a fix descriptor the way app.js does, on a copy of the payload. */
function applyFix(rows, fix) {
    const copy = rows.map((row) => ({ ai: row.ai, value: row.value }));
    if (fix.kind === 'set-value') {
        const hit = copy.find((row) => row.ai === fix.ai);
        if (hit) hit.value = fix.value;
    } else if (fix.kind === 'add-element') {
        const entry = P.AI_BY_CODE[fix.ai];
        copy.push({ ai: fix.ai, value: entry ? entry.sample() : '' });
    } else if (fix.kind === 'set-symbology') {
        copy.symbology = fix.symbology;
    }
    return copy;
}

{
    const gtin = P.AI_BY_CODE['01'].sample();

    // A wrong check digit is offered the corrected one, and taking it works.
    const typo = gtin.slice(0, -1) + ((Number(gtin.slice(-1)) + 1) % 10);
    const bad = P.validate([{ ai: '01', value: typo }]);
    const digitIssue = bad.find((i) => i.fix && i.fix.label === 'Correct the check digit');
    ok('a wrong check digit offers a correction', !!digitIssue);
    if (digitIssue) {
        check('taking the correction clears the error',
            P.hasErrors(P.validate(applyFix([{ ai: '01', value: typo }], digitIssue.fix))), false);
    }

    // A too-short value is offered a sample, and taking it works.
    const shortIssue = P.validate([{ ai: '01', value: '12345' }])[0];
    ok('a short value offers a sample replacement', !!(shortIssue.fix && shortIssue.fix.label));
    check('taking the sample clears the error',
        P.hasErrors(P.validate(applyFix([{ ai: '01', value: '12345' }], shortIssue.fix))), false);

    // An empty payload offers to add a GTIN.
    const empty = P.validate([]);
    ok('an empty payload offers to add AI 01',
        !!(empty[0].fix && empty[0].fix.kind === 'add-element' && empty[0].fix.ai === '01'));
    check('taking it clears the error', P.hasErrors(P.validate(applyFix([], empty[0].fix))), false);

    // DataBar + a second element offers a symbology that can carry it.
    const withBatch = [{ ai: '01', value: gtin }, { ai: '10', value: 'LOT-1' }];
    const omniIssue = P.validate(withBatch, 'databaromni')
        .find((i) => i.fix && i.fix.kind === 'set-symbology');
    ok('a GTIN-only symbology offers a switch', !!omniIssue);
    if (omniIssue) {
        ok('the offered symbology can actually carry the payload',
            !P.SYM_BY_ID[omniIssue.fix.symbology].gtinOnly);
        check('taking the switch clears the error',
            P.hasErrors(P.validate(withBatch, omniIssue.fix.symbology)), false);
    }

    // DataBar Limited + a GTIN starting with 2 offers a switch to Omnidirectional.
    const limitedIssue = P.validate([{ ai: '01', value: P.withCheckDigit('2950600013435') }],
        'databarlimited').find((i) => i.fix && i.fix.kind === 'set-symbology');
    ok('DataBar Limited offers a switch', !!limitedIssue);
    if (limitedIssue) {
        check('the offered symbology is DataBar Omnidirectional',
            limitedIssue.fix.symbology, 'databaromni');
        check('taking the switch clears the error',
            P.hasErrors(P.validate([{ ai: '01', value: P.withCheckDigit('2950600013435') }],
                limitedIssue.fix.symbology)), false);
    }
}

/* -------------------------------------------------- 16. AI pairing rules    */
/* GS1 refuses some combinations outright, and the encoder reports it in its own
   words ("One of more requisite AIs for AI (21) are missing: 01 OR 03 OR 8006").
   Catching it locally is what makes a fix button possible. */
{
    const gtin = P.AI_BY_CODE['01'].sample();

    const orphanSerial = P.validate([{ ai: '21', value: 'SN0001' }]);
    const serialIssue = orphanSerial.find((i) => i.ai === '21' && i.fix);
    ok('a serial without a trade item is an error', !!serialIssue);
    ok('it offers the partner AI', !!(serialIssue && serialIssue.fix.kind === 'add-element'
        && serialIssue.fix.ai === '01'));
    check('adding the partner clears the error',
        P.hasErrors(P.validate(applyFix([{ ai: '21', value: 'SN0001' }], serialIssue.fix))), false);

    // Serial beside a GTIN is fine.
    check('a serial with a GTIN is accepted',
        P.hasErrors(P.validate([{ ai: '01', value: gtin }, { ai: '21', value: 'SN0001' }])), false);

    const barePrice = P.validate([{ ai: '01', value: gtin }, { ai: '3932', value: '978078161' }]);
    const priceIssue = barePrice.find((i) => i.ai === '3932' && i.fix);
    ok('a currency price without a quantity is an error', !!priceIssue);
    ok('it offers AI 30', !!(priceIssue && priceIssue.fix.ai === '30'));
    check('adding AI 30 clears the error',
        P.hasErrors(P.validate(applyFix(
            [{ ai: '01', value: gtin }, { ai: '3932', value: '978078161' }],
            priceIssue.fix))), false);

    // A 31nn measure satisfies the same rule.
    check('a net-weight measure satisfies the price rule',
        P.hasErrors(P.validate([
            { ai: '01', value: gtin },
            { ai: '3103', value: '002500' },
            { ai: '3932', value: '978078161' }
        ])), false);
}

/* -------------------------------------------------- 17. fixes are labelled  */
/* A fix the UI cannot label is a fix the UI cannot render. */
{
    const cases = [
        [],
        [{ ai: '01', value: '12345' }],
        [{ ai: '01', value: P.AI_BY_CODE['01'].sample().slice(0, -1) + '9' }],
        [{ ai: '21', value: 'SN0001' }],
        [{ ai: '01', value: P.AI_BY_CODE['01'].sample() }, { ai: '10', value: 'LOT-1' }],
        [{ ai: '01', value: P.withCheckDigit('2950600013435') }]
    ];
    const symbologies = [undefined, 'databaromni', 'itf14', 'databarlimited', 'gs1datamatrix'];
    const unlabelled = [];
    cases.forEach((rows) => {
        symbologies.forEach((sym) => {
            P.validate(rows, sym).forEach((issue) => {
                if (issue.fix && !issue.fix.label) {
                    unlabelled.push(issue.message.slice(0, 50));
                }
            });
        });
    });
    check('every fix descriptor carries a label', unlabelled, []);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);
