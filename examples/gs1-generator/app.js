/*
 * Online GS1 Barcode Generator.
 *
 * Two jobs, in this order:
 *   1. build a payload that is actually well formed — the AI table, the length
 *      rules and the mod-10 check digits live in gs1-payload.js, not here;
 *   2. render it, and state what a scanner should report back, so the downloaded
 *      image and the table beside it form one test case.
 *
 * Everything runs in the browser. bwip-js (BWIPP) does the encoding; no SDK and
 * no licence key are involved, which is why the symbol is verified by the
 * oracle table rather than by decoding it here.
 */
(function () {
  'use strict';

  var P = window.GS1Payload;

  var analytics = window.DemoAnalytics || {
    ready: function () { }, error: function () { }, start: function () { },
    success: function () { }, fail: function () { }, action: function () { },
    trialClick: function () { }
  };

  var APP_START = (window.performance && performance.now) ? performance.now() : Date.now();

  /* ------------------------------------------------------------------ *
   * Product copy
   *
   * The label around the symbol is what makes the image realistic — a camera
   * sees packaging, not a bare barcode. These are presentation strings only;
   * they never reach the payload.
   * ------------------------------------------------------------------ */

  var PRODUCTS = {
    retail: { brand: 'NORTHFIELD', name: 'Whole Bean Coffee', detail: 'Roasted arabica · 500 g', price: '£7.49' },
    fresh: { brand: 'GREENFIELD FARMS', name: 'Vine Tomatoes', detail: 'Class I · sold by weight', price: '£3.20/kg' },
    pharma: { brand: 'CALDERA PHARMA', name: 'Amoxicillin 500 mg', detail: '21 capsules · keep out of reach of children', price: 'Rx only' },
    carton: { brand: 'NORTHFIELD LOGISTICS', name: 'Outer carton — 12 units', detail: 'Handle with care · keep dry', price: 'SSCC' },
    itf: { brand: 'NORTHFIELD LOGISTICS', name: 'Corrugated case — 24 units', detail: 'Do not stack above 6 high', price: 'ITF-14' },
    ordered: { brand: 'NORTHFIELD LOGISTICS', name: 'Pallet — mixed SKU', detail: 'Deliver to dock 4', price: 'Order' },
    ratio: { brand: 'NORTHFIELD', name: 'Sparkling Water', detail: 'Multipack · 6 × 500 ml', price: '£4.20' },
    asset: { brand: 'PROPERTY OF NORTHFIELD', name: 'Returnable transit pallet', detail: 'Scan on return to depot', price: 'Asset' },
    pricemarked: { brand: 'NORTHFIELD', name: 'Cheddar truckle', detail: 'Matured 12 months · price marked', price: '' },
    qr: { brand: 'NORTHFIELD', name: 'Single-origin cocoa', detail: 'Scan for provenance', price: '£5.95' },
    custom: { brand: 'NORTHFIELD', name: 'Custom reference', detail: 'Built from the elements below', price: '' }
  };

  /* Per-symbology encoder settings. `scale` is the module size in pixels,
     `height` the bar height in millimetres for the linear formats. A taller
     symbol is easier for a camera to find; a truncated one saves label space. */
  var RENDER = {
    databaromni: { scale: 4, height: 18 },
    databartruncated: { scale: 4, height: 8 },
    databarstacked: { scale: 4, height: 20 },
    databarstackedomni: { scale: 4, height: 34 },
    databarlimited: { scale: 5, height: 18 },
    databarexpanded: { scale: 4, height: 26 },
    databarexpandedstacked: { scale: 4, height: 30, columns: 4 },
    gs1datamatrix: { scale: 6 },
    gs1qrcode: { scale: 5 },
    gs1_128: { scale: 3, height: 22 },
    itf14: { scale: 3, height: 22 },
    ean13: { scale: 3, height: 20 }
  };

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  var state = {
    scenario: 'pharma',
    symbology: 'gs1datamatrix',
    rows: [],
    previewMode: 'label'
  };

  var lastRun = null;
  var renderToken = 0;
  var els = {};
  var debounceTimer = null;

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function svgIcon(paths, viewBox) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox || '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (entry) {
      var shape = document.createElementNS('http://www.w3.org/2000/svg', entry.tag);
      Object.keys(entry.attrs).forEach(function (key) {
        shape.setAttribute(key, entry.attrs[key]);
      });
      svg.appendChild(shape);
    });
    return svg;
  }

  function truncateMid(text, max) {
    if (text.length <= max) return text;
    var head = Math.ceil((max - 1) / 2);
    return text.slice(0, head) + '…' + text.slice(text.length - (max - 1 - head));
  }

  /* ------------------------------------------------------------------ *
   * Element editor
   * ------------------------------------------------------------------ */

  function renderElements() {
    var issues = P.validate(state.rows, state.symbology);
    var withError = {};
    issues.forEach(function (issue) {
      if (issue.level === 'error' && issue.ai) withError[issue.ai] = issue.message;
    });

    els.elementList.replaceChildren();

    state.rows.forEach(function (item, index) {
      var row = node('div', 'element-row' + (withError[item.ai] ? ' has-error' : ''));

      /* AI picker */
      var aiField = node('div', 'element-field');
      aiField.appendChild(node('label', null, 'Application identifier'));
      var aiSelect = node('select', 'form-control');
      buildAiOptions(aiSelect, item.ai, index);
      aiSelect.addEventListener('change', function () {
        state.rows[index].ai = aiSelect.value;
        var entry = P.AI_BY_CODE[aiSelect.value];
        if (entry) state.rows[index].value = entry.sample();
        updateEverything('ai');
      });
      aiField.appendChild(aiSelect);
      row.appendChild(aiField);

      /* Value */
      var valueField = node('div', 'element-field');
      var entry = P.AI_BY_CODE[item.ai];
      var caption = 'Data';
      if (entry) {
        caption = 'Data — ' + (entry.fixed ? entry.fixed + ' digits' : 'up to ' + entry.max + ' characters');
      }
      valueField.appendChild(node('label', null, caption));
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control element-value-mono';
      input.value = item.value;
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Value for AI ' + item.ai);
      input.addEventListener('input', function () {
        state.rows[index].value = input.value.trim();
        scheduleUpdate();
      });
      valueField.appendChild(input);
      row.appendChild(valueField);

      /* Remove */
      var remove = node('button', 'element-remove');
      remove.type = 'button';
      remove.title = 'Remove AI ' + item.ai;
      remove.setAttribute('aria-label', 'Remove AI ' + item.ai);
      remove.disabled = state.rows.length <= 1;
      remove.appendChild(svgIcon([
        { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
        { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } }
      ]));
      remove.addEventListener('click', function () {
        state.rows.splice(index, 1);
        updateEverything('remove');
      });
      row.appendChild(remove);

      if (withError[item.ai]) {
        row.appendChild(node('p', 'element-issues', withError[item.ai]));
      }

      els.elementList.appendChild(row);
    });

    showIssues(issues);
  }

  /* Group the AI picker by purpose, with the everyday ones first. */
  function buildAiOptions(select, selected, rowIndex) {
    var groups = {};
    var order = [];
    P.AI_LIST.forEach(function (entry) {
      if (!groups[entry.group]) { groups[entry.group] = []; order.push(entry.group); }
      groups[entry.group].push(entry);
    });

    var common = node('optgroup');
    common.label = 'Common';
    P.COMMON_AIS.forEach(function (ai) {
      var entry = P.AI_BY_CODE[ai];
      if (!entry) return;
      var option = node('option', null, '(' + ai + ') ' + entry.title);
      option.value = ai;
      common.appendChild(option);
    });
    select.appendChild(common);

    order.forEach(function (group) {
      var optgroup = node('optgroup');
      optgroup.label = group;
      groups[group].forEach(function (entry) {
        var option = node('option', null, '(' + entry.ai + ') ' + entry.title);
        option.value = entry.ai;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });

    select.value = selected;
    select.setAttribute('aria-label', 'Application identifier for element ' + (rowIndex + 1));
  }

  function buildAddSelect() {
    var select = els.addAiSelect;
    select.replaceChildren();
    P.COMMON_AIS.forEach(function (ai) {
      var entry = P.AI_BY_CODE[ai];
      if (!entry) return;
      var option = node('option', null, '(' + ai + ') ' + entry.title);
      option.value = ai;
      select.appendChild(option);
    });
  }

  function showIssues(issues) {
    els.formError.replaceChildren();
    if (!issues.length) {
      els.formError.classList.remove('is-visible');
      return;
    }

    var levels = ['error', 'warn', 'info'];
    var titles = { error: 'Cannot encode this payload', warn: 'Worth checking', info: 'How this payload is separated' };

    levels.forEach(function (level) {
      var list = issues.filter(function (issue) { return issue.level === level; });
      if (!list.length) return;
      var box = node('ul', 'note-list is-' + level);
      box.appendChild(node('li', null, titles[level]));
      list.forEach(function (issue) {
        box.appendChild(node('li', null, (issue.ai ? 'AI ' + issue.ai + ': ' : '') + issue.message));
      });
      els.formError.appendChild(box);
    });
    els.formError.classList.add('is-visible');
  }

  /* ------------------------------------------------------------------ *
   * Encoding
   * ------------------------------------------------------------------ */

  /* Encode the symbol, then re-encode at a smaller whole-number module scale if
     it is wider or taller than the space available.

     Re-encoding rather than down-scaling the finished image is the whole point.
     Scaling a linear symbol by a fraction blurs the module edges, and a symbol
     whose modules are no longer resolvable cannot be decoded however good the
     scanner is — the label would then be a test of nothing. Keeping the module
     size an integer number of pixels keeps every bar edge crisp at any size. */
  function encodeSymbol(maxWidth, maxHeight) {
    var encoder = P.toEncoderInput(state.rows, state.symbology);
    if (encoder.error) return Promise.reject(new Error(encoder.error));

    var render = RENDER[state.symbology] || { scale: 4 };
    var scale = render.scale;

    function attempt() {
      var options = {
        bcid: encoder.bcid,
        text: encoder.text,
        scale: scale,
        includetext: false,
        /* A quiet zone is part of the specification, not a nicety: a symbol that
           touches its own border is materially harder to decode. */
        paddingwidth: 4,
        paddingheight: 4
      };
      if (render.height) options.height = render.height;
      if (render.columns && state.symbology === 'databarexpandedstacked') {
        options.columns = render.columns;
      }

      var canvas = document.createElement('canvas');
      return new Promise(function (resolve, reject) {
        var pending;
        try {
          pending = window.bwipjs.toCanvas(canvas, options);
        } catch (error) {
          reject(error);
          return;
        }
        if (pending && typeof pending.then === 'function') pending.then(function () { resolve(canvas); }, reject);
        else resolve(canvas);
      });
    }

    function fits(canvas) {
      if (maxWidth && canvas.width > maxWidth) return false;
      if (maxHeight && canvas.height > maxHeight) return false;
      return true;
    }

    function step(passesLeft) {
      return attempt().then(function (canvas) {
        if (fits(canvas) || scale <= 1 || passesLeft <= 0) return canvas;
        var budget = Math.min(
          maxWidth ? maxWidth / canvas.width : 1,
          maxHeight ? maxHeight / canvas.height : 1
        );
        var next = Math.max(1, Math.floor(scale * budget));
        if (next >= scale) return canvas;
        scale = next;
        return step(passesLeft - 1);
      });
    }

    var requested = render.scale;

    return step(3).then(function (canvas) {
      /* If even one pixel per module overflows, the caller has to scale the
         result down; there is nothing smaller to encode at. */
      return {
        canvas: canvas,
        encoder: encoder,
        fitted: fits(canvas),
        scale: scale,
        reduced: scale < requested
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * Canvas rendering
   * ------------------------------------------------------------------ */

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
    while (out.length > 1 && ctx.measureText(out + '\u2026').width > maxWidth) out = out.slice(0, -1);
    return out + '\u2026';
  }

  /* Break text to fit a width, preferring a break at a space but splitting a
     long unbroken token (an HRI string, a serial) when there is no choice. The
     last line gets an ellipsis rather than being dropped. Binary search keeps it
     O(log n) measureText calls, which matters because the HRI is redrawn on
     every keystroke. */
  function wrapText(ctx, text, maxWidth, maxLines) {
    var value = String(text == null ? '' : text);
    if (!value) return [];
    if (ctx.measureText(value).width <= maxWidth) return [value];

    var lines = [];
    var rest = value;

    while (rest.length && lines.length < maxLines) {
      var isLastLine = lines.length === maxLines - 1;

      var low = 1;
      var high = rest.length;
      var fit = 0;
      while (low <= high) {
        var mid = (low + high) >> 1;
        if (ctx.measureText(rest.slice(0, mid)).width <= maxWidth) {
          fit = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (fit < 1) fit = 1;

      if (isLastLine) {
        lines.push(fitText(ctx, rest, maxWidth));
        return lines;
      }

      var space = rest.lastIndexOf(' ', fit);
      if (space > fit * 0.6) fit = space;

      lines.push(rest.slice(0, fit));
      rest = rest.slice(fit).replace(/^\s+/, '');
    }

    return lines;
  }

  var INK = '#323234';
  var MUTED = '#606060';
  var ORANGE = '#fe8e14';
  var HAIRLINE = '#eeeeee';

  /* The label: what packaging looks like, with the symbol where it belongs.
     The symbol gets a full-width band rather than a corner, because a logistic
     GS1-128 with five data elements is a lot of bars to fit, and squeezing it
     into a narrow column is how a test label ends up undecodable. */
  function drawLabel(ctx, symbol, width, height, fitted) {
    var product = PRODUCTS[state.scenario] || PRODUCTS.custom;
    var padX = 46;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 2;
    roundRect(ctx, 14, 14, width - 28, height - 28, 10);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* --- identity block ------------------------------------------------ */
    ctx.fillStyle = ORANGE;
    ctx.fillRect(padX, 44, 54, 5);

    ctx.font = '600 13px Arial, Helvetica, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(product.brand, padX, 74);

    var leftWidth = Math.round((width - padX * 2) * 0.5);

    ctx.font = '700 28px Arial, Helvetica, sans-serif';
    ctx.fillStyle = INK;
    var nameY = 108;
    wrapText(ctx, product.name, leftWidth, 2).forEach(function (line) {
      ctx.fillText(line, padX, nameY);
      nameY += 34;
    });

    ctx.font = '400 14px Arial, Helvetica, sans-serif';
    ctx.fillStyle = MUTED;
    wrapText(ctx, product.detail, leftWidth, 2).forEach(function (line) {
      ctx.fillText(line, padX, nameY + 2);
      nameY += 19;
    });

    if (product.price) {
      ctx.font = '700 22px Arial, Helvetica, sans-serif';
      ctx.fillStyle = INK;
      ctx.fillText(product.price, padX, nameY + 18);
    }

    /* --- the identifiers in human-readable form, right of the identity --- */
    var factsX = padX + leftWidth + 26;
    var factsWidth = width - padX - factsX;
    ctx.font = '400 13px "Courier New", Courier, monospace';
    var factY = 74;
    P.expectedElements(state.rows).forEach(function (element) {
      if (factY > 188) return;
      ctx.fillStyle = MUTED;
      ctx.fillText('(' + element.ai + ')', factsX, factY);
      ctx.fillStyle = INK;
      ctx.fillText(fitText(ctx, element.title + ': ' + element.display, factsWidth - 54),
          factsX + 52, factY);
      factY += 20;
    });

    ctx.save();
    ctx.translate(width * 0.62, 150);
    ctx.rotate(-Math.PI / 12);
    ctx.font = '700 72px Arial, Helvetica, sans-serif';
    ctx.fillStyle = 'rgba(254, 142, 20, 0.13)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SAMPLE', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.strokeStyle = HAIRLINE;
    ctx.beginPath();
    ctx.moveTo(padX, 206);
    ctx.lineTo(width - padX, 206);
    ctx.stroke();

    /* --- symbol band ---------------------------------------------------- */
    var bandTop = 220;
    var bandBottom = height - 76;
    var bandLeft = padX;
    var bandWidth = width - padX * 2;

    ctx.fillStyle = '#f7f7f7';
    roundRect(ctx, bandLeft, bandTop, bandWidth, bandBottom - bandTop, 8);
    ctx.fill();

    /* The HRI has to be measured before the symbol can be positioned, because it
       sits directly underneath and the symbol must leave room for it. */
    ctx.font = '400 12px "Courier New", Courier, monospace';
    var hriLines = wrapText(ctx, P.toHRI(state.rows), bandWidth - 40, 3);
    var hriHeight = hriLines.length * 17 + 10;

    var inset = 12;
    var innerLeft = bandLeft + inset;
    var innerWidth = bandWidth - inset * 2;
    var innerTop = bandTop + inset;
    var innerHeight = bandBottom - bandTop - inset * 2 - hriHeight;

    ctx.fillStyle = '#ffffff';
    roundRect(ctx, innerLeft, innerTop, innerWidth, innerHeight, 4);
    ctx.fill();

    var availableWidth = innerWidth - 20;
    var availableHeight = innerHeight - 16;
    var drawScale = Math.min(1, availableWidth / symbol.width, availableHeight / symbol.height);
    var drawWidth = Math.max(1, Math.round(symbol.width * drawScale));
    var drawHeight = Math.max(1, Math.round(symbol.height * drawScale));
    var drawX = Math.round(innerLeft + (innerWidth - drawWidth) / 2);
    var drawY = Math.round(innerTop + (innerHeight - drawHeight) / 2);

    ctx.imageSmoothingEnabled = drawScale < 1;
    ctx.drawImage(symbol, drawX, drawY, drawWidth, drawHeight);
    ctx.imageSmoothingEnabled = true;

    /* HRI under the symbol, centred on it - the way GS1 prints it. */
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    hriLines.forEach(function (line, index) {
      ctx.fillText(line, innerLeft + innerWidth / 2,
          bandBottom - hriHeight + 16 + index * 17);
    });
    ctx.textAlign = 'left';

    /* --- footer --------------------------------------------------------- */
    ctx.strokeStyle = HAIRLINE;
    ctx.beginPath();
    ctx.moveTo(padX, height - 62);
    ctx.lineTo(width - padX, height - 62);
    ctx.stroke();

    ctx.font = '600 12px Arial, Helvetica, sans-serif';
    ctx.fillStyle = ORANGE;
    ctx.fillText('SAMPLE \u2014 NOT FOR SALE', padX, height - 40);

    ctx.textAlign = 'right';
    ctx.font = '400 12px Arial, Helvetica, sans-serif';
    ctx.fillStyle = MUTED;
    var note = 'GS1 test label \u00b7 synthetic data';
    if (!fitted) note += ' \u00b7 symbol scaled to fit';
    ctx.fillText(note, width - padX, height - 40);
    ctx.textAlign = 'left';
  }

  /* Symbol only: the bare symbol with a white quiet zone, for a decoder test. */
  function drawSymbolOnly(ctx, symbol, width, height) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    var margin = 40;
    var scale = Math.min(1,
        (width - margin * 2) / symbol.width,
        (height - margin * 2) / symbol.height);
    var drawWidth = Math.max(1, Math.round(symbol.width * scale));
    var drawHeight = Math.max(1, Math.round(symbol.height * scale));
    var x = Math.round((width - drawWidth) / 2);
    var y = Math.round((height - drawHeight) / 2);

    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(symbol, x, y, drawWidth, drawHeight);
    ctx.imageSmoothingEnabled = true;
  }

  /* The space the symbol may occupy in the current preview mode. Asking for a
     symbol that fits means the label never has to scale one down, which is the
     difference between a crisp test image and a blurred one. */
  function previewBudget() {
    var canvas = els.previewCanvas;
    if (state.previewMode === 'symbol') {
      return { width: canvas.width - 80, height: canvas.height - 80 };
    }
    return {
      width: canvas.width - 2 * 46 - 2 * 12 - 20,
      height: canvas.height - 220 - 76 - 2 * 12 - 10 - 3 * 17 - 16
    };
  }

  function renderPreview(symbol, fitted) {
    var canvas = els.previewCanvas;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.previewMode === 'label') {
      drawLabel(ctx, symbol, canvas.width, canvas.height, fitted);
    } else {
      drawSymbolOnly(ctx, symbol, canvas.width, canvas.height);
    }
  }

  /* ------------------------------------------------------------------ *
   * Expected result
   * ------------------------------------------------------------------ */

  function renderExpected() {
    var rows = state.rows;

    els.expectedElementString.replaceChildren();
    P.toElementString(rows).split(P.SEP).forEach(function (part, index, all) {
      els.expectedElementString.appendChild(document.createTextNode(part));
      if (index < all.length - 1) {
        els.expectedElementString.appendChild(node('span', 'sep', ' | '));
      }
    });

    els.expectedHri.textContent = P.toHRI(rows) || '—';

    var tbody = els.expectedRows;
    tbody.replaceChildren();
    P.expectedElements(rows).forEach(function (element) {
      var tr = node('tr');
      tr.appendChild(node('td', null, '(' + element.ai + ')'));
      tr.appendChild(node('td', null, element.title));

      var valueCell = node('td');
      valueCell.appendChild(node('span', null, element.display));
      if (element.variable) valueCell.appendChild(node('span', 'hint', ' (variable length)'));
      tr.appendChild(valueCell);

      var checkCell = node('td');
      if (element.checkDigit === 'verified') checkCell.appendChild(node('span', 'check-ok', 'verified'));
      else if (element.checkDigit === 'failed') checkCell.appendChild(node('span', 'check-bad', 'failed'));
      else checkCell.textContent = '—';
      tr.appendChild(checkCell);

      tbody.appendChild(tr);
    });

    var link = P.expectedDigitalLink(rows);
    els.expectedDigitalLink.textContent = link || '— none: a Digital Link needs a GTIN or an ITIP.';
  }

  function renderSymbologyTable() {
    var tbody = els.symbologyTable;
    tbody.replaceChildren();
    P.SYMBOLOGIES.forEach(function (sym) {
      var tr = node('tr');
      tr.appendChild(node('td', null, sym.label));
      tr.appendChild(node('td', 'kind', sym.kind));
      var note = sym.note;
      if (sym.gtinOnly) note += ' GTIN only — no batch, date or serial.';
      tr.appendChild(node('td', null, note));
      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------ *
   * Update cycle
   * ------------------------------------------------------------------ */

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { updateEverything('input'); }, 280);
  }

  function updateEverything(source) {
    var issues = P.validate(state.rows, state.symbology);
    var blocked = P.hasErrors(issues);

    renderElements();
    if (blocked) {
      els.renderStatus.textContent = 'Fix the payload before generating.';
      els.renderStatus.classList.add('is-error');
      els.downloadBtn.disabled = true;
      return Promise.resolve(false);
    }
    els.renderStatus.classList.remove('is-error');
    renderExpected();

    var token = ++renderToken;
    var budget = previewBudget();
    els.renderStatus.textContent = 'Generating…';
    els.downloadBtn.disabled = true;

    return encodeSymbol(budget.width, budget.height).then(function (result) {
      if (token !== renderToken) return false;
      renderPreview(result.canvas, result.fitted);
      lastRun = {
        encoder: result.encoder,
        canvas: result.canvas,
        fitted: result.fitted,
        symbology: state.symbology,
        scenario: state.scenario,
        elementString: P.toElementString(state.rows)
      };
      var notes = [];
      if (!result.fitted) {
        notes.push('the symbol is wider than the frame and is being scaled down');
      } else if (result.reduced && result.scale <= 1) {
        /* One pixel per module is the floor. It decodes from a clean image, but a
           camera has little margin, so say so rather than let a weak test image
           be mistaken for a weak reader. */
        notes.push('module size is down to 1 px to fit the label — shorten the payload for a '
          + 'test image that a camera can read comfortably');
      } else if (result.reduced) {
        notes.push('module size reduced to ' + result.scale + ' px to fit the label');
      }

      els.renderStatus.textContent = 'Rendered ' + (P.SYM_BY_ID[state.symbology] || {}).label
        + ' · symbol ' + result.canvas.width + ' × ' + result.canvas.height + ' px'
        + ' · export ' + els.previewCanvas.width + ' × ' + els.previewCanvas.height + ' px'
        + (notes.length ? ' · ' + notes.join(' · ') : '');
      els.renderStatus.classList.toggle('is-error', !result.fitted);
      els.downloadBtn.disabled = false;
      if (source && source !== 'init') {
        analytics.action('render', {
          scenario: state.scenario,
          symbology: state.symbology,
          elements: state.rows.length,
          mode: state.previewMode
        });
      }
      return true;
    }).catch(function (error) {
      if (token !== renderToken) return false;
      console.error(error);
      var message = String((error && error.message) || error)
        .replace(/^bwipp\.[^#]*#\d+:\s*/, '');
      els.renderStatus.textContent = 'This symbol could not be rendered: ' + message;
      els.renderStatus.classList.add('is-error');
      /* Nothing new was drawn, so the previous canvas stays on screen. Offering
         it for download would hand out an image that does not match the payload
         on screen — the one thing a test generator must never do. */
      els.downloadBtn.disabled = true;
      analytics.error('render_failed', message.slice(0, 120));
      return false;
    });
  }

  /* ------------------------------------------------------------------ *
   * Scenarios
   * ------------------------------------------------------------------ */

  function applyScenario(id, source) {
    var scenario = P.SCENARIOS.filter(function (entry) { return entry.id === id; })[0] || P.SCENARIOS[0];
    state.scenario = scenario.id;
    state.rows = scenario.build();
    state.symbology = scenario.symbology;
    els.scenario.value = scenario.id;
    els.symbology.value = scenario.symbology;
    els.scenarioNote.textContent = scenario.note;
    updateSymbologyNote();
    if (source) analytics.action('scenario', { scenario: scenario.id });
    return updateEverything(source);
  }

  function updateSymbologyNote() {
    var decision = P.decide(state.rows);
    var recommended = P.SYM_BY_ID[decision.symbology];
    var selected = P.SYM_BY_ID[state.symbology];
    var text = (selected ? selected.note : '') + ' ';
    if (decision.symbology === state.symbology) {
      text += 'The recommended choice for this payload: ' + decision.reason;
    } else {
      text += 'Note: ' + (recommended ? recommended.label : decision.symbology)
        + ' is the more usual carrier here — ' + decision.reason;
    }
    els.symbologyNote.textContent = text;
  }

  function randomize() {
    var scenario = P.SCENARIOS.filter(function (entry) { return entry.id === state.scenario; })[0];
    if (scenario && state.scenario !== 'custom') {
      state.rows = scenario.build();
    } else {
      state.rows = state.rows.map(function (item) {
        var entry = P.AI_BY_CODE[item.ai];
        return { ai: item.ai, value: entry ? entry.sample() : item.value };
      });
    }
    analytics.action('randomize', { scenario: state.scenario });
    updateEverything('randomize');
  }

  function addElement() {
    var ai = els.addAiSelect.value;
    var entry = P.AI_BY_CODE[ai];
    if (!entry) return;
    state.rows.push({ ai: ai, value: entry.sample() });
    analytics.action('add_element', { ai: ai });
    updateEverything('add').then(function () {
      var inputs = els.elementList.querySelectorAll('input');
      if (inputs.length) {
        var last = inputs[inputs.length - 1];
        last.focus();
        last.select();
      }
    });
  }

  /* Switching the preview changes how much room the symbol has, so the symbol is
     re-encoded for the new frame rather than the old one being redrawn — the
     symbol-only view exists precisely to export an unresampled symbol. */
  function setPreviewMode(mode) {
    state.previewMode = mode;
    els.modeLabel.setAttribute('aria-pressed', String(mode === 'label'));
    els.modeSymbol.setAttribute('aria-pressed', String(mode === 'symbol'));
    analytics.action('preview_mode', { mode: mode });
    return updateEverything('preview');
  }

  function download() {
    if (!lastRun) return;
    analytics.action('download', {
      scenario: state.scenario,
      symbology: state.symbology,
      mode: state.previewMode
    });
    var name = 'gs1-' + state.scenario + '-' + state.symbology + '-'
      + (state.previewMode === 'label' ? 'label' : 'symbol') + '.png';
    els.previewCanvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  function copyPayload() {
    var label = els.copyBtn.querySelector('.btn-label');
    var reset = label.textContent;
    function flash(message) {
      label.textContent = message;
      setTimeout(function () { label.textContent = reset; }, 1600);
    }
    var text = lastRun ? lastRun.elementString : P.toElementString(state.rows);
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      flash('Copy not supported');
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      analytics.action('copy_payload', { scenario: state.scenario });
      flash('Copied');
    }, function () {
      flash('Copy blocked');
    });
  }

  /* ------------------------------------------------------------------ *
   * Bootstrap
   * ------------------------------------------------------------------ */

  function populateSelects() {
    var scenarioSelect = els.scenario;
    P.SCENARIOS.forEach(function (scenario) {
      var option = node('option', null, scenario.label);
      option.value = scenario.id;
      scenarioSelect.appendChild(option);
    });

    var symbolSelect = els.symbology;
    P.SYMBOLOGIES.forEach(function (sym) {
      var option = node('option', null, sym.label);
      option.value = sym.id;
      symbolSelect.appendChild(option);
    });

    buildAddSelect();
  }

  function bind() {
    els.scenario.addEventListener('change', function () {
      applyScenario(els.scenario.value, 'select');
    });

    els.symbology.addEventListener('change', function () {
      state.symbology = els.symbology.value;
      analytics.action('symbology', { symbology: state.symbology });
      updateSymbologyNote();
      updateEverything('symbology');
    });

    els.randomizeBtn.addEventListener('click', randomize);
    els.recommendBtn.addEventListener('click', function () {
      var decision = P.decide(state.rows);
      state.symbology = decision.symbology;
      els.symbology.value = decision.symbology;
      analytics.action('use_recommended', { symbology: decision.symbology });
      updateSymbologyNote();
      updateEverything('recommend');
    });

    els.addBtn.addEventListener('click', addElement);
    els.modeLabel.addEventListener('click', function () { setPreviewMode('label'); });
    els.modeSymbol.addEventListener('click', function () { setPreviewMode('symbol'); });
    els.downloadBtn.addEventListener('click', download);
    els.copyBtn.addEventListener('click', copyPayload);
  }

  function init() {
    ['scenario', 'symbology', 'scenarioNote', 'symbologyNote', 'elementList', 'addAiSelect',
      'addBtn', 'randomizeBtn', 'recommendBtn', 'formError', 'previewCanvas', 'renderStatus',
      'downloadBtn', 'copyBtn', 'modeLabel', 'modeSymbol', 'expectedElementString',
      'expectedHri', 'expectedRows', 'expectedDigitalLink', 'symbologyTable'].forEach(function (id) {
        els[id] = document.getElementById(id);
      });

    populateSelects();
    renderSymbologyTable();
    bind();

    applyScenario('pharma', null).then(function () {
      analytics.ready(((window.performance && performance.now) ? performance.now() : Date.now()) - APP_START);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
