# QR Code Scanner with Auto-Zoom

QR code scanner demos that automatically zoom in on a tiny or distant QR code, built with [Dynamsoft Barcode Reader JavaScript Edition](https://www.dynamsoft.com/barcode-reader/overview/) (`dynamsoft-barcode-reader-bundle` v11).

https://github.com/tony-xlh/Vanilla-JS-Barcode-Reader-Demos/assets/5462205/aa17838d-47ea-4aa9-9773-c3e8a861486a

## Demos

* [camera enhancer](https://tony-xlh.github.io/Vanilla-JS-Barcode-Reader-Demos/autozoom/index.html). Use [Dynamsoft Camera Enhancer](https://www.dynamsoft.com/capture-vision/docs/core/introduction/?lang=javascript#dynamsoft-camera-enhancer) (bundled in `dbr.bundle.js`) to open the camera and enable built-in auto-zoom with `EF_AUTO_ZOOM`.
* [getUserMedia](https://tony-xlh.github.io/Vanilla-JS-Barcode-Reader-Demos/autozoom/getUserMedia.html). Use WebRTC's `getUserMedia` to open the camera and control zoom directly, based on the QR code location reported by the intermediate results of `CaptureVisionRouter`.

Both demos decode barcodes with the Dynamsoft Barcode Reader bundle:

```html
<script src="https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@11.6.5000/dist/dbr.bundle.js"></script>
```

Check out this repo to learn more about how to control camera zoom with JavaScript: https://github.com/tony-xlh/web-camera-zoom
