/*
 * Test harness for gs1.js. Run:  node test-gs1.js
 *
 * Every case below is a real GS1 element string shape from the General
 * Specifications; the assertions check the AI split, the formatted values and
 * the check-digit verdict.
 */
'use strict';

const GS1 = require('./gs1.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        passed++;
        console.log('  ok   ' + name);
    } else {
        failed++;
        console.log('  FAIL ' + name);
        console.log('         expected: ' + JSON.stringify(expected));
        console.log('         actual:   ' + JSON.stringify(actual));
    }
}

function ais(result) {
    return result.elements.map((e) => e.ai + '=' + e.value);
}

function displays(result) {
    return result.elements.map((e) => e.display);
}

console.log('\ngs1.js parser tests\n');

/* ---------------------------------------------------------------- 1. GTIN */
{
    // 09506000134352 is the canonical example GTIN-14 from the GS1 specs.
    const r = GS1.parse('0109506000134352');
    check('single GTIN-14 splits into one element', ais(r), ['01=09506000134352']);
    check('GTIN check digit verifies', r.elements[0].verified, true);
    check('GTIN HRI', r.hri, '(01)09506000134352');
    check('GTIN digital link', r.digitalLink, 'https://id.gs1.org/01/09506000134352');
}

/* ------------------------------------------- 2. Fixed-length concatenation */
{
    const r = GS1.parse('010950600013435217251231');
    check('GTIN + expiry split without separators', ais(r),
        ['01=09506000134352', '17=251231']);
    check('expiry formatted as a date', displays(r)[1], '2025-12-31');
}

/* ----------------------------------- 3. Variable length terminated by FNC1 */
{
    const raw = '0109506000134352' + GS1.FNC1 + '10LOT-42' + GS1.FNC1 + '21SN0001';
    const r = GS1.parse(raw);
    check('FNC1 terminates variable-length elements', ais(r),
        ['01=09506000134352', '10=LOT-42', '21=SN0001']);
    check('no separators leak into the values', r.elementString.indexOf(GS1.FNC1), -1);
    check('HRI drops the separators', r.hri, '(01)09506000134352(10)LOT-42(21)SN0001');
}

/* ------------------------------------------- 4. {GS} placeholder from DBR  */
{
    const r = GS1.parse('0109506000134352{GS}10LOT-42');
    check('{GS} placeholder is treated as FNC1', ais(r),
        ['01=09506000134352', '10=LOT-42']);
}

/* ------------------------------------------- 5. DataBar: bare GTIN-14      */
{
    const r = GS1.parse('09506000134352', { format: 'GS1 DataBar Omnidirectional' });
    check('bare DataBar GTIN gets AI 01', ais(r), ['01=09506000134352']);
    check('the inference is disclosed', r.warnings.length, 1);
}

/* ------------------------------------------- 6. DataBar Expanded: real AIs */
{
    const r = GS1.parse('0109506000134352' + GS1.FNC1 + '3103002500',
        { format: 'GS1 DataBar Expanded' });
    check('DataBar Expanded keeps its own AIs', ais(r),
        ['01=09506000134352', '3103=002500']);
    check('3103 renders as a 3-decimal weight', displays(r)[1], '2.500 kg');
}

/* ------------------------------------------------- 7. Measurement family   */
{
    const r = GS1.parse('0109506000134352' + GS1.FNC1 + '3922001234');
    check('3922 is a price with 2 decimals', displays(r)[1], '12.34 local currency');

    // AI 393x prefixes a 3-digit ISO 4217 code: 978 = EUR.
    const r2 = GS1.parse('0109506000134352' + GS1.FNC1 + '3932978123456');
    check('3932 carries an ISO currency code', displays(r2)[1], '978 (EUR) 1234.56');
}

/* ------------------------------------------------ 8. Month-precision date  */
{
    // Day 00 = last day of the month. February 2027 has 28 days.
    const r = GS1.parse('010950600013435217270200');
    check('day 00 resolves to the last day of the month', displays(r)[1], '2027-02-28');
    check('the day-00 rounding is disclosed', r.elements[1].note !== null, true);
}

/* ------------------------------------------------ 9. Year window 50-99     */
{
    const r = GS1.parse('010950600013435211991231');
    check('YY 99 is read as 1999', displays(r)[1], '1999-12-31');
}

/* ------------------------------------------- 10. Bad check digit detected  */
{
    // Same GTIN with the last digit altered from 2 to 7.
    const r = GS1.parse('0109506000134357');
    check('a wrong GTIN check digit is flagged', r.elements[0].invalid, true);
    check('the expected check digit is named',
        /expected 2/.test(r.elements[0].note), true);
}

/* ---------------------------------------------------- 11. SSCC + origin    */
{
    const r = GS1.parse('00' + '340123450000000017' + GS1.FNC1 + '422156');
    check('SSCC and country of origin', ais(r), ['00=340123450000000017', '422=156']);
    check('the numeric country code resolves', displays(r)[1], 'China (156)');
}

/* ---------------------------------------------------- 12. ITIP (AI 8006)   */
{
    // AI 8006 = 14-digit GTIN + piece number (2) + total pieces (2).
    const r = GS1.parse('8006' + '09506000134352' + '01' + '05');
    check('ITIP renders as GTIN + piece counts', displays(r)[0],
        'GTIN 09506000134352, piece 01 of 05');
}

/* ---------------------------------------------------- 13. Roll products    */
{
    // AI 8001 = width (1/10 mm) + length (1/100 m) + core (1/10 mm) + direction.
    const r = GS1.parse('8001' + '1234' + '560012' + '345' + '6');
    check('AI 8001 converts 1/100 units', displays(r)[0],
        '123.4 mm wide, 5600.12 m long, 34.5 mm core, direction 6');
}

/* ---------------------------------------- 14. Unknown AI stops the parse   */
{
    // 03-09 are unassigned; 90-99 are valid in-company AIs, so they are not a
    // good "unknown" case.
    const r = GS1.parse('0109506000134352' + GS1.FNC1 + '07XYZ');
    check('an unknown AI is reported', r.errors.length, 1);
    check('elements before the bad one are kept', ais(r), ['01=09506000134352']);
}

/* ---------------------------------------- 15. Truncated fixed-length data  */
{
    const r = GS1.parse('010950600');
    check('truncated GTIN is reported', /needs 14 characters/.test(r.errors[0]), true);
}

/* ---------------------------------------------- 16. HRI + Digital Link     */
{
    const r = GS1.parse('0109506000134352' + GS1.FNC1 + '10LOT-42' + GS1.FNC1 + '17251231');
    check('digital link carries path qualifiers and query attributes',
        r.digitalLink,
        'https://id.gs1.org/01/09506000134352/10/LOT-42?17=251231');
}

/* ------------------------------------------- 17. AI table prefix-free check */
{
    // Longest-match must pick the four-digit measurement AI, not a two-digit one.
    const r = GS1.parse('3103000250');
    check('longest AI match wins', ais(r), ['3103=000250']);

    // 22 is a two-digit AI; nothing longer should shadow it.
    const r2 = GS1.parse('22' + 'AB12');
    check('two-digit AI still resolves', ais(r2), ['22=AB12']);
}

/* ------------------------------------------- 18. In-company range 90-99    */
{
    const r = GS1.parse('0109506000134352' + GS1.FNC1 + '91WEBSHOP');
    check('AI 90-99 are accepted as in-company use', ais(r),
        ['01=09506000134352', '91=WEBSHOP']);
    check('the title says it is in-company', /IN-COMPANY/.test(r.elements[1].title), true);
}

/* ------------------------------------------- 19. Missing separator warning */
{
    // Two variable-length elements and no FNC1: a variable element after a
    // fixed one is worth a note, because its length came from the AI table.
    const r = GS1.parse('010950600013435210LOT-4221SN0001');
    check('a variable element after a fixed one raises a note',
        /taken from the AI table/.test(r.warnings.join(' ')), true);

    // A lone variable-length element is the normal case, not a warning.
    const r2 = GS1.parse('10LOT-42');
    check('a lone variable element is not a warning', r2.warnings, []);

    // Fixed-length elements need no separators at all, so no note either.
    const r3 = GS1.parse('010950600013435217251231');
    check('fixed-length only produces no warning', r3.warnings, []);

    /* A decoder that strips FNC1 lets a variable-length element swallow what
       follows. Look for the split that keeps the most data in the declared
       element: "1215270827" also splits as AI 30="1" + AI 21="5270827", because a
       variable-length AI eats whatever is left, and that reading is wrong. */
    const repaired = GS1.parse('0109506000134352' + '30' + '12' + '15' + '270827');
    check('an over-long variable element is re-split at the longest valid head',
        ais(repaired), ['01=09506000134352', '30=12', '15=270827']);
    check('the repair is disclosed',
        /re-split/.test(repaired.warnings.join(' ')), true);

    // And a value that is legal for its AI is left completely alone.
    const untouched = GS1.parse('0109506000134352' + '10' + 'AB15123456');
    check('a within-limit variable element is not touched',
        ais(untouched), ['01=09506000134352', '10=AB15123456']);
}

/* ------------------------------------------- 20. Composite               */
{
    const r = GS1.parse('09506000134352' + GS1.FNC1 + '21SN0001',
        { format: 'GS1 Composite Code' });
    check('composite linear GTIN gets AI 01', ais(r),
        ['01=09506000134352', '21=SN0001']);
}

/* ------------------------------------------- 21. Check-digit helper       */
{
    check('checkDigit(0950600013435) === 2', GS1.checkDigit('0950600013435'), '2');
    check('valid GTIN-13 accepted', GS1.isValidCheckDigit('9506000134352', 'gtin'), true);
    check('valid GTIN-8 accepted', GS1.isValidCheckDigit('96385074', 'gtin'), true);
    check('non-GTIN length returns null',
        GS1.isValidCheckDigit('12345', 'gtin'), null);
}

/* ------------------------------------------- 22. Every AI in the table    */
{
    // A smoke test: each two/three/four-digit AI must resolve from its own code.
    let unresolved = [];
    Object.keys(GS1.AI).forEach((code) => {
        const m = GS1.matchAI(code + '0'.repeat(30), 0);
        if (!m || m.code !== code) unresolved.push(code);
    });
    Object.keys(GS1.MEASURES).forEach((family) => {
        for (let d = 0; d <= 5; d++) {
            const code = family + d;
            const m = GS1.matchAI(code + '0'.repeat(30), 0);
            if (!m || m.code !== code) unresolved.push(code);
        }
    });
    check('every AI in the table resolves', unresolved, []);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);
