# IMEI-scanner

An IMEI scanner which can read the IMEI by reading the barcode or recognizing the text.

It is built with the [Dynamsoft Capture Vision Bundle](https://www.dynamsoft.com/capture-vision/), which provides a unified set of APIs (`CaptureVisionRouter`, `CameraEnhancer`, `CameraView`) for barcode reading, text recognition and document detection:

* **Barcode mode**: scans Code 128 barcodes — the format typically used to encode IMEI on device labels — and validates the check digit.
* **Printed-digits mode**: uses OCR with the built-in `RecognizeTextLines_Default` template to read the line printed under the barcode (e.g. `IMEI1:866186087048013`), extracts the IMEI with a sliding 15–17 digit window plus Luhn validation, and asks the user to confirm the result.
* **Load Image**: process a photo from disk, or click **Try Sample Image** to run the bundled [sample-imei.png](sample-imei.png) label through the same pipeline — a one-click way to verify both modes without a camera. Regenerate the sample with `python gen_sample_imei.py`.

[Online demo](https://tony-xlh.github.io/IMEI-scanner/)

Demo videos:

1. scanning barcodes

   <https://user-images.githubusercontent.com/5462205/216273773-e4783f63-fca2-481d-9ddc-0aa57995bdf5.mp4>

2. recognizing text


   <https://user-images.githubusercontent.com/5462205/216273942-7c862766-b267-48c0-bdcb-e2f61d8a3637.mp4>

## Run Locally

The camera only works in secure contexts, so serve the page over HTTPS or `localhost`:

1. Clone this repository.
2. Start a local web server, e.g. one of the following:
   - `python -m http.server`
   - `npx http-server`
   - VS Code **Live Server** extension
3. Open <http://localhost:8000> (the port depends on your server) and click **Start Scan**, or use **Try Sample Image** for a camera-free test.

## License

You need a license key to run the app. [Get a 30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).

## Blog

[How to Build an IMEI Scanner in HTML5](https://www.dynamsoft.com/codepool/imei-scanner.html)
