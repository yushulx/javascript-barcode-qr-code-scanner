# NextJS-Barcode-Scanner

Barcode Scanner Example in Next.js based on the [Dynamsoft Barcode Reader JavaScript Edition](https://www.dynamsoft.com/barcode-reader/overview/) (`dynamsoft-barcode-reader-bundle`, v11).

[Online demo](https://next-js-barcode-scanner.vercel.app/)

## Get Started

Run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to scan a barcode with your camera. Click **Start Scanning**, point the camera at a barcode, and the decoded result pops up.

## License

The sample falls back to a public 24-hour trial license. To use your own license, set the `DBRLicense` environment variable, which the page reads server-side via `getServerSideProps` and passes to the scanner component:

```bash
set DBRLicense=<your license key>   # Windows
export DBRLicense=<your license key> # Linux / macOS
npm run dev
```

Obtain a license from [Dynamsoft](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Implementation Notes

- `src/components/BarcodeScanner.tsx` initializes the SDK with `LicenseManager.initLicense`, creates a `CaptureVisionRouter`, and wires a `CameraView`/`CameraEnhancer` (bundled in `dynamsoft-barcode-reader-bundle`) into the React tree. Each camera frame is decoded with `cvr.capture(enhancer.fetchImage(), "ReadBarcodes_Default")`.
- The SDK is browser-only, so `src/pages/index.tsx` loads the component with `next/dynamic` and `ssr: false`. The Next.js server still reads the license from the environment at render time via `getServerSideProps`, keeping the key out of client source while avoiding `window is not defined` build errors.

## Blog

[How to Build a Barcode and QR Code Scanner in Next.js](https://www.dynamsoft.com/codepool/nextjs-barcode-qr-code-scanner.html)
