/*
 * This file includes code from "Inspector Bokeh" by Timo Taglieber <github@timotaglieber.de>
 * https://github.com/timotgl/inspector-bokeh
 * Licensed under the MIT License
 */

// Reference: https://github.com/kig/canvasfilters/blob/master/filters.js
// Reference: https://github.com/timotgl/inspector-bokeh

interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array | Float32Array;
}

interface BlurMeasurement {
  width: number;
  height: number;
  num_edges: number;
  avg_edge_width: number;
  avg_edge_width_perc: number;
}

// Constants
const BLUR_BEFORE_EDGE_DETECTION_MIN_WIDTH = 360; // pixels
const BLUR_BEFORE_EDGE_DETECTION_DIAMETER = 5.0; // pixels
const MIN_EDGE_INTENSITY = 20;

class Filters {
  private tmpCanvas?: HTMLCanvasElement;
  private tmpCtx?: CanvasRenderingContext2D;

  constructor() {
    if (typeof document !== "undefined") {
      this.tmpCanvas = document.createElement("canvas");
      this.tmpCtx = this.tmpCanvas.getContext("2d") as CanvasRenderingContext2D;
    }
  }

  // Helper to get pixels from image/canvas
  getPixels(img: HTMLImageElement | HTMLCanvasElement): ImageData {
    let c: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null = null;

    if ((img as HTMLCanvasElement).getContext) {
      c = img as HTMLCanvasElement;
      try {
        ctx = c.getContext("2d");
      } catch (e) {
        // Handle error
      }
    }

    if (!ctx) {
      c = this.getCanvas(img.width, img.height);
      ctx = c.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
    }

    return ctx.getImageData(0, 0, c!.width, c!.height);
  }

  private getCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  private createImageData(w: number, h: number): ImageData {
    if (this.tmpCtx) {
      return this.tmpCtx.createImageData(w, h);
    }
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  // Convert to luminance (grayscale)
  luminance(pixels: ImageData): ImageData {
    const output = this.createImageData(pixels.width, pixels.height);
    const dst = output.data;
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      // CIE luminance for the RGB
      const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      dst[i] = dst[i + 1] = dst[i + 2] = v;
      dst[i + 3] = d[i + 3];
    }
    return output;
  }

  // Gaussian blur implementation
  gaussianBlur(pixels: ImageData, diameter: number): ImageData {
    diameter = Math.abs(diameter);
    if (diameter <= 1) return this.identity(pixels);

    const radius = diameter / 2;
    const len = Math.ceil(diameter) + (1 - (Math.ceil(diameter) % 2));
    const weights = new Float32Array(len);
    const rho = (radius + 0.5) / 3;
    const rhoSq = rho * rho;
    const gaussianFactor = 1 / Math.sqrt(2 * Math.PI * rhoSq);
    const rhoFactor = -1 / (2 * rho * rho);
    let wsum = 0;
    const middle = Math.floor(len / 2);

    for (let i = 0; i < len; i++) {
      const x = i - middle;
      const gx = gaussianFactor * Math.exp(x * x * rhoFactor);
      weights[i] = gx;
      wsum += gx;
    }

    for (let i = 0; i < weights.length; i++) {
      weights[i] /= wsum;
    }

    return this.separableConvolve(pixels, weights, weights);
  }

  private identity(pixels: ImageData): ImageData {
    const output = this.createImageData(pixels.width, pixels.height);
    const dst = output.data;
    const d = pixels.data;
    for (let i = 0; i < d.length; i++) {
      dst[i] = d[i];
    }
    return output;
  }

  // Convolution with kernel
  convolve(pixels: ImageData, weights: number[] | Float32Array, opaque: boolean = true): ImageData {
    const side = Math.round(Math.sqrt(weights.length));
    const halfSide = Math.floor(side / 2);

    const src = pixels.data;
    const sw = pixels.width;
    const sh = pixels.height;
    const output = this.createImageData(sw, sh);
    const dst = output.data;
    const alphaFac = opaque ? 1 : 0;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const dstOff = (y * sw + x) * 4;
        let r = 0,
          g = 0,
          b = 0,
          a = 0;

        for (let cy = 0; cy < side; cy++) {
          for (let cx = 0; cx < side; cx++) {
            const scy = Math.min(sh - 1, Math.max(0, y + cy - halfSide));
            const scx = Math.min(sw - 1, Math.max(0, x + cx - halfSide));
            const srcOff = (scy * sw + scx) * 4;
            const wt = weights[cy * side + cx];
            r += src[srcOff] * wt;
            g += src[srcOff + 1] * wt;
            b += src[srcOff + 2] * wt;
            a += src[srcOff + 3] * wt;
          }
        }

        dst[dstOff] = r;
        dst[dstOff + 1] = g;
        dst[dstOff + 2] = b;
        dst[dstOff + 3] = a + alphaFac * (255 - a);
      }
    }
    return output;
  }

  private separableConvolve(pixels: ImageData, horizWeights: Float32Array, vertWeights: Float32Array): ImageData {
    return this.horizontalConvolve(this.verticalConvolve(pixels, vertWeights), horizWeights);
  }

  private verticalConvolve(pixels: ImageData, weightsVector: Float32Array): ImageData {
    const side = weightsVector.length;
    const halfSide = Math.floor(side / 2);
    const src = pixels.data;
    const sw = pixels.width;
    const sh = pixels.height;
    const output = this.createImageData(sw, sh);
    const dst = output.data;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const dstOff = (y * sw + x) * 4;
        let r = 0,
          g = 0,
          b = 0,
          a = 0;

        for (let cy = 0; cy < side; cy++) {
          const scy = Math.min(sh - 1, Math.max(0, y + cy - halfSide));
          const srcOff = (scy * sw + x) * 4;
          const wt = weightsVector[cy];
          r += src[srcOff] * wt;
          g += src[srcOff + 1] * wt;
          b += src[srcOff + 2] * wt;
          a += src[srcOff + 3] * wt;
        }

        dst[dstOff] = r;
        dst[dstOff + 1] = g;
        dst[dstOff + 2] = b;
        dst[dstOff + 3] = a;
      }
    }
    return output;
  }

  private horizontalConvolve(pixels: ImageData, weightsVector: Float32Array): ImageData {
    const side = weightsVector.length;
    const halfSide = Math.floor(side / 2);
    const src = pixels.data;
    const sw = pixels.width;
    const sh = pixels.height;
    const output = this.createImageData(sw, sh);
    const dst = output.data;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const dstOff = (y * sw + x) * 4;
        let r = 0,
          g = 0,
          b = 0,
          a = 0;

        for (let cx = 0; cx < side; cx++) {
          const scx = Math.min(sw - 1, Math.max(0, x + cx - halfSide));
          const srcOff = (y * sw + scx) * 4;
          const wt = weightsVector[cx];
          r += src[srcOff] * wt;
          g += src[srcOff + 1] * wt;
          b += src[srcOff + 2] * wt;
          a += src[srcOff + 3] * wt;
        }

        dst[dstOff] = r;
        dst[dstOff + 1] = g;
        dst[dstOff + 2] = b;
        dst[dstOff + 3] = a;
      }
    }
    return output;
  }
}

// Edge detection using Sobel operator
function detectEdges(imageData: ImageData, filters: Filters): ImageData {
  const preBlurredImageData =
    imageData.width >= BLUR_BEFORE_EDGE_DETECTION_MIN_WIDTH
      ? filters.gaussianBlur(imageData, BLUR_BEFORE_EDGE_DETECTION_DIAMETER)
      : imageData;

  const greyscaled = filters.luminance(preBlurredImageData);
  const sobelKernel = new Float32Array([1, 0, -1, 2, 0, -2, 1, 0, -1]);
  return filters.convolve(greyscaled, sobelKernel, true);
}

// Reduce imageData from RGBA to single channel
function reducedPixels(imageData: ImageData): Uint8ClampedArray[] {
  const { data: pixels, width } = imageData;
  const rowLen = width * 4;
  const rows: Uint8ClampedArray[] = [];

  for (let y = 0; y < pixels.length; y += rowLen) {
    const row = new Uint8ClampedArray(width);
    let x = 0;
    for (let i = y; i < y + rowLen; i += 4) {
      row[x] = pixels[i];
      x += 1;
    }
    rows.push(row);
  }
  return rows;
}

// Detect blur from pixel rows
function detectBlur(pixels: Uint8ClampedArray[]): BlurMeasurement {
  const width = pixels[0].length;
  const height = pixels.length;
  let numEdges = 0;
  let sumEdgeWidths = 0;

  for (let y = 0; y < height; y += 1) {
    let edgeStart = -1;

    for (let x = 0; x < width; x += 1) {
      const value = pixels[y][x];

      // Edge is still open
      if (edgeStart >= 0 && x > edgeStart) {
        const oldValue = pixels[y][x - 1];
        // Value stopped increasing => edge ended
        if (value < oldValue) {
          // Only count edges that reach a certain intensity
          if (oldValue >= MIN_EDGE_INTENSITY) {
            const edgeWidth = x - edgeStart - 1;
            numEdges += 1;
            sumEdgeWidths += edgeWidth;
          }
          edgeStart = -1; // Reset edge marker
        }
      }

      // Edge starts
      if (value === 0) {
        edgeStart = x;
      }
    }
  }

  const bm = numEdges === 0 ? 0 : sumEdgeWidths / numEdges;
  const percWidth = numEdges === 0 ? 0 : (bm / width) * 100;

  return {
    width,
    height,
    num_edges: numEdges,
    avg_edge_width: bm,
    avg_edge_width_perc: percWidth,
  };
}

function measureBlur(imageData: ImageData): BlurMeasurement;
function measureBlur(img: HTMLImageElement | HTMLCanvasElement): BlurMeasurement;
function measureBlur(input: ImageData | HTMLImageElement | HTMLCanvasElement): BlurMeasurement {
  const filters = new Filters();

  let imageData: ImageData;
  if ("data" in input) {
    imageData = input;
  } else {
    imageData = filters.getPixels(input);
  }

  const edgeData = detectEdges(imageData, filters);
  const pixelRows = reducedPixels(edgeData);
  return detectBlur(pixelRows);
}

export default measureBlur;
export { measureBlur, type BlurMeasurement };

export function calculateBlurThreshold(dimensions: { width: number; height: number }): number {
  const totalPixels = dimensions.width * dimensions.height;

  // Resolution thresholds from highest to lowest
  const thresholds = [
    { minPixels: 3840 * 2160, threshold: 0.29 }, // 4K+ (8MP+)
    { minPixels: 2560 * 1440, threshold: 0.29 }, // 2K (4MP)
    { minPixels: 1920 * 1080, threshold: 0.5 }, // 1080p (2MP)
    { minPixels: 1280 * 720, threshold: 1.0 }, // 720p (1MP)
    { minPixels: 640 * 480, threshold: 1.0 }, // VGA (0.3MP)
  ];

  // Find the appropriate threshold
  for (const { minPixels, threshold } of thresholds) {
    if (totalPixels >= minPixels) {
      return threshold;
    }
  }

  // Below VGA fallback
  return 0.6;
}
