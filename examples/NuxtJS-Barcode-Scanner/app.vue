<template>
  <div id="app">
    <h2>Barcode Scanner in Nuxt.js</h2>
    <button @click="toggleMounted">{{ mounted ? "Unmount":"Mount" }}</button>
    <button v-if="initialized" @click="toggleScanning">{{ scanning ? "Stop Scanning":"Start Scanning" }}</button>
    <span v-if="!initialized">Initializing...</span>
    <div class="container" v-if="mounted">
      <ClientOnly fallback-tag="span" fallback="Loading barcode scanner...">
        <BarcodeScanner ref="scanner" @initialized="onInitialized" @scanned="onScanned"></BarcodeScanner>
      </ClientOnly>
    </div>
    <div>
      <div>
        Results:
      </div>
      <ol>
        <li v-for="(barcode,index) in scannedBarcodes" :key="'barcode-'+index">{{ barcode.formatString + ": " + barcode.text }}</li>
      </ol>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { BarcodeResultItem } from 'dynamsoft-barcode-reader-bundle';
import BarcodeScanner from './components/BarcodeScanner.vue';
const scanner = ref();
const initialized = ref(false);
const scanning = ref(false);
const scannedBarcodes = ref<BarcodeResultItem[]>([])
const mounted = ref(true);
const onInitialized = () => {
  initialized.value = true;
}

const onScanned = (barcodes:BarcodeResultItem[]) => {
  if (barcodes.length>0) {
    scannedBarcodes.value = barcodes;
  }
}

const toggleScanning = () => {
  if (scanner.value) {
    scanning.value = !scanning.value;
    if (scanning.value) {
      scanner.value.start();
    }else{
      scanner.value.stop();
    }
  }else{
    alert("Not mounted");
  }
}

const toggleMounted = () => {
  if (!mounted.value === true) {
    initialized.value = false;
  }
  scanning.value = false;
  mounted.value = !mounted.value;
}

</script>

<style lang="css" scoped>
.container {
  position: relative;
  width: 360px;
  height: 360px;
}
</style>