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
:root{--ink:#172033;--muted:#60708a;--line:#dbe2ea;--bg:#f5f7fa}*{box-sizing:border-box}body{margin:0;font:15px/1.5 Segoe UI,Arial,sans-serif;color:var(--ink);background:var(--bg)}header{padding:52px max(5vw,28px);color:white;background:linear-gradient(120deg,#102649,#1769e0 62%,#00a495)}header h1{margin:0 0 8px;font-size:clamp(30px,5vw,58px);line-height:1.05}.wrap{max-width:1280px;margin:auto;padding:28px}section{background:white;border:1px solid var(--line);border-radius:14px;margin:18px 0;padding:24px;box-shadow:0 3px 18px #1026490c}h2{margin-top:0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.card{border:1px solid var(--line);border-radius:11px;padding:18px}.metric{font-size:32px;font-weight:750}.muted{color:var(--muted)}.disclosure{border-left:5px solid #f0a202;background:#fff8e6;padding:14px 18px}.controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}input,select{padding:9px 11px;border:1px solid #bcc8d8;border-radius:7px;background:white}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:#edf3fa}.scroll{overflow:auto;max-height:650px}.correct{color:#087f5b}.not_found,.wrong_text,.wrong_format{color:#c2410c}.unsupported_format{color:#6d28d9}@media print{body{background:white}.controls{display:none}section{break-inside:avoid;box-shadow:none}}
`;

const SCRIPT = `
const rows=REPORT_ROWS,body=document.querySelector('#raw tbody');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){const q=document.querySelector('#q').value.toLowerCase(),d=document.querySelector('#decoder').value,o=document.querySelector('#outcome').value;body.innerHTML='';const matched=rows.filter(r=>(!d||r.decoder===d)&&(!o||r.matches.some(m=>m.outcome===o))&&JSON.stringify(r).toLowerCase().includes(q));document.querySelector('#shown').textContent=\`Showing \${Math.min(500,matched.length).toLocaleString()} of \${matched.length.toLocaleString()} matching records\`;matched.slice(0,500).forEach(r=>{const tr=document.createElement('tr'),out=r.matches.map(m=>m.outcome);tr.innerHTML=\`<td>\${esc(r.decoder)}</td><td>\${esc(r.relative_path)}</td><td>\${esc(r.annotation_file)}</td><td>\${r.ground_truth.filter(x=>x.decode_eligible).map(x=>esc(x.format)+': '+esc(x.text)).join('<br>')}</td><td>\${r.predictions.map(x=>esc(x.format)+': '+esc(x.text)).join('<br>')}</td><td class="\${out[0]||''}">\${out.map(esc).join(', ')}</td><td>\${(r.decode_ns/1e6).toFixed(2)}</td>\`;body.appendChild(tr)})}
document.querySelectorAll('#q,#decoder,#outcome').forEach(e=>e.addEventListener('input',render));render();
`;

const cards = Object.entries(summary.decoders)
  .map(([name, value]) =>
    `<div class="card"><h3>${escape(name)}</h3><div class="metric">${(value.coverage_adjusted_recall * 100).toFixed(1)}%</div>` +
    `<div class="muted">${value.correct}/${value.eligible_instances} exact, mean ${value.mean_decode_ms.toFixed(1)} ms</div></div>`
  )
  .join("");

const decoderOptions = [...new Set(rows.map((r) => r.decoder))].sort().map((x) => `<option>${escape(x)}</option>`).join("");
const outcomes = [...new Set(rows.flatMap((r) => r.matches.map((m) => m.outcome)))].sort();
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

const browserLine = environment.browser
  ? `${escape(environment.browser.userAgent || "")}, ${environment.browser.hardwareConcurrency || ""} logical processors reported by the browser`
  : "";

// Build the HTML with plain concatenation (NOT a template literal). The embedded
// rows JSON can contain a backtick character inside barcode payloads; a template
// literal would be terminated by that backtick and corrupt the whole document.
const document_ =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><title>JavaScript BarBeR Barcode Benchmark</title><style>' +
  STYLE +
  '</style><header><h1>zxing-wasm vs. Dynamsoft Barcode Reader JavaScript</h1><p>BarBeR public dataset decoding benchmark. Exact payload and canonical format are scored. Localization geometry is not scored.</p></header><main class="wrap"><section><h2>Full benchmark results</h2><div class="cards">' +
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
  '</p><p>Both JavaScript decoders receive the same canvas painted from a single ImageBitmap; the fetch and bitmap decode stage is recorded separately as image_load_ns. Matching is a location-independent one-to-one multiset match of canonical format and exact normalized payload. UPC-A and EAN-13 leading zero equivalence is normalized before scoring.</p><p><strong>Measured environment:</strong> ' +
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
  '</p></section><section><h2>Per-image results</h2><p class="muted">The interactive table displays up to 500 matching rows. The complete JSONL stream and a complete JSON package are included in the report downloads.</p><div class="controls"><input id="q" placeholder="Search image, format, payload"><select id="decoder"><option value="">All decoders</option>' +
  decoderOptions +
  '</select><select id="outcome"><option value="">All outcomes</option>' +
  outcomeOptions +
  '</select></div><p id="shown" class="muted"></p><div class="scroll"><table id="raw"><thead><tr><th>Decoder</th><th>Image</th><th>Source</th><th>Ground truth</th><th>Predictions</th><th>Outcomes</th><th>Decode ms</th></tr></thead><tbody></tbody></table></div></section></main><script>' +
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
