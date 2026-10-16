# QR Error Correction Visualizer

See how much damage a QR code can take. Generate a symbol at error correction
level L, M, Q or H, damage it module by module or with simulated capture
defects, and watch Dynamsoft Barcode Reader decode the result while a live
meter tracks the Reed-Solomon repair budget.

**[Try the online demo](https://www.dynamsoft.com/codepool/demos/qr-error-correction-visualizer/)**

## What you can do

- **Generate at any level.** Pick L, M, Q or H and let the version follow the
  payload, or pin a version from 1 to 10. The symbol is encoded in the page by
  a dependency-free QR Code (ISO/IEC 18004) encoder, so nothing is uploaded.
- **See the structure.** A colour overlay marks every module as a data
  codeword, a Reed-Solomon parity codeword or a function pattern, and clicking
  a module reports the codeword it carries and the block that owns it.
- **Damage it exactly.** Paint on single modules with a 1–3 module brush, cover
  the finder patterns, damage the timing patterns or either copy of the format
  information, or apply seeded random damage. Because the encoder exposes the
  codeword behind every module, the budget meter counts real corrupted
  codewords — per block, against that block's ⌊EC/2⌋ repair capacity.
- **Simulate capture defects.** Sensor noise, out-of-focus blur, low contrast,
  occlusion, partial crop, a shadow across the symbol and a tilted capture,
  each with a strength slider.
- **Decode it live.** Dynamsoft Barcode Reader decodes the damaged render.
  Decode automatically, on demand, or run a seeded damage sweep that
  accumulates damage step by step and logs the damage percentage against the
  decode outcome — the point where each level stops recovering.
- **Compare the levels.** The parity count and repair capacity of all four
  levels at the current version, one click to switch.
- **Export.** Download the damaged render as a PNG to test another scanner. The
  scan log keeps one PNG per row — the exact render that was decoded — so after
  a sweep the last step that still decoded can be downloaded and compared with
  the first one that did not.
- **Analyze an image you did not generate.** Drop, paste or pick any QR picture
  and the page locates the symbol — the reader's own corner points when it
  decodes, otherwise its finder-pattern locator — reads the format information,
  and runs Reed-Solomon decoding to report how many codewords it had to repair.
  When the image still decodes, the corrected codewords rebuild the original
  matrix and the sampled grid is diffed against it, giving a damage percentage
  on the same scale as the sweep. When it no longer decodes there is no
  reference to compare against, so the page states a lower bound instead of
  inventing a number — unless the page still holds the original that
  generated it. Then the differing cells become erasures: Reed-Solomon
  spends one parity symbol per erasure instead of two, so symbols past the
  ordinary ⌊EC/2⌋ error budget are repaired, up to the full parity count.
  Nothing is uploaded.

The example is plain HTML, CSS and JavaScript with no build step.

## Files

| File | Description |
|------|-------------|
| `index.html` | App markup — symbol stage, damage tools, decode panel, log, image analyzer |
| `styles.css` | Light-themed responsive CSS |
| `qr-encoder.js` | Dependency-free QR Code (ISO/IEC 18004) encoder with the codeword and block structure exposed |
| `qr-analyzer.js` | Grid locator, format reader and Reed-Solomon decoder for measuring damage in a received image |
| `app.js` | All application logic — encoding, damage model, budget meter, decoding, sweep, image analyzer |

## Run locally

From the repository root:

```bash
cd examples/qr-error-correction-visualizer
python -m http.server 4181
```

Open **http://localhost:4181/** in a modern browser. Serve the whole folder so
`qr-encoder.js` resolves.

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
localhost). The QR encoder, the damage tools and the budget meter all run
offline; only decoding needs the SDK.

## Reading the numbers

A Reed-Solomon block of `e` parity codewords repairs up to `⌊e/2⌋` corrupted
codewords per block. Damage to finder, timing, alignment, format or version
modules sits outside that budget — error correction repairs codewords, not the
scaffolding a scanner needs to find and orient the symbol. The capture-defect
presets are rendered onto the finished canvas the way a camera would have seen
it, and their damage percentage is estimated by sampling each module's centre
against its intended value.

Decode outcomes apply to Dynamsoft Barcode Reader at default settings on the
damaged render; another reader, another resolution or a print-and-scan round
trip can shift the boundary. This example contains no analytics or tracking
scripts. The SDK still downloads its engine and contacts Dynamsoft for license
activation.

## Reading an image you did not generate

The forward half of the page knows the payload, so it can count damage exactly.
The analyzer does not — it gets a stranger's image. So it locates the grid from
the finder patterns (1:1:3:1:1 runs, confirmed vertically, three corners
forming an isoceles right triangle), fits a homography to the symbol, reads the
format information for the level and mask, samples every module through that
grid, and hands the codeword stream to a Reed-Solomon decoder.

That last step is what makes the answer exact instead of estimated: the decoder
knows which codewords it had to repair and where they were. When the decode
succeeds, the corrected codewords are a complete reference — the page rebuilds
the original matrix and counts the modules that differ, which is the same
damage percentage the sweep logs. If it cannot finish, the page reports a
lower bound (a block that would not decode carries more corrupted codewords
than its budget); if it cannot lock the grid at all, it says so rather than
inventing a percentage.

One repair goes further: when the page still holds the original that
generated the image, the differing cells are known by name, and Reed-Solomon
switches from error decoding to erasure decoding — one parity symbol per
erasure instead of two. A block of `e` parity codewords corrects `e`
erasures rather than ⌊e/2⌋ errors, so symbols past the ordinary budget come
back with their payload recovered. Without a reference that trick is
impossible: nothing tells the decoder where the damage is.
