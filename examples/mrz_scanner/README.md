# MRZ & Passport Scanner

A plain JavaScript web app that extracts MRZ fields, document borders, and
portrait photos from passports and ID cards. It uses
[Dynamsoft Capture Vision](https://www.dynamsoft.com/capture-vision/overview/)
(`dynamsoft-capture-vision-bundle@3.6.3200`) in the browser and supports image,
PDF and TIFF upload, clipboard paste, drag-and-drop, and camera capture with a
live document-outline preview.

## Online Demo

[https://yushulx.me/javascript-barcode-qr-code-scanner/examples/mrz_scanner/](https://www.dynamsoft.com/codepool/demos/mrz-scanner/)

## What It Does

- Reads MRZ text from passport and ID card images.
- Parses MRZ data into structured fields such as document number, name,
  nationality, date of birth, and expiry date.
- Draws MRZ overlays and document boundaries on the source image.
- Accepts a PDF or a multi-page TIFF: the document is rasterized page by page in
  the browser and scanned until the page carrying the MRZ is found, with a page
  navigator to step through the rest.
- Reads TIFFs whatever their colour model — UTIF's own converter covers
  grey/RGB/palette/CMYK but not YCbCr, which is what document frames written by
  a video pipeline usually carry (a MIDV500 frame, for instance, is YCbCr 4:2:2
  in PackBits strips). Those are converted here, using the file's own
  ReferenceBlackWhite, so they render instead of arriving as a black frame.
- Tracks the document outline live while the camera previews; pressing Capture
  freezes the full-resolution frame and reads the MRZ text and portrait from it.
- Extracts the portrait area returned by Dynamsoft Identity processing.

Two templates are used, in this order. `ReadPassportAndId` goes first because it
is the one that also returns the document border and the portrait; on a document
whose layout it does not map (an ID card or a visa, whose zones sit elsewhere)
it reports a detected document but no text, so `ReadMRZ` — the zone-only
template — gets a second pass. The portrait then stays empty, which is the
honest outcome for a capture the layout-aware pass could not map.

## Dataset Benchmark

The second mode scores a whole synthetic dataset against its ground truth: drop
the ZIP exported by the [MRZ generator](https://www.dynamsoft.com/codepool/demos/mrz-generator/)
(its *Test image dataset* mode) and every image in it is read and compared field
by field — document number, surname, given names, nationality, date of birth,
sex, expiry date.

- Per-image rows with a tick, cross or dash per field, plus the reader time.
- Accuracy per field and per image, and MRZ lines read verbatim.
- A click on any row shows the image with both quads drawn: the MRZ band the
  generator recorded (orange, dashed) and the zone the reader found (green).
- `results.json` / `results.csv` export, and the reading conditions each image
  was generated with are carried through next to the score.

Fields are scored on the values the parser returns, `RawValue`s included, not on
the display form: a nationality read as `CHN` counts as correct, and a parser
that maps it to "China" is not penalised for the mapping. Dates are compared in
the century the MRZ encodes (`YYMMDD`), because which century a reader assumes
is its own convention rather than something the document states.

## Run Locally

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/index.html` in a Chromium-based browser.

There is no license input: the key is chosen by hostname. On `dynamsoft.com`
(and any subdomain) the page uses the Codepool license bound to that domain; on
any other host it falls back to the SDK's public 24-hour trial key, so the page
still runs. The fallback is logged to the console.

A PDF or TIFF also pulls pdf.js and UTIF (with pako) from jsDelivr the first
time one is opened; a visitor who never opens a document never downloads them.

## Blog

[How to Extract Structured Data and Photos from Passports in JavaScript with Dynamsoft Capture Vision](https://www.dynamsoft.com/codepool/extract-structured-data-photos-from-passports-javascript.html)
