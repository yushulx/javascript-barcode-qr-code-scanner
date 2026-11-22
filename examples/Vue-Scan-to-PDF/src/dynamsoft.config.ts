import { CaptureVisionRouter, CoreModule, DSImageData, DetectedQuadResultItem, EnumCapturedResultItemType, LicenseManager } from "dynamsoft-capture-vision-bundle";
import { DDV, DetectResult, DocumentDetectConfig, VImageData } from "dynamsoft-document-viewer";

let initiazlied = false;

export async function init(){
  if (initiazlied === false) {
    console.log("Initializing...");
    //set the license for Dynamsoft Document Viewer and Dynamsoft Document Normalizer. Use one-day trial by default.
    //apply your license here: https://www.dynamsoft.com/customer/license/trialLicense/?product=mwc
    CoreModule.engineResourcePaths.rootDirectory = "https://cdn.jsdelivr.net/npm/";
    await LicenseManager.initLicense("DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==",{executeNow:true});
    await CoreModule.loadWasm().catch((ex: Error) => {
      const errMsg = ex.message || ex;
      console.error(errMsg);
      alert(errMsg);
    });
    DDV.Core.license = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";
    DDV.Core.engineResourcePath = "assets/ddv-resources/engine";// Lead to a folder containing the distributed WASM files
    await DDV.Core.loadWasm();
    await DDV.Core.init();
    DDV.setProcessingHandler("imageFilter", new DDV.ImageFilter());
  }
  initiazlied = true;
  return true;
}

export async function initDocDetectModule() {
  const router = await CaptureVisionRouter.createInstance();
  class DDNNormalizeHandler extends DDV.DocumentDetect {
    async detect(image:VImageData, config:DocumentDetectConfig) {
      if (!router) {
        return Promise.resolve({
          success: false
        });
      };

      if (!image.width || !image.height) {
        return Promise.resolve({
          success: false
        });
      };

      let width = image.width;
      let height = image.height;
      let ratio = 1;
      let data:ArrayBuffer;

      if (height > 720) {
        ratio = height / 720;
        height = 720;
        width = Math.floor(width / ratio);
        data = compress(image.data as ArrayBuffer, image.width, image.height, width, height);
      } else {
        data = image.data.slice(0) as ArrayBuffer;
      }


      // Define DSImage according to the usage of DDN
      const DSImage:DSImageData = {
        bytes: new Uint8Array(data),
        width,
        height,
        stride: width * 4, //RGBA
        format: 10 // IPF_ABGR_8888
      } as DSImageData;

      // Use DDN normalized module
      const results = await router.capture(DSImage, 'DetectDocumentBoundaries_Default');
      const detectedQuadResultItems = results.items.filter(
        (item) => item.type === EnumCapturedResultItemType.CRIT_DETECTED_QUAD
      ) as DetectedQuadResultItem[];
      // Filter the results and generate corresponding return values
      if (!detectedQuadResultItems || detectedQuadResultItems.length <= 0) {
        return Promise.resolve({
          success: false
        });
      };

      const quad:any[] = [];
      
      detectedQuadResultItems[0].location.points.forEach((p) => {
        quad.push([p.x * ratio, p.y * ratio]);
      });

      const detectResult = this.processDetectResult({
        location: quad,
        width: image.width,
        height: image.height,
        config
      } as DetectResult);

      return Promise.resolve(detectResult);
    }
  }
  DDV.setProcessingHandler('documentBoundariesDetect', new DDNNormalizeHandler())
}

function compress(
    imageData:ArrayBuffer,
    imageWidth:number,
    imageHeight:number,
    newWidth:number,
    newHeight:number,
) {
  let source = null;
  try {
      source = new Uint8ClampedArray(imageData);
  } catch (error) {
      source = new Uint8Array(imageData);
  }

  const scaleW = newWidth / imageWidth;
  const scaleH = newHeight / imageHeight;
  const targetSize = newWidth * newHeight * 4;
  const targetMemory = new ArrayBuffer(targetSize);
  let distData = null;

  try {
      distData = new Uint8ClampedArray(targetMemory, 0, targetSize);
  } catch (error) {
      distData = new Uint8Array(targetMemory, 0, targetSize);
  }

  const filter = (distCol:number, distRow:number) => {
      const srcCol = Math.min(imageWidth - 1, distCol / scaleW);
      const srcRow = Math.min(imageHeight - 1, distRow / scaleH);
      const intCol = Math.floor(srcCol);
      const intRow = Math.floor(srcRow);

      let distI = (distRow * newWidth) + distCol;
      let srcI = (intRow * imageWidth) + intCol;

      distI *= 4;
      srcI *= 4;

      for (let j = 0; j <= 3; j += 1) {
          distData[distI + j] = source[srcI + j];
      }
  };

  for (let col = 0; col < newWidth; col += 1) {
      for (let row = 0; row < newHeight; row += 1) {
          filter(col, row);
      }
  }

  return distData;
}
