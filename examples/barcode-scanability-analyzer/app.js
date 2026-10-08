(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  // Identical to Barcode Parameter Tuner and the other hosted CodePool demos.
  const CODEPOOL_LICENSE_KEY='DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
  const TRIAL_LICENSE_KEY='DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';
  let router, enginePromise, sdkPromise, source, sourceName='', sourceType='sample', stream, busy=false, revision=0, candidates=[], regions=[], reports=[], lastRun=null;
  let autoRegions=[], autoReports=[], emptyReport, manualSelection=null, selectionVersion=0, drawing=false, drag=null;
  let fullDecodeState='not_tested', fullDuration=null;
  function status(text){$('status').textContent=text;}
  function controls(){ $('analyze').disabled=!source||busy; $('sample').disabled=busy; $('upload').disabled=busy; $('camera').disabled=busy; $('shoot').disabled=busy; $('region').disabled=!regions.length; $('tuner').disabled=busy||!source; $('export').disabled=!lastRun; $('manual_toggle').disabled=!source; $('manual_clear').disabled=!manualSelection; $('manual_decode').disabled=busy||!manualSelection; $('compare').disabled=busy||!manualSelection; }
  function error(e){status((e && (e.message||e.errorString))||String(e));}
  // Loading the reader must not block the image-only tools from initializing.
  function loadReader(){
    if(window.Dynamsoft)return Promise.resolve();
    if(sdkPromise)return sdkPromise;
    const script=document.createElement('script');
    sdkPromise=new Promise((resolve,reject)=>{
      script.async=true;script.src='https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@11.6.3200/dist/dbr.bundle.js';
      script.onload=()=>window.Dynamsoft?resolve():reject(new Error('Barcode Reader did not initialize. Image-only analysis is available.'));
      script.onerror=()=>reject(new Error('Barcode Reader could not load. Check your network and retry Analyze image.'));
      document.head.append(script);
    }).catch(e=>{script.remove();sdkPromise=null;throw e;});
    return sdkPromise;
  }
  async function engine(){
    if(enginePromise)return enginePromise;
    enginePromise=(async()=>{
      await loadReader();
      if(!window.isSecureContext)throw new Error('Use HTTPS or localhost to activate the SDK trial license and access the camera.');
      const host=location.hostname.toLowerCase(), bound=host==='dynamsoft.com'||host.endsWith('.dynamsoft.com');
      let custom;try{custom=new URLSearchParams(location.search).get('license')||localStorage.getItem('dy-demo-license');}catch(_){}
      const key=custom||(bound?CODEPOOL_LICENSE_KEY:TRIAL_LICENSE_KEY);
      Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory='https://cdn.jsdelivr.net/npm/';
      await Dynamsoft.License.LicenseManager.initLicense(key,true);
      await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
      router=await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
      const receiver=new Dynamsoft.CVR.IntermediateResultReceiver();
      receiver.onLocalizedBarcodesReceived=unit=>{candidates.push(...(unit.localizedBarcodes||[]));};
      await router.getIntermediateResultManager().addResultReceiver(receiver);

      return router;
    })().catch(e=>{enginePromise=null;throw e;});
    return enginePromise;
  }
  function node(tag,text,className){const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;}
  function draw(){
    if(!source)return;const c=$('preview');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);
    const selected=Number($('region').value)||0;
    regions.forEach((item,i)=>{const p=item.location?.points;if(!p?.length)return;ctx.strokeStyle=item.manual?'#1676a3':item.decoded?'#238447':'#e07d0b';ctx.lineWidth=Math.max(2,source.width/500)*(i===selected?2:1);ctx.beginPath();p.forEach((q,j)=>j?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.stroke();ctx.font=`bold ${Math.max(16,source.width/50)}px sans-serif`;ctx.fillStyle=ctx.strokeStyle;ctx.fillText(item.manual?'Your selection':String(i+1),p[0].x,Math.max(22,p[0].y-6));});
    if(drag){ctx.strokeStyle='#1676a3';ctx.lineWidth=Math.max(2,source.width/400);ctx.setLineDash([ctx.lineWidth*3,ctx.lineWidth*2]);ctx.strokeRect(drag.start.x,drag.start.y,drag.end.x-drag.start.x,drag.end.y-drag.start.y);ctx.setLineDash([]);}
  }
  function render(){
    draw();const i=Number($('region').value)||0, item=regions[i], report=reports[i]||emptyReport;
    $('checks').replaceChildren();$('symbol_checks').replaceChildren();$('symbol_details').hidden=true;$('recommendations').replaceChildren();$('payload').hidden=!item?.decoded;
    if(item?.decoded)$('payload').textContent=`Decoded text:\n${item.manual?item.cropRetry.texts.join('\n'):item.text}`;
    if(!report)return;
    if(item?.manual){
      $('summary').textContent=`Your selected area — ${item.cropRetry?.state==='success'?'crop decode succeeded ('+item.cropRetry.formats.join(', ')+')':item.cropRetry?.state==='failed'?'crop decode failed':item.cropRetry?.state==='error'?'crop decoder unavailable':'crop decode not tested'}. These image measurements do not require the SDK to find or decode a barcode. Format and module size remain unknown unless the crop decoder reports them.`;
    }else{
      $('summary').textContent=item?`${item.decoded?'Decoded barcode':'Unconfirmed barcode candidate'}: ${item.formatString||item.possibleFormatsString||'Unknown format'}. ${item.decoded?'A successful decode does not guarantee reliable scanning across devices.':'Localization is a hypothesis; decode failed for this region under default settings.'}`:'No barcode was decoded or localized. Draw a region around the unreadable barcode to analyze its pixels independently of the reader.';
    }
    renderFindings(item,report);
    renderComparisons(item);
    const statuses={warn:{label:'Potential issue',icon:'⚠'},measured:{label:'Measurement only'},inconclusive:{label:'Inconclusive'}};
    report.checks.forEach(check=>{
      const state=statuses[check.level], row=node('div','','check '+check.level);
      const heading=node('div','','check-heading');heading.append(node('strong',check.label));
      const badge=node('span','','check-badge '+check.level);
      if(state.icon){const icon=node('span',state.icon+' ');icon.setAttribute('aria-hidden','true');badge.append(icon);}
      badge.append(document.createTextNode(state.label));heading.append(badge);row.append(heading);
      const body=node('p',check.value);body.append(node('small',check.note));row.append(body);
      const symbolOnly=item?.manual&&['Module size','Rotation'].includes(check.label);
      $(symbolOnly?'symbol_checks':'checks').append(row);
    });
    $('symbol_details').hidden=!$('symbol_checks').children.length;
    report.recommendations.forEach(text=>$('recommendations').append(node('li',text)));$('actions').hidden=false;
  }
  function renderFindings(item,report){
    $('findings').hidden=false;$('finding_cards').replaceChildren();
    $('findings_title').textContent='Image observations';
    $('findings_intro').textContent=report.findings?.length?'These measurements flag possible capture risks, not proven failure causes. Use the decoding comparisons to test whether a change affects the reader.':item?'These image measurements did not establish a reason for decoding failure. Run decoding comparisons for further evidence. Damage, glare and other failure modes are not automatically diagnosed by this tool.':'Mark the expected barcode first. The reader may fail to locate it, but a selected area can still be measured and tested.';
    (report.findings||[]).forEach(f=>{const card=node('div','','finding-card');card.append(node('strong',f.label),node('p',f.evidence,'finding-evidence'),node('p',f.impact));const next=node('p','','finding-action');next.append(node('strong','Try: '),document.createTextNode(f.action));card.append(next);$('finding_cards').append(card);});
  }
  function recordReport(){
    lastRun={name:sourceName,image:{width:source.width,height:source.height},template:'ReadBarcodes_Default',fullImageDecodeState:fullDecodeState,durationMs:fullDuration,decodedCount:fullDecodeState==='complete'?autoRegions.filter(r=>r.decoded).length:null,regions:regions.map((r,i)=>({source:r.manual?'user_selection':'sdk',format:r.formatString||r.possibleFormatsString||'Unknown',decoded:r.manual?(r.cropRetry?.state==='success'?true:r.cropRetry?.state==='failed'?false:null):r.decoded,text:r.decoded?(r.manual?r.cropRetry.texts:r.text):null,cropRetry:r.cropRetry||null,comparisons:(r.comparisons||[]).map(({preview,...result})=>result),points:r.location?.points,report:reports[i]})),imageReport:regions.length?null:emptyReport,notice:'Heuristic image evidence and possible factors, not a diagnosis of a proven cause or an ISO verification grade.'};
  }
  function rebuild(selectManual=false){
    const pixels=source.getContext('2d').getImageData(0,0,source.width,source.height);
    regions=[...autoRegions];reports=[...autoReports];
    if(manualSelection){regions.push(manualSelection);reports.push(ScanabilityDiagnostics.inspect(pixels,manualSelection,null));}
    $('region').replaceChildren();
    regions.forEach((x,i)=>{const text=x.manual?'Your selection — image analysis':`${i+1}. ${x.formatString||x.possibleFormatsString||'Unknown'} — ${x.decoded?'decoded':'unconfirmed'}`;const option=node('option',text);option.value=i;$('region').append(option);});
    if(!regions.length)$('region').append(node('option','No localized region — draw your own'));
    if(selectManual&&manualSelection)$('region').value=String(regions.length-1);
    const decoded=autoRegions.filter(x=>x.decoded).length;
    $('outcome').textContent=fullDecodeState==='complete'?`${decoded} decoded · ${autoRegions.length-decoded} unconfirmed${manualSelection?' · manual selection':''}`:manualSelection?'Image-only region analysis':fullDecodeState==='error'?'Reader unavailable':'Ready to analyze';
    recordReport();render();controls();
  }
  function overlaps(a,b){
    const box=x=>{const p=x.location?.points;if(!p?.length)return null;return {l:Math.min(...p.map(q=>q.x)),r:Math.max(...p.map(q=>q.x)),t:Math.min(...p.map(q=>q.y)),b:Math.max(...p.map(q=>q.y))};};
    const x=box(a),y=box(b);if(!x||!y)return false;
    const intersection=Math.max(0,Math.min(x.r,y.r)-Math.max(x.l,y.l))*Math.max(0,Math.min(x.b,y.b)-Math.max(x.t,y.t));
    return intersection/Math.max(1,Math.min((x.r-x.l)*(x.b-x.t),(y.r-y.l)*(y.b-y.t)))>.65;
  }
  async function analyze(){
    if(!source||busy)return;busy=true;controls();status('Loading reader and analyzing image…');const start=performance.now();
    try{
      const cvr=await engine();candidates=[];
      const data=source.getContext('2d').getImageData(0,0,source.width,source.height);
      const result=await cvr.capture({bytes:new Uint8Array(data.data),width:data.width,height:data.height,stride:data.width*4,format:10},'ReadBarcodes_Default');
      if(result.errorCode)throw new Error(`Reader error ${result.errorCode}: ${result.errorString||'Analysis failed'}`);
      const decoded=(result.items||[]).filter(x=>x.type===2).map(x=>({...x,decoded:true}));
      autoRegions=[...decoded];candidates.forEach(x=>{if(!autoRegions.some(y=>overlaps(x,y)))autoRegions.push({...x,decoded:false});});
      // Use a fresh buffer: capture can transfer/detach the SDK input buffer.
      const pixels=source.getContext('2d').getImageData(0,0,source.width,source.height);
      autoReports=autoRegions.map(item=>ScanabilityDiagnostics.inspect(pixels,item,autoRegions.length));
      fullDecodeState='complete';fullDuration=Math.round(performance.now()-start);rebuild(!!manualSelection);
      status(`Analysis complete in ${fullDuration} ms.${decoded.length?'':' No decode? Draw a region to inspect the image.'} Measurements refer to the original image.`);
    }catch(e){fullDecodeState='error';fullDuration=null;autoRegions=[];autoReports=[];rebuild(!!manualSelection);status('Reader unavailable. You can still draw a region for image analysis. '+((e&&e.message)||String(e)));}finally{busy=false;controls();}
  }
  function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('video').hidden=true;$('shoot').hidden=true;$('camera').textContent='Use camera';}
  function setSource(canvas,name,type){
    source=canvas;sourceName=name;sourceType=type;autoRegions=[];autoReports=[];regions=[];reports=[];lastRun=null;manualSelection=null;selectionVersion++;drag=null;fullDecodeState='not_tested';fullDuration=null;
    $('selection_feedback').textContent='Draw a region, or edit its coordinates. Image measurements update when you leave a field.';$('selection_feedback').classList.remove('error');$('comparison').hidden=true;
    setDrawing(false);$('selection_form').hidden=true;
    emptyReport=ScanabilityDiagnostics.inspect({width:canvas.width,height:canvas.height},null,0);
    $('region').replaceChildren(node('option','No analysis yet'));$('meta').textContent=`${name} · ${canvas.width} × ${canvas.height} px`;$('checks').replaceChildren();$('symbol_checks').replaceChildren();$('symbol_details').hidden=true;$('symbol_details').open=false;$('actions').hidden=true;$('payload').hidden=true;$('findings').hidden=true;$('summary').textContent='Run an analysis, or draw a region to inspect its pixels immediately.';$('outcome').textContent='Ready to analyze';draw();controls();status('Image ready.');
  }
  function setDrawing(on){
    drawing=on;$('manual_toggle').setAttribute('aria-pressed',String(on));$('manual_toggle').textContent=on?'Cancel drawing':'Draw a region';$('drop').classList.toggle('selecting',on);
    $('selection_hint').textContent=on?'Drag across the image to include the entire barcode and a small clear margin. You can also enter pixel coordinates below.':'If the barcode is unreadable or missing from the detected regions, draw a box around the whole symbol with a small clear margin. Image analysis does not require a successful decode.';
    $('selection_form').hidden=!on&&!manualSelection;
    if(on&&!manualSelection&&source){fillCoordinates({x:0,y:0,width:source.width,height:source.height});}
  }
  function fillCoordinates(rect){['x','y'].forEach(k=>{$('selection_'+k).value=rect[k];});$('selection_w').value=rect.width;$('selection_h').value=rect.height;}
  function selectRectangle(rect){
    if(!source)return false;
    ['x','y','w','h'].forEach(k=>$('selection_'+k).removeAttribute('aria-invalid'));
    let message='';
    if(![rect.x,rect.y,rect.width,rect.height].every(Number.isInteger))message='Enter a whole number in each coordinate field.';
    else if(rect.x<0||rect.y<0||rect.width<8||rect.height<8)message='X and Y must be non-negative; width and height must be at least 8 pixels.';
    else if(rect.x+rect.width>source.width||rect.y+rect.height>source.height)message=`This region extends outside the ${source.width} × ${source.height} px image. Reduce its position or size.`;
    if(message){$('selection_feedback').textContent=message;$('selection_feedback').classList.add('error');['x','y','w','h'].forEach(k=>$('selection_'+k).setAttribute('aria-invalid','true'));status(message);return false;}
    const unchanged=manualSelection&&['x','y','width','height'].every(k=>manualSelection.rect[k]===rect[k]);
    const previous=unchanged?manualSelection:null;
    if(!unchanged)selectionVersion++;
    manualSelection=previous||{manual:true,decoded:false,rect,location:{points:[{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y},{x:rect.x+rect.width,y:rect.y+rect.height},{x:rect.x,y:rect.y+rect.height}]},cropRetry:{state:'not_tested'}};
    fillCoordinates(rect);setDrawing(false);if(!unchanged)$('manual_decode_result').textContent='Image analysis is ready. Crop decoding has not been tested.';rebuild(true);
    $('selection_feedback').classList.remove('error');$('selection_feedback').textContent=`Selected area: (${rect.x}, ${rect.y}), ${rect.width} × ${rect.height} px. The blue box and image measurements are updated. Use the decoding buttons below to test this area.`;
    status('Selected region analyzed from image pixels. No successful SDK decode is required.');
    return true;
  }
  function imagePoint(event){const box=$('preview').getBoundingClientRect();return {x:Math.round(Math.max(0,Math.min(source.width,(event.clientX-box.left)*source.width/box.width))),y:Math.round(Math.max(0,Math.min(source.height,(event.clientY-box.top)*source.height/box.height)))};}
  $('manual_toggle').addEventListener('click',()=>setDrawing(!drawing));
  $('manual_clear').addEventListener('click',()=>{manualSelection=null;selectionVersion++;drag=null;setDrawing(false);rebuild();status('Manual selection cleared.');});
  function updateCoordinates(){
    const value=id=>$(id).value.trim()===''?NaN:Number($(id).value);
    const rect={x:value('selection_x'),y:value('selection_y'),width:value('selection_w'),height:value('selection_h')};
    try{selectRectangle(rect);}catch(e){$('selection_feedback').textContent='Region analysis could not finish: '+((e&&e.message)||String(e));$('selection_feedback').classList.add('error');}
  }
  ['x','y','w','h'].forEach(key=>{
    const input=$('selection_'+key);
    input.addEventListener('change',updateCoordinates);
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}});
  });
  $('preview').addEventListener('pointerdown',event=>{
    if(!drawing||!source||event.button!==0)return;event.preventDefault();const point=imagePoint(event);drag={id:event.pointerId,start:point,end:point};$('preview').setPointerCapture(event.pointerId);draw();
  });
  $('preview').addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();drag.end=imagePoint(event);draw();});
  $('preview').addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.id)return;const end=imagePoint(event),start=drag.start;drag=null;if($('preview').hasPointerCapture(event.pointerId))$('preview').releasePointerCapture(event.pointerId);
    selectRectangle({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)});draw();
  });
  $('preview').addEventListener('pointercancel',()=>{drag=null;draw();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawing){drag=null;setDrawing(false);draw();}});
  async function decodeSelection(){
    if(!manualSelection||busy)return;
    const selected=manualSelection, version=selectionVersion, rect=selected.rect;
    busy=true;controls();$('manual_decode_result').textContent='Trying the selected area with default reader settings…';
    try{
      const cvr=await engine(), crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;
      const ctx=crop.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
      const data=ctx.getImageData(0,0,rect.width,rect.height),start=performance.now();
      const result=await cvr.capture({bytes:new Uint8Array(data.data),width:data.width,height:data.height,stride:data.width*4,format:10},'ReadBarcodes_Default');
      if(result.errorCode)throw new Error(result.errorString||'Crop decoding failed to execute.');
      if(version!==selectionVersion)return;
      const found=(result.items||[]).filter(x=>x.type===2);
      delete selected.moduleSize;delete selected.angle;delete selected.formatString;
      selected.decoded=found.length>0;selected.cropRetry={state:found.length?'success':'failed',count:found.length,texts:found.map(x=>x.text),formats:found.map(x=>x.formatString),durationMs:Math.round(performance.now()-start)};
      if(found.length===1){selected.moduleSize=found[0].moduleSize;selected.angle=found[0].angle;selected.formatString=found[0].formatString;}
      $('manual_decode_result').textContent=found.length?`${found.length} barcode(s) decoded in the selected area.${fullDecodeState==='complete'&&!autoRegions.some(r=>r.decoded)?' The full image did not decode; restricting the scan area changed the result. This does not prove which factor caused the original failure.':''}`:'The selected area also failed to decode under default settings. The image evidence below remains available; failure alone does not identify a cause.';
      rebuild(true);status('Selected-area decode test complete. Compare its result with the image evidence.');
    }catch(e){if(version===selectionVersion){selected.decoded=false;selected.cropRetry={state:'error',message:(e&&e.message)||String(e)};$('manual_decode_result').textContent='Crop decoder unavailable. Image analysis still works independently.';rebuild(true);status('Image analysis remains available. '+((e&&e.message)||String(e)));}}
    finally{busy=false;controls();}
  }
  $('manual_decode').addEventListener('click',decodeSelection);
  function cropSelection(rect){
    const c=document.createElement('canvas');c.width=rect.width;c.height=rect.height;
    c.getContext('2d',{willReadFrequently:true}).drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
    return c;
  }
  function renderComparisons(item){
    const results=item?.comparisons;
    $('comparison').hidden=!results;
    $('comparison_results').replaceChildren();
    if(!results)return;
    $('comparison_status').textContent=item.comparing?'Running controlled tests… '+results.length+' / '+ScanabilityExperiments.tests.length+' recorded.':ScanabilityExperiments.summarize(results);
    results.forEach(r=>{
      const row=node('div','','experiment');row.append(node('strong',r.label));
      row.append(node('p',r.state==='complete'?`${r.count} decoded · ${r.durationMs} ms · ${r.width} × ${r.height} px`:r.state==='skipped'?'Skipped: '+r.message:'Unavailable: '+r.message));
      if(r.preview){const img=document.createElement('img');img.src=r.preview;img.alt=r.label+' test image';row.append(img);}
      row.append(node('p',r.explanation));
      if(r.texts?.length)row.append(node('pre',r.texts.map((t,i)=>`${r.formats[i]}: ${t}`).join('\n')));
      $('comparison_results').append(row);
    });
  }
  async function compareSelection(){
    if(!manualSelection||busy)return;
    const selected=manualSelection,version=selectionVersion,crop=cropSelection(selected.rect);
    selected.comparisons=[];selected.comparing=true;busy=true;controls();renderComparisons(selected);
    try{
      const cvr=await engine();
      for(const test of ScanabilityExperiments.tests){
        if(version!==selectionVersion)break;
        $('comparison_status').textContent='Testing '+test.label+'…';
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const row={...test};
        try{
          const input=ScanabilityExperiments.variant(crop,test.id);
          if(input.skipped){row.state='skipped';row.message=input.skipped;}
          else{
            const canvas=input.canvas,ctx=canvas.getContext('2d'),data=ctx.getImageData(0,0,canvas.width,canvas.height);
            const thumb=document.createElement('canvas');const factor=Math.min(1,240/canvas.width,110/canvas.height);thumb.width=Math.max(1,Math.round(canvas.width*factor));thumb.height=Math.max(1,Math.round(canvas.height*factor));thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);row.preview=thumb.toDataURL('image/png');
            const start=performance.now();
            const result=await cvr.capture({bytes:new Uint8Array(data.data),width:data.width,height:data.height,stride:data.width*4,format:10},'ReadBarcodes_Default');
            if(result.errorCode)throw new Error(result.errorString||'Reader test failed to execute.');
            const found=(result.items||[]).filter(r=>r.type===2);
            Object.assign(row,{state:'complete',count:found.length,texts:found.map(r=>r.text),formats:found.map(r=>r.formatString),durationMs:Math.round(performance.now()-start),width:canvas.width,height:canvas.height});
          }
        }catch(e){row.state='error';row.message=(e&&e.message)||String(e);}
        if(version!==selectionVersion)break;
        selected.comparisons.push(row);renderComparisons(selected);recordReport();
      }
    }catch(e){if(version===selectionVersion)selected.comparisons.push({id:'original',label:'Original selected area',state:'error',message:(e&&e.message)||String(e),explanation:'The reader could not initialize. Image measurements remain available.'});}
    finally{
      selected.comparing=false;busy=false;
      if(version===selectionVersion){renderComparisons(selected);recordReport();status('Decoding comparisons complete. Read the outcomes and confirm any decoded text.');}
      controls();
    }
  }
  $('compare').addEventListener('click',compareSelection);
  async function loadBlob(blob,name,type,token){
    if(token===revision)status('Loading image…');
    if(blob.size>30*1024*1024)throw new Error('Choose an image smaller than 30 MB.');
    const url=URL.createObjectURL(blob), img=new Image();
    try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('This file could not be read. Choose PNG, JPEG, WebP or BMP.'));img.src=url;});if(token!==revision)return;
      if(img.naturalWidth*img.naturalHeight>24000000)throw new Error('Choose an image with no more than 24 megapixels.');
      const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);setSource(c,name,type);await analyze();
    }finally{URL.revokeObjectURL(url);}
  }
  async function sample(){const token=++revision;status('Loading sample…');try{const name=$('sample').value,r=await fetch('parameter-tuner/samples/'+name);if(!r.ok)throw new Error('Sample could not load. Upload your own image or retry.');await loadBlob(await r.blob(),name,'sample',token);}catch(e){if(token===revision)error(e);}}
  async function file(f){if(!f||busy)return;stopCamera();const token=++revision;try{await loadBlob(f,f.name,'image_file',token);}catch(e){if(token===revision)error(e);}}
  $('sample').addEventListener('change',sample);$('upload').addEventListener('change',()=>{file($('upload').files[0]);$('upload').value='';});$('analyze').addEventListener('click',analyze);$('region').addEventListener('change',render);
  ['dragenter','dragover'].forEach(e=>$('drop').addEventListener(e,event=>{event.preventDefault();$('drop').classList.add('dragging');}));$('drop').addEventListener('dragleave',()=>$('drop').classList.remove('dragging'));$('drop').addEventListener('drop',event=>{event.preventDefault();$('drop').classList.remove('dragging');file(event.dataTransfer.files[0]);});
  $('camera').addEventListener('click',async()=>{if(stream){stopCamera();return;}if(!navigator.mediaDevices?.getUserMedia){status('Camera access requires HTTPS or localhost and a supported browser.');return;}$('camera').disabled=true;try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});$('video').srcObject=stream;$('video').hidden=false;await $('video').play();$('shoot').hidden=false;$('camera').textContent='Stop camera';status('Frame the complete barcode with a clear margin, then capture.');}catch(e){stopCamera();status('Camera could not open. Allow camera access or upload an image.');}finally{controls();}});
  $('shoot').addEventListener('click',()=>{const v=$('video');if(!v.videoWidth){status('Wait for the camera image before capturing.');return;}++revision;const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d',{willReadFrequently:true}).drawImage(v,0,0);stopCamera();setSource(c,'Camera frame','camera');analyze();});
  $('tuner').addEventListener('click',async()=>{$('tuner').disabled=true;try{const blob=await new Promise(resolve=>source.toBlob(resolve,'image/png'));if(!blob)throw new Error('Image export failed.');const id=await DemoImageHandoff.put(blob,sourceName);location.href='parameter-tuner/?imageHandoff='+encodeURIComponent(id);}catch(e){status('Image transfer failed. Download or save your source image and upload it in Parameter Tuner.');controls();}});
  $('export').addEventListener('click',()=>{if(!lastRun)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastRun,null,2)],{type:'application/json'}));const a=node('a','');a.href=url;a.download='barcode-scanability-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  window.addEventListener('pagehide',stopCamera);
  sample();
})();
