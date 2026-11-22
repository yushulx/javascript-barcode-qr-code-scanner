/* Single-canvas GS1 checkout game — state, input and business wiring. */
(function () {
  'use strict';

  var E = window.POSEngine;
  var F = window.POSFixtures;
  var R = window.POSBarcodeRenderer;
  var SDK = window.POSSDKDecoder;
  var Renderer = window.POSCanvasRenderer;
  var analytics = window.DemoAnalytics || { track: function () {}, action: function () {}, ready: function () {}, error: function () {} };

  var UNKNOWN_GTIN = '09506000134383';
  var INVALID_GTIN = '09506000134353';
  var SANDBOX_PRODUCTS = [
    { key: 'juice', label: 'Fresh Juice', gtin: F.BASE_GTIN },
    { key: 'milk', label: 'Whole Milk', gtin: F.ALT_GTIN },
    { key: 'water', label: 'Sparkling Water', gtin: '09506000134376' },
    { key: 'unknown', label: 'Unknown SKU', gtin: UNKNOWN_GTIN }
  ];
  var SANDBOX_DATASETS = [
    { key: 'match', label: 'MATCH' },
    { key: 'conflict', label: 'CONFLICT' },
    { key: 'unknown', label: 'UNKNOWN SKU' },
    { key: 'invalid', label: 'BAD CHECK' }
  ];
  var CARRIERS = ['both', '1d', '2d'];

  var canvas = document.getElementById('pos-game');
  var upload = document.getElementById('upload-image');
  var live = document.getElementById('live-status');
  var fallback = document.getElementById('game-fallback');
  var accessible = {};
  var renderer;
  var assetsToken = 0;
  var pointer = { downHit: null, startX: 0, startY: 0 };
  var frameRequested = false;

  var savedReduced = null;
  try { savedReduced = localStorage.getItem('gs1-pos-game-motion'); } catch (error) {}
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    mode: 'guided',
    scenarioIndex: 0,
    scenario: F.SCENARIOS[0],
    completed: {},
    fixture: null,
    product: null,
    assets: null,
    assetsLoading: false,
    cart: {},
    cartQty: 0,
    catalog: F.PRODUCTS,
    trace: [],
    reports: [],
    lastDecision: null,
    lastPresentation: null,
    lastObservations: null,
    lastReadFormats: [],
    lastReadCount: 0,
    productCatalogFound: false,
    packageIndex: 1,
    packageCount: 1,
    presentationCounter: 0,
    packageCounter: 0,
    scanCount: 0,
    phase: 'idle',
    phaseStart: 0,
    busy: false,
    started: false,
    tutorialOpen: true,
    completeOpen: false,
    reduceMotion: savedReduced === null ? prefersReduced : savedReduced === '1',
    hint: '',
    narrative: '',
    eanText: '',
    sdkStatus: '',
    drag: { active: false, x: 0, y: 0, moved: false },
    packageRect: null,
    toast: null,
    justPassedAt: 0,
    renderErrors: [],
    sandbox: {
      productIndex: 0,
      datasetIndex: 0,
      carrierIndex: 0,
      qrMarketing: false
    },
    sandboxProductLabel: '',
    sandboxCarrierLabel: '',
    sandboxQrLabel: '',
    sandboxDatasetLabel: ''
  };

  function now() { return performance.now(); }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function money(value) { return '$' + Number(value).toFixed(2); }

  function track(name, data) {
    if (typeof analytics.track === 'function') analytics.track(name, data || {});
    else analytics.action(name, data || {});
  }

  function announce(message) {
    if (live) live.textContent = message;
  }

  function scenarioFor(index) {
    return F.SCENARIOS[Math.max(0, Math.min(4, index))];
  }

  function sandboxProduct() {
    return SANDBOX_PRODUCTS[state.sandbox.productIndex];
  }

  function calculateSandboxFixture() {
    var selected = sandboxProduct();
    var dataset = SANDBOX_DATASETS[state.sandbox.datasetIndex].key;
    var gtin = selected.gtin;
    var gtin2d = selected.gtin;
    if (dataset === 'conflict') {
      gtin2d = selected.gtin === F.BASE_GTIN ? F.ALT_GTIN : F.BASE_GTIN;
    } else if (dataset === 'unknown') {
      gtin = UNKNOWN_GTIN;
      gtin2d = UNKNOWN_GTIN;
    } else if (dataset === 'invalid') {
      gtin = INVALID_GTIN;
      gtin2d = INVALID_GTIN;
    }
    return {
      gtin: gtin,
      gtin2d: gtin2d,
      carriers: CARRIERS[state.sandbox.carrierIndex],
      lot: 'B17',
      expiry: '271231',
      qrType: state.sandbox.qrMarketing ? 'marketing' : 'digital-link',
      dataset: dataset
    };
  }

  function buildFixture() {
    if (state.mode === 'guided') {
      var scenario = scenarioFor(state.scenarioIndex);
      return {
        gtin: scenario.gtin,
        gtin2d: scenario.gtin2d,
        carriers: scenario.carriers,
        lot: scenario.lot,
        expiry: scenario.expiry,
        qrType: 'digital-link',
        dataset: 'match'
      };
    }
    return calculateSandboxFixture();
  }

  function productFor(fixture) {
    if (fixture.dataset === 'unknown') {
      return {
        name: 'Mystery Pack', shortName: 'Unknown SKU', brand: 'NORTHFIELD LAB', price: 0,
        color: '#a8a399', detail: 'Valid GTIN · absent from local catalog'
      };
    }
    if (fixture.dataset === 'invalid') {
      return {
        name: 'Invalid GTIN Test Pack', shortName: 'Invalid GTIN', brand: 'TEST LAB', price: 0,
        color: '#c38477', detail: 'Deliberately broken check digit'
      };
    }
    return F.PRODUCTS[fixture.gtin] || F.PRODUCTS[F.BASE_GTIN];
  }

  function sandboxLabels() {
    state.sandboxProductLabel = SANDBOX_PRODUCTS[state.sandbox.productIndex].label;
    state.sandboxCarrierLabel = { both: 'EAN + QR', '1d': 'EAN-13 ONLY', '2d': 'QR ONLY' }[CARRIERS[state.sandbox.carrierIndex]];
    state.sandboxQrLabel = state.sandbox.qrMarketing ? 'WEB URL' : 'GS1 LINK';
    state.sandboxDatasetLabel = SANDBOX_DATASETS[state.sandbox.datasetIndex].label;
  }

  function showToast(message) {
    state.toast = { message: message, until: now() + 2600 };
  }

  function setPhase(phase) {
    state.phase = phase;
    state.phaseStart = now();
  }

  function addTrace(event, detail, origin, time, decisionStatus) {
    state.trace.push({
      event: event,
      detail: String(detail || ''),
      origin: origin || 'simulation',
      time: Math.max(0, Math.round(Number(time || 0))),
      decisionStatus: decisionStatus || ''
    });
    if (state.trace.length > 400) state.trace.shift();
  }

  function createPresentation(origin) {
    state.packageCounter += 1;
    state.presentationCounter += 1;
    return {
      presentationId: 'presentation-' + state.presentationCounter,
      packageInstanceId: 'package-' + state.packageCounter,
      origin: origin,
      wasCommitted: false,
      cart: state.cart
    };
  }

  function simulatedObservations(fixture, presentation) {
    var observations = [];
    if (fixture.carriers === '1d' || fixture.carriers === 'both') {
      observations.push(E.createObservation({
        observationId: presentation.presentationId + '-ean',
        presentationId: presentation.presentationId,
        origin: 'simulation',
        format: 'EAN_13',
        rawText: F.ean13(fixture.gtin) || fixture.gtin,
        decodedAtMs: 91
      }));
    }
    if (fixture.carriers === '2d' || fixture.carriers === 'both') {
      var raw = fixture.qrType === 'marketing'
        ? 'https://example.com/promotions/summer'
        : F.digitalLink(fixture.gtin2d, fixture.lot, fixture.expiry);
      observations.push(E.createObservation({
        observationId: presentation.presentationId + '-qr',
        presentationId: presentation.presentationId,
        origin: 'simulation',
        format: 'QR_CODE',
        rawText: raw,
        decodedAtMs: 106
      }));
    }
    return observations;
  }

  function oracleFor(presentation, observations) {
    return E.completePresentation({
      presentationId: presentation.presentationId,
      packageInstanceId: presentation.packageInstanceId,
      origin: presentation.origin,
      wasCommitted: presentation.wasCommitted,
      cart: {}
    }, observations, F.PRODUCTS);
  }

  function updateCartSummary() {
    state.cartQty = Object.keys(state.cart).reduce(function (sum, gtin) {
      return sum + state.cart[gtin].quantity;
    }, 0);
  }

  function verdictFor(decision, oracle) {
    return decision.status === oracle.status && decision.quantityAdded === oracle.quantityAdded ? 'PASS' : 'FAIL';
  }

  function syncAccessible() {
    if (!accessible.scan) return;
    var decision = state.lastDecision
      ? E.decisionLabel(state.lastDecision) + '; ' + state.lastDecision.reason
      : (state.busy ? 'Scanner reading' : 'No decision yet');
    canvas.setAttribute('aria-label',
      'Interactive 2D checkout game. Mode: ' + state.mode + '. Level ' + (state.scenarioIndex + 1) +
      ' of 5. ' + completedCount() + ' levels complete. Cart units: ' + state.cartQty + '. ' +
      'Last POS decision: ' + decision + '. ' + state.hint);
    accessible.scan.setAttribute('aria-label', 'Scan current item. ' + state.hint);
    accessible.repeat.disabled = state.busy || !state.lastPresentation;
    accessible.next.disabled = state.busy || state.mode !== 'guided' || !state.completed[state.scenario.number] || state.scenarioIndex >= 4;
    accessible.results.disabled = completedCount() < 5;
    accessible.level.value = String(state.scenarioIndex + 1);
    accessible.start.textContent = !state.started
      ? 'Start the checkout briefing'
      : (state.tutorialOpen ? 'Close the checkout briefing' : 'Reopen the checkout briefing');
    accessible.motion.textContent = state.reduceMotion ? 'Enable conveyor motion' : 'Reduce conveyor motion';
    accessible.scan.textContent = state.busy ? 'Scanner is reading the current item' : 'Scan current item';
  }

  function computeHint() {
    if (state.busy) {
      state.hint = state.mode === 'sdk' ? 'Dynamsoft is reading the rendered image. No fixture success is substituted.' : 'The scanner is reading every carrier printed on this package.';
      return;
    }
    if (state.mode === 'guided') {
      var sc = scenarioFor(state.scenarioIndex);
      var qty = state.cart[sc.gtin] ? state.cart[sc.gtin].quantity : 0;
      if (sc.id === 'traditional') {
        state.hint = qty ? 'EAN-13 alone still works: one scan, one cart unit.' : 'Click SCAN ITEM, press Space, or drag the pack into the scanner.';
      } else if (sc.id === 'two-dimensional') {
        state.hint = qty ? 'The QR resolved the product from AI (01), not from a catalog lookup.' : 'This pass reads the GS1 Digital Link QR only. The symbols are real images.';
      } else if (sc.id === 'dual-marked') {
        state.hint = qty ? 'Two carriers, one GTIN, one package: one unit and one acknowledgement.' : 'Read both printed carriers in one pass. Watch the POS reads counter.';
      } else if (sc.id === 'two-products') {
        if (qty === 0) state.hint = 'PACKAGE 1 OF 2 · Scan this package.';
        else if (qty === 1) state.hint = 'PACKAGE 2 OF 2 is a separate item. Click SCAN ITEM again — REPEAT PASS is ignored.';
        else state.hint = 'Two physical packages → two units. Each package gets a new presentation.';
      } else {
        state.hint = qty === 0 && !state.lastDecision
          ? 'The printed EAN and QR disagree. Send it through and watch what the POS refuses to do.'
          : 'Conflict: the POS must stop for review instead of silently choosing one GTIN.';
      }
      return;
    }
    if (state.mode === 'sdk') {
      state.hint = state.sdkStatus || 'Decode the generated label with Dynamsoft. A real no-result stays NO_RESULT.';
      return;
    }
    var f = state.fixture;
    if (f.dataset === 'conflict') state.hint = 'Conflict fixture: two valid but different GTINs on one package.';
    else if (f.dataset === 'unknown') state.hint = 'Unknown-SKU fixture: the GTIN is valid but the local catalog has no match.';
    else if (f.dataset === 'invalid') state.hint = 'Bad-check-digit fixture: expected to be rejected, never rounded into a product.';
    else if (f.qrType === 'marketing') state.hint = 'Unrelated marketing URL: readable as a QR, but not a GS1 product identifier.';
    else if (f.carriers === '1d') state.hint = 'EAN-only pass: legacy checkout path.';
    else if (f.carriers === '2d') state.hint = 'QR-only pass: GS1 Digital Link resolves the product identity.';
    else state.hint = 'Matching dual carriers: expect one unit, not two.';
  }

  function refreshHint() {
    computeHint();
    syncAccessible();
  }

  function refreshNarrative() {
    var d = state.lastDecision;
    if (state.busy) {
      state.narrative = state.mode === 'sdk'
        ? 'Dynamsoft Capture Vision is decoding the actual image.'
        : 'Carrier observations are being grouped inside this package presentation.';
      return;
    }
    if (!d) {
      state.narrative = state.mode === 'sdk'
        ? 'Choose Decode Package to load the SDK, or upload a barcode image.'
        : 'One physical package becomes one presentation. Carrier reads inside it are grouped before the cart changes.';
      return;
    }
    var qty = state.scenario ? (state.cart[state.scenario.gtin] ? state.cart[state.scenario.gtin].quantity : 0) : state.cartQty;
    if (state.mode === 'guided' && state.scenario.id === 'two-products') {
      if (qty === 1) { state.narrative = 'Package 1 committed. The second physical package is a new presentation and may add another unit.'; return; }
      if (qty >= 2) { state.narrative = 'Two separate presentations × one GTIN = two units. A GTIN-only cache would wrongly block the second pack.'; return; }
    }
    var copy = {
      MATCHED_CARRIERS_ONE_PRESENTATION: 'Two reads carried the same GTIN. They were paired inside one presentation, so the cart moved once.',
      VALID_GTIN: 'One valid GTIN resolved to the local SKU catalog. This presentation committed exactly one unit.',
      SAME_PRESENTATION: 'This presentation was already committed. Repeating the same pass cannot charge the item twice.',
      GTIN_CONFLICT: 'The carriers found different valid GTINs in the same presentation. There is no safe automatic choice, so the POS requires review.',
      UNKNOWN_PRODUCT: 'The GTIN is valid, but this synthetic catalog has no matching product. It stays out of the cart for review.',
      INVALID_GTIN: 'The GTIN check digit is invalid. The value was rejected rather than rounded or guessed.',
      NO_VALID_GTIN: 'The QR was readable, but it did not contain a GS1 product identifier. A URL is not automatically a retail item code.',
      NO_RESULT: 'NO_RESULT — Dynamsoft returned no barcode. The interface does not replace that with fixture data.',
      SDK_ERROR: 'The SDK could not complete this image decode. The trace records an error, not a successful scan.'
    };
    state.narrative = copy[d.reason] || ('POS decision: ' + d.reason + '.');
    syncAccessible();
  }

  function updateDerived() {
    updateCartSummary();
    state.productCatalogFound = !!(state.lastDecision && state.lastDecision.gtin && F.PRODUCTS[state.lastDecision.gtin]);
    sandboxLabels();
    refreshHint();
    refreshNarrative();
  }

  function resetCurrentState() {
    state.cart = {};
    state.lastDecision = null;
    state.lastPresentation = null;
    state.lastObservations = null;
    state.lastReadFormats = [];
    state.lastReadCount = 0;
    state.productCatalogFound = false;
    state.packageIndex = 1;
    state.packageCount = state.mode === 'guided' && state.scenario.id === 'two-products' ? 2 : 1;
    state.phase = 'idle';
    state.phaseStart = now();
    state.busy = false;
    state.trace = [];
    state.sdkStatus = '';
    state.drag.active = false;
    updateDerived();
  }

  function applyFixture(reset) {
    state.fixture = buildFixture();
    state.product = productFor(state.fixture);
    state.eanText = F.ean13(state.fixture.gtin) || state.fixture.gtin;
    if (reset) resetCurrentState();
    sandboxLabels();
    refreshHint();
    refreshNarrative();
    loadAssets();
  }

  function loadAssets() {
    var token = ++assetsToken;
    state.assets = null;
    state.assetsLoading = true;
    state.renderErrors = [];
    R.renderPackage(state.fixture, state.product).then(function (rendered) {
      if (token !== assetsToken) return;
      state.assets = rendered;
      state.assetsLoading = false;
      state.renderErrors = rendered.errors || [];
    }).catch(function (error) {
      if (token !== assetsToken) return;
      state.assetsLoading = false;
      state.renderErrors = [error.message || String(error)];
    });
  }

  function evaluateChallenge(decision) {
    if (state.mode !== 'guided') return;
    var sc = state.scenario;
    var qty = state.cart[sc.gtin] ? state.cart[sc.gtin].quantity : 0;
    var passed;
    if (sc.id === 'two-products') passed = qty >= 2;
    else if (sc.id === 'mismatch') passed = decision.status === 'needs_review' && decision.reason === 'GTIN_CONFLICT';
    else passed = decision.status === 'added' && decision.quantityAdded === 1;
    if (!passed || state.completed[sc.number]) return;
    state.completed[sc.number] = true;
    state.justPassedAt = now();
    var complete = completedCount();
    showToast('LEVEL ' + sc.number + ' CLEARED · ' + complete + '/5');
    addTrace('CHALLENGE · PASS', sc.lesson, decision.origin, 120);
    announce('Level ' + sc.number + ' complete. ' + sc.lesson + ' ' + completedCountLabel());
    track('pos_lab_complete_scenario', { scenario_id: sc.id, pass_fail: 'pass', origin: decision.origin });
    if (complete === 5) {
      showToast('5/5 COMPLETE · open RESULTS to download the report');
    }
  }

  function completedCountLabel() {
    var count = Object.keys(state.completed).filter(function (key) { return state.completed[key]; }).length;
    return count + ' of 5 levels complete.';
  }

  function completedCount() {
    return Object.keys(state.completed).filter(function (key) { return state.completed[key]; }).length;
  }

  function recordDecision(decision, presentation, observations, options) {
    options = options || {};
    var maxReadTime = observations.reduce(function (max, obs) {
      return Math.max(max, Number(obs.decodedAtMs) || 0);
    }, 0);
    observations.forEach(function (obs) {
      addTrace('READ · ' + obs.format, obs.rawText, obs.origin, obs.decodedAtMs);
    });
    decision.identities.forEach(function (identity) {
      var detail = identity.status === 'valid'
        ? 'GTIN-14 ' + identity.gtin + (identity.lot ? ' · lot ' + identity.lot : '') + (identity.expiry ? ' · expiry ' + identity.expiry : '')
        : identity.status.replace(/_/g, ' ') + ' · ' + (identity.error || 'not recognized');
      addTrace(identity.status === 'valid' ? 'PARSE · VALID GTIN' : 'PARSE · NOT VALID', detail,
        decision.origin, Math.max(1, maxReadTime - 1));
    });
    addTrace('POS · ' + E.decisionLabel(decision).toUpperCase(), decision.reason, decision.origin,
      maxReadTime + 2, decision.status);

    state.lastDecision = decision;
    state.lastPresentation = presentation;
    state.lastObservations = observations;
    state.lastReadFormats = observations.map(function (obs) { return obs.format; });
    state.lastReadCount = observations.length;
    state.productCatalogFound = !!(decision.gtin && F.PRODUCTS[decision.gtin]);

    if (options.sdkFailure) state.sdkStatus = options.sdkFailure;

    var oracle = options.oracle || oracleFor(presentation, observations);
    var report = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      scenario: state.mode === 'guided' ? state.scenario.id : state.mode,
      mode: state.mode,
      expectedStatus: options.expectedStatus || oracle.status,
      actualStatus: decision.status,
      expectedQuantity: options.expectedQuantity == null ? oracle.quantityAdded : options.expectedQuantity,
      actualQuantity: decision.quantityAdded,
      origin: decision.origin,
      presentationId: presentation.presentationId,
      packageInstanceId: presentation.packageInstanceId,
      rule: decision.reason,
      verdict: options.verdict || verdictFor(decision, oracle),
      expectedReadCount: options.expectedReadCount == null ? observations.length : options.expectedReadCount,
      actualReadCount: observations.length,
      expectedRaw: options.expectedRaw || observations.map(function (obs) { return obs.rawText; }),
      observedRaw: observations.map(function (obs) { return obs.rawText; }),
      gtins: decision.gtins || (decision.gtin ? [decision.gtin] : [])
    };
    state.reports.push(report);
    updateDerived();
    evaluateChallenge(decision);
    refreshHint();
    refreshNarrative();
    announce(E.decisionLabel(decision) + '. ' + state.narrative + ' ' +
      (state.mode === 'guided' ? completedCountLabel() : ''));
    track('pos_lab_complete_scenario', {
      scenario_id: state.mode === 'guided' ? state.scenario.id : state.mode,
      pass_fail: report.verdict.toLowerCase(), origin: decision.origin
    });
  }

  async function startSimulation() {
    if (state.busy || !state.started || state.tutorialOpen || state.completeOpen) return;
    if (state.mode === 'sdk') { startSdkDecode(); return; }
    state.busy = true;
    state.scanCount += 1;
    var presentation = createPresentation('simulation');
    addTrace('START PRESENTATION', presentation.packageInstanceId + ' → ' + presentation.presentationId, 'simulation', 0);
    refreshHint();
    refreshNarrative();
    try {
      if (!state.reduceMotion) {
        setPhase('feed');
        await wait(470);
        setPhase('scan');
        await wait(520);
      } else {
        setPhase('scan');
        setPhase('scan');
      }
      var observations = simulatedObservations(state.fixture, presentation);
      var oracle = oracleFor(presentation, observations);
      var decision = E.completePresentation(presentation, observations, F.PRODUCTS);
      recordDecision(decision, presentation, observations, { oracle: oracle });
      setPhase('exit');
      if (!state.reduceMotion) await wait(390);
      finishPackageVisual(decision);
      state.busy = false;
      refreshHint();
      refreshNarrative();
      track('pos_lab_scan_item', {
        scenario_id: state.mode === 'guided' ? state.scenario.id : 'sandbox',
        result: decision.status, origin: 'simulation'
      });
    } catch (error) {
      state.busy = false;
      setPhase('idle');
      addTrace('SIMULATION ERROR', error.message || String(error), 'simulation', 0);
      showToast('The simulation could not complete this pass.');
      if (analytics.error) analytics.error('simulation_failed', error.message || String(error));
    }
  }

  function finishPackageVisual(decision) {
    if (state.mode === 'sandbox') {
      state.packageIndex += 1;
      setPhase('idle');
      return;
    }
    if (state.scenario.id === 'two-products' && decision.status === 'added' && decision.quantityAdded === 1 && state.cartQty === 1) {
      state.packageIndex = 2;
      setPhase('idle');
      return;
    }
    setPhase('done');
  }

  async function repeatLastPass() {
    if (state.busy || state.mode === 'sdk' || !state.lastPresentation || !state.lastObservations) return;
    state.busy = true;
    addTrace('REPEAT PRESENTATION', state.lastPresentation.presentationId + ' · no new physical package', 'simulation', 0);
    setPhase('scan');
    refreshHint();
    refreshNarrative();
    if (!state.reduceMotion) await wait(430);
    var presentation = state.lastPresentation;
    var observations = state.lastObservations;
    var oracle = oracleFor(presentation, observations);
    var decision = E.completePresentation(presentation, observations, F.PRODUCTS);
    recordDecision(decision, presentation, observations, { oracle: oracle });
    setPhase('done');
    state.busy = false;
    refreshHint();
    refreshNarrative();
    showToast('Same presentation repeated — no new unit.');
  }

  async function startSdkDecode(file) {
    if (state.busy || !state.started) return;
    if (!file && (!state.assets || !state.assets.composite || state.renderErrors.length)) {
      showToast('Wait for a valid package image before decoding.');
      return;
    }
    state.busy = true;
    state.sdkStatus = 'Loading Dynamsoft and decoding the image…';
    var presentation = createPresentation('sdk-image');
    addTrace('START SDK IMAGE', file ? file.name + ' · one image as one test presentation' : presentation.packageInstanceId + ' · native-resolution label', 'sdk-image', 0);
    refreshHint();
    refreshNarrative();
    var fixture = state.fixture;
    var expectedPresentation = {
      presentationId: presentation.presentationId,
      packageInstanceId: presentation.packageInstanceId,
      origin: 'simulation',
      wasCommitted: false,
      cart: {}
    };
    var expectedObservations = simulatedObservations(fixture, presentation);
    var oracle = E.completePresentation(expectedPresentation, expectedObservations, F.PRODUCTS);
    var started = now();
    try {
      setPhase('feed');
      if (!state.reduceMotion) await wait(400);
      setPhase('scan');
      var result = file ? await SDK.decodeFile(file, presentation.presentationId)
        : { observations: await SDK.decodeCanvas(state.assets.composite, presentation.presentationId) };
      var observations = result.observations || [];
      observations.forEach(function (obs) { obs.decodedAtMs = Math.max(1, Math.round(now() - started)); });
      var decision = E.completePresentation(presentation, observations, F.PRODUCTS);
      recordDecision(decision, presentation, observations, file ? {
        expectedStatus: 'USER_SUPPLIED_IMAGE',
        expectedQuantity: 'n/a',
        expectedReadCount: 'n/a',
        expectedRaw: [],
        verdict: observations.length ? 'DECODED' : 'NO_RESULT'
      } : {
        oracle: oracle,
        expectedReadCount: expectedObservations.length,
        expectedRaw: expectedObservations.map(function (obs) { return obs.rawText; })
      });
      state.sdkStatus = observations.length
        ? 'Dynamsoft returned ' + observations.length + ' barcode' + (observations.length === 1 ? '' : 's') + '. The POS then applied its own rules.'
        : 'NO_RESULT — Dynamsoft returned no barcode. Nothing was synthesized.';
      setPhase('done');
      state.busy = false;
      refreshHint();
      refreshNarrative();
      track('pos_lab_run_sdk_decode', {
        succeeded: observations.length > 0,
        format: observations.map(function (obs) { return obs.format; }).join(',')
      });
    } catch (error) {
      recordDecision({
        presentationId: presentation.presentationId,
        packageInstanceId: presentation.packageInstanceId,
        origin: 'sdk-image',
        observationIds: [],
        identities: [],
        quantityAdded: 0,
        status: 'not_added',
        reason: 'SDK_ERROR'
      }, presentation, [], {
        expectedStatus: file ? 'USER_SUPPLIED_IMAGE' : oracle.status,
        expectedQuantity: file ? 'n/a' : oracle.quantityAdded,
        expectedRaw: file ? [] : expectedObservations.map(function (obs) { return obs.rawText; }),
        verdict: 'ERROR',
        sdkFailure: 'SDK decode failed: ' + (error.message || error)
      });
      addTrace('SDK ERROR', error.message || String(error), 'sdk-image', Math.round(now() - started), 'not_added');
      setPhase('done');
      state.busy = false;
      refreshHint();
      refreshNarrative();
      if (analytics.error) analytics.error('sdk_decode_failed', error.message || String(error));
    } finally {
      upload.value = '';
      state.busy = false;
    }
  }

  function switchMode(mode) {
    if (state.busy || mode === state.mode) return;
    state.mode = mode;
    state.completeOpen = false;
    state.tutorialOpen = false;
    if (mode === 'guided') state.scenario = scenarioFor(state.scenarioIndex);
    state.sdkStatus = '';
    applyFixture(true);
    showToast(mode === 'guided' ? 'Guided challenges' : (mode === 'sandbox' ? 'Free sandbox' : 'Real SDK image decode'));
    track('pos_lab_mode_change', { mode: mode });
  }

  function goLevel(number) {
    if (state.busy) return;
    state.mode = 'guided';
    state.scenarioIndex = Math.max(0, Math.min(4, number - 1));
    state.scenario = scenarioFor(state.scenarioIndex);
    state.completeOpen = false;
    state.tutorialOpen = false;
    state.sdkStatus = '';
    applyFixture(true);
    track('pos_lab_start_scenario', { scenario_id: state.scenario.id });
    announce('Level ' + state.scenario.number + ' of 5. ' + state.scenario.goal);
  }

  function cycleSandbox(which) {
    if (state.busy) return;
    if (which === 'product') state.sandbox.productIndex = (state.sandbox.productIndex + 1) % SANDBOX_PRODUCTS.length;
    else if (which === 'carriers') state.sandbox.carrierIndex = (state.sandbox.carrierIndex + 1) % CARRIERS.length;
    else if (which === 'qr') {
      state.sandbox.qrMarketing = !state.sandbox.qrMarketing;
      if (state.sandbox.qrMarketing) state.sandbox.carrierIndex = 2;
    } else if (which === 'dataset') {
      state.sandbox.datasetIndex = (state.sandbox.datasetIndex + 1) % SANDBOX_DATASETS.length;
      if (SANDBOX_DATASETS[state.sandbox.datasetIndex].key === 'conflict') state.sandbox.carrierIndex = 0;
    }
    applyFixture(true);
    showToast('Sandbox updated · ' + state.hint);
    track('pos_lab_sandbox_change', { control: which, fixture: state.sandboxDatasetLabel });
  }

  function startTour() {
    state.tutorialOpen = true;
    state.completeOpen = false;
    state.started = true;
    renderer.hoverId = '';
    announce('Briefing opened. One package with two codes still becomes one checkout decision.');
    track('pos_lab_open_briefing', { mode: state.mode });
  }

  function finishTour(skipped) {
    state.tutorialOpen = false;
    state.started = true;
    if (!skipped) showToast('Briefing complete · scan or drag the package');
    canvas.focus({ preventScroll: true });
    syncAccessible();
    announce('Game ready. Use Space to scan, R to repeat a pass, number keys to switch levels.');
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJson() {
    if (!state.reports.length) { showToast('Run at least one presentation first.'); return; }
    downloadBlob(new Blob([JSON.stringify({
      schema: 'codepool.gs1-2d-pos-test-lab.report.v1',
      exportedAt: new Date().toISOString(),
      completedScenarios: Object.keys(state.completed).filter(function (key) { return state.completed[key]; }),
      catalog: F.PRODUCTS,
      results: state.reports,
      limitations: [
        'Simulation supplies presentation identity explicitly.',
        'SDK image results are reported verbatim; no-result is never synthesized.',
        'Not a GS1 certification, physical POS qualification or print-quality test.'
      ]
    }, null, 2)], { type: 'application/json' }), 'gs1-pos-test-report.json');
    track('pos_lab_export_report', { format: 'json' });
    showToast('JSON report downloaded');
  }

  function csvCell(value) {
    var text = typeof value === 'object' ? JSON.stringify(value) : String(value == null ? '' : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function downloadScene() {
    try { renderer.draw(state, now()); } catch (error) {}
    var sceneName = state.completeOpen
      ? 'gs1-pos-checkout-complete.png'
      : 'gs1-pos-checkout-' + state.mode + '-level-' + (state.scenarioIndex + 1) + '.png';
    canvas.toBlob(function (blob) {
      if (blob) downloadBlob(blob, sceneName);
      showToast('Checkout scene downloaded');
      track('pos_lab_export_scene', { mode: state.mode });
    }, 'image/png');
  }

  function exportCsv() {
    if (!state.reports.length) { showToast('Run at least one presentation first.'); return; }
    var columns = ['scenario','mode','expectedStatus','actualStatus','expectedQuantity','actualQuantity','origin','presentationId','packageInstanceId','rule','verdict','expectedReadCount','actualReadCount','expectedRaw','observedRaw','gtins'];
    var lines = [columns.map(csvCell).join(',')];
    state.reports.forEach(function (report) {
      lines.push(columns.map(function (column) { return csvCell(report[column]); }).join(','));
    });
    downloadBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'gs1-pos-test-report.csv');
    track('pos_lab_export_report', { format: 'csv' });
    showToast('CSV report downloaded');
  }

  function setMotion(enabled) {
    state.reduceMotion = enabled;
    try { localStorage.setItem('gs1-pos-game-motion', enabled ? '1' : '0'); } catch (error) {}
    renderer.reduceMotion = enabled;
    showToast(enabled ? 'Reduced motion enabled' : 'Conveyor motion enabled');
    track('pos_lab_motion_toggle', { reduced: enabled });
  }

  function handleHit(id, point) {
    if (!id) return;
    if (id.indexOf('tab-') === 0) { switchMode(id.slice(4)); return; }
    if (id.indexOf('level-') === 0) { goLevel(Number(id.slice(6))); return; }
    if (id.indexOf('chip-') === 0) { cycleSandbox(id.slice(5)); return; }
    switch (id) {
      case 'scan': if (state.mode === 'sdk') startSdkDecode(); else startSimulation(); break;
      case 'repeat': repeatLastPass(); break;
      case 'reset': resetCurrentState(); refreshHint(); refreshNarrative(); showToast('Current checkout reset'); break;
      case 'next': goLevel(Math.min(5, state.scenarioIndex + 2)); break;
      case 'results': state.completeOpen = true; state.tutorialOpen = false; track('pos_lab_view_results'); break;
      case 'upload': upload.click(); break;
      case 'png': if (state.assets && state.assets.composite) R.downloadCanvas(state.assets.composite, 'gs1-dual-marked-test-label.png'); break;
      case 'scene': downloadScene(); break;
      case 'json': exportJson(); break;
      case 'csv': exportCsv(); break;
      case 'motion': setMotion(!state.reduceMotion); break;
      case 'help': startTour(); break;
      case 'start-tour': finishTour(false); track('pos_lab_start_scenario', { scenario_id: state.mode === 'guided' ? state.scenario.id : state.mode }); break;
      case 'skip-tour': finishTour(true); break;
      case 'close-complete': state.completeOpen = false; canvas.focus({ preventScroll: true }); break;
    }
  }

  function pointIn(rect, point) {
    return rect && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function onPointerDown(event) {
    var point = renderer.toLogical(event.clientX, event.clientY);
    var hit = renderer.hitTest(point.x, point.y);
    pointer.downHit = hit;
    pointer.startX = point.x;
    pointer.startY = point.y;
    if (state.tutorialOpen || state.completeOpen) return;
    if (hit) return;
    if (!state.busy && pointIn(state.packageRect, point)) {
      state.drag.active = true;
      state.drag.x = point.x;
      state.drag.y = point.y;
      state.drag.moved = false;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  }

  function onPointerMove(event) {
    var point = renderer.toLogical(event.clientX, event.clientY);
    var hit = renderer.hitTest(point.x, point.y);
    renderer.hoverId = hit && !hit.disabled ? hit.id : '';
    if (state.drag.active) {
      state.drag.x = point.x;
      state.drag.y = point.y;
      if (Math.abs(point.x - pointer.startX) + Math.abs(point.y - pointer.startY) > 6) state.drag.moved = true;
      canvas.style.cursor = 'grabbing';
    } else {
      canvas.style.cursor = hit && !hit.disabled ? 'pointer' : (pointIn(state.packageRect, point) ? 'grab' : 'default');
    }
  }

  function onPointerUp(event) {
    var point = renderer.toLogical(event.clientX, event.clientY);
    if (state.drag.active) {
      var dropped = pointIn(renderer.scanZoneRect, point);
      var wasMoved = state.drag.moved;
      state.drag.active = false;
      if (dropped || !wasMoved) {
        if (state.mode === 'sdk') startSdkDecode(); else startSimulation();
      }
      pointer.downHit = null;
      return;
    }
    if (pointer.downHit) {
      var before = pointer.downHit.id;
      var hit = renderer.hitTest(point.x, point.y);
      pointer.downHit = null;
      if (hit && hit.id === before && !hit.disabled) handleHit(hit.id, point);
      return;
    }
    var zoneHit = pointIn(renderer.scanZoneRect, point);
    if (zoneHit && !state.busy) {
      if (state.mode === 'sdk') startSdkDecode(); else startSimulation();
    }
  }

  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (state.tutorialOpen) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); finishTour(false); }
      else if (event.key === 'Escape') { event.preventDefault(); finishTour(true); }
      return;
    }
    if (state.completeOpen) {
      if (event.key === 'Escape') { event.preventDefault(); state.completeOpen = false; }
      else if (event.key === 'p' || event.key === 'P') downloadScene();
      else if (event.key === 'j' || event.key === 'J') exportJson();
      else if (event.key === 'c' || event.key === 'C') exportCsv();
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (state.mode === 'sdk') startSdkDecode(); else startSimulation();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      repeatLastPass();
    } else if (event.key === 'm' || event.key === 'M') {
      setMotion(!state.reduceMotion);
    } else if (event.key === 'p' || event.key === 'P') {
      downloadScene();
    } else if (event.key === 'j' || event.key === 'J') {
      exportJson();
    } else if (event.key === 'c' || event.key === 'C') {
      exportCsv();
    } else if (event.key === 'v' || event.key === 'V') {
      if (completedCount() === 5) { state.completeOpen = true; state.tutorialOpen = false; }
    } else if (event.key === 'g' || event.key === 'G') {
      switchMode('guided');
    } else if (event.key === 'b' || event.key === 'B') {
      switchMode('sandbox');
    } else if (event.key === 'd' || event.key === 'D') {
      switchMode('sdk');
    } else if (event.key === '?' || event.key === '/') {
      event.preventDefault();
      startTour();
    } else if (/^[1-5]$/.test(event.key)) {
      event.preventDefault();
      goLevel(Number(event.key));
    } else if ((event.key === 'n' || event.key === 'N') && state.mode === 'guided' && state.completed[state.scenario.number] && state.scenarioIndex < 4) {
      goLevel(state.scenarioIndex + 2);
    }
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', function () {
      state.drag.active = false;
      pointer.downHit = null;
    });
    canvas.addEventListener('pointerleave', function () { renderer.hoverId = ''; });
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    upload.addEventListener('change', function () {
      if (upload.files && upload.files[0]) startSdkDecode(upload.files[0]);
    });
    accessible.start.addEventListener('click', function () {
      if (state.tutorialOpen) finishTour(false); else startTour();
    });
    accessible.scan.addEventListener('click', function () {
      if (state.mode === 'sdk') startSdkDecode(); else startSimulation();
    });
    accessible.repeat.addEventListener('click', repeatLastPass);
    accessible.reset.addEventListener('click', function () { resetCurrentState(); refreshHint(); refreshNarrative(); showToast('Current checkout reset'); });
    accessible.next.addEventListener('click', function () {
      if (state.scenarioIndex < 4) goLevel(state.scenarioIndex + 2);
      else state.completeOpen = true;
    });
    accessible.results.addEventListener('click', function () { state.completeOpen = true; state.tutorialOpen = false; });
    accessible.guided.addEventListener('click', function () { switchMode('guided'); });
    accessible.sandbox.addEventListener('click', function () { switchMode('sandbox'); });
    accessible.sdk.addEventListener('click', function () { switchMode('sdk'); });
    accessible.motion.addEventListener('click', function () { setMotion(!state.reduceMotion); });
    accessible.help.addEventListener('click', startTour);
    accessible.level.addEventListener('change', function () { goLevel(Number(accessible.level.value)); });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', function () { renderer.resize(true); });
    window.addEventListener('pagehide', function () { if (SDK && SDK.dispose) SDK.dispose(); });
    if (window.matchMedia) {
      var media = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (media.addEventListener) media.addEventListener('change', function (event) {
        if (savedReduced === null) setMotion(event.matches);
      });
    }
  }

  function frame() {
    if (!document.hidden) {
      try {
        renderer.draw(state, now());
        if (fallback && !fallback.hidden) fallback.hidden = true;
      } catch (error) {
        if (fallback) {
          fallback.hidden = false;
          fallback.textContent = 'Checkout renderer error: ' + (error.message || error);
        }
      }
    }
    requestAnimationFrame(frame);
  }

  function init() {
    if (!Renderer) {
      if (fallback) fallback.hidden = false;
      return;
    }
    ['start','scan','repeat','next','results','reset','guided','sandbox','sdk','motion','help','level'].forEach(function (name) {
      accessible[name] = document.getElementById('a11y-' + name);
    });
    renderer = new Renderer(canvas);
    renderer.resize(true);
    state.scenario = scenarioFor(0);
    applyFixture(true);
    updateDerived();
    bindEvents();
    requestAnimationFrame(frame);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { renderer.resize(true); });
    track('pos_lab_open', { mode: state.mode, device_type: renderer.mobile ? 'mobile' : 'desktop', renderer: 'canvas' });
    announce('Interactive checkout lab. One package can carry two barcodes. Press Enter to begin the briefing.');
    setTimeout(function () { canvas.focus({ preventScroll: true }); }, 300);
  }

  // Keep the module surface small but make the engine inspectable from tests.
  window.POSLab = {
    state: state,
    reset: function () { resetCurrentState(); refreshHint(); refreshNarrative(); },
    getCompleted: completedCount
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
