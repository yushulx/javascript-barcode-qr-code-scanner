# JavaScript MRZ Scanner – HTML5 & JavaScript Web SDK Example

This project demonstrates how to create a **web-based Machine Readable Zone (MRZ) scanner** using **HTML5** and **JavaScript**, leveraging the **Dynamsoft MRZ Scanner SDK**. It supports scanning MRZ from **passports**, **ID cards**, and **visa documents** via **camera** or by uploading image and **PDF** files.

https://github.com/user-attachments/assets/2a7b70e8-8cc6-4563-8925-8a1f7800b093

## Prerequisites
- **License Key**: Please obtain a license key from [Dynamsoft Website](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).
- **Dynamsoft MRZ Scanner**: Read and scan MRZ from passport, ID card, and visa documents.
    
    ```html
    <script src="https://cdn.jsdelivr.net/npm/dynamsoft-mrz-scanner@3.0.0/dist/mrz-scanner.bundle.js"></script>
    ```
    
- **Dynamsoft Document Viewer**: Convert PDF files to JPEG images in web browser.
    
    ```html
    <script src="https://cdn.jsdelivr.net/npm/dynamsoft-document-viewer@latest/dist/ddv.js"></script>
    ```

## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/mrz_scanner_rtu/

## Features
- Real-time MRZ scanning using webcam
- Upload and scan MRZ from:
    - Image files (PNG, JPEG)
    - PDF documents
- Displays parsed MRZ result in structured format
