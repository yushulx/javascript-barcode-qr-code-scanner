export interface ScannerViewText {
  openingCamera?: string;
  processingImage?: string;
  hintStart?: string;
  hintInProgress?: string;
  hintMoveCloser?: string;
  hintRotateHorizontal?: string;
  hintBlurry?: string;
  hintScanningBarcode?: string;
}

export const DEFAULT_SCANNER_VIEW_TEXT_FRONT: ScannerViewText = {
  openingCamera: "Opening camera...",
  processingImage: "Processing image...",
  hintStart: "Place front of license in full view of the camera",
  hintInProgress: "Keep steady while we complete the scan",
  hintMoveCloser: "Move the license closer to the camera",
  hintBlurry: "License is blurry. Move license back",
  hintRotateHorizontal: "Rotate license to horizontal",
};

export const DEFAULT_SCANNER_VIEW_TEXT_BACK: ScannerViewText = {
  openingCamera: "Opening camera...",
  processingImage: "Processing image...",
  hintStart: "Place back of license in full view of the camera.",
  hintInProgress: "Keep steady while we complete the scan",
  hintMoveCloser: "Move the license closer to the camera",
  hintRotateHorizontal: "Rotate license to horizontal",
  hintBlurry: "License is blurry. Move license back",
  hintScanningBarcode: "Scanning barcode",
};

export interface VerifyViewText {
  title?: string;
  hintVerify?: string;
  barcodeNotFound?: string;
}

export const DEFAULT_VERIFY_VIEW_TEXT_FRONT: VerifyViewText = {
  title: "Verify Front of License",
  hintVerify: "Please check if the details are clear",
  barcodeNotFound: "Failed to read barcode. Please retry!",
};

export const DEFAULT_VERIFY_VIEW_TEXT_BACK: VerifyViewText = {
  title: "Verify Back of License",
  hintVerify: "Please check if the details are clear",
  barcodeNotFound: "Failed to read barcode. Please retry!",
};

export interface ResultViewText {
  title?: string;
}

export const DEFAULT_RESULT_VIEW_TEXT: VerifyViewText = {
  title: "Scan Result",
};
