/*
 * test-gs1-payload.cjs — scripted checks for the GS1 test payload model.
 *
 * Run from this folder:
 *   node test-gs1-payload.cjs
 *
 * The model (gs1-payload.js) is DOM-free and require()-able, so every scenario
 * — including the industry presets and their second symbols — can be built,
 * validated and fed to the encoder input without a browser. What cannot be
 * checked here is the bwip-js rendering and the decode round trip; those are
 * verified through the page itself (see README).
 */
'use strict';

var P = require('./gs1-payload.js');

var failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log('  ok   ' + name);
    return;
  }
  failures++;
  console.error('  FAIL ' + name + (detail ? ' — ' + detail : ''));
}

function encodeOk(rows, symbologyId, label) {
  var input = P.toEncoderInput(rows, symbologyId);
  check(label + ' → encoder input',
    input && !input.error && typeof input.bcid === 'string' && input.text,
    input && input.error);
}

console.log('Scenario payloads');

P.SCENARIOS.forEach(function (scenario) {
  var rows = scenario.build();
  check(scenario.id + ': build yields rows', rows.length > 0);

  var issues = P.validate(rows, scenario.symbology);
  var errors = issues.filter(function (issue) { return issue.level === 'error'; });
  check(scenario.id + ': validates with ' + scenario.symbology, errors.length === 0,
    errors.map(function (e) { return e.message; }).join('; '));

  check(scenario.id + ': element string', P.toElementString(rows).length > 0);
  encodeOk(rows, scenario.symbology, scenario.id + ' (primary)');

  if (!scenario.secondary) return;

  var spec = scenario.secondary;
  if (spec.build) {
    var extraRows = spec.build();
    var extraIssues = P.validate(extraRows, spec.symbology);
    var extraErrors = extraIssues.filter(function (issue) { return issue.level === 'error'; });
    check(scenario.id + ' secondary: validates with ' + spec.symbology,
      extraErrors.length === 0,
      extraErrors.map(function (e) { return e.message; }).join('; '));
    encodeOk(extraRows, spec.symbology, scenario.id + ' (secondary)');
  }
});

console.log('Retail 2D (Sunrise 2027) — derived EAN-13');

var retail2d = P.SCENARIOS.filter(function (s) { return s.id === 'retail2d'; })[0];
check('retail2d exists with a derive spec', retail2d && retail2d.secondary
  && retail2d.secondary.derive === 'gtin13');

var gtinRow = retail2d.build().filter(function (r) { return r.ai === '01'; })[0];
check('retail2d sample GTIN starts with packaging indicator 0',
  /^\d{14}$/.test(gtinRow.value) && gtinRow.value.charAt(0) === '0', gtinRow.value);

/* The derived GTIN-13 must be the GTIN-14 minus the indicator, and its check
   digit must be the same digit the GTIN-14 carries. */
var gtin13 = gtinRow.value.slice(1);
check('derived GTIN-13 check digit matches the GTIN-14',
  P.checkDigit(gtin13.slice(0, 12)) === gtin13.slice(-1), gtin13);
encodeOk([{ ai: '01', value: gtinRow.value }], 'ean13', 'retail2d derived EAN-13');

var udi = P.SCENARIOS.filter(function (s) { return s.id === 'udi'; })[0];
var udiRows = udi.build();
check('udi carries DI, production date, lot, expiry and serial',
  ['01', '11', '10', '17', '21'].every(function (ai) {
    return udiRows.some(function (r) { return r.ai === ai; });
  }),
  P.toElementString(udiRows));

var logistics = P.SCENARIOS.filter(function (s) { return s.id === 'logistics'; })[0];
var logisticsRows = logistics.build();
check('logistics primary is an SSCC', logisticsRows.length === 1 && logisticsRows[0].ai === '00');
var sscc = logisticsRows[0].value;
check('SSCC check digit verifies', P.checkDigit(sscc.slice(0, -1)) === sscc.slice(-1), sscc);

console.log(failures === 0
  ? '\nAll checks passed (' + P.SCENARIOS.length + ' scenarios).'
  : '\n' + failures + ' check(s) failed.');
process.exit(failures === 0 ? 0 : 1);
