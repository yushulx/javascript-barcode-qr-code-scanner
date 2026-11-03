import React from "react";
import { ReactNode } from "react";
import {
  CameraEnhancer,
  CameraView,
  CaptureVisionRouter,
  CoreModule,
  EnumCapturedResultItemType,
  LicenseManager,
} from "dynamsoft-barcode-reader-bundle";
import type {
  BarcodeResultItem,
  PlayCallbackInfo,
} from "dynamsoft-barcode-reader-bundle";

const DEFAULT_LICENSE =
  "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";

// Where the SDK loads its wasm/worker/model resources from. Pointing at the
// jsDelivr CDN avoids bundling ~50 MB of binaries and keeps first load fast.
// The SDK appends its own versioned package path (e.g.
// dynamsoft-barcode-reader-bundle@11.6.5000/dist/) to this root directory.
const SDK_RESOURCE_ROOT = "https://cdn.jsdelivr.net/npm/";

export interface ScannerProps {
  isActive?: boolean;
  children?: ReactNode;
  interval?: number;
  license?: string;
  template?: string;
  onInitialized?: (enhancer: CameraEnhancer, cvr: CaptureVisionRouter) => void;
  onScanned?: (results: BarcodeResultItem[]) => void;
  onPlayed?: (playCallbackInfo: PlayCallbackInfo) => void;
  onClosed?: () => void;
}

const BarcodeScanner = (props: ScannerProps): React.ReactElement => {
  const mounted = React.useRef(false);
  const container = React.useRef<HTMLDivElement>(null);
  const enhancer = React.useRef<CameraEnhancer>();
  const cvr = React.useRef<CaptureVisionRouter>();
  const interval = React.useRef<any>(null);
  const decoding = React.useRef(false);
  React.useEffect(() => {
    const init = async () => {
      CoreModule.engineResourcePaths = { rootDirectory: SDK_RESOURCE_ROOT };
      await LicenseManager.initLicense(
        props.license && props.license.length > 0
          ? props.license
          : DEFAULT_LICENSE
      );
      await CoreModule.loadWasm();
      const cvRouter = await CaptureVisionRouter.createInstance();
      cvr.current = cvRouter;
      const cameraView = await CameraView.createInstance();
      const cameraEnhancer = await CameraEnhancer.createInstance(cameraView);
      enhancer.current = cameraEnhancer;
      cameraEnhancer.setVideoFit("cover");
      await cameraEnhancer.setUIElement(container.current!);
      cameraEnhancer.on("played", (playCallbackInfo: PlayCallbackInfo) => {
        if (props.onPlayed) {
          props.onPlayed(playCallbackInfo);
        }
        startScanning();
      });
      cameraEnhancer.on("cameraClose", () => {
        if (props.onClosed) {
          props.onClosed();
        }
      });
      if (props.onInitialized) {
        props.onInitialized(cameraEnhancer, cvRouter);
      }

      toggleCamera();
    };
    if (mounted.current === false) {
      init();
    }
    mounted.current = true;
  }, []);

  const toggleCamera = () => {
    if (mounted.current === true) {
      if (props.isActive === true) {
        enhancer.current?.open();
      } else {
        stopScanning();
        enhancer.current?.close();
      }
    }
  }

  React.useEffect(() => {
    toggleCamera();
  }, [props.isActive])

  const startScanning = () => {
    const decode = async () => {
      if (decoding.current === false && cvr.current && enhancer.current) {
        decoding.current = true;
        const result = await cvr.current.capture(
          enhancer.current.fetchImage(),
          props.template ? props.template : "ReadBarcodes_Default"
        );
        const items = result.items.filter(
          (item) => item.type === EnumCapturedResultItemType.CRIT_BARCODE
        ) as BarcodeResultItem[];
        if (props.onScanned) {
          props.onScanned(items);
        }
        decoding.current = false;
      }
    }
    if (props.interval) {
      interval.current = setInterval(decode, props.interval);
    } else {
      interval.current = setInterval(decode, 40);
    }
  }

  const stopScanning = () => {
    clearInterval(interval.current);
  }

  return (
    <div ref={container} style={{ position:"relative", width:"100%", height:"100%" }}>

      {props.children}
    </div>
  )
}

export default BarcodeScanner;
