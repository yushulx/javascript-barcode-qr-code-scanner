/* Real SDK + browser integration. Run a root static server on localhost:4173. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const analyzerUrl=process.env.ANALYZER_URL||'http://localhost:4180/';
async function main(){
  const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(p=>fs.existsSync(p));
  const browser=await chromium.launch({executablePath,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],trackingRequests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/googletagmanager\.com|google-analytics\.com/.test(r.url()))trackingRequests.push(r.url());});
    await page.goto(analyzerUrl);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Analysis complete'),{},{timeout:180000});
    const baseline=await page.locator('#outcome').innerText();assert.match(baseline,/\d+ decoded/);assert.ok(parseInt(baseline)>0,baseline);
    // The public local trial key displays the SDK's own license notice.
    if(await page.locator('.dls-license-icon-close').count())await page.locator('.dls-license-icon-close').click();
    assert.ok(await page.locator('.check').count()>=8);
    assert.equal(await page.locator('#apply_selection').count(),0);
    assert.equal(await page.locator('.report-legend .check-badge').count(),3);
    assert.equal(await page.locator('.check-badge.pass').count(),0);
    assert.equal(await page.locator('.check .check-badge').count(),await page.locator('.check').count());
    assert.ok((await page.locator('.check.measured .check-badge').allTextContents()).every(t=>t==='Measurement only'));
    assert.ok((await page.locator('.check.inconclusive .check-badge').allTextContents()).every(t=>t==='Inconclusive'));
    console.log('Real SDK baseline:',baseline);
    await page.screenshot({path:path.resolve(__dirname,'../thumbnail.png')});
    await page.selectOption('#region','1');assert.match(await page.locator('#payload').innerText(),/Decoded text/);
    await page.selectOption('#sample','tiny-barcodes-1.jpg');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Analysis complete')&&!document.querySelector('#analyze').disabled,{},{timeout:90000});
    console.log('Tiny sample:',await page.locator('#outcome').innerText());
    await page.click('#manual_toggle');await page.fill('#selection_x','0');await page.fill('#selection_y','0');await page.fill('#selection_w','498');await page.fill('#selection_h','452');await page.locator('#selection_h').press('Tab');
    await page.waitForFunction(()=>document.querySelector('#selection_feedback').textContent.startsWith('Selected area:'));
    assert.match(await page.locator('#summary').innerText(),/crop decode not tested/);
    await page.click('#manual_decode');await page.waitForFunction(()=>document.querySelector('#manual_decode_result').textContent.includes('decoded in the selected area'),{},{timeout:90000});
    assert.match(await page.locator('#summary').innerText(),/crop decode succeeded/);assert.match(await page.locator('#payload').innerText(),/Decoded text/);
    await page.click('#compare');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Decoding comparisons complete'),{},{timeout:90000});assert.ok((await page.locator('#comparison_status').innerText()).includes('already decodes'),await page.locator('#comparison_status').innerText());
    assert.equal(await page.locator('.experiment').count(),5);console.log('Controlled image tests with a valid barcode passed');
    await page.click('#manual_clear');console.log('Selected-area successful decode and payload passed');
    const oldName=await page.locator('#meta').innerText();
    await page.click('#tuner');await page.waitForURL(/\/(?:barcode-parameter-tuner|parameter-tuner)\//);
    await page.waitForFunction(()=>document.querySelector('#source_title').textContent==='tiny-barcodes-1.jpg',{},{timeout:90000});
    assert.ok(!page.url().includes('imageHandoff'));console.log('Handoff received:',oldName);
    await page.goto(analyzerUrl);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Analysis complete'),{},{timeout:90000});
    if(await page.locator('.dls-license-icon-close').count())await page.locator('.dls-license-icon-close').click();
    // Invalid file and a barcode-free image must never masquerade as decode success.
    await page.setInputFiles('#upload',{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('could not be read'));
    const blank=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=300;c.height=200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,300,200);return c.toDataURL().split(',')[1];});
    await page.setInputFiles('#upload',{name:'blank.png',mimeType:'image/png',buffer:Buffer.from(blank,'base64')});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Analysis complete'),{},{timeout:90000});
    assert.match(await page.locator('#outcome').innerText(),/^0 decoded/);assert.match(await page.locator('#summary').innerText(),/No barcode/);
    const downloadPromise=page.waitForEvent('download');await page.click('#export');const download=await downloadPromise;const report=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(report.decodedCount,0);
    const lowContrast=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=400;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='rgb(140,140,140)';ctx.fillRect(0,0,400,240);ctx.fillStyle='rgb(110,110,110)';for(let x=80;x<320;x+=16)ctx.fillRect(x,60,8,120);return c.toDataURL().split(',')[1];
    });
    await page.setInputFiles('#upload',{name:'unreadable-low-contrast.png',mimeType:'image/png',buffer:Buffer.from(lowContrast,'base64')});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Analysis complete'),{},{timeout:90000});
    assert.match(await page.locator('#outcome').innerText(),/^0 decoded/);
    // Draw in reverse direction on the CSS-scaled image; coordinates must map to original pixels.
    await page.click('#manual_toggle');const box=await page.locator('#preview').boundingBox();
    await page.mouse.move(box.x+box.width*330/400,box.y+box.height*190/240);await page.mouse.down();
    await page.mouse.move(box.x+box.width*70/400,box.y+box.height*50/240,{steps:8});await page.mouse.up();
    assert.equal(await page.locator('#selection_x').inputValue(),'70');assert.equal(await page.locator('#selection_w').inputValue(),'260');
    assert.match(await page.locator('#summary').innerText(),/image measurements do not require/i);
    assert.match(await page.locator('#finding_cards').innerText(),/Contrast/);assert.match(await page.locator('#finding_cards').innerText(),/binarization/);
    assert.ok(await page.locator('#checks .check').count()>=7);
    assert.equal(await page.locator('#symbol_details').isVisible(),false);
    assert.equal(await page.locator('.check').filter({has:page.locator('strong',{hasText:'Module size'})}).count(),0);
    await page.click('#manual_decode');await page.waitForFunction(()=>document.querySelector('#manual_decode_result').textContent.includes('also failed'),{},{timeout:90000});
    assert.match(await page.locator('#finding_cards').innerText(),/Contrast/);
    await page.click('#compare');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Decoding comparisons complete'),{},{timeout:90000});assert.ok((await page.locator('#comparison_status').innerText()).includes('cause remains unexplained'),await page.locator('#comparison_status').innerText());
    assert.equal(await page.locator('.experiment').count(),5);
    const manualDownloadPromise=page.waitForEvent('download');await page.click('#export');const manualDownload=await manualDownloadPromise;
    const manualReport=JSON.parse(fs.readFileSync(await manualDownload.path(),'utf8'));const selected=manualReport.regions.find(r=>r.source==='user_selection');
    assert.equal(selected.cropRetry.state,'failed');assert.ok(selected.report.findings.some(f=>f.label==='Contrast'));assert.equal(selected.points[0].x,70);assert.equal(selected.comparisons.length,5);
    assert.ok(!manualReport.regions.some(r=>r.report.checks.some(c=>['Motion blur','Highlights','Inversion','Damage'].includes(c.label))));
    await page.locator('.workspace').screenshot({path:path.join(require('node:os').tmpdir(),'scanability-manual-failure.png')});
    await page.click('#manual_clear');assert.equal(await page.locator('#selection_form').isVisible(),false);
    console.log('Unreadable image: manual pointer selection, independent contrast finding, failed crop retry and report passed');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#shoot').isVisible(),false);
    await page.screenshot({path:path.join(require('node:os').tmpdir(),'scanability-mobile.png')});
    await page.click('#manual_toggle');await page.fill('#selection_x','70');await page.fill('#selection_y','50');await page.fill('#selection_w','260');await page.fill('#selection_h','140');await page.locator('#selection_h').press('Tab');
    await page.waitForFunction(()=>document.querySelector('#selection_feedback').textContent.startsWith('Selected area:'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.click('#manual_clear');
    await page.click('#camera');await page.waitForFunction(()=>document.querySelector('#video').videoWidth>0);
    assert.equal(await page.locator('#shoot').isVisible(),true);
    await page.click('#shoot');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Analysis complete'),{},{timeout:90000});
    assert.match(await page.locator('#meta').innerText(),/Camera frame/);assert.equal(await page.locator('#video').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.querySelector('#video').srcObject===null),true);
    console.log('Fake-device camera capture and cleanup passed');
    for(const sample of ['barcodes-in-low-lights-1.jpg','barcodes-in-strong-light-1.jpg','off-screen-2.jpg','poorly-printed-1.jpg','crumpled-barcodes-1.jpg','single-symbology-multiple-barcodes-2.jpg']){
      await page.selectOption('#sample',sample);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Analysis complete')&&!document.querySelector('#analyze').disabled,{},{timeout:90000});
      console.log(sample+': '+await page.locator('#outcome').innerText());
      if(sample==='crumpled-barcodes-1.jpg'){
        assert.ok(await page.locator('.check.warn').count()>0);
        await page.setViewportSize({width:1440,height:1100});
        await page.locator('.workspace').screenshot({path:path.join(require('node:os').tmpdir(),'scanability-report-statuses.png')});
        await page.click('#manual_toggle');await page.fill('#selection_x','105');await page.fill('#selection_y','95');await page.fill('#selection_w','180');await page.fill('#selection_h','100');await page.locator('#selection_h').press('Tab');
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.resolve(__dirname,'../screenshots/region-analysis.png')});
        await page.click('#manual_clear');
      }
    }
    // Deliberately block the SDK script: region diagnostics must remain useful without a reader.
    const offline=await browser.newPage({viewport:{width:1100,height:900}});
    await offline.route('**/dist/dbr.bundle.js',route=>route.abort());
    await offline.goto(analyzerUrl);
    await offline.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Reader unavailable'));
    await offline.click('#manual_toggle');await offline.fill('#selection_x','100');await offline.fill('#selection_y','100');await offline.fill('#selection_w','300');await offline.fill('#selection_h','200');await offline.locator('#selection_h').press('Tab');
    await offline.waitForFunction(()=>document.querySelector('#selection_feedback').textContent.startsWith('Selected area:'));
    assert.equal(await offline.locator('#checks .check').count(),7);assert.match(await offline.locator('#summary').innerText(),/crop decode not tested/);
    assert.equal(await offline.locator('#export').isEnabled(),true);
    await offline.click('#manual_decode');await offline.waitForFunction(()=>document.querySelector('#manual_decode_result').textContent.includes('unavailable'));
    assert.equal(await offline.locator('#checks .check').count(),7);await offline.close();
    console.log('SDK unavailable: manual analysis, export and graceful crop retry error passed');
    assert.deepEqual(errors,[]);assert.deepEqual(trackingRequests,[]);assert.equal(await page.evaluate(()=>typeof window.DemoAnalytics),'undefined');console.log('No Google Tag Manager or analytics requests across analyzer and tuner');console.log('PASS: all samples, selection, one-shot handoff, invalid file, blank image, report, mobile layout, camera and no page errors');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
