/**
 * Benchmark server:
 * - serves the web harness (./web)
 * - streams BarBeR dataset images to the browser (--images root)
 * - collects per-image decode records from the browser, scores them with the
 *   shared protocol (src/score.mjs), and appends them to results.jsonl
 * - finalizes summary.json + results.json
 *
 * Usage:
 *   node src/server.mjs --images "D:/images/public-barcode-dataset/BarBeR - Dataset/dataset/images" \
 *     --manifest manifests/benchmark_manifest.jsonl --output results/full [--port 8790] [--repetitions 1]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  PROTOCOL, ZXING, DBR, sha256File, readJsonl, matchResults, generateSummary,
} from "./score.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    port: 8790, images: "", manifest: "manifests/benchmark_manifest.jsonl",
    output: "results/full", repetitions: 1, dbrTemplate: "ReadBarcodes_Default",
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (key in args) args[key] = argv[++i];
  }
  args.port = Number(args.port);
  args.repetitions = Number(args.repetitions);
  return args;
}

const args = parseArgs(process.argv);
const manifestPath = path.resolve(ROOT, args.manifest);
const outputDir = path.resolve(ROOT, args.output);
const imageRoot = path.resolve(args.images);
if (!args.images || !fs.existsSync(imageRoot)) {
  console.error(`image root not found: ${args.images}`);
  process.exit(1);
}
if (!fs.existsSync(manifestPath)) {
  console.error(`manifest not found: ${manifestPath}`);
  process.exit(1);
}
fs.mkdirSync(outputDir, { recursive: true });

const manifestSha256 = sha256File(manifestPath);
const manifestRecords = readJsonl(manifestPath);
const samplesById = new Map(manifestRecords.map((r) => [r.sample_id, r]));
const jsonlPath = path.join(outputDir, "results.jsonl");

// Resumability: remember which (sample_id, decoder, repetition) rows already exist.
const completed = new Set();
for (const row of readJsonl(jsonlPath)) {
  completed.add(`${row.sample_id}|${row.decoder}|${row.repetition}`);
}

const zxingConfigHash = "zxing-wasm:all-supported";
const dbrConfigHash = `dbr-template:${args.dbrTemplate}`;
let browserEnvironment = null;

function json(res, code, value) {
  const body = JSON.stringify(value);
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function recordFromPost(body) {
  const sample = samplesById.get(body.sample_id);
  if (!sample) throw new Error(`unknown sample_id: ${body.sample_id}`);
  const error = body.error || null;
  const matches = error
    ? sample.ground_truth.map((_, i) => ({ truth_index: i, prediction_index: null, outcome: "decoder_error" }))
    : matchResults(sample.ground_truth, body.predictions || [], body.decoder);
  return {
    protocol: PROTOCOL,
    manifest_sha256: manifestSha256,
    sample_id: sample.sample_id,
    relative_path: sample.relative_path,
    annotation_file: sample.annotation_file,
    image_sha256: sample.image_sha256,
    width: sample.width,
    height: sample.height,
    ground_truth: sample.ground_truth,
    decoder: body.decoder,
    decoder_version: body.decoder_version,
    config_sha256: body.decoder === ZXING ? zxingConfigHash : dbrConfigHash,
    repetition: body.repetition,
    image_load_ns: body.image_load_ns,
    decode_ns: body.decode_ns,
    error,
    predictions: body.predictions || [],
    matches,
  };
}

function finalize() {
  const records = readJsonl(jsonlPath);
  const summary = generateSummary(records);
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outputDir, "results.json"),
    JSON.stringify({ summary, records }, null, 2) + "\n"
  );
  writeEnvironment();
  return summary;
}

function writeEnvironment() {
  const cpus = os.cpus();
  const env = {
    measured_at: new Date().toISOString(),
    operating_system: `${os.platform()} ${os.release()}`,
    processor: cpus[0]?.model || "",
    logical_processors: cpus.length,
    node: process.version,
    architecture: os.arch(),
    configuration: "Browser WASM run driven by Node harness",
    benchmark_processes: 1,
    repetitions: args.repetitions,
    dbr_template: args.dbrTemplate,
    zxing_wasm_package: "zxing-wasm (jsdelivr CDN, pinned)",
    dynamsoft_package: "dynamsoft-barcode-reader-bundle (jsdelivr CDN, pinned)",
    browser: browserEnvironment,
    manifest_sha256: manifestSha256,
  };
  const configDir = path.join(ROOT, "configs");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "benchmark_environment.json"), JSON.stringify(env, null, 2) + "\n");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/state") {
      return json(res, 200, {
        total_images: manifestRecords.length,
        repetitions: args.repetitions,
        expected_records: manifestRecords.length * 2 * args.repetitions,
        completed_records: completed.size,
        completed: [...completed],
        manifest_sha256: manifestSha256,
        dbr_template: args.dbrTemplate,
      });
    }

    if (req.method === "GET" && url.pathname === "/manifest") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      return fs.createReadStream(manifestPath).pipe(res);
    }

    if (req.method === "GET" && url.pathname.startsWith("/images/")) {
      const rel = decodeURIComponent(url.pathname.slice("/images/".length));
      const file = path.resolve(imageRoot, rel);
      if (!file.startsWith(imageRoot) || !fs.existsSync(file)) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }

    if (req.method === "POST" && url.pathname === "/environment") {
      browserEnvironment = await readBody(req);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/record") {
      const body = await readBody(req);
      const key = `${body.sample_id}|${body.decoder}|${body.repetition}`;
      if (!completed.has(key)) {
        const record = recordFromPost(body);
        fs.appendFileSync(jsonlPath, JSON.stringify(record) + "\n");
        completed.add(key);
      }
      return json(res, 200, { ok: true, completed: completed.size });
    }

    if (req.method === "POST" && url.pathname === "/finalize") {
      const summary = finalize();
      return json(res, 200, summary);
    }

    if (req.method === "GET") {
      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(ROOT, "web", rel);
      if (file.startsWith(path.resolve(ROOT, "web")) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
        return fs.createReadStream(file).pipe(res);
      }
    }

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    console.error(err);
    json(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(args.port, () => {
  console.log(`benchmark server on http://localhost:${args.port}`);
  console.log(`manifest=${manifestPath} images=${manifestRecords.length} manifest_sha256=${manifestSha256.slice(0, 16)}…`);
  console.log(`image_root=${imageRoot}`);
  console.log(`output=${jsonlPath} (existing records: ${completed.size})`);
});
