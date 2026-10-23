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
    retail2d: { brand: 'NORTHFIELD', name: 'Whole Bean Coffee', detail: 'Roasted arabica · 500 g · 2D at the till', price: '£7.49' },
    logistics: { brand: 'NORTHFIELD LOGISTICS', name: 'Pallet — GS1 logistics label', detail: 'SSCC + contents · keep dry', price: 'SSCC' },
    udi: { brand: 'CALDERA MEDICAL', name: 'Surgical stapler — single use', detail: 'UDI direct-part marking · lot + expiry + serial', price: 'Rx only' },
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
    /* A scenario may print a second symbol on the label — the legacy EAN-13
       beside the Sunrise 2027 DataMatrix, or the contents GS1-128 under the
       SSCC. `extra` holds its symbology, its rows and (when it cannot be
       drawn) the reason. Null for single-symbol scenarios. */
    extra: null,
    previewMode: 'label',
    /* Row indexes whose value just changed, so renderElements() can mark them
       briefly. Random values look alike, and without this a click on Randomize
       data reads as "nothing happened". */
    highlight: []
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

    var highlighted = {};
    state.highlight.forEach(function (index) { highlighted[index] = true; });

    els.elementList.replaceChildren();

    state.rows.forEach(function (item, index) {
      var row = node('div', 'element-row'
        + (withError[item.ai] ? ' has-error' : '')
        + (highlighted[index] ? ' just-changed' : ''));

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

    /* Consume the highlight: the marker is on the freshly built rows, and it is
       removed on a timer so a second render is never pre-marked. */
    if (state.highlight.length) {
      var marked = state.highlight;
      state.highlight = [];
      setTimeout(function () {
        marked.forEach(function (index) {
          var row = els.elementList.children[index];
          if (row) row.classList.remove('just-changed');
        });
      }, HIGHLIGHT_MS);
    }
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
    var titles = {
      error: 'Cannot encode this payload',
      warn: 'Worth checking',
      info: 'How this payload is separated'
    };

    levels.forEach(function (level) {
      var list = issues.filter(function (issue) { return issue.level === level; });
      if (!list.length) return;

      var box = node('ul', 'note-list is-' + level);
      box.appendChild(node('li', null, titles[level]));

      list.forEach(function (issue) {
        var item = node('li');
        item.appendChild(node('span', null,
          (issue.ai ? 'AI ' + issue.ai + ': ' : '') + issue.message));

        /* Every explanation that has a remedy gets the remedy beside it. The GS1
           length rules and AI pairings are specialist knowledge, so a message
           that only diagnoses is a dead end for most readers of this page. */
        if (issue.fix) {
          var button = node('button', 'fix-button', issue.fix.label);
          button.type = 'button';
          button.addEventListener('click', function () { applyFix(issue.fix); });
          item.appendChild(button);
        }

        box.appendChild(item);
      });

      els.formError.appendChild(box);
    });

    els.formError.classList.add('is-visible');
  }

  /* Apply one remedy and re-render. Each fix says what it does; nothing here
     guesses, because a fix that changes something unexpected is worse than no
     fix at all. */
  function applyFix(fix) {
    if (!fix) return;

    if (fix.kind === 'set-value') {
      for (var i = 0; i < state.rows.length; i++) {
        if (state.rows[i].ai === fix.ai) {
          state.rows[i].value = fix.value;
          state.highlight = [i];
          break;
        }
      }
    } else if (fix.kind === 'set-symbology') {
      state.symbology = fix.symbology;
      els.symbology.value = fix.symbology;
      updateSymbologyNote();
    } else if (fix.kind === 'add-element') {
      var entry = P.AI_BY_CODE[fix.ai];
      state.rows.push({ ai: fix.ai, value: entry ? entry.sample() : '' });
      state.highlight = [state.rows.length - 1];
    } else {
      return;
    }

    analytics.action('apply_fix', { kind: fix.kind, ai: fix.ai || '', symbology: fix.symbology || '' });
    updateEverything('fix');
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
  function encodeSymbol(rows, symbologyId, maxWidth, maxHeight) {
    var encoder = P.toEncoderInput(rows, symbologyId);
    if (encoder.error) return Promise.reject(new Error(encoder.error));

    var render = RENDER[symbologyId] || { scale: 4 };
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
      if (render.columns && symbologyId === 'databarexpandedstacked') {
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
     into a narrow column is how a test label ends up undecodable. `symbol2` is
     the second symbol a scenario may print — null for single-symbol labels. */
  function drawLabel(ctx, symbol, symbol2, width, height, fitted) {
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

    /* One panel per symbol. Two linear symbols (the logistics label's pair of
       GS1-128s) stack full-width; anything else sits side by side — a 2D
       symbol belongs beside the legacy linear one, not on top of it. */
    var inset = 12;
    var panels;

    if (symbol2) {
      var extraSym = P.SYM_BY_ID[state.extra.symbology] || {};
      var primarySym = P.SYM_BY_ID[state.symbology] || {};
      var stacked = extraSym.kind === '1D' && primarySym.kind === '1D';
      if (stacked) {
        var halfHeight = Math.floor((bandBottom - bandTop - inset * 2 - 6) / 2);
        panels = [
          { x: bandLeft + inset, y: bandTop + inset,
            w: bandWidth - inset * 2, h: halfHeight },
          { x: bandLeft + inset, y: bandTop + inset + halfHeight + 6,
            w: bandWidth - inset * 2, h: halfHeight, secondary: true }
        ];
      } else {
        var columnWidth = Math.floor((bandWidth - inset * 2 - 24) / 2);
        var panelHeight = bandBottom - bandTop - inset * 2;
        panels = [
          { x: bandLeft + inset, y: bandTop + inset, w: columnWidth, h: panelHeight },
          { x: bandLeft + inset + columnWidth + 24, y: bandTop + inset,
            w: columnWidth, h: panelHeight, secondary: true }
        ];
      }
    } else {
      panels = [{
        x: bandLeft + inset, y: bandTop + inset,
        w: bandWidth - inset * 2, h: bandBottom - bandTop - inset * 2
      }];
    }

    panels.forEach(function (panel) {
      drawSymbolPanel(ctx, panel, panel.secondary ? symbol2 : symbol);
    });

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

  /* One symbol inside the band: a white panel, the symbol centred in it, and
     the HRI underneath — the way GS1 prints it. The HRI has to be measured
     before the symbol can be positioned, because the symbol must leave room
     for it. The secondary panel gets a two-line HRI; the primary keeps three. */
  function drawSymbolPanel(ctx, panel, symbol) {
    var secondary = !!panel.secondary;
    var hriText = secondary ? P.toHRI(state.extra.rows) : P.toHRI(state.rows);
    var maxLines = secondary ? 2 : 3;

    ctx.font = '400 12px "Courier New", Courier, monospace';
    var hriLines = wrapText(ctx, hriText, panel.w - 20, maxLines);
    var hriHeight = hriLines.length * 17 + 10;

    var innerHeight = panel.h - hriHeight;

    ctx.fillStyle = '#ffffff';
    roundRect(ctx, panel.x, panel.y, panel.w, innerHeight, 4);
    ctx.fill();

    var availableWidth = panel.w - 20;
    var availableHeight = innerHeight - 16;
    var drawScale = Math.min(1, availableWidth / symbol.width, availableHeight / symbol.height);
    var drawWidth = Math.max(1, Math.round(symbol.width * drawScale));
    var drawHeight = Math.max(1, Math.round(symbol.height * drawScale));
    var drawX = Math.round(panel.x + (panel.w - drawWidth) / 2);
    var drawY = Math.round(panel.y + (innerHeight - drawHeight) / 2);

    ctx.imageSmoothingEnabled = drawScale < 1;
    ctx.drawImage(symbol, drawX, drawY, drawWidth, drawHeight);
    ctx.imageSmoothingEnabled = true;

    /* HRI under the symbol, centred on it - the way GS1 prints it. */
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    hriLines.forEach(function (line, index) {
      ctx.fillText(line, panel.x + panel.w / 2,
          panel.y + panel.h - hriHeight + 16 + index * 17);
    });
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
     difference between a crisp test image and a blurred one.

     When the scenario prints a second symbol, the budget is split by the same
     layout drawLabel uses: two linear symbols stack full-width, anything else
     sits side by side in two columns. */
  function previewBudget() {
    var canvas = els.previewCanvas;
    if (state.previewMode === 'symbol') {
      /* Symbol-only exports the primary symbol; the label mode is where the
         second symbol belongs. */
      return {
        primary: { width: canvas.width - 80, height: canvas.height - 80 },
        extra: null,
        stacked: false
      };
    }

    var padX = 46;
    var inset = 12;
    var bandWidth = canvas.width - padX * 2;
    var innerWidth = bandWidth - inset * 2;
    var innerHeight = canvas.height - 220 - 76 - inset * 2;
    var hriAllowance = 3 * 17 + 10;

    var single = {
      primary: {
        width: innerWidth - 20,
        height: innerHeight - 16 - hriAllowance
      },
      extra: null,
      stacked: false
    };

    var extra = state.extra;
    if (!extra) return single;

    var extraSym = P.SYM_BY_ID[extra.symbology] || {};
    var primarySym = P.SYM_BY_ID[state.symbology] || {};
    var stacked = extraSym.kind === '1D' && primarySym.kind === '1D';

    if (stacked) {
      /* Two full-width linear symbols, one above the other; the primary's HRI
         is up to three lines, the secondary's two. */
      var halfHeight = Math.floor((innerHeight - 6) / 2) - 6;
      return {
        primary: { width: innerWidth - 20, height: halfHeight - 16 - 3 * 17 - 10 },
        extra: { width: innerWidth - 20, height: halfHeight - 16 - 2 * 17 - 10 },
        stacked: true
      };
    }

    /* Side by side: the primary keeps its three-line HRI, the secondary a
       shorter one beneath its own column. */
    var columnWidth = Math.floor((innerWidth - 24) / 2);
    return {
      primary: { width: columnWidth - 20, height: innerHeight - 16 - hriAllowance },
      extra: { width: columnWidth - 20, height: innerHeight - 16 - 2 * 17 - 10 },
      stacked: false
    };
  }

  function renderPreview(symbol, symbol2, fitted) {
    var canvas = els.previewCanvas;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.previewMode === 'label') {
      drawLabel(ctx, symbol, symbol2, canvas.width, canvas.height, fitted);
    } else {
      drawSymbolOnly(ctx, symbol, canvas.width, canvas.height);
    }
  }

  /* How long a changed value stays marked. Long enough to notice after a click,
     short enough not to become part of the page. */
  var HIGHLIGHT_MS = 1400;

  /* What stands in for the preview when there is nothing valid to draw. A blank
     or stale canvas both read as "this is what your payload produces"; a dashed
     frame that says so cannot be misread. */
  function showStalePreview() {
    var canvas = els.previewCanvas;
    var ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 2;
    if (ctx.setLineDash) ctx.setLineDash([7, 7]);
    roundRect(ctx, 14, 14, canvas.width - 28, canvas.height - 28, 10);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#999999';
    ctx.font = '600 24px Arial, Helvetica, sans-serif';
    ctx.fillText('No preview — the payload has errors', canvas.width / 2, canvas.height / 2 - 16);
    ctx.font = '400 17px Arial, Helvetica, sans-serif';
    ctx.fillText('Use a fix below, or correct the highlighted element.',
        canvas.width / 2, canvas.height / 2 + 22);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /* Dim the expected-result card rather than emptying it: clearing it on every
     keystroke while a value is mid-edit would flicker, and the previous values
     are still worth comparing against. */
  function markExpectedStale(stale) {
    var card = els.expectedRows.closest ? els.expectedRows.closest('.card') : null;
    if (!card) return;

    card.classList.toggle('is-stale', stale);
    var badge = card.querySelector('.stale-badge');

    if (stale && !badge) {
      var header = card.querySelector('.card-header');
      if (header) header.appendChild(node('span', 'stale-badge', 'out of date'));
    } else if (!stale && badge) {
      badge.remove();
    }
  }

  /* Disabled, not silently inert. The tabs used to look broken because the early
     return in updateEverything() skipped the redraw while still flipping the
     pressed state. */
  function setPreviewTabsEnabled(enabled) {
    [els.modeLabel, els.modeSymbol].forEach(function (button) {
      button.disabled = !enabled;
      if (enabled) button.removeAttribute('title');
      else button.title = 'Fix the payload to enable the preview';
    });
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
    var symbolTag = null;

    function addExpectedRow(element) {
      var tr = node('tr');
      tr.appendChild(node('td', null, '(' + element.ai + ')'));
      var titleCell = node('td', null, element.title);
      if (symbolTag) titleCell.appendChild(node('span', 'hint', ' ' + symbolTag));
      tr.appendChild(titleCell);

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
    }

    /* A scenario with a second symbol gets its elements in the same oracle, so
       the expected result covers every symbol the label carries. */
    P.expectedElements(rows).forEach(addExpectedRow);
    if (state.extra && state.extra.rows) {
      symbolTag = '(2nd symbol · ' + extraLabel() + ')';
      P.expectedElements(state.extra.rows).forEach(addExpectedRow);
    } else if (state.extra && state.extra.skipReason) {
      var noteRow = node('tr', 'extra-note');
      var noteCell = node('td');
      noteCell.colSpan = 4;
      noteCell.appendChild(node('span', 'hint',
        'No second symbol on the label: ' + state.extra.skipReason + '.'));
      noteRow.appendChild(noteCell);
      tbody.appendChild(noteRow);
    }

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
    /* A derived second symbol (the Sunrise 2027 EAN-13) tracks the primary
       rows, so it is recomputed before anything is validated or drawn. */
    refreshExtra();

    var issues = P.validate(state.rows, state.symbology);
    var blocked = P.hasErrors(issues);

    renderElements();

    /* An invalid payload produces no preview, and the previous one must not be
       left standing in its place. It used to be: the canvas kept the last
       successful render, the expected-result table kept the last successful
       values, and the preview tabs appeared to do nothing because the early
       return below skipped both redraws. Everything downstream of generation is
       therefore marked out of date here, in one place. */
    if (blocked) {
      lastRun = null;
      showStalePreview();
      markExpectedStale(true);
      setPreviewTabsEnabled(false);
      els.renderStatus.textContent = 'The payload has errors, so there is nothing to preview. '
        + 'Preview and expected result are out of date.';
      els.renderStatus.classList.add('is-error');
      els.downloadBtn.disabled = true;
      els.copyBtn.disabled = true;
      return Promise.resolve(false);
    }

    markExpectedStale(false);
    setPreviewTabsEnabled(true);
    els.copyBtn.disabled = false;
    els.renderStatus.classList.remove('is-error');
    renderExpected();

    var token = ++renderToken;
    var budget = previewBudget();
    els.renderStatus.textContent = 'Generating…';
    els.downloadBtn.disabled = true;

    return encodeSymbol(state.rows, state.symbology, budget.primary.width, budget.primary.height)
      .then(function (result) {
      if (token !== renderToken) return null;

      /* The second symbol encodes into its own half of the band. A failure to
         render it is a note, not a dead render: the primary symbol is still a
         valid test image. */
      var extraPending = null;
      var extraNotes = [];
      if (state.extra && budget.extra) {
        if (state.extra.rows) {
          var extraIssues = P.validate(state.extra.rows, state.extra.symbology);
          if (!P.hasErrors(extraIssues)) {
            extraPending = encodeSymbol(state.extra.rows, state.extra.symbology,
                budget.extra.width, budget.extra.height).catch(function (error) {
              extraNotes.push('the second symbol (' + extraLabel()
                + ') could not be rendered: '
                + String((error && error.message) || error).slice(0, 80));
              return null;
            });
          } else {
            extraNotes.push('the second symbol is not encodable, so it is omitted from the label');
          }
        } else if (state.extra.skipReason) {
          extraNotes.push('no second symbol: ' + state.extra.skipReason);
        }
      }

      return Promise.resolve(extraPending).then(function (extraResult) {
        if (token !== renderToken) return false;
        renderPreview(result.canvas, extraResult ? extraResult.canvas : null, result.fitted);
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
        if (extraResult && extraResult.reduced) {
          notes.push('second symbol module size reduced to ' + extraResult.scale + ' px');
        }
        extraNotes.forEach(function (note) { notes.push(note); });

        els.renderStatus.textContent = 'Rendered ' + (P.SYM_BY_ID[state.symbology] || {}).label
          + (extraResult ? ' + ' + extraLabel() + ' — 2 symbols on the label' : '')
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
            symbols: extraResult ? 2 : 1,
            mode: state.previewMode
          });
        }
        return true;
      });
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

  function currentScenario() {
    return P.SCENARIOS.filter(function (entry) { return entry.id === state.scenario; })[0]
      || P.SCENARIOS[0];
  }

  /* Build the second symbol a scenario prints on the label.
     Two kinds of secondary exist:
       - `build`  — an independent payload (the logistics contents GS1-128),
                    generated when the scenario is applied or randomized;
       - `derive` — a pure function of the primary rows (the Sunrise 2027
                    EAN-13 derived from AI 01), rebuilt on every update so an
                    edited GTIN keeps the two symbols in agreement.
     When a derived symbol has no valid form — a GTIN-14 whose packaging
     indicator is not 0 has no EAN-13 equivalent — the rows are left null and
     the reason is carried instead, so the label can say why the symbol is
     missing rather than silently dropping it. */
  function makeExtra() {
    var spec = currentScenario().secondary;
    if (!spec) {
      state.extra = null;
      return;
    }

    if (spec.derive === 'gtin13') {
      var gtinRow = state.rows.filter(function (item) { return item.ai === '01'; })[0];
      var gtin = gtinRow ? gtinRow.value : '';
      if (/^\d{14}$/.test(gtin) && gtin.charAt(0) === '0') {
        state.extra = { symbology: spec.symbology, label: spec.label, rows: [{ ai: '01', value: gtin }] };
      } else {
        state.extra = {
          symbology: spec.symbology, label: spec.label, rows: null,
          skipReason: /^\d{14}$/.test(gtin)
            ? 'this GTIN-14 has packaging indicator ' + gtin.charAt(0)
              + ', which has no EAN-13 equivalent'
            : 'AI 01 is not a 14-digit GTIN'
        };
      }
      return;
    }

    state.extra = spec.build
      ? { symbology: spec.symbology, label: spec.label, rows: spec.build() }
      : null;
  }

  /* Derived extras must track edits to the primary rows; built extras are
     rebuilt only when the scenario is applied or randomized. */
  function refreshExtra() {
    var spec = currentScenario().secondary;
    if (spec && spec.derive) makeExtra();
  }

  function extraLabel() {
    var sym = state.extra ? P.SYM_BY_ID[state.extra.symbology] : null;
    return (sym && sym.label) || 'second symbol';
  }

  function applyScenario(id, source) {
    var scenario = P.SCENARIOS.filter(function (entry) { return entry.id === id; })[0] || P.SCENARIOS[0];
    state.scenario = scenario.id;
    state.rows = scenario.build();
    state.symbology = scenario.symbology;
    makeExtra();
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

    /* Remember what the values were, so the ones that changed can be marked. The
       values are all digit soup; without this, clicking Randomize data looks like
       it did nothing at all. */
    var before = state.rows.map(function (item) { return item.value; });

    if (scenario && state.scenario !== 'custom') {
      state.rows = scenario.build();
    } else {
      state.rows = state.rows.map(function (item) {
        var entry = P.AI_BY_CODE[item.ai];
        return { ai: item.ai, value: entry ? entry.sample() : item.value };
      });
    }
    /* A built secondary is part of the random data; a derived one follows the
       primary rows and will be recomputed by the update cycle. */
    makeExtra();

    state.highlight = [];
    state.rows.forEach(function (item, index) {
      if (before[index] !== item.value) state.highlight.push(index);
    });

    analytics.action('randomize', {
      scenario: state.scenario,
      changed: state.highlight.length
    });
    updateEverything('randomize');
  }

  function addElement() {
    var ai = els.addAiSelect.value;
    var entry = P.AI_BY_CODE[ai];
    if (!entry) return;
    state.rows.push({ ai: ai, value: entry.sample() });
    state.highlight = [state.rows.length - 1];
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
    if (state.previewMode === mode) return Promise.resolve();
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
    /* Always the live payload, never lastRun's copy: after an edit those differ,
       and copying a string that does not match what is on screen is the one
       thing a payload generator must not do. */
    var text = P.toElementString(state.rows);
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
