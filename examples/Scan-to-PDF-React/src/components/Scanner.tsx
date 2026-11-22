/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react'
import { DDV, EditViewer, PerspectiveViewer, CaptureViewer, UiConfig } from 'dynamsoft-document-viewer';
import "dynamsoft-document-viewer/dist/ddv.css";
import "./Scanner.css";

export interface ScannerProps {
  cameraID?: string;
  onInitialized?: (captureViewer:CaptureViewer,editViewer:EditViewer,perspectiveViewer:PerspectiveViewer) => void;
}

const Scanner: React.FC<ScannerProps> = (props:ScannerProps) => {
  const initializing = useRef(false);
  const initialized = useRef(false);
  const captureViewer = useRef<CaptureViewer|undefined>();
  const editViewer = useRef<EditViewer|undefined>();
  const perspectiveViewer = useRef<PerspectiveViewer|undefined>();
  useEffect(()=>{
    if (initializing.current === false) {
      initializing.current = true;
      init();
    }
  },[])

  const selectCamera = async () => {
    if (initialized.current && captureViewer.current && props.cameraID) {
      await captureViewer.current.getAllCameras();
      await captureViewer.current.selectCamera(props.cameraID);
    }
  }

  useEffect(()=>{
    selectCamera();
  },[props.cameraID, selectCamera])

  const initCaptureViewer = () => {
    const captureViewerUiConfig:UiConfig = {
        type: DDV.Elements.Layout,
        flexDirection: "column",
        children: [
            {
                type: DDV.Elements.Layout,
                className: "ddv-capture-viewer-header-mobile",
                children: [
                    {
                        type: "CameraResolution",
                        className: "ddv-capture-viewer-resolution",
                    },
                    DDV.Elements.Flashlight,
                ],
            },
            DDV.Elements.MainView,
            {
                type: DDV.Elements.Layout,
                className: "ddv-capture-viewer-footer-mobile",
                children: [
                    DDV.Elements.AutoDetect,
                    DDV.Elements.AutoCapture,
                    {
                        type: "Capture",
                        className: "ddv-capture-viewer-captureButton",
                    },
                    {
                        // Bind click event to "ImagePreview" element
                        // The event will be registered later.
                        type: DDV.Elements.ImagePreview,
                        events:{ 
                            click: "showPerspectiveViewer"
                        }
                    },
                    DDV.Elements.CameraConvert,
                ],
            },
        ],
    };
          
    // Create a capture viewer
    captureViewer.current = new DDV.CaptureViewer({
        container: "container",
        uiConfig: captureViewerUiConfig,
        viewerConfig: {
            acceptedPolygonConfidence: 60,
            enableAutoDetect: false,
        }
    });
  }

  const initEditViewer = () => {
    const editViewerUiConfig:UiConfig = {
        type: DDV.Elements.Layout,
        flexDirection: "column",
        className: "ddv-edit-viewer-mobile",
        children: [
            {
                type: DDV.Elements.Layout,
                className: "ddv-edit-viewer-header-mobile",
                children: [
                    {
                        // Add a "Back" buttom to header and bind click event to go back to the perspective viewer
                        // The event will be registered later.
                        type: DDV.Elements.Button,
                        className: "ddv-button-back",
                        events:{
                            click: "backToPerspectiveViewer"
                        }
                    },
                    DDV.Elements.Pagination,
                    DDV.Elements.Download,
                ],
            },
            DDV.Elements.MainView,
            {
                type: DDV.Elements.Layout,
                className: "ddv-edit-viewer-footer-mobile",
                children: [
                    DDV.Elements.DisplayMode,
                    DDV.Elements.RotateLeft,
                    DDV.Elements.Crop,
                    DDV.Elements.Filter,
                    DDV.Elements.Undo,
                    DDV.Elements.Delete,
                    DDV.Elements.Load,
                ],
            },
        ],
    };
    // Create an edit viewer
    editViewer.current = new DDV.EditViewer({
        container: "container",
        groupUid: captureViewer.current!.groupUid,
        uiConfig: editViewerUiConfig
    });
    
    editViewer.current.hide();
  }

  const initPerspectiveViewer = () => {
    const perspectiveUiConfig:UiConfig = {
        type: DDV.Elements.Layout,
        flexDirection: "column",
        children: [
            {
                type: DDV.Elements.Layout,
                className: "ddv-perspective-viewer-header-mobile",
                children: [
                    {
                        // Add a "Back" button in perspective viewer's header and bind the event to go back to capture viewer.
                        // The event will be registered later.
                        type: DDV.Elements.Button,
                        className: "ddv-button-back",
                        events:{
                            click: "backToCaptureViewer"
                        }
                    },
                    DDV.Elements.Pagination,
                    {   
                        // Bind event for "PerspectiveAll" button to show the edit viewer
                        // The event will be registered later.
                        type: DDV.Elements.PerspectiveAll,
                        events:{
                            click: "showEditViewer"
                        }
                    },
                ],
            },
            DDV.Elements.MainView,
            {
                type: DDV.Elements.Layout,
                className: "ddv-perspective-viewer-footer-mobile",
                children: [
                    DDV.Elements.FullQuad,
                    DDV.Elements.RotateLeft,
                    DDV.Elements.RotateRight,
                    DDV.Elements.DeleteCurrent,
                    DDV.Elements.DeleteAll,
                ],
            },
        ],
    };
          
    // Create a perspective viewer
    perspectiveViewer.current = new DDV.PerspectiveViewer({
        container: "container",
        groupUid: captureViewer.current!.groupUid,
        uiConfig: perspectiveUiConfig,
        viewerConfig: {
            scrollToLatest: true,
        }
    });
    
    perspectiveViewer.current.hide();
  }

  const init = async () => {    
    initCaptureViewer();
    initPerspectiveViewer();
    initEditViewer();
    registerEvenets();
    console.log(props.cameraID);
    initialized.current = true;
    if (props.cameraID) {
      await selectCamera();
    }
    captureViewer.current!.play();
    if (props.onInitialized) {
      props.onInitialized(captureViewer.current!,editViewer.current!,perspectiveViewer.current!);
    }
  }

  const registerEvenets = () => {
    // Register an event in `captureViewer` to show the perspective viewer
    captureViewer.current!.on("showPerspectiveViewer" as any,() => {
      switchViewer(0,1,0);
    });
        
    // Register an event in `perspectiveViewer` to go back the capture viewer
    perspectiveViewer.current!.on("backToCaptureViewer" as any,() => {
      switchViewer(1,0,0);
      captureViewer.current!.play().catch(err => {alert(err.message)});
    });

    // Register an event in `perspectiveViewer` to show the edit viewer
    perspectiveViewer.current!.on("showEditViewer" as any,() => {
      switchViewer(0,0,1)
    });
        
    // Register an event in `editViewer` to go back the perspective viewer
    editViewer.current!.on("backToPerspectiveViewer" as any,() => {
      switchViewer(0,1,0);
    });

    // Define a function to control the viewers' visibility
    const switchViewer = (c:number,p:number,e:number) => {
      captureViewer.current!.hide();
      perspectiveViewer.current!.hide();
      editViewer.current!.hide();

      if(c) {
        captureViewer.current!.show();
      } else {
        captureViewer.current!.stop();
      }
            
      if(p) perspectiveViewer.current!.show();
      if(e) editViewer.current!.show();
    };

  }

  return (
    <div id="container"></div>
  )
};

export default Scanner;