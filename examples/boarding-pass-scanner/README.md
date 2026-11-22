# Boarding Pass Scanner (IATA BCBP)

Read the barcode on a boarding pass and turn it into structured fields, in the browser.

Dynamsoft Barcode Reader decodes the symbol. The IATA BCBP payload is then parsed by
[`bcbp.js`](../boarding-pass-generator/bcbp.js) — the same file the
[boarding pass generator](../boarding-pass-generator/) encodes with.

## Live demo

https://www.dynamsoft.com/codepool/demos/boarding-pass-scanner/


## Features

- **Symbols.** PDF417 and MicroPDF417 (printed passes), plus Aztec Code, QR Code,
  Micro QR and Data Matrix for mobile and version-7 2D printed passes. A format
  selector widens this to every symbology the SDK supports.
- **Camera and image.** Live scanning with the SDK's viewfinder, or upload, drag &
  drop and clipboard paste.
- **Structured output.** Passenger and PNR, per-leg route, carrier, flight, date,
  compartment, seat and sequence, plus the conditional items: frequent flyer, baggage
  tags, check-in source, issue date, document type and the security section.
- **Eight structural checks.** Format code, computed length against actual length, leg
  count, version, airport codes, Julian dates, seat format, and whether the declared
  block sizes agree with the data present.
- **The scanned image** shown above the parsed fields, with a full-size toggle, so a wrong value
  is attributable to the image rather than to the reader. Camera scans snapshot the viewfinder.
- **Copy JSON.** A flat object suitable for piping into the rest of an application.


## Prerequisites

- A Dynamsoft Barcode Reader license key, or the 24-hour trial key the
  **Use Trial License** button applies. Get a
  [30-day trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).
- A browser with camera access for live scanning. Upload mode needs no camera.

## Quick start

```bash
# from the repository root
python -m http.server 8000
# open http://localhost:8000/examples/boarding-pass-scanner/
```

