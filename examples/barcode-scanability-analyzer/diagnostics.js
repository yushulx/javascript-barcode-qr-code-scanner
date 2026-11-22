/* Heuristic image preflight. No ISO grades and no inferred causes presented as facts. */
(function (root) {
  'use strict';
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Measure strong monotonic brightness transitions along source-pixel profiles.
  // Broad transitions can come from blur OR gradual shading. Neither cause is proven.
  function edgeTransitions(sample, width, height) {
    function axis(length, horizontal) {
      const widths = [];
      const steps = Math.min(4096, Math.max(2, Math.round(length)));
      const spacing = length / (steps - 1);
      let energy = 0;
      for (let line = 1; line <= 9; line++) {
        const values = Array.from({length:steps}, (_, i) => horizontal ? sample(i/(steps-1),line/10) : sample(line/10,i/(steps-1)));
        let run = [], sign = 0;
        function finish() {
          const change = run.reduce((sum,d) => sum + d, 0);
          if (change >= 40 && run.length) {
            let sum=0, lo=null, hi=null;
            for (let i=0;i<run.length;i++) {
              const before=sum;sum+=run[i];
              if (lo===null && sum>=change*.1)lo=i+(change*.1-before)/run[i];
              if (hi===null && sum>=change*.9)hi=i+(change*.9-before)/run[i];
            }
            widths.push((hi-lo)*spacing);
          }
          run=[];sign=0;
        }
        for (let i=1;i<values.length;i++) {
          if(values[i]===null||values[i-1]===null){finish();continue;}
          const d=values[i]-values[i-1];energy+=Math.abs(d);
          if(Math.abs(d)<2){finish();continue;}
          if(sign && Math.sign(d)!==sign)finish();
          sign=Math.sign(d);run.push(Math.abs(d));
        }
        finish();
      }
      widths.sort((a,b)=>a-b);
      return {width:widths.length?widths[Math.floor(widths.length/2)]:null,count:widths.length,energy,sampled:spacing>1.5};
    }
    const x=axis(width,true),y=axis(height,false);
    return x.energy>=y.energy?x:y;
  }
  function inspect(image, item, count) {
    const checks = [], recommendations = new Set(), findings = [];
    const manual = !!item?.manual;
    const impacts = {
      'Region size':'Very few source pixels leave little detail for the reader to separate bars or modules.',
      'Module size':'Thin bars or modules have too few pixels to survive defocus, movement or image compression.',
      'Contrast':'The dark and light parts are too similar in this region. This can make binarization and symbol localization harder.',
      'Dark capture':'Even the lighter parts of this selection are dark. Dim lighting can also increase noise and camera motion exposure.',
      'Edge transitions':'Broad brightness transitions may make neighboring bars or modules blend together. Blur and gradual shading can both produce this cue.',
      'Perspective':'Unequal opposite edges suggest deformation that can change the apparent spacing of bars or modules.',
      'Partial crop':'The region is close to the image boundary. Missing symbol content or margin can prevent a read.',
      'Quiet zone':'Nearby dark content may interfere with finding the boundary of the symbol.',
      'Selection boundary':'Dark detail reaches the edge of your box. The selection may exclude part of the symbol or its clear margin.',
      'Neighbors':'Other regions may distract localization when the task is to read one barcode.'
    };
    function add(label, level, value, note, action) {
      checks.push({ label, level, value, note });
      if (action && level === 'warn') {
        recommendations.add(action);
        findings.push({label,evidence:value,impact:impacts[label]||note,action});
      }
    }
    const p = item && item.location && item.location.points;
    if (!p || p.length !== 4 || p.some(q => !Number.isFinite(q.x) || !Number.isFinite(q.y))) {
      add('Region', 'inconclusive', 'No confirmed geometry', 'Region-specific measurements need a localized barcode. This is not proof that the image contains no barcode.');
      recommendations.add('Capture the complete barcode closer, in focus, with even lighting and a visible margin.');
      recommendations.add('Draw a region around the unreadable barcode to analyze its pixels without SDK localization.');
      return { checks, findings, recommendations: [...recommendations] };
    }
    const sides = p.map((q, i) => distance(q, p[(i + 1) % 4]));
    const width = (sides[0] + sides[2]) / 2, height = (sides[1] + sides[3]) / 2;
    const module = Number(item.moduleSize);
    add('Region size', Math.min(width, height) < 24 ? 'warn' : 'measured', `${Math.round(width)} × ${Math.round(height)} px`, 'Approximate edge lengths in the source image. Size alone does not establish scanability.', 'Capture closer or increase resolution. Avoid enlarging an already undersampled image.');
    if(!manual||module>0)add('Module size', module > 0 ? (module < 2 ? 'warn' : 'measured') : 'inconclusive', module > 0 ? `~${module.toFixed(2)} px/module` : 'Unknown without a localized or decoded symbol', 'SDK estimate; below 2 px/module can be fragile. A selection box alone cannot establish the module grid.', 'Capture closer or increase resolution. Avoid enlarging an already undersampled image.');
    const angle = Number.isFinite(item.angle) ? item.angle : Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180 / Math.PI;
    if(!manual||Number.isFinite(item.angle))add('Rotation','measured',`${angle.toFixed(1)}°`, 'A selection box does not establish symbol orientation. SDK angles, when available, are measurements rather than a failure verdict.');
    const skew = Math.max(Math.abs(sides[0] - sides[2]) / Math.max(sides[0], sides[2], 1), Math.abs(sides[1] - sides[3]) / Math.max(sides[1], sides[3], 1));
    if(!manual)add('Perspective',skew > .2 ? 'warn' : 'measured',`${Math.round(skew * 100)}% opposite-edge mismatch`, 'Over 20% raises a warning. A smaller mismatch does not rule out perspective distortion; this is a geometry cue, not a calibrated camera measurement.', 'Face the camera squarely toward the label; test deformation resistance in Parameter Tuner.');
    const edge = Math.min(...p.map(q => Math.min(q.x, q.y, image.width - 1 - q.x, image.height - 1 - q.y)));
    add('Partial crop', edge < Math.max(3, module > 0 ? module * 2 : 3) ? 'warn' : 'measured', edge < 3 ? 'Region touches image edge' : `Nearest image edge: ${Math.max(0,Math.round(edge))} px`, manual?'Distance from your selection to the image boundary. A box touching the image edge does not prove the barcode is cropped; inspect whether all symbol content and margins are present.':'Only the distance to the image boundary is checked. A region away from the edge may still contain missing or covered modules.', 'Reframe to include the full barcode and clear space around it.');

    // Bilinear quadrilateral sampling preserves source-pixel spacing where practical.
    // It is not a projective rectification; geometry and threshold caveats are visible.
    const w = Math.max(3, Math.min(600, Math.round(width))), h = Math.max(3, Math.min(600, Math.round(height)));
    function at(u, v) {
      // A user's rectangle uses outer pixel bounds, so sample through the last
      // included pixel rather than reading one row/column outside the selection.
      if(manual){u*=1-1/width;v*=1-1/height;}
      const x = (1-v)*((1-u)*p[0].x+u*p[1].x)+v*((1-u)*p[3].x+u*p[2].x);
      const y = (1-v)*((1-u)*p[0].y+u*p[1].y)+v*((1-u)*p[3].y+u*p[2].y);
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
      const k = (Math.floor(y+1e-7) * image.width + Math.floor(x+1e-7)) * 4;
      return .299*image.data[k]+.587*image.data[k+1]+.114*image.data[k+2];
    }
    const pixels = new Float32Array(w*h), hist = new Uint32Array(256);
    for (let y=0;y<h;y++) for(let x=0;x<w;x++) { const g=at(x/(w-1),y/(h-1)) ?? 255; pixels[y*w+x]=g; hist[Math.round(g)]++; }
    function percentile(q) { let total=0; for(let i=0;i<256;i++){total+=hist[i];if(total>=w*h*q)return i;}return 255; }
    const dark=percentile(.1), light=percentile(.9), contrast=light-dark;
    add('Contrast', contrast < 70 ? 'warn' : 'measured', `${Math.round(contrast)} / 255 grayscale range`, contrast<70?'The overall brightness range is below the 70/255 preflight cue. This may make dark/light separation harder.':'This is only the overall brightness range (10th–90th percentiles). Black and white pixels somewhere in the box can give a high value even if glare, local fading or damage makes part of the barcode unreadable. It is not a pass for contrast or scanability.', 'Use even diffuse lighting and reduce shadows; test grayscale enhancement in Parameter Tuner.');
    add('Dark capture', light<100?'warn':'measured', `Lighter-region brightness: ${light} / 255`, '90th percentile of grayscale brightness. Below 100 raises a dim-image cue; dark material can produce the same measurement.', 'Increase diffuse lighting, reduce shadows and recapture without digital brightening alone.');
    let gx=0,gy=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x, dx=Math.abs(pixels[i+1]-pixels[i-1])/2, dy=Math.abs(pixels[i+w]-pixels[i-w])/2;
      gx+=dx;gy+=dy;
    }
    const n=(w-2)*(h-2), strength=(gx+gy)/n/Math.max(contrast,1);
    const transitions=edgeTransitions(at,width,height);
    const enoughEdges=transitions.count>=8&&!transitions.sampled;
    add('Edge transitions', enoughEdges?(transitions.width>3?'warn':'measured'):'inconclusive', transitions.width===null?'No strong transitions to measure':`~${transitions.width.toFixed(1)} px transition width · ${transitions.count} sampled edges`, 'Image-only measurement, independent of decoding. With at least 8 strong edges, a median 10–90% transition wider than 3 px raises a softness cue. Shading and symbol structure can also affect it; very small modules may be lost without producing this cue.', 'Refocus, hold the camera steady and compare with a sharper capture. Check for shadows before attributing this cue to blur.');
    add('Edge strength', 'measured', `Normalized gradient: ${strength.toFixed(3)}`, 'Brightness changes within the region; this is not a blur verdict. Flat backgrounds, low contrast and symbol density affect the value.');

    // Sample exterior strips in symbol coordinates, not an axis-aligned bounding box.
    // Quiet-zone requirements vary by symbology; report margin interference, not compliance.
    const marginPx = manual?Math.max(2,Math.min(16,Math.min(width,height)*.08)):Math.max(4, module>0 ? module*4 : 4), du=marginPx/Math.max(width,1), dv=marginPx/Math.max(height,1);
    let outside=0,total=0,ink=0;
    for(let side=0;side<4;side++)for(let t=0;t<80;t++)for(let band=1;band<=4;band++){
      const along=t/79, offset=band/4;
      const g=manual?(side===0?at(along,dv*offset):side===1?at(1-du*offset,along):side===2?at(along,1-dv*offset):at(du*offset,along)):(side===0?at(along,-dv*offset):side===1?at(1+du*offset,along):side===2?at(along,1+dv*offset):at(-du*offset,along));
      total++;if(g===null)outside++;else if(g<(dark+light)/2)ink++;
    }
    const clutter=ink/Math.max(1,total-outside);
    if(manual){
      add('Selection boundary', contrast>=70&&clutter>.2?'warn':'measured', `${Math.round(clutter*100)}% dark pixels in the inner ~${Math.round(marginPx)} px border`, 'Over 20% with sufficient contrast raises a selection/margin cue. It may also be dark background or nearby text. Adjust the box to include the entire symbol and some clear space; this is not a format-specific quiet-zone check.', 'Widen or reposition the selection to include the full symbol and its clear margin. If the image itself is cropped, capture again.');
    }else{
      add('Quiet zone', outside>0 || clutter>.15 ? 'warn':'measured', outside>0?'Some surrounding margin is outside the image':`${Math.round(clutter*100)}% dark pixels in a ~${Math.round(marginPx)} px surrounding band`, 'A clipped margin or more than 15% dark pixels raises a possible-interference warning. This does not verify format-specific quiet-zone compliance; inversion and nearby text can affect it.', 'Leave clear space around the barcode; remove nearby text or borders and include the margin in the capture.');
    }
    if(!manual)add('Neighbors',count>1?'warn':'measured',`${count} decoded regions / unconfirmed candidates in this image`, 'Multiple regions may need a tighter scan area if you intend to read one barcode. Unconfirmed candidates can be false positives; this is not ground-truth symbol count.', 'Use a tighter region of interest if you intend to read just one barcode.');
    if(manual)recommendations.add('Try decoding the selected area. A crop retry tests whether restricting the scan area changes the result; it does not prove a cause.');
    if (!item.decoded) recommendations.add('Check that the full barcode is visible and its format is supported, then test localization, deblur and deformation settings in Parameter Tuner.');
    if(!recommendations.size) recommendations.add('No strong image warning was found. Missing content, damage, unsupported formats or reader settings may still prevent a read.');
    return { checks, findings, recommendations:[...recommendations] };
  }
  const api={inspect}; if(typeof module==='object'&&module.exports)module.exports=api;else root.ScanabilityDiagnostics=api;
})(typeof window==='object'?window:globalThis);
