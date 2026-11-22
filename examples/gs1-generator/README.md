# GS1 Generator

A plain JavaScript GS1 barcode generator: it composes a validated GS1 element
string from application identifiers, calculates the check digits, renders a test
label on an HTML5 canvas, and exports the PNG together with the table of values a
conformant scanner should return.

No SDK, no licence key, no build step — [bwip-js](https://github.com/metafloor/bwip-js)
(the JavaScript port of BWIPP) does the encoding and everything else is local.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `gs1-payload.js` | The payload model: AI catalogue, validation, check digits, HRI, expected parse, symbology choice, encoder arguments |
| `app.js` | UI, canvas label rendering and PNG export |
| `styles.css` | Styling, built on the shared generator sheet |
| `test-gs1-payload.cjs` | Unit tests for `gs1-payload.js` — 44 assertions, no server needed |
| `verify-roundtrip.js` | End-to-end harness: generate a label, upload it to the GS1 scanner, diff every AI |

## Why It Is Not Just a Barcode Generator

The **list of application identifiers is the source of truth**. The element
string, the FNC1 positions, the check digits and the symbology choice are all
derived from it. A text-first generator will happily encode
`(01)09506000135000` literally into a DataBar, and a reader will decode that
image perfectly while returning nothing useful.

Three places where the order matters:

- **Check digits are calculated, never typed.** A GTIN whose check digit is wrong
  is a fine test of the failure path and a useless test of everything else.
- **The encoder is given the AI syntax.** BWIPP's GS1 symbologies accept the
  bracketed `(01)…(10)…` form and place the FNC1 bytes themselves, from the same
  length rules the parser uses. ITF-14 and EAN-13 do not: they take raw digits,
  and the GTIN goes in whole — trimming a GTIN-14 to 13 digits makes the encoder
  compute a *second* check digit over data that already contained one.
- **An over-wide symbol is re-encoded, never scaled down.** Scaling a linear
  symbol by a fraction blurs the module edges, and a symbol whose modules are no
  longer resolvable cannot be decoded however good the scanner is.

## Run It

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Test It

```powershell
node test-gs1-payload.cjs
```

For the end-to-end check, serve a copy of the GS1 scanner (the Codepool
`demos/gs1-barcode-scanner/`) and run:

```powershell
node verify-roundtrip.js <generatorUrl> <scannerUrl> [tmpDir]
```

It renders every scenario, reads each PNG out of the canvas, uploads it through
the scanner's own file input, and diffs the reported application identifiers
against the payload that was encoded. Expected result: 11/11.

## Scenarios

| Scenario | Symbology | Elements |
|---|---|---|
| Retail unit | GS1 DataBar Omnidirectional | GTIN |
| Fresh food | GS1 DataBar Expanded Stacked | GTIN, net weight, price |
| Healthcare unit | GS1 DataMatrix | GTIN, expiry, batch, serial |
| Logistics carton | GS1-128 | SSCC |
| ITF-14 carton | ITF-14 | GTIN |
| Order + delivery | GS1-128 | GTIN, batch, order, ship-to, origin |
| Ratio pack | GS1 DataBar Expanded | GTIN, count, best before |
| Returnable asset | GS1 DataMatrix | GRAI |
| Price-marked pack | GS1 DataBar Expanded | GTIN, weight, price in EUR |
| Consumer QR | GS1 QR Code | GTIN, batch, serial |
| Custom | GS1 DataMatrix | anything in the AI table |

## Limitations

- **GS1 Composite is not offered** — bwip-js has no composite encoder.
- **DataBar Limited, ITF-14 and EAN-13 encode the GTIN and nothing else**, so
  extra elements are reported as an error rather than dropped.
- **A generated image is not a test of authenticity.** The payload is plaintext,
  so a parseable symbol proves only that it is well formed.
- Sample data only.

## Blog

[How to Generate GS1 Barcodes in JavaScript for Scanner Testing](https://www.dynamsoft.com/codepool/generate-gs1-barcode-javascript.html)

## Online Demo

https://www.dynamsoft.com/codepool/demos/gs1-barcode-generator/
