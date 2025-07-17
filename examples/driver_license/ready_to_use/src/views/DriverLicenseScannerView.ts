import {
  EnumCapturedResultItemType,
  EnumImagePixelFormat,
  OriginalImageResultItem,
  Quadrilateral,
  CapturedResultReceiver,
  CapturedResult,
  DeskewedImageResultItem,
  DCEFrame,
  DSImageData,
  CapturedResultItem,
  DrawingLayer,
  Feedback,
} from "dynamsoft-capture-vision-bundle";
import { SharedResources } from "../DriverLicenseScanner";
import {
  DEFAULT_TEMPLATE_NAMES,
  DRIVER_LICENSE_CARD_RATIO,
  DriverLicenseData,
  DriverLicenseFullResult,
  DriverLicenseImageResult,
  EnumDriverLicenseScanMode,
  EnumDriverLicenseScanSide,
  isWithinLicenseRatio,
  processDriverLicenseData,
} from "../utils/DriverLicenseParser";
import { DriverLicenseWorkflowConfig, EnumFlowType, EnumResultStatus, UtilizedTemplateNames } from "../utils/types";
import { DEFAULT_LOADING_SCREEN_STYLE, showLoadingScreen } from "../utils/LoadingScreen";
import { addPaddingToPoints, createStyle, findClosestResolutionLevel, getElement } from "../utils";
import { DEFAULT_SCANNER_VIEW_TEXT_BACK, DEFAULT_SCANNER_VIEW_TEXT_FRONT, ScannerViewText } from "../utils/strings";
import { VideoFrameTag } from "dynamsoft-capture-vision-bundle";
import measureBlur, { calculateBlurThreshold } from "../utils/MeasureBlur";

export interface DriverLicenseScannerViewConfig {
  _showCorrectionView?: boolean; // Internal use, to remove Smart Capture if correctionView is not available
  _workflowConfig?: DriverLicenseWorkflowConfig; //  Internal use

  templateFilePath?: string;
  uiPath?: string;
  container?: HTMLElement | string;
  utilizedTemplateNames?: UtilizedTemplateNames;

  showScanHint?: boolean; //true by default
  showScanGuide?: boolean; // true by default
  showUploadImage?: boolean; // true by default
  showSoundToggle?: boolean; // true by default
  showManualCaptureButton?: boolean; // true by default
  showPoweredByDynamsoft?: boolean; // true by default

  textConfig?: Record<EnumDriverLicenseScanSide, ScannerViewText>;
}

interface DCEElements {
  soundFeedbackBtn: HTMLElement | null;
  selectCameraBtn: HTMLElement | null;
  uploadImageBtn: HTMLElement | null;
  closeScannerBtn: HTMLElement | null;
  takePhotoBtn: HTMLElement | null;
  boundsDetectionBtn: HTMLElement | null;
  smartCaptureBtn: HTMLElement | null;
  autoCropBtn: HTMLElement | null;
  hintTopMessage: HTMLElement | null;
}

enum EnumScanGuideType {
  FRONT_LICENSE = "front-license",
  BACK_LICENSE = "back-license",
  MOVE_CLOSER = "move-closer",
  CHANGE_ORIENTATION = "change-orientation",
  NONE = "none",
}

interface BarcodeVerificationResult {
  success: boolean;
  errorMessage?: string;
  barcodeData?: DriverLicenseData;
}

// Implementation
export default class DriverLicenseScannerView {
  private isCapturing: boolean = false;

  private currentScanMode: EnumDriverLicenseScanMode = EnumDriverLicenseScanMode.Image;
  private currentScanSide: EnumDriverLicenseScanSide = EnumDriverLicenseScanSide.Front;

  // Capture Mode
  private boundsDetectionEnabled: boolean = false;
  private smartCaptureEnabled: boolean = false;
  private autoCropEnabled: boolean = false;

  private isSoundFeedbackOn: boolean = false;
  private licenseVerificationCount: number = 0;

  // Used for ImageEditorView (In NornalizerView)
  private capturedResult: CapturedResult;
  private originalImageData: OriginalImageResultItem["imageData"] | DCEFrame | null = null;

  private initialized: boolean = false;
  private initializedDCE: boolean = false;

  private resizeTimer: number | null = null;

  // Elements
  private DCE_ELEMENTS: DCEElements = {
    soundFeedbackBtn: null,
    selectCameraBtn: null,
    uploadImageBtn: null,
    closeScannerBtn: null,
    takePhotoBtn: null,
    boundsDetectionBtn: null,
    smartCaptureBtn: null,
    autoCropBtn: null,
    hintTopMessage: null,
  };

  private currentGuideType: EnumScanGuideType = EnumScanGuideType.NONE;
  private DCE_SCANGUIDE_ELEMENTS: Record<EnumScanGuideType, HTMLElement | null> = {
    [EnumScanGuideType.FRONT_LICENSE]: null,
    [EnumScanGuideType.BACK_LICENSE]: null,
    [EnumScanGuideType.MOVE_CLOSER]: null,
    [EnumScanGuideType.CHANGE_ORIENTATION]: null,
    [EnumScanGuideType.NONE]: null,
  };

  // Scan Resolve
  private currentScanResolver?: (result: DriverLicenseImageResult) => void;

  private loadingScreen: ReturnType<typeof showLoadingScreen> | null = null;

  private showScannerLoadingOverlay(message?: string) {
    const configContainer = getElement(this.config.container);
    this.loadingScreen = showLoadingScreen(configContainer, { message });
    configContainer.style.display = "block";
    configContainer.style.position = "relative";
  }

  private hideScannerLoadingOverlay(hideContainer: boolean = false) {
    if (this.loadingScreen) {
      this.loadingScreen.hide();
      this.loadingScreen = null;

      if (hideContainer) {
        getElement(this.config.container).style.display = "none";
      }
    }
  }

  private handleResize = () => {
    // Hide all guides first
    this.toggleScanGuide(false, EnumScanGuideType.NONE);

    // Clear existing timer
    if (this.resizeTimer) {
      window.clearTimeout(this.resizeTimer);
    }

    // Set new timer
    this.resizeTimer = window.setTimeout(() => {
      // Re-show guides and update scan region
      this.toggleScanGuide(true, this.currentGuideType);
    }, 500);
  };

  private toggleSoundFeedback(enabled?: boolean) {
    this.isSoundFeedbackOn = enabled !== undefined ? enabled : !this.isSoundFeedbackOn;

    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];
    if (!DCEContainer?.shadowRoot) return;

    const soundFeedbackContainer = DCEContainer.shadowRoot.querySelector(".dce-mn-sound-feedback") as HTMLElement;

    const onIcon = soundFeedbackContainer.querySelector(".dce-mn-sound-feedback-on") as HTMLElement;
    const offIcon = soundFeedbackContainer.querySelector(".dce-mn-sound-feedback-off") as HTMLElement;

    offIcon.style.display = this.isSoundFeedbackOn ? "none" : "block";
    onIcon.style.display = this.isSoundFeedbackOn ? "block" : "none";
  }

  private getText(): ScannerViewText {
    const configText = this.config.textConfig?.[this.currentScanSide];
    const defaultText =
      this.currentScanSide === EnumDriverLicenseScanSide.Front
        ? DEFAULT_SCANNER_VIEW_TEXT_FRONT
        : DEFAULT_SCANNER_VIEW_TEXT_BACK;

    return {
      ...defaultText,
      ...(configText || {}),
    };
  }

  constructor(private resources: SharedResources, private config: DriverLicenseScannerViewConfig) {
    this.config.utilizedTemplateNames = {
      detect: config.utilizedTemplateNames?.detect || DEFAULT_TEMPLATE_NAMES.detect,
      normalize: config.utilizedTemplateNames?.normalize || DEFAULT_TEMPLATE_NAMES.normalize,
      barcode: config.utilizedTemplateNames?.barcode || DEFAULT_TEMPLATE_NAMES.barcode,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Create loading screen style
    createStyle("dynamsoft-ddls-loading-screen-style", DEFAULT_LOADING_SCREEN_STYLE);

    try {
      const { cameraView, cameraEnhancer, cvRouter } = this.resources;

      // Set up cameraView styling
      cameraView.setVideoFit("cover");

      // Set cameraEnhancer as input for CaptureVisionRouter
      cvRouter.setInput(cameraEnhancer);

      const resultReceiver = new CapturedResultReceiver();

      resultReceiver.onCapturedResultReceived = (result) => {
        const { captureFrontImage, captureBackImage, readBarcode } = this.config._workflowConfig;
        const isBarcodeOnlyWorkflow = !captureFrontImage && !captureBackImage && readBarcode;

        if (isBarcodeOnlyWorkflow) {
          this.handleBarcodeDetection(result);
        } else {
          this.handleBoundsDetection(result);
        }
      };

      await cvRouter.addResultReceiver(resultReceiver);

      // Set default value for smartCapture and boundsDetection modes (Driver License)
      this.boundsDetectionEnabled = true;
      this.smartCaptureEnabled = true;
      this.autoCropEnabled = true;

      // Set defaults from config TODO not needed?
      if (this.config.showScanGuide === false) {
        this.toggleScanGuide(false, EnumScanGuideType.NONE);
      }

      this.initialized = true;
    } catch (ex: any) {
      let errMsg = ex?.message || ex;
      console.error(errMsg);
      alert(errMsg);
      this.closeCamera();
      const result = {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: "DDLS Init error",
        },
      };
      this.currentScanResolver(result);
    }
  }

  private async processBarcodeFromImage(imageData: DSImageData): Promise<DriverLicenseData> {
    if (!this.config._workflowConfig?.readBarcode) {
      return {
        status: {
          code: EnumResultStatus.RS_SUCCESS,
          message: "Barcode processing disabled",
        },
      };
    }

    try {
      const { cvRouter } = this.resources;
      const templateName = this.config.utilizedTemplateNames.barcode;

      const captureResult = await cvRouter.capture(imageData, templateName);

      if (captureResult?.parsedResult?.parsedResultItems?.length > 0) {
        const parsedResult = captureResult.parsedResult.parsedResultItems[0];
        const processedData = processDriverLicenseData(parsedResult);

        if (processedData) {
          return {
            ...processedData,
            status: {
              code: EnumResultStatus.RS_SUCCESS,
              message: `Barcode successfully processed from ${this.currentScanSide} side`,
            },
          };
        }
      }

      return {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: `No readable barcode found in ${this.currentScanSide} image`,
        },
      };
    } catch (error) {
      console.error("Error processing barcode:", error);
      return {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: `Barcode processing failed: ${error?.message || error}`,
        },
      };
    }
  }

  private async performBarcodeVerification(barcodeData: DriverLicenseData): Promise<BarcodeVerificationResult> {
    const { barcodeVerificationCallback } = this.config._workflowConfig || {};

    if (!barcodeVerificationCallback) {
      // No verification callback means verification passes by default
      return {
        success: true,
        barcodeData,
      };
    }

    try {
      const verificationPassed = await barcodeVerificationCallback(barcodeData);

      if (!verificationPassed) {
        return {
          success: false,
          errorMessage: "Barcode verification failed - information could not be validated",
          barcodeData,
        };
      }

      return {
        success: true,
        barcodeData,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: `Verification error: ${error?.message || error}`,
        barcodeData,
      };
    }
  }

  private async processAndUpdateBarcodeData(imageData: DSImageData): Promise<DriverLicenseData | null> {
    const barcodeScanSide = this.config._workflowConfig?.barcodeScanSide ?? EnumDriverLicenseScanSide.Back;

    if (!this.config._workflowConfig?.readBarcode || this.currentScanSide !== barcodeScanSide) {
      return null;
    }

    try {
      // Process barcode from image
      const barcodeData = await this.processBarcodeFromImage(imageData);

      if (barcodeData.status.code === EnumResultStatus.RS_SUCCESS) {
        // Perform verification if enabled
        if (this.config._workflowConfig?.enableBarcodeVerification && this.currentScanSide) {
          const verificationResult = await this.performBarcodeVerification(barcodeData);

          // Add verification status to barcode data
          const updatedBarcodeData = {
            ...barcodeData,
            licenseVerificationStatus: {
              isVerified: verificationResult.success,
              errorMessage: verificationResult.errorMessage,
            },
          };

          // Update shared resources with verified barcode data
          if (this.resources.onResultUpdated) {
            this.resources.onResultUpdated({
              ...this.resources.result,
              licenseData: updatedBarcodeData,
            });
          }

          return updatedBarcodeData;
        } else {
          // Update shared resources with barcode data (no verification)
          if (this.resources.onResultUpdated) {
            this.resources.onResultUpdated({
              ...this.resources.result,
              licenseData: barcodeData,
            });
          }

          return barcodeData;
        }
      }

      return null;
    } catch (error) {
      console.error("Error processing barcode data:", error);
      // Don't throw the error to prevent it from affecting the main image capture flow
      return null;
    }
  }

  private async initializeElements() {
    const configContainer = getElement(this.config.container);

    const DCEContainer = configContainer.children[configContainer.children.length - 1];

    if (!DCEContainer?.shadowRoot) {
      throw new Error("Shadow root not found");
    }

    this.DCE_ELEMENTS = {
      soundFeedbackBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-sound-feedback"),
      selectCameraBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-select-camera-icon"),
      uploadImageBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-upload-image-icon"),
      closeScannerBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-close"),
      takePhotoBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-take-photo"),
      boundsDetectionBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-bounds-detection"),
      smartCaptureBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-smart-capture"),
      autoCropBtn: DCEContainer.shadowRoot.querySelector(".dce-mn-auto-crop"),
      hintTopMessage: DCEContainer.shadowRoot.querySelector(".dce-hint-top"),
    };

    this.DCE_SCANGUIDE_ELEMENTS = {
      [EnumScanGuideType.FRONT_LICENSE]: DCEContainer.shadowRoot.querySelector(".dce-scanguide-dl-front"),
      [EnumScanGuideType.BACK_LICENSE]: DCEContainer.shadowRoot.querySelector(".dce-scanguide-dl-back"),
      [EnumScanGuideType.MOVE_CLOSER]: DCEContainer.shadowRoot.querySelector(".dce-scanguide-move-closer"),
      [EnumScanGuideType.CHANGE_ORIENTATION]: DCEContainer.shadowRoot.querySelector(".dce-scanguide-rotate-dl"),
      [EnumScanGuideType.NONE]: null,
    };

    await this.toggleBoundsDetection(this.boundsDetectionEnabled);
    await this.toggleSmartCapture(this.smartCaptureEnabled);
    await this.toggleAutoCrop(this.autoCropEnabled);

    this.assignDCEClickEvents();

    // If showCorrectionView is false, hide smartCapture
    if (this.config._showCorrectionView === false) {
      this.DCE_ELEMENTS.smartCaptureBtn.style.display = "none";
    }

    if (this.config.showUploadImage === false) {
      this.DCE_ELEMENTS.uploadImageBtn.style.display = "none";
    }

    if (this.config.showSoundToggle === false) {
      this.DCE_ELEMENTS.soundFeedbackBtn.style.display = "none";
    }

    if (this.config.showManualCaptureButton === false) {
      const footer = DCEContainer.shadowRoot.querySelector(".dce-footer") as HTMLElement;
      footer.style.display = "none";
    }

    this.initializedDCE = true;
  }

  private assignDCEClickEvents() {
    if (!Object.values(this.DCE_ELEMENTS).every(Boolean)) {
      throw new Error("Camera control elements not found");
    }

    this.takePhoto = this.takePhoto.bind(this);
    this.toggleBoundsDetection = this.toggleBoundsDetection.bind(this);
    this.toggleSmartCapture = this.toggleSmartCapture.bind(this);
    this.toggleAutoCrop = this.toggleAutoCrop.bind(this);
    this.closeCamera = this.closeCamera.bind(this);

    this.DCE_ELEMENTS.takePhotoBtn.onclick = this.takePhoto;

    this.DCE_ELEMENTS.boundsDetectionBtn.onclick = async () => {
      await this.toggleBoundsDetection();
    };

    this.DCE_ELEMENTS.smartCaptureBtn.onclick = async () => { };

    this.DCE_ELEMENTS.autoCropBtn.onclick = async () => {
      await this.toggleAutoCrop();
    };

    this.DCE_ELEMENTS.closeScannerBtn.onclick = async () => {
      await this.handleCloseBtn();
    };

    this.DCE_ELEMENTS.selectCameraBtn.onclick = (event) => {
      event.stopPropagation();
      this.toggleSelectCameraBox();
    };

    this.DCE_ELEMENTS.uploadImageBtn.onclick = () => {
      this.uploadImage();
    };

    this.DCE_ELEMENTS.soundFeedbackBtn.onclick = () => this.toggleSoundFeedback();
  }

  async handleCloseBtn() {
    this.isCapturing = false;
    this.closeCamera({ hideContainer: true });

    if (this.currentScanResolver) {
      this.currentScanResolver({
        status: {
          code: EnumResultStatus.RS_CANCELLED,
          message: "Cancelled",
        },
      });
    }
  }

  private attachOptionClickListeners() {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];
    if (!DCEContainer?.shadowRoot) return;

    const settingsContainer = DCEContainer.shadowRoot.querySelector(
      ".dce-mn-camera-and-resolution-settings"
    ) as HTMLElement;

    const cameraOptions = DCEContainer.shadowRoot.querySelectorAll(".dce-mn-camera-option");
    const resolutionOptions = DCEContainer.shadowRoot.querySelectorAll(".dce-mn-resolution-option");

    const guideType =
      this.currentScanSide === EnumDriverLicenseScanSide.Front
        ? EnumScanGuideType.FRONT_LICENSE
        : EnumScanGuideType.BACK_LICENSE;

    // Add click handlers to all options
    [...cameraOptions, ...resolutionOptions].forEach((option) => {
      option.addEventListener("click", async () => {
        const deviceId = option.getAttribute("data-davice-id");
        const resHeight = option.getAttribute("data-height");
        const resWidth = option.getAttribute("data-width");
        if (deviceId) {
          this.resources.cameraEnhancer.selectCamera(deviceId).then(() => {
            this.toggleScanGuide(true, guideType);
          });
        } else if (resHeight && resWidth) {
          this.resources.cameraEnhancer
            .setResolution({
              width: parseInt(resWidth),
              height: parseInt(resHeight),
            })
            .then(() => {
              this.toggleScanGuide(true, guideType);
            });
        }

        if (settingsContainer.style.display !== "none") {
          this.toggleSelectCameraBox();
        }
      });
    });
  }

  private highlightCameraAndResolutionOption() {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];
    if (!DCEContainer?.shadowRoot) return;

    const settingsContainer = DCEContainer.shadowRoot.querySelector(
      ".dce-mn-camera-and-resolution-settings"
    ) as HTMLElement;
    const cameraOptions = settingsContainer.querySelectorAll(".dce-mn-camera-option");
    const resOptions = settingsContainer.querySelectorAll(".dce-mn-resolution-option");

    const selectedCamera = this.resources.cameraEnhancer.getSelectedCamera();
    const selectedResolution = this.resources.cameraEnhancer.getResolution();

    cameraOptions.forEach((options) => {
      const o = options as HTMLElement;
      if (o.getAttribute("data-davice-id") === selectedCamera?.deviceId) {
        o.style.border = "2px solid #fe814a";
      } else {
        o.style.border = "none";
      }
    });

    const heightMap: Record<string, string> = {
      "480p": "480",
      "720p": "720",
      "1080p": "1080",
      "2k": "1440",
      "4k": "2160",
    };
    const resolutionLvl = findClosestResolutionLevel(selectedResolution);

    resOptions.forEach((options) => {
      const o = options as HTMLElement;
      const height = o.getAttribute("data-height");

      if (height === heightMap[resolutionLvl]) {
        o.style.border = "2px solid #fe814a";
      } else {
        o.style.border = "none";
      }
    });
  }

  private toggleSelectCameraBox() {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];

    if (!DCEContainer?.shadowRoot) return;

    const settingsBox = DCEContainer.shadowRoot.querySelector(".dce-mn-resolution-box") as HTMLElement;

    // Highlight current camera and resolution
    this.highlightCameraAndResolutionOption();

    // Attach highlighting camera and resolution options on option click
    this.attachOptionClickListeners();

    settingsBox.click();
  }

  private async uploadImage() {
    this.isCapturing = false;

    // Create hidden file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);

    try {
      const { cameraEnhancer, result, onResultUpdated } = this.resources;

      this.showScannerLoadingOverlay("Processing image and reading barcode...");

      // Get file from input
      const file = await new Promise<File>((resolve, reject) => {
        input.onchange = (e: Event) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f?.type.startsWith("image/")) {
            reject(new Error("Please select an image file"));
            return;
          }
          resolve(f);
        };

        input.addEventListener("cancel", () => this.hideScannerLoadingOverlay(false));
        input.click();
      });

      if (!file) {
        this.hideScannerLoadingOverlay(false);
        return;
      }

      this.closeCamera({ hideContainer: false });

      // Convert file to blob
      const { blob } = await this.fileToBlob(file);

      this.capturedResult = await this.resources.cvRouter.capture(blob, this.config.utilizedTemplateNames.detect);

      // Set the image
      this.originalImageData = (this.capturedResult?.items?.[0] as OriginalImageResultItem)?.imageData;

      // Reset captured items if not using bounds detection
      let detectedQuadrilateral: Quadrilateral = null;
      if (this.capturedResult?.items?.length <= 1) {
        const { width, height } = this.originalImageData;
        detectedQuadrilateral = {
          points: [
            { x: 0, y: 0 },
            { x: width, y: 0 },
            { x: width, y: height },
            { x: 0, y: height },
          ],
          area: height * width,
        } as Quadrilateral;
      } else {
        detectedQuadrilateral = this.capturedResult?.processedDocumentResult?.detectedQuadResultItems?.[0]?.location;
      }

      // Add padding to ROI
      detectedQuadrilateral.points = addPaddingToPoints(detectedQuadrilateral.points, this.originalImageData, 15);

      const deskewedImageResult = await this.normalizeImage(detectedQuadrilateral.points, this.originalImageData);

      // Process barcode data after image capture
      await this.processAndUpdateBarcodeData(deskewedImageResult.imageData);

      const scanResult: DriverLicenseImageResult = {
        status: {
          code: EnumResultStatus.RS_SUCCESS,
          message: "Success",
        },
        originalImageResult: this.originalImageData,
        deskewedImageResult,
        detectedQuadrilateral,
        _flowType: EnumFlowType.UPLOADED_IMAGE,

        imageData: true,
        _imageData: deskewedImageResult,
      };

      // Emit result through shared resources
      onResultUpdated?.({
        ...result,
        [this.currentScanSide]: scanResult,
      });

      // Resolve scan promise
      this.currentScanResolver(scanResult);
    } catch (ex: any) {
      let errMsg = ex?.message || ex;
      console.error(errMsg);
      alert(errMsg);
      this.closeCamera();

      const result = {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: "Error processing uploaded image",
        },
      };
      this.currentScanResolver(result);
    } finally {
      // Always clean up and hide loading screen
      document.body.removeChild(input);
      this.hideScannerLoadingOverlay(true);
    }
  }

  private async fileToBlob(file: File): Promise<{ blob: Blob; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, width: img.width, height: img.height });
          } else {
            reject(new Error("Failed to create blob"));
          }
        }, file.type);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async toggleAutoCaptureAnimation(enabled?: boolean) {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];

    if (!DCEContainer?.shadowRoot) return;

    const loadingAnimation = DCEContainer.shadowRoot.querySelector(
      ".dce-loading-auto-capture-animation"
    ) as HTMLElement;

    loadingAnimation.style.borderLeftColor = enabled ? "transparent" : "#fe8e14";
    loadingAnimation.style.borderBottomColor = enabled ? "transparent" : "#fe8e14";
  }

  async toggleBoundsDetection(enabled?: boolean) {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];

    if (!DCEContainer?.shadowRoot) return;

    const container = DCEContainer.shadowRoot.querySelector(".dce-mn-bounds-detection") as HTMLElement;
    const onIcon = DCEContainer.shadowRoot.querySelector(".dce-mn-bounds-detection-on") as HTMLElement;
    const offIcon = DCEContainer.shadowRoot.querySelector(".dce-mn-bounds-detection-off") as HTMLElement;

    if (!onIcon || !offIcon) return;

    this.toggleAutoCaptureAnimation(false);
    const newBoundsDetectionState = enabled !== undefined ? enabled : !this.boundsDetectionEnabled;

    // If we're turning off bounds detection, ensure smart capture is turned off
    if (!newBoundsDetectionState) {
      await this.toggleSmartCapture(false);
    }

    const { cvRouter } = this.resources;

    this.boundsDetectionEnabled = newBoundsDetectionState;
    container.style.color = this.boundsDetectionEnabled ? "#fe814a" : "#fff";
    offIcon.style.display = this.boundsDetectionEnabled ? "none" : "block";
    onIcon.style.display = this.boundsDetectionEnabled ? "block" : "none";

    if (this.initialized && this.boundsDetectionEnabled) {
      await cvRouter.startCapturing(this.config.utilizedTemplateNames.detect);
    } else if (this.initialized && !this.boundsDetectionEnabled) {
      this.stopCapturing();
    }
  }

  async toggleSmartCapture(mode?: boolean) {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];

    if (!DCEContainer?.shadowRoot) return;

    const container = DCEContainer.shadowRoot.querySelector(".dce-mn-smart-capture") as HTMLElement;
    const onIcon = DCEContainer.shadowRoot.querySelector(".dce-mn-smart-capture-on") as HTMLElement;
    const offIcon = DCEContainer.shadowRoot.querySelector(".dce-mn-smart-capture-off") as HTMLElement;

    if (!onIcon || !offIcon) return;

    const newSmartCaptureState = mode !== undefined ? mode : !this.smartCaptureEnabled;
    this.toggleAutoCaptureAnimation(newSmartCaptureState);

    // If trying to turn on auto capture, ensure bounds detection is on
    // If turning off auto capture, ensure auto crop is off
    if (newSmartCaptureState && !this.boundsDetectionEnabled) {
      await this.toggleBoundsDetection(true);
    } else if (!newSmartCaptureState && this.config._showCorrectionView !== false) {
      // Handle correctionView
      await this.toggleAutoCrop(false);
    }

    this.smartCaptureEnabled = newSmartCaptureState;
    container.style.color = this.smartCaptureEnabled ? "#fe814a" : "#fff";
    offIcon.style.display = this.smartCaptureEnabled ? "none" : "block";
    onIcon.style.display = this.smartCaptureEnabled ? "block" : "none";

    this.licenseVerificationCount = 0;
  }

  async toggleAutoCrop(mode?: boolean) {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];

    if (!DCEContainer?.shadowRoot) return;

    const container = DCEContainer.shadowRoot.querySelector(".dce-mn-auto-crop") as HTMLElement;
    const onIcon = DCEContainer.shadowRoot.querySelector(".dce-mn-auto-crop-on") as HTMLElement;
    const offIcon = DCEContainer.shadowRoot.querySelector(".dce-mn-auto-crop-off") as HTMLElement;

    if (!onIcon || !offIcon) return;

    const newSmartCaptureState = mode !== undefined ? mode : !this.autoCropEnabled;

    // If trying to turn on auto capture, ensure bounds detection is on
    if (newSmartCaptureState && (!this.boundsDetectionEnabled || !this.smartCaptureEnabled)) {
      // Turn on bouds detection first
      await this.toggleBoundsDetection(true);
      await this.toggleSmartCapture(true);
    }

    // If turning off auto crop and _showCorrectionView is false, also turn off smartCapture
    if (!newSmartCaptureState && this.config._showCorrectionView === false) {
      await this.toggleSmartCapture(false);
    }

    this.autoCropEnabled = newSmartCaptureState;
    container.style.color = this.autoCropEnabled ? "#fe814a" : "#fff";
    offIcon.style.display = this.autoCropEnabled ? "none" : "block";
    onIcon.style.display = this.autoCropEnabled ? "block" : "none";
  }

  private toggleScanGuide(enabled: boolean, guideType: EnumScanGuideType) {
    const configContainer = getElement(this.config.container);
    const DCEContainer = configContainer.children[configContainer.children.length - 1];
    if (!DCEContainer?.shadowRoot) return;

    Object.entries(this.DCE_SCANGUIDE_ELEMENTS).forEach(([type, element]) => {
      if (guideType === EnumScanGuideType.NONE || enabled === false || this.config.showScanGuide === false) {
        element && (element.style.display = "none");
      } else {
        element && (element.style.display = type === guideType ? "block" : "none");
      }
    });

    this.currentGuideType = guideType;

    this.calculateScanRegion();
  }

  private toggleScanHintMessage(enable: boolean = true, message: string = "") {
    if (this.config.showScanHint === false) {
      this.DCE_ELEMENTS.hintTopMessage.style.display = "none";
      return;
    }

    this.DCE_ELEMENTS.hintTopMessage.style.display = enable ? "block" : "none";
    this.DCE_ELEMENTS.hintTopMessage.innerText = message;
  }

  private calculateScanRegion() {
    const { cameraEnhancer, cameraView } = this.resources;

    if (!cameraEnhancer || !cameraEnhancer.isOpen()) return;

    let region: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      isMeasuredInPercentage: boolean;
    };

    region = {
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      isMeasuredInPercentage: true,
    };

    cameraView?.setScanRegionMaskVisible(true);
    cameraEnhancer.setScanRegion(region);

    return;
  }

  async openCamera(): Promise<void> {
    try {
      const { cameraEnhancer, cameraView } = this.resources;

      const configContainer = getElement(this.config.container);
      configContainer.style.display = "block";

      if (!cameraEnhancer.isOpen()) {
        const currentCameraView = cameraView.getUIElement();
        if (!currentCameraView.parentElement) {
          configContainer.append(currentCameraView);
        }

        await cameraEnhancer.open();
      } else if (cameraEnhancer.isPaused()) {
        await cameraEnhancer.resume();
      }

      // Try to set default as 2k
      await cameraEnhancer.setResolution({
        width: 2560,
        height: 1440,
      });

      // Assign boundsDetection, smartCapture, and takePhoto element
      if (!this.initializedDCE && cameraEnhancer.isOpen()) {
        await this.initializeElements();

        const dbrDrawingLayer = cameraView.getDrawingLayer(2);
        dbrDrawingLayer.setVisible(false);
      }

      // Add resize
      window.addEventListener("resize", this.handleResize);

      // Show hint message
      this.toggleScanHintMessage(true, this.getText().hintStart);

      // Turn on torch auto by default
      const DCEContainer = configContainer.children[configContainer.children.length - 1];
      if (!DCEContainer?.shadowRoot) {
        throw new Error("Shadow root not found");
      }
      (DCEContainer.shadowRoot.querySelector(".dce-mn-torch-off") as HTMLElement).style.display = "none";
      (DCEContainer.shadowRoot.querySelector(".dce-mn-torch-on") as HTMLElement).style.display = "none";
    } catch (ex: any) {
      this.closeCamera();
      throw ex;
    }
  }

  closeCamera(options: { hideContainer?: boolean; keepLoadingScreen?: boolean } = {}) {
    const { hideContainer = true, keepLoadingScreen = false } = options;

    try {
      // Remove resize event listener
      window.removeEventListener("resize", this.handleResize);
      // Clear any existing resize timer
      if (this.resizeTimer) {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
      }

      const { cameraEnhancer, cameraView } = this.resources;

      const configContainer = getElement(this.config.container);

      // Only hide container if not keeping loading screen
      if (!keepLoadingScreen) {
        configContainer.style.display = hideContainer ? "none" : "block";
      }

      if (cameraView?.getUIElement().parentElement) {
        configContainer.removeChild(cameraView.getUIElement());
      }

      cameraEnhancer.close();
      this.stopCapturing();
    } catch (ex: any) {
      let errMsg = ex?.message || ex;
      console.error(`Close Camera error: ${errMsg}`);
    }
  }

  pauseCamera() {
    const { cameraEnhancer } = this.resources;
    cameraEnhancer.pause();
  }

  stopCapturing() {
    const { cameraView, cvRouter } = this.resources;

    cvRouter.stopCapturing();
    cameraView.clearAllInnerDrawingItems();
  }

  private getFlowType(): EnumFlowType {
    // Find flow type
    return this.autoCropEnabled
      ? EnumFlowType.AUTO_CROP
      : this.smartCaptureEnabled
        ? EnumFlowType.SMART_CAPTURE
        : EnumFlowType.MANUAL;
  }

  async takePhoto() {
    if (this.isCapturing) {
      return;
    }
    this.isCapturing = true;

    try {
      // Show loading screen
      this.showScannerLoadingOverlay("Processing image and reading barcode...");

      const { captureFrontImage, captureBackImage, readBarcode } = this.config._workflowConfig;
      const isBarcodeOnlyWorkflow = !captureFrontImage && !captureBackImage && readBarcode;

      const { cameraEnhancer, result, onResultUpdated } = this.resources;
      let scanResult: DriverLicenseImageResult | DriverLicenseFullResult["licenseData"] = { status: null };

      if (!isBarcodeOnlyWorkflow) {
        // Set the original image based on bounds detection and captured results
        const shouldUseLatestFrame =
          !this.boundsDetectionEnabled ||
          (this.boundsDetectionEnabled && (!this.capturedResult?.items || this.capturedResult.items.length <= 1));
        this.originalImageData = shouldUseLatestFrame ? cameraEnhancer.fetchImage() : this.originalImageData;

        // Reset captured items if not using bounds detection
        let deskewedImageResult = null;
        let detectedQuadrilateral: Quadrilateral = null;

        if (shouldUseLatestFrame) {
          const { width, height } = this.originalImageData;
          detectedQuadrilateral = {
            points: [
              { x: 0, y: 0 },
              { x: width, y: 0 },
              { x: width, y: height },
              { x: 0, y: height },
            ],
            area: height * width,
          } as Quadrilateral;
        } else {
          detectedQuadrilateral = this.capturedResult?.processedDocumentResult?.detectedQuadResultItems?.[0]?.location;

          if (!this.resources.cameraEnhancer.isOpen) {
            await this.openCamera();
          }

          detectedQuadrilateral.points = detectedQuadrilateral.points.map((p) =>
            this.resources.cameraEnhancer.convertToScanRegionCoordinates(p)
          ) as Quadrilateral["points"];

          detectedQuadrilateral.points = addPaddingToPoints(detectedQuadrilateral.points, this.originalImageData, 15);
        }

        const flowType = this.getFlowType();

        // turn off smart capture (and also auto crop) before closing camera
        await this.toggleSmartCapture(false);

        // Close camera but keep the container visible for loading screen
        this.closeCamera({ hideContainer: false, keepLoadingScreen: true });

        // Retrieve corrected image result
        deskewedImageResult = await this.normalizeImage(
          detectedQuadrilateral.points,
          this.originalImageData as DSImageData
        );

        // Process barcode data after image capture and capture the result
        const licenseData = await this.processAndUpdateBarcodeData(deskewedImageResult.imageData);

        scanResult = {
          status: {
            code: EnumResultStatus.RS_SUCCESS,
            message: "Success",
          },
          originalImageResult: this.originalImageData,
          deskewedImageResult,
          detectedQuadrilateral,
          _flowType: flowType,

          imageData: true,
          _imageData: deskewedImageResult,
        };

        // Emit result through shared resources, including license data if available
        onResultUpdated?.({
          ...result,
          [this.currentScanSide]: scanResult,
          ...(licenseData && { licenseData }),
        });


      } else {
        const parsedResult = this.capturedResult?.parsedResult?.parsedResultItems?.[0] ?? null;
        const processedData = processDriverLicenseData(parsedResult);

        if (processedData) {
          scanResult = {
            ...processedData,
            status: {
              code: EnumResultStatus.RS_SUCCESS,
              message: `Barcode successfully processed from ${this.currentScanSide} side`,
            },
          };

          onResultUpdated?.({
            ...result,
            licenseData: scanResult,
          });
        } else {
          scanResult = {
            ...processedData,
            status: {
              code: EnumResultStatus.RS_FAILED,
              message: `Barcode Not Found!`,
            },
          };

          onResultUpdated?.({
            ...result,
            licenseData: scanResult,
          });
        }
      }

      // Hide loading screen and container after everything is done
      this.hideScannerLoadingOverlay(true);

      // Resolve scan promise
      this.currentScanResolver(scanResult);
    } catch (ex: any) {
      let errMsg = ex?.message || ex;
      console.error(errMsg);
      alert(errMsg);

      // Hide loading screen first, then close camera
      this.hideScannerLoadingOverlay(false);
      this.closeCamera({ hideContainer: true });

      const result = {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: "Error capturing image",
        },
      };
      this.currentScanResolver(result);
    } finally {
      this.isCapturing = false;
    }
  }

  async handleBarcodeDetection(result: CapturedResult) {
    if (!result.items?.length) return;

    this.capturedResult = result;
    const originalImage = result.items.filter(
      (item) => item.type === EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE
    ) as (CapturedResultItem & { imageData?: OriginalImageResultItem["imageData"] })[];
    this.originalImageData = originalImage.length && originalImage[0]?.imageData;

    const parsedResult = result?.parsedResult?.parsedResultItems?.[0] ?? null;

    if (parsedResult) {
      await this.takePhoto();
    }
  }

  async handleBoundsDetection(result: CapturedResult) {
    if (!result.items?.length) return;

    this.capturedResult = result;
    const originalImage = result.items.filter(
      (item) => item.type === EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE
    ) as (CapturedResultItem & { imageData?: OriginalImageResultItem["imageData"] })[];
    this.originalImageData = originalImage.length && originalImage[0]?.imageData;

    if (this.smartCaptureEnabled || this.autoCropEnabled) {
      this.handleAutoCaptureMode(result);
    }
  }

  /**
   * Normalize an image with DDN given a set of points
   * @param points - points provided by either users or DDN's detect quad
   * @returns normalized image by DDN
   */
  private async handleAutoCaptureMode(result: CapturedResult) {
    const startingLicenseGuide =
      this.currentScanSide === EnumDriverLicenseScanSide.Front
        ? EnumScanGuideType.FRONT_LICENSE
        : EnumScanGuideType.BACK_LICENSE;

    // Early return if no valid detection
    if (result.items.length <= 1) {
      this.showStartingState(startingLicenseGuide);
      return;
    }

    // Extract detection data
    const detectedQuadResult = result?.processedDocumentResult?.detectedQuadResultItems?.[0];
    const barcodeResult = result?.decodedBarcodesResult?.barcodeResultItems?.[0] ?? null;
    const visibleRegionArea = this.calculateVisibleRegionArea(result);
    const quadToRegionRatio = detectedQuadResult.location.area / visibleRegionArea;
    const licenseValidation = isWithinLicenseRatio(detectedQuadResult?.location?.points ?? null);

    // Validation conditions
    const conditions = {
      hasValidLicenseRatio: licenseValidation.isValid,
      hasGoodSize: quadToRegionRatio >= this.MIN_QUAD_TO_REGION_RATIO,
      isVerticalOrientation: licenseValidation.orientation === "vertical",
      isReadyForCapture: this.licenseVerificationCount === 1,
      barcodeRecognized:
        this.config._workflowConfig?.readBarcode && this.currentScanSide === EnumDriverLicenseScanSide.Back
          ? !!barcodeResult
          : true,
    };

    if (conditions.hasValidLicenseRatio && conditions.hasGoodSize && conditions.isReadyForCapture) {
      const threshold = calculateBlurThreshold({
        width: this.resources.cameraEnhancer.getResolution().width,
        height: this.resources.cameraEnhancer.getResolution().height,
      });
      const blurScore = measureBlur({
        ...this.originalImageData,
        data: this.originalImageData.bytes,
      }).avg_edge_width_perc.toFixed(2);
      if (Number(blurScore) >= threshold) {
        this.handleBlurryLicense();
        return;
      }

      if (this.isSoundFeedbackOn) {
        Feedback.beep();
      }

      if (!this.isCapturing) {
        await this.takePhoto();
      }
      return;
    }

    if (!conditions.hasValidLicenseRatio) {
      this.handleInvalidLicenseRatio(startingLicenseGuide, conditions.isVerticalOrientation);
      return;
    }
    if (!conditions.hasGoodSize) {
      this.handleTooSmallQuad();
      return;
    }

    // Valid license and good size, but not ready for capture yet
    this.handleProgressState(startingLicenseGuide);
  }

  private showStartingState(guideType: EnumScanGuideType) {
    this.toggleScanGuide(true, guideType);
    this.toggleScanHintMessage(true, this.getText().hintStart);
    this.resources.cameraView.clearAllInnerDrawingItems();
  }

  private handleBlurryLicense() {
    const hintMessage = this.getText().hintBlurry;
    this.toggleScanHintMessage(true, hintMessage);
  }

  private handleInvalidLicenseRatio(startingLicenseGuide: EnumScanGuideType, isVertical: boolean) {
    this.toggleScanGuide(true, isVertical ? EnumScanGuideType.CHANGE_ORIENTATION : startingLicenseGuide);
    this.resources.cameraView.clearAllInnerDrawingItems();

    const hintMessage = isVertical ? this.getText().hintRotateHorizontal : this.getText().hintStart;

    this.toggleScanHintMessage(true, hintMessage);
  }

  private handleTooSmallQuad() {
    this.toggleScanGuide(true, EnumScanGuideType.MOVE_CLOSER);
    this.resources.cameraView.clearAllInnerDrawingItems();
    this.toggleScanHintMessage(true, this.getText().hintMoveCloser);
  }

  private handleProgressState(startingLicenseGuide: EnumScanGuideType) {
    this.toggleScanGuide(true, startingLicenseGuide);
    this.toggleScanHintMessage(true, this.getText().hintInProgress);
    this.licenseVerificationCount++;
  }

  private calculateVisibleRegionArea(result: CapturedResult): number {
    const frameTag = result?.originalImageTag as VideoFrameTag;
    return frameTag?.currentHeight * frameTag?.currentWidth;
  }

  private readonly MIN_QUAD_TO_REGION_RATIO = 0.2;

  async launch(
    side: EnumDriverLicenseScanSide = EnumDriverLicenseScanSide.Front,
    mode: EnumDriverLicenseScanMode = EnumDriverLicenseScanMode.Image
  ): Promise<DriverLicenseImageResult> {
    try {
      this.isCapturing = false;

      this.currentScanSide = side;
      this.currentGuideType =
        side === EnumDriverLicenseScanSide.Front ? EnumScanGuideType.FRONT_LICENSE : EnumScanGuideType.BACK_LICENSE;
      this.currentScanMode = mode;

      await this.initialize();

      const { cvRouter, cameraEnhancer } = this.resources;

      return new Promise(async (resolve) => {
        this.currentScanResolver = resolve;

        try {
          this.showScannerLoadingOverlay(this.getText().openingCamera);

          // Start capturing
          await this.openCamera();

          //Show scan guide
          const guideType =
            this.currentScanSide === EnumDriverLicenseScanSide.Front
              ? EnumScanGuideType.FRONT_LICENSE
              : EnumScanGuideType.BACK_LICENSE;
          this.toggleScanGuide(true, guideType);

          this.hideScannerLoadingOverlay();

          if (this.boundsDetectionEnabled) {
            const template =
              this.currentScanMode === EnumDriverLicenseScanMode.Image
                ? this.config.utilizedTemplateNames.detect
                : this.config.utilizedTemplateNames.barcode;
            await cvRouter.startCapturing(template);
          }

          // By default, cameraEnhancer captures grayscale images to optimize performance.
          // To capture RGB Images, we set the Pixel Format to EnumImagePixelFormat.IPF_ABGR_8888
          cameraEnhancer.setPixelFormat(EnumImagePixelFormat.IPF_ABGR_8888);
        } catch (cameraError: any) {
          // Handle camera-specific errors here
          this.isCapturing = false;
          this.hideScannerLoadingOverlay(true);

          let errMsg = cameraError?.message || cameraError;

          // Determine if it's a camera access error
          const isCameraAccessError =
            errMsg.toLowerCase().includes("camera") ||
            errMsg.toLowerCase().includes("permission") ||
            errMsg.toLowerCase().includes("notallowed") ||
            errMsg.toLowerCase().includes("device");

          const errorMessage = isCameraAccessError
            ? "Camera access denied or unavailable. Please check camera permissions and try again."
            : `Driver License Scanner Open Camera Error: ${errMsg}`;

          console.error("Camera error:", errMsg);
          alert(errorMessage);

          const result = {
            status: {
              code: EnumResultStatus.RS_FAILED,
              message: errorMessage,
            },
          };

          resolve(result);
        }
      });
    } catch (ex: any) {
      // Handle other initialization errors
      this.isCapturing = false;

      let errMsg = ex?.message || ex;
      console.error("Driver License Scanner Launch error: ", errMsg);
      this.closeCamera();

      const result = {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: `Driver License Scanner Launch error: ${errMsg}`,
        },
      };

      return result;
    }
  }

  async normalizeImage(
    points: Quadrilateral["points"],
    originalImageData: OriginalImageResultItem["imageData"]
  ): Promise<DeskewedImageResultItem> {
    const { cvRouter } = this.resources;

    const settings = await cvRouter.getSimplifiedSettings(this.config.utilizedTemplateNames.normalize);
    settings.roiMeasuredInPercentage = false;
    settings.roi.points = points;

    await cvRouter.updateSettings(this.config.utilizedTemplateNames.normalize, settings);

    const result = await cvRouter.capture(originalImageData, this.config.utilizedTemplateNames.normalize);
    // If normalized result found
    if (result?.processedDocumentResult.deskewedImageResultItems?.[0]) {
      return result.processedDocumentResult.deskewedImageResultItems[0];
    }
  }
}
