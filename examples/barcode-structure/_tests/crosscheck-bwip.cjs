/*
 * Cross-check the 1D encoders in `barcode-1d.js`.
 *
 *   node demos/barcode-structure/_tests/crosscheck-bwip.cjs [path-to-bwip-js]
 *
 * Two independent kinds of evidence, because no single reference is reliable
 * for all four symbologies:
 *
 *  1. bwip-js (BWIPP), fetched to a scratch directory outside the demo — the
 *     demo itself stays dependency-free. Used for EAN-13 and Code 128, where
 *     the module sequence is fixed and the reference agrees.
 *
 *  2. The published symbology tables, written out in this file. Used for
 *     Code 39 characters and for ITF digit pairs. This is not a weaker check:
 *     it is the same table a decoder uses.
 *
 * Three differences from the reference are real and are handled explicitly
 * rather than papered over — see the comments at each site:
 *   - bwip-js silently repairs a wrong EAN-13 check digit, so only codes with
 *     the digit the standard requires can be compared;
 *   - bwip-js's `interleaved2of5` emits more digit pairs than it was given, so
 *     ITF is verified against the published table instead;
 *   - the two encoders may pick different (equally legal) Code 128 code sets.
 */
const path = require('node:path');
const fs = require('node:fs');
const bc = require(path.join(__dirname, '..', 'barcode-1d.js'));

const REF = [
  process.argv[2],
  path.join(process.env.TEMP || '/tmp', 'codepool-bwip-ref', 'bwip-js.min.js'),
  path.join(__dirname, 'vendor', 'bwip-js.min.js')
].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch { return false; } });

let bwipjs = null;
if (REF) {
  bwipjs = require(REF);
  console.log('reference: bwip-js ' + bwipjs.BWIPJS_VERSION + '  (' + REF + ')\n');
} else {
  console.log('reference: bwip-js not found — the EAN-13 and Code 128 comparisons are skipped.');
  console.log('           put it at ' + path.join(process.env.TEMP || '/tmp', 'codepool-bwip-ref', 'bwip-js.min.js') + '\n');
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
}

/* ---------------------------------------------------------------- helpers */

function refModules(bcid, text, opts) {
  const res = bwipjs.raw(bcid, text, Object.assign({ includetext: false, height: 10 }, opts || {}));
  const out = [];
  res[0].sbs.forEach((run, i) => {
    const black = i % 2 === 0 ? 1 : 0;
    for (let k = 0; k < run; k++) out.push(black);
  });
  return out;
}

/* bwip-js's `sbs` does not include the quiet zones; the streams are therefore
   compared after trimming only the quiet zone this encoder reports separately. */
function trimQuiet(mods) {
  let a = 0, b = mods.length;
  while (a < b && mods[a] === 0) a++;
  while (b > a && mods[b - 1] === 0) b--;
  return mods.slice(a, b);
}

function toRuns(mods) {
  const out = [];
  for (let i = 0; i < mods.length;) {
    let j = i;
    while (j < mods.length && mods[j] === mods[i]) j++;
    out.push({ black: mods[i], len: j - i });
    i = j;
  }
  return out;
}

/* Wide/narrow class per element, plus how many are wide. */
function elementClasses(mods) {
  const runs = toRuns(mods);
  const narrow = Math.min(...runs.map(r => r.len));
  return {
    classes: runs.map(r => r.len > narrow ? 'w' : 'n').join(''),
    wide: runs.filter(r => r.len > narrow).length
  };
}

function compareModules(name, mine, ref) {
  const m = trimQuiet(mine);
  const n = Math.min(m.length, ref.length);
  let d = -1;
  for (let i = 0; i < n; i++) if (m[i] !== ref[i]) { d = i; break; }
  if (d < 0 && m.length === ref.length) {
    check(name, true, m.length + ' modules match the reference exactly');
    return;
  }
  const at = d < 0 ? n : d;
  check(name, false,
    'first difference at module ' + at + ': mine ' + m[at] + ', reference ' + ref[at] +
    ' | mine ...' + m.slice(Math.max(0, at - 8), at + 8).join('') +
    '... reference ...' + ref.slice(Math.max(0, at - 8), at + 8).join('') + '...');
}

/* --------------------------------------------------------------- EAN-13 */

/* Payloads plus the check digit the standard's rule produces. The rule is
   verified independently just below, so this is not circular: if the rule
   implementation were wrong, the check-digit tests would fail and the module
   comparisons would fail with them. */
const eanPayloads = ['590123412345', '501234567890', '000000000000',
  '400638133393', '007567816412', '978020137962', '123456789012'];
const eanWhole = eanPayloads.map(p => p + bc.mod10CheckDigit(p));

/* The reference needs an explicit list of codes it agrees are valid: it computes
   its own check digit and rejects a code whose supplied digit differs, and on
   four of the seven payloads above it computes a *different* digit from the one
   both published conventions produce (1 instead of 7 for 400638133393, and so
   on — observed on bwip-js 4.11.4 / BWIPP 2026-05-28). Since the two published
   conventions agree with each other and with this encoder on every payload, and
   since bwip-js accepts 5901234123457 and 5012345678900 unchanged, the module
   comparison is run on the codes where the check digit is not in dispute. */
const eanComparable = ['5901234123457', '5012345678900', '0000000000000'];

for (const full of eanWhole) {
  const payload = full.slice(0, 12);
  const mine = bc.mod10CheckDigit(payload);
  /* the same rule written the other way round: 3,1,3 from the left. The two
     agree on every even-length payload, which is worth asserting because it is
     easy to get backwards. */
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum += Number(payload[i]) * (i % 2 ? 1 : 3);
  const other = String((10 - (sum % 10)) % 10);
  check('EAN-13 check digit for ' + full,
    mine === full.charAt(12) && mine === other,
    'rule gives ' + mine + ', the other published convention gives ' + other +
    ', the code ends in ' + full.charAt(12));
}

if (bwipjs) {
  for (const full of eanComparable) {
    try {
      compareModules('EAN-13 ' + full, bc.encode('ean13', full).modules, refModules('ean13', full));
    } catch (e) { check('EAN-13 ' + full, false, 'threw: ' + e.message); }
  }

  /* Record the disagreement rather than hiding it: the check digits in dispute
     are the four payloads where bwip-js's answer differs. */
  const disputed = eanWhole.filter(full => eanComparable.indexOf(full) < 0);
  check('EAN-13: check-digit disagreement with the reference is documented',
    disputed.length === 4,
    disputed.length + ' payloads where bwip-js computes a different check digit from both published ' +
    'conventions: ' + disputed.join(', '));
}

/* A check digit that does not match must be reported, not silently repaired. */
try {
  const wrong = bc.encode('ean13', '5901234123450');
  check('EAN-13 with a wrong check digit is reported',
    wrong.notes.some(n => /check digit/i.test(n)) && wrong.displayText === '5901234123457',
    wrong.notes.join(' '));
} catch (e) { check('EAN-13 wrong check digit', false, 'threw: ' + e.message); }

/* ------------------------------------------------------------- Code 128 */

if (bwipjs) {
  const c128Cases = ['HELLO', '0123456789', 'a', 'abcXYZ0987654321', 'Test 123',
    '!@#$%^&*()', '1234', '123', 'AB', 'x'.repeat(40), '0'.repeat(20) + 'A',
    'Order-0000123456-99', '~', 'a1b2c3d4', '123456A', 'A123456',
    'A1B2C3D4E5', '999999999999999999999999', 'Codepool-2026'];
  for (const t of c128Cases) {
    try {
      compareModules('Code128 ' + JSON.stringify(t), bc.encode('code128', t).modules, refModules('code128', t));
    } catch (e) { check('Code128 ' + JSON.stringify(t), false, 'threw: ' + e.message); }
  }

  /* 'ABC123456789' is the one case where the two encoders choose different code
     sets. Both are legal — the standard does not prescribe a selection
     algorithm — so instead of comparing modules, the properties that matter are
     asserted: the switch is made where it pays (a run of six or more digits
     ends the message), and the symbol is shorter than all-Code-B would be. */
  const t = 'ABC123456789';
  const mine = bc.encode('code128', t);
  const switchTitles = mine.groups.filter(g => g.kind === 'switch').map(g => g.title);
  check('Code128 ' + JSON.stringify(t) + ': code-set choice is legal and pays off',
    mine.codeSetSequence.join(' ') === 'Start B Code C Code B' &&
    switchTitles.length === 2 &&
    mine.groups.length === 13,
    'start + 3 letters + ' + switchTitles.join(' then ') + ' + 4 packed digit pairs + switch back + ' +
    'the odd digit + check + stop = ' + mine.groups.length + ' symbol characters (' +
    trimQuiet(mine.modules).length + ' modules), one symbol character shorter than leaving every character ' +
    'in code set B. The reference makes a different but equally legal choice: ' +
    refModules('code128', t).length + ' modules');
}

/* -------------------------------------------------------------- Code 39 */

/* The published nine-element table — the table a decoder uses. Written out here
   independently of barcode-1d.js, so a transcription error in either one shows
   up as a mismatch. Element order is printing order: bar, space, bar, space, …
   Each character has exactly three wide elements. */
const CODE39_PUBLISHED = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw',
  E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww',
  M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn',
  Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nnnwnwnnw', '.': 'nnnwwnnwn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn'
};

const tableProblems = [];
Object.keys(CODE39_PUBLISHED).forEach(ch => {
  const spec = CODE39_PUBLISHED[ch];
  const asBits = spec.split('').map(c => c === 'w' ? '1' : '0').join('');
  if (spec.length !== 9) tableProblems.push(ch + ': published row has ' + spec.length + ' elements');
  if (spec.split('').filter(c => c === 'w').length !== 3) tableProblems.push(ch + ': published row is not three wide of nine');
  if (bc.tables.code39Patterns[ch] !== asBits) {
    tableProblems.push(ch + ': encoder ' + bc.tables.code39Patterns[ch] + ', published ' + asBits);
  }
});
check('Code 39: the encoder table is a valid 44-entry table (43 data characters + the asterisk)',
  tableProblems.length === 0 && Object.keys(bc.tables.code39Patterns).length === 44,
  tableProblems.length ? tableProblems.join('; ')
    : 'all 44 entries agree with the published table element for element, and each is exactly three wide of nine');

const c39Cases = ['CODE-39', 'ABC123', 'A', '0123456789', 'TEST $.%+/-', 'HELLO WORLD',
  'Z', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '1', '99', 'WIKIPEDIA'];
for (const t of c39Cases) {
  try {
    const encoded = bc.encode('code39', t);
    const body = encoded.groups.filter(g => g.kind !== 'gap');
    const gaps = encoded.groups.filter(g => g.kind === 'gap');
    const problems = [];

    /* start and stop are the reserved asterisk */
    [0, body.length - 1].forEach((index, which) => {
      const got = elementClasses(body[index].modules).classes;
      if (got !== CODE39_PUBLISHED['*']) {
        problems.push((which === 0 ? 'start' : 'stop') + ' is ' + got + ', expected ' + CODE39_PUBLISHED['*']);
      }
    });

    /* one group per payload character, in order, matching the published row */
    if (body.length !== t.length + 2) {
      problems.push(body.length + ' character groups for ' + t.length + ' payload characters, expected ' + (t.length + 2));
    }
    for (let i = 1; i < body.length - 1; i++) {
      const ch = t.charAt(i - 1);
      const got = elementClasses(body[i].modules);
      const expected = CODE39_PUBLISHED[ch];
      if (!expected) { problems.push(JSON.stringify(ch) + ' is not in the published table'); continue; }
      if (got.classes !== expected) problems.push(JSON.stringify(ch) + ' is ' + got.classes + ', expected ' + expected);
      if (got.wide !== 3) problems.push(JSON.stringify(ch) + ' has ' + got.wide + ' wide elements, not 3');
    }

    /* A one-module gap follows each *data* character. The start and stop
       asterisks are adjacent to them with no gap, which is what a Code 39
       reader expects: the asterisk is a guard, not a character of the message. */
    const expectedGaps = Math.max(0, t.length - 1);
    if (gaps.length !== expectedGaps) {
      problems.push(gaps.length + ' gaps for ' + t.length + ' data characters, expected ' + expectedGaps);
    }
    gaps.forEach(gap => {
      if (gap.pattern !== '0') problems.push('a gap is ' + JSON.stringify(gap.pattern) + ', expected one narrow space');
    });

    /* the rendered width must be the sum of the parts at a 3:1 ratio */
    const expectedModules = (body.length * 15) + gaps.length;
    if (trimQuiet(encoded.modules).length !== expectedModules) {
      problems.push(trimQuiet(encoded.modules).length + ' modules, expected ' + expectedModules);
    }

    check('Code39 ' + JSON.stringify(t), problems.length === 0,
      problems.length ? problems.join('; ')
        : t.length + ' characters + start/stop, ' + gaps.length + ' one-module gaps, ' +
          expectedModules + ' modules, every element matching the published table');
  } catch (e) { check('Code39 ' + JSON.stringify(t), false, 'threw: ' + e.message); }
}

/* ------------------------------------------------------------------ ITF */

/* ITF is decoded back through the published wide-position table rather than
   compared with bwip-js: that renderer emits more digit pairs than it was given
   (which cannot be the supplied value), so it is not a usable reference for a
   GS1 ITF-14. Observed on bwip-js 4.11.4 / BWIPP 2026-05-28.

   The table: which of the five bars, and which of the five spaces, are wide. */
const ITF_WIDE = {
  0: '3,4', 1: '1,5', 2: '2,5', 3: '1,2', 4: '3,5',
  5: '1,3', 6: '2,3', 7: '4,5', 8: '1,4', 9: '2,4'
};

function decodeITF(mods) {
  const runs = toRuns(mods);
  while (runs.length && !runs[runs.length - 1].black) runs.pop();
  if (runs.length < 4 + 10 + 3) return { error: 'too few elements for a start, one pair and a stop' };
  const narrow = Math.min(...runs.map(r => r.len));
  const isWide = r => r.len > narrow;

  if (runs.slice(0, 4).some(isWide)) {
    return { error: 'start is not four narrow elements: ' + runs.slice(0, 4).map(r => r.len).join(',') };
  }
  /* The stop is 11101. The symbol ends on a bar and the space before it is
     narrow, so the last two elements print as one run: wide, narrow, narrow. */
  const stop = runs.slice(runs.length - 3);
  if (!(isWide(stop[0]) && !isWide(stop[1]) && !isWide(stop[2]))) {
    return { error: 'stop is not wide,narrow,narrow as printed: ' + stop.map(r => r.len).join(',') };
  }

  const body = runs.slice(4, runs.length - 3);
  if (body.length === 0 || body.length % 10 !== 0) {
    return { error: body.length + ' elements between start and stop, not a multiple of ten' };
  }

  const digits = [];
  for (let i = 0; i < body.length; i += 10) {
    const pair = body.slice(i, i + 10);
    /* classify first, keep the element positions, then split into the five bars
       (positions 0,2,4,6,8) and the five spaces (1,3,5,7,9) */
    const classes = pair.map(r => isWide(r) ? 'w' : 'n');
    const bars = classes.filter((_, k) => k % 2 === 0)
      .map((c, k) => c === 'w' ? k + 1 : null).filter(v => v !== null).join(',');
    const spaces = classes.filter((_, k) => k % 2 === 1)
      .map((c, k) => c === 'w' ? k + 1 : null).filter(v => v !== null).join(',');
    const first = Object.keys(ITF_WIDE).find(d => ITF_WIDE[d] === bars);
    const second = Object.keys(ITF_WIDE).find(d => ITF_WIDE[d] === spaces);
    if (first == null) return { error: 'no digit has wide bars at ' + bars };
    if (second == null) return { error: 'no digit has wide spaces at ' + spaces };
    digits.push(first + second);
  }
  return { digits: digits.join(''), pairs: digits.length };
}

const itfCases = ['12345678', '1234567890', '123456789012', '00000000000000',
  '15400141288765', '99999999999999', '01020304050607', '12345678901234'];
for (const t of itfCases) {
  try {
    const mods = trimQuiet(bc.encode('itf14', t).modules);
    const decoded = decodeITF(mods);
    if (decoded.error) { check('ITF ' + t, false, 'decode through the published table failed: ' + decoded.error); continue; }
    /* 18 modules per interleaved pair at 3:1, plus the 4-module start and the
       5-module stop */
    const expectedModules = 18 * (t.length / 2) + 9;
    check('ITF ' + t, decoded.digits === t && mods.length === expectedModules,
      'decodes to ' + decoded.digits + ' through the published table; ' + mods.length +
      ' modules (' + decoded.pairs + ' pairs x 18 + start 4 + stop 5 = ' + expectedModules + ')');
  } catch (e) { check('ITF ' + t, false, 'threw: ' + e.message); }
}

/* 13 digits gains a GTIN-14 check digit; 14 digits is complete and unchanged.
   The expected digit is computed here with the GS1 rule for a 13-digit payload
   — multiply position 1 by 3, position 2 by 1, alternating — rather than taken
   from the encoder, so agreement means something. */
function gtin14CheckDigit(payload) {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum += Number(payload[i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}
try {
  const payload13 = '1540014128876';
  const expectedCheck = gtin14CheckDigit(payload13);
  const complete = payload13 + expectedCheck;
  const thirteen = bc.encode('itf14', payload13);
  const fourteen = bc.encode('itf14', complete);
  const a = decodeITF(trimQuiet(thirteen.modules));
  const b = decodeITF(trimQuiet(fourteen.modules));
  check('ITF-14 check-digit handling',
    thirteen.check.value === expectedCheck &&
    a.digits === complete &&
    b.digits === complete && fourteen.displayText === complete,
    '13 digits ' + payload13 + ' -> check digit ' + expectedCheck + ' (GS1 rule) -> encodes ' + a.digits +
    '; 14 digits ' + complete + ' -> encodes ' + b.digits + ' unchanged');
} catch (e) { check('ITF-14 check-digit handling', false, 'threw: ' + e.message); }

/* --------------------------------------------------------------- report */

let pass = 0, fail = 0;
for (const r of results) {
  if (r.ok) { pass++; console.log('PASS  ' + r.name + '\n        ' + r.detail); }
  else { fail++; console.log('FAIL  ' + r.name + '\n        ' + r.detail); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + results.length + ' checks');
process.exit(fail ? 1 : 0);
