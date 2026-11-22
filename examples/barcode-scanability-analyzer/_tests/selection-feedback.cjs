const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
async function main() {
  const executablePath = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.route('**/dist/dbr.bundle.js', route => route.abort());
    await page.goto(process.env.ANALYZER_URL || 'http://localhost:4180/');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Reader unavailable'));
    await page.click('#manual_toggle');
    await page.fill('#selection_x', '100'); await page.fill('#selection_y', '100');
    await page.fill('#selection_w', '300'); await page.fill('#selection_h', '200');
    await page.locator('#selection_h').press('Tab');
    assert.equal(await page.locator('#apply_selection').count(), 0);
    assert.equal(await page.locator('#selection_form button[type=submit]').count(), 0);
    await page.waitForFunction(() => document.querySelector('#selection_feedback').textContent.startsWith('Selected area:'));
    assert.match(await page.locator('#selection_feedback').innerText(), /100, 100.*300 × 200/);
    await page.fill('#selection_x', '1150'); await page.locator('#selection_x').press('Tab');
    await page.waitForFunction(() => document.querySelector('#selection_feedback').textContent.includes('outside'));
    assert.equal(await page.locator('#selection_x').getAttribute('aria-invalid'), 'true');
    await page.fill('#selection_x', ''); await page.locator('#selection_x').press('Tab');
    await page.waitForFunction(() => document.querySelector('#selection_feedback').textContent.includes('Enter'));
    await page.fill('#selection_x', '110'); await page.locator('#selection_x').press('Enter');
    await page.waitForFunction(() => document.querySelector('#selection_feedback').textContent.includes('110, 100'));
    assert.match(await page.locator('#selection_feedback').innerText(), /110, 100/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('#selection_x').getAttribute('aria-invalid'), null);
    console.log('PASS: no coordinate-submit button, automatic updates on blur/Enter, local validation, empty fields and mobile layout');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
