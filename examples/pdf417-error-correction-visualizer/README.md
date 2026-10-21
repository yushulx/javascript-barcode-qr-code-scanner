# PDF417 Error Correction & Damage Visualizer

See how much damage a PDF417 barcode can take. Generate a stacked symbol at
error correction level 0 to 8, wipe codeword cells or whole rows, cover the row
indicators, break the guard patterns, or simulate noise, blur, low contrast and
low resolution — then watch Dynamsoft Barcode Reader decode the result while a
live meter counts corrupted codewords against both Reed-Solomon bounds.

**[Try the online demo](https://www.dynamsoft.com/codepool/demos/pdf417-error-correction-visualizer/)**

## What you can do

- **Generate at any level.** Pick 0 through 8 and the symbol re-encodes at that
  level: 2 parity codewords at level 0, 512 at level 8. The payload is encoded
  in the page by a dependency-free PDF417 (ISO/IEC 15438) encoder, so nothing is
  uploaded.
- **See the structure.** A colour overlay marks every 17-module cell as a
  payload codeword, a padding codeword (900), a Reed-Solomon parity codeword, or
  one of the row indicators and guard patterns that frame every row. Click a
  cell to read its codeword index and value.
- **Compare the levels honestly.** The bar chart under the symbol shows what
  each of the nine levels spends on parity for *this* payload. A PDF417 level is
  an absolute codeword count, not a percentage, so the share moves as the symbol
  grows — level 2 is 24% of a 33-codeword symbol and 1.5% of a 546-codeword one.
- **Damage it three different ways.** Wipe codeword cells with the brush, scratch
  a whole row or column, cover three rows, wipe the left or right row
  indicators, or invert the start and stop patterns. Each has a different
  failure mode and the meter reports them separately.
- **Simulate capture defects.** Sensor noise, out-of-focus blur, low contrast,
  low resolution, occlusion, partial crop, a shadow across the symbol and a
  tilted capture, each with a strength slider.
- **Decode it live.** Dynamsoft Barcode Reader decodes the damaged render. The
  page reports the elapsed time, the payload match, and the rows, columns, error
  correction level, row indicators and codeword count the reader itself read
  back — so the encoder can be checked against the decoder.
- **Sweep the budget.** Run a seeded codeword sweep that corrupts one codeword
  at a time and logs the decode outcome against the count, with the ⌊k/2⌋ error
  bound and the k erasure bound on the same axis. Every row keeps a PNG of the
  exact render it decoded.
- **Export.** Download the current render as a PNG to test another scanner.

The example is plain HTML, CSS and JavaScript with no build step.

## Files

| File | Description |
|------|-------------|
| `index.html` | App markup — symbol stage, damage tools, decode panel, log, anatomy card |
| `styles.css` | Light-themed responsive CSS |
| `pdf417-encoder.js` | Dependency-free PDF417 encoder: text and byte compaction, Reed-Solomon over GF(929), row/column layout, and the codeword map behind every cell |
| `app.js` | All application logic — rendering, damage model, budget meter, decoding, sweep, anatomy |
| `dynamsoft-logo.svg` | Vendored brand logo |

## Run locally

From the repository root:

```bash
cd examples/pdf417-error-correction-visualizer
python -m http.server 4182
```

Open **http://localhost:4182/** in a modern browser. Serve the whole folder so
`pdf417-encoder.js` resolves.

Barcode decoding uses **Dynamsoft Barcode Reader 11.6.3200**, loaded from a CDN
on the first decode. The online demo uses its hosted demo license; local
previews use the SDK's public trial key. For your own application, obtain a
[trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform)
and set it in the browser console, then reload:

```javascript
localStorage.setItem('dy-demo-license', 'YOUR_LICENSE_KEY');
```

A `?license=YOUR_KEY` query parameter works too. SDK loading and license
activation need an internet connection and a secure context (HTTPS or
localhost). The encoder, the damage tools and the budget meter all run offline;
only decoding needs the SDK.

## Reading the numbers

The encoder returns the codeword behind every 17-module cell, so the page can
count corruption exactly: a cell whose modules differ from the clean symbol is
one corrupted codeword. Two Reed-Solomon bounds are drawn because PDF417 has
both:

- **⌊k/2⌋** — the number of *unknown* errors a block of `k` parity codewords can
  repair, where `k = 2^(level+1)`.
- **k** — the number of *erasures*, codewords the reader can tell are
  unreadable. A wiped cell is unreadable by construction, so a reader that flags
  it as an erasure spends one parity codeword instead of two.

Damage to the start pattern, the stop pattern or the row indicators is not
codeword damage and is reported separately: those regions carry no parity,
and a reader that cannot find a row never reaches error correction. Wiping the
row indicators on both sides of every row leaves the corrupted count at 0 and
the decode still fails.

The capture-defect presets are rendered onto the finished canvas the way a
camera would have seen it, and their codeword count is estimated by sampling
each module's centre against its intended value — which is why it is labelled
as an estimate rather than a budget verdict.

Decode outcomes apply to Dynamsoft Barcode Reader at default settings on the
damaged render; another reader, another resolution or a print-and-scan round
trip can shift the boundary. This example contains no analytics or tracking
scripts. The SDK still downloads its engine and contacts Dynamsoft for license
activation.

## Encoder limits

Text compaction covers the PDF417 text set (printable ASCII); anything else is
encoded as UTF-8 bytes with byte compaction. Numeric compaction, ECI and Macro
PDF417 are not implemented — digits ride the Mixed submode, which costs about
1.33 codewords per digit instead of 0.41. Within the text set the encoder's
output is bit-identical to a reference BWIPP encoder.

## Related

- [QR Error Correction Visualizer](https://www.dynamsoft.com/codepool/demos/qr-error-correction-visualizer/) —
  the same experiment on a QR Code, where the parity budget is a percentage
- [Driver's License Generator](https://www.dynamsoft.com/codepool/demos/driver-license-generator/) —
  build a synthetic AAMVA PDF417 barcode
