# VIN Barcode Generator

Generate valid VIN barcodes in the browser. Type a VIN and the symbol renders
as you type — Code 39 (the symbology on North American VIN labels), Code 128,
QR Code or Data Matrix — with the check digit in position 9 recalculated on
every keystroke and a one-click fix when your hand-typed VIN fails.

**[Try the online demo](https://www.dynamsoft.com/codepool/demos/vin-barcode-generator/)**

Two standard presets shape validation and the random generator:

- **North America (FMVSS 115)** — position 9 must be the check digit, the last
  five characters are digits, labels use Code 39.
- **Europe (ISO 3779)** — no check digit rule, position 9 is a free character,
  labels commonly use Code 128.

The **Random VIN** button always emits a number that is valid under the active
standard; the exported PNG is a ready-made scanner test target.

## Run locally

Any static file server works — the generator needs no SDK and no license key:

```bash
cd examples/vin-barcode-generator
python -m http.server 8080
```

Open **http://localhost:8080/** in a modern browser. The only third-party
dependency is [bwip-js](https://github.com/metafloor/bwip-js), loaded from a
CDN; everything else is plain HTML, CSS and JavaScript with no build step.

## Project structure

```text
vin-barcode-generator/
├── index.html      # page shell, standard/symbology controls, JSON-LD
├── app.js          # presets, validation, rendering, PNG export
├── vin-model.js    # shared VIN model (UMD): check digit, year codes, regions
└── styles.css
```

`vin-model.js` is shared verbatim with the
[scanner example](../vin-barcode-scanner/) and its sample-image script, so the
VIN rules cannot drift between the two.

The companion **[VIN barcode scanner](../vin-barcode-scanner/)** decodes the
symbols this generator produces.
