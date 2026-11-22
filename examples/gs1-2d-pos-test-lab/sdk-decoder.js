/* Dynamsoft Capture Vision Router adapter. Every returned observation is an SDK result. */
(function () {
  'use strict';

  var BOUND_HOSTS = ['dynamsoft.com'];
  var CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
  var TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';
  var PRESET = 'ReadBarcodes_Balance';
  var router = null;
  var initPromise = null;

  function resolveLicenseKey() {
    var host = window.location.hostname.toLowerCase();
    var bound = BOUND_HOSTS.some(function (domain) { return host === domain || host.endsWith('.' + domain); });
    if (bound) return CODEPOOL_LICENSE_KEY;
    if (window.DemoAnalytics) window.DemoAnalytics.action('license_fallback', { host: host });
    return TRIAL_LICENSE_KEY;
  }

  function ensureBundle() {
    if (window.Dynamsoft && Dynamsoft.CVR) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-pos-dcv-bundle]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () { reject(new Error('The Dynamsoft SDK bundle could not be downloaded.')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/dynamsoft-capture-vision-bundle@3.6.5000/dist/dcv.bundle.min.js';
      script.async = true;
      script.dataset.posDcvBundle = 'true';
      script.onload = resolve;
      script.onerror = function () { reject(new Error('The Dynamsoft SDK bundle could not be downloaded.')); };
      document.head.appendChild(script);
    });
  }

  async function init() {
    if (router) return router;
    if (initPromise) return initPromise;
    initPromise = (async function () {
      await ensureBundle();
      if (!window.Dynamsoft || !Dynamsoft.CVR) throw new Error('The Dynamsoft SDK bundle did not initialize.');
      await Dynamsoft.License.LicenseManager.initLicense(resolveLicenseKey(), true);
      await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
      var instance = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
      var settings = await instance.getSimplifiedSettings(PRESET);
      var formats = Dynamsoft.DBR.EnumBarcodeFormat;
      if (formats && settings.barcodeSettings) {
        settings.barcodeSettings.barcodeFormatIds = formats.BF_EAN_13 | formats.BF_QR_CODE;
        await instance.updateSettings(PRESET, settings);
      }
      router = instance;
      if (window.DemoAnalytics) window.DemoAnalytics.ready(0);
      return router;
    })().catch(function (error) {
      initPromise = null;
      router = null;
      throw error;
    });
    return initPromise;
  }

  function toDsImageData(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      bytes: new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.length),
      width: canvas.width,
      height: canvas.height,
      stride: canvas.width * 4,
      format: 10
    };
  }

  function barcodeItemsFrom(result) {
    if (!result) return [];
    if (Array.isArray(result.items)) {
      var typed = result.items.filter(function (item) {
        return item && (item.type === 2 || item.type === 'CRIT_BARCODE' || typeof item.formatString === 'string');
      });
      if (typed.length) return typed;
    }
    if (result.decodedBarcodesResult && Array.isArray(result.decodedBarcodesResult.barcodeResultItems)) {
      return result.decodedBarcodesResult.barcodeResultItems;
    }
    return Array.isArray(result.barcodeResultItems) ? result.barcodeResultItems : [];
  }

  async function decodeCanvas(canvas, presentationId) {
    var instance = await init();
    var result = await instance.capture(toDsImageData(canvas), PRESET);
    return barcodeItemsFrom(result).map(function (item, index) {
      return window.POSEngine.createObservation({
        observationId: presentationId + '-sdk-' + (index + 1),
        presentationId: presentationId,
        origin: 'sdk-image',
        format: item.formatString || String(item.format || 'UNKNOWN'),
        rawText: item.text,
        decodedAtMs: 0
      });
    });
  }

  function loadFileCanvas(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\/(png|jpeg|jpg|webp|bmp|gif)$/i.test(file.type)) {
        reject(new Error('Choose a PNG, JPG, WebP, BMP or GIF image.'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('The image file could not be read.')); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error('The image could not be decoded.')); };
        image.onload = function () {
          var scale = Math.min(1, 4000 / image.naturalWidth);
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function decodeFile(file, presentationId) {
    var canvas = await loadFileCanvas(file);
    var observations = await decodeCanvas(canvas, presentationId);
    return { canvas: canvas, observations: observations };
  }

  async function dispose() {
    if (router && typeof router.dispose === 'function') await router.dispose();
    router = null;
    initPromise = null;
  }

  window.POSSDKDecoder = {
    init: init,
    decodeCanvas: decodeCanvas,
    decodeFile: decodeFile,
    dispose: dispose
  };
})();
