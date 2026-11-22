// Barcode Scanner PWA — powered by Dynamsoft Barcode Reader Bundle (Capture Vision)
// Learn more: https://www.dynamsoft.com/barcode-reader/sdk-javascript/

const DEFAULT_TEMPLATE = 'ReadBarcodes_Default';
// Replace this with your own license key.
// Get a free trial: https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform
const LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';

const CAPTURE_INTERVAL = 180; // ms between camera frames scanned

// ---- Element references ---------------------------------------------------
const video = document.getElementById('cameraView');
const wrapper = document.getElementById('cameraViewWrap');
const cameraOverlay = document.getElementById('overlay');
const cameraStatus = document.getElementById('cameraStatus');
const cameraSelect = document.getElementById('cameraSelect');
const torchBtn = document.getElementById('torchBtn');
const resultList = document.getElementById('resultList');
const resultPlaceholder = document.getElementById('resultPlaceholder');
const scanCount = document.getElementById('scanCount');
const clearResultsBtn = document.getElementById('clearResults');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const imageView = document.getElementById('imageView');
const imageWrap = document.getElementById('imageWrap');
const imageOverlay = document.getElementById('imageOverlay');
const imageResultList = document.getElementById('imageResultList');
const imageResultPlaceholder = document.getElementById('imageResultPlaceholder');
const imageCount = document.getElementById('imageCount');
const clearImageResultsBtn = document.getElementById('clearImageResults');

let cvr = null;               // CaptureVisionRouter instance
let stream = null;            // active camera MediaStream
let track = null;             // active camera video track (for torch)
let isScanning = false;
let cameraAnimFrame = null;
let lastCapture = 0;
let capturing = false;  // true while a camera frame capture is in flight
let currentDeviceId = null;

// Reusable frame buffer so we don't allocate a new canvas on every camera frame.
const scanCanvas = document.createElement('canvas');
// Serializes cvr.capture() calls — the router does not support concurrent captures,
// which previously caused the image-scan to fail after a camera scan.
let captureLock = false;
// Cached overlay sizing; only re-size the canvas when the video/container changes.
let lastOverlaySize = { w: 0, h: 0, vw: 0, vh: 0 };

const cameraResults = [];     // unique [format] text strings detected on camera
let imageResults = [];        // unique [format] text strings detected on the current image

const cameraRenderer = new OverlayRenderer(cameraOverlay);
const imageRenderer = new OverlayRenderer(imageOverlay);

// ---- Initialization -------------------------------------------------------
async function init() {
  try {
    await initLicense();
    setStatus(cameraStatus, 'Ready');
    await initCamera();
  } catch (ex) {
    console.error(ex);
    setStatus(cameraStatus, 'Failed to load SDK: ' + ex.message);
    resultPlaceholder.textContent = 'SDK init failed — check the console for details.';
  }
}

async function initLicense() {
  if (typeof Dynamsoft === 'undefined') {
    throw new Error('Dynamsoft SDK not loaded. Check your network connection.');
  }
  // Load the license manager and the core module with the 'DBR' engine.
  await Dynamsoft.License.LicenseManager.initLicense(LICENSE_KEY, true);
  await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
  cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
}

// ---- Camera ---------------------------------------------------------------
async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus(cameraStatus, 'Camera is not supported by this browser.');
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    cameraSelect.innerHTML = '';
    if (videoDevices.length === 0) {
      setStatus(cameraStatus, 'No camera found.');
      return;
    }
    videoDevices.forEach((device, i) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || ('Camera ' + (i + 1));
      cameraSelect.appendChild(option);
    });
    await startCamera(cameraSelect.value);
    cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
  } catch (ex) {
    console.error(ex);
    setStatus(cameraStatus, 'Cannot access camera: ' + ex.message);
  }
}

async function startCamera(deviceId) {
  stopCamera();
  currentDeviceId = deviceId;
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'environment'
    },
    audio: false
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    await video.play();
    setStatus(cameraStatus, 'Scanning…');
    updateTorchButton();
    isScanning = true;
    // Force the overlay to re-measure for this video stream.
    lastOverlaySize = { w: 0, h: 0, vw: 0, vh: 0 };
    // Size the overlay once we know the video dimensions.
    if (video.videoWidth) {
      sizeOverlayForVideo();
    } else {
      video.addEventListener('loadedmetadata', sizeOverlayForVideo, { once: true });
    }
    requestCameraFrame();
  } catch (ex) {
    console.error(ex);
    setStatus(cameraStatus, 'Failed to open camera: ' + ex.message);
  }
}

async function captureWithLock(source) {
  while (captureLock) {
    await new Promise((r) => setTimeout(r, 40));
  }
  captureLock = true;
  try {
    return await cvr.capture(source, DEFAULT_TEMPLATE);
  } finally {
    captureLock = false;
  }
}

function sizeOverlayForVideo() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  // Keep the scan frame hugging the video (object-fit: contain stays a fallback).
  wrapper.style.aspectRatio = vw + ' / ' + vh;
  const cw = wrapper.clientWidth;
  const ch = wrapper.clientHeight;
  if (cw && ch &&
      lastOverlaySize.w === cw && lastOverlaySize.h === ch &&
      lastOverlaySize.vw === vw && lastOverlaySize.vh === vh) {
    return; // dimensions unchanged — keep the existing canvas
  }
  lastOverlaySize = { w: cw, h: ch, vw, vh };
  cameraRenderer.setContentSize(vw, vh, cw, ch);
}

function stopCamera() {
  isScanning = false;
  if (cameraAnimFrame) {
    cancelAnimationFrame(cameraAnimFrame);
    cameraAnimFrame = null;
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    track = null;
  }
}

function requestCameraFrame() {
  if (!isScanning) return;
  cameraAnimFrame = requestAnimationFrame(requestCameraFrame);
  const now = performance.now();
  if (now - lastCapture < CAPTURE_INTERVAL) return;
  lastCapture = now;
  scanCameraFrame();
}

async function scanCameraFrame() {
  if (capturing) return;                // skip this frame if a capture is still running
  if (!cvr || !video.videoWidth) return;
  if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

  capturing = true;
  try {
    // Reuse a single offscreen canvas instead of allocating one per frame.
    scanCanvas.width = video.videoWidth;
    scanCanvas.height = video.videoHeight;
    scanCanvas.getContext('2d').drawImage(video, 0, 0);

    sizeOverlayForVideo();
    const result = await captureWithLock(scanCanvas);
    // If scanning was stopped while we were capturing, ignore the stale result.
    if (!isScanning) return;
    renderCameraResults(result);
  } catch (ex) {
    console.error(ex);
  } finally {
    capturing = false;
  }
}

function renderCameraResults(result) {
  cameraRenderer.clear();
  const items = result.items || [];
  let liveCount = 0;
  for (const item of items) {
    if (item.type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) continue;
    const format = item.formatString || 'Unknown';
    const text = item.text;
    const key = '[' + format + '] ' + text;
    liveCount++;
    if (!cameraResults.includes(key)) {
      cameraResults.push(key);
    }
    const points = item.location ? item.location.points : null;
    if (points) cameraRenderer.drawBarcode(points, format);
  }
  updateResultList(cameraResults, resultList, resultPlaceholder, scanCount);
  cameraStatus.textContent = liveCount > 0 ? ('Found ' + liveCount + ' barcode' + (liveCount > 1 ? 's' : '')) : 'Scanning…';
}

// ---- Torch ----------------------------------------------------------------
async function updateTorchButton() {
  if (!track) return;
  let hasTorch = false;
  try {
    const cap = track.getCapabilities();
    hasTorch = !!(cap && cap.torch);
  } catch (e) { /* torch unavailable */ }
  torchBtn.hidden = !hasTorch;
  torchBtn.classList.toggle('active', track.getSettings().torch === true);
}

async function toggleTorch() {
  if (!track) return;
  const current = track.getSettings().torch;
  try {
    await track.applyConstraints({ advanced: [{ torch: !current }] });
  } catch (ex) {
    console.error(ex);
  }
  torchBtn.classList.toggle('active', !current);
}

// ---- Image scanning -------------------------------------------------------
function setupDropzone() {
  const handleFiles = (files) => {
    if (files && files.length > 0) scanImage(files[0]);
  };

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  // Paste support — paste an image from the clipboard anywhere on the page.
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        scanImage(item.getAsFile());
        break;
      }
    }
  });
}

async function scanImage(file) {
  if (!cvr) return;
  // Reset the previous image/result and hide the viewer until the new image loads.
  imageWrap.hidden = true;
  imageResults = [];
  imageRenderer.clear();
  imageResultPlaceholder.textContent = 'Scanning…';
  updateResultList(imageResults, imageResultList, imageResultPlaceholder, imageCount);

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    imageView.onload = async () => {
      imageWrap.hidden = false;
      imageRenderer.setContentSize(
        imageView.naturalWidth, imageView.naturalHeight,
        imageWrap.clientWidth, imageWrap.clientHeight
      );
      imageRenderer.clear();
      try {
        // Serialize with the camera loop so this image scan never collides with it.
        const result = await captureWithLock(dataUrl);
        imageRenderer.clear();
        const items = result.items || [];
        for (const item of items) {
          if (item.type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE) continue;
          const format = item.formatString || 'Unknown';
          const text = item.text;
          const key = '[' + format + '] ' + text;
          if (!imageResults.includes(key)) imageResults.push(key);
          const points = item.location ? item.location.points : null;
          if (points) imageRenderer.drawBarcode(points, format);
        }
        updateResultList(imageResults, imageResultList, imageResultPlaceholder, imageCount);
        if (imageResults.length === 0) imageResultPlaceholder.textContent = 'No barcode found in this image.';
      } catch (ex) {
        console.error(ex);
        imageResultPlaceholder.textContent = 'Scan failed: ' + ex.message;
      }
    };
    imageView.onerror = () => {
      imageWrap.hidden = true;
      imageResultPlaceholder.textContent = 'Could not read the selected file.';
    };
    imageView.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

// ---- Result list rendering ------------------------------------------------
function updateResultList(results, listEl, placeholderEl, countEl) {
  listEl.innerHTML = '';
  if (results.length === 0) {
    placeholderEl.hidden = false;
  } else {
    placeholderEl.hidden = true;
    for (const key of results) {
      const li = document.createElement('li');
      const idx = key.indexOf(']');
      const fmt = key.slice(0, idx + 1);
      const text = key.slice(idx + 2);
      const span = document.createElement('span');
      span.className = 'result-format';
      span.textContent = fmt;
      li.appendChild(span);
      li.appendChild(document.createTextNode(text));
      listEl.appendChild(li);
    }
  }
  if (countEl) countEl.textContent = results.length;
}

// ---- Tabs -----------------------------------------------------------------
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('tab-active', t === tab));
      const target = tab.dataset.tab;
      const cameraPanel = document.getElementById('cameraPanel');
      const imagePanel = document.getElementById('imagePanel');
      if (target === 'camera') {
        imagePanel.hidden = true;
        cameraPanel.hidden = false;
        // Restart the camera if it was paused while on the image tab.
        if (cameraSelect.value) startCamera(cameraSelect.value);
      } else {
        cameraPanel.hidden = true;
        imagePanel.hidden = false;
        stopCamera(); // release the camera while scanning images
      }
    });
  });
}

// ---- Install prompt (beforeinstallprompt) ---------------------------------
let deferredInstallPrompt = null;
function setupInstallPrompt() {
  const installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    deferredInstallPrompt = null;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
}

// ---- Service worker -------------------------------------------------------
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => console.error('SW register failed:', err));
  }
}

function setStatus(el, text) {
  el.textContent = text;
}

// ---- Boot -----------------------------------------------------------------
function boot() {
  setupTabs();
  setupDropzone();
  setupInstallPrompt();
  setupServiceWorker();
  clearResultsBtn.addEventListener('click', () => {
    cameraResults.length = 0;
    cameraRenderer.clear();
    updateResultList(cameraResults, resultList, resultPlaceholder, scanCount);
  });
  clearImageResultsBtn.addEventListener('click', () => {
    imageResults = [];
    imageRenderer.clear();
    updateResultList(imageResults, imageResultList, imageResultPlaceholder, imageCount);
  });
  torchBtn.addEventListener('click', toggleTorch);
  init();
}

document.addEventListener('DOMContentLoaded', boot);
