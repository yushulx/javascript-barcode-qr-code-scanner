# Free Online VIN Barcode Generator

Browser-side VIN barcode generator built with bwip-js — no SDK, no license key,
nothing uploaded.

- Validates a 17-character VIN (the letters I, O and Q never appear).
- Recalculates the **North American check digit** (position 9) as you type, with
  a one-click fix; a mismatch is an error under the North American preset and a
  non-issue under the European one (ISO 3779 has no check digit rule).
- **Standard presets** — North America (FMVSS 115: check digit, model year,
  plant code, numeric tail; labels use Code 39) and Europe (ISO 3779: position 9
  is a free character; labels commonly use Code 128). The preset also steers the
  random generator and recommends the symbology the region's labels use.
- Renders **Code 39, Code 128, QR Code or Data Matrix** with optional
  human-readable text; exports a PNG test target.
- A **Random VIN** button that always emits a standard-compliant number
  (200-sample self-test in CI spirit: zero invalid emissions).

The VIN model lives in `vin-model.js` (UMD) and is shared verbatim with the
[scanner demo](../vin-barcode-scanner/) and the sample-image script — one
implementation, no drift.

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, JSON-LD, GTM, OG tags |
| `app.js` | Standard presets, symbologies, rendering, structure card |
| `vin-model.js` | Shared VIN model (check digit, years, regions, random) |
| `styles.css` | Brand styling (Dynamsoft style guide tokens) |

## Licensing

Nothing here needs a license — the generator is pure bwip-js. The companion
scanner activates a Dynamsoft license by host.

## Related

- Scanner demo: `/codepool/demos/vin-barcode-scanner/`
- Tutorial: `/vin-barcode-generator-scanner-javascript.html` on dynamsoft.com/codepool
- Demo registry: `_data/demos.yml` (slug `vin-barcode-generator`)
