# Online MRZ Generator

A plain JavaScript web demo that generates ICAO 9303-compliant Machine Readable
Zone (MRZ) strings and a mock document preview for passports (TD3), ID cards
(TD1/TD2) and visas (MRVA/MRVB). Everything runs client side — there is no SDK,
no license key and no upload.

## Online Demo

https://www.dynamsoft.com/codepool/demos/mrz-generator/

## What It Does

- Generates TD1, TD2, TD3, MRVA and MRVB MRZ strings with valid check digits,
  including the composite check digit.
- Accepts one- or two-character document type codes (`P`, `PD`, `ID`, `IP`, ...)
  and normalizes the ICAO country-code exception `DEU` → `D` for Germany.
- Fills the form with random sample data for quick test documents.
- Renders a mock document preview with the MRZ zone in the OCR-B font on an
  HTML5 canvas, at the character pitch ICAO 9303 specifies, so the output can be
  fed to an MRZ recognition SDK.

## Test Image Dataset

The second mode builds scanner-test images rather than a single document:

- A seeded, reproducible set of passports, ID cards and visas. The seed drives
  every random choice, so the same seed rebuilds the same test cases.
- Twelve configurable degradations — rotation, perspective, blur, motion blur,
  low contrast, glare, uneven lighting, noise, JPEG, inversion, output scale and
  a frame crop — each with a min/max range, under four presets (Clean, Easy,
  Hard, Mixed).
- Ground truth for every image: document number, surname, given names,
  nationality, date of birth, sex, expiry date, the check digits, the MRZ text,
  and the image-space quad of the MRZ band.
- Export as a ZIP of PNG images plus `annotations.json` in the
  `mrz-benchmark/1.0` schema, or as one image / the annotations alone.

The frame crop never cuts the MRZ: the trim stops before the edge would reach
the band, and what the crop actually kept is recorded in the annotations.

Score a dataset in the [MRZ scanner](https://www.dynamsoft.com/codepool/demos/mrz-scanner/) — its *Dataset benchmark*
mode reads the ZIP and reports per-field accuracy against this ground truth.

## Run Locally

1. Open a terminal in the repository root.
2. Start a local web server:

    ```powershell
    python -m http.server 8000
    ```

3. Open `http://localhost:8000/demos/mrz-generator/` in a browser.

## Blog

[How to Generate MRZ Code Programmatically with Python, Pyodide, and HTML5](https://www.dynamsoft.com/codepool/free-online-mrz-generator.html)
