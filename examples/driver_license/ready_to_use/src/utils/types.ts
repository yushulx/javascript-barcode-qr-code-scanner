import { DriverLicenseData, EnumDriverLicenseScanMode, EnumDriverLicenseScanSide } from "./DriverLicenseParser";

// Common types
export interface UtilizedTemplateNames {
  detect: string;
  normalize: string;
  barcode: string;
}

export enum EnumResultStatus {
  RS_SUCCESS = 0,
  RS_CANCELLED = 1,
  RS_FAILED = 2,
}

export type ResultStatus = {
  code: EnumResultStatus;
  message?: string;
};

export enum EnumFlowType {
  MANUAL = "manual",
  SMART_CAPTURE = "smartCapture",
  AUTO_CROP = "autoCrop",
  UPLOADED_IMAGE = "uploadedImage",
  STATIC_FILE = "staticFile",
}

export type ToolbarButtonConfig = Pick<ToolbarButton, "icon" | "label" | "className" | "isHidden">;

export interface ToolbarButton {
  id: string;
  icon: string;
  label: string;
  onClick?: () => void | Promise<void>;
  className?: string;
  isDisabled?: boolean;
  isHidden?: boolean;
}

export interface DriverLicenseScanStep {
  side?: EnumDriverLicenseScanSide;
  mode: EnumDriverLicenseScanMode;
  context?: "after-front" | "after-back" | "standalone" | "verification"; // Track barcode scan context
  requiresVerification?: boolean; // New flag for verification steps
}

// Updated DriverLicenseWorkflowConfig interface
export interface DriverLicenseWorkflowConfig {
  captureFrontImage?: boolean;
  captureBackImage?: boolean;
  readBarcode?: boolean;
  barcodeScanSide?: EnumDriverLicenseScanSide; // Default is `EnumDriverLicenseScanSide.BACK`

  scanOrder?: EnumDriverLicenseScanSide[]; // Order of scanning: front first or back first. Default: Front -> Back

  // Enhanced barcode verification options
  enableBarcodeVerification?: boolean; // Enable early barcode verification step
  exitOnBarcodeVerificationFailure?: boolean; // Exit flow if barcode verification fails
  allowRetryOnVerificationFailure?: boolean; // Allow user to retry on verification failure (default: true)
  barcodeVerificationCallback?: (barcodeData: DriverLicenseData) => Promise<boolean> | boolean; // User callback for verification
}
