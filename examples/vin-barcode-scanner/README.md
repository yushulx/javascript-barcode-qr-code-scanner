# VIN Barcode Scanner

Scan VIN barcodes in the browser with Dynamsoft Barcode Reader: decode from a
live camera or an image, strip the 18-character import-prefix form (a leading
`I`), verify the North American check digit, and parse the WMI, region, model
year, plant code and serial number into structured data.

**[Try the online demo](https://www.dynamsoft.com/codepool/demos/vin-barcode-scanner/)**

This example reads **barcodes only** — Code 39, Code 128, QR Code and Data
Matrix, the symbologies VIN labels and paperwork use. The stamped or engraved
VIN characters themselves are not recognized; there is no OCR for plain VIN
text. A typed VIN can be checked through the same validation pipeline via the
manual-entry form.

## Run locally

From the repository root:

```bash
cd examples/vin-barcode-scanner
python -m http.server 8081
```

Open **http://localhost:8081/** in a modern browser. Serving the whole
directory keeps the bundled samples and the shared model file reachable.
Camera scanning requires HTTPS (or localhost) and camera permission.

## Licensing

On any host other than `dynamsoft.com` the page falls back to the SDK trial
key, which is fine for local testing. Deploying this example needs your own
Dynamsoft Barcode Reader license —
[get a 30-day free trial](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Project structure

```text
vin-barcode-scanner/
├── index.html       # page shell, OCR notice, camera/upload switch, JSON-LD
├── app.js           # scan pipeline, import-prefix strip, result cards
├── vin-model.js     # shared VIN model (UMD): check digit, year codes, regions
├── styles.css
├── make-samples.cjs # regenerates sample-images/*.png (needs bwip-js)
└── sample-images/   # bundled samples, decoded automatically on load
```

`vin-model.js` is shared verbatim with the
[generator example](../vin-barcode-generator/). The sample images are valid
VINs — the script asserts every check digit before rendering, and regenerating
them requires the `bwip-js` npm package:

```bash
NODE_PATH=/path/to/node_modules node make-samples.cjs
```
