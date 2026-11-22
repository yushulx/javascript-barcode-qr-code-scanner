/*
 * Barcode & QR Code Generator — symbology table, grid layout and PNG export.
 *
 * Every symbol is produced by bwip-js (https://github.com/metafloor/bwip-js),
 * loaded from a CDN in index.html. This file collects the input, lays the
 * generated symbols out on an HTML5 canvas and exports the result. Everything
 * runs in the browser — no data is uploaded.
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
   * Random sample data
   * ------------------------------------------------------------------ */

  function digits(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += String(Math.floor(Math.random() * 10));
    return out;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomChars(n, set) {
    var out = '';
    for (var i = 0; i < n; i++) out += set.charAt(Math.floor(Math.random() * set.length));
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Symbology table
   *
   * `scale` is the bwip-js module scale, tuned per symbology so every
   * symbol lands in a comparable pixel range on the canvas (a MaxiCode is
   * a fixed 30x33 module grid, an EAN-13 is a long thin strip). `hint` is
   * the input rule shown under the form, `check` returns an error message
   * for input bwip-js would reject and null when the text can be encoded
   * as typed, and `options` carries extra bwip-js settings.
   * ------------------------------------------------------------------ */

  var SYMBOLOGIES = [
    {
      id: 'qrcode', label: 'QR Code', kind: '2D', scale: 4,
      hint: 'Accepts any text or URL.',
      random: function () { return 'Dynamsoft-' + digits(12); }
    },
    {
      id: 'pdf417', label: 'PDF417', kind: '2D', scale: 3,
      hint: 'Accepts any text.',
      random: function () { return 'Dynamsoft-' + digits(12); }
    },
    {
      id: 'datamatrix', label: 'Data Matrix', kind: '2D', scale: 5,
      hint: 'Accepts any text.',
      random: function () { return 'Dynamsoft-' + digits(12); }
    },
    {
      id: 'azteccode', label: 'Aztec Code', kind: '2D', scale: 4,
      hint: 'Accepts any text.',
      random: function () { return 'Dynamsoft-' + digits(12); }
    },
    {
      id: 'maxicode', label: 'MaxiCode', kind: '2D', scale: 2,
      hint: 'Accepts up to 93 characters.',
      check: function (text) {
        return text.length > 93 ? 'MaxiCode carries at most 93 characters.' : null;
      },
      random: function () { return 'Dynamsoft-' + digits(12); }
    },
    {
      id: 'dotcode', label: 'DotCode', kind: '2D', scale: 4,
      hint: 'Accepts any text.',
      random: function () { return 'Dynamsoft-' + digits(12); }
    },
    {
      id: 'ean13', label: 'EAN-13', kind: '1D', scale: 3,
      hint: 'Accepts 12 digits; the 13th digit is the check digit.',
      check: function (text) {
        return /^\d{12,13}$/.test(text)
          ? null
          : 'EAN-13 encodes 12 digits plus a check digit — the 13th digit is calculated for you.';
      },
      random: function () { return digits(12); }
    },
    {
      id: 'code128', label: 'Code 128', kind: '1D', scale: 3,
      hint: 'Accepts any ASCII text.',
      random: function () { return 'Dynamsoft-' + digits(8); }
    },
    {
      id: 'code39', label: 'Code 39', kind: '1D', scale: 3,
      hint: 'Accepts digits, capitals, spaces and - . $ / + % only.',
      check: function (text) {
        return /^[0-9A-Z\-\.\$\/\+% ]+$/.test(text)
          ? null
          : 'Code 39 accepts digits, capital letters, spaces and the symbols - . $ / + % only.';
      },
      random: function () { return randomChars(10, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. '); }
    },
    {
      id: 'interleaved2of5', label: 'ITF', kind: '1D', scale: 3,
      hint: 'Accepts digits; an odd count gets a leading zero.',
      check: function (text) {
        return /^\d+$/.test(text) ? null : 'Interleaved 2 of 5 encodes digits only.';
      },
      random: function () { return digits(12); }
    },
    {
      id: 'msi', label: 'MSI', kind: '1D', scale: 3,
      hint: 'Accepts digits; a Mod-10 check digit is appended.',
      /* Readers expect the Mod-10 check digit on MSI, so append it — the
         symbol's human readable text stays the value as typed. */
      options: { includecheck: true },
      check: function (text) {
        return /^\d+$/.test(text) ? null : 'MSI encodes digits only.';
      },
      random: function () { return digits(10); }
    },
    {
      id: 'pharmacode', label: 'Pharmacode', kind: '1D', scale: 3,
      hint: 'Accepts a number from 3 to 131070.',
      check: function (text) {
        var n = Number(text);
        return Number.isInteger(n) && n >= 3 && n <= 131070
          ? null
          : 'Pharmacode encodes a single number between 3 and 131070.';
      },
      random: function () { return String(randomInt(3, 131070)); }
    },
    {
      id: 'rationalizedCodabar', label: 'Codabar', kind: '1D', scale: 3,
      hint: 'Accepts digits and - $ : / . + between the start/stop characters A-D.',
      check: function (text) {
        return /^[A-Da-d][0-9\-\$:\/\.\+]+[A-Da-d]$/.test(text)
          ? null
          : 'Codabar starts and stops with one of A, B, C or D — for example A1234567890B.';
      },
      random: function () { return 'A' + randomChars(10, '0123456789-$:/.+') + 'B'; }
    }
  ];

  var TYPES = {};
  SYMBOLOGIES.forEach(function (t) { TYPES[t.id] = t; });
  /* Degradation rows by id, for labelling the engine's conditions. Filled once
     the engine has loaded — see initStress(). */
  TYPES.degradations = {};

  /* ------------------------------------------------------------------ *
   * Layout
   * ------------------------------------------------------------------ */

  var LAYOUT = {
    margin: 28,        // canvas border
    pad: 26,           // space inside a cell
    gap: 22,           // space between cells
    label: 20,         // height reserved for the symbology name
    caption: 26,       // height reserved for the encoded value under 2D symbols
    radius: 6
  };

  /* Long payloads make long symbols — a 120-character Code 128 is 1355 px wide
     even at scale 1. Symbols wider than this are re-rendered at the largest
     integer scale that fits, which keeps the module edges sharp (integer
     modules) and stops a large grid from producing a huge canvas. */
  var MAX_SYMBOL_PX = 900;
  var MAX_GRID = 6;

  var els = {};
  var renderToken = 0;
  var initialRenderDone = false;
  var lastRun = null;

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  function encodeOnce(type, text, scale) {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      var options = { bcid: type.id, text: text, scale: scale };
      if (type.kind === '1D') {
        options.height = 10;            // mm — keep the bars from towering
        options.includetext = true;     // print the value under the bars
        options.textxalign = 'center';
      }
      var extra = type.options || {};
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) options[key] = extra[key];
      }
      var pending;
      try {
        pending = window.bwipjs.toCanvas(canvas, options);
      } catch (error) {
        reject(error);
        return;
      }
      if (pending && typeof pending.then === 'function') {
        pending.then(function () { resolve(canvas); }, reject);
      } else {
        resolve(canvas);
      }
    });
  }

  function encode(type, text) {
    return encodeOnce(type, text, type.scale).then(function (canvas) {
      if (canvas.width <= MAX_SYMBOL_PX || type.scale <= 1) return canvas;
      var scale = Math.max(1, Math.floor(type.scale * MAX_SYMBOL_PX / canvas.width));
      if (scale >= type.scale) return canvas;
      return encodeOnce(type, text, scale).catch(function () { return canvas; });
    });
  }

  function cellSize(images) {
    var size = { w: 0, h: 0, has2D: false };
    images.forEach(function (image) {
      size.w = Math.max(size.w, image.canvas.width);
      size.h = Math.max(size.h, image.canvas.height);
      if (image.type.kind === '2D') size.has2D = true;
    });
    return size;
  }

  function composeSize(content, cols, rows) {
    var cellW = content.w + LAYOUT.pad * 2;
    var cellH = content.h + LAYOUT.pad * 2 + LAYOUT.label + (content.has2D ? LAYOUT.caption : 0);
    return {
      cellW: cellW,
      cellH: cellH,
      w: LAYOUT.margin * 2 + cols * cellW + (cols - 1) * LAYOUT.gap,
      h: LAYOUT.margin * 2 + rows * cellH + (rows - 1) * LAYOUT.gap
    };
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

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var out = text;
    while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
      out = out.slice(0, -1);
    }
    return out + '…';
  }

  /* Encode every cell, then paint the grid. Symbols are black on white with a
     hairline cell border so the exported PNG stays scanner friendly. */
  function renderGrid(cells, rows, cols) {
    return Promise.all(cells.map(function (cell) {
      return encode(cell.type, cell.text).then(function (canvas) {
        return { canvas: canvas, type: cell.type, text: cell.text };
      });
    })).then(function (images) {
      var content = cellSize(images);
      var size = composeSize(content, cols, rows);

      var canvas = els.barcodeCanvas;
      canvas.width = size.w;
      canvas.height = size.h;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.w, size.h);

      images.forEach(function (image, index) {
        var col = index % cols;
        var row = Math.floor(index / cols);
        var x = LAYOUT.margin + col * (size.cellW + LAYOUT.gap);
        var y = LAYOUT.margin + row * (size.cellH + LAYOUT.gap);

        ctx.strokeStyle = '#dddddd';
        ctx.lineWidth = 1;
        roundRect(ctx, x + 0.5, y + 0.5, size.cellW - 1, size.cellH - 1, LAYOUT.radius);
        ctx.stroke();

        ctx.fillStyle = '#999999';
        ctx.font = '600 11px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(image.type.label.toUpperCase(), x + LAYOUT.pad, y + LAYOUT.pad + 10);

        var imageX = x + (size.cellW - image.canvas.width) / 2;
        var imageY = y + LAYOUT.pad + LAYOUT.label + (content.h - image.canvas.height) / 2;
        ctx.drawImage(image.canvas, imageX, imageY);

        if (image.type.kind === '2D') {
          ctx.fillStyle = '#606060';
          ctx.font = '13px Arial, Helvetica, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            fitText(ctx, image.text, size.cellW - LAYOUT.pad * 2),
            x + size.cellW / 2,
            y + size.cellH - LAYOUT.pad + 2
          );
        }
      });

      return { w: size.w, h: size.h };
    });
  }

  /* ------------------------------------------------------------------ *
   * Page state
   * ------------------------------------------------------------------ */

  function readCount(input, min, max) {
    var value = parseInt(input.value, 10);
    if (isNaN(value)) value = min;
    value = Math.min(max, Math.max(min, value));
    input.value = value;
    return value;
  }

  function showError(message) {
    if (message) {
      els.formError.textContent = message;
      els.formError.classList.add('is-visible');
    } else {
      els.formError.textContent = '';
      els.formError.classList.remove('is-visible');
    }
  }

  function describe(cells, rows, cols) {
    var order = [];
    cells.forEach(function (cell) {
      if (order.indexOf(cell.type.label) === -1) order.push(cell.type.label);
    });
    var total = cells.length;
    var names;
    if (order.length === 1) {
      names = total + ' ' + order[0] + (total === 1 ? ' symbol' : ' symbols');
    } else {
      var shown = order.slice(0, 5).join(', ');
      names = total + ' symbols (' + shown + (order.length > 5 ? ', …' : '') + ')';
    }
    return names + ' in a ' + rows + ' × ' + cols + ' grid';
  }

  function buildCells(mode) {
    var rows = readCount(els.rows, 1, MAX_GRID);
    var cols = readCount(els.cols, 1, MAX_GRID);
    var selected = TYPES[els.barcodeType.value] || SYMBOLOGIES[0];
    var cells = [];
    for (var i = 0; i < rows * cols; i++) {
      if (mode === 'mixed') {
        var type = SYMBOLOGIES[randomInt(0, SYMBOLOGIES.length - 1)];
        cells.push({ type: type, text: type.random() });
      } else if (mode === 'random') {
        cells.push({ type: selected, text: selected.random() });
      } else {
        cells.push({ type: selected, text: els.text.value.trim() });
      }
    }
    return { cells: cells, rows: rows, cols: cols, type: selected };
  }

  function generate(mode) {
    if (!window.bwipjs) {
      showError('The barcode encoder (bwip-js) could not be loaded. Check your connection and reload the page.');
      els.renderStatus.textContent = 'Encoder unavailable.';
      els.renderStatus.classList.add('is-error');
      return Promise.resolve(false);
    }

    var job = buildCells(mode);

    /* Text-based modes are validated up front so a typing mistake shows a
       readable message instead of a bwip-js exception. */
    if (mode === 'direct' || mode === 'internal') {
      var text = job.cells[0].text;
      var problem = text
        ? (job.type.check ? job.type.check(text) : null)
        : 'Enter the text you want to encode.';
      if (problem) {
        showError(text || mode === 'direct' ? problem : null);
        els.renderStatus.textContent = problem;
        els.renderStatus.classList.add('is-error');
        if (mode === 'direct') analytics.error('generate_failed', problem);
        return Promise.resolve(false);
      }
    }
    showError(null);

    var token = ++renderToken;
    els.renderStatus.classList.remove('is-error');
    els.renderStatus.textContent = 'Generating…';
    els.downloadBtn.disabled = true;
    els.copyBtn.disabled = true;

    return renderGrid(job.cells, job.rows, job.cols).then(function (size) {
      if (token !== renderToken) return false;
      lastRun = { mode: mode, type: job.type, rows: job.rows, cols: job.cols, size: size };
      els.renderStatus.textContent = 'Rendered ' + describe(job.cells, job.rows, job.cols)
        + '. PNG size ' + size.w + ' × ' + size.h + ' px.';
      els.downloadBtn.disabled = false;
      els.copyBtn.disabled = false;
      if (initialRenderDone && mode !== 'internal') {
        analytics.action('generate', {
          mode: mode === 'direct' ? 'text' : mode,
          barcode_type: mode === 'mixed' ? 'mixed' : job.type.id,
          rows: job.rows,
          cols: job.cols,
          symbols: job.rows * job.cols
        });
      }
      return true;
    }).catch(function (error) {
      if (token !== renderToken) return false;
      console.error(error);
      var message = (error && error.message ? error.message : String(error)).replace(/^bwipp\.[^#]*#\d+:\s*/, '');
      showError('That value cannot be encoded as ' + job.type.label + ': ' + message);
      els.renderStatus.textContent = job.type.label + ' could not be rendered.';
      els.renderStatus.classList.add('is-error');
      els.downloadBtn.disabled = false;
      els.copyBtn.disabled = false;
      analytics.error('generate_failed', message);
      return false;
    });
  }

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */

  function randomize(mode) {
    if (mode === 'random') {
      var type = TYPES[els.barcodeType.value] || SYMBOLOGIES[0];
      analytics.action('randomize', { barcode_type: type.id });
    } else {
      analytics.action('random_types');
    }
    generate(mode);
  }

  function download() {
    if (!lastRun) return;
    analytics.action('download', {
      barcode_type: lastRun.mode === 'mixed' ? 'mixed' : lastRun.type.id,
      mode: lastRun.mode,
      symbols: lastRun.rows * lastRun.cols,
      width: lastRun.size.w,
      height: lastRun.size.h
    });
    els.barcodeCanvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var name = lastRun.mode === 'mixed' ? 'mixed' : lastRun.type.id;
      a.href = url;
      a.download = 'barcodes-' + name + '-' + lastRun.rows + 'x' + lastRun.cols + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  function copyImage() {
    // The label lives in its own span so the icon survives the swap.
    var label = els.copyBtn.querySelector('.btn-label');
    var reset = label.textContent;
    function flash(message) {
      label.textContent = message;
      setTimeout(function () { label.textContent = reset; }, 1600);
    }
    if (!navigator.clipboard || !window.ClipboardItem) {
      flash('Copy not supported');
      return;
    }
    els.barcodeCanvas.toBlob(function (blob) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
        analytics.action('copy_image', { symbols: lastRun.rows * lastRun.cols });
        flash('Copied');
      }, function () {
        flash('Copy blocked');
      });
    }, 'image/png');
  }

  /* ------------------------------------------------------------------ *
   * Stress-test dataset mode
   *
   * The engine (stress.js) owns the pixels and the ground truth; this
   * section owns the controls, the preview and the export. The rule it
   * enforces is that nothing downstream of a build can show a stale
   * result: the export buttons stay disabled until a dataset exists, and
   * every control that only matters while a build is running is disabled
   * rather than inert.
   * ------------------------------------------------------------------ */

  var STRESS_IDS = ['modeTabSingle', 'modeTabStress', 'mode_single', 'mode_stress',
    'stressPreset', 'stressPresetNote', 'stressSeed', 'stressSamples', 'stressSymbols',
    'stressSymbology', 'stressDifficulty', 'degradeRows', 'stressBuildBtn', 'stressSeedBtn', 'stressResetBtn',
    'stressProgress', 'stressProgressBar', 'stressProgressText', 'stressStatus', 'stressError',
    'stressCanvas', 'stressPrevBtn', 'stressNextBtn', 'stressCounter', 'stressSampleStatus',
    'stressExpected', 'stressApplied', 'stressZipBtn', 'stressJsonBtn', 'stressPngBtn',
    'stressExportError'];

  var stress = {
    rows: {},
    preset: 'mixed',
    baseline: '',
    data: null,      // { spec, samples, annotation, seedHash }
    index: 0,
    busy: false,
    initialised: false,
    available: false // false until both scripts are confirmed present
  };

  var PRESET_CUSTOM = 'custom';

  function roundToStep(value, step) {
    var decimals = String(step).indexOf('.') === -1 ? 0 : String(step).split('.')[1].length;
    return Number(value.toFixed(decimals));
  }

  /* ---- controls ---------------------------------------------------- */

  function populateStressSelects() {
    var engine = window.BarcodeStress;
    Object.keys(engine.PRESETS).forEach(function (id) {
      var option = document.createElement('option');
      option.value = id;
      option.textContent = engine.PRESETS[id].label;
      els.stressPreset.appendChild(option);
    });
    var custom = document.createElement('option');
    custom.value = PRESET_CUSTOM;
    custom.textContent = 'Custom (edited)';
    custom.disabled = true;
    els.stressPreset.appendChild(custom);

    var mixed = document.createElement('option');
    mixed.value = 'mixed';
    mixed.textContent = 'Mixed — a random symbology per symbol';
    els.stressSymbology.appendChild(mixed);
    SYMBOLOGIES.forEach(function (type) {
      var option = document.createElement('option');
      option.value = type.id;
      option.textContent = type.label + ' only';
      els.stressSymbology.appendChild(option);
    });
  }

  function buildDegradeRows() {
    var engine = window.BarcodeStress;
    els.degradeRows.innerHTML = '';
    engine.DEGRADATIONS.forEach(function (degradation) {
      var row = document.createElement('tr');
      row.dataset.id = degradation.id;

      var cellOn = document.createElement('td');
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'range-check';
      check.setAttribute('aria-label', 'Apply ' + degradation.label);
      cellOn.appendChild(check);
      row.appendChild(cellOn);

      var cellName = document.createElement('td');
      var name = document.createElement('span');
      name.className = 'range-name';
      name.textContent = degradation.label;
      if (degradation.scope === 'symbol') {
        /* Two scopes live in this table: a value per image, and a value per
           symbol. That difference is the whole point of the row, so it is on
           screen rather than buried in the tooltip. */
        var spec = document.createElement('span');
        spec.className = 'range-scope';
        spec.textContent = 'per symbol';
        name.appendChild(document.createTextNode(' '));
        name.appendChild(spec);
      }
      var hint = document.createElement('span');
      hint.className = 'range-hint';
      hint.textContent = degradation.hint;
      cellName.appendChild(name);
      cellName.appendChild(hint);
      row.appendChild(cellName);

      function numberCell(field) {
        var cell = document.createElement('td');
        var input = document.createElement('input');
        input.type = 'number';
        input.className = 'range-input';
        input.min = degradation.min;
        input.max = degradation.max;
        input.step = degradation.step;
        input.setAttribute('aria-label', degradation.label + ' ' + field);
        cell.appendChild(input);
        return cell;
      }

      var cellMin = numberCell('minimum');
      var cellMax = numberCell('maximum');
      row.appendChild(cellMin);
      row.appendChild(cellMax);

      var cellUnit = document.createElement('td');
      cellUnit.textContent = degradation.unit;
      row.appendChild(cellUnit);

      els.degradeRows.appendChild(row);
      stress.rows[degradation.id] = {
        row: row,
        check: check,
        min: cellMin.querySelector('input'),
        max: cellMax.querySelector('input')
      };

      check.addEventListener('change', function () {
        syncRowState(degradation.id);
        markPresetEdited();
      });
      [cellMin.querySelector('input'), cellMax.querySelector('input')].forEach(function (input) {
        input.addEventListener('input', function () {
          var id = degradation.id;
          var row = stress.rows[id];
          if (row.check.checked) {
            /* Mirror the value into the other bound so a single number is a
               fixed value, which is what a reader expects from a min/max pair. */
            if (input === row.min) row.max.value = input.value;
            else row.min.value = input.value;
          }
          markPresetEdited();
        });
      });
    });
  }

  function syncRowState(id) {
    var row = stress.rows[id];
    var on = row.check.checked;
    row.min.disabled = !on;
    row.max.disabled = !on;
    row.row.classList.toggle('is-off', !on);
  }

  function applyPreset(id) {
    var engine = window.BarcodeStress;
    var preset = engine.PRESETS[id];
    if (!preset) return;
    stress.preset = id;
    stress.baseline = canonicalRanges(preset.values);
    els.stressPreset.value = id;
    els.stressPresetNote.textContent = preset.note;
    if (preset.symbols) els.stressSymbols.value = preset.symbols;
    els.stressDifficulty.checked = !!preset.difficulty;

    engine.DEGRADATIONS.forEach(function (degradation) {
      var row = stress.rows[degradation.id];
      var range = preset.values[degradation.id];
      if (!range) {
        row.check.checked = false;
        row.min.value = roundToStep(degradation.min, degradation.step);
        row.max.value = roundToStep(degradation.max, degradation.step);
      } else {
        row.check.checked = true;
        row.min.value = roundToStep(range[0], degradation.step);
        row.max.value = roundToStep(range[1], degradation.step);
      }
      syncRowState(degradation.id);
    });
  }

  /* A stable string for "which rows are on, and with what range". Comparing
     the JSON of two objects does not work here: a preset literal and a read
     from the DOM hold the same data in different key order. */
  function canonicalRanges(ranges) {
    return window.BarcodeStress.DEGRADATIONS.map(function (degradation) {
      var range = ranges[degradation.id];
      return range ? degradation.id + '=' + range[0] + ':' + range[1] : '';
    }).join('|');
  }

  function markPresetEdited() {
    if (canonicalRanges(readRanges()) === stress.baseline) return;
    stress.preset = PRESET_CUSTOM;
    els.stressPreset.value = PRESET_CUSTOM;
    els.stressPresetNote.textContent =
      'Edited ranges — no longer the preset. Reload a preset to go back to a measured curve.';
  }

  function readRanges() {
    var ranges = {};
    window.BarcodeStress.DEGRADATIONS.forEach(function (degradation) {
      var row = stress.rows[degradation.id];
      if (!row.check.checked) return;
      var min = Number(row.min.value);
      var max = Number(row.max.value);
      if (!isFinite(min)) min = degradation.min;
      if (!isFinite(max)) max = degradation.max;
      min = Math.max(degradation.min, Math.min(degradation.max, min));
      max = Math.max(degradation.min, Math.min(degradation.max, max));
      if (max < min) { var swap = min; min = max; max = swap; }
      ranges[degradation.id] = [min, max];
    });
    return ranges;
  }

  function readStressSpec() {
    return {
      seed: els.stressSeed.value.trim() || 'codepool',
      samples: parseInt(els.stressSamples.value, 10) || 8,
      symbols: parseInt(els.stressSymbols.value, 10) || 4,
      symbology: els.stressSymbology.value,
      difficulty: els.stressDifficulty.checked,
      degradations: readRanges()
    };
  }

  /* ---- build ------------------------------------------------------- */

  function showStressError(element, message) {
    if (!message) {
      element.textContent = '';
      element.classList.remove('is-visible');
      return;
    }
    element.textContent = message;
    element.classList.add('is-visible');
  }

  function setStressBusy(busy) {
    stress.busy = busy;
    els.stressBuildBtn.disabled = busy;
    els.stressSeedBtn.disabled = busy;
    els.stressResetBtn.disabled = busy;
    if (busy) {
      els.stressProgress.hidden = false;
      els.stressProgressBar.style.width = '0%';
      els.stressZipBtn.disabled = true;
      els.stressJsonBtn.disabled = true;
      els.stressPngBtn.disabled = true;
    } else {
      els.stressProgress.hidden = true;
    }
  }

  function buildStressDataset() {
    if (stress.busy) return Promise.resolve(false);
    var engine = window.BarcodeStress;
    if (!engine) {
      showStressError(els.stressError,
        'The stress-test engine did not load, so this mode cannot build a dataset. '
        + 'Reload the page and check the console if it keeps failing.');
      return Promise.resolve(false);
    }
    if (!window.bwipjs) {
      showStressError(els.stressError,
        'The barcode encoder (bwip-js) could not be loaded. Check your connection and reload the page.');
      return Promise.resolve(false);
    }
    var spec = engine.normalizeSpec(readStressSpec());
    if (Object.keys(spec.degradations).length === 0) {
      showStressError(els.stressError,
        'Every degradation is switched off, so every image would be identical. Turn at least one on — '
        + 'or use the Clean preset if you want the undegraded control group.');
      return Promise.resolve(false);
    }

    showStressError(els.stressError, null);
    showStressError(els.stressExportError, null);
    setStressBusy(true);
    var started = Date.now();
    var lastLabel = '';

    return engine.generateDataset(spec, function (index, total) {
      var percent = Math.round((index / total) * 100);
      els.stressProgressBar.style.width = percent + '%';
      lastLabel = 'Rendering image ' + (index + 1) + ' of ' + total + '…';
      els.stressProgressText.textContent = lastLabel;
    }).then(function (data) {
      if (data.samples.length === 0) {
        throw new Error('No image survived the current settings — the crop removed every symbol.');
      }
      data.samples.forEach(function (sample) {
        sample.preview = previewCanvas(sample.canvas, 420);
        sample.canvas = null;            // the blob holds the full-resolution image
      });
      stress.data = data;
      stress.index = 0;
      setStressBusy(false);
      els.stressZipBtn.disabled = false;
      els.stressJsonBtn.disabled = false;
      els.stressPngBtn.disabled = false;
      showSample(0);

      var seconds = ((Date.now() - started) / 1000).toFixed(1);
      var annotation = data.annotation;
      els.stressStatus.textContent = annotation.total_images + ' images, '
        + annotation.total_barcodes + ' expected barcodes, seed "' + spec.seed
        + '" in ' + seconds + ' s. Nothing leaves the browser.';
      analytics.action('stress_build', {
        images: annotation.total_images,
        barcodes: annotation.total_barcodes,
        symbols_per_image: spec.symbols,
        symbology: spec.symbology,
        preset: stress.preset,
        degradations: Object.keys(spec.degradations).length
      });
      return true;
    }).catch(function (error) {
      console.error(error);
      setStressBusy(false);
      var message = (error && error.message ? error.message : String(error))
        .replace(/^bwipp\.[^#]*#\d+:\s*/, '');
      showStressError(els.stressError, 'The dataset could not be built: ' + message);
      els.stressStatus.textContent = 'Build failed.';
      analytics.error('stress_build_failed', message);
      return false;
    });
  }

  /* A downscaled copy for the preview panel; the exported PNG is the full
     resolution blob, so browsing a large dataset does not pin every frame in
     memory. */
  function previewCanvas(source, maxSide) {
    var scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /* ---- preview ----------------------------------------------------- */

  function showSample(index) {
    var data = stress.data;
    if (!data || index < 0 || index >= data.samples.length) return;
    stress.index = index;
    var sample = data.samples[index];

    var canvas = els.stressCanvas;
    canvas.width = sample.preview.width;
    canvas.height = sample.preview.height;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sample.preview, 0, 0);

    els.stressCounter.textContent = 'Image ' + (index + 1) + ' of ' + data.samples.length;
    els.stressPrevBtn.disabled = index === 0;
    els.stressNextBtn.disabled = index === data.samples.length - 1;

    var lowResolution = sample.pixelsPerModule < 1.5;
    els.stressSampleStatus.innerHTML =
      escapeText(sample.name) + ' — ' + sample.width + ' × ' + sample.height + ' px, '
      + sample.barcodes.length + (sample.barcodes.length === 1 ? ' expected symbol' : ' expected symbols')
      + ', ' + sample.pixelsPerModule.toFixed(1) + ' px per module'
      + (lowResolution
        ? '<span class="status-flag is-warn">below what a camera resolves</span>'
        : '');
    /* A reduced module or a trimmed frame is the size cap doing its job, and it
       changes the conditions the image actually has — so it is reported with the
       achieved value rather than silently applied. */
    if (sample.moduleReduced) {
      els.stressSampleStatus.innerHTML += ' <span class="status-flag">module size cut to '
        + sample.moduleSize + ' px (asked for ' + sample.moduleRequested
        + ') to fit the size cap</span>';
    }
    if (sample.frameClamped && sample.frameRequested > sample.applied.frame * 1.02) {
      els.stressSampleStatus.innerHTML += ' <span class="status-flag">frame padding trimmed to '
        + sample.applied.frame.toFixed(1) + ' × (asked for ' + sample.frameRequested.toFixed(1)
        + ' ×) to stay under the size cap</span>';
    }
    if (sample.dropped > 0) {
      els.stressSampleStatus.innerHTML += ' <span class="status-flag">' + sample.dropped + ' symbol'
        + (sample.dropped === 1 ? '' : 's') + ' cut off, excluded from ground truth</span>';
    }

    els.stressExpected.innerHTML = sample.barcodes.map(function (barcode, i) {
      var type = TYPES[barcode.bcid];
      var visible = Math.round(barcode.visible * 100);
      return '<tr><td>' + (i + 1) + '</td><td>'
        + escapeText(type ? type.label : barcode.bcid) + '</td><td>'
        + escapeText(barcode.text) + '</td><td class="'
        + (visible < 75 ? 'visible-low' : '') + '">' + visible + '%</td></tr>';
    }).join('');
    if (sample.barcodes.length === 0) {
      els.stressExpected.innerHTML = '<tr><td colspan="4"><em>No symbol survived the crop.</em></td></tr>';
    }

    els.stressApplied.textContent = 'Conditions for this image: '
      + describeApplied(sample) + '.';
  }

  /* Labels for the keys the engine can add that are not degradation rows. */
  var EXTRA_CONDITION_LABELS = {
    frame_requested: ['frame padding asked for', '× symbol'],
    module_requested: ['module size asked for', 'px/module'],
    difficulty: ['difficulty factor', '']
  };

  /* The engine decides which conditions exist and in what order — it trims the
     ones sitting at undamaged and sorts the rest by severity. The UI only puts
     labels on them, so the preview and the annotation cannot disagree about
     what was applied. */
  function describeApplied(sample) {
    var conditions = window.BarcodeStress.describeApplied(sample, stress.data
      ? stress.data.spec.degradations : null);
    var parts = [];
    Object.keys(conditions).forEach(function (id) {
      if (id === 'inverted') {
        if (conditions[id]) parts.push('inverted');
        return;
      }
      var degradation = TYPES.degradations[id];
      var extra = EXTRA_CONDITION_LABELS[id];
      if (degradation) {
        parts.push(degradation.label.toLowerCase() + ' ' + conditions[id] + ' ' + degradation.unit);
      } else if (extra) {
        parts.push(extra[0] + ' ' + conditions[id] + (extra[1] ? ' ' + extra[1] : ''));
      } else {
        parts.push(id + ' ' + conditions[id]);
      }
    });
    return parts.length ? parts.join(', ') : 'nothing applied';
  }

  /* ---- export ------------------------------------------------------ */

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadDatasetZip() {
    var data = stress.data;
    if (!data) return;
    showStressError(els.stressExportError, null);
    els.stressZipBtn.disabled = true;
    els.stressProgressText.textContent = 'Packing the ZIP…';
    els.stressProgress.hidden = false;
    els.stressProgressBar.style.width = '100%';

    Promise.all(data.samples.map(function (sample) {
      return sample.blob.arrayBuffer().then(function (buffer) {
        return { name: 'images/' + sample.name, data: new Uint8Array(buffer) };
      });
    })).then(function (images) {
      var json = JSON.stringify(data.annotation, null, 2);
      var entries = [{ name: 'annotations.json', data: utf8Bytes(json) }].concat(images);
      downloadBlob(window.BarcodeStress.buildZip(entries),
        'barcode-stress-' + data.spec.seed.replace(/[^A-Za-z0-9_-]+/g, '_') + '.zip');
      analytics.action('stress_export', {
        kind: 'zip',
        images: data.annotation.total_images,
        barcodes: data.annotation.total_barcodes
      });
      els.stressStatus.textContent = 'Exported ' + data.annotation.total_images + ' images and '
        + data.annotation.total_barcodes + ' expected barcodes. Drop the ZIP into the scanner benchmark.';
      els.stressZipBtn.disabled = false;
      els.stressProgress.hidden = true;
    }).catch(function (error) {
      console.error(error);
      els.stressZipBtn.disabled = false;
      els.stressProgress.hidden = true;
      showStressError(els.stressExportError, 'The ZIP could not be built: ' + error.message);
    });
  }

  function utf8Bytes(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text);
    var out = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return bytes;
  }

  function downloadAnnotations() {
    var data = stress.data;
    if (!data) return;
    downloadBlob(new Blob([JSON.stringify(data.annotation, null, 2)],
      { type: 'application/json' }), 'annotations.json');
    analytics.action('stress_export', { kind: 'annotations' });
  }

  function downloadCurrentSample() {
    var data = stress.data;
    if (!data) return;
    var sample = data.samples[stress.index];
    downloadBlob(sample.blob, sample.name);
    analytics.action('stress_export', { kind: 'image' });
  }

  function escapeText(value) {
    var div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  /* ---- mode -------------------------------------------------------- */

  function setPageMode(mode) {
    var single = mode === 'single';
    els.mode_single.hidden = !single;
    els.mode_stress.hidden = single;
    els.modeTabSingle.classList.toggle('is-active', single);
    els.modeTabStress.classList.toggle('is-active', !single);
    els.modeTabSingle.setAttribute('aria-selected', String(single));
    els.modeTabStress.setAttribute('aria-selected', String(!single));
    if (!single && stress.available && !stress.initialised) {
      stress.initialised = true;
      /* Build straight away: an empty preview panel reads as a broken page, and
         the build is the point of the mode. */
      buildStressDataset();
    }
  }

  function bindStress() {
    els.modeTabSingle.addEventListener('click', function () { setPageMode('single'); });
    els.modeTabStress.addEventListener('click', function () { setPageMode('stress'); });

    els.stressPreset.addEventListener('change', function () {
      var value = els.stressPreset.value;
      if (value === PRESET_CUSTOM) return;
      applyPreset(value);
    });
    els.stressResetBtn.addEventListener('click', function () {
      applyPreset(stress.preset === PRESET_CUSTOM ? 'mixed' : stress.preset);
    });
    els.stressBuildBtn.addEventListener('click', function () {
      buildStressDataset();
    });
    els.stressSeedBtn.addEventListener('click', function () {
      /* A short, readable, URL-safe seed — the point is that it can be written
         down and typed back in. */
      els.stressSeed.value = 'seed-' + Math.floor(Math.random() * 0xffffffff).toString(36);
      buildStressDataset();
    });
    els.stressPrevBtn.addEventListener('click', function () { showSample(stress.index - 1); });
    els.stressNextBtn.addEventListener('click', function () { showSample(stress.index + 1); });
    els.stressZipBtn.addEventListener('click', downloadDatasetZip);
    els.stressJsonBtn.addEventListener('click', downloadAnnotations);
    els.stressPngBtn.addEventListener('click', downloadCurrentSample);

    [els.stressSamples, els.stressSymbols].forEach(function (input) {
      input.addEventListener('change', function () {
        var max = window.BarcodeStress.MAX_SAMPLES;
        var value = parseInt(input.value, 10);
        if (!isFinite(value)) value = 1;
        input.value = Math.max(1, Math.min(Number(input.max) || max, value));
      });
    });
  }

  function initStress() {
    /* Bind the tab before checking anything else. If the engine is missing — a
       stale cache, a blocked script, a partial deploy — an early return here
       leaves the tab inert, and the message explaining the problem is inside
       the panel the visitor can no longer open. "Clicking does nothing" is the
       one failure this page must not have, so the switch always works and the
       report lives inside it. */
    bindStress();

    /* stress.js depends on nothing but bwip-js, so this is the whole check:
       either the one script arrived or the mode is unavailable. It used to
       also require a shared geometry file, and a deploy that copied the demo
       folder without its sibling directory left the mode dead with an empty
       preset list — a dependency this page never needed. */
    if (!window.BarcodeStress) {
      var message = 'The stress-test engine did not load — stress.js is missing or was '
        + 'served from a stale cache. Reload the page (Ctrl+F5); if it still fails, check '
        + 'that the file is reachable.';
      els.stressError.textContent = message;
      els.stressError.classList.add('is-visible');
      els.stressBuildBtn.disabled = true;
      els.stressStatus.textContent = 'This mode is unavailable.';
      console.error('[barcode generator] ' + message);
      return;
    }

    stress.available = true;
    window.BarcodeStress.DEGRADATIONS.forEach(function (degradation) {
      TYPES.degradations[degradation.id] = degradation;
    });
    populateStressSelects();
    buildDegradeRows();
    applyPreset('mixed');
    els.stressSymbology.value = 'mixed';
  }

  /* ------------------------------------------------------------------ *
   * Bootstrap
   * ------------------------------------------------------------------ */

  function updateTypeHint() {
    var type = TYPES[els.barcodeType.value] || SYMBOLOGIES[0];
    els.typeHint.textContent = type.hint;
  }

  function populateTypes() {
    var groups = { '2D': document.createElement('optgroup'), '1D': document.createElement('optgroup') };
    groups['2D'].label = '2D barcodes';
    groups['1D'].label = '1D barcodes';
    SYMBOLOGIES.forEach(function (type) {
      var option = document.createElement('option');
      option.value = type.id;
      option.textContent = type.label;
      groups[type.kind].appendChild(option);
    });
    els.barcodeType.appendChild(groups['2D']);
    els.barcodeType.appendChild(groups['1D']);
    els.barcodeType.value = 'qrcode';
  }

  function bind() {
    els.generateBtn.addEventListener('click', function () { generate('direct'); });
    els.randomBtn.addEventListener('click', function () { randomize('random'); });
    els.mixedBtn.addEventListener('click', function () { randomize('mixed'); });
    els.downloadBtn.addEventListener('click', download);
    els.copyBtn.addEventListener('click', copyImage);

    var timer = null;
    els.text.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { generate('internal'); }, 350);
    });

    els.barcodeType.addEventListener('change', function () {
      // Switching symbology can make the current text invalid (EAN-13 needs
      // digits, Code 39 capitals). Swap in a sample value when that happens.
      var type = TYPES[els.barcodeType.value];
      var text = els.text.value.trim();
      if (!text || (type.check && type.check(text))) {
        els.text.value = type.random();
      }
      updateTypeHint();
      generate('internal');
    });

    [els.rows, els.cols].forEach(function (input) {
      input.addEventListener('change', function () { generate('internal'); });
    });
  }

  function init() {
    ['text', 'barcodeType', 'typeHint', 'rows', 'cols', 'barcodeCanvas', 'renderStatus', 'formError',
      'generateBtn', 'randomBtn', 'mixedBtn', 'downloadBtn', 'copyBtn'].concat(STRESS_IDS)
      .forEach(function (id) {
        els[id] = document.getElementById(id);
      });

    populateTypes();
    updateTypeHint();
    bind();
    initStress();
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
