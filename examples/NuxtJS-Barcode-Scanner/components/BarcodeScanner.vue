<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, type Ref } from "vue";
import { init } from "../dynamsoft.config";
import { CameraEnhancer, CameraView } from "dynamsoft-camera-enhancer";
import { CaptureVisionRouter } from "dynamsoft-capture-vision-router";
import { MultiFrameResultCrossFilter } from "dynamsoft-utility";
import type { BarcodeResultItem } from "dynamsoft-barcode-reader-bundle";

const cameraViewContainer: Ref<HTMLElement | null> = ref(null);
let cvRouter: CaptureVisionRouter;
let cameraEnhancer: CameraEnhancer;
let cameraView:CameraView;
// define a 'detected' event that the Scanner component emits when barcodes are detected
const emit = defineEmits<{
  (e: 'scanned', results: BarcodeResultItem[]): void
  (e: 'initialized'): void
}>();
// expose start/stop to control pause/resume scanning
const start = async () => await startScanning();
const stop = () => stopScanning();

defineExpose({ start, stop })
onMounted(async () => {
  try {
    await init();
    // Create a `CameraEnhancer` instance for camera control and a `CameraView` instance for UI control.
    cameraView = await CameraView.createInstance();
    cameraEnhancer = await CameraEnhancer.createInstance(cameraView);

    // Get default UI and append it to DOM.
    cameraViewContainer.value!.append(cameraView.getUIElement());

    // Create a `CaptureVisionRouter` instance and set `CameraEnhancer` instance as its image source.
    cvRouter = await CaptureVisionRouter.createInstance();
    cvRouter.setInput(cameraEnhancer);

    // Define a callback for results.
    cvRouter.addResultReceiver({
      onDecodedBarcodesReceived: (result) => {
        emit("scanned",result.barcodeResultItems);
      }
    });

    // Filter out unchecked and duplicate results.
    const filter = new MultiFrameResultCrossFilter();
    // Filter out unchecked barcodes.
    filter.enableResultCrossVerification("barcode", true);
    // Filter out duplicate barcodes within 3 seconds.
    filter.enableResultDeduplication("barcode", true);
    await cvRouter.addResultFilter(filter);
    emit("initialized");
  } catch (ex: any) {
    let errMsg = ex.message || ex;
    console.error(errMsg);
  }
});

const stopScanning = () => {
  cameraView?.setScanLaserVisible(false);
  cvRouter?.stopCapturing();
  cameraEnhancer.close();
}

const startScanning = async () => {
  await cameraEnhancer.open();
  cvRouter?.startCapturing("ReadSingleBarcode");
  cameraView?.setScanLaserVisible(true);
}

// dispose cvRouter when it's no longer needed
onBeforeUnmount(async () => {
  console.log("disposing...");
  try {
    cvRouter?.dispose();
    cameraEnhancer?.dispose();
  } catch (_) { }
});
</script>

<template>
  <div ref="cameraViewContainer" id="cameraViewContainer"></div>
</template>

<style scoped>
#cameraViewContainer {
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  position: absolute;
}
</style>