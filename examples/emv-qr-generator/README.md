# Online EMV QR Code Generator

Generates EMVCo merchant-presented payment QR codes in the browser, then
proves each one scans: click **Verify it scans** and Dynamsoft Barcode Reader
decodes the rendered symbol back, comparing it byte for byte with the payload
that produced it.

A hosted version with no setup is at
[dynamsoft.com/codepool/demos/emv-qr-generator](https://www.dynamsoft.com/codepool/demos/emv-qr-generator/).

## What it covers

- EMVCo merchant-presented TLV payload built from a form: static (point of
  initiation 11) and dynamic (12) modes, any ISO 4217 currency
- CRC-16/CCITT-FALSE checksum computed over the payload including the `6304`
  header, in ascending tag order, with the 99-character field limit enforced
- Live validation against the specification limits (merchant name 25
  characters, city 15, numeric currency, alpha-2 country)
- Randomize invents valid-but-fictional merchant data; changed fields are
  highlighted
- QR rendered at error-correction level M with bwip-js
- Optional round trip: the rendered symbol is decoded and compared field by
  field against the payload

## Run it

Any static file server from this directory:

```sh
python -m http.server 8000
# open http://localhost:8000
```

The page builds and renders payloads entirely locally. Decoding the symbol
back (the verify step) needs Dynamsoft Barcode Reader:

- On `dynamsoft.com` the page uses a domain-bound license.
- Anywhere else it falls back to the SDK's public trial key — good for 24
  hours per activation, with a one-time notice dialog. For production use,
  replace `TRIAL_LICENSE_KEY` in `app.js` with your own
  [license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Files

- `emv-model.js` — TLV encode/parse, CRC-16, tag dictionary, ISO 4217
  currency names (generated from the official ISO list), validation,
  presets. Shared with `../emv-qr-scanner/`.
- `app.js` — form state, bwip-js rendering, lazy reader activation and the
  round-trip check.
- `emv-model.test.js` — node unit tests (51 assertions), including the
  canonical CCITT-FALSE vector and a published MasterCard example payload:

```sh
node emv-model.test.js
```

The generated codes carry fictional merchant identifiers, so wallets will
decline them — they are test symbols, not payable codes.
