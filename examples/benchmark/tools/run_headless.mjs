/**
 * Headless runner for the three-decoder BarBeR benchmark.
 *
 * It starts the collector server, drives the web harness in headless Chrome,
 * resumes from any records already in results.jsonl, restarts the browser if it
 * stalls or after a configurable number of records (to keep WASM memory in
 * check), and calls /finalize when every (sample, decoder, repetition) row is
 * present.
 *
 * Both commercial trial keys are supplied by the user via environment variables
 * (DYNAMSOFT_LICENSE_KEY, SCANDIT_LICENSE_KEY) or the untracked files in
 * ../licenses/ (see ../licenses/README.md). They are injected into the page at
 * runtime and are never written into the repository.
 *
 * Usage:
 *   DYNAMSOFT_LICENSE_KEY='...' SCANDIT_LICENSE_KEY='...' \
 *     node tools/run_headless.mjs --manifest manifests/benchmark_manifest.jsonl \
 *       --output results/full
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    images: "D:/images/BarBeR_Dataset/BarBeR - Dataset/dataset/images",
    manifest: "manifests/benchmark_manifest.jsonl",
    output: "results/full",
    port: 8790,
    repetitions: 1,
    "restart-every": 3000,
    "stall-seconds": 300,
    decoders: "zxing-wasm,dynamsoft-dbr-js,scandit-web-datacapture",
    chrome: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (key in args) args[key] = argv[++i];
  }
  args.port = Number(args.port);
  args.repetitions = Number(args.repetitions);
  args["restart-every"] = Number(args["restart-every"]);
  args["stall-seconds"] = Number(args["stall-seconds"]);
  return args;
}

const args = parseArgs(process.argv);
const LICENSE_DIR = path.resolve(ROOT, "..", "licenses");

function loadKey(envName, file) {
  const fromEnv = (process.env[envName] || "").trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync(file)) {
    const fromFile = fs.readFileSync(file, "utf8").trim();
    if (fromFile && !fromFile.startsWith("#")) return fromFile;
  }
  return "";
}

const ACTIVE_DECODERS = args.decoders.split(",").map((s) => s.trim()).filter(Boolean);
const NEEDS_DBR = ACTIVE_DECODERS.includes("dynamsoft-dbr-js");
const NEEDS_SCANDIT = ACTIVE_DECODERS.includes("scandit-web-datacapture");

const DYNAMSOFT_KEY = NEEDS_DBR
  ? loadKey("DYNAMSOFT_LICENSE_KEY", path.join(LICENSE_DIR, "dynamsoft-dbr.txt"))
  : "";
const SCANDIT_KEY = NEEDS_SCANDIT
  ? loadKey("SCANDIT_LICENSE_KEY", path.join(LICENSE_DIR, "scandit-web.txt"))
  : "";
if ((NEEDS_DBR && !DYNAMSOFT_KEY) || (NEEDS_SCANDIT && !SCANDIT_KEY)) {
  console.error(
    "Both license keys are required. Apply for your own trials, then set\n" +
    "  DYNAMSOFT_LICENSE_KEY and SCANDIT_LICENSE_KEY, or copy the .example files\n" +
    "  in licenses/ and fill them in. See licenses/README.md."
  );
  process.exit(1);
}
const BASE = `http://localhost:${args.port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(
  process.execPath,
  [
    path.join(ROOT, "src", "server.mjs"),
    "--images", args.images,
    "--manifest", args.manifest,
    "--output", args.output,
    "--port", String(args.port),
    "--repetitions", String(args.repetitions),
    "--decoders", ACTIVE_DECODERS.join(","),
  ],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
);
server.stdout.on("data", (d) => process.stdout.write("[server] " + d));
server.stderr.on("data", (d) => process.stderr.write("[server] " + d));
process.on("exit", () => { try { server.kill(); } catch (_) {} });
process.on("SIGINT", () => { server.kill(); process.exit(130); });

async function getProgress() {
  const res = await fetch(`${BASE}/progress`);
  if (!res.ok) throw new Error(`/progress returned ${res.status}`);
  return res.json();
}

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try { return await getProgress(); } catch (_) { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error("collector server did not become ready");
}

async function openSession() {
  const browser = await puppeteer.launch({
    executablePath: args.chrome,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((config) => {
    window.__SCANDIT_LICENSE_KEY__ = config.scandit;
    window.__DYNAMSOFT_LICENSE_KEY__ = config.dynamsoft;
    window.__BENCH_DECODERS__ = config.decoders;
  }, { scandit: SCANDIT_KEY, dynamsoft: DYNAMSOFT_KEY, decoders: ACTIVE_DECODERS });
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  page.on("console", (msg) => {
    const text = msg.text();
    if (/init failed|run failed|finalize failed|manifest load failed/i.test(text)) console.log("[browser]", text);
  });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.__bench && window.__bench.total > 0, { timeout: 120000 });
  // Dispatch the click in the DOM rather than using a synthetic mouse event:
  // puppeteer's page.click() can miss buttons that are covered/clipped by the
  // harness CSS, which silently leaves the benchmark in "initialized" state.
  await page.evaluate(() => document.getElementById("init-btn").click());
  await page.waitForFunction(
    () => window.__bench.phase === "initialized" ||
      (document.getElementById("sdk-status")?.textContent || "").startsWith("Init failed"),
    { timeout: 300000, polling: 500 }
  );
  const status = await page.$eval("#sdk-status", (e) => e.textContent);
  if (status.startsWith("Init failed")) throw new Error(status);
  await page.evaluate(() => document.getElementById("run-btn").click());
  await page.waitForFunction(() => window.__bench.phase === "running", { timeout: 30000 });
  return { browser, page };
}

async function closeSession(session) {
  if (!session) return;
  try {
    await Promise.race([
      session.page.evaluate(() => {
        const b = document.getElementById("stop-btn");
        if (b && !b.disabled) b.click();
      }),
      sleep(3000),
    ]);
    await sleep(800);
  } catch (_) { /* page may already be gone */ }
  try {
    await Promise.race([session.browser.close(), sleep(6000)]);
  } catch (_) { /* already closed */ }
  try { session.browser.process()?.kill("SIGKILL"); } catch (_) { /* no child process */ }
}

function fmtEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "?";
  return `${Math.round(seconds / 60)} min`;
}

async function main() {
  const initial = await waitForServer();
  console.log(`[runner] ${initial.completed_records}/${initial.expected_records} records present at start`);

  let session = null;
  let sessionStart = initial.completed_records;
  let lastCompleted = initial.completed_records;
  let lastProgressAt = Date.now();
  let startedAt = Date.now();
  let sessionCount = 0;
  const stallMs = args["stall-seconds"] * 1000;

  while (true) {
    let state;
    try {
      state = await getProgress();
    } catch (err) {
      console.log("[runner] progress poll failed:", err.message);
      await sleep(3000);
      continue;
    }

    if (state.completed_records > lastCompleted) {
      lastCompleted = state.completed_records;
      lastProgressAt = Date.now();
    }
    if (state.completed_records >= state.expected_records) break;

    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = (state.completed_records - initial.completed_records) / Math.max(1, elapsed);
    const eta = rate ? (state.expected_records - state.completed_records) / rate : Infinity;
    console.log(
      `[runner] ${state.completed_records}/${state.expected_records} ` +
      `(${((state.completed_records / state.expected_records) * 100).toFixed(1)}%) ` +
      `rate=${rate.toFixed(1)} rec/s eta=${fmtEta(eta)}`
    );

    if (!session) {
      try {
        session = await openSession();
        sessionStart = state.completed_records;
        lastProgressAt = Date.now();
        console.log(`[runner] browser session #${++sessionCount} started`);
      } catch (err) {
        console.log("[runner] session failed to start:", err.message);
        await sleep(5000);
        continue;
      }
    } else {
      try {
        const phase = await session.page.evaluate(() => window.__bench.phase);
        if (phase === "finished") break;
        if (phase === "stopped") {
          console.log("[runner] harness stopped unexpectedly, restarting session");
          await closeSession(session); session = null; continue;
        }
      } catch (err) {
        console.log("[runner] page unresponsive:", err.message);
        await closeSession(session); session = null; continue;
      }
    }

    const stalled = Date.now() - lastProgressAt > stallMs;
    const dueForRestart = state.completed_records - sessionStart >= args["restart-every"];
    if (stalled || dueForRestart) {
      console.log(`[runner] restarting session (${stalled ? "stalled" : "periodic"}, ${state.completed_records} records)`);
      await closeSession(session);
      session = null;
      continue;
    }

    await sleep(15000);
  }

  await closeSession(session);
  const final = await getProgress();
  console.log(`[runner] all records present: ${final.completed_records}/${final.expected_records}`);

  const res = await fetch(`${BASE}/finalize`, { method: "POST" });
  const summary = await res.json();
  console.log("[runner] finalize done. Summary:");
  for (const [name, d] of Object.entries(summary.decoders)) {
    console.log(
      `  ${name}: ${d.correct}/${d.eligible_instances} correct ` +
      `(${(d.coverage_adjusted_recall * 100).toFixed(2)}% recall), ` +
      `wrong_reads=${d.wrong_reads}, no_read=${d.no_read}, ` +
      `mean=${d.mean_decode_ms.toFixed(2)} ms, p95=${d.p95_decode_ms.toFixed(2)} ms`
    );
  }
  const outDir = path.resolve(ROOT, args.output);
  console.log("[runner] outputs:", fs.readdirSync(outDir).join(", "));
  server.kill();
}

main().catch((err) => {
  console.error("[runner] fatal:", err);
  server.kill();
  process.exit(1);
});
