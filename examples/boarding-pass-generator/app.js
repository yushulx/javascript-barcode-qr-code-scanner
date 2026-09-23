/*
 * Boarding Pass Generator — form, canvas rendering and PNG export.
 *
 * The heavy lifting lives in bcbp.js: this file collects the form into a
 * record, hands it to Bcbp.encode(), and draws the result as a boarding pass.
 * The "expected scanner output" table is produced by parsing our own payload
 * with Bcbp.decode(), so what the page promises is what the bytes say.
 *
 * Encoding is done by bwip-js (BWIPP). No Dynamsoft SDK is loaded here, which
 * is why the payload is verified by round trip rather than by decoding the
 * rendered image.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     Analytics shim — only the hosted Codepool copy loads the shared tracker.
     The GitHub example has no ../shared/analytics.js, so every call is a no-op
     there rather than a crash.
     --------------------------------------------------------------------------- */
  var analytics = window.DemoAnalytics || {
    ready: function () { }, error: function () { }, action: function () { }
  };

  var APP_START = (window.performance && performance.now) ? performance.now() : Date.now();

  /* Per-format encoder settings. `scale` is the module size in pixels; the
     linear symbol also needs a row height. */
  var FORMATS = {
    pdf417: { bcid: 'pdf417', label: 'PDF417', scale: 5, rowHeight: 5, linear: true, minVersion: 1 },
    azteccode: { bcid: 'azteccode', label: 'Aztec Code', scale: 7, minVersion: 7 },
    qrcode: { bcid: 'qrcode', label: 'QR Code', scale: 7, minVersion: 7 },
    datamatrix: { bcid: 'datamatrix', label: 'Data Matrix', scale: 7, minVersion: 7 }
  };

  var VERSION_LABELS = {
    '0': '0 \u2014 no version field (pre-2008, no conditional data)',
    '1': '1 \u2014 2005 original',
    '2': '2 \u2014 2008, mobile support',
    '3': '3 \u2014 2009, security data',
    '4': '4 \u2014 2011, NFC',
    '5': '5 \u2014 2013, fast track',
    '6': '6 \u2014 2016 (most common today)',
    '7': '7 \u2014 2018, 2D printed symbols',
    '8': '8 \u2014 2020, gender code X and U'
  };

  var els = {};
  var state = {
    style: 'printed',
    format: 'pdf417',
    lastRecord: null,
    lastPayload: '',
    lastDecoded: null,
    lastRecordPnr: '',
    renderSeq: 0,
    /* Latched by a hand edit of item 28/30: signing then stays off until
       Re-sign or Randomise, so a pass that fails verification can be built
       on purpose. */
    securityManual: false
  };

  /* ---------------------------------------------------------------------------
     Demo signing key — ECDSA P-256 / SHA-256.

     The private key is baked into this page ONLY so the demo can sign a pass
     in the browser. A real issuer must never do that: the key stays on the
     issuing server, only the signature travels, and readers get the matching
     public key (see the scanner example, which carries just that).
     --------------------------------------------------------------------------- */
  var DEMO_PRIVATE_KEY = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg9TNzmb8HKjpq/p8y81h4EYssECbpbQTIVvF8V9sWSY+hRANCAAQ6+5kTls9F7/BtjQ/WXeNef6Y1xGPUVR9eFbYpF2mmSmxMIpnhDzSn9vJZplASexOylkRHkQTqDQ/gsb80kTEO';
  var DEMO_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEOvuZE5bPRe/wbY0P1l3jXn+mNcRj1FUfXhW2KRdppkpsTCKZ4Q80p/byWaZQEnsTspZER5EE6g0P4LG/NJExDg==';
  /* Item 28: one character naming the algorithm. '1' matches the official
     Resolution 792 sample; the algorithm actually used here is ECDSA P-256,
     which the field has no standard code for in this demo. */
  var SECURITY_TYPE = '1';

  /* ---------------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------------- */

  function boot() {
    [
      'airline', 'pass_style', 'barcode_format', 'leg_count', 'version',
      'passenger_name', 'pnr', 'passenger_status', 'passenger_description',
      'checkin_source', 'issuance_source', 'issue_date', 'document_type',
      'issuer_airline', 'bag_tags', 'security_type', 'security_data',
      'legs_container', 'add_leg',
      'randomise', 'download', 'copy_payload', 'resign', 'security_hint',
      'preview', 'preview_caption', 'payload', 'oracle', 'oracle_summary',
      'checks', 'validate_box', 'decode_status'
    ].forEach(function (id) { els[id] = document.getElementById(id); });

    if (!window.bwipjs) {
      els.decode_status.textContent = 'The bwip-js encoder did not load. Check the network and reload the page.';
      return;
    }
    if (!window.Bcbp) {
      els.decode_status.textContent = 'bcbp.js did not load, so the BCBP payload cannot be built.';
      return;
    }

    buildEnumOptions();
    buildVersionOptions();
    buildAirlineOptions();
    wireEvents();
    randomise(true);

    /* Report the codec's conformance check once, so a failure is visible in the
       console rather than silently producing non-conformant payloads. */
    var selfTest = window.Bcbp.selfTest();
    console.log('[boarding-pass] BCBP codec self-test: ' + selfTest.passed + '/'
      + (selfTest.passed + selfTest.failed) + ' IATA Resolution 792 examples round-trip');
    if (selfTest.failed) console.warn('[boarding-pass] self-test failures:', selfTest.results);

    analytics.ready(((window.performance && performance.now) ? performance.now() : Date.now()) - APP_START);
  }

  /* ---------------------------------------------------------------------------
     Form construction
     --------------------------------------------------------------------------- */

  function buildEnumOptions() {
    var E = window.Bcbp.ENUMS;
    fillSelect(els.passenger_status, E.passengerStatus);
    fillSelect(els.passenger_description, E.passengerDescription);
    fillSelect(els.checkin_source, E.checkinSource);
    fillSelect(els.issuance_source, E.issuanceSource);
    fillSelect(els.document_type, E.documentType);
  }

  function fillSelect(select, map) {
    select.replaceChildren();
    Object.keys(map).forEach(function (code) {
      if (code === ' ') return;
      select.appendChild(new Option(code + ' \u2014 ' + map[code], code));
    });
  }

  function buildVersionOptions() {
    els.version.replaceChildren();
    Object.keys(VERSION_LABELS).forEach(function (code) {
      els.version.appendChild(new Option('Version ' + VERSION_LABELS[code], code));
    });
    els.version.value = String(window.Bcbp.CURRENT_VERSION);
  }

  function buildAirlineOptions() {
    els.airline.replaceChildren();
    window.Bcbp.AIRLINES.forEach(function (a) {
      els.airline.appendChild(new Option(a.iata + ' \u2014 ' + a.name, a.iata));
    });
    els.airline.value = 'UA';
  }

  function selectFrom(list, selected, render) {
    var select = document.createElement('select');
    select.className = 'form-control';
    list.forEach(function (entry) {
      select.appendChild(new Option(render(entry), entry.code));
    });
    if (selected) select.value = selected;
    return select;
  }

  function airportSelect(selected) {
    return selectFrom(window.Bcbp.AIRPORTS, selected, function (a) {
      return a.code + ' \u2014 ' + a.city;
    });
  }

  function compartmentSelect(selected) {
    var E = window.Bcbp.ENUMS.compartment;
    var codes = ['F', 'J', 'C', 'W', 'Y'].map(function (code) {
      return { code: code, label: code + ' \u2014 ' + E[code] };
    });
    var select = document.createElement('select');
    select.className = 'form-control';
    codes.forEach(function (entry) {
      select.appendChild(new Option(entry.label, entry.code));
    });
    select.value = selected || 'Y';
    return select;
  }

  /* Every control inside a leg carries a data-field name rather than an id:
     ids would repeat once a second leg is added, and querySelector('#leg_seat')
     would then always return the first leg's control. */
  function legEditor(index, seed) {
    var card = document.createElement('div');
    card.className = 'leg-editor';
    card.dataset.leg = String(index);

    var head = document.createElement('div');
    head.className = 'leg-editor-head';
    var title = document.createElement('h3');
    title.textContent = 'Leg ' + (index + 1);
    head.appendChild(title);

    if (index > 0) {
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-quiet btn-small';
      remove.textContent = 'Remove leg';
      remove.addEventListener('click', function () {
        var record = collectRecord();
        record.legs.splice(index, 1);
        writeForm(record);
        generate('remove-leg');
      });
      head.appendChild(remove);
    }
    card.appendChild(head);

    var row1 = formRow();
    row1.appendChild(field('From', airportSelect(seed && seed.from), 'from'));
    row1.appendChild(field('To', airportSelect(seed && seed.to), 'to'));
    row1.appendChild(field('Flight number', input('text', seed && seed.flightNumber, '1234'), 'flight'));
    card.appendChild(row1);

    var row2 = formRow();
    row2.appendChild(field('Date of flight', input('date', '', ''), 'date'));
    row2.appendChild(field('Compartment', compartmentSelect(seed && seed.compartment), 'compartment'));
    row2.appendChild(field('Seat', input('text', seed && seed.seat, '18A'), 'seat'));
    card.appendChild(row2);

    var row3 = formRow();
    row3.appendChild(field('Check-in sequence', input('text', seed && seed.sequence, '42'), 'sequence'));
    row3.appendChild(field('PNR for this leg', input('text', seed && seed.pnr, 'ABC123'), 'pnr'));
    row3.appendChild(field('Free baggage', input('text', seed && seed.freeBaggage, '2PC'), 'freeBaggage'));
    card.appendChild(row3);

    var row4 = formRow();
    row4.appendChild(field('Marketing carrier', input('text', seed && seed.marketingCarrier, ''), 'marketingCarrier'));
    row4.appendChild(field('Frequent flyer airline', input('text', seed && seed.ffAirline, ''), 'ffAirline'));
    row4.appendChild(field('Frequent flyer number', input('text', seed && seed.ffNumber, ''), 'ffNumber'));
    card.appendChild(row4);

    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = index === 0
      ? 'The PNR, frequent flyer and baggage fields repeat per leg, so a two-leg pass can carry a different value on each.'
      : 'A second leg repeats the fixed block after the first. Only the fields you fill in are written, in the order the standard fixes.';
    card.appendChild(note);

    return card;
  }

  function formRow() {
    var row = document.createElement('div');
    row.className = 'form-row';
    return row;
  }

  function field(labelText, control, name) {
    var group = document.createElement('div');
    group.className = 'form-group';
    var label = document.createElement('label');
    label.textContent = labelText;
    if (control.id) {
      label.setAttribute('for', control.id);
    } else {
      control.setAttribute('aria-label', labelText);
    }
    if (name) control.dataset.field = name;
    group.appendChild(label);
    group.appendChild(control);
    return group;
  }

  function input(type, value, placeholder) {
    var el = document.createElement('input');
    el.type = type;
    el.className = 'form-control';
    el.value = value || '';
    if (placeholder) el.placeholder = placeholder;
    return el;
  }

  function buildLegEditors(count, seedLegs) {
    els.legs_container.replaceChildren();
    for (var i = 0; i < count; i++) {
      els.legs_container.appendChild(legEditor(i, seedLegs && seedLegs[i]));
    }
    els.leg_count.value = String(count);
    var max = window.Bcbp.MAX_LEGS;
    els.add_leg.disabled = count >= max;
    els.add_leg.textContent = count >= max ? 'Maximum ' + max + ' legs' : '+ Add a leg';
  }

  /* ---------------------------------------------------------------------------
     Form <-> record
     --------------------------------------------------------------------------- */

  function legEditors() {
    return Array.prototype.slice.call(els.legs_container.querySelectorAll('.leg-editor'));
  }

  function legValue(editor, name) {
    var el = editor.querySelector('[data-field="' + name + '"]');
    return el ? el.value : '';
  }

  /* BCBP stores the flight date as a day of year and nothing else — no year.
     A scanner infers it, so the form takes a calendar date and reduces it. */
  function julianFromDateInput(value) {
    if (!value) return '';
    var parts = value.split('-');
    var date = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    return String(window.Bcbp.dayOfYear(date)).padStart(3, '0');
  }

  function isoFromJulian(julian) {
    var d = window.Bcbp.dateFromJulian(julian, new Date().getUTCFullYear());
    return d ? d.toISOString().slice(0, 10) : '';
  }

  function parseBagTags(text) {
    return String(text || '').split(/[\s,;]+/).map(function (t) {
      return t.replace(/[^0-9]/g, '');
    }).filter(Boolean);
  }

  function collectRecord() {
    var editors = legEditors();
    var carrier = els.airline.value;
    var airline = window.Bcbp.airline(carrier) || {};

    var legs = editors.map(function (editor) {
      return {
        from: legValue(editor, 'from'),
        to: legValue(editor, 'to'),
        pnr: legValue(editor, 'pnr'),
        carrier: carrier,
        flightNumber: legValue(editor, 'flight'),
        julianDate: julianFromDateInput(legValue(editor, 'date')),
        dateValue: legValue(editor, 'date'),
        compartment: legValue(editor, 'compartment'),
        seat: legValue(editor, 'seat'),
        sequence: legValue(editor, 'sequence'),
        freeBaggage: legValue(editor, 'freeBaggage'),
        marketingCarrier: legValue(editor, 'marketingCarrier'),
        ffAirline: legValue(editor, 'ffAirline'),
        ffNumber: legValue(editor, 'ffNumber'),
        airlineNumericCode: airline.numeric || ''
      };
    });

    var tags = parseBagTags(els.bag_tags.value);

    return {
      passengerName: els.passenger_name.value,
      electronicTicket: true,
      pnr: els.pnr.value,
      passengerStatus: els.passenger_status.value,
      passengerDescription: els.passenger_description.value,
      checkinSource: els.checkin_source.value,
      issuanceSource: els.issuance_source.value,
      issueDate: els.issue_date.value,
      documentType: els.document_type.value,
      issuerAirline: els.issuer_airline.value,
      bagTags: tags.slice(0, 3),
      nonConsecutiveTags: tags.slice(3, 5),
      security: els.security_data.value
        ? { type: els.security_type.value || '1', data: els.security_data.value }
        : null,
      version: els.version.value,
      legs: legs
    };
  }

  function writeForm(record) {
    state.lastRecord = record;
    state.lastRecordPnr = record.pnr || '';

    els.passenger_name.value = record.passengerName || '';
    els.pnr.value = record.pnr || '';
    setSelect(els.passenger_status, record.passengerStatus);
    setSelect(els.passenger_description, record.passengerDescription);
    setSelect(els.checkin_source, record.checkinSource);
    setSelect(els.issuance_source, record.issuanceSource);
    setSelect(els.document_type, record.documentType);
    els.issue_date.value = record.issueDate || '';
    els.issuer_airline.value = record.issuerAirline || '';
    els.bag_tags.value = (record.bagTags || []).join(', ');
    els.security_data.value = (record.security && record.security.data) || '';

    var first = record.legs[0];
    var op = first && window.Bcbp.airline(first.carrier);
    if (op) els.airline.value = op.iata;

    buildLegEditors(record.legs.length, record.legs);

    record.legs.forEach(function (leg, i) {
      var editor = legEditors()[i];
      setLegValue(editor, 'from', leg.from);
      setLegValue(editor, 'to', leg.to);
      setLegValue(editor, 'pnr', leg.pnr || record.pnr);
      setLegValue(editor, 'flight', leg.flightNumber);
      setLegValue(editor, 'date', leg.dateValue || isoFromJulian(leg.julianDate));
      setLegValue(editor, 'compartment', leg.compartment || 'Y');
      setLegValue(editor, 'seat', leg.seat);
      setLegValue(editor, 'sequence', leg.sequence);
      setLegValue(editor, 'freeBaggage', leg.freeBaggage);
      setLegValue(editor, 'marketingCarrier', leg.marketingCarrier);
      setLegValue(editor, 'ffAirline', leg.ffAirline);
      setLegValue(editor, 'ffNumber', leg.ffNumber);
    });
  }

  function setLegValue(editor, name, value) {
    var el = editor.querySelector('[data-field="' + name + '"]');
    if (el) el.value = value === undefined || value === null ? '' : value;
  }

  function setSelect(select, value) {
    if (value === undefined || value === null || value === '') {
      select.selectedIndex = -1;
      return;
    }
    select.value = value;
    if (select.selectedIndex === -1) select.selectedIndex = -1;
  }

  /* ---------------------------------------------------------------------------
     Encoding
     --------------------------------------------------------------------------- */

  function renderSymbol(payload, formatId) {
    var format = FORMATS[formatId];
    var options = {
      bcid: format.bcid,
      text: payload,
      scale: format.scale,
      includetext: false,
      /* A quiet zone is part of the specification: a symbol that touches its
         own border is materially harder for a scanner to lock onto. */
      paddingwidth: 4,
      paddingheight: 4
    };
    if (format.linear) options.height = format.rowHeight;

    var canvas = document.createElement('canvas');
    return new Promise(function (resolve, reject) {
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

  function generate(source) {
    state.style = els.pass_style.value;
    state.format = els.barcode_format.value;

    var record = collectRecord();
    state.lastRecord = record;

    var problems = window.Bcbp.validate(record);
    showValidation(problems);

    /* Items 25–30 are not typed out by hand: they are produced here, after
       every other field has settled, so the signature always covers exactly
       the payload that is about to be rendered. A hand edit latches
       state.securityManual and switches signing off until Re-sign — that
       latch is what makes a deliberately broken pass possible. */
    var signing = (problems.length || state.securityManual)
      ? Promise.resolve(null)
      : autoSign(record);

    return signing.then(function () {
      /* Re-read the form: item 30 may just have been rewritten by autoSign(). */
      record = collectRecord();
      state.lastRecord = record;
      return renderPayload(source, record);
    });
  }

  /* Sign everything up to the end of the last leg with the demo key and write
     the base64 result into item 30. Resolves with the signature, or null when
     there was nothing to sign (the record is invalid, or WebCrypto is off) —
     in both cases the caller simply carries on with what the field holds. */
  function autoSign(record) {
    var base;
    try {
      base = window.Bcbp.encode(Object.assign({}, record, { security: null }));
    } catch (error) {
      return Promise.resolve(null); /* renderPayload() reports the real error */
    }
    return window.Bcbp.signSecurityData(base, DEMO_PRIVATE_KEY).then(function (signature) {
      if (!signature) return null;
      els.security_type.value = SECURITY_TYPE;
      els.security_data.value = signature;
      return signature;
    });
  }

  /* The rest of generate(): encode, parse our own output, draw it. */
  function renderPayload(source, record) {
    var payload;
    try {
      payload = window.Bcbp.encode(record);
    } catch (error) {
      els.decode_status.textContent = 'The payload cannot be built: ' + error.message;
      els.payload.value = '';
      clearPreview('Fix the highlighted problem, then generate again.');
      renderOracle({ ok: false, error: error.message });
      return Promise.resolve(false);
    }

    state.lastPayload = payload;
    els.payload.value = payload;

    /* Parse our own output. This is the oracle: the table below is read back
       from the bytes that were just produced, not from the form. */
    var decoded = window.Bcbp.decode(payload);
    state.lastDecoded = decoded;
    renderOracle(decoded);
    updateSecurityHint(payload, decoded);

    if (!decoded.ok) {
      els.decode_status.textContent = 'The generated payload did not parse back: ' + decoded.error;
      clearPreview('The payload did not parse back.');
      analytics.error('roundtrip_failed', String(decoded.error).slice(0, 120));
      return Promise.resolve(false);
    }

    var seq = ++state.renderSeq;
    return renderSymbol(payload, state.format).then(function (symbol) {
      if (seq !== state.renderSeq) return false; // superseded by a newer generate()
      drawPass(symbol, record, decoded);
      var leg = decoded.legs[0];
      var format = FORMATS[state.format];
      els.preview_caption.textContent = format.label + ' \u00b7 ' + decoded.length
        + ' characters \u00b7 ' + (decoded.version === null ? 'no version field' : 'BCBP version ' + decoded.version)
        + ' \u00b7 ' + (decoded.legs.length > 1 ? decoded.legs.length + ' legs' : leg.from + ' \u2192 ' + leg.to);
      els.decode_status.textContent = 'Encoded a ' + format.label + ' boarding pass: ' + decoded.length
        + ' characters, ' + decoded.legs.length + ' leg' + (decoded.legs.length === 1 ? '' : 's')
        + ', symbol ' + symbol.width + '\u00d7' + symbol.height + ' px';

      if (source && source !== 'init' && source !== 'internal') {
        analytics.action('generate', {
          style: state.style,
          format: state.format,
          legs: record.legs.length,
          version: els.version.value,
          payload_length: payload.length
        });
      }
      return true;
    }).catch(function (error) {
      console.error(error);
      els.decode_status.textContent = 'Could not render the ' + FORMATS[state.format].label + ': ' + error.message;
      clearPreview('Rendering failed.');
      analytics.error('render_failed', String(error.message).slice(0, 120));
      return false;
    });
  }

  /* Report what item 30 currently is. It runs on every render because the
     verdict depends on the bytes as they are right now, not on what the form
     says: a signature that was valid a moment ago is worthless the moment any
     other field moves. */
  function updateSecurityHint(payload, decoded) {
    var hint = els.security_hint;
    if (!hint) return;

    function put(kind, text) {
      hint.className = 'hint ' + kind;
      hint.textContent = text;
    }

    if (!decoded || !decoded.ok) {
      put('is-bad', '\u2717 The payload did not parse, so there is no signature to check.');
      return;
    }
    if (!(window.crypto && window.crypto.subtle)) {
      put('is-bad', '\u26a0 WebCrypto is unavailable — this page has to be served over '
        + 'http://localhost or https. The pass is left unsigned as typed.');
      return;
    }

    window.Bcbp.verifySecurityData(payload, DEMO_PUBLIC_KEY).then(function (result) {
      if (result.state === 'ok') {
        put('is-ok', '\u2713 Auto-signed \u00b7 ECDSA P-256 \u00b7 item 30 holds a signature of '
          + decoded.security.data.length + ' characters over this exact payload. '
          + 'It is rewritten every time a field changes — you are not expected to type it.');
      } else if (result.state === 'none') {
        put(state.securityManual ? 'is-none' : 'is-ok',
          state.securityManual
            ? '\u2014 You cleared item 30, so items 25\u201330 are omitted. An unsigned pass is '
              + 'legal and still reads; a reader set to require a signature would refuse it.'
            : '\u2014 Unsigned: no security section in this pass. Press Re-sign to add one.');
      } else {
        put('is-bad', '\u2717 ' + result.message
          + (state.securityManual ? ' Item 30 was edited by hand.' : '')
          + ' Press \u{1F512} Re-sign to sign the pass again.');
      }
    }).catch(function (error) {
      put('is-bad', '\u26a0 Could not verify the signature: ' + error.message);
    });
  }

  function showValidation(problems) {
    els.validate_box.replaceChildren();
    if (!problems.length) {
      els.validate_box.hidden = true;
      return;
    }
    els.validate_box.hidden = false;
    var list = document.createElement('ul');
    problems.slice(0, 6).forEach(function (problem) {
      var li = document.createElement('li');
      li.textContent = problem;
      list.appendChild(li);
    });
    els.validate_box.replaceChildren(list);
  }

  function clearPreview(message) {
    els.preview_caption.textContent = message || '';
    var ctx = els.preview.getContext('2d');
    ctx.clearRect(0, 0, els.preview.width, els.preview.height);
  }

  /* ---------------------------------------------------------------------------
     Boarding pass rendering
     --------------------------------------------------------------------------- */

  var INK = '#12233f';
  var MUTED = '#63718a';
  var RULE = '#d5dbe6';
  var ACCENT = '#c8102e';
  var FONT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, value, x, y, o) {
    var opts = o || {};
    ctx.font = (opts.weight ? opts.weight + ' ' : '') + (opts.size || 16) + 'px '
      + (opts.mono ? MONO : FONT);
    ctx.fillStyle = opts.color || INK;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if (opts.letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = opts.letterSpacing + 'px';
    ctx.fillText(String(value === undefined || value === null ? '' : value), x, y);
    if (opts.letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function dashedLine(ctx, x1, y, x2) {
    ctx.save();
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpecimen(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 10);
    ctx.font = 'bold ' + size + 'px ' + FONT;
    ctx.fillStyle = 'rgba(200, 16, 46, 0.09)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPECIMEN', 0, 0);
    ctx.restore();
  }

  function drawBrandMark(ctx, designator, x, y, size) {
    ctx.save();
    ctx.fillStyle = ACCENT;
    roundRect(ctx, x, y, size, size, size * 0.24);
    ctx.fill();
    text(ctx, designator, x + size / 2, y + size * 0.7, {
      size: size * 0.5, weight: 'bold', color: '#ffffff', align: 'center'
    });
    ctx.restore();
  }

  function drawPass(symbol, record, decoded) {
    var canvas = els.preview;
    if (state.style === 'mobile') {
      canvas.width = 520;
      canvas.height = 900;
      drawMobilePass(canvas.getContext('2d'), canvas.width, canvas.height, symbol, record, decoded);
    } else {
      canvas.width = 1100;
      canvas.height = 700;
      drawPrintedPass(canvas.getContext('2d'), canvas.width, canvas.height, symbol, record, decoded);
    }
  }

  function drawPrintedPass(ctx, w, h, symbol, record, decoded) {
    var airline = window.Bcbp.airline(decoded.carrier) || { iata: decoded.carrier, name: decoded.carrier };
    var leg = decoded.legs[0];

    ctx.fillStyle = '#eef1f6';
    ctx.fillRect(0, 0, w, h);

    var pad = 26;
    var cardX = pad;
    var cardY = pad;
    var cardW = w - pad * 2;
    var cardH = h - pad * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(18, 35, 63, 0.18)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fill();
    ctx.restore();

    /* Header band. */
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, 76, 14);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.fillRect(cardX, cardY, cardW, 76);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(cardX, cardY + 72, cardW, 4);
    ctx.restore();

    drawBrandMark(ctx, airline.iata, cardX + 22, cardY + 20, 36);
    text(ctx, airline.name.toUpperCase(), cardX + 70, cardY + 36, { size: 19, weight: 'bold', color: '#ffffff' });
    text(ctx, 'BOARDING PASS', cardX + 70, cardY + 58, { size: 11, color: '#9fb0c9', letterSpacing: 2 });
    text(ctx, (leg.compartmentLabel || leg.compartment || '').toUpperCase(),
      cardX + cardW - 24, cardY + 48, { size: 16, weight: 'bold', color: '#ffffff', align: 'right' });

    /* Route. */
    var y = cardY + 140;
    text(ctx, (leg.fromCity || '').toUpperCase(), cardX + 34, y - 36,
      { size: 11, color: MUTED, letterSpacing: 1.5 });
    text(ctx, leg.from, cardX + 34, y + 24, { size: 54, weight: 'bold', letterSpacing: 3 });
    text(ctx, (leg.toCity || '').toUpperCase(), cardX + cardW - 34, y - 36,
      { size: 11, color: MUTED, align: 'right', letterSpacing: 1.5 });
    text(ctx, leg.to, cardX + cardW - 34, y + 24, { size: 54, weight: 'bold', align: 'right', letterSpacing: 3 });

    var ax = cardX + 230;
    var ax2 = cardX + cardW - 230;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ax, y - 2);
    ctx.lineTo(ax2, y - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax2 - 11, y - 8);
    ctx.lineTo(ax2, y - 2);
    ctx.lineTo(ax2 - 11, y + 4);
    ctx.stroke();
    ctx.restore();
    text(ctx, decoded.legs.length > 1 ? decoded.legs.length + ' LEGS' : 'NON-STOP',
      (ax + ax2) / 2, y - 14, { size: 11, color: MUTED, align: 'center', letterSpacing: 1.5 });

    /* Detail grid. */
    var gy = cardY + 232;
    var colW = (cardW - 68) / 4;
    function cell(col, labelText, value, mono) {
      var x = cardX + 34 + col * colW;
      text(ctx, labelText.toUpperCase(), x, gy, { size: 10, color: MUTED, letterSpacing: 1.2 });
      text(ctx, value, x, gy + 28, { size: 22, weight: 'bold', mono: !!mono });
    }
    cell(0, 'Flight', decoded.carrier + ' ' + decoded.flightNumber, true);
    cell(1, 'Date', leg.flightDateLabel || leg.julianDate);
    cell(2, 'Seat', leg.seat || 'unassigned', true);
    cell(3, 'Sequence', decoded.sequence, true);

    var gy2 = gy + 78;
    text(ctx, 'PASSENGER', cardX + 34, gy2, { size: 10, color: MUTED, letterSpacing: 1.2 });
    text(ctx, decoded.passengerName, cardX + 34, gy2 + 31, { size: 24, weight: 'bold' });
    text(ctx, 'PNR', cardX + cardW - 34, gy2, { size: 10, color: MUTED, align: 'right', letterSpacing: 1.2 });
    text(ctx, decoded.pnr, cardX + cardW - 34, gy2 + 31,
      { size: 24, weight: 'bold', align: 'right', mono: true });

    dashedLine(ctx, cardX + 34, cardY + 356, cardX + cardW - 34);

    var sy = cardY + 388;
    text(ctx, 'STATUS', cardX + 34, sy, { size: 10, color: MUTED, letterSpacing: 1.2 });
    text(ctx, decoded.passengerStatus
      + (decoded.passengerStatusLabel ? ' \u00b7 ' + decoded.passengerStatusLabel : ''),
      cardX + 34, sy + 24, { size: 15 });

    var desc = firstField(decoded.unique, 'passengerDescription');
    if (desc && desc.value) {
      text(ctx, 'PASSENGER TYPE', cardX + cardW * 0.42, sy, { size: 10, color: MUTED, letterSpacing: 1.2 });
      text(ctx, desc.meaning || desc.value, cardX + cardW * 0.42, sy + 24, { size: 15 });
    }

    var tag = firstField(decoded.unique, 'bagTag1');
    if (tag && tag.value) {
      text(ctx, 'BAGS', cardX + cardW - 34, sy, { size: 10, color: MUTED, align: 'right', letterSpacing: 1.2 });
      text(ctx, tag.value, cardX + cardW - 34, sy + 24, { size: 15, align: 'right' });
    }

    /* Barcode panel: a tinted area so the whitespace reads as deliberate. */
    var panelX = cardX + 24;
    var panelW = cardW - 48;
    var panelTop = cardY + 420;
    var panelBottom = cardY + cardH - 30;

    ctx.save();
    ctx.fillStyle = '#f7f9fc';
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    roundRect(ctx, panelX, panelTop, panelW, panelBottom - panelTop, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    var sideLabel = FORMATS[state.format].label.toUpperCase() + '  \u00b7  '
      + decoded.length + ' CHARACTERS'
      + (decoded.legs.length > 1 ? '  \u00b7  LEG 1/' + decoded.legs.length : '');
    text(ctx, sideLabel, panelX + 18, panelTop + 24, { size: 10.5, color: MUTED, letterSpacing: 1.3 });

    var inner = 20;
    var labelH = 30;
    var availW = panelW - inner * 2;
    var availH = (panelBottom - panelTop) - labelH - inner;
    var scale = Math.min(availW / symbol.width, availH / symbol.height, 1);
    var drawW = Math.max(1, Math.round(symbol.width * scale));
    var drawH = Math.max(1, Math.round(symbol.height * scale));
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(symbol,
      panelX + (panelW - drawW) / 2,
      panelTop + labelH + (availH - drawH) / 2,
      drawW, drawH);

    drawSpecimen(ctx, cardX + cardW / 2, cardY + cardH / 2 + 30, 64);
    text(ctx, 'SPECIMEN \u2014 synthetic test data, not a real boarding pass',
      cardX + cardW / 2, cardY + cardH - 10, { size: 11, color: ACCENT, align: 'center' });
  }

  function drawMobilePass(ctx, w, h, symbol, record, decoded) {
    var airline = window.Bcbp.airline(decoded.carrier) || { iata: decoded.carrier, name: decoded.carrier };
    var leg = decoded.legs[0];

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f6fa';
    ctx.fillRect(0, 0, w, 96);

    text(ctx, '9:41', 34, 56, { size: 16, weight: 'bold' });
    text(ctx, '\u25cf\u25cf\u25cf\u25cf', w - 34, 56, { size: 13, color: MUTED, align: 'right' });

    var cardX = 30;
    var cardY = 120;
    var cardW = w - 60;
    var cardH = h - 200;

    ctx.save();
    ctx.shadowColor = 'rgba(18, 35, 63, 0.20)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, 122, 18);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.fillRect(cardX, cardY, cardW, 122);
    ctx.restore();

    drawBrandMark(ctx, airline.iata, cardX + 22, cardY + 22, 38);
    text(ctx, airline.name, cardX + 72, cardY + 42, { size: 19, weight: 'bold', color: '#ffffff' });
    text(ctx, 'BOARDING PASS', cardX + 72, cardY + 64, { size: 11, color: '#9fb0c9', letterSpacing: 2 });
    text(ctx, leg.from + '  \u2192  ' + leg.to, cardX + 22, cardY + 106,
      { size: 27, weight: 'bold', color: '#ffffff', letterSpacing: 1 });

    var gy = cardY + 172;
    text(ctx, 'PASSENGER', cardX + 22, gy, { size: 10, color: MUTED, letterSpacing: 1.2 });
    text(ctx, decoded.passengerName, cardX + 22, gy + 27, { size: 20, weight: 'bold' });

    var rows = [
      ['Flight', decoded.carrier + ' ' + decoded.flightNumber],
      ['Date', leg.flightDateLabel || leg.julianDate],
      ['Seat', leg.seat || 'unassigned'],
      ['Sequence', decoded.sequence],
      ['PNR', decoded.pnr],
      ['Status', decoded.passengerStatus
        + (decoded.passengerStatusLabel ? ' \u00b7 ' + decoded.passengerStatusLabel : '')]
    ];
    var ry = gy + 72;
    dashedLine(ctx, cardX + 22, ry - 26, cardX + cardW - 22);

    rows.forEach(function (row, i) {
      text(ctx, row[0].toUpperCase(), cardX + 22, ry + i * 40, { size: 10, color: MUTED, letterSpacing: 1.2 });
      text(ctx, row[1], cardX + cardW - 22, ry + i * 40 + 1, { size: 17, weight: 'bold', align: 'right' });
    });

    var panelX = cardX + 22;
    var panelW = cardW - 44;
    var panelTop = ry + rows.length * 40 + 8;
    var panelBottom = cardY + cardH - 18;

    ctx.save();
    ctx.fillStyle = '#f7f9fc';
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    roundRect(ctx, panelX, panelTop, panelW, panelBottom - panelTop, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    text(ctx, FORMATS[state.format].label.toUpperCase() + '  \u00b7  ' + decoded.length + ' CHARACTERS',
      panelX + 14, panelTop + 20, { size: 10, color: MUTED, letterSpacing: 1.2 });

    var inner = 14;
    var labelH = 26;
    var availW = panelW - inner * 2;
    var availH = (panelBottom - panelTop) - labelH - inner;
    var scale = Math.min(availW / symbol.width, availH / symbol.height, 1);
    var drawW = Math.max(1, Math.round(symbol.width * scale));
    var drawH = Math.max(1, Math.round(symbol.height * scale));
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(symbol,
      panelX + (panelW - drawW) / 2,
      panelTop + labelH + (availH - drawH) / 2,
      drawW, drawH);

    drawSpecimen(ctx, cardX + cardW / 2, cardY + cardH / 2 + 80, 50);
    text(ctx, 'SPECIMEN \u2014 synthetic test data',
      cardX + cardW / 2, cardY + cardH + 34, { size: 11, color: ACCENT, align: 'center' });
  }

  /* ---------------------------------------------------------------------------
     Oracle: what a conformant scanner should return
     --------------------------------------------------------------------------- */

  function firstField(fields, code) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].code === code) return fields[i];
    }
    return null;
  }

  function renderOracle(decoded) {
    els.oracle.replaceChildren();
    els.checks.replaceChildren();

    if (!decoded.ok) {
      els.oracle_summary.textContent = decoded.error;
      return;
    }

    var passing = decoded.checks.filter(function (c) { return c.ok; }).length;
    var populated = decoded.allFields.filter(function (f) { return f.value !== ''; }).length;
    els.oracle_summary.textContent = decoded.checks.length + ' structural checks \u00b7 '
      + passing + ' passing \u00b7 ' + populated + ' populated fields';

    var header = document.createElement('div');
    header.className = 'oracle-row oracle-head';
    ['Item', 'Field', 'Offset', 'Raw', 'Value a scanner should return'].forEach(function (name) {
      var cell = document.createElement('span');
      cell.textContent = name;
      header.appendChild(cell);
    });
    els.oracle.appendChild(header);

    var rows = decoded.unique.slice();
    decoded.legs.forEach(function (leg) {
      leg.fields.forEach(function (f) {
        rows.push({
          item: f.item,
          label: (decoded.legs.length > 1 ? 'Leg ' + leg.index + ' \u00b7 ' : '') + f.label,
          offset: f.offset,
          raw: f.raw,
          value: f.value,
          meaning: f.meaning
        });
      });
    });

    rows.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'oracle-row' + (f.value === '' ? ' oracle-empty' : '');
      [String(f.item), f.label, String(f.offset + 1), JSON.stringify(f.raw),
        f.value + (f.meaning ? '  (' + f.meaning + ')' : '')].forEach(function (value, i) {
          var cell = document.createElement('span');
          cell.textContent = value;
          if (i === 4) cell.className = 'oracle-value';
          row.appendChild(cell);
        });
      els.oracle.appendChild(row);
    });

    if (decoded.security) {
      var sec = document.createElement('div');
      sec.className = 'oracle-row';
      ['25\u201330', 'Security data', String(decoded.security.offset),
        JSON.stringify(decoded.security.data),
        decoded.security.data + '  (type ' + decoded.security.type + ')'].forEach(function (value) {
          var cell = document.createElement('span');
          cell.textContent = value;
          sec.appendChild(cell);
        });
      els.oracle.appendChild(sec);
    }

    decoded.checks.forEach(function (check) {
      var row = document.createElement('div');
      row.className = 'check-row ' + (check.ok ? 'check-ok' : 'check-bad');
      var mark = document.createElement('span');
      mark.className = 'check-mark';
      mark.textContent = check.ok ? '\u2713' : '\u2717';
      var label = document.createElement('span');
      label.className = 'check-label';
      label.textContent = check.label;
      var detail = document.createElement('span');
      detail.className = 'check-detail';
      detail.textContent = check.detail;
      row.appendChild(mark);
      row.appendChild(label);
      row.appendChild(detail);
      els.checks.appendChild(row);
    });

    if (decoded.warnings.length) {
      var warn = document.createElement('div');
      warn.className = 'check-row check-warn';
      var warnMark = document.createElement('span');
      warnMark.className = 'check-mark';
      warnMark.textContent = '!';
      var warnText = document.createElement('span');
      warnText.className = 'check-label';
      warnText.textContent = decoded.warnings.join(' ');
      warn.appendChild(warnMark);
      warn.appendChild(warnText);
      els.checks.appendChild(warn);
    }
  }

  /* ---------------------------------------------------------------------------
     Highlighting what a click changed

     Randomise rewrites a dozen controls at once. Marking the ones whose value
     actually moved turns the click into a visible edit instead of a silent
     rewrite, and it is the same idea the GS1 generator uses on its AI rows.
     --------------------------------------------------------------------------- */

  var HIGHLIGHT_FIELDS = [
    'airline', 'passenger_name', 'pnr', 'passenger_status', 'passenger_description',
    'checkin_source', 'issuance_source', 'issue_date', 'document_type', 'issuer_airline', 'bag_tags'
  ];

  var HIGHLIGHT_LEG_FIELDS = [
    'from', 'to', 'flight', 'date', 'compartment', 'seat', 'sequence', 'pnr',
    'freeBaggage', 'marketingCarrier', 'ffAirline', 'ffNumber'
  ];

  /* Every control a randomise can rewrite, flattened to name -> value. */
  function snapshotForm() {
    var snapshot = {};
    HIGHLIGHT_FIELDS.forEach(function (id) {
      snapshot[id] = els[id] ? els[id].value : '';
    });
    legEditors().forEach(function (editor, index) {
      HIGHLIGHT_LEG_FIELDS.forEach(function (name) {
        var el = editor.querySelector('[data-field="' + name + '"]');
        snapshot['leg' + index + '.' + name] = el ? el.value : '';
      });
    });
    return snapshot;
  }

  function flash(el) {
    el.classList.remove('just-changed');
    /* Reading offsetWidth flushes the removal, so the animation replays even
       when the same control changes on two consecutive clicks. */
    void el.offsetWidth;
    el.classList.add('just-changed');
  }

  /* Returns how many controls changed; 0 when there is no baseline to compare
     against, which is the case on the initial silent randomise. */
  function highlightChanges(before) {
    if (!before) return 0;
    var changed = 0;

    function mark(el, previous) {
      if (!el || previous === undefined) return;
      if (previous === el.value) {
        el.classList.remove('just-changed');
        return;
      }
      flash(el);
      changed++;
    }

    HIGHLIGHT_FIELDS.forEach(function (id) { mark(els[id], before[id]); });
    legEditors().forEach(function (editor, index) {
      HIGHLIGHT_LEG_FIELDS.forEach(function (name) {
        mark(editor.querySelector('[data-field="' + name + '"]'),
          before['leg' + index + '.' + name]);
      });
    });

    return changed;
  }

  /* A newly added leg arrives pre-filled, so mark whatever it came with. */
  function highlightNewLeg(editor) {
    if (!editor) return;
    HIGHLIGHT_LEG_FIELDS.forEach(function (name) {
      var el = editor.querySelector('[data-field="' + name + '"]');
      if (el && el.value) flash(el);
    });
  }

  /* ---------------------------------------------------------------------------
     Actions
     --------------------------------------------------------------------------- */

  function randomise(silent) {
    /* Snapshot before touching anything, so the comparison is against what the
       user could actually see on screen. */
    var before = silent ? null : snapshotForm();

    var legs = parseInt(els.leg_count.value, 10) || 1;
    var record = window.Bcbp.randomRecord({ legs: legs });
    record.legs.forEach(function (leg) { leg.dateValue = isoFromJulian(leg.julianDate); });
    var airline = window.Bcbp.airline(record.legs[0].carrier);
    if (airline) els.airline.value = airline.iata;
    els.version.value = String(window.Bcbp.CURRENT_VERSION);
    /* A fresh sample is a fresh pass, so a hand-edited item 30 goes away too. */
    state.securityManual = false;
    els.security_type.value = SECURITY_TYPE;
    els.security_data.value = '';
    writeForm(record);

    var changed = highlightChanges(before);
    if (!silent) {
      analytics.action('randomise', {
        style: state.style,
        format: state.format,
        legs: legs,
        changed: changed
      });
    }
    return generate(silent ? 'init' : 'randomise');
  }

  function download() {
    if (!state.lastPayload) return;
    analytics.action('download', { style: state.style, format: state.format });
    els.preview.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      var name = state.lastDecoded && state.lastDecoded.pnr
        ? state.lastDecoded.pnr.toLowerCase() : 'boarding-pass';
      a.download = 'boarding-pass-' + name + '-' + state.style + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  function copyPayload() {
    var value = els.payload.value;
    if (!value) return;
    navigator.clipboard.writeText(value).then(function () {
      analytics.action('copy_payload', { length: value.length });
      els.copy_payload.textContent = 'Copied';
      setTimeout(function () { els.copy_payload.textContent = 'Copy payload'; }, 1400);
    }, function () {
      els.payload.select();
    });
  }

  /* ---------------------------------------------------------------------------
     Wiring
     --------------------------------------------------------------------------- */

  function wireEvents() {
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { generate('internal'); }, 320);
    }

    els.randomise.addEventListener('click', function () { randomise(false); });
    /* Re-sign unlatches a hand edit and lets autoSign() fill item 30 again. */
    els.resign.addEventListener('click', function () {
      state.securityManual = false;
      generate('resign');
    });
    els.download.addEventListener('click', download);
    els.copy_payload.addEventListener('click', copyPayload);

    els.add_leg.addEventListener('click', function () {
      var record = collectRecord();
      if (record.legs.length >= window.Bcbp.MAX_LEGS) return;
      var last = record.legs[record.legs.length - 1];
      record.legs.push(newLegFrom(last));
      writeForm(record);
      highlightNewLeg(legEditors()[record.legs.length - 1]);
      generate('add-leg');
    });

    els.leg_count.addEventListener('change', function () {
      var record = collectRecord();
      var want = Math.max(1, Math.min(window.Bcbp.MAX_LEGS, parseInt(els.leg_count.value, 10) || 1));
      while (record.legs.length > want) record.legs.pop();
      while (record.legs.length < want) {
        record.legs.push(newLegFrom(record.legs[record.legs.length - 1]));
      }
      writeForm(record);
      generate('leg-count');
    });

    els.pass_style.addEventListener('change', function () {
      state.style = els.pass_style.value;
      generate('style');
    });

    els.barcode_format.addEventListener('change', function () {
      state.format = els.barcode_format.value;
      var minVersion = FORMATS[state.format].minVersion;
      if (parseInt(els.version.value, 10) < minVersion) els.version.value = String(minVersion);
      generate('format');
    });

    els.version.addEventListener('change', function () { generate('version'); });

    els.airline.addEventListener('change', function () {
      var airline = window.Bcbp.airline(els.airline.value);
      if (!airline) return;
      els.issuer_airline.value = airline.iata;
      legEditors().forEach(function (editor) {
        setLegValue(editor, 'marketingCarrier', airline.iata);
        setLegValue(editor, 'ffAirline', airline.iata);
      });
      generate('airline');
    });

    els.legs_container.addEventListener('input', schedule);
    els.legs_container.addEventListener('change', schedule);

    /* The PNR field repeats per leg. Editing it here is meant to change the
       locator for the whole pass, so push the new value into every leg that is
       still carrying the previous one. A leg whose PNR was deliberately given a
       different value keeps it. */
    els.pnr.addEventListener('input', function () {
      var previous = state.lastRecordPnr || '';
      var next = els.pnr.value;
      legEditors().forEach(function (editor) {
        var el = editor.querySelector('[data-field="pnr"]');
        if (el && (el.value === previous || el.value === '')) el.value = next;
      });
      state.lastRecordPnr = next;
      schedule();
    });
    els.pnr.addEventListener('change', function () { state.lastRecordPnr = els.pnr.value; });

    ['passenger_name', 'passenger_status', 'passenger_description',
      'checkin_source', 'issuance_source', 'issue_date', 'document_type',
      'issuer_airline', 'bag_tags'].forEach(function (id) {
        els[id].addEventListener('input', schedule);
        els[id].addEventListener('change', schedule);
      });

    /* Item 30 is machine-filled, so a keystroke in either security field is a
       deliberate hand edit: latch manual mode, keep the value as typed (even
       if it is empty) and stop re-signing until Re-sign or Randomise. */
    function securityEdited() {
      state.securityManual = true;
      schedule();
    }
    els.security_type.addEventListener('input', securityEdited);
    els.security_type.addEventListener('change', securityEdited);
    els.security_data.addEventListener('input', securityEdited);
    els.security_data.addEventListener('change', securityEdited);
  }

  function newLegFrom(previous) {
    var airline = window.Bcbp.airline(els.airline.value) || {};
    return {
      from: previous ? previous.to : 'SEA',
      to: previous && previous.to === 'SFO' ? 'ORD' : 'SFO',
      pnr: previous ? previous.pnr : '',
      carrier: els.airline.value,
      flightNumber: '100',
      julianDate: '',
      dateValue: previous ? previous.dateValue : '',
      compartment: 'Y',
      seat: '',
      sequence: '',
      freeBaggage: '',
      marketingCarrier: airline.iata || '',
      ffAirline: airline.iata || '',
      ffNumber: '',
      airlineNumericCode: airline.numeric || ''
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
