# BarBeR Barcode Benchmark — JavaScript / WASM

An auditable, resumable benchmark that compares two browser barcode readers on the public
[BarBeR](https://ditto.ing.unimore.it/barber/) real-world dataset:

- **zxing-wasm 3.1.2** (open-source ZXing-C++ compiled to WebAssembly)
- **Dynamsoft Barcode Reader** via `dynamsoft-barcode-reader-bundle` 11.6.5000

It reuses the exact audited manifest from the
[C++](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-cpp-zxing-dynamsoft-barcode-reader.html)
and
[Python](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-python-zxing-dynamsoft-barcode-reader.html)
articles in this series, so the three runs form one controlled experiment: identical input,
identical scoring rules, a different language/runtime binding.

https://github.com/user-attachments/assets/67d1875c-ac11-4b90-8cca-e5e297219363

## How it works

The browser is the natural runtime for both WASM decoders, so the benchmark is split into two halves:

1. **Collector / static server** (`src/server.mjs`, Node.js) — serves the web harness, streams the
   BarBeR dataset images, receives each per-image decode record, scores it with the shared matching
   rules (`src/score.mjs`), and appends it to `results.jsonl`. It also builds `summary.json`,
   `results.json`, and `configs/benchmark_environment.json`.
2. **Browser harness** (`web/`) — loads both SDKs from pinned CDN builds, walks the manifest, and
   times only the decode call.

### Protocol (kept identical to the C++/Python articles)

- The scoring manifest covers **7,894 deduplicated images** with **8,615 original eligible
  annotations**. **204** of those payloads are the unreliable placeholder `^` and are excluded from
  scoring, leaving **8,411 scored ground truth values**.
- Each image is fetched once and decoded into an `ImageBitmap`, then painted onto a shared canvas.
  That fetch + bitmap-decode stage is recorded separately as `image_load_ns` and never enters the
  decode clock.
- Both decoders read the same pixels; only the decoder call is timed (`decode_ns`).
- Decoder order is shuffled per (sample, repetition) with a seeded PRNG so neither side gets a
  systematic warm-up advantage.
- Matching is a /EAN-13 leading zeros, CODE_39 start/stop asterisks, CODE_128 GS1 markers, HTML
  entities, trailing newlines, and a leading `\000001` escape are normalized before scoring. Ground
  truth payload `^` is excluded. DBR `CODE39EXTENDED` results fold into `CODE_39` when the payload
 fixed EAN-13 equivalent, and DBR `CODE39EXTENDED`
  results fold into `CODE_39` when the payload matches.
- Every record is appended to `results.jsonl`, so an interrupted run resumes where it stopped.

## Project layout

```
benchmark/
├── src/
│   ├── server.mjs            # collector + static/image server + scoring + finalize
│   └── score.mjs             # canonical formats, matching, recall/precision/Wilson CI
├── web/
│   ├── index.html            # harness UI
│   ├── benchmark.js          # manifest walk, timing, decode calls
│   └── styles.css
├── tools/
│   ├── validate_results.mjs  # JSONL structure / uniqueness / count checks
│   ├── generate_html_report.mjs  # self-contained report + downloads
│   ├── rematch_results.mjs   # re-score an existing JSONL after matching-rule changes
│   └── generate_benchmark_media.py # cover/poster/slide video (Pillow + ffmpeg)
├── manifests/                # audited BarBeR manifest (shared with the series)
├── configs/                  # benchmark_environment.json (written on finalize)
├── results/                  # results.jsonl / summary.json / results.json
└── report/                   # index.html + downloads/ + media/
```

## Prerequisites

- Node.js 18+ (developed on Node 24)
- The BarBeR dataset images and the audited manifest (this project expects the manifest already
  produced by the series audit under `manifests/`)
- A Dynamsoft license key for the DBR side — get a
  [30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).
  Without a key the harness falls back to a 24-hour public demo license.
- Python 3 + Pillow + ffmpeg (only for regenerating the report media)

## Run the benchmark

Start the collector/static server, pointing it at your BarBeR images:

```bash
node src/server.mjs \
  --images "D:/images/public-barcode-dataset/BarBeR - Dataset/dataset/images" \
  --manifest manifests/benchmark_manifest.jsonl \
  --output results/full \
  --port 8790
```

Then open `http://localhost:8790/` in a browser, click **Initialize SDKs**, optionally paste your
Dynamsoft license key, and click **Run benchmark**. The page walks all 7,894 images; progress and a
per-session mean decode time are shown live. Click **Finalize & summarize** to build
`summary.json` / `results.json` / `configs/benchmark_environment.json`.

A 10-image smoke run is available for a quick sanity check:

```bash
node src/server.mjs \
  --images "D:/images/public-barcode-dataset/BarBeR - Dataset/dataset/images" \
  --manifest manifests/smoke_manifest.jsonl \
  --output results/smoke --port 8790
```

## Validate and build the report

```bash
# structural + count validation
node tools/validate_results.mjs \
  --results results/full/results.jsonl \
  --summary results/full/summary.json \
  --expected-images 7894 --expected-ground-truth 8615 --expected-repetitions 1
# 8615 is the audited annotation count stored in each record.
# Scoring excludes 204 "^" placeholders, so recall uses 8411.

# self-contained HTML report + downloads
node tools/generate_html_report.mjs \
  --inventory manifests/barber_source_files.json \
  --environment configs/benchmark_environment.json \
  --results results/full/results.jsonl \
  --results-json results/full/results.json \
  --summary results/full/summary.json \
  --output report/index.html

# cover image, poster, and slide video (needs Pillow + ffmpeg)
python tools/generate_benchmark_media.py \
  --inventory manifests/barber_source_files.json \
  --summary results/full/summary.json \
  --output report/media

# re-score an existing JSONL after a matching-rule change (no decoder rerun)
node tools/rematch_results.mjs \
  --results results/full/results.jsonl \
  --output results/full
```

## Results

This project, the [C++ benchmark](https://github.com/yushulx/cmake-cpp-barcode-qrcode-mrz/tree/main/examples/benchmark) and the [Python benchmark](https://github.com/yushulx/python-barcode-qrcode-sdk/tree/main/examples/official/benchmark) all run the identical manifest on DBR 11.6.5000, so the three are a same-version cross-runtime comparison.

The current full run uses one repetition on 7,894 unique BarBeR images. Recall is calculated as
correct ground truth matches divided by 8,411 scored ground truth instances. Precision is calculated
as correct predictions divided by evaluated predictions, where evaluated predictions are
`correct + wrong_text + wrong_format + extra_result`.

| Decoder | Correct | Recall | Precision | Wrong reads | No read | Mean decode time | Median decode time | P95 decode time |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dynamsoft Barcode Reader JS 11.6.5000 | **7,638 / 8,411** | **90.81%** | **95.97%** | 90 (1.07%) | 683 (8.12%) | **121.05 ms** | 95.50 ms | **298.40 ms** |
| zxing-wasm 3.1.2 | 5,958 / 8,411 | 70.84% | 94.96% | 154 (1.83%) | 2,299 (27.33%) | 116.22 ms | 70.20 ms | 389.70 ms |

Failures are split into **wrong reads** (`wrong_text + wrong_format`) and **no read** (`not_found + unsupported_format + decoder_error`), so correct + wrong reads + no read equals the 8,411 scored ground-truth instances. Extra results beyond the ground truth affect precision, not this split. `image_all_read_rate` is retained in `summary.json` only as a diagnostic.


DBR read 1,680 more ground truth barcodes in this run, a lead of 19.97 percentage points in recall and 1.00 points in precision. DBR produced 90 wrong reads against 154, and 683 no-reads against 2,299. zxing-wasm had the lower mean decode time (116.22 ms versus 121.05 ms) but the slower P95 (389.70 ms versus 298.40 ms). Five images failed browser image decode for both readers and are counted as no-reads (`decoder_error` in `outcomes`).


See `report/index.html` for the full interactive report (searchable per-image records, dataset audit
card, method and disclosures). The raw `results.jsonl`, combined `results.json`, `summary.json`,
source inventory, and environment snapshot all ship under `report/downloads/` so any reviewer can
re-check the numbers.

## Disclosure

Dynamsoft, the developer of Dynamsoft Barcode Reader, built and published this benchmark. BarBeR
itself is an independent public dataset whose standardized annotations were produced with help from
proprietary Datalogic software. Source hashes, exclusion lists, configurations, raw records, and the
generated report all ship with the project so anyone can re-check the comparison.

## Blog
[https://www.dynamsoft.com/codepool/benchmark-barcode-reading-javascript-zxing-wasm-dynamsoft-barcode-reader.html](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-javascript-zxing-wasm-dynamsoft-barcode-reader.html)
