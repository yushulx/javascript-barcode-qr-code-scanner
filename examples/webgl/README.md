# JavaScript Barcode and QR Code Reader: WebGL vs. Canvas
Compare WebGL grayscale conversion with canvas color frames before `CaptureVisionRouter.capture()`. Grayscale decode can be slightly faster; `gl.readPixels()` is usually slower than canvas `getImageData()`, including on phones. Measure total time on the device you ship.

This sample uses the [dynamsoft-barcode-reader-bundle](https://www.npmjs.com/package/dynamsoft-barcode-reader-bundle) package (SDK v10+/v11 API). See the [simple_barcode_scanner](../simple_barcode_scanner/) example for another usage of the same package.

## License Activation
Get a [trial license](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform) to activate the [JavaScript barcode SDK](https://www.dynamsoft.com/barcode-reader/sdk-javascript/):

```javascript
Dynamsoft.License.LicenseManager.initLicense("LICENSE-KEY");
```

## Try Example
[https://yushulx.me/javascript-barcode-qr-code-scanner/examples/webgl/](https://yushulx.me/javascript-barcode-qr-code-scanner/examples/webgl/)

![WebGL for JavaScript barcode](https://www.dynamsoft.com/codepool/wp-content/uploads/2020/07/webgl-javascript-barcode.png)

## References
- https://webglfundamentals.org/webgl/lessons/webgl-2d-drawimage.html
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
- https://www.npmjs.com/package/dynamsoft-barcode-reader-bundle

## Blog
[How to Use WebGL to Accelerate Web Barcode Decoding Speed](https://www.dynamsoft.com/codepool/webgl-accelerate-web-barcode-decoding-speed.html)
