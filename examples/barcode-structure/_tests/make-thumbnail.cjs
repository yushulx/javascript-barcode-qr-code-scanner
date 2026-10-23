/*
 * Regenerate the demo card thumbnail from the live page.
 *
 *   node demos/barcode-structure/_tests/make-thumbnail.cjs [baseUrl]
 *
 * Scrolls the structure diagram into view and captures a 1440x1010 frame, so
 * the card image shows the thing the demo is about rather than the page header.
 * Writes demos/barcode-structure/thumbnail.png.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.argv[2] || 'http://127.0.0.1:4173/demos/barcode-structure/';
const OUT = path.join(__dirname, '..', 'thumbnail.png');
const PORT = 9336;
const WIDTH = 1440;
const HEIGHT = 1010;

const chromePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome'
].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch { return false; } });

if (!chromePath) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcthumb-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDataDir,
    '--window-size=' + WIDTH + ',' + HEIGHT, 'about:blank'
  ], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch { /* gone */ } });

  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(250); }
  }
  if (!version) { console.error('Chrome exposed no DevTools endpoint.'); chrome.kill(); process.exit(2); }

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false
  });
  await send('Page.navigate', { url: BASE });
  await sleep(2500);

  /* Put the diagram card near the top of the frame, a little below the header so
     the page still reads as a page. */
  await send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.getElementById('diagram').closest('.card');
      const top = card.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - 90));
      return window.scrollY;
    })()`,
    returnByValue: true
  });
  await sleep(600);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(data, 'base64'));
  console.log('wrote ' + OUT + ' (' + WIDTH + 'x' + HEIGHT + ')');

  ws.close();
  chrome.kill();
  await sleep(300);
  process.exit(0);
})().catch(err => {
  console.error('thumbnail failed:', err.message);
  process.exit(1);
});
