# BarBeR Barcode Benchmark — JavaScript / WASM

An auditable, resumable benchmark that compares two browser barcode readers on the public
[BarBeR](https://ditto.ing.unimore.it/barber/) real-world dataset:

- **zxing-wasm 3.1.2** (open-source ZXing-C++ compiled to WebAssembly)
- **Dynamsoft Barcode Reader** via `dynamsoft-barcode-reader-bundle` 11.4.3000

It reuses the exact audited manifest from the
[C++](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-cpp-zxing-dynamsoft-barcode-reader.html)
and
[Python](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-python-zxing-dynamsoft-barcode-reader.html)
articles in this series, so the three runs form one controlled experiment: identical input,
identical scoring rules, a different language/runtime binding.

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

The current full run uses one repetition on 7,894 unique BarBeR images. Recall is calculated as
correct ground truth matches divided by 8,411 scored ground truth instances. Precision is calculated
as correct predictions divided by evaluated predictions, where evaluated predictions are
`correct + wrong_text + wrong_format + extra_result`.

| Decoder | Correct | Recall | Precision | Image all-read rate | Mean decode time | Median decode time | P95 decode time |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dynamsoft Barcode Reader JS 11.4.3000 | **7,637 / 8,411** | **90.80%** | **95.93%** | **90.77%** | 127.00 ms | 100.20 ms | 313.80 ms |
| zxing-wasm 3.1.2 | 5,958 / 8,411 | 70.84% | 94.96% | 70.66% | 121.75 ms | 74.10 ms | 409.10 ms |

DBR read 1,679 more ground truth barcodes in this run and improved recall by 19.96 percentage
points. DBR also had 0.97 percentage points higher precision. zxing-wasm had the lower mean decode
time in this browser run (121.75 ms versus 127.00 ms). Five images failed browser image decode for
both readers and are recorded as `input_pipeline_error`, not as no-reads.

See `report/index.html` for the full interactive report (searchable per-image records, dataset audit
card, method and disclosures). The raw `results.jsonl`, combined `results.json`, `summary.json`,
source inventory, and environment snapshot all ship under `report/downloads/` so any reviewer can
re-check the numbers.

## Disclosure

Dynamsoft, the developer of Dynamsoft Barcode Reader, built and published this benchmark. BarBeR
itself is an independent public dataset whose standardized annotations were produced with help from
proprietary Datalogic software. Source hashes, exclusion lists, configurations, raw records, and the
generated report all ship with the project so anyone can re-check the comparison.
