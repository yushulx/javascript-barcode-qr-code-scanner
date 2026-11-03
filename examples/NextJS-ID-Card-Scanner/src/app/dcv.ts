// Capture Vision 3.x resolves the engine and the MRZ models from these two paths.
const DCV_BUNDLE = "https://cdn.jsdelivr.net/npm/dynamsoft-capture-vision-bundle@3.6.5000/dist/";
const DCV_DATA = "https://cdn.jsdelivr.net/npm/dynamsoft-capture-vision-data@1.2.2/";

let initiazlied = false;

export async function init(){
  if (initiazlied === false) {
    console.log("Initializing...");
    // Import inside the effect: dcv.bundle.js 3.x touches window at module scope,
    // which breaks `next build` when this file is pulled into the server bundle.
    const { CaptureVisionRouter, CodeParserModule, CoreModule, LicenseManager } = await import("dynamsoft-capture-vision-bundle");
    await LicenseManager.initLicense("DLS2eyJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSJ9", { executeNow: true });
    CoreModule.engineResourcePaths = {
      dcvBundle: DCV_BUNDLE,
      dcvData: DCV_DATA,
    };
    await CoreModule.loadWasm().catch((ex: Error) => {
      let errMsg = ex.message || ex;
      console.error(errMsg);
      alert(errMsg);
    });
    await CodeParserModule.loadSpec("MRTD_TD1_ID");
    await CodeParserModule.loadSpec("MRTD_TD2_ID");
    await CodeParserModule.loadSpec("MRTD_TD3_PASSPORT");
    await CodeParserModule.loadSpec("AAMVA_DL_ID");
    // The MRZ character and text-line models are not part of dcv.bundle.js, so
    // pull them from dcv-data before initSettings() references them.
    await CaptureVisionRouter.appendDLModelBuffer(["MRZCharRecognition", "MRZTextLineRecognition"]);
  }
  initiazlied = true;
  return true;
}

// 3.x template: models are declared in CaptureVisionModelOptions, the recognizer
// uses SectionArray/StageArray instead of 2.x SectionImageParameterArray, and the
// MRZ parsing task lives in SemanticProcessingOptions.
export const mrzTemplateUrl = "/mrz-template.json";
