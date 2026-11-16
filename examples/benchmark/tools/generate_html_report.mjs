/** Generate a self-contained file:// compatible JavaScript benchmark report. */
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const readJsonl = (file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const rows = readJsonl(args.results);
const summary = JSON.parse(fs.readFileSync(args.summary, "utf8"));
const stats = JSON.parse(fs.readFileSync(args.inventory, "utf8")).summary;
const environment = JSON.parse(fs.readFileSync(args.environment, "utf8"));

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STYLE = `
:root{--ink:#172033;--muted:#60708a;--line:#dbe2ea;--bg:#f5f7fa}*{box-sizing:border-box}body{margin:0;font:15px/1.5 Segoe UI,Arial,sans-serif;color:var(--ink);background:var(--bg)}header{padding:52px max(5vw,28px);color:white;background:linear-gradient(120deg,#102649,#1769e0 62%,#00a495)}header h1{margin:0 0 8px;font-size:clamp(30px,5vw,58px);line-height:1.05}.wrap{max-width:1280px;margin:auto;padding:28px}section{background:white;border:1px solid var(--line);border-radius:14px;margin:18px 0;padding:24px;box-shadow:0 3px 18px #1026490c}h2{margin-top:0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.card{border:1px solid var(--line);border-radius:11px;padding:18px}.metric{font-size:32px;font-weight:750}.muted{color:var(--muted)}.disclosure{border-left:5px solid #f0a202;background:#fff8e6;padding:14px 18px}.controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}input,select{padding:9px 11px;border:1px solid #bcc8d8;border-radius:7px;background:white}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:#edf3fa}.scroll{overflow:auto;max-height:650px}.correct{color:#087f5b}.not_found,.wrong_text,.wrong_format{color:#c2410c}.unsupported_format{color:#6d28d9}.decoder_error{color:#b91c1c;font-weight:600}td.mono,th.mono{font-family:Consolas,Menlo,monospace;font-size:12.5px;word-break:break-all}#fail{table-layout:fixed}#fail th:nth-child(1){width:132px}#fail th:nth-child(2){width:186px}#fail th:nth-child(3){width:100px}#fail th:nth-child(4),#fail th:nth-child(5){width:252px}#fail th:nth-child(6){width:118px}#fail th:nth-child(7){width:48px}#fail td:nth-child(2),#fail td:nth-child(4),#fail td:nth-child(5){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tools{display:flex;gap:10px;align-items:center;margin:10px 0}.tools button{padding:8px 12px;border:1px solid #bcc8d8;border-radius:7px;background:white;cursor:pointer}.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:14px 0}@media print{body{background:white}.controls{display:none}section{break-inside:avoid;box-shadow:none}}
`;

const SCRIPT = `
const rows=REPORT_ROWS,body=document.querySelector('#raw tbody');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){const q=document.querySelector('#q').value.toLowerCase(),d=document.querySelector('#decoder').value,o=document.querySelector('#outcome').value;body.innerHTML='';const matched=rows.filter(r=>(!d||r.decoder===d)&&(!o||r.matches.some(m=>m.outcome===o))&&JSON.stringify(r).toLowerCase().includes(q));document.querySelector('#shown').textContent=\`Showing \${Math.min(500,matched.length).toLocaleString()} of \${matched.length.toLocaleString()} matching records\`;matched.slice(0,500).forEach(r=>{const tr=document.createElement('tr'),out=r.matches.filter(m=>m.outcome!=='extra_result').map(m=>m.outcome);tr.innerHTML=\`<td>\${esc(r.decoder)}</td><td>\${esc(r.relative_path)}</td><td>\${esc(r.annotation_file)}</td><td>\${r.ground_truth.filter(x=>x.decode_eligible).map(x=>esc(x.format)+': '+esc(x.text)).join('<br>')}</td><td>\${r.predictions.map(x=>esc(x.format)+': '+esc(x.text)).join('<br>')}</td><td class="\${out[0]||''}">\${out.map(esc).join(', ')}</td><td>\${(r.decode_ns/1e6).toFixed(2)}</td>\`;body.appendChild(tr)})}
document.querySelectorAll('#q,#decoder,#outcome').forEach(e=>e.addEventListener('input',render));render();

// --- failures to follow up -------------------------------------------------
const fails=[];
for(const r of rows){
  for(const m of r.matches){
    if(m.outcome==='correct'||m.outcome==='extra_result')continue;
    const gt=r.ground_truth[m.truth_index]||{};
    const pr=(m.prediction_index!=null&&r.predictions[m.prediction_index])?r.predictions[m.prediction_index]:null;
    fails.push({d:r.decoder,img:r.relative_path,src:r.annotation_file,fmt:gt.format||'',exp:gt.text||'',got:pr?(pr.format+': '+pr.text):'',out:m.outcome,ms:Math.round(r.decode_ns/1e6)});
  }
}
const RANK={wrong_text:0,wrong_format:1,unsupported_format:2,not_found:3,decoder_error:4};
fails.sort((a,b)=>a.d.localeCompare(b.d)||(RANK[a.out]-RANK[b.out])||a.fmt.localeCompare(b.fmt)||a.img.localeCompare(b.img));
const fbody=document.querySelector('#fail tbody'),fcount=document.querySelector('#failcount');
function renderFail(){
  const q=document.querySelector('#fq').value.toLowerCase(),d=document.querySelector('#fdec').value,o=document.querySelector('#fout').value,f=document.querySelector('#ffmt').value;
  const m=fails.filter(x=>(!d||x.d===d)&&(!o||x.out===o)&&(!f||x.fmt===f)&&(!q||(x.img+' '+x.fmt+' '+x.exp+' '+x.got+' '+x.src).toLowerCase().includes(q)));
  const byOut={};for(const x of m)byOut[x.out]=(byOut[x.out]||0)+1;
  fcount.textContent=m.length.toLocaleString()+' failures'+(m.length?(' — '+Object.keys(byOut).sort().map(k=>k+' '+byOut[k]).join(', ')):'');
  fbody.innerHTML='';
  const cap=3000;
  for(const x of m.slice(0,cap)){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+esc(x.d)+'</td><td class="mono" title="'+esc(x.src)+'">'+esc(x.img)+'</td><td>'+esc(x.fmt)+'</td>'+
      '<td class="mono" title="'+esc(x.exp)+'">'+esc(x.exp)+'</td>'+
      '<td class="mono" title="'+esc(x.got)+'">'+(x.got?esc(x.got):'<span class="muted">no read</span>')+'</td>'+
      '<td class="'+esc(x.out)+'">'+esc(x.out)+'</td><td>'+x.ms+'</td>';
    fbody.appendChild(tr);
  }
  if(m.length>cap){const tr=document.createElement('tr');tr.innerHTML='<td colspan="7" class="muted">'+(m.length-cap).toLocaleString()+' more rows — narrow the filters or use the JSONL.</td>';fbody.appendChild(tr);}
}
document.querySelectorAll('#fq,#fdec,#fout,#ffmt').forEach(e=>e.addEventListener('input',renderFail));
const fdec=document.querySelector('#fdec');
for(const d of Array.from(new Set(fails.map(x=>x.d))).sort()){const o=document.createElement('option');o.textContent=d;fdec.appendChild(o);}
const ffmt=document.querySelector('#ffmt');
for(const f of Array.from(new Set(fails.map(x=>x.fmt))).sort()){const o=document.createElement('option');o.textContent=f;ffmt.appendChild(o);}
renderFail();

// Export exactly what the filters currently show, so a follow-up list can be
// handed to whoever owns the reader without paging through the HTML.
function csvCell(v){const s=String(v==null?'':v);const needs=s.indexOf('"')>=0||s.indexOf(',')>=0||s.indexOf(String.fromCharCode(10))>=0;return needs?'"'+s.split('"').join('""')+'"':s;}
document.querySelector('#fcsv').addEventListener('click',()=>{
  const rows=[['decoder','image','source','format','expected','returned','outcome','decode_ms']];
  const d=document.querySelector('#fdec').value,o=document.querySelector('#fout').value,f=document.querySelector('#ffmt').value,q=document.querySelector('#fq').value.toLowerCase();
  for(const x of fails){if((d&&x.d!==d)||(o&&x.out!==o)||(f&&x.fmt!==f)||(q&&!(x.img+' '+x.fmt+' '+x.exp+' '+x.got+' '+x.src).toLowerCase().includes(q)))continue;
    rows.push([x.d,x.img,x.src,x.fmt,x.exp,x.got,x.out,x.ms]);}
  const csv=rows.map(r=>r.map(csvCell).join(',')).join(String.fromCharCode(10));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='barber-failures.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
});
`;

const cards = Object.entries(summary.decoders)
  .map(([name, value]) =>
    `<div class="card"><h3>${escape(name)}</h3><div class="metric">${(value.coverage_adjusted_recall * 100).toFixed(2)}%</div>` +
    `<div class="muted">${value.correct.toLocaleString()}/${value.eligible_instances.toLocaleString()} exact` +
    ` &middot; ${value.wrong_reads.toLocaleString()} wrong reads &middot; ${value.no_read.toLocaleString()} no read` +
    ` &middot; mean ${value.mean_decode_ms.toFixed(1)} ms</div></div>`
  )
  .join("");

const decoderOptions = [...new Set(rows.map((r) => r.decoder))].sort().map((x) => `<option>${escape(x)}</option>`).join("");
const outcomes = [...new Set(rows.flatMap((r) => r.matches.map((m) => m.outcome)))]
  .filter((x) => x !== "extra_result")
  .sort();
const outcomeOptions = outcomes.map((x) => `<option>${escape(x)}</option>`).join("");
// Inject the rows as a JSON literal. Escape the two sequences that can break a
// <script> block or a JS string: "</" (would close the script tag) and the raw
// U+2028/U+2029 line separators (invalid in JS strings). JSON.stringify output is
// itself a valid JS expression, so `const rows = <json>;` parses cleanly.
const rowsJson = JSON.stringify(rows)
  .replace(/<\//g, "<\\/")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
// Use a replacement FUNCTION so that "$" sequences inside the barcode payloads
// ($&, $`, $', $$, $1…) are inserted literally instead of being interpreted as
// special replacement patterns by String.replace().
const script = SCRIPT.replace("REPORT_ROWS", () => rowsJson);
const decoderRecords = Object.values(summary.decoders).reduce((sum, value) => sum + value.records, 0);
const reportTitle = Object.keys(summary.decoders).map(escape).join(" vs. ");

const browserLine = environment.browser
  ? `${escape(environment.browser.userAgent || "")}, ${environment.browser.hardwareConcurrency || ""} logical processors reported by the browser`
  : "";

// Build the HTML with plain concatenation (NOT a template literal). The embedded
// rows JSON can contain a backtick character inside barcode payloads; a template
// literal would be terminated by that backtick and corrupt the whole document.
const document_ =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><title>JavaScript BarBeR Barcode Benchmark</title><style>' +
  STYLE +
  '</style><header><h1>' +
  reportTitle +
  '</h1><p>BarBeR public dataset decoding benchmark. Exact payload and canonical format are scored. Localization geometry is not scored.</p></header><main class="wrap"><section><h2>Full benchmark results</h2><div class="cards">' +
  cards +
  '</div></section><section><h2>Dataset audit</h2><div class="cards"><div class="card"><div class="metric">' +
  stats.source_images.toLocaleString() +
  '</div>original images</div><div class="card"><div class="metric">' +
  stats.annotations.toLocaleString() +
  '</div>original annotations</div><div class="card"><div class="metric">' +
  stats.excluded_images_without_ground_truth.toLocaleString() +
  '</div>images without reliable ground truth</div><div class="card"><div class="metric">' +
  stats.duplicate_image_records.toLocaleString() +
  '</div>exact duplicate image</div><div class="card"><div class="metric">' +
  stats.manifest_images.toLocaleString() +
  '</div>final unique images</div><div class="card"><div class="metric">' +
  stats.benchmark_annotations.toLocaleString() +
  '</div>final ground truth barcodes</div><div class="card"><div class="metric">' +
  decoderRecords.toLocaleString() +
  '</div>decoder records</div></div></section><section><h2>Method and disclosures</h2><p class="disclosure">' +
  escape(summary.disclosure) +
  '</p>' +
  '<p>All three decoders read the same pixels from one canvas painted from a single ImageBitmap; the fetch and bitmap decode stage is recorded separately as image_load_ns. zxing-wasm reads ImageData, Dynamsoft reads the canvas, and Scandit reads one ImageFrameSource frame built from the same canvas ImageData (BarcodeBatch / MatrixScan mode). Only the decoder call is timed, and decoder order is shuffled per image with a seeded PRNG. Matching is a location-independent one-to-one multiset match of canonical format and exact normalized payload. UPC-A/EAN-13 leading zeros, CODE_39 start/stop asterisks, CODE_128 GS1 markers, HTML entity escaping, trailing newlines, and a leading \\000001 escape are normalized before scoring. Ground truth payload ^ is treated as an unreliable placeholder and excluded from scoring.</p><p><strong>Measured environment:</strong> ' +
  escape(environment.operating_system || "") +
  ', ' +
  escape(environment.processor || "") +
  ', Node ' +
  escape(environment.node || "") +
  ', ' +
  escape(environment.configuration || "") +
  ', ' +
  (environment.repetitions || 1) +
  ' measured run. ' +
  browserLine +
  '</p>' +
  (environment.scandit_barcode_package
    ? '<p><strong>Pinned SDKs:</strong> ' +
      escape(environment.zxing_wasm_package || "") + '; ' +
      escape(environment.dynamsoft_package || "") + '; ' +
      escape(environment.scandit_barcode_package || "") +
      '. Scandit ran in ' + escape(environment.scandit_mode || "single-image mode") + '.</p>'
    : '') +
  '</section><section><h2>Per-image results</h2><p class="muted">The interactive table displays up to 500 matching rows. The Predictions column lists every barcode the reader returned for the image, including any that no annotation claims; the Outcomes column covers only the annotations. The complete JSONL stream, the summary, the source inventory and the environment snapshot are shipped under <code>results/full/</code>, <code>manifests/</code> and <code>configs/</code>.</p><div class="controls"><input id="q" placeholder="Search image, format, payload"><select id="decoder"><option value="">All decoders</option>' +
  decoderOptions +
  '</select><select id="outcome"><option value="">All outcomes</option>' +
  outcomeOptions +
  '</select></div><p id="shown" class="muted"></p><div class="scroll"><table id="raw"><thead><tr><th>Decoder</th><th>Image</th><th>Source</th><th>Ground truth</th><th>Predictions</th><th>Outcomes</th><th>Decode ms</th></tr></thead><tbody></tbody></table></div></section>' +
  '<section id="failures"><h2>Failures to follow up</h2><p class="muted">Every annotation that did not end as <code>correct</code>, one row per annotation: the image, the annotation file it came from, the expected symbology and payload, what the reader returned for that annotation, and the outcome. Rows are grouped by decoder, then outcome. Use the filters to isolate one reader or one outcome; the underlying records are in <code>results/full/results.jsonl</code>.</p>' +
  '<div class="filters"><input id="fq" placeholder="Search image, payload, source"><select id="fdec"><option value="">All decoders</option></select><select id="fout"><option value="">All outcomes</option><option>wrong_text</option><option>wrong_format</option><option>unsupported_format</option><option>not_found</option><option>decoder_error</option></select><select id="ffmt"><option value="">All formats</option></select></div>' +
  '<div class="tools"><button id="fcsv" type="button">Download filtered rows as CSV</button></div>' +
  '<p id="failcount" class="muted"></p><div class="scroll"><table id="fail"><thead><tr><th>Decoder</th><th>Image</th><th>Format</th><th>Expected</th><th>Returned</th><th>Outcome</th><th>ms</th></tr></thead><tbody></tbody></table></div></section></main><script>' +
  script +
  '</script></html>';

fs.mkdirSync(path.dirname(args.output), { recursive: true });
fs.writeFileSync(args.output, document_);

const downloads = path.join(path.dirname(args.output), "downloads");
fs.mkdirSync(downloads, { recursive: true });
const copies = [
  [args.results, "results.jsonl"],
  [args.summary, "summary.json"],
  [args.inventory, "barber_source_files.json"],
  [args.environment, "benchmark_environment.json"],
];
if (args["results-json"]) copies.push([args["results-json"], "results.json"]);
for (const [source, name] of copies) {
  fs.copyFileSync(source, path.join(downloads, name));
}
console.log(args.output);
