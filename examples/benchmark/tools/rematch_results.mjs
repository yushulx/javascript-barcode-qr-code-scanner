/**
 * Re-score an existing results.jsonl with the current matching rules.
 * Does not re-run decoders.
 *
 * Usage:
 *   node tools/rematch_results.mjs --results results/full/results.jsonl --output results/full
 */
import fs from "node:fs";
import path from "node:path";
import { readJsonl, matchResults, generateSummary } from "../src/score.mjs";

function parseArgs(argv) {
  const args = { results: "", output: "" };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (key in args) args[key] = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
if (!args.results || !args.output) {
  console.error("usage: node tools/rematch_results.mjs --results FILE --output DIR");
  process.exit(1);
}

const records = readJsonl(args.results);
for (const record of records) {
  if (record.error) continue;
  record.matches = matchResults(record.ground_truth || [], record.predictions || [], record.decoder);
}

fs.mkdirSync(args.output, { recursive: true });
const jsonlPath = path.join(args.output, "results.jsonl");
fs.writeFileSync(jsonlPath, records.map((row) => JSON.stringify(row)).join("\n") + (records.length ? "\n" : ""));
const summary = generateSummary(records);
fs.writeFileSync(path.join(args.output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
fs.writeFileSync(path.join(args.output, "results.json"), JSON.stringify({ summary, records }, null, 2) + "\n");
console.log(`rematched ${records.length} records`);
console.log(`wrote ${jsonlPath}`);
