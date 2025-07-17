import {
  LicenseManager,
  CoreModule,
  EngineResourcePaths,
  CaptureVisionRouter,
  CameraEnhancer,
  CameraView,
  CodeParserModule,
  EnumEnhancedFeatures,
} from "dynamsoft-capture-vision-bundle";
import DriverLicenseCorrectionView, { DriverLicenseCorrectionViewConfig } from "./views/DriverLicenseCorrectionView";
import DriverLicenseScannerView, { DriverLicenseScannerViewConfig } from "./views/DriverLicenseScannerView";
import DriverLicenseResultView, { DriverLicenseResultViewConfig } from "./views/DriverLicenseResultView";
import {
  DriverLicenseScanStep,
  DriverLicenseWorkflowConfig,
  EnumResultStatus,
  UtilizedTemplateNames,
} from "./utils/types";
import {
  createStyle,
  getElement,
  isEmptyObject,
  shouldCorrectImage
} from "./utils";
import {
  DEFAULT_TEMPLATE_NAMES,
  DriverLicenseData,
  DriverLicenseFullResult,
  DriverLicenseImageResult,
  EnumDriverLicenseScanMode,
  EnumDriverLicenseScanSide,
  EnumDriverLicenseScannerViews,
} from "./utils/DriverLicenseParser";
import { DEFAULT_LOADING_SCREEN_STYLE, showLoadingScreen } from "./utils/LoadingScreen";
import DriverLicenseVerifyView, { DriverLicenseVerifyViewConfig } from "./views/DriverLicenseVerifyView";

// Default DCE UI path
const DEFAULT_DCE_UI_PATH = "../dist/ddls.ui.html"; // TODO
// "https://cdn.jsdelivr.net/npm/dynamsoft-ddls@1.1.0/dist/ddls.ui.html";
const DEFAULT_DDLS_TEMPLATE_PATH: string = "../dist/ddls.template.json"; // TODO
const DEFAULT_DCV_ENGINE_RESOURCE_PATHS: EngineResourcePaths = {
  rootDirectory: "https://cdn.jsdelivr.net/npm/",
};
const DEFAULT_CONTAINER_HEIGHT = "100dvh";

export interface DriverLicenseScannerConfig {
  license?: string;
  container?: HTMLElement | string;

  workflowConfig?: DriverLicenseWorkflowConfig;

  // DCV specific configs
  templateFilePath?: string;
  utilizedTemplateNames?: UtilizedTemplateNames;
  engineResourcePaths?: EngineResourcePaths;

  // Views Config
  scannerViewConfig?: Omit<
    DriverLicenseScannerViewConfig,
    "templateFilePath" | "utilizedTemplateNames" | "_showCorrectionView"
  >;
  verifyViewConfig?: DriverLicenseVerifyViewConfig;
  resultViewConfig?: DriverLicenseResultViewConfig;
  correctionViewConfig?: Omit<
    DriverLicenseCorrectionViewConfig,
    "templateFilePath" | "utilizedTemplateNames" | "_showCorrectionView"
  >;

  showVerifyView?: boolean;
  showResultView?: boolean;
  showCorrectionView?: boolean;
}

export interface SharedResources {
  cvRouter?: CaptureVisionRouter;
  cameraEnhancer?: CameraEnhancer;
  cameraView?: CameraView;
  result?: DriverLicenseFullResult;
  onResultUpdated?: (result: DriverLicenseFullResult) => void;
}

class DriverLicenseScanner {
  private scannerView?: DriverLicenseScannerView;
  private scanVerifyView?: DriverLicenseVerifyView;
  private scanResultView?: DriverLicenseResultView;
  private correctionView?: DriverLicenseCorrectionView;

  private fullResult?: DriverLicenseFullResult = {
    [EnumDriverLicenseScanSide.Front]: null,
    [EnumDriverLicenseScanSide.Back]: null,
  };

  private resources: Partial<SharedResources> = {};
  private isInitialized = false;
  private isCapturing = false;
  private isDynamsoftResourcesLoaded = false;

  protected isFileMode: boolean = false;

  private currentScanStep = 0;
  private scanSequence: DriverLicenseScanStep[] = [];

  private loadingScreen: ReturnType<typeof showLoadingScreen> | null = null;

  private showLoadingOverlay(message?: string): void {
    const configContainer = this.getConfigContainer();
    if (!configContainer) return;

    this.loadingScreen = showLoadingScreen(configContainer, { message });
    Object.assign(configContainer.style, {
      display: "block",
      position: "relative"
    });
  }

  private hideLoadingOverlay(hideContainer: boolean = false): void {
    const configContainer = this.getConfigContainer();
    if (!configContainer) return;

    if (this.loadingScreen) {
      this.loadingScreen.hide();
      this.loadingScreen = null;
      configContainer.style.display = "none";

      if (hideContainer && this.config?.container) {
        const mainContainer = getElement(this.config.container);
        if (mainContainer) {
          mainContainer.style.display = "none";
        }
      }
    }
  }

  private getConfigContainer(): HTMLElement | null {
    return (
      getElement(this.config.scannerViewConfig?.container) ||
      getElement(this.config.verifyViewConfig?.container) ||
      getElement(this.config.resultViewConfig?.container)
    );
  }

  constructor(private config: DriverLicenseScannerConfig) {
    if (!this.isDynamsoftResourcesLoaded) {
      this.initializeDDLSConfig();
      this.initializeDynamsoftResources();
    }
  }

  private initializeDynamsoftResources(): void {
    if (this.isDynamsoftResourcesLoaded) return;

    // Set up engine resource paths
    CoreModule.engineResourcePaths = isEmptyObject(this.config?.engineResourcePaths)
      ? DEFAULT_DCV_ENGINE_RESOURCE_PATHS
      : this.config.engineResourcePaths!;

    // Preload WASM resources to reduce latency
    CoreModule.loadWasm();

    // Load barcode parsing specs if barcode reading is enabled
    if (this.config.workflowConfig?.readBarcode) {
      this.loadBarcodeSpecs();
    }

    this.isDynamsoftResourcesLoaded = true;
  }

  private loadBarcodeSpecs(): void {
    const specs = ["AAMVA_DL_ID", "AAMVA_DL_ID_WITH_MAG_STRIPE", "SOUTH_AFRICA_DL"];
    specs.forEach(spec => {
      try {
        CodeParserModule.loadSpec(spec);
      } catch (error) {
        console.warn(`Failed to load barcode spec ${spec}:`, error);
      }
    });
  }

  private async initializeDCVResources(): Promise<void> {
    try {
      if (!this.isDynamsoftResourcesLoaded) {
        this.initializeDynamsoftResources();
      }

      // Enhance license manager error messaging
      this.setupLicenseManager();

      // Initialize license
      LicenseManager.initLicense(this.config?.license || "", {
        executeNow: true,
      });

      // Initialize camera resources only if not in file mode
      if (!this.isFileMode) {
        await this.initializeCameraResources();
      }

      // Initialize capture vision router
      await this.initializeCaptureVisionRouter();

    } catch (ex: any) {
      const errMsg = ex?.message || ex;
      const error = this.formatLicenseError(errMsg);
      console.error(error);
      throw new Error(error);
    }
  }

  private setupLicenseManager(): void {
    // Enhance license error messages with product-specific links
    (LicenseManager as any)._onAuthMessage = (message: string) =>
      message.replace(
        "(https://www.dynamsoft.com/customer/license/trialLicense?product=unknown&deploymenttype=unknown)",
        "(https://www.dynamsoft.com/customer/license/trialLicense?product=ddls&deploymenttype=web)"
      );
  }

  private async initializeCameraResources(): Promise<void> {
    this.resources.cameraView = await CameraView.createInstance(this.config.scannerViewConfig?.uiPath);
    this.resources.cameraEnhancer = await CameraEnhancer.createInstance(this.resources.cameraView);
    await this.resources.cameraEnhancer.enableEnhancedFeatures(EnumEnhancedFeatures.EF_TAP_TO_FOCUS);
  }

  private async initializeCaptureVisionRouter(): Promise<void> {
    this.resources.cvRouter = await CaptureVisionRouter.createInstance();

    // Initialize template parameters for driver license scanning
    if (this.config.templateFilePath) {
      await this.resources.cvRouter.initSettings(this.config.templateFilePath);
    }

    // Set unlimited image size for better processing
    this.resources.cvRouter.maxImageSideLength = Infinity;
  }

  private formatLicenseError(errMsg: string): string {
    return errMsg?.toLowerCase().includes("license")
      ? `The license for the Driver License Scanner is no longer valid or has expired. Please contact the site administrator to resolve this issue.`
      : `Resource Initialization Failed: ${errMsg}`;
  }

  async initialize(): Promise<{
    resources: SharedResources;
    components: {
      scannerView?: DriverLicenseScannerView;
      correctionView?: DriverLicenseCorrectionView;
      scanVerifyView?: DriverLicenseVerifyView;
      scanResultView?: DriverLicenseResultView;
    };
  }> {
    if (this.isInitialized) {
      return {
        resources: this.resources as SharedResources,
        components: {
          scannerView: this.scannerView,
          correctionView: this.correctionView,
          scanVerifyView: this.scanVerifyView,
          scanResultView: this.scanResultView,
        },
      };
    }

    try {
      const driverLicenseScannerConfigSuccess = this.initializeDDLSConfig();
      if (!driverLicenseScannerConfigSuccess) {
        console.error("Failed to initialize driver license scanner config");
        return { resources: this.resources, components: {} };
      }

      // Create loading screen style
      createStyle("dynamsoft-ddls-loading-screen-style", DEFAULT_LOADING_SCREEN_STYLE);
      this.showLoadingOverlay("Loading...");

      await this.initializeDCVResources();

      this.resources.onResultUpdated = (result) => {
        this.resources.result = { ...(this.resources?.result || {}), ...result };

        // Also update the main fullResult with any license data from the shared resources
        if (result.licenseData && this.fullResult) {
          this.fullResult.licenseData = result.licenseData;
        }

        // Update image results if provided
        if (result[EnumDriverLicenseScanSide.Front] && this.fullResult) {
          this.fullResult[EnumDriverLicenseScanSide.Front] = result[EnumDriverLicenseScanSide.Front];
        }
        if (result[EnumDriverLicenseScanSide.Back] && this.fullResult) {
          this.fullResult[EnumDriverLicenseScanSide.Back] = result[EnumDriverLicenseScanSide.Back];
        }
      }; const components: {
        scannerView?: DriverLicenseScannerView;
        correctionView?: DriverLicenseCorrectionView;
        scanVerifyView?: DriverLicenseVerifyView;
        scanResultView?: DriverLicenseResultView;
      } = {};

      // Only initialize components that are configured
      if (this.config.scannerViewConfig) {
        this.scannerView = new DriverLicenseScannerView(this.resources, this.config.scannerViewConfig);
        components.scannerView = this.scannerView;
        await this.scannerView.initialize();
      }

      if (this.config.correctionViewConfig) {
        this.correctionView = new DriverLicenseCorrectionView(this.resources, this.config.correctionViewConfig);
        components.correctionView = this.correctionView;
      }

      if (this.config.verifyViewConfig) {
        this.scanVerifyView = new DriverLicenseVerifyView(
          this.resources,
          this.config.verifyViewConfig,
          this.scannerView,
          this.correctionView
        );
        components.scanVerifyView = this.scanVerifyView;
      }

      if (this.config.resultViewConfig) {
        this.scanResultView = new DriverLicenseResultView(
          this.resources,
          this.config.resultViewConfig,
          this.scannerView,
          this.correctionView
        );
        components.scanResultView = this.scanResultView;
      }

      this.isInitialized = true;

      return { resources: this.resources, components };
    } catch (ex: any) {
      this.isInitialized = false;

      let errMsg = ex?.message || ex;
      throw new Error(`Initialization Failed: ${errMsg}`);
    } finally {
      this.hideLoadingOverlay(true);
    }
  }

  private shouldCreateDefaultContainer(): boolean {
    const hasNoMainContainer = !this.config.container;
    const hasNoViewContainers = !(
      this.config.scannerViewConfig?.container ||
      this.config.resultViewConfig?.container ||
      this.config.correctionViewConfig?.container
    );
    return hasNoMainContainer && hasNoViewContainers;
  }

  private createDefaultDDLSContainer(): HTMLElement {
    const container = document.createElement("div");
    container.className = "ddls-main-container";
    Object.assign(container.style, {
      display: "none",
      height: DEFAULT_CONTAINER_HEIGHT,
      width: "100%",
      /* Adding the following CSS rules to make sure the "default" container appears on top and over other elements. */
      position: "absolute",
      left: "0",
      top: "0",
      zIndex: "999",
    });
    document.body.append(container);
    return container;
  }

  private checkForTemporaryLicense(license?: string) {
    return !license?.length ||
      license?.startsWith("A") ||
      license?.startsWith("L") ||
      license?.startsWith("P") ||
      license?.startsWith("Y")
      ? "DLS2eyJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSJ9"
      : license;
  }

  private validateViewConfigs(): boolean {
    // Case 1: Using separate containers (no main container)
    if (!this.config.container) {
      // TODO DL solution not using correction view currently
      if (this.config.showCorrectionView && !this.config.correctionViewConfig?.container) {
        const error =
          "CorrectionView container is required when showCorrectionView is true and no main container is provided";
        alert(error);
        console.error(error);
        return false;
      }

      // Case 1.2: Result view requested but no container provided
      if (this.config.showResultView && !this.config.resultViewConfig?.container) {
        const error = "ResultView container is required when showResultView is true and no main container is provided";
        alert(error);
        console.error(error);
        return false;
      }
    }

    // Case 2: Ensure valid container references where provided
    try {
      if (this.config.container && !getElement(this.config.container)) {
        const error = "Invalid main container reference";
        alert(error);
        console.error(error);
        return false;
      }

      if (this.config.scannerViewConfig?.container && !getElement(this.config.scannerViewConfig?.container)) {
        const error = "Invalid scanner view container reference";
        alert(error);
        console.error(error);
        return false;
      }

      // TODO DL solution not using correction view currently
      if (this.config.correctionViewConfig?.container && !getElement(this.config.correctionViewConfig?.container)) {
        const error = "Invalid correction view container reference";
        alert(error);
        console.error(error);
        return false;
      }

      if (this.config.resultViewConfig?.container && !getElement(this.config.resultViewConfig?.container)) {
        const error = "Invalid result view container reference";
        alert(error);
        console.error(error);
        return false;
      }
    } catch (e) {
      const error = `Error accessing container references: ${e.message}`;
      alert(error);
      console.error(error);
      return false;
    }

    return true;
  }

  private showCorrectionView() {
    if (this.config.showCorrectionView === false) return false;

    // If we have a main container, follow existing logic
    if (this.config.container) {
      if (
        this.config.showCorrectionView === undefined &&
        (this.config.correctionViewConfig?.container || this.config.container)
      ) {
        return true;
      }
      return !!this.config.showCorrectionView;
    }

    // Without main container, require specific container
    return this.config.showCorrectionView && !!this.config.correctionViewConfig?.container;
  }

  private showVerifyView() {
    if (this.config.showVerifyView === false) return false;

    // If we have a main container, follow existing logic
    if (this.config.container) {
      if (
        this.config.showVerifyView === undefined &&
        (this.config.verifyViewConfig?.container || this.config.container)
      ) {
        return true;
      }
      return !!this.config.showVerifyView;
    }

    // Without main container, require specific container
    return this.config.showVerifyView && !!this.config.verifyViewConfig?.container;
  }

  private showResultView() {
    if (this.config.showResultView === false) return false;

    // If we have a main container, follow existing logic
    if (this.config.container) {
      if (
        this.config.showResultView === undefined &&
        (this.config.resultViewConfig?.container || this.config.container)
      ) {
        return true;
      }
      return !!this.config.showResultView;
    }

    // Without main container, require specific container
    return this.config.showResultView && !!this.config.resultViewConfig?.container;
  }

  private validateWorkflowConfig(workflowConfig: DriverLicenseWorkflowConfig): boolean {
    const { captureFrontImage, captureBackImage, readBarcode } = workflowConfig;

    // All false is not a valid config
    if (!captureFrontImage && !captureBackImage && !readBarcode) {
      const error = "Invalid workflow configuration: At least one capture mode must be enabled";
      alert(error);
      console.error(error);
      return false;
    }

    return true;
  }

  // Build scan sequence based on workflow configuration
  private buildScanSequence(): void {
    const { captureFrontImage, captureBackImage, readBarcode, scanOrder, barcodeScanSide } = this.config.workflowConfig!;

    const isBarcodeOnlyWorkflow = !captureFrontImage && !captureBackImage && readBarcode;
    this.scanSequence = [];

    if (isBarcodeOnlyWorkflow) {
      this.scanSequence.push({
        side: barcodeScanSide,
        mode: EnumDriverLicenseScanMode.Barcode,
      });
      return;
    }

    // Build image capture sequence more efficiently
    const orderToFollow = scanOrder || [EnumDriverLicenseScanSide.Front, EnumDriverLicenseScanSide.Back];

    const scanSteps = orderToFollow
      .filter(side => {
        return (side === EnumDriverLicenseScanSide.Front && captureFrontImage) ||
          (side === EnumDriverLicenseScanSide.Back && captureBackImage);
      })
      .map(side => ({
        side,
        mode: EnumDriverLicenseScanMode.Image,
      }));

    this.scanSequence.push(...scanSteps);
  }

  private initializeDDLSConfig() {
    this.config = this.config ?? {};

    // Set default workflow config
    this.config.workflowConfig = {
      captureFrontImage: true,
      captureBackImage: true,
      readBarcode: true,
      barcodeScanSide: EnumDriverLicenseScanSide.Back,
      scanOrder: [EnumDriverLicenseScanSide.Front, EnumDriverLicenseScanSide.Back],
      enableBarcodeVerification: false,
      allowRetryOnVerificationFailure: true,
      ...this.config.workflowConfig,
    };

    const validWorkflowConfig = this.validateWorkflowConfig(this.config.workflowConfig);
    if (!validWorkflowConfig) {
      return false;
    }

    const validViewConfig = this.validateViewConfigs();
    if (!validViewConfig) {
      return false;
    }

    // Build scan sequence based on workflow config
    this.buildScanSequence();

    const { captureFrontImage, captureBackImage, readBarcode, scanOrder, barcodeScanSide } = this.config.workflowConfig;

    const isBarcodeOnlyWorkflow = !captureFrontImage && !captureBackImage && readBarcode;
    if (isBarcodeOnlyWorkflow) {
      this.config.showVerifyView = false;
    }
    // For DDLS, don't show correctionView.
    this.config.showCorrectionView = false;

    if (this.shouldCreateDefaultContainer()) {
      this.config.container = this.createDefaultDDLSContainer();
    } else if (this.config.container) {
      this.config.container = getElement(this.config.container);
    }
    const viewContainers = this.config.container ? this.createViewContainers(getElement(this.config.container)) : {};

    const baseConfig = {
      license: this.checkForTemporaryLicense(this.config.license),
      utilizedTemplateNames: {
        detect: this.config.utilizedTemplateNames?.detect || DEFAULT_TEMPLATE_NAMES.detect,
        normalize: this.config.utilizedTemplateNames?.normalize || DEFAULT_TEMPLATE_NAMES.normalize,
        barcode: this.config.utilizedTemplateNames?.barcode || DEFAULT_TEMPLATE_NAMES.barcode,
      },
      templateFilePath: this.config?.templateFilePath || DEFAULT_DDLS_TEMPLATE_PATH,
    };

    // Views Config
    const scannerViewConfig = {
      ...this.config.scannerViewConfig,
      container:
        viewContainers[EnumDriverLicenseScannerViews.Scanner] || this.config.scannerViewConfig?.container || null,
      uiPath: this.config.scannerViewConfig?.uiPath || DEFAULT_DCE_UI_PATH,
      templateFilePath: baseConfig.templateFilePath,
      utilizedTemplateNames: baseConfig.utilizedTemplateNames,
      _showCorrectionView: this.showCorrectionView(),
      _workflowConfig: this.config.workflowConfig,
    };

    const correctionViewConfig = this.showCorrectionView()
      ? {
        ...this.config.correctionViewConfig,
        container:
          viewContainers[EnumDriverLicenseScannerViews.Correction] ||
          this.config.correctionViewConfig?.container ||
          null,
        templateFilePath: baseConfig.templateFilePath,
        utilizedTemplateNames: baseConfig.utilizedTemplateNames,
        _showResultView: this.showResultView(),
      }
      : undefined;

    const verifyViewConfig = this.showVerifyView()
      ? {
        ...this.config.verifyViewConfig,
        container:
          viewContainers[EnumDriverLicenseScannerViews.Verify] || this.config.verifyViewConfig?.container || null,
        _workflowConfig: this.config.workflowConfig,
      }
      : undefined;

    const resultViewConfig = this.showResultView()
      ? {
        ...this.config.resultViewConfig,
        _workflowConfig: this.config.workflowConfig,
        container:
          viewContainers[EnumDriverLicenseScannerViews.Result] || this.config.resultViewConfig?.container || null,
      }
      : undefined;

    Object.assign(this.config, {
      ...baseConfig,
      scannerViewConfig,
      correctionViewConfig,
      verifyViewConfig,
      resultViewConfig,
    });

    return true;
  }

  private createViewContainers(mainContainer: HTMLElement): Record<string, HTMLElement> {
    mainContainer.textContent = "";

    const views: EnumDriverLicenseScannerViews[] = [EnumDriverLicenseScannerViews.Scanner];

    if (this.showCorrectionView()) views.push(EnumDriverLicenseScannerViews.Correction);
    if (this.showVerifyView()) views.push(EnumDriverLicenseScannerViews.Verify);
    if (this.showResultView()) views.push(EnumDriverLicenseScannerViews.Result);

    return views.reduce((containers, view) => {
      const viewContainer = document.createElement("div");
      viewContainer.className = `ddls-${view}-view-container`;

      Object.assign(viewContainer.style, {
        height: "100%",
        width: "100%",
        display: "none",
        position: "relative",
      });

      mainContainer.append(viewContainer);
      containers[view] = viewContainer;
      return containers;
    }, {} as Record<string, HTMLElement>);
  }

  dispose(): void {
    try {
      // Dispose views in reverse order of initialization
      this.disposeViews();

      // Dispose DCV resources
      this.disposeDCVResources();

      // Clean up containers
      this.cleanupContainers();

      // Reset state
      this.resetState();

    } catch (error) {
      console.warn('Error during disposal:', error);
    }
  }

  private disposeViews(): void {
    const views = [
      { view: this.scanResultView, name: 'scanResultView' },
      { view: this.scanVerifyView, name: 'scanVerifyView' },
      { view: this.correctionView, name: 'correctionView' }
    ];

    views.forEach(({ view, name }) => {
      try {
        if (view?.dispose) {
          view.dispose();
        }
      } catch (error) {
        console.warn(`Error disposing ${name}:`, error);
      }
    });

    this.scanResultView = undefined;
    this.scanVerifyView = undefined;
    this.correctionView = undefined;
    this.scannerView = undefined;
  }

  private disposeDCVResources(): void {
    const resources = [
      { resource: this.resources.cameraEnhancer, name: 'cameraEnhancer' },
      { resource: this.resources.cameraView, name: 'cameraView' },
      { resource: this.resources.cvRouter, name: 'cvRouter' }
    ];

    resources.forEach(({ resource, name }) => {
      try {
        if (resource?.dispose) {
          resource.dispose();
        }
      } catch (error) {
        console.warn(`Error disposing ${name}:`, error);
      }
    });

    this.resources.cameraEnhancer = undefined;
    this.resources.cameraView = undefined;
    this.resources.cvRouter = undefined;
    this.resources.result = undefined;
    this.resources.onResultUpdated = undefined;
  }

  private cleanupContainers(): void {
    const containers = [
      this.config.container,
      this.config.scannerViewConfig?.container,
      this.config.correctionViewConfig?.container,
      this.config.verifyViewConfig?.container,
      this.config.resultViewConfig?.container
    ];

    containers.forEach(container => {
      const element = getElement(container);
      if (element) {
        Object.assign(element.style, {
          display: "none"
        });
        element.textContent = "";
      }
    });
  }

  private resetState(): void {
    this.isInitialized = false;
    this.isCapturing = false;
    this.currentScanStep = 0;
    this.scanSequence = [];
    this.fullResult = {
      [EnumDriverLicenseScanSide.Front]: null,
      [EnumDriverLicenseScanSide.Back]: null,
    };
  }

  // Helper method for creating error results
  private createErrorResult(errorMessage: string): DriverLicenseFullResult {
    return {
      [EnumDriverLicenseScanSide.Front]: {
        status: { code: EnumResultStatus.RS_FAILED, message: errorMessage },
      },
      [EnumDriverLicenseScanSide.Back]: {
        status: { code: EnumResultStatus.RS_FAILED, message: errorMessage },
      },
      licenseData: {
        status: { code: EnumResultStatus.RS_FAILED, message: errorMessage },
      },
    };
  }

  async launch(): Promise<DriverLicenseFullResult> {
    if (this.isCapturing) {
      const error = "Capture session already in progress";
      console.error(error);
      return this.createErrorResult(error);
    }

    this.isCapturing = true;

    try {
      const { components } = await this.initialize();

      if (isEmptyObject(components)) {
        throw new Error("Driver License Scanner initialization failed");
      }

      // Show main container if configured
      const mainContainer = getElement(this.config.container);
      if (mainContainer) {
        mainContainer.style.display = "block";
      }

      // Validate scanner view availability
      if (!components.scannerView) {
        throw new Error("Scanner view is required for capture operations");
      }

      // Execute scan workflow
      const workflowResult = await this.executeWorkflow(components);

      // Show results if successful and result view is configured
      if (this.isWorkflowSuccessful(workflowResult) && components.scanResultView) {
        await this.showResults(components.scanResultView);
      }

      return this.fullResult || this.createErrorResult("No scan results available");

    } catch (error) {
      this.hideLoadingOverlay();
      const errorMessage = `Driver license capture flow failed. ${error?.message || error}`;
      console.error("Driver license capture flow failed:", error);
      return this.createErrorResult(errorMessage);
    } finally {
      this.isCapturing = false;
      this.hideLoadingOverlay();
      this.dispose();
    }
  }

  private async executeWorkflow(components: any): Promise<boolean> {
    this.currentScanStep = 0;

    while (this.currentScanStep < this.scanSequence.length) {
      try {
        const currentStep = this.scanSequence[this.currentScanStep];
        const stepResult = await this.executeCurrentScanStep(components);

        if (!this.isStepSuccessful(stepResult)) {
          return false;
        }

        // Handle post-step processing for image captures
        if (currentStep.mode === EnumDriverLicenseScanMode.Image && stepResult) {
          const postProcessSuccess = await this.handleImagePostProcessing(
            components,
            currentStep,
            stepResult
          );

          if (!postProcessSuccess) {
            return false;
          }
        }

        this.currentScanStep++;

      } catch (stepError) {
        console.error(`Critical error in step ${this.currentScanStep + 1}:`, stepError);
        return false;
      }
    }

    return true;
  }

  private async handleImagePostProcessing(
    components: any,
    currentStep: DriverLicenseScanStep,
    stepResult: any
  ): Promise<boolean> {
    try {
      // Handle correction view if needed
      if (components.correctionView && shouldCorrectImage(stepResult._flowType)) {
        await components.correctionView.launch();
      }

      // Handle verify view if configured
      if (components.scanVerifyView) {
        const scanMode = currentStep.side === EnumDriverLicenseScanSide.Front
          ? EnumDriverLicenseScanSide.Front
          : EnumDriverLicenseScanSide.Back;

        const verifyResult = await components.scanVerifyView.launch(scanMode);

        if (!this.isStepSuccessful(verifyResult)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Post-processing failed:', error);
      return false;
    }
  }

  private isStepSuccessful(stepResult: any): boolean {
    if (!stepResult) return false;

    const statusCode = stepResult.status?.code;

    if (statusCode === EnumResultStatus.RS_CANCELLED) {
      this.fullResult = this.createCancelledResult("Operation cancelled by user");
      return false;
    }

    if (statusCode !== EnumResultStatus.RS_SUCCESS) {
      console.error("Step failed:", stepResult.status?.message);
      this.fullResult = this.createErrorResult(stepResult.status?.message || "Step failed");
      return false;
    }

    return true;
  }

  private isWorkflowSuccessful(workflowResult: boolean): boolean {
    return workflowResult && this.hasValidResults();
  }

  private async showResults(scanResultView: any): Promise<void> {

    this.showLoadingOverlay("Preparing results...");
    await new Promise(resolve => setTimeout(resolve, 400));
    this.hideLoadingOverlay();

    try {
      await scanResultView.launch();
    } catch (error) {
      console.error("Result view failed:", error);
      throw new Error(`Failed to show results: ${error?.message || error}`);
    }
  }

  // Helper method to check if we have valid results
  private hasValidResults(): boolean {
    if (!this.fullResult) return false;

    const { captureFrontImage, captureBackImage, readBarcode } = this.config.workflowConfig;
    const isBarcodeOnlyWorkflow = !captureFrontImage && !captureBackImage && readBarcode;

    if (isBarcodeOnlyWorkflow) return this.fullResult?.licenseData?.status?.code === EnumResultStatus.RS_SUCCESS;

    // Check if we have at least one successful scan result
    const frontResult = this.fullResult[EnumDriverLicenseScanSide.Front];
    const backResult = this.fullResult[EnumDriverLicenseScanSide.Back];

    const hasFrontSuccess = frontResult?.status?.code === EnumResultStatus.RS_SUCCESS;
    const hasBackSuccess = backResult?.status?.code === EnumResultStatus.RS_SUCCESS;

    return hasFrontSuccess || hasBackSuccess;
  }

  private createCancelledResult(reason: string = "Operation cancelled"): DriverLicenseFullResult {
    return {
      [EnumDriverLicenseScanSide.Front]: {
        status: { code: EnumResultStatus.RS_CANCELLED, message: reason },
      },
      [EnumDriverLicenseScanSide.Back]: {
        status: { code: EnumResultStatus.RS_CANCELLED, message: reason },
      },
      licenseData: {
        status: { code: EnumResultStatus.RS_CANCELLED, message: reason },
      },
    };
  }

  // Updated executeCurrentScanStep with better error handling
  private async executeCurrentScanStep(components: any): Promise<DriverLicenseImageResult> {
    const currentStep = this.scanSequence[this.currentScanStep];

    if (!currentStep) {
      return {
        status: {
          code: EnumResultStatus.RS_SUCCESS,
          message: "All scan steps completed",
        },
      };
    }

    try {
      if (currentStep.mode === EnumDriverLicenseScanMode.Image) {
        const scanResult = await components.scannerView.launch(currentStep.side, currentStep.mode);

        if (scanResult?.status.code === EnumResultStatus.RS_SUCCESS) {
          this.fullResult[currentStep.side] = scanResult;

          // Update shared resources
          if (this.resources.onResultUpdated) {
            this.resources.onResultUpdated({ ...this.resources.result, ...this.fullResult });
          }
        }

        return scanResult;
      } else if (currentStep.mode === EnumDriverLicenseScanMode.Barcode) {
        const scanResult = await components.scannerView.launch(currentStep.side, currentStep.mode);

        if (scanResult?.status.code === EnumResultStatus.RS_SUCCESS) {
          this.fullResult.licenseData = scanResult;

          // Update shared resources
          if (this.resources.onResultUpdated) {
            this.resources.onResultUpdated({ ...this.resources.result, ...this.fullResult });
          }
        }

        return scanResult;
      }

      return {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: "Unknown scan mode",
        },
      };
    } catch (error) {
      console.error(`Error in scan step ${this.currentScanStep + 1}:`, error);
      return {
        status: {
          code: EnumResultStatus.RS_FAILED,
          message: error?.message || error || "Scan step failed",
        },
      };
    }
  }
}

export default DriverLicenseScanner;
