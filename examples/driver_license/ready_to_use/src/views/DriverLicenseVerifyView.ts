import { SharedResources } from "../DriverLicenseScanner";
import DriverLicenseScannerView from "./DriverLicenseScannerView";
import { DeskewedImageResultItem } from "dynamsoft-capture-vision-bundle";
import { createControls, createStyle, getElement, shouldCorrectImage } from "../utils";
import DriverLicenseCorrectionView from "./DriverLicenseCorrectionView";
import { ICONS } from "../utils/icons";
import {
  DriverLicenseImageResult,
  EnumDriverLicenseScanSide,
  LicenseVerificationStatus,
} from "../utils/DriverLicenseParser";
import { DriverLicenseWorkflowConfig, EnumResultStatus, ToolbarButton, ToolbarButtonConfig } from "../utils/types";
import { DEFAULT_VERIFY_VIEW_TEXT_BACK, DEFAULT_VERIFY_VIEW_TEXT_FRONT, VerifyViewText } from "../utils/strings";

export interface DriverLicenseVerifyViewToolbarButtonsConfig {
  retake?: ToolbarButtonConfig;
  done?: ToolbarButtonConfig;
}

export interface DriverLicenseVerifyViewConfig {
  container?: HTMLElement | string;
  textConfig?: Record<EnumDriverLicenseScanSide, VerifyViewText>;
  toolbarButtonsConfig?: DriverLicenseVerifyViewToolbarButtonsConfig;

  onDone?: (scanResult: DriverLicenseImageResult) => Promise<void>;
  onUpload?: (scanResult: DriverLicenseImageResult) => Promise<void>;

  _workflowConfig?: DriverLicenseWorkflowConfig; //  Internal use
}

export default class DriverLicenseVerifyView {
  private currentScanVerifyViewResolver?: (scanResult: DriverLicenseImageResult) => void;
  private currentScanMode: EnumDriverLicenseScanSide = EnumDriverLicenseScanSide.Front;

  constructor(
    private resources: SharedResources,
    private config: DriverLicenseVerifyViewConfig,
    private scannerView: DriverLicenseScannerView,
    private correctionView: DriverLicenseCorrectionView
  ) { }

  private getText(): VerifyViewText {
    const configText = this.config.textConfig?.[this.currentScanMode];
    const defaultText =
      this.currentScanMode === EnumDriverLicenseScanSide.Front
        ? DEFAULT_VERIFY_VIEW_TEXT_FRONT
        : DEFAULT_VERIFY_VIEW_TEXT_BACK;

    return {
      ...defaultText,
      ...(configText || {}),
    };
  }

  private getVerificationStatus(): LicenseVerificationStatus {
    const barcodeScanSide = this.config?._workflowConfig?.barcodeScanSide ?? EnumDriverLicenseScanSide.Back;

    return {
      isVerified: true,
      errorMessage: undefined,
    };

    // If this isn't the side we scanned barcodes on, return verified
    if (this.currentScanMode !== barcodeScanSide) {
      return {
        isVerified: true,
        errorMessage: undefined,
      };
    }

    const licenseData = this.resources.result?.licenseData;

    if (!licenseData?.licenseVerificationStatus) {
      // No verification status means no barcode verification was performed
      return {
        isVerified: false,
        errorMessage: undefined,
      };
    }

    return {
      isVerified: licenseData.licenseVerificationStatus.isVerified,
      errorMessage: licenseData.licenseVerificationStatus.errorMessage,
    };
  }

  private hasBarcodeData(): boolean {
    const barcodeScanSide = this.config?._workflowConfig?.barcodeScanSide ?? EnumDriverLicenseScanSide.Back;

    // If this isn't the side we scanned barcodes on, return true
    if (this.currentScanMode !== barcodeScanSide) {
      return true;
    }

    const licenseData = this.resources.result?.licenseData;
    return licenseData?.status?.code === EnumResultStatus.RS_SUCCESS;
  }

  async launch(mode: EnumDriverLicenseScanSide = EnumDriverLicenseScanSide.Front): Promise<DriverLicenseImageResult> {
    try {
      this.currentScanMode = mode;

      getElement(this.config.container).textContent = "";
      await this.initialize();
      getElement(this.config.container).style.display = "flex";

      // Return promise that resolves when user clicks done or retake
      return new Promise((resolve) => {
        this.currentScanVerifyViewResolver = resolve;
      });
    } catch (ex: any) {
      let errMsg = ex?.message || ex;
      console.error(errMsg);
      throw errMsg;
    }
  }

  private async handleUploadAndShareBtn(mode?: "share" | "upload") {
    try {
      const { result } = this.resources;
      if (!result[this.currentScanMode]?.deskewedImageResult) {
        throw new Error("No image to upload");
      }

      if (mode === "upload" && this.config?.onUpload) {
        await this.config.onUpload(result[this.currentScanMode]);
      } else if (mode === "share") {
        await this.handleShare();
      }
    } catch (error) {
      console.error("Error on upload/share:", error);
      alert("Failed");
    }
  }

  private async handleShare() {
    try {
      const { result } = this.resources;

      // Validate input
      if (!result[this.currentScanMode]?.deskewedImageResult) {
        throw new Error("No image result provided");
      }

      // Convert to blob
      const blob = await result[this.currentScanMode].deskewedImageResult.toBlob("image/png");
      if (!blob) {
        throw new Error("Failed to convert image to blob");
      }

      // For Windows, we'll create a download fallback if sharing isn't supported
      const file = new File([blob], `ddls-${Date.now()}.png`, {
        type: blob.type,
      });

      // Try Web Share API first
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Dynamsoft Driver License Scanner Shared Image",
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      return true;
    } catch (ex: any) {
      // Only show error if it's not a user cancellation
      if (ex.name !== "AbortError") {
        let errMsg = ex?.message || ex;
        console.error("Error sharing image:", errMsg);
        alert(`Error sharing image: ${errMsg}`);
      }
    }
  }

  private async handleCorrectImage() {
    try {
      if (!this.correctionView) {
        console.error("Correction View not initialized");
        return;
      }

      this.hideView();
      const result = await this.correctionView.launch();

      // After normalization is complete, show scan result view again with updated image
      if (result.deskewedImageResult) {
        // Update the shared resources with new corrected result
        if (this.resources.onResultUpdated) {
          this.resources.onResultUpdated({
            ...this.resources.result,
            [this.currentScanMode]: {
              deskewedImageResult: result.deskewedImageResult,
              _imageData: result.deskewedImageResult, // todo
            },
          });
        }

        // Clear current scan Verify view and reinitialize with new image
        this.dispose(true); // true = preserve resolver
        await this.initialize();
        getElement(this.config.container).style.display = "flex";
      }
    } catch (error) {
      console.error("DriverLicenseverifyView - Handle Correction View Error:", error);
      // Make sure to resolve with error if something goes wrong
      if (this.currentScanVerifyViewResolver) {
        this.currentScanVerifyViewResolver({
          status: {
            code: EnumResultStatus.RS_FAILED,
            message: error?.message || error,
          },
        });
      }
      throw error;
    }
  }

  private async handleRetake() {
    try {
      if (!this.scannerView) {
        console.error("Scanner View not initialized");
        return;
      }

      this.hideView();
      const scanResult = await this.scannerView.launch(this.currentScanMode);

      if (scanResult?.status?.code === EnumResultStatus.RS_FAILED) {
        if (this.currentScanVerifyViewResolver) {
          this.currentScanVerifyViewResolver(scanResult);
        }
        return;
      }

      // Handle success case
      if (this.resources.onResultUpdated) {
        if (scanResult?.status.code === EnumResultStatus.RS_CANCELLED) {
          this.resources.onResultUpdated(this.resources.result);
        } else if (scanResult?.status.code === EnumResultStatus.RS_SUCCESS) {
          this.resources.onResultUpdated({ ...this.resources.result, [this.currentScanMode]: scanResult });
        }
      }

      if (this.correctionView && scanResult?._flowType) {
        if (shouldCorrectImage(scanResult?._flowType)) {
          await this.handleCorrectImage();
        }
      }

      this.dispose(true);
      await this.initialize();
      getElement(this.config.container).style.display = "flex";
    } catch (error) {
      console.error("Error in retake handler:", error);
      // Make sure to resolve with error if something goes wrong
      if (this.currentScanVerifyViewResolver) {
        this.currentScanVerifyViewResolver({
          status: {
            code: EnumResultStatus.RS_FAILED,
            message: error?.message || error,
          },
        });
      }
      throw error;
    }
  }

  private async handleDone() {
    try {
      // Get verification status from shared resources
      const licenseVerificationStatus = this.getVerificationStatus();

      // Prevent done action if verification failed
      if (!licenseVerificationStatus.isVerified) {
        console.warn("Cannot proceed - barcode verification failed");
        alert("Failed to read information. Please retake.");
        return;
      }

      if (this.config?.onDone) {
        await this.config.onDone(this.resources.result[this.currentScanMode]);
      }

      // Resolve with current result
      if (this.currentScanVerifyViewResolver && this.resources.result[this.currentScanMode]) {
        this.currentScanVerifyViewResolver(this.resources.result[this.currentScanMode]);
      }

      // Clean up
      this.hideView();
      this.dispose();
    } catch (error) {
      console.error("Error in done handler:", error);
      // Make sure to resolve with error if something goes wrong
      if (this.currentScanVerifyViewResolver) {
        this.currentScanVerifyViewResolver({
          status: {
            code: EnumResultStatus.RS_FAILED,
            message: error?.message || error,
          },
        });
      }
      throw error;
    }
  }

  private createControls(): HTMLElement {
    const { toolbarButtonsConfig, onUpload } = this.config;

    // NEW: Get verification status from shared resources
    const licenseVerificationStatus = this.getVerificationStatus();

    // Check if share is possible
    const testImageBlob = new Blob(["mock-png-data"], { type: "image/png" });
    const testFile = new File([testImageBlob], "test.png", { type: "image/png" });
    const canShare = "share" in navigator && navigator.canShare({ files: [testFile] });

    const buttons: ToolbarButton[] = [
      {
        id: `ddls-scanVerify-retake`,
        icon: toolbarButtonsConfig?.retake?.icon || ICONS.retake,
        label: toolbarButtonsConfig?.retake?.label || "Re-take",
        onClick: () => this.handleRetake(),
        className: `${toolbarButtonsConfig?.retake?.className || ""}`,
        isHidden: toolbarButtonsConfig?.retake?.isHidden || false,
        isDisabled: !this.scannerView,
      },
      {
        id: `ddls-scanVerify-done`,
        icon: toolbarButtonsConfig?.done?.icon || ICONS.complete,
        label: toolbarButtonsConfig?.done?.label || "Done",
        className: `${toolbarButtonsConfig?.done?.className || ""} ${!licenseVerificationStatus.isVerified ? "ddls-disabled-button" : ""
          }`,
        isHidden: toolbarButtonsConfig?.done?.isHidden || false,
        isDisabled: !licenseVerificationStatus.isVerified,
        onClick: () => this.handleDone(),
      },
    ];

    return createControls(buttons);
  }

  async initialize(): Promise<void> {
    try {
      if (!this.resources.result) {
        throw Error("Captured image is missing. Please capture an image first!");
      }

      if (!this.config.container) {
        throw new Error("Please create a Scan Verify View Container element");
      }

      createStyle("ddls-verify-view-style", DEFAULT_VERIFY_VIEW_CSS);

      // Create a wrapper div that preserves container dimensions
      const verifyViewWrapper = document.createElement("div");
      verifyViewWrapper.className = "ddls-verify-view-container";

      // Create header element
      const headerElement = document.createElement("div");
      headerElement.className = "ddls-verify-header";
      headerElement.textContent = this.getText().title;

      // Create and add scan result view image container
      const scanVerifyViewImageContainer = document.createElement("div");
      scanVerifyViewImageContainer.className = "ddls-verify-image-container";

      // Add header to the image container
      scanVerifyViewImageContainer.appendChild(headerElement);

      // Add scan result image
      const scanResultImg = (
        this.resources.result[this.currentScanMode].deskewedImageResult as DeskewedImageResultItem
      )?.toCanvas();
      Object.assign(scanResultImg.style, {
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
      });

      // NEW: Get verification status from shared resources and create appropriate message
      const licenseVerificationStatus = this.getVerificationStatus();
      const hasBarcodeData = this.hasBarcodeData();

      // Create message element - show error message if verification failed
      const verifyMessage = document.createElement("div");
      verifyMessage.className = `ddls-verify-message ${!licenseVerificationStatus.isVerified ? "ddls-error-message" : ""
        }`;

      if (!licenseVerificationStatus.isVerified) {
        verifyMessage.textContent = licenseVerificationStatus.errorMessage || this.getText().barcodeNotFound;
      } else if (hasBarcodeData) {
        verifyMessage.textContent = this.getText().hintVerify;
      } else {
        verifyMessage.textContent = this.getText().hintVerify;
      }

      scanVerifyViewImageContainer.appendChild(verifyMessage);
      scanVerifyViewImageContainer.appendChild(scanResultImg);
      verifyViewWrapper.appendChild(scanVerifyViewImageContainer);

      // Set up controls
      const controlContainer = this.createControls();
      verifyViewWrapper.appendChild(controlContainer);

      getElement(this.config.container).appendChild(verifyViewWrapper);
    } catch (ex: any) {
      let errMsg = ex?.message || ex;
      console.error(errMsg);
      alert(errMsg);
    }
  }

  hideView(): void {
    getElement(this.config.container).style.display = "none";
  }

  dispose(preserveResolver: boolean = false): void {
    // Clean up the container
    getElement(this.config.container).textContent = "";

    // Clear resolver only if not preserving
    if (!preserveResolver) {
      this.currentScanVerifyViewResolver = undefined;
    }
  }
}

const DEFAULT_VERIFY_VIEW_CSS = `
  .ddls-verify-view-container {
    display: flex;
    width: 100%;
    height: 100%;
    background-color:#575757;
    font-size: 12px;
    flex-direction: column;
    align-items: center;
  }

  .ddls-verify-header {
    position: absolute;
    top: 0;
    height: 3rem;
    width: 100%;
    background-color: #323234;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: Verdana;
    font-size: 18px;
    z-index: 10;
    box-sizing: border-box;
  }

  .ddls-verify-message{
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: 5rem;
    font-family: Verdana;
    padding: 0.5rem;
    user-select: none;
    color: black;
    font-size: 14px;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.8);
    text-align: center;
    width: max-content;
  }

  .ddls-error-message {
    background-color: rgba(255, 0, 0, 0.8);
    color: white;
  }

  .ddls-disabled-button {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  .ddls-verify-image-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    position: relative;
    padding-top: 3rem;
    box-sizing: border-box;
  }

  @media (orientation: landscape) and (max-width: 1024px) {
    .ddls-verify-view-container {
      flex-direction: row;
    }
    
    .ddls-verify-view-container div canvas {
      max-height: 80% !important;
    }
  
    .ddls-verify-message{
      top: 0.5rem;
      border: none;
      background-color: transparent;
      color: white;
    }

    .ddls-error-message {
      color: #ffabab;
    }

    .ddls-verify-header{
      display: none; 
    }

    .ddls-verify-image-container{
      padding-top: 1rem;
    }
  }
`;
