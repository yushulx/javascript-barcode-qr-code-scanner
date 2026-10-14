/* Verifies the EMV model against the spec's own test vector and against
   MasterCard's published example payload. Run: node emv-model.test.js */

const EmvModel = require('./emv-model.js');

let pass = 0, fail = 0;

function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + '\n         expected ' + e + '\n         actual   ' + a); }
}

console.log('\nCRC-16/CCITT-FALSE');
check('canonical test vector CRC("123456789")', EmvModel.crcHex('123456789'), '29B1');
check('emits four uppercase hex chars', EmvModel.crcHex('A').length, 4);

console.log('\nTLV primitives');
check('tag + length + value', EmvModel.tlv('59', 'ACME'), '5904ACME');
check('zero length', EmvModel.tlv('62', ''), '6200');
check('length is zero padded', EmvModel.tlv('59', 'A'), '5901A');
check('rejects a 100 character value', (() => {
    try { EmvModel.tlv('59', 'x'.repeat(100)); return 'no throw'; }
    catch (ex) { return 'threw'; }
})(), 'threw');

console.log('\nPayload assembly');
const staticPayload = EmvModel.buildPayload({
    pointOfInitiation: '11', maiTag: '26', guid: 'com.dynamsoft.demo',
    merchantId: 'MERCHANT-0001', mcc: '5411', currency: '840',
    country: 'US', merchantName: 'DYNAMSOFT DEMO STORE',
    merchantCity: 'NEW YORK', postalCode: '10001'
});
console.log('  payload: ' + staticPayload);
/* Tag 00 is always "00" + "02" + "01": the four-character prefix is the tag
   and its length, so the value "01" starts at index 4. */
check('tag 00 leads the payload', staticPayload.substr(0, 6), '000201');
check('tags ascend', (() => {
    const parsed = EmvModel.parsePayload(staticPayload);
    const tags = parsed.entries.map(e => parseInt(e.tag, 10));
    for (let i = 1; i < tags.length; i++) {
        if (tags[i] < tags[i - 1]) return 'out of order at ' + i;
    }
    return 'ascending';
})(), 'ascending');
check('static code omits tag 54', (() => {
    return !EmvModel.parsePayload(staticPayload).entries.some(e => e.tag === '54');
})(), true);
/* The stream ends with tag 63, its two-digit length "04", then the four hex
   characters the checksum protects. */
check('static code ends with 63 04 + 4 hex', /6304[0-9A-F]{4}$/.test(staticPayload), true);

const dynPayload = EmvModel.buildPayload({
    pointOfInitiation: '12', maiTag: '26', guid: 'com.dynamsoft.demo',
    merchantId: 'MERCHANT-0001', mcc: '5411', currency: '840',
    amount: '12.50', country: 'US', merchantName: 'DYNAMSOFT DEMO STORE',
    merchantCity: 'NEW YORK', postalCode: '10001',
    billNumber: 'INV-2026-0042', referenceLabel: 'REF-8841-A1'
});
console.log('  payload: ' + dynPayload);
const parsedForAssert = EmvModel.parsePayload(dynPayload);
function valueOf(parsed, tag) {
    const e = parsed.entries.find(x => x.tag === tag);
    return e ? e.value : null;
}
function childOf(parsed, tag, childTag) {
    const e = parsed.entries.find(x => x.tag === tag);
    if (!e || !e.children) return null;
    const c = e.children.find(x => x.tag === childTag);
    return c ? c.value : null;
}
check('dynamic code carries tag 54', valueOf(parsedForAssert, '54'), '12.50');
check('bill number rides in tag 62.00', childOf(parsedForAssert, '62', '00'), 'INV-2026-0042');
check('reference label rides in tag 62.05', childOf(parsedForAssert, '62', '05'), 'REF-8841-A1');

console.log('\nRound trip');
const parsedStatic = EmvModel.parsePayload(staticPayload);
check('CRC verifies', parsedStatic.crcValid, true);
check('no errors on a well-formed payload', parsedStatic.errors.length, 0);
check('format indicator parsed', parsedStatic.formatIndicator, '01');
check('flagged static', parsedStatic.isDynamic, false);
check('currency named', EmvModel.currencyName('840'), 'USD');
check('MCC noted', EmvModel.mccNote('5411'), 'Grocery stores / supermarkets');
check('merchant name survived', (() => {
    const e = parsedStatic.entries.find(x => x.tag === '59');
    return e && e.value;
})(), 'DYNAMSOFT DEMO STORE');

const parsedDyn = EmvModel.parsePayload(dynPayload);
check('dynamic CRC verifies', parsedDyn.crcValid, true);
check('flagged dynamic', parsedDyn.isDynamic, true);
check('nested template parsed', (() => {
    const mai = parsedDyn.entries.find(x => x.tag === '26');
    return !!(mai && mai.children && mai.children.length === 2);
})(), true);
check('GUID sub-tag value', (() => {
    const mai = parsedDyn.entries.find(x => x.tag === '26');
    return mai.children[0].value;
})(), 'com.dynamsoft.demo');
check('additional data sub-tags parsed', (() => {
    const add = parsedDyn.entries.find(x => x.tag === '62');
    return add.children.map(c => c.tag).join(',');
})(), '00,05');

console.log('\nCRC rejection — the whole point of tag 63');
/* Tamper with the amount in place: same length, so the TLV structure stays
   intact and the failure is attributable to the checksum alone. */
const tampered = dynPayload.replace('540512.50', '540599.99');
check('the tamper actually applied', tampered !== dynPayload, true);
const parsedBad = EmvModel.parsePayload(tampered);
check('tampered amount still parses structurally', parsedBad.entries.length > 0, true);
check('tampered amount fails CRC', parsedBad.crcValid, false);
check('and says so', /CRC mismatch/.test(parsedBad.errors.join(' ')), true);

/* Drop the trailing "6304" + checksum entirely — a payload with no CRC at
   all, as opposed to one with a wrong CRC. */
const noCrc = staticPayload.slice(0, -8);
check('missing CRC is reported', /No CRC/.test(EmvModel.parsePayload(noCrc).errors.join(' ')), true);
/* A CRC tag left in place with an empty value is a different fault, and is
   reported as a truncation rather than as a missing checksum. */
check('empty CRC field is reported as truncated', /not four characters/.test(
    EmvModel.parsePayload(staticPayload.slice(0, -4)).errors.join(' ')), true);

console.log('\nMasterCard published example (Secure Card on File)');
const mc = '000201010211057704736a2f41a3-c54c-fce8-32d2-0324e1c32e22*3440e5bf-81ca-4c5f-a1b2-cf989f09a03952045024530384054031005802US5913Test Merchant6008New York62080304123463046F6D';
const parsedMc = EmvModel.parsePayload(mc);
console.log('  declared ' + parsedMc.crcDeclared + ' computed ' + parsedMc.crcComputed);
check('parses without throwing', parsedMc.entries.length > 0, true);
check('merchant account info tag 05 found', (() => {
    return parsedMc.entries.some(e => e.tag === '05');
})(), true);
/* MasterCard's example nests the bill number under sub-tag 03 rather than
   the sub-tag 00 the specification names, which is exactly the kind of
   real-world variation a scanner has to show rather than reject. */
check('tag 62 bill number under sub-tag 03', (() => {
    const add = parsedMc.entries.find(e => e.tag === '62');
    return add && add.children.find(c => c.tag === '03').value;
})(), '1234');
check('its CRC verifies against our own CCITT-FALSE', parsedMc.crcValid, true);
check('declared and computed CRC agree', parsedMc.crcDeclared === parsedMc.crcComputed, true);

console.log('\nNon-EMV payloads are rejected early');
check('a plain URL is not EMV', EmvModel.looksLikeEmv('https://example.com/pay'), false);
check('a WiFi string is not EMV', EmvModel.looksLikeEmv('WIFI:S:demo;;'), false);
check('our own payload is EMV', EmvModel.looksLikeEmv(staticPayload), true);
check('MasterCard example is EMV', EmvModel.looksLikeEmv(mc), true);

console.log('\nValidation');
check('00 must be 01', EmvModel.validateFields({ formatIndicator: '02', pointOfInitiation: '11' }).length > 0, true);
check('dynamic without amount is an error', EmvModel.validateFields({ formatIndicator: '01', pointOfInitiation: '12' }).length, 1);
check('static with amount is an error', EmvModel.validateFields({ formatIndicator: '01', pointOfInitiation: '11', amount: '5.00' }).length, 1);
check('merchant name over 25 chars is an error', EmvModel.validateFields({
    formatIndicator: '01', pointOfInitiation: '11', merchantName: 'X'.repeat(26)
}).length > 0, true);
check('a valid dynamic payload has no errors', EmvModel.validateFields({
    formatIndicator: '01', pointOfInitiation: '12', amount: '12.50', currency: '840',
    country: 'US', merchantName: 'DYNAMSOFT DEMO STORE', merchantCity: 'NEW YORK'
}).length, 0);

console.log('\nPresets all assemble and verify');
EmvModel.presets.forEach(p => {
    const payload = EmvModel.buildPayload(p.fields);
    const parsed = EmvModel.parsePayload(payload);
    check(p.id + ' CRC verifies, no errors', parsed.crcValid && parsed.errors.length === 0, true);
    check(p.id + ' under the QR payload ceiling', payload.length <= 4296, true);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);