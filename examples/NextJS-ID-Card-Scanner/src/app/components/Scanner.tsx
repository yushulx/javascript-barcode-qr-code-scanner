import { MutableRefObject, useEffect, useRef, useState } from 'react';
import './Scanner.css';
import { BarcodeResultItem, CameraEnhancer, CaptureVisionRouter, CameraView, DCEFrame, CodeParser, DeskewedImageResultItem, DetectedQuadResultItem, EnumBarcodeFormat, EnumCapturedResultItemType, TextLineResultItem } from 'dynamsoft-capture-vision-bundle';
import SVGOverlay from './SVGOverlay';
import { intersectionOverUnion } from '@/utils';
import { mrzTemplateUrl } from '../dcv';

export interface HolderInfo {
  lastName:string;
  firstName:string;
  birthDate:string;
  sex:string;
  docNumber:string;
}

export interface ScannerProps {
  onScanned?: (blob:Blob,info?:HolderInfo) => void;
  onStopped?: () => void;
}

const Scanner: React.FC<ScannerProps> = (props:ScannerProps) => {
  const [quadResultItem,setQuadResultItem] = useState<DetectedQuadResultItem|undefined>()
  let container: MutableRefObject<HTMLDivElement | null> = useRef(null);
  let router: MutableRefObject<CaptureVisionRouter | null> = useRef(null);
  let dce: MutableRefObject<CameraEnhancer | null> = useRef(null);
  let view: MutableRefObject<CameraView | null> = useRef(null);
  const interval = useRef<any>();
  const isSteady = useRef(false);
  const [viewBox,setViewBox] = useState("0 0 720 1280");
  const detecting = useRef(false);
  const previousResults = useRef<DetectedQuadResultItem[]>([])
  let initializing = useRef(false);
  useEffect((): any => {
    const init = async () => {
      if (initializing.current) {
        return;
      }
      try {
        view.current = await CameraView.createInstance(container.current!);
        dce.current = await CameraEnhancer.createInstance(view.current);
        dce.current.setResolution({width:1920,height:1080});
        dce.current.on("played",async function(){
          await updateViewBox();
          startScanning();  
        })
        router.current = await CaptureVisionRouter.createInstance();
        await dce.current.open();
      } catch (ex: any) {
        let errMsg = ex.message || ex;
        console.error(errMsg);
        alert(errMsg);
      }
    }
    
    init();
    initializing.current = true;

    return async () => {
      stopScanning();
      router.current?.dispose();
      dce.current?.dispose();
      console.log('Scanner Component Unmount');
    }
  }, []);

  const updateViewBox = async () => {
    let res = dce.current?.getResolution();
    let box = "0 0 "+res?.width+" "+res?.height;
    console.log(box);
    setViewBox(box);
  }

  const startScanning = async () => {
    stopScanning();
    if (!interval.current) {
      interval.current = setInterval(captureAndDetect,150);
    }
  }
  
  const stopScanning = () => {
    clearInterval(interval.current);
    interval.current = null;
  }
  
  const captureAndDetect = async () => {
    if (detecting.current === true) {
      return;
    }
    if (!router.current || !dce.current) {
      return;
    } 
    if (isSteady.current) {
      return;
    }
    console.log("capture and detect");
    let results:DetectedQuadResultItem[] = [];
    detecting.current = true;
    try {
      let image = dce.current.fetchImage();
      let capturedResult = await router.current?.capture(image,"DetectDocumentBoundaries_Default");
      if (capturedResult) {
        results = capturedResult.items.filter(
          (item) => item.type === EnumCapturedResultItemType.CRIT_DETECTED_QUAD
        ) as DetectedQuadResultItem[];
      }
      console.log(results);
      if (results.length>0) {
        setQuadResultItem(results[0]);
        checkIfSteady(results,image);
      }else{
        setQuadResultItem(undefined);
      }
    } catch (error) {
      console.log(error);
    }
    detecting.current = false;
  }

  const checkIfSteady = async (results:DetectedQuadResultItem[],image:DCEFrame) => {
    if (results.length>0 && router.current) {
      let result = results[0];
      if (previousResults.current.length >= 3) {
        if (steady() == true) {
          console.log("steady");
          isSteady.current = true;
          let newSettings = await router.current.getSimplifiedSettings("NormalizeDocument_Default");
          newSettings.roiMeasuredInPercentage = false;
          newSettings.roi.points = results[0].location.points;
          await router.current.updateSettings("NormalizeDocument_Default", newSettings);
          let result = await router.current.capture(image,"NormalizeDocument_Default");
          let normalizedImages = result.items.filter(
            (item) => item.type === EnumCapturedResultItemType.CRIT_DESKEWED_IMAGE
          ) as DeskewedImageResultItem[];
          if (normalizedImages.length > 0) {
            if (props.onScanned) {
              stopScanning();
              let blob = await normalizedImages[0].toBlob("image/png");
              let info = await extractInfo(blob);
              props.onScanned(blob,info);
            }
          }
        }else{
          console.log("shift and add result");
          previousResults.current.shift();
          previousResults.current.push(result);
        }
      }else{
        console.log("add result");
        previousResults.current.push(result);
      }
    }
  }

  const extractInfo = async (blob:Blob) => {
    let parser = await CodeParser.createInstance();
    await router.current?.resetSettings();
    let result = await router.current?.capture(blob,"ReadBarcodes_Balance");
    console.log(result);
    let barcodes = result ? result.items.filter(
      (item) => item.type === EnumCapturedResultItemType.CRIT_BARCODE
    ) as BarcodeResultItem[] : [];
    if (barcodes.length > 0) {
      for (let index = 0; index < barcodes.length; index++) {
        const item = barcodes[index];
        if (item.format != EnumBarcodeFormat.BF_PDF417) {
          continue;
        }
        let parsedItem = await parser.parse(item.text);
        console.log(parsedItem);
        if (parsedItem.codeType === "AAMVA_DL_ID") {
          let number = parsedItem.getFieldValue("licenseNumber");
          let firstName = parsedItem.getFieldValue("firstName");
          let lastName = parsedItem.getFieldValue("lastName");
          let birthDate = parsedItem.getFieldValue("birthDate");
          let sex = parsedItem.getFieldValue("sex");
          let info:HolderInfo = {
            firstName:firstName,
            lastName:lastName,
            docNumber:number,
            birthDate:birthDate,
            sex:sex
          };
          return info;
        }
      }
    }

    await router.current?.initSettings(mrzTemplateUrl);
    result = await router.current?.capture(blob,"ReadMRZ");
    let textLines = result ? result.items.filter(
      (item) => item.type === EnumCapturedResultItemType.CRIT_TEXT_LINE
    ) as TextLineResultItem[] : [];
    if (textLines.length > 0) {
      let parsedItem = await parser.parse(textLines[0].text);
      console.log(parsedItem);
      if (parsedItem.codeType.indexOf("MRTD") != -1) {
        let number = parsedItem.getFieldValue("documentNumber");
        if (!number) {
          number = parsedItem.getFieldValue("passportNumber");
        }
        let firstName = parsedItem.getFieldValue("primaryIdentifier");
        let lastName = parsedItem.getFieldValue("secondaryIdentifier");
        let birthDate = parsedItem.getFieldValue("dateOfBirth");
        let sex = parsedItem.getFieldValue("sex");
        let info:HolderInfo = {
          firstName:firstName,
          lastName:lastName,
          docNumber:number,
          birthDate:birthDate,
          sex:sex
        };
        return info;
      }
    }

  }

  const steady = () => {
    if (previousResults.current[0] && previousResults.current[1] && previousResults.current[2]) {
      let iou1 = intersectionOverUnion(previousResults.current[0].location.points,previousResults.current[1].location.points);
      let iou2 = intersectionOverUnion(previousResults.current[1].location.points,previousResults.current[2].location.points);
      let iou3 = intersectionOverUnion(previousResults.current[2].location.points,previousResults.current[0].location.points);
      if (iou1>0.9 && iou2>0.9 && iou3>0.9) {
        return true;
      }else{
        return false;
      }
    }
    return false;
  }

  const switchCamera = async () => {
    if (dce.current) {
      let currentCamera = dce.current.getSelectedCamera();
      let cameras = await dce.current.getAllCameras();
      let currentCameraIndex = cameras.indexOf(currentCamera);
      let desiredIndex = 0
      if (currentCameraIndex < cameras.length - 1) {
        desiredIndex = currentCameraIndex + 1;
      }
      await dce.current.selectCamera(cameras[desiredIndex]);
    }
  }

  const close = async () => {
    stopScanning();
    if (props.onStopped) {
      props.onStopped();
    }
  }

  return (
    <div className="scanner-container" ref={container}>
      <div className="dce-video-container"></div>
      {quadResultItem &&
        <SVGOverlay viewBox={viewBox} quad={quadResultItem}></SVGOverlay>
      }
      <div className="header">
        <div className="switchButton" onClick={switchCamera}>
          <img className="icon" src="/switch.svg" alt="switch"/>
        </div>
        <div className="closeButton" onClick={close}>
          <img className="icon" src="/cross.svg" alt="close"/>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
