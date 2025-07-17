import { SharedResources } from "../DriverLicenseScanner";
import DriverLicenseScannerView from "./DriverLicenseScannerView";
import { DeskewedImageResultItem } from "dynamsoft-capture-vision-bundle";
import { createControls, createStyle, getElement, shouldCorrectImage, isEmptyObject } from "../utils";
import DriverLicenseCorrectionView from "./DriverLicenseCorrectionView";
import { ICONS } from "../utils/icons";
import {
  DriverLicenseFullResult,
  EnumDriverLicenseScanSide,
  DriverLicenseData,
  EnumDriverLicenseData,
  DriverLicenseDataLabel,
  DriverLicenseDate,
  displayDriverLicenseDate,
  DriverLicenseDateFields,
} from "../utils/DriverLicenseParser";
import { DriverLicenseWorkflowConfig, EnumResultStatus, ToolbarButton, ToolbarButtonConfig } from "../utils/types";
import { DEFAULT_RESULT_VIEW_TEXT, ResultViewText } from "../utils/strings";

export interface DriverLicenseResultViewToolbarButtonsConfig {
  cancel?: ToolbarButtonConfig;
  correct?: ToolbarButtonConfig;
  share?: ToolbarButtonConfig;
  upload?: ToolbarButtonConfig;
  done?: ToolbarButtonConfig;
}

export interface DriverLicenseResultViewConfig {
  container?: HTMLElement | string;
  toolbarButtonsConfig?: DriverLicenseResultViewToolbarButtonsConfig;
  showOriginalImages?: boolean; // True by default
  allowResultEditing?: boolean; // New option to control if result fields can be edited
  emptyResultMessage?: string;

  textConfig: ResultViewText;

  onDone?: (scanResult: DriverLicenseFullResult) => Promise<void>;
  onUpload?: (scanResult: DriverLicenseFullResult) => Promise<void>;

  _workflowConfig: DriverLicenseWorkflowConfig;
}

export default class DriverLicenseResultView {
  private currentScanResultViewResolver?: (scanResult: DriverLicenseFullResult) => void;
  private editedFields: Partial<DriverLicenseData> = {};
  private currentScanMode: EnumDriverLicenseScanSide = EnumDriverLicenseScanSide.Front;

  constructor(
    private resources: SharedResources,
    private config: DriverLicenseResultViewConfig,
    private scannerView: DriverLicenseScannerView,
    private correctionView: DriverLicenseCorrectionView
  ) {}

  async launch(): Promise<DriverLicenseFullResult> {
    try {
      getElement(this.config.container).textContent = "";
      await this.initialize();
      getElement(this.config.container).style.display = "flex";

      // Return promise that resolves when user clicks done
      return new Promise((resolve) => {
        this.currentScanResultViewResolver = resolve;
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
        await this.config.onUpload(result);
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

        // Clear current scan result view and reinitialize with new image
        this.dispose(true); // true = preserve resolver
        await this.initialize();
        getElement(this.config.container).style.display = "flex";
      }
    } catch (error) {
      console.error("DriverLicenseImageResultView - Handle Correction View Error:", error);
      // Make sure to resolve with error if something goes wrong
      if (this.currentScanResultViewResolver) {
        const errMsg = error?.message || error;
        console.error(errMsg);
        const errorResult: DriverLicenseFullResult = {
          [EnumDriverLicenseScanSide.Front]: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
          [EnumDriverLicenseScanSide.Back]: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
          licenseData: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
        };

        this.currentScanResultViewResolver(errorResult);
      }
      throw error;
    }
  }

  private async handleCancel() {
    try {
      // Create cancelled result for all components
      const cancelledResult: DriverLicenseFullResult = {
        [EnumDriverLicenseScanSide.Front]: {
          status: {
            code: EnumResultStatus.RS_CANCELLED,
            message: "Scan cancelled by user",
          },
        },
        [EnumDriverLicenseScanSide.Back]: {
          status: {
            code: EnumResultStatus.RS_CANCELLED,
            message: "Scan cancelled by user",
          },
        },
        licenseData: {
          status: {
            code: EnumResultStatus.RS_CANCELLED,
            message: "Scan cancelled by user",
          },
        },
      };

      // Update shared resources with cancelled status
      if (this.resources.onResultUpdated) {
        this.resources.onResultUpdated(cancelledResult);
      }

      // Resolve with cancelled result
      if (this.currentScanResultViewResolver) {
        this.currentScanResultViewResolver(cancelledResult);
      }

      // Clean up
      this.hideView();
      this.dispose();
    } catch (error) {
      console.error("Error in cancel handler:", error);
      // Make sure to resolve with error if something goes wrong
      if (this.currentScanResultViewResolver) {
        const errMsg = error?.message || error;
        console.error(errMsg);
        const errorResult: DriverLicenseFullResult = {
          [EnumDriverLicenseScanSide.Front]: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
          [EnumDriverLicenseScanSide.Back]: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
          licenseData: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
        };

        this.currentScanResultViewResolver(errorResult);
      }
      throw error;
    }
  }

  private async handleDone() {
    try {
      // Apply edited fields to the result
      if (this.resources.result?.licenseData && !isEmptyObject(this.editedFields)) {
        this.resources.result.licenseData = {
          ...this.resources.result.licenseData,
          ...this.editedFields,
        };

        if (this.resources.onResultUpdated) {
          this.resources.onResultUpdated(this.resources.result);
        }
      }

      if (this.config?.onDone) {
        await this.config.onDone(this.resources.result);
      }

      // Resolve with current result
      if (this.currentScanResultViewResolver && this.resources.result) {
        this.currentScanResultViewResolver(this.resources.result);
      }

      // Clean up
      this.hideView();
      this.dispose();
    } catch (error) {
      const errMsg = error?.message || error;
      console.error(errMsg);

      if (this.currentScanResultViewResolver) {
        const errorResult: DriverLicenseFullResult = {
          [EnumDriverLicenseScanSide.Front]: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
          [EnumDriverLicenseScanSide.Back]: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
          licenseData: {
            status: { code: EnumResultStatus.RS_FAILED, message: errMsg },
          },
        };

        this.currentScanResultViewResolver(errorResult);
      }
      throw error;
    }
  }

  private handleFieldEdit(key: string, value: any) {
    // For date fields, we need special handling
    if (
      key === EnumDriverLicenseData.DateOfBirth ||
      key === EnumDriverLicenseData.ExpiryDate ||
      key === EnumDriverLicenseData.IssueDate
    ) {
      try {
        const [year, month, day] = value.split(/[\/\-\.]/);
        if (day && month && year) {
          this.editedFields[key] = {
            day: parseInt(day, 10),
            month: parseInt(month, 10),
            year: parseInt(year, 10),
          } as DriverLicenseDate;
        }
      } catch (e) {
        console.error("Error parsing date", e);
      }
    } else {
      (this.editedFields as any)[key] = value;
    }
  }

  private createImagesDisplay() {
    const imagesContainer = document.createElement("div");
    imagesContainer.className = "ddls-images-container";

    // Create section header
    const sectionHeader = document.createElement("div");
    sectionHeader.className = "ddls-section-header";
    sectionHeader.textContent = "Captured Images";
    imagesContainer.appendChild(sectionHeader);

    const imagesContent = document.createElement("div");
    imagesContent.className = "ddls-images-content";

    const { result } = this.resources;

    // Create front image container
    if (result[EnumDriverLicenseScanSide.Front]?.deskewedImageResult) {
      const frontContainer = document.createElement("div");
      frontContainer.className = "ddls-image-section";

      const frontLabel = document.createElement("div");
      frontLabel.className = "ddls-image-label";
      frontLabel.textContent = "Front Image:";

      const frontImageContainer = document.createElement("div");
      frontImageContainer.className = "ddls-image-wrapper";

      const frontImg = (
        result[EnumDriverLicenseScanSide.Front].deskewedImageResult as DeskewedImageResultItem
      )?.toCanvas();
      Object.assign(frontImg.style, {
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
      });

      frontImageContainer.appendChild(frontImg);
      frontContainer.appendChild(frontLabel);
      frontContainer.appendChild(frontImageContainer);
      imagesContent.appendChild(frontContainer);
    }

    // Create back image container
    if (result[EnumDriverLicenseScanSide.Back]?.deskewedImageResult) {
      const backContainer = document.createElement("div");
      backContainer.className = "ddls-image-section";

      const backLabel = document.createElement("div");
      backLabel.className = "ddls-image-label";
      backLabel.textContent = "Back Image:";

      const backImageContainer = document.createElement("div");
      backImageContainer.className = "ddls-image-wrapper";

      const backImg = (
        result[EnumDriverLicenseScanSide.Back].deskewedImageResult as DeskewedImageResultItem
      )?.toCanvas();
      Object.assign(backImg.style, {
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
      });

      backImageContainer.appendChild(backImg);
      backContainer.appendChild(backLabel);
      backContainer.appendChild(backImageContainer);
      imagesContent.appendChild(backContainer);
    }

    imagesContainer.appendChild(imagesContent);
    return imagesContainer;
  }

  private createDriverLicenseDataDisplay() {
    const licenseData = this.resources.result?.licenseData || ({} as DriverLicenseData);
    const isEditingAllowed = !!this.config.allowResultEditing;
    const invalidFields = licenseData.invalidFields || [];

    const hiddenFields = [EnumDriverLicenseData.InvalidFields, "status", "flow", "licenseVerificationStatus"];

    const resultContainer = document.createElement("div");
    resultContainer.className = "ddls-license-data-container";

    // Create section header
    const sectionHeader = document.createElement("div");
    sectionHeader.className = "ddls-section-header";
    sectionHeader.textContent = "Extracted Data";
    resultContainer.appendChild(sectionHeader);

    const dataContent = document.createElement("div");
    dataContent.className = "ddls-data-content";

    if (!isEmptyObject(licenseData) && licenseData.status?.code === EnumResultStatus.RS_SUCCESS) {
      // If there are invalid fields and editing is allowed, add a notification
      if (invalidFields.length > 0) {
        const errorNotification = document.createElement("div");
        errorNotification.className = "ddls-error-notification";
        errorNotification.innerHTML = `
        <div class="ddls-error-icon">${ICONS.failed}</div>
        <div class="ddls-error-message">
          ${
            isEditingAllowed
              ? "Some fields require correction. Please review highlighted fields."
              : "Some fields contain invalid information. Please retake the scan."
          }
        </div>
      `;
        dataContent.appendChild(errorNotification);
      } else if (invalidFields.length === 0 && isEditingAllowed) {
        const infoNotification = document.createElement("div");
        infoNotification.className = "ddls-info-notification";
        infoNotification.innerHTML = `
        <div class="ddls-info-icon">${ICONS.info}</div>
        <div class="ddls-info-message">
          Please review all fields to ensure the information is correct.
        </div>
      `;
        dataContent.appendChild(infoNotification);
      }

      Object.entries(licenseData).forEach(([key, value]) => {
        // Only skip truly hidden fields and status, not undefined values
        if (hiddenFields.includes(key as EnumDriverLicenseData)) {
          return;
        }

        // For date fields, always show them even if they're empty/invalid
        const isDateField = DriverLicenseDateFields.includes(key as EnumDriverLicenseData);

        // Skip only if value is null/undefined AND it's not a date field
        if (!value && !isDateField) {
          return;
        }

        const result = document.createElement("div");
        result.className = "ddls-data-row";

        // Add special class for invalid fields that need attention
        const isInvalid = invalidFields.includes(key as EnumDriverLicenseData);
        if (isInvalid) {
          result.classList.add("invalid-field");
        }

        const nonEditableFields = [
          EnumDriverLicenseData.LicenseType,
          EnumDriverLicenseData.Age,
          EnumDriverLicenseData.IssuingCountry,
        ];

        const resultLabel = document.createElement("span");
        resultLabel.className = "ddls-data-label";
        resultLabel.innerText = DriverLicenseDataLabel[key as EnumDriverLicenseData] || key;

        // Add validation marker for invalid fields
        if (isInvalid) {
          const invalidIcon = document.createElement("span");
          invalidIcon.className = "ddls-error-icon";
          invalidIcon.innerHTML = ICONS.failed;
          resultLabel.appendChild(invalidIcon);

          if (isEditingAllowed) {
            const errorHint = document.createElement("span");
            errorHint.className = "ddls-error-hint";
            errorHint.textContent = "Please correct this field";
            resultLabel.appendChild(errorHint);
          }
        }

        const resultValue = document.createElement("div");
        resultValue.className = "ddls-data-value";

        // Make editable only if editing is allowed and it's not a non-editable field
        if (isEditingAllowed && !nonEditableFields.includes(key as EnumDriverLicenseData)) {
          const inputField = document.createElement("input");
          inputField.className = "ddls-data-input";

          // Add special class for invalid fields
          if (isInvalid) {
            inputField.classList.add("invalid");
          }

          if (isDateField) {
            const displayValue = value ? displayDriverLicenseDate(value as DriverLicenseDate) : "";
            inputField.value = displayValue === "N/A" ? "" : displayValue;
            inputField.setAttribute("placeholder", "YYYY-MM-DD");
          } else {
            inputField.value = (value as string) || "";
          }

          inputField.addEventListener("input", (e) => {
            this.handleFieldEdit(key, (e.target as HTMLInputElement).value);

            // Remove invalid styling when user starts editing
            if (isInvalid) {
              inputField.classList.remove("invalid");
              result.classList.remove("invalid-field");

              // Also remove the field from the invalidFields array in editedFields
              if (!this.editedFields.invalidFields) {
                // Copy the original invalidFields array
                this.editedFields.invalidFields = [...invalidFields];
              }

              // Remove this field from the invalidFields array
              const index = this.editedFields.invalidFields.indexOf(key as EnumDriverLicenseData);
              if (index > -1) {
                this.editedFields.invalidFields.splice(index, 1);
              }
            }
          });

          resultValue.appendChild(inputField);
        } else {
          // For read-only fields, display as text
          if (isDateField) {
            resultValue.innerText = value ? displayDriverLicenseDate(value as DriverLicenseDate) : "N/A";
          } else {
            resultValue.innerText = (value as string) || "N/A";
          }

          // Add special class for invalid fields
          if (isInvalid) {
            resultValue.classList.add("invalid-value");
          }
        }

        result.appendChild(resultLabel);
        result.appendChild(resultValue);
        dataContent.appendChild(result);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "ddls-data-row empty";
      empty.innerText =
        this.config?.emptyResultMessage ?? "The license information could not be detected. Please try again.";

      dataContent.appendChild(empty);
    }

    resultContainer.appendChild(dataContent);
    return resultContainer;
  }

  private createControls(): HTMLElement {
    const { toolbarButtonsConfig, onUpload } = this.config;

    // Check if share is possible
    const testImageBlob = new Blob(["mock-png-data"], { type: "image/png" });
    const testFile = new File([testImageBlob], "test.png", { type: "image/png" });
    const canShare = "share" in navigator && navigator.canShare({ files: [testFile] });

    const buttons: ToolbarButton[] = [
      {
        id: `ddls-scanResult-cancel`,
        icon: toolbarButtonsConfig?.cancel?.icon || ICONS.cancel,
        label: toolbarButtonsConfig?.cancel?.label || "Cancel",
        onClick: () => this.handleCancel(),
        className: `${toolbarButtonsConfig?.cancel?.className || ""}`,
        isHidden: toolbarButtonsConfig?.cancel?.isHidden || false,
        isDisabled: false,
      },
      {
        id: `ddls-scanResult-done`,
        icon: toolbarButtonsConfig?.done?.icon || ICONS.complete,
        label: toolbarButtonsConfig?.done?.label || "Done",
        className: `${toolbarButtonsConfig?.done?.className || ""}`,
        isHidden: toolbarButtonsConfig?.done?.isHidden || false,
        onClick: () => this.handleDone(),
      },
    ];

    return createControls(buttons);
  }

  private getText(): ResultViewText {
    const configText = this.config.textConfig;
    const defaultText = DEFAULT_RESULT_VIEW_TEXT;

    return {
      ...defaultText,
      ...(configText || {}),
    };
  }

  async initialize(): Promise<void> {
    try {
      if (!this.resources.result) {
        throw Error("Captured image is missing. Please capture an image first!");
      }

      if (!this.config.container) {
        throw new Error("Please create a Scan Result View Container element");
      }

      createStyle("ddls-result-view-style", DEFAULT_RESULT_VIEW_CSS);

      // Create a wrapper div that preserves container dimensions
      const resultViewWrapper = document.createElement("div");
      resultViewWrapper.className = "ddls-result-view-container";

      // Create header element
      const headerElement = document.createElement("div");
      headerElement.className = "ddls-result-view-header";
      headerElement.textContent = this.getText().title;

      resultViewWrapper.appendChild(headerElement);

      // Create main content container
      const contentContainer = document.createElement("div");
      contentContainer.className = "ddls-content-container";

      const { captureFrontImage, captureBackImage, readBarcode } = this.config._workflowConfig;
      const isBarcodeOnlyWorkflow = !captureFrontImage && !captureBackImage && readBarcode;

      // Add images if enabled
      if (!isBarcodeOnlyWorkflow && this.config.showOriginalImages !== false) {
        const imagesContainer = this.createImagesDisplay();
        contentContainer.appendChild(imagesContainer);
      }

      // Add license data display
      const dataContainer = this.createDriverLicenseDataDisplay();
      contentContainer.appendChild(dataContainer);

      resultViewWrapper.appendChild(contentContainer);

      // Set up controls
      const controlContainer = this.createControls();
      resultViewWrapper.appendChild(controlContainer);

      getElement(this.config.container).appendChild(resultViewWrapper);
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
      this.currentScanResultViewResolver = undefined;
    }
  }
}

const DEFAULT_RESULT_VIEW_CSS = `
  .ddls-result-view-container {
    display: flex;
    width: 100%;
    height: 100%;
    background-color: #575757;
    font-size: 12px;
    flex-direction: column;
    align-items: center;
  }

  .ddls-result-view-header {
    height: 3rem;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: Verdana;
    font-size: 18px;
  }


  .ddls-content-container {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow-y: auto;
    background-color: black;
    gap: 1rem;
    padding: 1rem 0.5rem;
  }

  .ddls-section-header {
    background-color: #323234;
    color: white;
    font-family: Verdana;
    font-size: 16px;
    padding: 12px 2rem;
    text-align: left;
    border-radius: 0.5rem 0.5rem 0 0;
  }

  .ddls-images-container {
    display: flex;
    width: 100%;
    background-color: #575757;
    flex-direction: column;
    border-radius: 0.5rem
  }

  .ddls-images-content {
    display: flex;
    flex-direction: column;
    padding: 1rem 0;
    gap: 1rem;
  }

  .ddls-image-section {
    display: flex;
    flex-direction: column;
    padding: 0 1rem;
  }

  .ddls-image-label {
    color: white;
    font-family: Verdana;
    font-size: 14px;
    text-align: left;
    margin-bottom: 0.5rem;
  }

  .ddls-image-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    background-color: #323234;
    border-radius: 0.5rem;
    max-width: 800px;
    max-height: 504px;
  }

  .ddls-license-data-container {
    font-size: 16px;
    font-family: Verdana;
    color: white;
    display: flex;
    flex-direction: column;
    border-radius: 0.5rem;
    background-color: #575757;
  }

  .ddls-data-content {
    flex: 1;
    padding: 0.5rem 0;
  }

  .ddls-data-row {
    padding: 0.5rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: background-color 0.3s ease;
  }

  .ddls-image-section {
    padding:  0 2rem;
  }

  .ddls-data-row.invalid-field {
    background-color: rgba(231, 76, 60, 0.1);
    border-left: 3px solid #e74c3c;
    padding-left: calc(2rem - 3px);
  }

  .ddls-data-label {
    color: #aaa;
    display: flex;
    gap: 0.5rem;
    align-items: end;
    flex-wrap: wrap;
  }

  .ddls-error-notification,
  .ddls-info-notification {
    color: white;
    padding: 1rem;
    margin: 0.5rem 2rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 1rem;
    text-align: start;
  }

  .ddls-error-notification {
    background-color: rgba(231, 76, 60, 0.2);
  }

  .ddls-info-notification {
    background-color: rgba(254, 142, 20, 0.2);
    border: 1px solid #fe8e14;
  }

  .ddls-error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e74c3c;
  }

  .ddls-info-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fe8e14;
  }

  .ddls-info-message,
  .ddls-error-message {
    flex: 1;
  }

  .ddls-error-hint {
    font-size: 0.8rem;
    color: #e74c3c;
  }

  .ddls-data-value {
    word-wrap: break-word;
    text-align: start;
  }

  .ddls-data-value.invalid-value {
    color: #e74c3c;
    text-decoration: wavy underline #e74c3c;
    text-decoration-skip-ink: none;
  }

  .ddls-data-input {
    width: 100%;
    padding: 8px;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    border-radius: 4px;
    font-size: 14px;
    transition: all 0.3s ease;
  }

  .ddls-data-input.invalid {
    background-color: rgba(231, 76, 60, 0.1);
    border-color: #e74c3c;
  }

  .ddls-data-input:focus {
    background-color: rgba(255, 255, 255, 0.2);
    border-color: #fe8e14;
    outline: none;
  }

  .ddls-data-row.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding-top: 0;
    padding-bottom: 0;
    text-align: center;
  }

  @media (orientation: landscape) and (max-width: 1024px) {
    .ddls-result-view-container {
   flex-direction: row;
  }

    .ddls-images-content {
      flex-direction: column;
    }

    .ddls-image-section:not(:last-child) {
      border-right: none;
      border-bottom: 1px solid #666;
    }
    
    .ddls-license-data-container {
      height: 100%;
    }

    .ddls-data-row:first-of-type {
      padding-top: 1rem;
    }

    .ddls-data-row:last-of-type {
      padding-bottom: 1rem;
    }
  }

  @media (max-width: 600px) {
    .ddls-image-wrapper {
      justify-content: center;
    }

    .ddls-image-section {
      padding:  0 1rem;
    }
    
    .ddls-data-row {
      padding: 0.5rem 1rem;
    }
    
    .ddls-error-notification,
    .ddls-info-notification {
      margin: 1rem;
      padding: 0.5rem;
    }

    .ddls-section-header {
      font-size: 14px;
      padding: 10px 1rem;
    }
  }
`;
