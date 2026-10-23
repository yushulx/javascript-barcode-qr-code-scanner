/*
 * Browser verification for the barcode structure diagram.
 *
 * Drives headless Chrome over the DevTools protocol with Node's built-in
 * WebSocket: sweeps every symbology, reads back the DOM the page actually
 * produced, exercises the error path and the toggles, and writes screenshots.
 *
 *   node demos/barcode-structure/_tests/verify-browser.cjs [baseUrl]
 *
 * Requires a static server for the repo root and a Chrome/Edge binary. Both are
 * discovered automatically; override with CHROME_PATH if needed.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.argv[2] || 'http://127.0.0.1:4173/demos/barcode-structure/';
const SHOT_DIR = process.env.SHOT_DIR || path.join(os.tmpdir(), 'codepool-barcode-shots');
const PORT = 9333;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!chromePath) {
  console.error('No Chrome/Edge binary found. Set CHROME_PATH.');
  process.exit(2);
}
fs.mkdirSync(SHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

let nextId = 1;
function makeClient(ws) {
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  return {
    events,
    send(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    },
    async eval(expression) {
      const result = await this.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
      });
      if (result.exceptionDetails) {
        throw new Error('page exception: ' + (result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text));
      }
      return result.result.value;
    }
  };
}

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcverify-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDataDir,
    '--window-size=1440,2200',
    'about:blank'
  ], { stdio: 'ignore' });

  process.on('exit', () => { try { chrome.kill(); } catch { /* already gone */ } });

  /* Wait for the DevTools endpoint. */
  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      version = await res.json();
    } catch { await sleep(250); }
  }
  if (!version) {
    console.error('Chrome did not expose a DevTools endpoint.');
    chrome.kill();
    process.exit(2);
  }
  console.log('browser:', version['Browser']);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const client = makeClient(ws);

  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.enable');

  const consoleErrors = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('exception: ' + (msg.params.exceptionDetails?.exception?.description ||
        msg.params.exceptionDetails?.text));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      /* A blocked third-party request (Google Fonts, GTM) is an environment
         fact, not a defect in the page: the demos are designed to work with
         the network unavailable. Only resource failures that touch this demo's
         own files are treated as errors. */
      const text = msg.params.entry.text || '';
      const url = msg.params.entry.url || '';
      const isOwnAsset = /barcode-structure/.test(url);
      if (isOwnAsset || !/Failed to load resource/i.test(text)) {
        consoleErrors.push('log: ' + text + (url ? ' [' + url + ']' : ''));
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push('console: ' + msg.params.args.map(a => a.value ?? a.description).join(' '));
    }
  });

  await client.send('Page.navigate', { url: BASE });
  await sleep(2500);

  const results = [];
  function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  }

  async function shot(name) {
    const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = path.join(SHOT_DIR, name + '.png');
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  /* --- initial state --------------------------------------------------- */
  const title = await client.eval('document.title');
  check('page title', /Barcode Structure Diagram/.test(title), title);

  const initial = await client.eval(`(() => {
    const svg = document.getElementById('diagram');
    return {
      tabs: [...document.querySelectorAll('.symbology-tab')].map(b => b.textContent.trim()),
      bars: svg.querySelectorAll('rect').length,
      hits: svg.querySelectorAll('.region-hit').length,
      regions: document.querySelectorAll('#regionRows tr').length,
      characters: document.querySelectorAll('#characterRows tr').length,
      legend: [...document.querySelectorAll('.legend-item')].map(b => b.textContent.trim()),
      facts: [...document.querySelectorAll('.fact-chip')].map(c => c.textContent.trim()),
      status: document.getElementById('renderStatus').textContent.trim(),
      errorShown: document.getElementById('formError').classList.contains('is-visible')
    };
  })()`);
  check('five symbology tabs', initial.tabs.length === 5, initial.tabs.join(' | '));
  check('EAN-13 draws bars', initial.bars > 20, initial.bars + ' rects, ' + initial.hits + ' hit regions');
  check('EAN-13 has 7 structural regions', initial.hits === 7, initial.hits + ' hit regions');
  check('EAN-13 region table populated', initial.regions === 7, initial.regions + ' rows');
  check('EAN-13 character table populated', initial.characters === 13, initial.characters + ' rows');
  check('EAN-13 check digit computed as 7', /Check digit7/.test(initial.facts.join(' ')),
    initial.facts.join(' | '));
  check('no error on load', !initial.errorShown, initial.status);
  await shot('01-ean13');

  /* --- selection and detail panel -------------------------------------- */
  const selection = await client.eval(`(() => {
    const hits = [...document.querySelectorAll('.region-hit')];
    const centre = hits[2];
    centre.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const hovered = document.getElementById('detailTitle').textContent;
    centre.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return {
      hovered,
      pinned: document.getElementById('detailPanel').classList.contains('is-pinned'),
      title: document.getElementById('detailTitle').textContent,
      stats: [...document.querySelectorAll('#detailStats div')].map(d => d.textContent.trim()),
      selected: document.querySelectorAll('.region-highlight.is-selected').length,
      activeRow: document.querySelectorAll('#regionRows tr.is-active').length
    };
  })()`);
  check('hover describes a region', !!selection.hovered, selection.hovered);
  check('click pins the region', selection.pinned && selection.selected === 1,
    'pinned=' + selection.pinned + ' highlighted=' + selection.selected);
  check('pinned region highlights its table row', selection.activeRow === 1, selection.activeRow + ' active row');
  check('detail panel shows stats', selection.stats.length >= 2, selection.stats.join(' / '));
  await shot('02-ean13-pinned');

  /* --- module readout --------------------------------------------------
     Rather than reproducing the page's pointer arithmetic in the test (which
     would only prove the test and the page share an assumption), sweep the
     pointer across the whole symbol and check the properties that matter: the
     reported module climbs steadily from 0 to the last module, the values are
     all 0 or 1, and the regions appear in the order the symbol is built. */
  const readoutSweep = await client.eval(`(() => {
    const svg = document.getElementById('diagram');
    const rect = svg.getBoundingClientRect();
    const target = document.getElementById('moduleReadout');
    const samples = [];
    for (let i = 0; i <= 220; i++) {
      const x = rect.left + 1 + (rect.width - 2) * (i / 220);
      svg.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: rect.top + 10 }));
      const text = target.textContent.replace(/\\s+/g, ' ').trim();
      const mod = /Module: (\\d+)/.exec(text);
      const val = /Value: ([^R]*)/.exec(text);
      const region = /Region: (.*?)Role:/.exec(text + 'Role:');
      samples.push({ mod: mod ? Number(mod[1]) : null, value: val ? val[1].trim() : '', region: region ? region[1].trim() : '' });
    }
    return samples;
  })()`);

  const modules = readoutSweep.map(s => s.mod).filter(m => m != null);
  const monotonic = modules.every((m, i) => i === 0 || m >= modules[i - 1]);
  const values = new Set(readoutSweep.map(s => s.value).filter(v => v && v !== '\u2014'));
  const regionsSeen = [];
  readoutSweep.forEach(s => {
    if (s.region && regionsSeen[regionsSeen.length - 1] !== s.region) {
      regionsSeen.push(s.region);
    }
  });
  const distinctModules = new Set(modules).size;

  check('pointer sweep covers the whole symbol',
    modules.length > 150 && distinctModules > 80 && monotonic,
    distinctModules + ' distinct modules, monotonic=' + monotonic + ', range ' +
    Math.min(...modules) + '-' + Math.max(...modules));
  check('every module reports a bar or space value',
    values.size > 0 && [...values].every(v => /^[01] \((bar|space)\)$/.test(v)),
    [...values].join(' | '));
  check('regions appear in symbol order across the sweep',
    regionsSeen[0] === 'Quiet zone (left)' &&
    regionsSeen.includes('Start guard') &&
    regionsSeen.includes('Left half — digits 2 to 7') &&
    regionsSeen.includes('Centre guard') &&
    regionsSeen[regionsSeen.length - 1] === 'Quiet zone (right)',
    regionsSeen.join(' \u2192 '));

  /* --- every symbology -------------------------------------------------- */
  const sweep = [
    { id: 'code128', label: 'Code 128' },
    { id: 'code39', label: 'Code 39' },
    { id: 'itf14', label: 'ITF-14' },
    { id: 'qrcode', label: 'QR Code' }
  ];

  for (const item of sweep) {
    const state = await client.eval(`(() => {
      document.querySelector('[data-symbology="${item.id}"]').click();
      const svg = document.getElementById('diagram');
      return {
        label: document.querySelector('[data-symbology="${item.id}"]').textContent.trim(),
        rects: svg.querySelectorAll('rect').length,
        hits: svg.querySelectorAll('.region-hit').length,
        regions: document.querySelectorAll('#regionRows tr').length,
        facts: [...document.querySelectorAll('.fact-chip')].map(c => c.textContent.trim()),
        status: document.getElementById('renderStatus').textContent.trim(),
        errorShown: document.getElementById('formError').classList.contains('is-visible'),
        error: document.getElementById('formError').textContent.trim(),
        value: document.getElementById('valueInput').value,
        checkHeading: document.getElementById('checkHeading').textContent.trim(),
        qrVisible: !document.getElementById('qrCard').hidden,
        gridStage: document.getElementById('diagramStage').classList.contains('diagram-stage--grid')
      };
    })()`);
    check(item.label + ' renders', !state.errorShown && state.rects > 20,
      state.rects + ' rects, ' + state.hits + ' regions, value "' + state.value + '"' + (state.error ? ' ERROR: ' + state.error : ''));
    check(item.label + ' panels populated', state.regions > 2, state.regions + ' table rows');
    if (item.id === 'qrcode') {
      check('QR Code uses the grid layout', state.gridStage, 'grid stage=' + state.gridStage);
      check('QR Code shows its specifics card', state.qrVisible && state.hits > 20, state.hits + ' components');
      check('QR Code check card explains error correction', /error correction/i.test(state.checkHeading), state.checkHeading);
    }
    await shot('03-' + item.id);
  }

  /* --- module ruler toggle on the longest symbol ------------------------ */
  const ruler = await client.eval(`(() => {
    document.querySelector('[data-symbology="code128"]').click();
    const before = document.getElementById('diagram').querySelectorAll('.ruler-text').length;
    const box = document.getElementById('showModuleNumbers');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const after = document.getElementById('diagram').querySelectorAll('.ruler-text').length;
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return { before, after };
  })()`);
  check('module ruler toggle adds labels', ruler.after > ruler.before,
    ruler.before + ' -> ' + ruler.after + ' labels');

  /* --- live encoding --------------------------------------------------- */
  const live = await client.eval(`(() => {
    const input = document.getElementById('valueInput');
    document.querySelector('[data-symbology="ean13"]').click();
    input.value = '400638133393';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const digits = [...document.querySelectorAll('#characterRows tr')].map(r => r.cells[1]?.textContent.trim());
    const facts = [...document.querySelectorAll('.fact-chip')].map(c => c.textContent.trim());
    return { digits: digits.slice(0, 4), facts, status: document.getElementById('renderStatus').textContent.trim() };
  })()`);
  check('typing a new EAN-13 payload re-encodes live',
    /Check digit7/.test(live.facts.join(' ')), live.facts.join(' | '));

  /* --- error path ------------------------------------------------------- */
  const bad = await client.eval(`(() => {
    const input = document.getElementById('valueInput');
    document.querySelector('[data-symbology="code39"]').click();
    input.value = 'lowercase not allowed!';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = document.getElementById('formError').classList.contains('is-visible');
    const message = document.getElementById('formError').textContent.trim();
    // recover
    document.querySelector('[data-symbology="ean13"]').click();
    return { shown, message, recovered: !document.getElementById('formError').classList.contains('is-visible') };
  })()`);
  check('an unencodable payload shows a clear error', bad.shown && /Code 39/.test(bad.message),
    bad.message.slice(0, 120));
  check('switching symbology recovers from the error', bad.recovered);
  await shot('04-error-recovered');

  /* --- keyboard -----------------───────────────────────────────────────── */
  const keyboard = await client.eval(`(() => {
    const hit = document.querySelectorAll('.region-hit')[1];
    hit.focus();
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const pinned = document.getElementById('detailPanel').classList.contains('is-pinned');
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { pinned, cleared: !document.getElementById('detailPanel').classList.contains('is-pinned') };
  })()`);
  check('Enter pins a region from the keyboard', keyboard.pinned);
  check('Escape clears it', keyboard.cleared);

  /* --- QR error-correction levels -------------------------------------- */
  const levels = await client.eval(`(() => {
    document.querySelector('[data-symbology="qrcode"]').click();
    const out = [];
    const select = document.getElementById('qrEcLevel');
    for (const level of ['L', 'M', 'Q', 'H']) {
      select.value = level;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const facts = [...document.querySelectorAll('.fact-chip')].map(c => c.textContent.trim()).join(' ');
      out.push({ level, facts, version: (facts.match(/Version(\\d+)/) || [])[1],
                 regions: document.querySelectorAll('#regionRows tr').length });
    }
    return out;
  })()`);
  levels.forEach(item => {
    check('QR level ' + item.level + ' encodes', /Level/.test(item.facts),
      item.facts.replace(/\s+/g, ' ').slice(0, 150));
  });
  await shot('05-qrcode-H');

  /* --- accessibility spot checks --------------------------------------- */
  const a11y = await client.eval(`(() => {
    const svg = document.getElementById('diagram');
    const hits = [...svg.querySelectorAll('.region-hit')];
    return {
      focusable: hits.filter(h => h.getAttribute('tabindex') === '0').length,
      labelled: hits.filter(h => (h.getAttribute('aria-label') || '').length > 8).length,
      total: hits.length
    };
  })()`);
  check('every region is keyboard reachable and labelled',
    a11y.focusable === a11y.total && a11y.labelled === a11y.total,
    a11y.labelled + '/' + a11y.total + ' labelled, ' + a11y.focusable + ' focusable');

  check('no console errors during the whole sweep', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ') || 'clean');

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} checks`);
  console.log('screenshots: ' + SHOT_DIR);

  ws.close();
  chrome.kill();
  await sleep(300);
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('verification failed:', err.message);
  process.exit(1);
});
