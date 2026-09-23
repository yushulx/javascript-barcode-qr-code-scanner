# Boarding Pass Generator (IATA BCBP)

A browser-side generator for **IATA Bar Coded Boarding Pass (BCBP)** barcodes — the
PDF417, Aztec, QR Code or Data Matrix symbol on a printed or mobile boarding pass.

It builds a payload that follows IATA Resolution 792, renders it on a realistic pass
preview, and exports a PNG you can feed to a barcode scanner. It also prints the exact
field values a conformant scanner should return, so you can compare the two.

No SDK, no build step, no server. Open `index.html` and it runs.

## Online demo

https://www.dynamsoft.com/codepool/demos/boarding-pass-generator/


## Run it

```bash
cd examples/boarding-pass-generator
python -m http.server 8000
# open http://localhost:8000/
```

## Scope and limitations

- **Item 30 is signed for you.** Every field change re-signs the payload (ECDSA P-256)
  with a demo private key baked into the page, and the 88-character base64 signature lands
  in the security section (items 25–30). That key exists only so the demo can sign in the
  browser — a real issuer keeps its private key on the issuing server and publishes the
  matching public key, which is what the scanner example carries. Editing the field by
  hand latches a deliberately wrong value so verification fails, clearing it omits the
  section entirely, and *Re-sign* restores a valid signature.
- **Aztec, QR Code and Data Matrix are standards-compliant for a printed pass only from
  version 7.** Older readers may accept the symbol but expect PDF417.
- **The flight date has no year.** A scanner infers it from the issue date or the
  current date, so a pass issued across a year boundary is genuinely ambiguous.
- Airline names, numeric codes and airport cities come from a short built-in table for
  readability. It is not an authoritative IATA dataset.
- Everything is synthetic sample data. The output is not a travel document and will not
  pass any airport check.



