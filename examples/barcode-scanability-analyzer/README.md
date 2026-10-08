# Barcode Scanability Analyzer

A standalone copy of the CodePool P1 browser-side diagnostic preflight,
not an ISO-certified barcode verifier. Uses DBR bundle 11.6.3200, the same brand
styles and domain-bound demo license as Barcode Parameter Tuner.

## Preview

From this directory, run `python -m http.server 4180` and open
`http://localhost:4180/`. Alternatively serve the repository root and open
`/examples/barcode-scanability-analyzer/`. The bundled `parameter-tuner/` and
`shared/` directories keep styles, samples and same-origin image transfer working. HTTPS is required on
non-loopback hosts for the online trial license and camera access. On dynamsoft.com
and its subdomains the existing CodePool license activates automatically. Elsewhere
the existing public SDK trial key is used; a custom key may be provided through
`localStorage['dy-demo-license']` (same convention as the tuner). Activation needs
network access. The hosted demo license does not license self-hosted production use.

## Source synchronization

Copied from `D:/code/codepool/demos/barcode-scanability-analyzer` on 2026-10-08.
The analysis and experiment implementations are unchanged. Relative asset paths
are adjusted for the self-contained layout; the CodePool Parameter Tuner, sample
images and shared helpers are included as dependencies. This copy does not add
OpenCV or ZXing. Refresh from CodePool and reapply these path changes when syncing.
Browser tests accept `ANALYZER_URL` for other server locations.

## Workflow

Choose a bundled tuner sample, upload/drop PNG/JPEG/WebP/BMP, or capture a camera
frame. Full-image decoding uses `ReadBarcodes_Default`. If the reader cannot find
or decode the symbol, click **Draw a region** and drag a rectangle around the full
barcode with a small clear margin. Mouse, pen and touch are supported. The same
selection can be entered/adjusted using X, Y, width and height in original image
pixels. Escape cancels drawing; Clear selection returns to detected regions.

Manual region analysis reads source pixels directly and is available even if the
SDK cannot initialize, localize or decode. It does not automatically start another
SDK run. Drawing a box analyzes it immediately. Editing a coordinate updates the
selection and image measurements when the field loses focus or Enter is pressed;
there is no coordinate-submit button. Invalid/empty/out-of-bounds coordinates
produce a local error and preserve the last valid selection. Unchanged coordinates
preserve prior decode tests.
**Image observations** prioritizes measured potential factors with
evidence, possible impact and a suggested next action. Image measurements follow;
symbol details that cannot be established from a box are kept in a separate
expandable section. No failure cause is presented as proven. Reader script loading
is asynchronous and does not delay initialization of the image-only controls.

**Try decoding selected area** is a separate, optional experiment: it uses an
unmodified crop at original resolution with default reader settings. A changed
result demonstrates that restricting the scan area changed reader behavior, but
does not establish the original failure cause. A failed/unavailable crop decoder
leaves image analysis usable. Format, module size and orientation remain unknown
until reported by the reader; selection geometry never substitutes for symbol
geometry. Export includes image findings, user selection coordinates and crop test
status; unknown decode results are null rather than false.

**Run decoding comparisons** performs five bounded tests on the same selected area:
original crop, color inversion, grayscale percentile stretch, a 90-degree rotation
and 2× nearest-neighbor enlargement. Each uses `ReadBarcodes_Default` and shows the
test image, exact operation, decoded texts and processing time. Scaling is skipped
above an 8-megapixel output limit; flat crops cannot be stretched. Unavailable tests
are separate from zero-decode results. These are tests of this reader's response,
not proofs of a physical defect. If all fail, the report explicitly leaves the
failure cause unexplained. If the original area succeeds, no failure was reproduced
in that area. Confirm decoded texts to avoid mistaking a neighboring symbol for
the intended one. Export includes the outcomes and excludes thumbnail data URLs.

Select a detected barcode to inspect SDK geometry, read decoded text, download the
JSON report, or open the original image in Parameter Tuner. Upload limits: 30 MB and
24 megapixels; original resolution is retained. Transparency is composited on white.

Images stay in the browser. Handoff uses the same origin's IndexedDB to carry a
PNG and filename to the tuner. Records are consumed once, expire after an hour,
and stale records are removed on the next transfer. Storage failures show an upload
fallback. The report intentionally contains decoded text; analytics never does.

## Evidence and limitations

Every report row has a text status with a visible legend: **Potential issue** flags
a possible scanning risk; **Measurement only** is a value without a pass/fail verdict;
**Inconclusive** means insufficient evidence and never counts as a pass.

- SDK: decode result, possible format, quadrilateral, module size and angle.
- Image heuristics: percentile grayscale range, lighter-pixel brightness, edge
  transition width, normalized edge strength, surrounding
  dark-pixel fraction and geometric edge mismatch.
- Edge transitions are independent of SDK module size. Nine scan lines in each
  axis sample monotonic changes of at least 40 grayscale levels; the axis with
  stronger total changes is used. With at least 8 transitions, a median 10–90%
  width over 3 px flags soft edges. Gradual shading can produce the same cue. No
  cause is inferred, and small modules can disappear without yielding a warning.
  Profiles sampled beyond 1.5 source pixels per sample are inconclusive.
- Manual selections check dark content in an inner border (over 20% with grayscale
  range at least 70 raises a selection/margin cue), not a known barcode quiet zone.
  Dark backgrounds and nearby text can also explain this cue. Perspective, symbol
  orientation, neighboring symbols and module size are not invented from the box.
- Quiet zone is a surrounding margin cue, not symbology-specific compliance.
- A flat or low-contrast region may have no strong transitions, making softness
  inconclusive even while contrast itself provides actionable evidence.
- No placeholder metrics for motion blur, highlights, inversion or damage. These
  are not diagnosed automatically. A manual box also omits nonexistent module,
  orientation, perspective, quiet-zone and neighbor measurements. Actual symbol
  measurements appear only when reported by the reader. Inversion is tested as an
  image operation instead of displayed as a permanent inconclusive indicator.
- Overall brightness range is always a measurement, never a green quality pass.
  It can miss local washout or damage. No grade or aggregate quality score.
- Candidate regions can be false positives. No region means unavailable diagnostics,
  not proof of barcode absence. Default failure does not mean every setting will fail.
- Opposite-edge mismatch does not detect every perspective deformation. Quadrilateral
  sampling is bilinear, not a calibrated projective transformation. Heuristic thresholds
  are practical prompts for recapture and tuning, not normative quality limits.

Tests: `node --test _tests/diagnostics.test.cjs _tests/experiments.test.cjs`.
Browser integration: `node _tests/browser.cjs`
with a static server at port 4180 in this directory (requires Playwright via NODE_PATH and Chrome or
Edge; set CHROME_PATH for another executable). Coordinate feedback regression:
`node _tests/selection-feedback.cjs`.

Samples reuse `parameter-tuner/samples/` and retain its provenance and
annotations. No new synthetic sample is presented as a real photo.
