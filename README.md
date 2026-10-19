# NFC-Barcode-Scanner

A web app which scans both NFC tags and barcodes in the browser, then uses the value read from an NFC tag as the AES key to decrypt the content stored in a barcode.

## Features

- **NFC tag scanning** using the browser's native `NDEFReader` API (Chrome for Android and later).
- **NFC simulation fallback** — on browsers without `NDEFReader` (such as desktop), a *Simulate NFC Tag* button lets you enter a key and try the full workflow.
- **Barcode scanning** with [Dynamsoft Barcode Reader Bundle](https://www.dynamsoft.com/barcode-reader/overview/) (Dynamsoft Capture Vision).
- **Write to NFC tag** from a decoded barcode value.
- **AES decryption** of the barcode content using the key stored in an NFC tag ([CryptoJS](https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js)).

## Files

- [index.html](https://tony-xlh.github.io/NFC-Barcode-Scanner/): Scans NFC tags and barcodes. It can decrypt the barcode content with the key stored in an NFC tag using AES.
- [generator.html](https://tony-xlh.github.io/NFC-Barcode-Scanner/generator.html): Generates an encrypted QR code using AES and writes a key to an NFC tag.

## Barcode SDK

Barcodes are scanned with [Dynamsoft Barcode Reader Bundle](https://www.dynamsoft.com/barcode-reader/overview/) (v11.x), which is loaded from the CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@11.6.3200/dist/dbr.bundle.js"></script>
```

The bundle exposes the Dynamsoft Capture Vision APIs (`Dynamsoft.License`, `Dynamsoft.Core`, `Dynamsoft.CVR`) used to initialize a `CaptureVisionRouter` and read barcodes from the camera:

```js
await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);
await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
const cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

const result = await cvr.capture(canvas, 'ReadBarcodes_Default');
const items = result.items.filter(item => item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE);
```

## License

A valid trial or commercial [Dynamsoft license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform) is required. Replace the placeholder license key in `index.html` with your own before deployment.

## How to Run

```bash
python -m http.server
```

Open your web browser and navigate to <http://localhost:8000>. Use Chrome on Android to scan NFC tags (`NDEFReader`).

## Screenshots

Index:

![scanner](./scanner.png)

Generator:

![generator](./generator.png)

