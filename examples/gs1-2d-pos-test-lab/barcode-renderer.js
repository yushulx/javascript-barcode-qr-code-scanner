/* Real EAN-13 and QR rendering with bwip-js, plus a native-resolution SDK label. */
(function () {
  'use strict';

  function encode(bcid, text, scale, height) {
    return new Promise(function (resolve, reject) {
      if (!window.bwipjs) {
        reject(new Error('The barcode encoder did not load. Check the network connection.'));
        return;
      }
      var canvas = document.createElement('canvas');
      var options = {
        bcid: bcid,
        text: text,
        scale: scale,
        includetext: false,
        paddingwidth: bcid === 'ean13' ? 8 : 6,
        paddingheight: 6
      };
      if (height) options.height = height;
      if (bcid === 'qrcode') options.ecclevel = 'M';
      try {
        var pending = window.bwipjs.toCanvas(canvas, options);
        if (pending && typeof pending.then === 'function') pending.then(function () { resolve(canvas); }, reject);
        else resolve(canvas);
      } catch (error) {
        reject(error);
      }
    });
  }

  function makeErrorCanvas(message) {
    var canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 120;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#b3261e';
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.fillStyle = '#b3261e';
    ctx.font = '16px sans-serif';
    ctx.fillText('Symbol not rendered', 20, 38);
    ctx.fillStyle = '#606060';
    ctx.font = '13px sans-serif';
    ctx.fillText(String(message || 'Invalid encoder input').slice(0, 62), 20, 70);
    return canvas;
  }

  function text(ctx, value, x, y, size, color, weight) {
    ctx.fillStyle = color || '#323234';
    ctx.font = (weight || '400') + ' ' + size + 'px sans-serif';
    ctx.fillText(value, x, y);
  }

  function wrap(ctx, value, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(value).split(/([/?&=])/);
    var line = '';
    var lines = [];
    words.forEach(function (word) {
      if (ctx.measureText(line + word).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line += word;
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines || 3).forEach(function (row, index) {
      ctx.fillText(row, x, y + index * lineHeight);
    });
  }

  async function renderPackage(fixture, product) {
    var eanValue = window.POSFixtures.ean13(fixture.gtin);
    var uri = fixture.qrType === 'marketing'
      ? 'https://example.com/promotions/summer'
      : window.POSFixtures.digitalLink(fixture.gtin2d, fixture.lot, fixture.expiry);
    var result = { ean: null, qr: null, composite: null, uri: uri, errors: [] };

    var jobs = await Promise.all([
      eanValue ? encode('ean13', eanValue.slice(0, 12), 4, 24).catch(function (error) {
        result.errors.push('EAN-13: ' + (error.message || error));
        return makeErrorCanvas(error.message || error);
      }) : Promise.resolve(makeErrorCanvas('This GTIN has no EAN-13 equivalent.')),
      encode('qrcode', uri, 5).catch(function (error) {
        result.errors.push('QR: ' + (error.message || error));
        return makeErrorCanvas(error.message || error);
      })
    ]);
    result.ean = jobs[0];
    result.qr = jobs[1];

    var canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    text(ctx, 'SYNTHETIC POS TEST LABEL', 60, 72, 24, '#606060', '700');
    text(ctx, product.name, 60, 122, 34, '#323234', '700');
    text(ctx, 'EAN-13', 60, 180, 22, '#323234', '700');
    text(ctx, 'QR Code · ' + (fixture.qrType === 'marketing' ? 'ordinary URL' : 'GS1 Digital Link URI'), 700, 180, 22, '#323234', '700');
    ctx.drawImage(result.ean, 60, 205);
    ctx.drawImage(result.qr, 700, 205);
    text(ctx, eanValue || fixture.gtin, 60, 520, 26, '#323234', '600');
    text(ctx, 'Canonical GTIN (EAN): ' + fixture.gtin, 60, 566, 20);
    text(ctx, 'Canonical GTIN (QR):  ' + fixture.gtin2d, 60, 600, 20);
    ctx.font = '17px monospace';
    ctx.fillStyle = '#606060';
    wrap(ctx, uri, 60, 646, 1140, 24, 2);
    result.composite = canvas;
    return result;
  }

  function downloadCanvas(canvas, filename) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
  }

  window.POSBarcodeRenderer = {
    renderPackage: renderPackage,
    downloadCanvas: downloadCanvas
  };
})();
