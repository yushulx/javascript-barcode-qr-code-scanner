# MRZ Scanner Sample

This project is a plain JavaScript web sample that extracts MRZ fields, document borders, and portrait photos from passports and ID cards. It uses Dynamsoft Capture Vision in the browser and supports image upload, clipboard paste, drag-and-drop, and one-shot camera capture.

## What It Does

- Reads MRZ text from passport and ID card images.
- Parses MRZ data into structured fields such as document number, name, nationality, date of birth, and expiry date.
- Draws MRZ overlays and document boundaries on the source image.
- Extracts the portrait area returned by Dynamsoft Identity processing.

## Run Locally
1. Open a terminal in this folder.
2. Start a local web server:

    ```powershell
    python -m http.server 8000
    ```

3. Open `http://localhost:8000` in a Chromium-based browser.
4. Click `Initialize MRZ` with a valid [Dynamsoft license key](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).
5. Test one of these flows:

    - `Load` to scan an image file
    - `Paste` to scan an image from the clipboard
    - `Camera` to open the live preview, then `Capture` to freeze the frame and run detection once