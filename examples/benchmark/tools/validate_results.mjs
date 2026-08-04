/** Validate benchmark JSONL structure, uniqueness, and summary counts. */
import fs from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const readJsonl = (file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const fail = (msg) => { console.error(msg); process.exit(1); };

const rows = readJsonl(args.results);
const required = new Set([
  "sample_id", "relative_path", "decoder", "decoder_version", "repetition",
  "ground_truth", "predictions", "matches", "decode_ns", "image_load_ns", "error",
]);
rows.forEach((row, index) => {
  const missing = [...required].filter((k) => !(k in row));
  if (missing.length) fail(`record ${index + 1} missing fields: ${missing.sort().join(",")}`);
});

const keys = rows.map((r) => `${r.sample_id}|${r.decoder}|${r.repetition}`);
const keyCounts = {};
for (const key of keys) keyCounts[key] = (keyCounts[key] || 0) + 1;
const duplicates = Object.keys(keyCounts).filter((k) => keyCounts[k] > 1);
if (duplicates.length) fail(`duplicate result keys: ${duplicates.slice(0, 5).join("; ")}`);

const byDecoder = {};
for (const row of rows) (byDecoder[row.decoder] ||= []).push(row);

if (args["expected-images"]) {
  const expected = Number(args["expected-images"]);
  for (const [decoder, group] of Object.entries(byDecoder)) {
    const actual = new Set(group.map((r) => r.sample_id)).size;
    if (actual !== expected) fail(`${decoder}: expected ${expected} images, got ${actual}`);
  }
}

const sampleTruth = {};
for (const row of rows) {
  if (!row.ground_truth.length) fail(`${row.relative_path}: ground truth is empty`);
  if (row.ground_truth.some((item) => !item.decode_eligible)) {
    fail(`${row.relative_path}: ground truth contains an excluded item`);
  }
  const serialized = JSON.stringify(row.ground_truth);
  if (sampleTruth[row.sample_id] === undefined) sampleTruth[row.sample_id] = serialized;
  else if (sampleTruth[row.sample_id] !== serialized) {
    fail(`${row.relative_path}: ground truth differs between decoder records`);
  }
}

if (args["expected-ground-truth"]) {
  const expected = Number(args["expected-ground-truth"]);
  const actual = Object.values(sampleTruth).reduce((sum, value) => sum + JSON.parse(value).length, 0);
  if (actual !== expected) fail(`expected ${expected} ground truth items, got ${actual}`);
}

if (args["expected-repetitions"]) {
  const expected = Number(args["expected-repetitions"]);
  const grouped = {};
  for (const row of rows) {
    const key = `${row.sample_id}|${row.decoder}`;
    (grouped[key] ||= new Set()).add(row.repetition);
  }
  const incomplete = Object.entries(grouped).filter(([, reps]) => reps.size !== expected);
  if (incomplete.length) fail(`incomplete repetitions: ${incomplete.slice(0, 5).map(([k]) => k).join("; ")}`);
}

const summary = JSON.parse(fs.readFileSync(args.summary, "utf8"));
for (const [decoder, group] of Object.entries(byDecoder)) {
  const expected = summary.decoders[decoder]?.records;
  if (expected !== group.length) fail(`${decoder}: summary records=${expected}, JSONL records=${group.length}`);
}

const errors = rows.filter((r) => r.error).map((r) => [r.decoder, r.relative_path, r.error]);
console.log(JSON.stringify({
  records: rows.length,
  unique_keys: new Set(keys).size,
  decoders: Object.fromEntries(Object.entries(byDecoder).map(([k, v]) => [k, v.length])),
  errors,
}, null, 2));
process.exit(errors.length ? 1 : 0);
