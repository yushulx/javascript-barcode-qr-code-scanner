# JavaScript MRZ SDK Benchmark: Dynamsoft vs Scanbot

A browser-based benchmark that compares **Dynamsoft Capture Vision** and **Scanbot Web SDK** on MRZ (Machine Readable Zone) recognition: exact-match accuracy against ground truth, character-level match rate, and per-image scan latency, with a side-by-side comparison and an exportable HTML report.


https://github.com/user-attachments/assets/1a4b572f-e7ad-4891-9f4f-f11616add1f5


## Benchmark Results (MIDV-500, 3,315 images)

Run on the curated 3,315-image [MIDV-500](https://github.com/fcakyon/midv500) MRZ subset (mobile-phone video frames — see the companion article series for dataset details). Full results: [`mrz_benchmark_dynamsoft_vs_scanbot.html`](mrz_benchmark_dynamsoft_vs_scanbot.html).

| Metric | Dynamsoft Capture Vision | Scanbot Web SDK 8.1.1 |
|---|---|---|
| **Exact Accuracy** | **46.49% (1541/3315)** | 42.78% (1418/3315) |
| Success Rate | 58.73% (1947/3315) | **63.86% (2117/3315)** |
| **Avg Scan Time** | **650.7 ms** | 691.8 ms |
| **P50 Latency** | **411.0 ms** | 696.8 ms |
| P95 Latency | 2063.0 ms | **884.3 ms** |

- **Dynamsoft produced 123 more fully correct reads** (+3.71 pp exact accuracy) — the metric that matters for identity verification, where one wrong character invalidates the result.
- **Dynamsoft's median scan was ~41% faster** (411 ms vs 696.8 ms).
- Scanbot returned raw MRZ text more often, but more of those strings contained at least one wrong character.


## Features

- Drag & drop batch image/folder loading
- Ground-truth CSV import (exact accuracy + per-image match rate; unmatched images auto-filtered)
- Side-by-side vendor comparison with "best of N" timing
- Metrics: exact accuracy, success rate, match rate, avg/min/max, P50/P95/P99
- Self-contained HTML report export

## Getting Started

### Prerequisites

- MRZ images — e.g. the MIDV-500 subset preprocessed into `CA/`–`TS/` folders matching `labels.csv` (preparation: [companion article](https://www.dynamsoft.com/codepool/benchmark-mrz-recognition-midv500-dataset-python.html))
- A Dynamsoft license key — [get a 30-day free trial](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)
- (Optional) A Scanbot license key

### Run

```bash
cd examples/mrz-sdk-benchmark
python -m http.server 8000
# open http://localhost:8000 (or just open index.html)
```

### Usage

1. Click the gear icon and activate Dynamsoft (and optionally Scanbot).
2. Drag MRZ images or a dataset folder into the upload zone.
3. (Optional) Import a ground-truth CSV.
4. Click **Run Benchmark**, then **Export HTML Report** to save the results.

### Ground Truth CSV Format

```csv
"imagepath","label"
"CA/CA05_01.JPG","PCAZEHUSEYNLI<<ORKHAN<<<<<<<<<<<<<<<<<<<<<<<#X110003442AZE7503153M230801030LJV5Z<<<<<<<86#"
```

MRZ lines are joined by `#`; images match labels by the last two path segments, lowercase, without extension.

## Project Structure

```
mrz-sdk-benchmark/
├── index.html      # Benchmark UI
├── main.js         # SDK init, image loading, benchmark loop, metrics
├── report.js       # Self-contained HTML report generator
├── styles.css      # UI styles
├── labels.csv      # Curated MIDV-500 ground truth (3,315 entries)
├── mrz_benchmark_dynamsoft_vs_scanbot.html  # Exported report
└── assets/         # Cover image, demo video, screenshots
```

## How the Measurement Works

- **Scan time** wraps only the recognition call (`cvr.capture(dataUrl, "ReadMRZ")` / `mrzEngine.run(image)`), measured with `performance.now()`.
- **Exact match** = character-level match rate ≥ 99.999% after normalization (uppercase, strip non `[A-Z0-9<]`, join lines).
- **Match rate** = position-wise character agreement over the max length of recognized vs ground-truth MRZ.
- "Best of N" runs keep the fastest scan time per image.

