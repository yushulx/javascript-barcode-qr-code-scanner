/* Adapter contract test with a mocked CaptureVisionRouter; no decoding claim. */
'use strict';
const assert = require('node:assert/strict');

global.window = global;
global.location = { hostname: 'localhost' };
global.DemoAnalytics = { action() {}, ready() {} };
global.POSEngine = require('./pos-engine.js');

let capturedImage = null;
let nextItems = [];
const router = {
  async getSimplifiedSettings() { return { barcodeSettings: {} }; },
  async updateSettings() {},
  async capture(image, preset) {
    capturedImage = { image, preset };
    return { items: nextItems };
  }
};
global.Dynamsoft = {
  License: { LicenseManager: { async initLicense() {} } },
  Core: { CoreModule: { async loadWasm() {} } },
  CVR: { CaptureVisionRouter: { async createInstance() { return router; } } },
  DBR: { EnumBarcodeFormat: { BF_EAN_13: 1n, BF_QR_CODE: 2n } }
};
require('./sdk-decoder.js');

const canvas = {
  width: 2,
  height: 1,
  getContext() {
    return { getImageData() { return { data: new Uint8ClampedArray(8) }; } };
  }
};

(async () => {
  nextItems = [
    { type: 2, formatString: 'EAN_13', text: '9506000134352' },
    { type: 2, formatString: 'QR_CODE', text: 'https://example.com/01/09506000134352/10/B17?17=271231' }
  ];
  const observations = await POSSDKDecoder.decodeCanvas(canvas, 'sdk-test');
  assert.equal(observations.length, 2);
  assert.equal(observations[0].rawText, nextItems[0].text);
  assert.equal(observations[1].rawText, nextItems[1].text);
  assert.ok(observations.every(item => item.origin === 'sdk-image'));
  assert.ok(observations.every(item => item.presentationId === 'sdk-test'));
  assert.equal(capturedImage.preset, 'ReadBarcodes_Balance');
  assert.equal(capturedImage.image.width, 2);
  assert.equal(capturedImage.image.stride, 8);
  assert.equal(capturedImage.image.format, 10);

  nextItems = [];
  const empty = await POSSDKDecoder.decodeCanvas(canvas, 'sdk-empty');
  assert.deepEqual(empty, []);
  console.log('PASS SDK-ADAPTER  genuine result mapping, RGBA input, origin and empty-result contracts (mocked router)');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
