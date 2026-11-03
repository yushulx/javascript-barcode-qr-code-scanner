<script setup lang="ts">
import { DDV, EditViewer, PerspectiveViewer, CaptureViewer, UiConfig } from 'dynamsoft-document-viewer';
import "dynamsoft-document-viewer/dist/ddv.css";
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ cameraID?: string }>()

const initializing = ref(false);
const initialized = ref(false);
let captureViewer:CaptureViewer|undefined;
let editViewer:EditViewer|undefined;
let perspectiveViewer:PerspectiveViewer|undefined;
onMounted(() => {
  if (initializing.value === false) {
    initializing.value = true;
    init();
  }
})

const selectCamera = async () => {
  if (initialized.value && captureViewer && props.cameraID) {
    await captureViewer.getAllCameras();
    await captureViewer.selectCamera(props.cameraID);
  }
}

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
  captureViewer = new DDV.CaptureViewer({
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
  editViewer = new DDV.EditViewer({
      container: "container",
      groupUid: captureViewer!.groupUid,
      uiConfig: editViewerUiConfig
  });
  
  editViewer.hide();
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
  perspectiveViewer = new DDV.PerspectiveViewer({
      container: "container",
      groupUid: captureViewer!.groupUid,
      uiConfig: perspectiveUiConfig,
      viewerConfig: {
          scrollToLatest: true,
      }
  });
  
  perspectiveViewer.hide();
}

const registerEvenets = () => {
  // Register an event in `captureViewer` to show the perspective viewer
  captureViewer!.on("showPerspectiveViewer" as any,() => {
    switchViewer(0,1,0);
  });
      
  // Register an event in `perspectiveViewer` to go back the capture viewer
  perspectiveViewer!.on("backToCaptureViewer" as any,() => {
    switchViewer(1,0,0);
    captureViewer!.play().catch(err => {alert(err.message)});
  });

  // Register an event in `perspectiveViewer` to show the edit viewer
  perspectiveViewer!.on("showEditViewer" as any,() => {
    switchViewer(0,0,1)
  });
      
  // Register an event in `editViewer` to go back the perspective viewer
  editViewer!.on("backToPerspectiveViewer" as any,() => {
    switchViewer(0,1,0);
  });

  // Define a function to control the viewers' visibility
  const switchViewer = (c:number,p:number,e:number) => {
    captureViewer!.hide();
    perspectiveViewer!.hide();
    editViewer!.hide();

    if(c) {
      captureViewer!.show();
    } else {
      captureViewer!.stop();
    }
          
    if(p) perspectiveViewer!.show();
    if(e) editViewer!.show();
  };
}

const init = async () => {    
  initCaptureViewer();
  initPerspectiveViewer();
  initEditViewer();
  registerEvenets();
  initialized.value = true;
  await selectCamera();
  captureViewer!.play();
}

watch(() => props.cameraID,()=>{
	selectCamera();
})

</script>

<template>
  <div id="container"></div>
</template>

<style scoped>
#container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
