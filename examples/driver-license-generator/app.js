/*
 * Driver License Generator — UI, canvas rendering and PNG export.
 *
 * The heavy lifting (jurisdiction table + AAMVA payload assembly) lives in
 * aamva-generator.js. This file only collects input, renders the card preview
 * with a PDF417 barcode (bwip-js) and exports the result.
 */
(function () {
  'use strict';

  /* Shared analytics for the Codepool demos (demos/shared/analytics.js). The
     fallback keeps the page working if the script is blocked. */
  var analytics = window.DemoAnalytics || {
    ready: function () { }, error: function () { }, start: function () { },
    success: function () { }, fail: function () { }, action: function () { },
    trialClick: function () { }
  };

  var APP_START = (window.performance && performance.now) ? performance.now() : Date.now();

  /* ------------------------------------------------------------------ *
   * Canvas layout constants
   *
   * The sheet is rendered at DPR device pixels per logical unit so the
   * PDF417 modules end up several pixels wide in the exported PNG — that is
   * what keeps the barcode readable after download and re-upload.
   * ------------------------------------------------------------------ */
  var DPR = 2;
  var SHEET_W = 1000;
  var SHEET_H = 1340;
  var CARD_X = 20;
  var CARD_W = 960;
  var CARD_H = 605;                 // ID-1 aspect ratio: 85.6 x 54 mm
  var FRONT_Y = 48;
  var BACK_Y = 713;
  var BARCODE_BOX = { x: CARD_X + 24, y: BACK_Y + 240, w: CARD_W - 220, h: 310 };
  var BARCODE_SCALE = 8;

  var els = {};
  var initialRenderDone = false;
  var lastPayload = '';

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  function toDateInputValue(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2);
  }

  function parseDateInput(value) {
    var parts = String(value || '').split('-');
    if (parts.length !== 3) return new Date();
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function displayDate(date) {
    return pad(date.getMonth() + 1, 2) + '/' + pad(date.getDate(), 2) + '/' + date.getFullYear();
  }

  function normalizePostal(value, country) {
    var v = String(value || '').trim();
    if (country === 'USA') {
      var digits = v.replace(/\D/g, '');
      return (digits + '000000000').slice(0, 9) + '  ';
    }
    if (country === 'CAN') {
      return v.replace(/[\s-]+/g, '').toUpperCase();
    }
    return v;
  }

  function truncate(ctx, text, maxWidth) {
    var t = String(text);
    if (ctx.measureText(t).width <= maxWidth) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Jurisdiction accent colours used for the card header band. */
  var ACCENTS = {
    USA: ['#1d3f8f', '#3a6fd8'],
    CAN: ['#8f1d2b', '#d83a4a'],
    MEX: ['#0b6b3a', '#12a05a']
  };

  /* ------------------------------------------------------------------ *
   * Barcode
   * ------------------------------------------------------------------ */
  function renderBarcode(canvas, payload) {
    var opts = {
      bcid: 'pdf417',
      text: payload,
      scale: BARCODE_SCALE,
      rowmult: 3,
      eclevel: 5,
      paddingwidth: 4,
      paddingheight: 4,
      backgroundcolor: 'FFFFFF',
      barcolor: '000000'
    };
    // bwip-js 4.x returns a Promise when no callback is supplied. Race it
    // against a timer so a rendering problem surfaces instead of hanging the UI.
    var render = Promise.resolve(window.bwipjs.toCanvas(canvas, opts));
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('barcode rendering timed out')); }, 15000);
    });
    return Promise.race([render, timeout]);
  }

  /* ------------------------------------------------------------------ *
   * Card rendering
   * ------------------------------------------------------------------ */
  function drawGuilloche(ctx, x, y, w, h, color) {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 16);
    ctx.clip();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = color;
    for (var line = 0; line < 90; line++) {
      ctx.beginPath();
      var baseY = y + line * 7;
      ctx.moveTo(x, baseY);
      for (var px = x; px <= x + w; px += 12) {
        ctx.lineTo(px, baseY + Math.sin((px - x) * 0.045 + line) * 4);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWatermark(ctx, cx, cy, size) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = '#c81e2b';
    ctx.font = 'bold ' + size + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECIMEN', 0, 0);
    ctx.font = 'bold ' + Math.round(size * 0.34) + 'px Arial, sans-serif';
    ctx.fillText('NOT A REAL ID', 0, Math.round(size * 0.55));
    ctx.restore();
  }

  function renderFront(ctx, s) {
    var x = CARD_X;
    var y = FRONT_Y;
    var accent = ACCENTS[s.jurisdiction.country] || ACCENTS.USA;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, CARD_W, CARD_H, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    drawGuilloche(ctx, x, y, CARD_W, CARD_H, accent[0]);

    // Header band
    var grad = ctx.createLinearGradient(x, y, x + CARD_W, y + 96);
    grad.addColorStop(0, accent[0]);
    grad.addColorStop(1, accent[1]);
    ctx.save();
    roundRect(ctx, x, y, CARD_W, CARD_H, 16);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, CARD_W, 96);
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText(s.jurisdiction.country === 'USA'
      ? 'DRIVER LICENSE'
      : (s.cardType === 'ID' ? 'IDENTIFICATION CARD' : 'DRIVER LICENCE'), x + 32, y + 44);
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(s.jurisdiction.name.toUpperCase() + '  ·  ' + s.jurisdiction.code
      + '  ·  IIN ' + s.jurisdiction.iin, x + 32, y + 74);

    // Photo placeholder
    var px = x + 32;
    var py = y + 124;
    var pw = 172;
    var ph = 216;
    var photoGrad = ctx.createLinearGradient(px, py, px + pw, py + ph);
    photoGrad.addColorStop(0, '#e6ebf2');
    photoGrad.addColorStop(1, '#c9d3e0');
    ctx.fillStyle = photoGrad;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#b3bfd0';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#7d8ba1';
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + 78, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px + pw / 2, py + 186, 58, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a97ab';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PHOTO', px + pw / 2, py + ph + 18);

    // Fields
    var col1 = px + pw + 34;
    var col2 = col1 + 330;
    var rowY = y + 150;
    var rowGap = 52;
    ctx.textAlign = 'left';

    function field(label, value, cx, cy, maxWidth) {
      ctx.fillStyle = '#7a8699';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillText(label, cx, cy);
      ctx.fillStyle = '#16233a';
      ctx.font = 'bold 21px Arial, sans-serif';
      ctx.fillText(truncate(ctx, value, maxWidth || 300), cx, cy + 24);
    }

    field('LICENCE NO.', s.licenceNumber, col1, rowY);
    field('CLASS', s.vehicleClass, col2, rowY);
    field('LAST NAME', s.lastName, col1, rowY + rowGap);
    field('RESTRICTIONS', s.restrictions, col2, rowY + rowGap);
    field('FIRST NAME', s.firstName + (s.middleName ? ' ' + s.middleName : ''), col1, rowY + rowGap * 2);
    field('ENDORSEMENTS', s.endorsements, col2, rowY + rowGap * 2);
    // The address sits on its own row, so it may use the full card width.
    field('ADDRESS', s.street + ', ' + s.city + ' ' + s.postal.trim(), col1, rowY + rowGap * 3,
      CARD_W - (col1 - x) - 40);
    field('DATE OF BIRTH', displayDate(s.birthDate), col1, rowY + rowGap * 4);
    field('SEX', s.sexCode === '1' ? 'M' : (s.sexCode === '2' ? 'F' : 'X'), col2, rowY + rowGap * 4);
    field('ISSUED', displayDate(s.issueDate), col1, rowY + rowGap * 5);
    field('EXPIRES', displayDate(s.expiryDate), col2, rowY + rowGap * 5);
    field('HEIGHT', s.height, col1, rowY + rowGap * 6);
    field('EYES / HAIR', s.eyeColor + ' / ' + s.hairColor, col2, rowY + rowGap * 6);

    drawWatermark(ctx, x + CARD_W * 0.56, y + CARD_H * 0.52, 86);
  }

  function renderBack(ctx, s, barcodeCanvas) {
    var x = CARD_X;
    var y = BACK_Y;
    var accent = ACCENTS[s.jurisdiction.country] || ACCENTS.USA;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, CARD_W, CARD_H, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    drawGuilloche(ctx, x, y, CARD_W, CARD_H, accent[0]);

    // Magnetic stripe (right hand side, as on a real card back)
    ctx.save();
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(x + CARD_W - 132, y + 24, 96, CARD_H - 48);
    ctx.restore();

    // Short printed summary above the barcode
    ctx.textAlign = 'left';
    ctx.fillStyle = '#16233a';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(s.jurisdiction.name + ' — ' + s.jurisdiction.code, x + 32, y + 56);
    ctx.fillStyle = '#7a8699';
    ctx.font = '14px Arial, sans-serif';
    ctx.fillText('AAMVA PDF417  ·  IIN ' + s.jurisdiction.iin + '  ·  '
      + (s.cardType === 'ID' ? 'ID' : 'DL') + ' subfile', x + 32, y + 80);

    ctx.fillStyle = '#16233a';
    ctx.font = 'bold 17px "Courier New", monospace';
    ctx.fillText('LIC ' + s.licenceNumber, x + 32, y + 132);
    ctx.fillText('DOB ' + displayDate(s.birthDate) + '   EXP ' + displayDate(s.expiryDate), x + 32, y + 160);
    ctx.fillText('CLASS ' + s.vehicleClass + '   REST ' + s.restrictions + '   END ' + s.endorsements,
      x + 32, y + 188);
    ctx.fillText('DCF ' + s.documentDiscriminator, x + 32, y + 216);

    // Barcode
    if (barcodeCanvas) {
      var bw = barcodeCanvas.width;
      var bh = barcodeCanvas.height;
      var scale = Math.min(BARCODE_BOX.w / bw, BARCODE_BOX.h / bh);
      var w = bw * scale;
      var h = bh * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(barcodeCanvas, BARCODE_BOX.x + (BARCODE_BOX.w - w) / 2,
        BARCODE_BOX.y + (BARCODE_BOX.h - h) / 2, w, h);
      ctx.imageSmoothingEnabled = true;
    }

    ctx.fillStyle = '#7a8699';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SAMPLE DATA — FOR SCANNER TESTING ONLY', x + (CARD_W - 150) / 2, y + CARD_H - 26);
    ctx.textAlign = 'left';

    drawWatermark(ctx, x + CARD_W * 0.5, y + CARD_H * 0.46, 78);
  }

  function renderSheet(s) {
    var canvas = els.preview;
    canvas.width = SHEET_W * DPR;
    canvas.height = SHEET_H * DPR;
    var ctx = canvas.getContext('2d');
    // Work in logical units; the transform handles the device-pixel scale.
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FRONT', CARD_X, FRONT_Y - 16);
    ctx.fillText('BACK — PDF417 BARCODE', CARD_X, BACK_Y - 16);

    var temp = document.createElement('canvas');
    return renderBarcode(temp, lastPayload).then(function () {
      renderFront(ctx, s);
      renderBack(ctx, s, temp);
      return { w: temp.width, h: temp.height };
    });
  }

  /* ------------------------------------------------------------------ *
   * Form <-> sample data
   * ------------------------------------------------------------------ */
  function populateJurisdictions() {
    var groups = [
      { label: '🇺🇸 United States', country: 'USA' },
      { label: '🇨🇦 Canada', country: 'CAN' },
      { label: '🇲🇽 Mexico', country: 'MEX' }
    ];
    var list = window.AamvaGenerator.JURISDICTIONS;
    groups.forEach(function (group) {
      var optGroup = document.createElement('optgroup');
      optGroup.label = group.label;
      list.filter(function (row) { return row[3] === group.country; })
        .forEach(function (row) {
          var opt = document.createElement('option');
          opt.value = row[0];
          opt.textContent = row[1] + ' (' + row[0] + ')';
          optGroup.appendChild(opt);
        });
      els.jurisdiction.appendChild(optGroup);
    });
    els.jurisdiction.value = 'CA';
  }

  function writeForm(s) {
    els.last_name.value = s.lastName;
    els.first_name.value = s.firstName;
    els.middle_name.value = s.middleName;
    els.licence_number.value = s.licenceNumber;
    els.sex.value = s.sexCode;
    els.height.value = s.height;
    els.birth_date.value = toDateInputValue(s.birthDate);
    els.issue_date.value = toDateInputValue(s.issueDate);
    els.expiry_date.value = toDateInputValue(s.expiryDate);
    els.eye_color.value = s.eyeColor;
    els.hair_color.value = s.hairColor;
    els.weight.value = s.weightLbs;
    els.street.value = s.street;
    els.city.value = s.city;
    els.postal.value = s.postal.trim();
    els.vehicle_class.value = s.vehicleClass;
    els.restrictions.value = s.restrictions;
    els.iin.value = s.jurisdiction.iin;
    els.country_of_issue.value = s.jurisdiction.country;
  }

  function readForm() {
    var jurisdiction = window.AamvaGenerator.findJurisdiction(els.jurisdiction.value);
    return {
      jurisdiction: jurisdiction,
      cardType: els.card_type.value,
      firstName: els.first_name.value.trim().toUpperCase(),
      middleName: els.middle_name.value.trim().toUpperCase(),
      lastName: els.last_name.value.trim().toUpperCase(),
      suffix: '',
      licenceNumber: els.licence_number.value.trim().toUpperCase(),
      birthDate: parseDateInput(els.birth_date.value),
      issueDate: parseDateInput(els.issue_date.value),
      expiryDate: parseDateInput(els.expiry_date.value),
      sexCode: els.sex.value,
      height: els.height.value.trim(),
      weightLbs: els.weight.value.trim(),
      eyeColor: els.eye_color.value.trim().toUpperCase(),
      hairColor: els.hair_color.value.trim().toUpperCase(),
      street: els.street.value.trim().toUpperCase(),
      city: els.city.value.trim().toUpperCase(),
      postal: normalizePostal(els.postal.value, jurisdiction.country),
      vehicleClass: els.vehicle_class.value.trim().toUpperCase(),
      restrictions: els.restrictions.value.trim().toUpperCase(),
      endorsements: 'NONE',
      documentDiscriminator: String(sessionDiscriminator),
      complianceType: 'F'
    };
  }

  // Kept stable across edits so the discriminator does not change on every keystroke.
  var sessionDiscriminator = (function () {
    var out = '';
    for (var i = 0; i < 20; i++) out += Math.floor(Math.random() * 10);
    return out;
  })();

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */
  function randomize(silent) {
    if (!silent) analytics.action('randomize');
    var sample = window.AamvaGenerator.randomSample(els.jurisdiction.value, els.card_type.value);
    writeForm(sample);
  }

  function generate(source) {
    try {
      var sample = readForm();
      lastPayload = window.AamvaGenerator.buildPayload(
        sample,
        els.aamva_version.value,
        pad(els.jurisdiction_version.value || '01', 2)
      );
      els.output_payload.value = window.AamvaGenerator.escapePayload(lastPayload);

      return renderSheet(sample).then(function (size) {
        var bytes = lastPayload.length;
        els.decode_status.textContent = 'PDF417 rendered — payload ' + bytes
          + ' characters, symbol ' + size.w + '×' + size.h + ' px, '
          + 'jurisdiction ' + sample.jurisdiction.name + ' (' + sample.jurisdiction.code + ')';
        if (initialRenderDone && source !== 'internal') {
          analytics.action('generate', {
            jurisdiction: sample.jurisdiction.code,
            card_type: sample.cardType,
            aamva_version: els.aamva_version.value
          });
        }
        return true;
      }).catch(function (error) {
        console.error(error);
        els.decode_status.textContent = 'Barcode rendering failed: ' + error.message;
        analytics.error('generate_failed', error.message);
        return false;
      });
    } catch (error) {
      console.error(error);
      els.decode_status.textContent = 'Generation failed: ' + error.message;
      analytics.error('generate_failed', error.message);
      return Promise.resolve(false);
    }
  }

  function download() {
    analytics.action('download', {
      jurisdiction: els.jurisdiction.value,
      card_type: els.card_type.value
    });
    els.preview.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'sample-license-' + els.jurisdiction.value.toLowerCase()
        + '-' + els.card_type.value.toLowerCase() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  function copyPayload() {
    analytics.action('copy_payload');
    var text = lastPayload;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        els.copyBtn.textContent = '✅ Copied';
        setTimeout(function () { els.copyBtn.textContent = '📋 Copy Raw Payload'; }, 1600);
      }, function () {
        els.copyBtn.textContent = '⚠️ Copy blocked';
        setTimeout(function () { els.copyBtn.textContent = '📋 Copy Raw Payload'; }, 1600);
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Bootstrap
   * ------------------------------------------------------------------ */
  function bind() {
    els.randomBtn.addEventListener('click', function () { randomize(false); });
    els.generateBtn.addEventListener('click', function () { generate(); });
    els.downloadBtn.addEventListener('click', download);
    els.copyBtn.addEventListener('click', copyPayload);

    els.jurisdiction.addEventListener('change', function () {
      // Refresh only the jurisdiction-derived fields — city, postal code, the
      // licence-number format and the class/restriction codes — so the card
      // stays consistent without discarding the entered personal details.
      var j = window.AamvaGenerator.findJurisdiction(els.jurisdiction.value);
      var fresh = window.AamvaGenerator.randomSample(els.jurisdiction.value, els.card_type.value);
      els.iin.value = j.iin;
      els.country_of_issue.value = j.country;
      els.city.value = fresh.city;
      els.postal.value = fresh.postal.trim();
      els.vehicle_class.value = fresh.vehicleClass;
      els.restrictions.value = fresh.restrictions;
      els.licence_number.value = fresh.licenceNumber;
      generate('internal');
    });

    // Any field edit re-renders, debounced so typing stays responsive.
    // The jurisdiction select is wired separately (see above).
    var timer = null;
    els.formFields().forEach(function (el) {
      if (el === els.jurisdiction) return;
      el.addEventListener('change', function () { generate('internal'); });
      if (el.tagName === 'INPUT') {
        el.addEventListener('input', function () {
          clearTimeout(timer);
          timer = setTimeout(function () { generate('internal'); }, 350);
        });
      }
    });
  }

  function init() {
    [
      'jurisdiction', 'card_type', 'aamva_version', 'iin', 'country_of_issue',
      'jurisdiction_version', 'last_name', 'first_name', 'middle_name',
      'licence_number', 'sex', 'height', 'birth_date', 'issue_date',
      'expiry_date', 'eye_color', 'hair_color', 'weight', 'street', 'city',
      'postal', 'vehicle_class', 'restrictions', 'randomBtn', 'generateBtn',
      'downloadBtn', 'copyBtn', 'preview', 'output_payload', 'decode_status'
    ].forEach(function (id) {
      els[id] = document.getElementById(id);
    });

    els.formFields = function () {
      return [
        els.jurisdiction, els.card_type, els.aamva_version, els.jurisdiction_version,
        els.last_name, els.first_name, els.middle_name, els.licence_number,
        els.sex, els.height, els.birth_date, els.issue_date, els.expiry_date,
        els.eye_color, els.hair_color, els.weight, els.street, els.city,
        els.postal, els.vehicle_class, els.restrictions
      ];
    };

    populateJurisdictions();
    randomize(true);
    bind();
    generate('internal').then(function () {
      initialRenderDone = true;
      analytics.ready(((window.performance && performance.now) ? performance.now() : Date.now()) - APP_START);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
