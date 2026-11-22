# Online Barcode & QR Code Generator

A plain JavaScript web demo that encodes text into **13 barcode symbologies** and
lays the symbols out on a single canvas you can download as a PNG. It uses
[bwip-js](https://github.com/metafloor/bwip-js) to render the symbols and runs
entirely in the browser — no SDK, no license key, no upload.

A second mode turns it into a **stress-test dataset generator**: many symbols per image with a
configurable set of capture degradations applied, exported as a ZIP of images plus
`annotations.json` ground truth for the
[online barcode scanner](https://www.dynamsoft.com/codepool/demos/barcode-scanner/)'s benchmark to score against.

## Online Demo

https://www.dynamsoft.com/codepool/demos/barcode-qrcode-generator/

## What It Does

- Encodes text into six 2D symbologies (QR Code, Data Matrix, PDF417, Aztec Code,
  MaxiCode, DotCode) and seven 1D symbologies (EAN-13, Code 128, Code 39, ITF, MSI,
  Pharmacode, Codabar).
- Renders a grid of up to 6 × 6 symbols on one canvas, each cell labelled with its
  symbology and, for 2D symbols, the encoded value.
- Fills the grid with sample data: <em>Randomize values</em> keeps the selected
  symbology and generates a fresh valid value per cell, <em>Random types</em> picks a
  random symbology per cell.
- Validates input per symbology before rendering (EAN-13 needs 12 or 13 digits,
  Code 39 capitals, Pharmacode 3–131070, …) and explains what is wrong instead of
  failing silently.
- Exports the grid as a PNG (1:1, no resampling) or copies it to the clipboard.
- **Stress test mode**: builds a reproducible dataset of degraded images with known expected
  results, and exports it as a ZIP for benchmarking.

## Symbologies

| Symbology | Kind | Input |
|---|---|---|
| QR Code | 2D | Any text or URL |
| Data Matrix | 2D | Any text |
| PDF417 | 2D | Any text |
| Aztec Code | 2D | Any text |
| MaxiCode | 2D | Up to 93 characters |
| DotCode | 2D | Any text |
| EAN-13 | 1D | 12 digits (the 13th is the check digit) or 13 digits |
| Code 128 | 1D | Any ASCII text |
| Code 39 | 1D | Digits, capitals, space, `- . $ / + %` |
| ITF | 1D | Digits (an odd count gets a leading zero) |
| MSI | 1D | Digits (a Mod-10 check digit is appended) |
| Pharmacode | 1D | A number from 3 to 131070 |
| Codabar | 1D | Digits and `- $ : / . +` between start/stop `A`–`D` |

## How to Test a Scanner

1. Type a payload, pick a symbology and click **Generate barcode**.
2. Click **Download PNG**.
3. Upload the PNG to the
   [online barcode scanner](https://www.dynamsoft.com/codepool/demos/barcode-scanner/)
   and compare the decoded text with what you encoded — or scan it with a phone
   or a handheld scanner.

For a whole dataset instead of one symbol, use **Stress test dataset** → **Download dataset ZIP**
and drop the archive on the scanner's benchmark.

## Verified Round Trip

Every symbology was generated through the demo UI, exported with the same
**Download PNG** button a visitor uses, and decoded back with the Dynamsoft
Barcode Reader SDK (all barcode formats enabled):

| Step | Result |
|---|---|
| Symbols rendered | 13 / 13 |
| PNGs decoded by the SDK | 13 / 13 |
| Decoded text matches the encoded value | 13 / 13 |

Three differences are inherent to the symbologies, not defects:

- **EAN-13** — 12 digits go in, 13 come back: the encoder appends the check digit.
- **MSI** — a Mod-10 check digit is appended and returned as the last character.
- **Codabar** — the start/stop characters (`A`…`B`) are stripped by the decoder.

Everything else round-trips character for character, including the fixed-size
MaxiCode grid and the dot pattern of DotCode.

> That round trip was run with **all barcode formats enabled**. The scanner demo's
> default template does not enable DotCode or Pharmacode, so it now adds those bits
> itself on activation — see the scanner README, *What the default template does not
> read*. Without that, a clean DotCode and a clean Pharmacode measure as misses that
> are not reading failures.

## Stress Test Mode

A single clean PNG tests one thing. A *set* of degraded images with known expected results tests
what actually matters: does the reader still return the right value when the capture is poor?

Fifteen settings are adjustable, and they fall into two groups that are worth keeping apart:

| Scope | Settings | Why it is that scope |
| --- | --- | --- |
| **Per image** — the capture | module size, frame padding, blur, motion blur, JPEG quality, noise, perspective, contrast, frame rotation, uneven lighting, glare, inversion, output scale, crop | One camera, one moment: everything in the frame is degraded the same way |
| **Per symbol** — the scene | symbol tilt | Codes affixed to a sheet by hand sit at their own angles; a tilted *camera* turns them all together, which is what *frame rotation* is for |

That split matters for what the set actually measures. With a single global rotation a reader can
estimate the skew once and reuse it for every symbol; give each symbol its own angle and the reader
has to find and orient each one independently. Multi-code images in the
[Dynamsoft challenging-images](https://github.com/Dynamsoft/datasets-from-dynamsoft/tree/main/challenging-images)
dataset show why this is the realistic case: their codes sit 60–90° apart from each other.

Switch to **Stress test dataset**, set a seed and a difficulty preset, and the page renders N
images, each with several symbols drawn from a mix of the thirteen symbologies. It keeps, for every
symbol, the expected value, the symbology, and the four corner points as they land in the exported
image. **Download dataset ZIP** writes one archive:

```text
barcode-stress-<seed hash>.zip
├── annotations.json          # barcode-benchmark/1.0
└── images/
    ├── barcode-stress-64a1f0e2-001.png
    └── ...
```

Drop that ZIP on the [online barcode scanner](https://www.dynamsoft.com/codepool/demos/barcode-scanner/) in Benchmark mode and it runs
without extracting anything: the images and their ground truth arrive together.

```json
{
  "format": "barcode-benchmark/1.0",
  "images": [
    {
      "file": "barcode-stress-64a1f0e2-001.png",
      "width": 884, "height": 410,
      "degradations": { "blur": 1.2, "jpeg": 0.62, "module": 3, "rotate": -7.4, "tilt": 41.8, "inverted": false },
      "barcodes": [
        { "text": "DS-0001-5652", "format": "CODE_128", "points": [[42.5,88],[206,88],[206,214],[42.5,214]] }
      ]
    }
  ]
}
```

### The three rules that make the oracle trustworthy

0. **A per-symbol field is per symbol.** `tilt` is the widest angle applied to any symbol in that
   image, not one angle shared by all of them; each symbol's own angle is already implied by its
   `points`, which is why the per-symbol value is not duplicated into a separate field.
1. **The expected value is what the symbol decodes to, not what was typed in.** An EAN-13 gains a
   check digit, MSI gains a Mod-10 digit, an ITF payload is generated with an even digit count so no
   padding is applied, and a Codabar decoder strips the start/stop characters. An annotation the
   encoder never produced would make a correct reader look wrong — the worst possible bug in a
   benchmark asset.
2. **The points are computed, never estimated.** Perspective, rotation and crop are composed into a
   single homography, and the *same* matrix transforms each symbol's corners, so the quad is exact
   by construction. Verified independently: sampling the pixels inside every expected quad finds
   25–69% ink depending on the symbology (PDF417 65%, EAN-13 69%, Data Matrix 48%, Code 39 33%,
   MaxiCode 35%), against 1–15% for the same box moved elsewhere in the frame. A wrong homography
   collapses that to the page background.
3. **Every expected symbol is whole, because the crop cannot cut one.** A barcode with part of itself
   outside the frame is undecodable by any reader, so keeping one adds a guaranteed miss that measures
   nothing — and this generator chooses the framing, which a camera does not. Measured on an earlier
   revision that kept symbols from 60% visible up: **36% of all misses came from symbols that were not
   fully inside the frame**, and those buckets decoded at 25% and 0%.

   So `crop` trims the empty border the scene leaves around its symbols and stops before the edge
   reaches one: a loosely framed image crops a lot, a tightly framed one hardly at all, and the value
   actually used is recorded as `crop` with the request beside it as `crop_requested`. Simply excluding
   cut symbols is not enough on its own — tried first, it kept the metric honest and shrank the same
   ten images from 37 expected values to 11, because a tight window was deleting symbols instead of
   framing them. Fitting the window to the content — *after* the perspective warp, with the jitter
   bounded by the same fit — keeps every symbol whole and annotates all of them.

   *A generated dataset should not be confused with a photographed one here.* Real collections do
   contain partially visible codes — and their `points` are not always reliable either: in
   [Dynamsoft challenging-images](https://github.com/Dynamsoft/datasets-from-dynamsoft/tree/main/challenging-images),
   **5 of the 68 files carry annotation coordinates that do not fit the shipped image size** (in
   `batch-scanning-1.jpg` the boxes reach y=3978 in a 3024 px-tall image, i.e. the annotations are in
   a different orientation). Its `text` and `format` fields are what the scanner's benchmark uses, and
   those are unaffected.

### Difficulty is varied, not piled on

The presets that matter (`Easy` … `Mixed`) draw **one difficulty factor per image** and measure
every enabled range from its undamaged end by that fraction. Stacking every degradation at full
strength on every image — which is what independent per-range draws do — produces images that
nothing can read and a dataset that measures nothing: recall reaches 0% and no reader can be
compared. With the factor, a mixed set runs from nearly clean to thoroughly degraded, which is also
what a real image collection looks like.

### Measured against Dynamsoft Barcode Reader (11.6.3200)

Eight images per preset, default symbols per image, run through the scanner demo's benchmark on the
exported ZIP:

| Preset | Expected values | Recall | Precision | Symbology agreement |
| --- | ---: | ---: | ---: | ---: |
| Clean | 8 | 100.0% | 100.0% | 8/8 |
| Easy | 16 | 93.8% | 93.8% | 15/15 |
| Medium | 32 | 81.3% | 100.0% | 26/26 |
| Mixed | 32 | 65.6% | 100.0% | 21/21 |
| Hard | 46 | 17.4% | 88.9% | 8/8 |

Where precision is 100%, the reader never returned a value that was not in the ground truth, and
every decodable symbol was found *at the right value* — which is what proves the oracle above.
`Hard` is deliberately past the edge: 1–2 px per module with motion blur is under what a camera
resolves, and roughly half its images have no readable symbol left in them.

Where precision is below 100%, the unmatched decodes were checked one by one: a 1-character `M` read
as Code 39 off a Pharmacode symbol, a 2-digit `17`, an 8-digit `59787111` that matches no payload
family the generator writes. All are fragments of a bar pattern the reader locked onto without
resolving the symbol — real false positives, which is what precision is for. They are reported rather
than filtered: a one-character read is exactly the kind of output a wrong detector produces, and
hiding it would flatter every reader equally.

The check that matters here is not "is precision 100%" but **"is every unmatched decode a decoder
error rather than an annotation gap"**. An earlier revision failed exactly that test: two unmatched
values per run turned out to be real symbols that the ground truth had dropped, because the crop
window was measured before the perspective warp and the jitter could push the outermost symbol back
over the edge. The reader was blamed for the generator's arithmetic. Both are fixed, and the engine
now reports 0 dropped symbols across all five presets (240 placed, 240 annotated).

Re-run those numbers after any change to the engine or the presets — they are a measurement, not a
promise. One polarity fix in the degradation table moved `Medium` by six points, and adding the
per-symbol tilt moved `Mixed` by ten.

### Reproducibility

The seed drives every random choice — payloads, symbologies, placements and degradation values — so
the same seed rebuilds the same test cases. Payloads are unique across the whole dataset, so an
expected value appears exactly once and a miss can only mean one symbol.

Pixel output is *not* promised byte-identical: blur, resampling and JPEG are the browser's. The test
case is. Re-running with the same seed and settings reproduces the same payloads, symbologies and
conditions; the exact bytes may differ across browsers and versions.

### What it does not measure

The images are **synthesised, not photographed**. The degradations model what a capture does to
pixels, but a synthetic blur is cleaner than a real lens and a synthetic glare has no colour
fringing. Treat the numbers as a comparison between readers on identical inputs, not as a prediction
for a specific camera.

Symbols are re-encoded at an integer module size rather than scaled down, and the layout solver gives
up frame padding before it gives up module size — the padding only decides how much of the image is
white, the module decides whether there is a readable symbol in it. When the 1600 px frame cap still
forces a smaller module, the image reports both the value it got and the value that was asked for.
Below about 1.5 px per module the preview says so: at that point a miss says nothing about the
decoder.

1D symbols are rendered **without human-readable text**. The text sits under the bars, and the
expected corner points would then include a region no reader reports, which would make the
box-overlap figure meaningless.

## Run Locally

1. Open a terminal in the repository root.
2. Start a local web server:

    ```powershell
    python -m http.server 8000
    ```

3. Open `http://localhost:8000/demos/barcode-qrcode-generator/` in a browser.

No camera and no license key are required.

## Implementation Notes

- Each symbol is encoded with `bwipjs.toCanvas()` at a per-symbology module scale
  tuned so all 13 land in a comparable pixel range (a MaxiCode is a fixed 30 × 33
  module grid, an EAN-13 is a long thin strip).
- A long payload makes a wide symbol: a 120-character Code 128 is over 1300 px wide
  even at the smallest module scale. Symbols wider than 900 px are re-rendered at the
  largest whole-number scale that fits, rather than being resampled, so bar edges stay
  crisp and evenly spaced in the exported PNG.
- The grid is composed onto one canvas with a white background — the exported PNG is
  what the scanner sees, so the quiet zone around each symbol has to be white.
- MSI is rendered with `includecheck`, because readers (including Dynamsoft Barcode
  Reader) expect the Mod-10 check digit to be present.
- Symbols are rendered with exactly the quiet zone the standards require
  (`paddingwidth`/`paddingheight` = 4 modules), so the expected box is the symbol rather
  than the symbol on a wide margin.
- The degradations are implemented in plain canvas and JS — no WebGL, no `ctx.filter`
  — so the output is the same in every browser and a preset cannot silently apply
  nothing. Blur is three box passes, motion blur accumulates one-pixel shifts with
  `lighter` (which averages correctly and stays opaque; source-over would not).
- The ZIP writer is store-only with a CRC-32 per entry. PNG is already compressed, so
  the archive size does not suffer, and the scanner can read a stored entry without an
  inflate step.
- **`stress.js` depends on nothing but bwip-js** — not even a companion script of this
  project's own. An earlier revision required a shared `demos/shared/geometry.js` for the
  crop maths, and a deploy that copied the demo folder without its sibling directory left
  the whole mode dead with an empty preset list. The ~40 lines it needed live in the
  engine now; the scanner's benchmark keeps its own copy of the overlap maths it uses, and
  the only thing the two share is the six-line shoelace formula, so there is no metric for
  them to disagree about.
- Everything is client side. No data leaves the browser.

## Files

| File | Description |
| --- | --- |
| `index.html` | Page structure, both modes, metadata |
| `app.js` | Symbology table, grid rendering, PNG export, stress-mode UI |
| `stress.js` | Stress-test engine: scene composition, degradations, ground truth, ZIP |
| `styles.css` | Brand styles |

## Scope and Limitations

- **Raw symbologies only.** Whatever you type is written into the symbol as-is. This
  is not a GS1, AAMVA, vCard or label generator — it does not build an
  application-layer payload. For a generator that does, see
  [`/codepool/demos/driver-license-generator/`](https://www.dynamsoft.com/codepool/demos/driver-license-generator/),
  which assembles AAMVA PDF417 barcodes.
- Data-carrying 1D symbologies are limited by their own standards (EAN-13 is 13
  digits, Pharmacode is a single number up to 131070); the input field accepts up to
  120 characters, which bounds a Code 128 payload.
- A barcode is not a secret — anyone with a phone can read what you encode. Use
  synthetic test data.
- The stress-test images are **synthetic**. They model capture degradations
  convincingly enough for reader comparison and reproducibility, but they are not a
  substitute for photographing real labels.

## Blog

[How to Build a QR Code & Barcode Generator Chrome Extension in JavaScript (Manifest V3)](https://www.dynamsoft.com/codepool/chrome-extension-barcode-qr-code-generator.html)
