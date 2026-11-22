async function initDocDetectModule(DDV, CVR) {
  const router = await CVR.CaptureVisionRouter.createInstance();
  class DDNNormalizeHandler extends DDV.DocumentDetect {
    async detect(image, config) {
      if (!router) {
        return Promise.resolve({
          success: false
        });
      };

      let width = image.width;
      let height = image.height;
      let ratio = 1;
      let data;

      if (height > 720) {
        ratio = height / 720;
        height = 720;
        width = Math.floor(width / ratio);
        data = compress(image.data, image.width, image.height, width, height);
      } else {
        data = image.data.slice(0);
      }


      // Define DSImage according to the usage of DDN
      const DSImage = {
        bytes: new Uint8Array(data),
        width,
        height,
        stride: width * 4, //RGBA
        format: 10 // IPF_ABGR_8888
      };

      // Use DDN normalized module
      const results = await router.capture(DSImage, 'DetectDocumentBoundaries_Default');

      // Filter the results and generate corresponding return values
      if (results.items.length <= 0) {
        return Promise.resolve({
          success: false
        });
      };

      const quad = [];
      results.items[0].location.points.forEach((p) => {
        quad.push([p.x * ratio, p.y * ratio]);
      });

      const detectResult = this.processDetectResult({
        location: quad,
        width: image.width,
        height: image.height,
        config
      });
      return Promise.resolve(detectResult);
    }
  }
  DDV.setProcessingHandler('documentBoundariesDetect', new DDNNormalizeHandler())
}

function compress(
    imageData,
    imageWidth,
    imageHeight,
    newWidth,
    newHeight,
) {
  let source = null;
  try {
      source = new Uint8ClampedArray(imageData);
  } catch (error) {
      source = new Uint8Array(imageData);
  }

  const scaleW = newWidth / imageWidth;
  const scaleH = newHeight / imageHeight;
  const targetSize = newWidth * newHeight * 4;
  const targetMemory = new ArrayBuffer(targetSize);
  let distData = null;

  try {
      distData = new Uint8ClampedArray(targetMemory, 0, targetSize);
  } catch (error) {
      distData = new Uint8Array(targetMemory, 0, targetSize);
  }

  const filter = (distCol, distRow) => {
      const srcCol = Math.min(imageWidth - 1, distCol / scaleW);
      const srcRow = Math.min(imageHeight - 1, distRow / scaleH);
      const intCol = Math.floor(srcCol);
      const intRow = Math.floor(srcRow);

      let distI = (distRow * newWidth) + distCol;
      let srcI = (intRow * imageWidth) + intCol;

      distI *= 4;
      srcI *= 4;

      for (let j = 0; j <= 3; j += 1) {
          distData[distI + j] = source[srcI + j];
      }
  };

  for (let col = 0; col < newWidth; col += 1) {
      for (let row = 0; row < newHeight; row += 1) {
          filter(col, row);
      }
  }

  return distData;
}