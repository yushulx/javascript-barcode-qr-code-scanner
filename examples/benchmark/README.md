# BarBeR Barcode Benchmark — JavaScript / WASM

An auditable, resumable benchmark that compares three browser barcode readers on the public
[BarBeR](https://ditto.ing.unimore.it/barber/) real-world dataset:

- **zxing-wasm 3.1.2** (open-source ZXing-C++ compiled to WebAssembly)
- **Dynamsoft Barcode Reader** via `dynamsoft-barcode-reader-bundle` 11.6.5000
- **Scandit Data Capture SDK 8.7.1** via `@scandit/web-datacapture-core` and
  `@scandit/web-datacapture-barcode`

All three walk the same manifest and are scored by the same matching rules; adding Scandit did
not change the protocol, the ground truth, or the normalization applied to the existing two
decoders. It reuses the exact audited manifest from the
[C++](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-cpp-zxing-dynamsoft-barcode-reader.html)
and
[Python](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-python-zxing-dynamsoft-barcode-reader.html)
articles in this series, so the three runs form one controlled experiment: identical input,
identical scoring rules, a different language/runtime binding.

https://github.com/user-attachments/assets/67d1875c-ac11-4b90-8cca-e5e297219363

## How it works

The browser is the natural runtime for these WASM decoders, so the benchmark is split into two halves:

1. **Collector / static server** (`src/server.mjs`, Node.js) — serves the web harness, streams the
   BarBeR dataset images, receives each per-image decode record, scores it with the shared matching
   rules (`src/score.mjs`), and appends it to `results.jsonl`. It also builds `summary.json`,
   `results.json`, and `configs/benchmark_environment.json`.
2. **Browser harness** (`web/`) — loads zxing-wasm and DBR from pinned CDN builds and Scandit from
   locally pinned npm packages (served at `/scandit/` through an import map), walks the manifest,
   and times only the decode call.

Scandit has no single-shot "decode this image" API, so it runs in **BarcodeBatch / MatrixScan**
mode: for each image the harness builds one `ImageFrameSource` from the shared canvas' `ImageData`,
sets it as the frame source, enables the mode, and waits for `didUpdateSession` (which fires for
every processed frame, with or without barcodes). The frame source emits exactly one frame and
turns itself off. All decoded barcodes in that frame come back in `addedTrackedBarcodes`.
`zxing-wasm` reads `ImageData`, DBR reads the canvas, and Scandit reads the same pixels.

### Protocol (kept identical to the C++/Python articles)

- The scoring manifest covers **7,894 deduplicated images** with **8,615 original eligible
  annotations**. **204** of those payloads are the unreliable placeholder `^` and are excluded from
  scoring, leaving **8,411 scored ground truth values**.
- Each image is fetched once and decoded into an `ImageBitmap`, then painted onto a shared canvas.
  That fetch + bitmap-decode stage is recorded separately as `image_load_ns` and never enters the
  decode clock.
- All three decoders read the same pixels; only the decoder call is timed (`decode_ns`).
- Decoder order is shuffled per (sample, repetition) with a seeded PRNG so no decoder gets a
  systematic warm-up advantage.
- Scandit reports EAN-13 and UPC-A as one combined `ean13Upca` symbology and returns UPC-A
  payloads as 13 digits with a leading zero. The harness splits that symbology by payload length
  into `EAN_13` / `UPC_A`; the existing UPC-A/EAN-13 bridge in `score.mjs` handles the remaining
  leading-zero cases. Scandit has no `JAPAN_POST` or `POSTNET` symbology (17 + 6 BarBeR
  annotations), so those are scored as `unsupported_format`, the same treatment zxing-wasm gets
  for formats it cannot decode.
- The supported-format sets are keyed by `canonicalFormat()` output. Protocol v1 stripped
  punctuation before the lookup, so the BarBeR labels `ROYAL_MAIL`, `IATA_2_OF_5` and
  `USPS_INTELLIGENT_MAIL` reduced to `ROYALMAIL` / `IATA2OF5` / `USPSINTELLIGENTMAIL` and matched no
  decoder's supported set — 196 readable annotations were scored as `unsupported_format` for **all
  three** decoders, and the barcodes the readers did return were set aside. `FORMAT_MAPPING` now maps
  those three stripped spellings back to the underscored canonical names.
- Matching is a one-to-one multiset match on canonical format plus exact normalized payload.
  UPC-A/EAN-13 leading zeros, CODE_39 start/stop asterisks, CODE_128 GS1 markers, HTML entities,
  trailing newlines, and a leading `\000001` escape are normalized before scoring. Ground truth
  payload `^` is excluded, and DBR `CODE39EXTENDED` output is treated as `CODE_39`.
- `CODE_128` and `GS1_128` are matched as one format family. GS1-128 is Code 128
  carrying GS1 data — same bars, same code sets, same check character, with an FNC1 in the first data
  position as the only difference (AIM separates them as `]C0` / `]C1`). DBR signals that with a
  `{GS}` payload prefix, zxing with the AIM identifier, Scandit with a carrier flag; scoring the name
  a vendor happens to use charged Scandit with 172 wrong formats on the Linux run and DBR / ZXing
  with 4 each on both runs. Payloads still have to match exactly.
- Two payload equivalences were added in v2. GS1 application identifiers printed in parentheses are
  unwrapped for `CODE_128` / `GS1_128`, so zxing-wasm's `(90)85320` matches the annotation
  `9085320`. A `ROYAL_MAIL` payload that is the annotation's prefix one character shorter counts as
  the same reading, because the DBR Linux build returns 10 of the 11 characters; the rule is limited
  to that symbology and to a single missing character.
- Every record is appended to `results.jsonl`, so an interrupted run resumes where it stopped.
  Records re-scored by `rematch_results.mjs` carry `"protocol": "protocol-js-v2"`.

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
│   ├── run_headless.mjs      # headless Chrome driver + resumable run + finalize
│   ├── validate_results.mjs  # JSONL structure / uniqueness / count checks
│   ├── generate_html_report.mjs  # self-contained report + downloads
│   ├── rematch_results.mjs   # re-score an existing JSONL after matching-rule changes
│   └── generate_benchmark_media.py # cover/poster/slide video (Pillow + ffmpeg)
├── manifests/                # audited BarBeR manifest (shared with the series)
├── configs/                  # benchmark_environment.json (written on finalize)
├── results/                  # results.jsonl / summary.json / results.json
├── report/                   # index.html + downloads/ + media/
├── node_modules/@scandit/    # pinned Scandit packages, served locally via import map
└── .gitignore                # keeps node_modules out of version control
```

## Prerequisites

- Node.js 18+ (developed on Node 24) and `npm install` in this directory (pinned Scandit 8.7.1
  packages plus `puppeteer-core` for the headless runner)
- The BarBeR dataset images and the audited manifest (this project expects the manifest already
  produced by the series audit under `manifests/`)
- A Dynamsoft license key for the DBR side — get a
  [30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).
  Without a key the harness falls back to a 24-hour public demo license.
- A **Scandit web trial license key** for the Scandit side — get one from
  [Scandit's trial page](https://www.scandit.com/trial/). There is no fallback key; the harness
  refuses to initialize without one. It is supplied at runtime (input box, or the
  `SCANDIT_LICENSE_KEY` environment variable for the headless runner) and is never written into
  the repository.
- A local Chrome/Edge installation for `tools/run_headless.mjs` (default: Chrome on Windows)
- Python 3 + Pillow + ffmpeg (only for regenerating the report media)

## Run the benchmark

The easiest way to reproduce the full run is the headless driver. It starts the collector server,
initializes all three SDKs (injecting the Scandit key from the environment), walks all 7,894
images, resumes from any records already in `results.jsonl`, restarts the browser periodically to
bound WASM memory, and calls `/finalize` automatically:

```bash
SCANDIT_LICENSE_KEY='<your Scandit web trial key>' node tools/run_headless.mjs \
  --images "D:/images/BarBeR_Dataset/BarBeR - Dataset/dataset/images" \
  --manifest manifests/benchmark_manifest.jsonl \
  --output results/full \
  --port 8790
```

Adjust `--images` to your local BarBeR checkout. Useful options: `--restart-every 3000`
(records per browser session), `--stall-seconds 300`, `--chrome <path>`, `--repetitions 1`.
A 10-image smoke run is available for a quick sanity check — swap in
`manifests/smoke_manifest.jsonl` and `--output results/smoke`.

To drive the harness manually instead, start the collector/static server:

```bash
node src/server.mjs \
  --images "D:/images/BarBeR_Dataset/BarBeR - Dataset/dataset/images" \
  --manifest manifests/benchmark_manifest.jsonl \
  --output results/full \
  --port 8790
```

Then open `http://localhost:8790/` in a browser, paste the Scandit trial key (required) and
optionally a Dynamsoft license key, click **Initialize SDKs**, then **Run benchmark**. The page
walks all 7,894 images; progress and a per-session mean decode time are shown live. Click
**Finalize & summarize** to build `summary.json` / `results.json` /
`configs/benchmark_environment.json`. The collector is resumable: an interrupted run can simply
be restarted and it will skip records already present in `results.jsonl`.

## Validate and build the report

```bash
# structural + count validation
node tools/validate_results.mjs \
  --results results/full/results.jsonl \
  --summary results/full/summary.json \
  --expected-images 7894 --expected-ground-truth 8615 --expected-repetitions 1
# 8615 is the audited annotation count stored in each record.
# Scoring excludes 204 "^" placeholders, so recall uses 8411.
# Three decoders x 7894 images x 1 repetition = 23,682 records.

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

This project, the [C++ benchmark](https://github.com/yushulx/cmake-cpp-barcode-qrcode-mrz/tree/main/examples/benchmark) and the [Python benchmark](https://github.com/yushulx/python-barcode-qrcode-sdk/tree/main/examples/official/benchmark) all run the identical manifest on DBR 11.6.5000, so those three remain a same-version cross-runtime comparison. Within this JavaScript run, three decoders are compared.

The full run uses one repetition on 7,894 unique BarBeR images, i.e. 23,682 per-image decode
records. Recall is calculated as correct ground truth matches divided by 8,411 scored ground truth
instances. Every annotation ends in exactly one of correct, wrong read or no read, and the three sum
to 8,411 for all three decoders.

| Decoder | Correct | Recall | Wrong reads | No read | Mean decode | Median decode | P95 decode |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dynamsoft Barcode Reader JS 11.6.5000 | **7,642 / 8,411** | **90.86%** | 86 (1.02%) | 683 (8.12%) | 157.88 ms | 125.75 ms | 380.20 ms |
| Scandit Data Capture SDK 8.7.1 | 7,593 / 8,411 | 90.27% | **81 (0.96%)** | 737 (8.76%) | **92.42 ms** | **76.80 ms** | **202.60 ms** |
| zxing-wasm 3.1.2 | 6,023 / 8,411 | 71.61% | 90 (1.07%) | 2,298 (27.32%) | 144.54 ms | 88.20 ms | 476.00 ms |

Failures are split into **wrong reads** (`wrong_text + wrong_format`) and **no read** (`not_found + unsupported_format + decoder_error`), so correct + wrong reads + no read equals the 8,411 scored ground-truth instances. A prediction that no annotation claims is not a fourth outcome — the harness cannot tell an unannotated barcode from a hallucination on BarBeR — so it is set aside rather than charged to an instance. `image_all_read_rate` is retained in `summary.json` only as a diagnostic.

> **No precision column.** Precision would be correct predictions over all predictions, and its
> denominator is the predictions rather than the annotations. On BarBeR that ratio is dominated by
> the fact that the annotations are curated rather than exhaustive: a second barcode on the same
> photograph, or a symbology the dataset does not cover, is charged as a false positive. It measures
> annotation coverage as much as decoder error, so it is not reported.

DBR read 49 more ground truth barcodes than Scandit, a lead of 0.59 percentage points in recall.
Scandit read 1,570 more than zxing-wasm, a lead of 18.66 points in recall, and produced the fewest
wrong reads (81 against DBR's 86 and zxing-wasm's 90). Scandit was the fastest decoder on every
timing measure: 92.42 ms mean (versus 157.88 ms DBR and 144.54 ms zxing-wasm), 76.80 ms median and
202.60 ms P95, both the lowest of the three. DBR's lead over Scandit comes from the no-read column —
683 against 737 — and Scandit's 23 unsupported annotations are the only ones either decoder cannot
attempt. Five images could not be decoded by the browser at all and are counted as no-reads
(`decoder_error` in `outcomes`) for all three decoders; `validate_results.mjs` reports these 15
records as errors by design.

Against the original two-decoder run, DBR gains 4 correct readings under protocol v2 (7,638 →
7,642, from the GS1 format family) and zxing-wasm gains 65 (5,958 → 6,023: 61 from the GS1
parenthesis rule and 4 from the same family rule). Only the decode times differ from the earlier run,
because this one used headless Chrome on different hardware.

### Post-run correction (auditable)

The first full pass labeled Scandit Code 128 results carrying Scandit's `isGS1DataCarrier` flag as
`GS1_128`. BarBeR has only 4 `GS1_128` annotations but 1,120 `CODE_128` ones, so this created 171
spurious `wrong_format` outcomes. The harness now labels every Code 128 result `CODE_128`, matching
the convention used by the other two decoders, and the JSONL was re-scored with
`tools/rematch_results.mjs`. **No matching rules, ground truth, or other decoder's results changed.**
The pre-correction raw stream is kept in the source project (not shipped in this dataset
repository); under those labels Scandit scored 7,287 / 8,411 (86.64% recall, 252 wrong reads).

See `report/index.html` for the full interactive report (searchable per-image records, dataset audit
card, method and disclosures). The raw `results/full/results.jsonl`, `results/full/summary.json`,
the audited source inventory (`manifests/barber_source_files.json`) and the environment snapshot
(`configs/benchmark_environment.json`) ship with this directory so any reviewer can re-check the
numbers.

## Disclosure

Dynamsoft, the developer of Dynamsoft Barcode Reader, built and published this benchmark. ZXing and
Scandit are third-party products evaluated with their standard, publicly documented settings;
Scandit was measured with a web trial license and locally pinned 8.7.1 packages. Scandit ran in
single-threaded SIMD WASM mode because the local server does not send the COOP/COEP headers
needed for multithreading; the same browser context was used for all three decoders. BarBeR itself
is an independent public dataset whose standardized annotations were produced with help from
proprietary Datalogic software. Source hashes, exclusion lists, configurations, raw records, and the
generated report all ship with the project so anyone can re-check the comparison.

## Blog
[https://www.dynamsoft.com/codepool/benchmark-barcode-reading-javascript-zxing-wasm-dynamsoft-barcode-reader.html](https://www.dynamsoft.com/codepool/benchmark-barcode-reading-javascript-zxing-wasm-dynamsoft-barcode-reader.html)
