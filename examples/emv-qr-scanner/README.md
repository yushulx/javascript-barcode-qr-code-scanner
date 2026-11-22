# Online EMV QR Code Scanner

Decodes EMVCo merchant-presented payment QR codes and shows what a wallet
does with them: the CRC-16 checksum is verified before anything else, every
TLV field is parsed and named (currency, merchant category, static vs
dynamic, the nested merchant account template), and a simulated wallet turns
the parsed fields into the payment screen a payer would actually see.

A hosted version with no setup is at
[dynamsoft.com/codepool/demos/emv-qr-scanner](https://www.dynamsoft.com/codepool/demos/emv-qr-scanner/).

## Inputs

- Camera: live scanning through the SDK's own viewfinder, narrowed to
  QR Code / Micro QR so an unrelated barcode cannot win the decode race
- Image: drop, choose or paste (screenshot → paste is the shortest path)
- Bundled samples: a static code, a dynamic code, and a dynamic code whose
  amount was tampered (12.50 → 99.99) so the checksum visibly fails
- Payload string: parse decoded text directly, no image needed

A QR that decodes to something that is not EMV (a URL, Wi-Fi login, vCard)
is reported as such instead of being parsed into nonsense.

## What the simulation shows

- **Dynamic code** — the wallet confirms an exact figure: merchant, amount,
  currency, category and reference, then a mock authorization receipt whose
  reference travels back to the merchant for reconciliation (that is what
  tag 62 is for).
- **Static code** — the sticker carries no amount, so the wallet asks the
  payer to type one.

No payment provider is contacted; the confirmation is a local mock.

## Run it

Any static file server from this directory:

```sh
python -m http.server 8000
# open http://localhost:8000
```

Decoding runs in your browser with Dynamsoft Barcode Reader — images never
leave your device:

- On `dynamsoft.com` the page uses a domain-bound license.
- Anywhere else it falls back to the SDK's public trial key — good for 24
  hours per activation, with a one-time notice dialog. For production use,
  replace `TRIAL_LICENSE_KEY` in `app.js` with your own
  [license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Files

- `emv-model.js` — TLV encode/parse, CRC-16, tag dictionary, ISO 4217 and
  ISO 18245 lookups. Vendored copy of `../emv-qr-generator/emv-model.js`;
  keep the two in sync (currently byte-identical).
- `app.js` — decode on the stock `ReadBarcodes_Default` template (scan scope
  narrowed to QR via the simplified-settings API) plus the local parse, field
  table and wallet simulation. Camera support: CameraView + CameraEnhancer +
  CaptureVisionRouter; the results panel pauses the stream, closing it
  resumes. If the camera cannot be opened the page falls back to Upload mode.
- `sample-images/` — the three bundled sample codes.
