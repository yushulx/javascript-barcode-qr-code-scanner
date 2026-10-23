# Scan 1D/2D Barcode, MRZ and Documents in JavaScript
This repository contains **JavaScript** examples demonstrating how to use [Dynamsoft Capture Vision](https://www.npmjs.com/package/dynamsoft-capture-vision-bundle) to build web applications for scanning **1D/2D barcodes**, **MRZ**, and **documents**.

## Prerequisites
- Obtain a [30-day trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Try Examples
- [barcode-reader.html](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/barcode-reader.html)
- [barcode-result-overlay.html](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/barcode-result-overlay.html)
- [hello-world.html](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/hello-world.html)
- [manually-load.html](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/manually-load.html)
- [qr-code-scanner.html](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/qr-code-scanner.html)
- [ui-customization.html](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/ui-customization.html)
- [WebGL](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/webgl/)
- [Barcode Scanability Analyzer](https://www.dynamsoft.com/codepool/demos/barcode-scanability-analyzer/) — manual image-region analysis, controlled decoding comparisons and a bundled Parameter Tuner: [examples/barcode-scanability-analyzer](examples/barcode-scanability-analyzer)
- [Driver License PDF417 Scanner](https://www.dynamsoft.com/codepool/demos/driver-license-scanner/) — a standalone, tested example: [examples/driver-license-scanner](examples/driver-license-scanner)
- [MRZ & Passport Scanner](https://www.dynamsoft.com/codepool/demos/mrz-scanner/) — image, PDF and TIFF pages, portrait crop, dataset benchmark: [examples/mrz_scanner](examples/mrz_scanner)
- [Barcode Scanner (camera, image and video)](https://www.dynamsoft.com/codepool/demos/barcode-scanner/) — images, PDF/TIFF, video and clip recording, benchmark mode: [examples/barcode-scanner](examples/barcode-scanner)
- [Barcode, MRZ and Document Scanner](https://www.dynamsoft.com/codepool/demos/barcode-mrz-document-scanner/) — a standalone, tested example: [examples/barcode_mrz_document](examples/barcode_mrz_document)
- [Multi-Page Document Scanner](https://www.dynamsoft.com/codepool/demos/multi-document-capture/) — a standalone, tested example: [examples/multi-document-capture](examples/multi-document-capture)
- [Driver License Generator](https://www.dynamsoft.com/codepool/demos/driver-license-generator/) — a standalone, tested example: [examples/driver-license-generator](examples/driver-license-generator)
- [GS1 Barcode Scanner](https://www.dynamsoft.com/codepool/demos/gs1-barcode-scanner/) — a standalone, tested example: [examples/gs1-barcode-scanner](examples/gs1-barcode-scanner)
- [Barcode & QR Code Generator](https://www.dynamsoft.com/codepool/demos/barcode-qrcode-generator/) — build test images and a stress-test dataset with ground truth: [examples/barcode-qrcode-generator](examples/barcode-qrcode-generator)
- [MRZ Generator](https://www.dynamsoft.com/codepool/demos/mrz-generator/) — ICAO 9303 strings, mock documents and a dataset ZIP: [examples/mrz-generator](examples/mrz-generator)
- [ISBN](https://www.dynamsoft.com/codepool/demos/isbn-barcode-lookup/) and [UPC](https://www.dynamsoft.com/codepool/demos/upc-barcode-lookup/) lookup — read a retail barcode and resolve the product: [examples/isbn-barcode-lookup](examples/isbn-barcode-lookup), [examples/upc-barcode-lookup](examples/upc-barcode-lookup)
- [Web TWAIN Scanner](https://www.dynamsoft.com/codepool/demos/web-twain-scanner/) — scan, preview, rotate and save pages from a desktop scanner: [examples/web-twain-scanner](examples/web-twain-scanner)
- [Barcode Structure](https://www.dynamsoft.com/codepool/demos/barcode-structure/) — how 1D and 2D symbols are built, element by element: [examples/barcode-structure](examples/barcode-structure)
- [GS1 Barcode Generator](https://www.dynamsoft.com/codepool/demos/gs1-barcode-generator/) — a standalone, tested example: [examples/gs1-generator](examples/gs1-generator)
- [Boarding Pass Scanner (IATA BCBP)](https://www.dynamsoft.com/codepool/demos/boarding-pass-scanner/) — a standalone, tested example: [examples/boarding-pass-scanner](examples/boarding-pass-scanner)
- [Boarding Pass Generator (IATA BCBP)](https://www.dynamsoft.com/codepool/demos/boarding-pass-generator/) — a standalone, tested example: [examples/boarding-pass-generator](examples/boarding-pass-generator)
- [EMV QR Code Generator](https://www.dynamsoft.com/codepool/demos/emv-qr-generator/) — build an EMVCo merchant-presented payment QR (TLV + CRC-16) and verify it scans: [examples/emv-qr-generator](examples/emv-qr-generator)
- [EMV QR Code Scanner](https://www.dynamsoft.com/codepool/demos/emv-qr-scanner/) — parse a payment QR field by field, verify its checksum, and see the wallet it drives: [examples/emv-qr-scanner](examples/emv-qr-scanner)
- [VIN Barcode Scanner](https://www.dynamsoft.com/codepool/demos/vin-barcode-scanner/) and [VIN Barcode Generator](https://www.dynamsoft.com/codepool/demos/vin-barcode-generator/) — read or build a 17-character VIN with its check digit: [examples/vin-barcode-scanner](examples/vin-barcode-scanner), [examples/vin-barcode-generator](examples/vin-barcode-generator)
- [QR Error Correction Visualizer](https://www.dynamsoft.com/codepool/demos/qr-error-correction-visualizer/) — damage a QR code module by module and watch Reed-Solomon parity recover it: [examples/qr-error-correction-visualizer](examples/qr-error-correction-visualizer)
- [File Viewer](https://www.dynamsoft.com/codepool/demos/file-viewer/) — inspect and read any file locally: metadata and EXIF, multi-page PDF/TIFF/Office, CSV, video, and raw YUV frames from an Android camera. No SDK involved: [examples/file-viewer](examples/file-viewer)
- [Scan 1D Barcode and OCR Text](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/barcode_ocr_text)
- [Detect Barcode, MRZ and Document](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/barcode_mrz_document/)
- [Aadhaar Card](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/aadhaar_card/)

## Blog
- [How to Use WebGL to Accelerate Web Barcode and QR Code Decoding Speed](https://www.dynamsoft.com/codepool/webgl-accelerate-web-barcode-decoding-speed.html)
- [Build a Barcode Scanner Using JavaScript and HTML5](https://www.dynamsoft.com/codepool/html5-barcode-reader-javascript-webassembly.html)
- [Reading Driver’s License Information from PDF417 in JavaScript](https://www.dynamsoft.com/codepool/javascript-driver-license-pdf417-web.html)
