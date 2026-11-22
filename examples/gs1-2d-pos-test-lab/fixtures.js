/* Synthetic products, guided scenarios and fixture builders. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.POSFixtures = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE_GTIN = '09506000134352';
  var ALT_GTIN = '09506000134369';

  var PRODUCTS = {
    '09506000134352': {
      gtin: BASE_GTIN, name: 'Fresh Juice 250 mL', shortName: 'Fresh Juice', brand: 'NORTHFIELD',
      price: 2.50, color: '#f5b942', detail: 'Orange juice · synthetic demo product'
    },
    '09506000134369': {
      gtin: ALT_GTIN, name: 'Whole Milk 500 mL', shortName: 'Whole Milk', brand: 'GREENFIELD',
      price: 3.20, color: '#73a9c2', detail: 'Whole milk · synthetic demo product'
    },
    '09506000134376': {
      gtin: '09506000134376', name: 'Sparkling Water 330 mL', shortName: 'Sparkling Water', brand: 'NORTHFIELD',
      price: 1.80, color: '#78b9a5', detail: 'Sparkling water · synthetic demo product'
    }
  };

  function ean13(gtin) {
    if (!/^0\d{13}$/.test(gtin || '')) return '';
    return gtin.slice(1);
  }

  function digitalLink(gtin, lot, expiry, host) {
    var base = (host || 'https://example.com').replace(/\/$/, '');
    var uri = base + '/01/' + encodeURIComponent(gtin);
    if (lot) uri += '/10/' + encodeURIComponent(lot);
    if (expiry) uri += '?17=' + encodeURIComponent(expiry);
    return uri;
  }

  var SCENARIOS = [
    {
      id: 'traditional', number: 1, title: 'Traditional checkout', shortTitle: 'EAN-13 only',
      goal: 'Scan the legacy EAN-13 and add exactly one juice.',
      lesson: 'The existing retail workflow still resolves a GTIN and adds one unit.',
      carriers: '1d', gtin: BASE_GTIN, gtin2d: BASE_GTIN, lot: 'B17', expiry: '271231',
      expectedStatus: 'added', requiredPasses: 1, expectedQuantity: 1
    },
    {
      id: 'two-dimensional', number: 2, title: '2D checkout', shortTitle: 'Digital Link QR',
      goal: 'Use only the GS1 Digital Link QR to identify the same product.',
      lesson: 'A QR code is POS-ready here because its URI contains AI (01), not merely because it is a URL.',
      carriers: '2d', gtin: BASE_GTIN, gtin2d: BASE_GTIN, lot: 'B17', expiry: '271231',
      expectedStatus: 'added', requiredPasses: 1, expectedQuantity: 1
    },
    {
      id: 'dual-marked', number: 3, title: 'Dual-marked package', shortTitle: '1D + 2D, one item',
      goal: 'Read both carriers on one physical package. Charge it once.',
      lesson: 'Matching GTINs inside one package presentation produce one logical checkout acknowledgement.',
      carriers: 'both', gtin: BASE_GTIN, gtin2d: BASE_GTIN, lot: 'B17', expiry: '271231',
      expectedStatus: 'added', requiredPasses: 1, expectedQuantity: 1
    },
    {
      id: 'two-products', number: 4, title: 'Two identical products', shortTitle: 'Two packages, two units',
      goal: 'Press Scan Item twice: once for each separate physical package.',
      lesson: 'A new presentation ID permits another unit. Never deduplicate permanently by GTIN.',
      carriers: 'both', gtin: BASE_GTIN, gtin2d: BASE_GTIN, lot: 'B17', expiry: '271231',
      expectedStatus: 'added', requiredPasses: 2, expectedQuantity: 2
    },
    {
      id: 'mismatch', number: 5, title: 'GTIN mismatch', shortTitle: 'Conflict needs review',
      goal: 'Present a package whose EAN-13 and QR identify different GTINs.',
      lesson: 'The POS must not silently choose a carrier. Conflicting identities stop the automatic add.',
      carriers: 'both', gtin: BASE_GTIN, gtin2d: ALT_GTIN, lot: 'B17', expiry: '271231',
      expectedStatus: 'needs_review', requiredPasses: 1, expectedQuantity: 0
    }
  ];

  var DEFAULT_SANDBOX = {
    productGtin: BASE_GTIN,
    carriers: 'both',
    gtin: BASE_GTIN,
    gtin2d: BASE_GTIN,
    lot: 'B17',
    expiry: '271231',
    qrType: 'digital-link'
  };

  function scenarioById(id) {
    return SCENARIOS.find(function (scenario) { return scenario.id === id; }) || SCENARIOS[0];
  }

  return {
    BASE_GTIN: BASE_GTIN,
    ALT_GTIN: ALT_GTIN,
    PRODUCTS: PRODUCTS,
    SCENARIOS: SCENARIOS,
    DEFAULT_SANDBOX: DEFAULT_SANDBOX,
    ean13: ean13,
    digitalLink: digitalLink,
    scenarioById: scenarioById
  };
}));
