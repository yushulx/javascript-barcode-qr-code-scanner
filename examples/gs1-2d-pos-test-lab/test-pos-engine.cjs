/* Run: node test-pos-engine.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('./pos-engine.js');
const F = require('./fixtures.js');

let passed = 0;
function test(id, name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + id + '  ' + name);
  } catch (error) {
    console.error('FAIL ' + id + '  ' + name);
    throw error;
  }
}
function obs(id, format, rawText) {
  return E.createObservation({ observationId: id, presentationId: 'p', origin: 'simulation', format, rawText });
}
function presentation(id, cart) {
  return { presentationId: id, packageInstanceId: id + '-package', origin: 'simulation', wasCommitted: false, cart };
}
const ean = obs('ean', 'EAN_13', '9506000134352');
const qr = obs('qr', 'QR_CODE', F.digitalLink(F.BASE_GTIN, 'B17', '271231'));

test('POS-001', 'valid EAN-13 adds one unit', () => {
  const cart = {};
  const result = E.completePresentation(presentation('p1', cart), [ean], F.PRODUCTS);
  assert.equal(result.status, 'added');
  assert.equal(result.quantityAdded, 1);
  assert.equal(result.gtin, F.BASE_GTIN);
  assert.equal(cart[F.BASE_GTIN].quantity, 1);
});

test('POS-002', 'GS1 Digital Link QR adds one unit and parses attributes', () => {
  const cart = {};
  const result = E.completePresentation(presentation('p2', cart), [qr], F.PRODUCTS);
  assert.equal(result.status, 'added');
  assert.equal(result.identities[0].lot, 'B17');
  assert.equal(result.identities[0].expiry, '2027-12-31');
  assert.equal(cart[F.BASE_GTIN].quantity, 1);
});

test('POS-003', 'matching 1D and 2D carriers in one pass add exactly one', () => {
  const cart = {};
  const result = E.completePresentation(presentation('p3', cart), [ean, qr], F.PRODUCTS);
  assert.equal(result.status, 'added');
  assert.equal(result.reason, 'MATCHED_CARRIERS_ONE_PRESENTATION');
  assert.equal(cart[F.BASE_GTIN].quantity, 1);
});

test('POS-004', 'two package instances with the same GTIN add two units', () => {
  const cart = {};
  E.completePresentation(presentation('p4a', cart), [ean, qr], F.PRODUCTS);
  E.completePresentation(presentation('p4b', cart), [ean, qr], F.PRODUCTS);
  assert.equal(cart[F.BASE_GTIN].quantity, 2);
});

test('POS-005', 'submitting the same presentation twice adds no second unit', () => {
  const cart = {};
  const p = presentation('p5', cart);
  E.completePresentation(p, [ean, qr], F.PRODUCTS);
  const second = E.completePresentation(p, [ean, qr], F.PRODUCTS);
  assert.equal(second.status, 'ignored');
  assert.equal(second.reason, 'SAME_PRESENTATION');
  assert.equal(cart[F.BASE_GTIN].quantity, 1);
});

test('POS-006', 'different valid GTINs in one pass need review', () => {
  const mismatch = obs('qr-other', 'QR_CODE', F.digitalLink(F.ALT_GTIN, 'B17', '271231'));
  const cart = {};
  const result = E.completePresentation(presentation('p6', cart), [ean, mismatch], F.PRODUCTS);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.reason, 'GTIN_CONFLICT');
  assert.equal(Object.keys(cart).length, 0);
});

test('POS-007', 'invalid GTIN check digit is not added', () => {
  const invalid = obs('bad', 'EAN_13', '9506000134353');
  const result = E.completePresentation(presentation('p7', {}), [invalid], F.PRODUCTS);
  assert.equal(result.status, 'not_added');
  assert.equal(result.reason, 'INVALID_GTIN');
});

test('POS-008', 'plain marketing URL is not a GS1 product identifier', () => {
  const marketing = obs('marketing', 'QR_CODE', 'https://example.com/promotions/summer');
  const result = E.completePresentation(presentation('p8', {}), [marketing], F.PRODUCTS);
  assert.equal(result.status, 'not_added');
  assert.equal(result.reason, 'NO_VALID_GTIN');
  assert.equal(result.identities[0].status, 'not-a-product-identifier');
});

test('POS-009', 'SDK empty result remains NO_RESULT', () => {
  const result = E.completePresentation(presentation('p9', {}), [], F.PRODUCTS);
  assert.equal(result.status, 'not_added');
  assert.equal(result.reason, 'NO_RESULT');
});

test('POS-010', 'canvas scene and reduced-motion support are present', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const scene = fs.readFileSync(path.join(__dirname, 'canvas-renderer.js'), 'utf8');
  assert.match(html, /id="pos-game"/);
  assert.match(html, /canvas-renderer\.js/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(app, /reduceMotion/);
  assert.match(scene, /state\.reduceMotion/);
});

test('POS-011', 'simulation and image mode have no camera dependency', () => {
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const sdk = fs.readFileSync(path.join(__dirname, 'sdk-decoder.js'), 'utf8');
  assert.doesNotMatch(app, /getUserMedia|CameraEnhancer/);
  assert.doesNotMatch(sdk, /getUserMedia|CameraEnhancer/);
  assert.match(sdk, /decodeFile/);
});

test('POS-012', 'export includes oracle, origin, rule and verdict fields', () => {
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  ['expectedStatus', 'actualStatus', 'origin', 'rule', 'verdict'].forEach(field => assert.match(app, new RegExp(field)));
  assert.match(app, /gs1-pos-test-report\.json/);
  assert.match(app, /gs1-pos-test-report\.csv/);
});

test('NORM-001', 'EAN-13 and GTIN-14 normalize to the same canonical value', () => {
  assert.deepEqual(E.normalizeGTIN('9506000134352'), E.normalizeGTIN('09506000134352'));
});

test('NORM-002', 'percent-encoded Digital Link qualifiers are decoded', () => {
  const parsed = E.parseAndNormalizeObservation(obs('encoded', 'QR_CODE', 'https://example.com/01/09506000134352/10/B%2017?17=271231'));
  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.lot, 'B 17');
});

test('NORM-003', 'control characters and malformed URIs are rejected', () => {
  assert.equal(E.parseAndNormalizeObservation(obs('control', 'QR_CODE', 'https://example.com/01/09506000134352\n')).error, 'CONTROL_CHARACTER');
  assert.equal(E.parseAndNormalizeObservation(obs('malformed', 'QR_CODE', 'https://example.com/01/09506000134352/10/%E0%A4%A')).error, 'MALFORMED_DIGITAL_LINK');
});

test('UI-001', 'the playable simulation is rendered inside one canvas', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const scene = fs.readFileSync(path.join(__dirname, 'canvas-renderer.js'), 'utf8');
  assert.match(html, /<canvas id="pos-game"/);
  assert.doesNotMatch(html, /id="scan-item"|class="workspace"/);
  ['drawTour', 'drawStage', 'drawPack', 'drawScanner', 'drawTerminal', 'drawTrace', 'drawComplete'].forEach(method => {
    assert.match(scene, new RegExp(method + '\\('));
  });
});

test('UI-002', 'level 4 explicitly tells the player to scan a second package', () => {
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.match(app, /PACKAGE 2 OF 2 is a separate item/);
  assert.match(app, /state\.packageIndex = 2/);
});

test('DATA-001', 'JSON fixture oracle matches the JavaScript scenario definitions', () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));
  assert.equal(json.scenarios.length, F.SCENARIOS.length);
  json.scenarios.forEach((entry, index) => {
    const scenario = F.SCENARIOS[index];
    assert.equal(entry.id, scenario.id);
    assert.equal(entry.expectedStatus, scenario.expectedStatus);
    assert.equal(entry.expectedQuantity, scenario.expectedQuantity);
    assert.equal(entry.eanGtin, scenario.gtin);
    assert.equal(entry.qrGtin, scenario.gtin2d);
  });
});

console.log('\n' + passed + ' checks passed.');
