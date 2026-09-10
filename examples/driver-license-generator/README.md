# Driver License Generator

A plain JavaScript web demo that builds **synthetic AAMVA driver license barcodes**
and renders them onto a card image you can download and scan. It uses
[bwip-js](https://github.com/metafloor/bwip-js) to encode the **PDF417** symbol and
runs entirely in the browser — no licence, no SDK, no upload.

The generated payloads follow the AAMVA DL/ID Card Design Standard (v8 2013, v9 2016,
v10 2020), so they can be read back by any AAMVA-aware parser — including Dynamsoft's
`AAMVA_DL_ID` code parser used by
[`/codepool/demos/driver-license-scanner/`](https://www.dynamsoft.com/codepool/demos/driver-license-scanner/).

## Online Demo

https://www.dynamsoft.com/codepool/demos/driver-license-generator/

## What It Does

- Builds a complete AAMVA barcode payload: `@` compliance indicator, `ANSI ` file type,
  a six-digit Issuer Identification Number, the AAMVA and jurisdiction version numbers,
  a subfile designator (`type + offset + length`) and the `DL`/`ID` data elements
  (`DAQ`, `DCS`, `DAC`, `DBB`, `DBA`, `DBD`, `DBC`, `DAG`, `DAI`, `DAJ`, `DAK`, `DCF`, …).
- Encodes that payload as a real **PDF417** symbol and draws it on the back of a card.
- Renders a printable front/back preview with a `SPECIMEN` watermark.
- Exports the whole sheet as a **PNG** so you can feed it to a scanner.
- Randomises plausible cardholder data, or lets you type your own.

## Jurisdiction Coverage

71 jurisdictions — every one AAMVA assigns an IIN to:

| Region | Count | Examples |
|---|---|---|
| United States | 51 | California `636014`, Texas `636015`, New York `636001`, District of Columbia `636043` |
| US territories | 5 | Puerto Rico `604431`, Guam `636019`, American Samoa `604427`, US Virgin Islands `636062`, Northern Mariana Islands `604430` |
| Canada | 13 | Ontario `636012`, British Columbia `636028`, Quebec `604428`, Alberta `604432` |
| Mexico | 2 | Coahuila `636056`, Hidalgo `636057` |

The IIN table comes from AAMVA's published
[Issuer Identification Numbers](https://aamva.org/identity/issuer-identification-numbers-(iin))
list. Jurisdictions use their current two-letter codes (for example `NL` for
Newfoundland and Labrador, `CO` for Colorado).

## How to Validate a Scanner

1. Open the [generator](https://www.dynamsoft.com/codepool/demos/driver-license-generator/),
   pick a jurisdiction and click **Download Card PNG**.
2. Open the [driver license scanner](https://www.dynamsoft.com/codepool/demos/driver-license-scanner/)
   and switch it to **Upload** mode.
3. Upload the PNG. The scanner decodes the PDF417 barcode and lists the fields that were
   encoded — compare them with the values in the generator's form.

Verified end to end — generate the card, download the PNG, upload it to the scanner — for
**all 71 jurisdictions** on AAMVA v10 `DL` payloads, plus v8/v9 and `ID` cases at the
shortest and longest payload lengths: **79/79 round trips pass, 27 fields returned every
time**, with the licence number, name, city and jurisdiction all matching the values
encoded. The only cosmetic wrinkle is that the two Mexican jurisdictions come back as the
raw `CU` / `HL` code rather than a resolved jurisdiction name, because the SDK's AAMVA
spec does not map those two IINs.

A separate in-browser pass over the full matrix — 71 jurisdictions × 3 AAMVA versions ×
2 subfile types = **426 payloads** — reports zero structural, PDF417-encoding, parsing or
field-mapping failures, and every payload parses as `CodeType: AAMVA_DL_ID`.

## Run Locally

1. Open a terminal in the repository root.
2. Start a local web server:

    ```powershell
    python -m http.server 8000
    ```

3. Open `http://localhost:8000/demos/driver-license-generator/` in a browser.

No camera and no licence key are required.

## Implementation Notes

- The AAMVA format is `header` + `subfile designator` + `subfile`. The subfile offset is
  computed as `header.length + 10 × entryCount`, and the length includes the two-character
  subfile type and the trailing segment terminator.
- Data elements are joined by the Data Element Separator (`\n`) and the subfile ends with
  the Segment Terminator (`\r`). The header also carries the Record Separator (`\x1e`).
- The card sheet is rendered at 2× device pixels and the PDF417 at `scale: 8`, so each
  module ends up several pixels wide in the exported PNG. That is what keeps the barcode
  readable after it is downloaded and re-uploaded.
- Everything is client side. No data leaves the browser.

## Scope and Limitations

- **AAMVA only.** Driver licenses from the EU/EEA, UK, Australia, India, Japan, Brazil and
  elsewhere are not AAMVA documents. They use national or regional formats that the
  `AAMVA_DL_ID` parser does not map, so a scanner restricted to that spec will decode the
  barcode but not resolve the fields.
- **South Africa cannot be generated — not by this tool, and not by any tool.** The PDF417
  on the back of a South African driving licence holds 720 bytes: a 4-byte version header
  (`01 9b 09 45` for v2, `01 e1 02 45` for v1), two zero bytes, then 714 bytes split into
  six blocks (5 × 128 + 1 × 74) that are RSA-encrypted with a **private key held by the
  issuing authority**. Readers decrypt with the published public key; only the issuer can
  produce a valid one. The encryption *is* the anti-forgery mechanism. Dynamsoft's
  `SOUTH_AFRICA_DL` spec implements that decryption step, which is why it needs a real card
  as input. Feeding it synthetic 720-byte payloads (correct version header, random body)
  fails, as expected.
  For reference decoders see
  [yushulx/South-Africa-driving-license](https://github.com/yushulx/South-Africa-driving-license)
  and [DanieLeeuwner/Reply.Net.SADL](https://github.com/DanieLeeuwner/Reply.Net.SADL).
- **Plaintext vs. signed.** An AAMVA barcode is plaintext, so a barcode that parses correctly
  says nothing about authenticity — only that the payload is well-formed. The South African
  format is signed, so a parseable one does attest to origin. This generator exists to test
  the *decoding* path; it is not, and cannot be, an authenticity test.
- Licence-number patterns, addresses and vehicle classes are plausible samples, not an
  authoritative per-jurisdiction specification. The two Mexican jurisdictions come back
  from the scanner as the raw `CU` / `HL` code rather than a resolved name.
- **Testing only.** Every value is randomly generated sample data and every card is stamped
  *SPECIMEN*. The output is not a real ID, is not verifiable against any government
  registry, and must not be used to impersonate anyone.

## Blog

[JavaScript Driver's License Barcode Scanner: Read PDF417 and Parse AAMVA ID Data in the Browser](https://www.dynamsoft.com/codepool/javascript-driver-license-pdf417-scanner-web.html)
