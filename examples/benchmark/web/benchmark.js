/**
 * Browser harness for the zxing-wasm vs. Dynamsoft Barcode Reader benchmark.
 *
 * Protocol (kept identical in spirit to the C++/Python series articles):
 * - The server supplies the audited BarBeR manifest and dataset images.
 * - Each image is fetched once and decoded into an ImageBitmap, then painted
 *   onto a shared canvas. That stage is recorded as image_load_ns and never
 *   enters the decode clock.
 * - Both decoders receive the same canvas; only the decoder call is timed.
 * - Decoder order is shuffled per (sample, repetition) with a seeded PRNG.
 * - Each record is POSTed to the collector server, which scores it with the
 *   shared matching rules and appends it to results.jsonl (resumable).
 */

const DEFAULT_LICENSE =
  "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";
const ZXING_NAME = "zxing-wasm";
const DBR_NAME = "dynamsoft-dbr-js";
const ZXING_PINNED = "3.1.2";
const DBR_PINNED = "11.4.3000";

const el = {
  license: document.getElementById("license"),
  init: document.getElementById("init-btn"),
  run: document.getElementById("run-btn"),
  stop: document.getElementById("stop-btn"),
  finalize: document.getElementById("finalize-btn"),
  sdkStatus: document.getElementById("sdk-status"),
  progressBar: document.getElementById("progress-bar"),
  progressText: document.getElementById("progress-text"),
  liveStats: document.getElementById("live-stats"),
  summary: document.getElementById("summary"),
};

window.__bench = {
  phase: "idle",
  done: 0,
  total: 0,
  errors: [],
  startedAt: 0,
};

let manifest = [];
let completedKeys = new Set();
let repetitions = 1;
let cvRouter = null;
let dbrTemplate = "ReadBarcodes_Default";
let zxingVersion = ZXING_PINNED;
let dbrVersion = DBR_PINNED;
let stopRequested = false;
let sharedCanvas = document.createElement("canvas");
let sharedCtx = sharedCanvas.getContext("2d", { willReadFrequently: true });

const stats = {
  [ZXING_NAME]: { images: 0, barcodes: 0, totalDecodeMs: 0 },
  [DBR_NAME]: { images: 0, barcodes: 0, totalDecodeMs: 0 },
};

function setStatus(text) {
  el.sdkStatus.textContent = text;
}

function progress(text, fraction) {
  el.progressText.textContent = text;
  el.progressBar.style.width = `${Math.round(fraction * 100)}%`;
}

// --- seeded PRNG -----------------------------------------------------------

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function shuffledDecoders(sampleId, repetition) {
  const hex = await sha256Hex(`${sampleId}:${repetition}`);
  const rng = mulberry32(parseInt(hex.slice(0, 12), 16));
  const order = [ZXING_NAME, DBR_NAME];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// --- SDK initialization ----------------------------------------------------

async function initSdk() {
  setStatus("Initializing zxing-wasm…");
  if (typeof ZXingWASM === "undefined") throw new Error("ZXingWASM global missing — CDN script not loaded?");
  zxingVersion = ZXingWASM.version || ZXING_PINNED;

  setStatus("Initializing Dynamsoft Barcode Reader…");
  const key = el.license.value.trim() || DEFAULT_LICENSE;
  await Dynamsoft.License.LicenseManager.initLicense(key, true);
  await Dynamsoft.Core.CoreModule.loadWasm(["DBR"]);
  cvRouter = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
  dbrTemplate = Dynamsoft.CVR.EnumPresetTemplate.PT_READ_BARCODES;
  dbrVersion =
    (Dynamsoft.Core.CoreModule && Dynamsoft.Core.CoreModule.version) ||
    (window.Dynamsoft && Dynamsoft.DBR && Dynamsoft.DBR.BarcodeReader && Dynamsoft.DBR.BarcodeReader.version) ||
    DBR_PINNED;

  await fetch("/environment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      zxing_wasm: zxingVersion,
      dynamsoft_bundle: DBR_PINNED,
      dbr_engine: dbrVersion,
    }),
  });

  setStatus(`zxing-wasm ${zxingVersion} ready · dynamsoft-barcode-reader-bundle ${DBR_PINNED} ready`);
  el.run.disabled = false;
  el.finalize.disabled = false;
}

// --- manifest + state ------------------------------------------------------

async function loadManifest() {
  const text = await (await fetch("/manifest")).text();
  manifest = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const state = await (await fetch("/state")).json();
  completedKeys = new Set(state.completed);
  repetitions = state.repetitions;
  window.__bench.total = state.expected_records;
  progress(
    `Manifest: ${manifest.length} images · server already holds ${completedKeys.size}/${state.expected_records} records.`,
    completedKeys.size / Math.max(1, state.expected_records)
  );
}

// --- decode calls ----------------------------------------------------------

async function decodeWithZxing(canvas) {
  const begin = performance.now();
  try {
    // zxing-wasm 3.x does not accept a canvas element directly; ImageData is
    // the raw-pixel input shared with the DBR canvas path.
    const imageData = sharedCtx.getImageData(0, 0, canvas.width, canvas.height);
    const results = await ZXingWASM.readBarcodes(imageData);
    const decodeNs = Math.round((performance.now() - begin) * 1e6);
    return {
      predictions: (results || []).map((r) => ({
        format: String(r.format || ""),
        text: String(r.text || ""),
        raw_bytes_hex: "",
        confidence: null,
      })),
      decodeNs,
      error: null,
    };
  } catch (err) {
    return { predictions: [], decodeNs: Math.round((performance.now() - begin) * 1e6), error: `decoder_error: ${err.message || err}` };
  }
}

async function decodeWithDbr(canvas) {
  const begin = performance.now();
  try {
    const captured = await cvRouter.capture(canvas, dbrTemplate);
    const decodeNs = Math.round((performance.now() - begin) * 1e6);
    const items = typeof captured.getItems === "function" ? captured.getItems() : captured.items || [];
    const critBarcode = Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE;
    const predictions = [];
    for (const item of items) {
      if (item.type !== undefined && item.type !== critBarcode) continue;
      predictions.push({
        format: String(item.formatString || (typeof item.getFormatString === "function" ? item.getFormatString() : "") || ""),
        text: String(item.text || ""),
        raw_bytes_hex: "",
        confidence: typeof item.confidence === "number" ? item.confidence : null,
      });
    }
    return { predictions, decodeNs, error: null };
  } catch (err) {
    return { predictions: [], decodeNs: Math.round((performance.now() - begin) * 1e6), error: `decoder_error: ${err.message || err}` };
  }
}

// --- main loop -------------------------------------------------------------

async function loadImageCanvas(sample) {
  const begin = performance.now();
  const response = await fetch(`/images/${encodeURI(sample.relative_path)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${sample.relative_path}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  if (sharedCanvas.width !== bitmap.width || sharedCanvas.height !== bitmap.height) {
    sharedCanvas.width = bitmap.width;
    sharedCanvas.height = bitmap.height;
  }
  sharedCtx.drawImage(bitmap, 0, 0);
  const loadNs = Math.round((performance.now() - begin) * 1e6);
  bitmap.close();
  return loadNs;
}

async function postRecord(sample, decoder, decoderVersion, repetition, imageLoadNs, result) {
  await fetch("/record", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sample_id: sample.sample_id,
      decoder,
      decoder_version: decoderVersion,
      repetition,
      image_load_ns: imageLoadNs,
      decode_ns: result.decodeNs,
      error: result.error,
      predictions: result.predictions,
    }),
  });
}

async function runBenchmark() {
  stopRequested = false;
  el.run.disabled = true;
  el.stop.disabled = false;
  window.__bench.phase = "running";
  window.__bench.startedAt = Date.now();
  if (!manifest.length) await loadManifest();

  const totalUnits = manifest.length * repetitions;
  let doneUnits = 0;

  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const sample of manifest) {
      if (stopRequested) break;
      doneUnits++;
      const order = await shuffledDecoders(sample.sample_id, repetition);
      const pending = order.filter(
        (decoder) => !completedKeys.has(`${sample.sample_id}|${decoder}|${repetition}`)
      );
      if (!pending.length) {
        if (doneUnits % 200 === 0) {
          progress(`repetition=${repetition + 1} progress=${doneUnits}/${totalUnits} (all cached)`, doneUnits / totalUnits);
          await new Promise((r) => setTimeout(r));
        }
        continue;
      }

      let imageLoadNs = 0;
      let loadError = null;
      try {
        imageLoadNs = await loadImageCanvas(sample);
      } catch (err) {
        loadError = `input_pipeline_error: ${err.message || err}`;
      }

      for (const decoder of order) {
        const key = `${sample.sample_id}|${decoder}|${repetition}`;
        if (completedKeys.has(key)) continue;
        let result;
        if (loadError) {
          result = { predictions: [], decodeNs: 0, error: loadError };
        } else {
          result = decoder === ZXING_NAME ? await decodeWithZxing(sharedCanvas) : await decodeWithDbr(sharedCanvas);
        }
        await postRecord(
          sample, decoder,
          decoder === ZXING_NAME ? zxingVersion : dbrVersion,
          repetition, loadError ? 0 : imageLoadNs, result
        );
        completedKeys.add(key);
        const s = stats[decoder];
        s.images++;
        s.barcodes += result.predictions.length;
        s.totalDecodeMs += result.decodeNs / 1e6;
        window.__bench.done = completedKeys.size;
      }

      if (doneUnits % 25 === 0 || doneUnits === totalUnits) {
        const elapsed = (Date.now() - window.__bench.startedAt) / 1000;
        const rate = doneUnits / Math.max(1, elapsed);
        const eta = rate ? (totalUnits - doneUnits) / rate : 0;
        progress(
          `repetition=${repetition + 1} image ${doneUnits}/${totalUnits} · ${sample.relative_path} · ` +
          `ETA ${Math.round(eta / 60)} min`,
          doneUnits / totalUnits
        );
        renderLiveStats();
        await new Promise((r) => setTimeout(r));
      }
    }
    if (stopRequested) break;
  }

  window.__bench.phase = stopRequested ? "stopped" : "finished";
  el.run.disabled = false;
  el.stop.disabled = true;
  progress(
    stopRequested
      ? `Stopped by user. ${completedKeys.size} records stored — press Run to resume.`
      : `Finished. ${completedKeys.size} records stored. Press Finalize to build summary.json.`,
    stopRequested ? 0.5 : 1
  );
  renderLiveStats();
}

function renderLiveStats() {
  const rows = [ZXING_NAME, DBR_NAME].map((name) => {
    const s = stats[name];
    const mean = s.images ? (s.totalDecodeMs / s.images).toFixed(2) : "—";
    return `<div class="stat-card"><strong>${name}</strong><span>${s.images} images · ${s.barcodes} barcodes · mean ${mean} ms (session)</span></div>`;
  });
  el.liveStats.innerHTML = rows.join("");
}

async function finalize() {
  el.finalize.disabled = true;
  progress("Finalizing summary…", 1);
  const summary = await (await fetch("/finalize", { method: "POST" })).json();
  renderSummary(summary);
  el.finalize.disabled = false;
}

function renderSummary(summary) {
  const rows = Object.entries(summary.decoders)
    .map(([name, d]) => {
      const recall = (d.coverage_adjusted_recall * 100).toFixed(2);
      const precision = (d.precision * 100).toFixed(2);
      const allRead = (d.image_all_read_rate * 100).toFixed(2);
      return `<tr>
        <td>${name} (${d.records} records)</td>
        <td>${d.correct} / ${d.eligible_instances}</td>
        <td><strong>${recall}%</strong></td>
        <td>${precision}%</td>
        <td>${allRead}%</td>
        <td>${d.mean_decode_ms.toFixed(2)} ms</td>
        <td>${d.median_decode_ms.toFixed(2)} ms</td>
        <td>${d.p95_decode_ms.toFixed(2)} ms</td>
      </tr>`;
    })
    .join("");
  el.summary.innerHTML = `
    <table>
      <thead><tr>
        <th>Decoder</th><th>Correct</th><th>Recall</th><th>Precision</th>
        <th>Image all-read rate</th><th>Mean decode</th><th>Median decode</th><th>P95 decode</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

el.init.addEventListener("click", () =>
  initSdk().catch((err) => setStatus(`Init failed: ${err.message || err}`))
);
el.run.addEventListener("click", () =>
  runBenchmark().catch((err) => progress(`Run failed: ${err.message || err}`, 0))
);
el.stop.addEventListener("click", () => {
  stopRequested = true;
});
el.finalize.addEventListener("click", () =>
  finalize().catch((err) => progress(`Finalize failed: ${err.message || err}`, 1))
);

loadManifest().catch((err) => progress(`Manifest load failed: ${err.message || err}`, 0));
