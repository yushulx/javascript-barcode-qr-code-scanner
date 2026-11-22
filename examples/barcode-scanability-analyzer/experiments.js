/* Explicit one-change-at-a-time image tests. Success supplies a clue, not a cause. */
(function (root) {
  'use strict';
  const tests = [
    { id: 'original', label: 'Original selected area', explanation: 'Unmodified crop at source resolution. This is the baseline.' },
    { id: 'invert', label: 'Invert colors', explanation: 'Only pixel polarity changes. A different result is a reason to test inversion settings.' },
    { id: 'stretch', label: 'Stretch grayscale range', explanation: 'Convert to grayscale and stretch the 2nd–98th percentile range. If this helps, investigate grayscale enhancement and lighting.' },
    { id: 'rotate', label: 'Rotate 90°', explanation: 'A quarter turn preserves source pixels. If this helps, investigate localization/orientation behavior; it does not establish perspective distortion.' },
    { id: 'scale', label: 'Enlarge 2×', explanation: 'Nearest-neighbor resampling changes scale without adding captured detail. If this helps, test scale/localization settings; capture closer for real detail.' }
  ];
  function variant(source, id) {
    if (id === 'scale' && source.width * source.height * 4 > 8000000) return { skipped: '2× enlargement would exceed the 8-megapixel test limit.' };
    const canvas = document.createElement('canvas');
    canvas.width = id === 'rotate' ? source.height : source.width * (id === 'scale' ? 2 : 1);
    canvas.height = id === 'rotate' ? source.width : source.height * (id === 'scale' ? 2 : 1);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    if (id === 'rotate') { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(source, 0, 0); }
    else ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (id === 'invert' || id === 'stretch') {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (id === 'invert') {
        for (let i = 0; i < data.data.length; i += 4) for (let c = 0; c < 3; c++) data.data[i+c] = 255 - data.data[i+c];
      } else {
        const hist = new Uint32Array(256);
        for (let i = 0; i < data.data.length; i += 4) hist[Math.round(.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2])]++;
        function quantile(q) { let n=0; for(let i=0;i<256;i++){n+=hist[i];if(n>=canvas.width*canvas.height*q)return i;}return 255; }
        const low=quantile(.02), high=quantile(.98);
        if (high <= low) return { skipped: 'The selected area has no percentile brightness range to stretch.' };
        for (let i = 0; i < data.data.length; i += 4) {
          const g=(.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2]-low)*255/(high-low);
          data.data[i]=data.data[i+1]=data.data[i+2]=g;
        }
      }
      ctx.putImageData(data, 0, 0);
    }
    return { canvas };
  }
  function summarize(results) {
    const baseline=results.find(r=>r.id==='original');
    if (!baseline || baseline.state !== 'complete') return 'The original-area baseline is unavailable. These results cannot establish whether a change helped.';
    if (baseline.count > 0) return 'The unmodified selected area already decodes. These tests do not explain a decoding failure in this area. Confirm that the decoded text is the intended barcode.';
    const improved=results.filter(r=>r.id!=='original'&&r.state==='complete'&&r.count>0);
    if (improved.length) return 'The original area did not decode; '+improved.map(r=>r.label).join(', ')+' produced a decode. This change helped this reader on this image. Confirm the text and test more captures before attributing a cause.';
    const incomplete=results.filter(r=>r.state!=='complete').length;
    return 'No completed test decoded a barcode. The failure cause remains unexplained; brightness measurements do not establish good barcode quality. Inspect missing/damaged content, format support and reader settings.'+(incomplete?' '+incomplete+' test(s) were unavailable or skipped.':'');
  }
  const api={tests,variant,summarize};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ScanabilityExperiments=api;
})(typeof window==='object'?window:globalThis);
