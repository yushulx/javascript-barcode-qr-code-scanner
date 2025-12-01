# Document Converter & Gallery

A free, powerful, and secure web-based tool for viewing, merging, and converting documents and images. This application runs entirely in your browser, ensuring your files remain private and are never uploaded to a server.

<img width="800" alt="free online document converter" src="https://github.com/user-attachments/assets/5e3ac20c-2b7c-4b8a-91d9-07be3dad6872" />


## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/document_converter/

## Features

*   **Wide Format Support**: View and process multiple file types including:
    *   **Documents**: PDF (`.pdf`), Word (`.docx`)
    *   **Images**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), BMP (`.bmp`), WebP (`.webp`), TIFF (`.tiff`, `.tif`)
*   **Camera Capture**: Directly capture images from your device's camera and add them to your document.
*   **Interactive Viewer**:
    *   Zoom in/out capabilities.
    *   Thumbnail navigation.
    *   Auto-scroll to selected page.
*   **Document Management**:
    *   **Drag & Drop Upload**: Simply drag files into the window to add them.
    *   **Reorder Pages**: Drag and drop thumbnails to rearrange the page order.
    *   **Delete**: Remove individual pages or clear the entire workspace.
*   **Export Options**:
    *   **Save as PDF**: Merge all pages into a single PDF file.
    *   **Save as Word**: Export all pages into a Microsoft Word (`.docx`) document.

## How to Use

1.  **Open the Application**: Open `index.html` in any modern web browser (Chrome, Edge, Firefox, etc.).
2.  **Add Content**:
    *   Click the **Add Files** button to select files from your computer.
    *   Click the **Camera** button to capture a photo.
    *   Or simply drag and drop files directly onto the page.
3.  **Edit**:
    *   Click on a thumbnail to view the page.
    *   Drag thumbnails to change the order.
    *   Use the **Delete Page** button to remove unwanted pages.
4.  **Save**:
    *   Click **Save as PDF** or **Save as Word** to download your combined document.

## Technologies Used

This project utilizes several open-source libraries to provide robust functionality directly in the browser:

*   **[PDF.js](https://mozilla.github.io/pdf.js/)**: For rendering PDF files.
*   **[Mammoth.js](https://github.com/mwilliamson/mammoth.js)**: For converting .docx files to HTML.
*   **[jsPDF](https://github.com/parallax/jsPDF)**: For generating PDF files.
*   **[html-docx-js](https://github.com/evidenceprime/html-docx-js)**: For generating Word documents.
*   **[html2canvas](https://html2canvas.hertzen.com/)**: For taking screenshots of rendered content.
*   **[UTIF.js](https://github.com/photopea/UTIF.js)**: For decoding TIFF images.

