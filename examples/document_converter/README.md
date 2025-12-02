# Document Converter & Gallery

A free, powerful, and secure web-based tool for viewing, merging, and converting documents and images. This application runs entirely in your browser, ensuring your files remain private and are never uploaded to a server.

https://github.com/user-attachments/assets/9347568d-8283-4ef4-89f8-82aeec032143


## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/document_converter/

## Features

*   **Wide Format Support**: View and process multiple file types including:
    *   **Documents**: PDF (`.pdf`), Word (`.docx`), Text (`.txt`)
    *   **Images**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), BMP (`.bmp`), WebP (`.webp`), TIFF (`.tiff`, `.tif`)
*   **Camera Capture**: Directly capture images from your device's camera and add them to your document.
*   **Scanner Integration**: Scan documents directly from physical scanners (TWAIN, WIA, SANE, ICA) using Dynamic Web TWAIN.
*   **Document Editing**:
    *   **Editable Text**: Import Word and Text files as editable pages. Modify content directly in the browser.
    *   **Create New Pages**: Add blank pages to start writing from scratch.
*   **Interactive Viewer**:
    *   Zoom in/out capabilities.
    *   Thumbnail navigation.
    *   Auto-scroll to selected page.
*   **Document Management**:
    *   **Drag & Drop Upload**: Simply drag files into the window to add them.
    *   **Reorder Pages**: Drag and drop thumbnails to rearrange the page order.
    *   **Delete**: Remove individual pages or clear the entire workspace.
*   **Image Editing**:
    *   **Crop**: Crop images with a visual overlay and real-time dimension display.
    *   **Rotate**: Rotate images by 90 degrees or custom angles.
    *   **Filters**: Apply Grayscale, Black & White, Brightness, and Contrast adjustments.
    *   **Resize**: Resize images while maintaining aspect ratio.
    *   **Undo/Redo**: Full history support to undo or redo any edits.
*   **Export Options**:
    *   **Save as PDF**: Merge all pages into a single PDF file.
    *   **Save as Word**: Export all pages into a Microsoft Word (`.docx`) document.

## How to Use

<img width="800" alt="free online document converter" src="https://github.com/user-attachments/assets/a29ad2f2-338d-4d1b-9905-b3fdeb5b7f7e" />

1.  **Open the Application**: Open `index.html` in any modern web browser (Chrome, Edge, Firefox, etc.).
2.  **Add Content**:
    *   Click the **Add Files** button to select files from your computer.
    *   Click the **Camera** button to capture a photo.
    *   Click the **Scanner** button to scan documents from a connected scanner.
    *   Click the **New Page** button to create a blank document.
    *   Or simply drag and drop files directly onto the page.
3.  **Edit**:
    *   Click on a thumbnail to view the page.
    *   **For Images**: Use the toolbar above the image to **Rotate**, **Crop**, **Filter**, or **Resize**.
    *   **For Documents**: Click directly on the page content to edit text (Word/Text files).
    *   Use **Undo** and **Redo** buttons to manage your changes (Images only).
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
*   **[Dynamic Web TWAIN](https://www.dynamsoft.com/web-twain/overview/)**: For web-based document scanning.

