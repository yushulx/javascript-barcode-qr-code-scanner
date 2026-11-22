/*
 * Round-trip verification: generate a GS1 test label in the generator, feed the
 * PNG to the GS1 scanner, and compare every application identifier the scanner
 * reports against the payload the generator encoded.
 *
 * This is the test the whole generator exists for. Both pages are driven as a
 * user would drive them, so the path is real: bwip-js encodes, the file is
 * downloaded, the scanner opens it and parses it.
 *
 * Usage: node verify-roundtrip.js <generatorUrl> <scannerUrl> [tmpDir]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GENERATOR = process.argv[2] || 'http://127.0.0.1:8822';
const SCANNER = process.argv[3] || 'http://127.0.0.1:8811';
const TMP = process.argv[4] || fs.mkdtempSync(path.join(os.tmpdir(), 'gs1-roundtrip-'));

const CHROME = 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

async function newPage(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    permissions: ['camera']
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(url + '/', { waitUntil: 'load' });
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  fs.mkdirSync(TMP, { recursive: true });

  /* ---------- 1. generate ---------- */
  const gen = await newPage(browser, GENERATOR);
  await gen.page.waitForFunction(
    () => !/Generating/.test(document.getElementById('renderStatus').textContent),
    { timeout: 30000 }).catch(() => { });

  const scenarioIds = await gen.page.evaluate(() =>
    Array.from(document.querySelectorAll('#scenario option')).map((o) => o.value));

  const cases = [];
  for (const id of scenarioIds) {
    await gen.page.selectOption('#scenario', id);
    await gen.page.waitForTimeout(450);
    await gen.page.waitForFunction(
      () => !/Generating/.test(document.getElementById('renderStatus').textContent),
      { timeout: 15000 }).catch(() => { });

    const blocked = await gen.page.$eval('#formError', (e) => {
      const list = e.querySelector('.note-list.is-error');
      return !!list;
    });
    if (blocked) {
      console.log(`skip   ${id}: the payload has errors`);
      continue;
    }

    const dataUrl = await gen.page.evaluate(() =>
      document.getElementById('previewCanvas').toDataURL('image/png'));
    const file = path.join(TMP, id + '.png');
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

    const expected = await gen.page.evaluate(() => ({
      symbology: document.getElementById('symbology').value,
      elementString: document.getElementById('expectedElementString').textContent,
      hri: document.getElementById('expectedHri').textContent,
      rows: Array.from(document.querySelectorAll('#expectedRows tr')).map((tr) => {
        const tds = tr.querySelectorAll('td');
        return { ai: tds[0].textContent.replace(/[()]/g, ''), value: tds[2].textContent.split(' ')[0] };
      })
    }));

    // Read the true raw value from the payload model rather than the rendered
    // cell, which is formatted for humans.
    const rawRows = await gen.page.evaluate(() =>
      Array.from(document.querySelectorAll('#elementList .element-row')).map((row) => ({
        ai: row.querySelector('select').value,
        value: row.querySelector('input').value
      })));

    cases.push({ id, file, expected: { ...expected, rows: rawRows } });
  }
  console.log(`generated ${cases.length} test labels into ${TMP}\n`);

  /* ---------- 2. scan ---------- */
  const scanner = await newPage(browser, SCANNER);
  await scanner.page.waitForFunction(
    () => document.getElementById('loading-overlay').classList.contains('hidden'),
    { timeout: 90000 }).catch(() => { });
  await scanner.page.evaluate(() => {
    document.querySelectorAll('.dls-license-mask').forEach((e) => e.remove());
    document.querySelector('.mode-option[data-mode="upload"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await scanner.page.waitForTimeout(400);

  let pass = 0;
  let fail = 0;

  for (const testCase of cases) {
    await scanner.page.evaluate(() => {
      document.querySelectorAll('.dls-license-mask').forEach((e) => e.remove());
      const close = document.getElementById('close-results-button');
      if (close) close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await scanner.page.waitForTimeout(150);

    await scanner.page.locator('#upload-input').setInputFiles(testCase.file, { force: true });

    let opened = false;
    try {
      await scanner.page.waitForFunction(
        () => document.getElementById('results').classList.contains('is-open'),
        { timeout: 25000 });
      opened = true;
    } catch (e) { opened = false; }

    const actual = opened ? await scanner.page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.barcode-card'));
      return cards.map((card) => ({
        format: (card.querySelector('.format-chip') || {}).textContent,
        badge: (card.querySelector('.gs1-badge') || {}).textContent,
        rows: Array.from(card.querySelectorAll('.ai-table tbody tr')).map((tr) => {
          const ai = (tr.querySelector('.ai-code') || {}).textContent || '';
          const raw = tr.querySelector('.ai-raw');
          const shown = tr.querySelector('.ai-value');
          return {
            ai: ai.replace(/[()]/g, ''),
            value: raw ? raw.textContent.replace(/^raw:\s*/, '') : (shown ? shown.textContent : '')
          };
        })
      }));
    }) : [];

    /* ---------- 3. compare ---------- */
    const label = testCase.id.padEnd(14);
    if (!opened) {
      fail++;
      console.log(`FAIL   ${label} no results panel opened`);
      continue;
    }

    // Pick the card whose element count matches the payload.
    const expectedRows = testCase.expected.rows;
    const card = actual.find((c) => c.rows.length === expectedRows.length) || actual[0];
    const mismatches = [];

    if (card.rows.length !== expectedRows.length) {
      mismatches.push(`element count ${card.rows.length} != ${expectedRows.length}`);
    }
    expectedRows.forEach((want, index) => {
      const got = card.rows[index];
      if (!got) {
        mismatches.push(`AI ${want.ai}: missing`);
        return;
      }
      if (got.ai !== want.ai) mismatches.push(`position ${index}: AI ${got.ai} != ${want.ai}`);
      if (got.value !== want.value) {
        mismatches.push(`AI ${want.ai}: "${got.value}" != "${want.value}"`);
      }
    });

    if (mismatches.length) {
      fail++;
      console.log(`FAIL   ${label} ${card.format} — ${mismatches.join('; ')}`);
    } else {
      pass++;
      console.log(`ok     ${label} ${String(card.format).padEnd(28)} ${expectedRows.length} AIs match`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('labels kept in ' + TMP);

  const pages = [gen, scanner];
  pages.forEach((p) => {
    if (p.errors.length) {
      console.log('\npage errors on ' + (p === gen ? 'generator' : 'scanner') + ':');
      p.errors.forEach((e) => console.log('  ' + e));
    }
  });

  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
