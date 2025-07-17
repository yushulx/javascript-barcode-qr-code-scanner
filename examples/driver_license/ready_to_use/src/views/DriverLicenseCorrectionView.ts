import {
  QuadDrawingItem,
  DeskewedImageResultItem,
  Point,
  Quadrilateral,
  DrawingLayer,
  DrawingStyleManager,
  ImageEditorView,
  EnumCapturedResultItemType,
  DetectedQuadResultItem,
} from "dynamsoft-capture-vision-bundle";
import { SharedResources } from "../DriverLicenseScanner";
import { createControls, createStyle, getElement } from "../utils";
import { ICONS } from "../utils/icons";
import { ToolbarButtonConfig, EnumResultStatus, UtilizedTemplateNames, ToolbarButton } from "../utils/types";
import { DriverLicenseImageResult, DEFAULT_TEMPLATE_NAMES } from "../utils/DriverLicenseParser";

const DEFAULT_CORNER_SIZE = 60;

export interface DriverLicenseCorrectionViewToolbarButtonsConfig {
  fullImage?: ToolbarButtonConfig;
  detectBorders?: ToolbarButtonConfig;
  apply?: ToolbarButtonConfig;
}

export interface DriverLicenseCorrectionViewConfig {
  container?: HTMLElement | string;
  toolbarButtonsConfig?: DriverLicenseCorrectionViewToolbarButtonsConfig;
  templateFilePath?: string;
  utilizedTemplateNames?: UtilizedTemplateNames;
  onFinish?: (result: DriverLicenseImageResult) => void;

  _showResultView?: boolean; // Internal use, to change Apply -> Done if result view is not configured
}

export default class DriverLicenseCorrectionView {
  private imageEditorView: ImageEditorView = null;
  private layer: DrawingLayer = null;
  private currentCorrectionResolver?: (result: DriverLicenseImageResult) => void;

  constructor(private resources: SharedResources, private config: DriverLicenseCorrectionViewConfig) {
    this.config.utilizedTemplateNames = {
      detect: config.utilizedTemplateNames?.detect || DEFAULT_TEMPLATE_NAMES.detect,
      normalize: config.utilizedTemplateNames?.normalize || DEFAULT_TEMPLATE_NAMES.normalize,
      barcode: config.utilizedTemplateNames?.barcode || DEFAULT_TEMPLATE_NAMES.barcode,
    };
  }

  async initialize(): Promise<void> {
    if (!this.resources.result) {
      throw Error("Captured image is missing. Please capture an image first!");
    }

    if (!this.config.container) {
      throw new Error("Please create an Correction View Container element");
    }

    createStyle("ddls-correction-view-style", DEFAULT_CORRECTION_VIEW_CSS);

    // Create a wrapper div that preserves container dimensions
    const correctionViewWrapper = document.createElement("div");
    correctionViewWrapper.className = "ddls-correction-view-container";

    // Add image editor view from DCE to correct documents
    const imageEditorViewElement = document.createElement("div");
    Object.assign(imageEditorViewElement.style, {
      width: "100%",
      height: "100%",
    });

    correctionViewWrapper.appendChild(imageEditorViewElement);
    getElement(this.config.container).appendChild(correctionViewWrapper);

    this.imageEditorView = await ImageEditorView.createInstance(imageEditorViewElement);
    this.layer = this.imageEditorView.createDrawingLayer();
    // this.imageEditorView.setOriginalImage(this.resources.result.originalImageResult);

    this.setupDrawingLayerStyle(); // Set style for drawing layer
    this.setupInitialDetectedQuad();
    this.setupCorrectionControls();
    this.setupQuadConstraints();
  }

  private setupDrawingLayerStyle() {
    const styleID = DrawingStyleManager.createDrawingStyle({
      lineWidth: 5,
      fillStyle: "transparent",
      strokeStyle: "#FE8E14",
      paintMode: "stroke",
    });

    this.layer.setDefaultStyle(styleID);
  }

  private setupQuadConstraints() {
    const canvas = this.layer.fabricCanvas;

    canvas.defaultCursor = "default";
    canvas.hoverCursor = "default";
    canvas.moveCursor = "default";

    canvas.on("object:scaling", (e: any) => {
      const obj = e.target;
      const points = obj.points;
      const bounds = this.getCanvasBounds();

      // Constrain scaling to canvas bounds
      points.forEach((point: Point) => {
        point.x = Math.max(0, Math.min(bounds.width, point.x));
        point.y = Math.max(0, Math.min(bounds.height, point.y));
      });

      obj.set({
        points: points,
        dirty: true,
      });
      canvas.renderAll();
    });

    canvas.on("object:modified", (e: any) => {
      const obj = e.target;
      if (!obj) return;

      const points = obj.points;
      const bounds = this.getCanvasBounds();

      // Ensure all points stay within bounds
      let needsConstraint = false;
      points.forEach((point: Point) => {
        if (point.x < 0 || point.x > bounds.width || point.y < 0 || point.y > bounds.height) {
          needsConstraint = true;
        }
      });

      if (needsConstraint) {
        points.forEach((point: Point) => {
          point.x = Math.max(0, Math.min(bounds.width, point.x));
          point.y = Math.max(0, Math.min(bounds.height, point.y));
        });

        obj.set({
          points: points,
          dirty: true,
        });
        canvas.renderAll();
      }
    });
  }

  private getCanvasBounds() {
    const canvas = this.layer.fabricCanvas;
    return {
      width: canvas.getWidth(),
      height: canvas.getHeight(),
    };
  }

  private addQuadToLayer(newQuad: QuadDrawingItem) {
    this.layer.clearDrawingItems();

    const fabricObject = newQuad._getFabricObject();
    fabricObject.cornerSize = DEFAULT_CORNER_SIZE;

    // Make quad non-draggable but keep corner controls
    fabricObject.lockMovementX = true;
    fabricObject.lockMovementY = true;

    // Make circle transparent to show corner on drag
    fabricObject.on("mousedown", function (e: any) {
      if (e.target && e.target.controls) {
        this.cornerColor = "transparent";
        this.dirty = true;
        this.canvas?.renderAll();
      }
    });

    fabricObject.on("mouseup", function () {
      this.cornerColor = "#FE8E14";
      this.dirty = true;
      this.canvas?.renderAll();
    });

    this.layer.renderAll();
    this.layer.addDrawingItems([newQuad]);

    // Select the quad immediately after adding it
    this.layer.fabricCanvas.setActiveObject(fabricObject);
    this.layer.fabricCanvas.renderAll();
  }

  private setupInitialDetectedQuad() {
    let quad: QuadDrawingItem;
    // Draw the detected quadrilateral
    // if (this.resources.result.detectedQuadrilateral) {
    //   quad = new QuadDrawingItem(this.resources.result.detectedQuadrilateral);
    // } else {
    //   // If no quad detected, draw full image quad
    //   const { width, height } = this.resources.result.originalImageResult;
    //   quad = new QuadDrawingItem({
    //     points: [
    //       { x: 0, y: 0 },
    //       { x: width, y: 0 },
    //       { x: width, y: height },
    //       { x: 0, y: height },
    //     ],
    //     area: width * height,
    //   });
    // }

    // this.addQuadToLayer(quad);
  }

  private createControls(): HTMLElement {
    const { toolbarButtonsConfig } = this.config;

    const buttons: ToolbarButton[] = [
      {
        id: `ddls-correction-fullImage`,
        icon: toolbarButtonsConfig?.fullImage?.icon || ICONS.fullImage,
        label: toolbarButtonsConfig?.fullImage?.label || "Full Image",
        className: `${toolbarButtonsConfig?.fullImage?.className || ""}`,
        isHidden: toolbarButtonsConfig?.fullImage?.isHidden || false,
        onClick: () => this.setFullImageBoundary(),
      },
      {
        id: `ddls-correction-detectBorders`,
        icon: toolbarButtonsConfig?.detectBorders?.icon || ICONS.autoBounds,
        label: toolbarButtonsConfig?.detectBorders?.label || "Detect Borders",
        className: `${toolbarButtonsConfig?.detectBorders?.className || ""}`,
        isHidden: toolbarButtonsConfig?.detectBorders?.isHidden || false,
        onClick: () => this.setBoundaryAutomatically(),
      },
      {
        id: `ddls-correction-apply`,
        icon:
          toolbarButtonsConfig?.apply?.icon || (this.config?._showResultView === false ? ICONS.complete : ICONS.finish),
        label: toolbarButtonsConfig?.apply?.label || (this.config?._showResultView === false ? "Done" : "Apply"),
        className: `${toolbarButtonsConfig?.apply?.className || ""}`,
        isHidden: toolbarButtonsConfig?.apply?.isHidden || false,

        onClick: () => this.confirmCorrection(),
      },
    ];

    return createControls(buttons);
  }

  private setupCorrectionControls() {
    try {
      const controlContainer = this.createControls();
      const wrapper = getElement(this.config.container).firstElementChild as HTMLElement;
      if (wrapper) {
        wrapper.appendChild(controlContainer);
      }
    } catch (error) {
      console.error("Error setting up correction controls:", error);
      throw new Error(`Failed to setup correction controls: ${error.message}`);
    }
  }

  setFullImageBoundary() {
    // if (!this.resources.result) {
    //   throw Error("Captured image is missing. Please capture an image first!");
    // }
    // // Reset quad to full image
    // const { width, height } = this.resources.result.originalImageResult;
    // const fullQuad = new QuadDrawingItem({
    //   points: [
    //     { x: 0, y: 0 },
    //     { x: width, y: 0 },
    //     { x: width, y: height },
    //     { x: 0, y: height },
    //   ],
    //   area: width * height,
    // });
    // this.addQuadToLayer(fullQuad);
  }

  async setBoundaryAutomatically() {
    // Auto detect bounds
    if (this.config.templateFilePath) {
      await this.resources.cvRouter.initSettings(this.config.templateFilePath);
    }

    this.resources.cvRouter.maxImageSideLength = Infinity;

    // const result = await this.resources.cvRouter.capture(
    //   this.resources.result.originalImageResult,
    //   this.config.utilizedTemplateNames.detect
    // );

    // const quad = (
    //   result.items.find((item) => item.type === EnumCapturedResultItemType.CRIT_DETECTED_QUAD) as DetectedQuadResultItem
    // )?.location;

    // if (quad) {
    //   this.addQuadToLayer(new QuadDrawingItem(quad));
    // } else {
    //   this.setFullImageBoundary();
    // }
  }

  async confirmCorrection() {
    const drawingItem = this.layer.getDrawingItems()[0] as QuadDrawingItem;
    if (!drawingItem) {
      throw new Error("No quad drawing item found");
    }
    const quad = drawingItem.getQuad();
    const correctedImg = await this.correctImage(quad?.points);
    // if (correctedImg) {
    //   const updatedResult = {
    //     ...this.resources.result,
    //     correctedImageResult: correctedImg,
    //     detectedQuadrilateral: quad,
    //   };

    //   if (this.resources.onResultUpdated) {
    //     // Update the result with new corrected image and quad
    //     this.resources.onResultUpdated(updatedResult);
    //   }

    //   // Call onFinish callback if provided
    //   if (this.config?.onFinish) {
    //     this.config.onFinish(updatedResult);
    //   }

    //   // Resolve the promise with corrected image
    //   if (this.currentCorrectionResolver) {
    //     this.currentCorrectionResolver(updatedResult);
    //   }
    // } else {
    //   if (this.currentCorrectionResolver) {
    //     this.currentCorrectionResolver(this.resources.result);
    //   }
    // }

    // Clean up and hide
    this.dispose();
    this.hideView();
  }

  async launch(): Promise<DriverLicenseImageResult> {
    try {
      // if (!this.resources.result?.deskewedImageResult) {
      //   return {
      //     status: {
      //       code: EnumResultStatus.RS_FAILED,
      //       message: "No image available for correction",
      //     },
      //   };
      // }

      getElement(this.config.container).textContent = "";
      await this.initialize();
      getElement(this.config.container).style.display = "flex";

      // Return promise that resolves when user clicks finish
      return new Promise((resolve) => {
        this.currentCorrectionResolver = resolve;
      });
    } catch (ex: any) {
      let errMsg = ex?.message || ex;
      console.error(errMsg);
      // if (!this.resources.result?.deskewedImageResult) {
      //   return {
      //     status: {
      //       code: EnumResultStatus.RS_FAILED,
      //       message: errMsg,
      //     },
      //   };
      // }
    }
  }

  hideView(): void {
    getElement(this.config.container).style.display = "none";
  }

  /**
   * Normalize an image with DDN given a set of points
   * @param points - points provided by either users or DDN's detect quad
   * @returns normalized image by DDN
   */
  async correctImage(points: Quadrilateral["points"]): Promise<DeskewedImageResultItem> {
    const { cvRouter } = this.resources;

    if (this.config.templateFilePath) {
      await this.resources.cvRouter.initSettings(this.config.templateFilePath);
    }

    const settings = await cvRouter.getSimplifiedSettings(this.config.utilizedTemplateNames.normalize);
    settings.roiMeasuredInPercentage = false;
    settings.roi.points = points;
    await cvRouter.updateSettings(this.config.utilizedTemplateNames.normalize, settings);

    // const result = await cvRouter.capture(
    //   this.resources.result.originalImageResult as any, //todo
    //   this.config.utilizedTemplateNames.normalize
    // );

    // // If normalized result found by DDN
    // if (result?.processedDocumentResult.deskewedImageResultItems?.[0]) {
    //   return result.processedDocumentResult.deskewedImageResultItems[0];
    // }
    return;
  }

  dispose(): void {
    // Clean up resources
    if (this.imageEditorView?.dispose) {
      this.imageEditorView.dispose();
    }
    this.layer = null;

    // Clean up the container
    if (this.config?.container) {
      getElement(this.config.container).textContent = "";
    }

    // Clear resolver
    this.currentCorrectionResolver = undefined;
  }
}

const DEFAULT_CORRECTION_VIEW_CSS = `
  .ddls-correction-view-container {
    display: flex;
    width: 100%;
    height: 100%;
    background-color:#575757;
    font-size: 12px;
    flex-direction: column;
    align-items: center;
  }

  @media (orientation: landscape) and (max-width: 1024px) {
    .ddls-correction-view-container {
      flex-direction: row;
    }
  }
`;
