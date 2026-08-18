/**
 * Scoring library for the zxing-wasm vs. Dynamsoft Barcode Reader JS benchmark.
 * Faithful port of the Python/C++ series harness (protocol-v1):
 * - canonical format mapping plus payload normalization (UPC-A / EAN-13, CODE_39 asterisks,
 *   CODE_128 GS1 markers, HTML entities, trailing newlines, leading \\000001)
 * - one-to-one multiset matching (correct / wrong_text / wrong_format / not_found / extra_result)
 * - recall, precision, Wilson CI, decode-time statistics
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROTOCOL = "protocol-js-v1";
export const DEFAULT_LICENSE =
  "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";

export const ZXING = "zxing-wasm";
export const DBR = "dynamsoft-dbr-js";

// zxing-wasm 3.x ships the same zxing-cpp core formats used by the Python harness.
export const ZXING_SUPPORTED = new Set([
  "AZTEC", "CODE_128", "GS1_128", "CODE_39", "DATA_MATRIX", "EAN_13",
  "EAN_8", "EAN_2", "ITF", "PDF_417", "QR_CODE", "UPC_A", "UPC_E",
]);
export const DBR_SUPPORTED = new Set([
  "AZTEC", "CODE_128", "GS1_128", "CODE_39", "DATA_MATRIX", "EAN_13",
  "EAN_8", "EAN_2", "ITF", "IATA_2_OF_5", "USPS_INTELLIGENT_MAIL",
  "JAPAN_POST", "KIX", "PDF_417", "POSTNET", "QR_CODE", "ROYAL_MAIL",
  "UPC_A", "UPC_E",
]);

const FORMAT_MAPPING = {
  AZTEC: "AZTEC", C128: "CODE_128", CODE128: "CODE_128",
  UCC128: "GS1_128", GS1128: "GS1_128",
  C39: "CODE_39", CODE39: "CODE_39", CODE39EXTENDED: "CODE_39",
  DATAMATRIX: "DATA_MATRIX", EAN13: "EAN_13", EAN8: "EAN_8",
  "2DIGIT": "EAN_2", EAN2: "EAN_2",
  I2O5: "ITF", ITF: "ITF", INTERLEAVED2OF5: "ITF",
  IATA25: "IATA_2_OF_5", INTELLIGENTMAIL: "USPS_INTELLIGENT_MAIL",
  JAPANPOST: "JAPAN_POST", KIX: "KIX", PDF417: "PDF_417",
  POSTNET: "POSTNET", QR: "QR_CODE", QRCODE: "QR_CODE",
  ROYALMAILCODE: "ROYAL_MAIL", UPCA: "UPC_A", UPC_S: "UPC_A", UPC: "UPC_A",
  UPCE: "UPC_E", "1D": "GENERIC_1D", GENERIC1D: "GENERIC_1D",
  UNKNOWN: "UNKNOWN", "1": "UNKNOWN",
};

export function canonicalFormat(value) {
  const key = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return FORMAT_MAPPING[key] || key;
}

function unescapeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function stripLeadingGs1Marker(value) {
  for (;;) {
    if (value.startsWith("{GS}")) {
      value = value.slice(4);
      continue;
    }
    if (value.startsWith("{FNC1}")) {
      value = value.slice(6);
      continue;
    }
    if (value.startsWith("\u001d")) {
      value = value.slice(1);
      continue;
    }
    return value;
  }
}

export function isUnreliablePlaceholder(payload) {
  return payload === "^";
}

export function normalizedPayload(fmt, payload) {
  let result = unescapeHtmlEntities(payload).replace(/[\r\n]+$/, "");
  if (result.startsWith("\\000001")) result = result.slice(7);
  fmt = canonicalFormat(fmt);
  if (fmt === "UPC_A" && result.length === 13 && result.startsWith("0")) {
    return result.slice(1);
  }
  if (fmt === "CODE_39" && result.length >= 2 && result.startsWith("*") && result.endsWith("*")) {
    return result.slice(1, -1);
  }
  if (fmt === "CODE_128" || fmt === "GS1_128") {
    return stripLeadingGs1Marker(result);
  }
  return result;
}

export function isSupported(decoder, fmt) {
  const supported = decoder === ZXING ? ZXING_SUPPORTED : DBR_SUPPORTED;
  return supported.has(canonicalFormat(fmt));
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function matchResults(truth, predictions, decoder) {
  const output = [];
  const used = new Array(predictions.length).fill(false);
  for (let ti = 0; ti < truth.length; ti++) {
    const gt = truth[ti];
    if (!gt.decode_eligible) continue;
    if (isUnreliablePlaceholder(gt.text)) continue;
    if (!isSupported(decoder, gt.format)) {
      output.push({ truth_index: ti, prediction_index: null, outcome: "unsupported_format" });
      continue;
    }
    const gtFmt = canonicalFormat(gt.format);
    const gtText = normalizedPayload(gtFmt, gt.text);
    let exact = null;
    for (let pi = 0; pi < predictions.length; pi++) {
      if (used[pi]) continue;
      const pf = canonicalFormat(predictions[pi].format);
      const pt = normalizedPayload(pf, predictions[pi].text);
      const upcEanBridge =
        new Set([pf, gtFmt]).size === 2 &&
        new Set([pf, gtFmt]).has("UPC_A") &&
        new Set([pf, gtFmt]).has("EAN_13") &&
        normalizedPayload("UPC_A", predictions[pi].text) === normalizedPayload("UPC_A", gt.text);
      if ((pf === gtFmt && pt === gtText) || upcEanBridge) {
        exact = pi;
        break;
      }
    }
    if (exact !== null) {
      used[exact] = true;
      output.push({ truth_index: ti, prediction_index: exact, outcome: "correct" });
      continue;
    }
    let sameText = null;
    let sameFormat = null;
    for (let pi = 0; pi < predictions.length; pi++) {
      if (used[pi]) continue;
      const pf = canonicalFormat(predictions[pi].format);
      if (sameText === null && normalizedPayload(pf, predictions[pi].text) === gtText) sameText = pi;
      if (sameFormat === null && pf === gtFmt) sameFormat = pi;
    }
    if (sameText !== null) {
      used[sameText] = true;
      output.push({ truth_index: ti, prediction_index: sameText, outcome: "wrong_format" });
    } else if (sameFormat !== null) {
      used[sameFormat] = true;
      output.push({ truth_index: ti, prediction_index: sameFormat, outcome: "wrong_text" });
    } else {
      output.push({ truth_index: ti, prediction_index: null, outcome: "not_found" });
    }
  }
  for (let pi = 0; pi < used.length; pi++) {
    if (!used[pi]) output.push({ truth_index: null, prediction_index: pi, outcome: "extra_result" });
  }
  return output;
}

function wilsonInterval(successes, total) {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const phat = successes / total;
  const denom = 1 + (z * z) / total;
  const centre = phat + (z * z) / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);
  return [(centre - margin) / denom, (centre + margin) / denom];
}

function percentile(values, q) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(q * (ordered.length - 1))] / 1e6;
}

export function generateSummary(records, { title } = {}) {
  const totals = {};
  const ensure = (name) => {
    if (!totals[name]) {
      totals[name] = {
        records: 0, eligible: 0, correct: 0, unsupported: 0, errors: 0,
        commonEligible: 0, commonCorrect: 0, imageAllRead: 0,
        decodeNs: 0, outcomes: {}, byFormat: {}, bySource: {}, timings: [],
      };
    }
    return totals[name];
  };
  for (const row of records) {
    const c = ensure(row.decoder);
    c.records += 1;
    const decodeNs = Number(row.decode_ns || 0);
    c.decodeNs += decodeNs;
    c.timings.push(decodeNs);
    if (row.error) c.errors += 1;
    let allRead = !row.error;
    for (const match of row.matches) {
      const outcome = match.outcome;
      c.outcomes[outcome] = (c.outcomes[outcome] || 0) + 1;
      if (outcome !== "extra_result") c.eligible += 1;
      if (outcome === "correct") c.correct += 1;
      if (outcome === "unsupported_format") c.unsupported += 1;
      if (outcome !== "correct" && outcome !== "extra_result") allRead = false;
      if (match.truth_index !== null && match.truth_index !== undefined) {
        const truth = row.ground_truth[match.truth_index];
        const fmt = truth.format || "";
        c.byFormat[fmt] = c.byFormat[fmt] || {};
        c.byFormat[fmt][outcome] = (c.byFormat[fmt][outcome] || 0) + 1;
        const source = row.annotation_file || "";
        c.bySource[source] = c.bySource[source] || {};
        c.bySource[source][outcome] = (c.bySource[source][outcome] || 0) + 1;
        if (isSupported(ZXING, fmt) && isSupported(DBR, fmt)) {
          c.commonEligible += 1;
          if (outcome === "correct") c.commonCorrect += 1;
        }
      }
    }
    if (allRead) c.imageAllRead += 1;
  }

  const decoders = {};
  for (const [name, c] of Object.entries(totals)) {
    const falsePredictions = (c.outcomes.wrong_text || 0) + (c.outcomes.wrong_format || 0) + (c.outcomes.extra_result || 0);
    const precision = c.correct + falsePredictions ? c.correct / (c.correct + falsePredictions) : 0;
    const recall = c.eligible ? c.correct / c.eligible : 0;
    const supportedDenominator = c.eligible - c.unsupported;
    decoders[name] = {
      records: c.records,
      eligible_instances: c.eligible,
      correct: c.correct,
      unsupported: c.unsupported,
      errors: c.errors,
      outcomes: c.outcomes,
      coverage_adjusted_recall: recall,
      coverage_adjusted_recall_ci95: wilsonInterval(c.correct, c.eligible),
      common_format_eligible: c.commonEligible,
      common_format_correct: c.commonCorrect,
      common_format_recall: c.commonEligible ? c.commonCorrect / c.commonEligible : 0,
      common_format_recall_ci95: wilsonInterval(c.commonCorrect, c.commonEligible),
      supported_format_recall: supportedDenominator ? c.correct / supportedDenominator : 0,
      precision,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
      image_all_read_rate: c.records ? c.imageAllRead / c.records : 0,
      by_format: c.byFormat,
      by_source: c.bySource,
      mean_decode_ms: c.records ? c.decodeNs / c.records / 1e6 : 0,
      median_decode_ms: c.timings.length ? median(c.timings) / 1e6 : 0,
      p90_decode_ms: percentile(c.timings, 0.9),
      p95_decode_ms: percentile(c.timings, 0.95),
      p99_decode_ms: percentile(c.timings, 0.99),
      total_decode_ms: c.decodeNs / 1e6,
    };
  }
  return {
    title: title || "ZXing WASM vs. Dynamsoft Barcode Reader JavaScript",
    dataset: "BarBeR public dataset",
    disclosure:
      "This benchmark compares JavaScript/WASM barcode readers on the public third-party BarBeR dataset. To make the comparison auditable, the protocol, decoder configurations, environment details, dataset manifest, HTML report, and per-image raw results are provided. BarBeR's standardized annotations were generated with assistance from proprietary Datalogic software. Difficult undecodable barcode regions are excluded from decoding accuracy when no reliable payload is available.",
    decoders,
  };
}

export function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
}

export { path };
