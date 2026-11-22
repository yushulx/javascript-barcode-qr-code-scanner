<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {init as initDynamsoft, initDocDetectModule} from './dynamsoft.config';
import Scanner from './components/Scanner.vue';
import { listCameras, requestCameraPermission } from './CamUtils';

const initializing = ref(false);
const initialized = ref(false);
const isScanning = ref(false);
const selectedCamera = ref('');
const cameras = ref<MediaDeviceInfo[]>([]);

const toggleScanning = () => {
  console.log("toggleScanning")
  isScanning.value = !isScanning.value;
}

onMounted(()=>{
  if (!initializing.value && !initialized.value) {
    initializing.value = true;
    initialize();
  }
})

const initialize = async () => {
  try {
    await requestCameraPermission();
    cameras.value = await listCameras();
    if (cameras.value.length>0) {
      selectedCamera.value = cameras.value[0].deviceId;
    }
  } catch (error) {
    alert("No cameras attached");
  }
  await initDynamsoft();
  await initDocDetectModule();
  initialized.value = true;
}

</script>

<template>
  <h1>Scan to PDF</h1>
  <div>
    <label>
      Camera:
      <select 
        v-model="selectedCamera"
      >
        <option v-for="(camera,index) in cameras" :key="index" :value="camera.deviceId">{{camera.label}}</option>
      </select>
    </label>
  </div>
  <button v-on:click="toggleScanning" v-if="initialized">
    {{isScanning ? "Stop Scanning" : "Start Scanning"}}
  </button>
  <div v-if="!initialized">Initializing...</div>
  <div id="scanner" v-if="isScanning">
    <Scanner :cameraID="selectedCamera"></Scanner>
  </div>
  <div style="margin-top:2em">
    Powered by <a href='https://www.dynamsoft.com' target='_blank'>Dynamsoft</a>
  </div>
</template>

<style scoped>
#scanner {
  position: relative;
  width: 100%;
  height: 480px;
}
</style>
