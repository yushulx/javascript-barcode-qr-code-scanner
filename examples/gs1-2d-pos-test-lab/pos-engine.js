/*
 * Pure POS presentation logic for the GS1 2D Retail POS Test Lab.
 * No DOM, SDK or animation code lives here, so the same rules run in Node tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.POSEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function checkDigit(data) {
    var sum = 0;
    var weight = 3;
    for (var i = data.length - 1; i >= 0; i--) {
      sum += Number(data.charAt(i)) * weight;
      weight = weight === 3 ? 1 : 3;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function normalizeGTIN(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(raw)) {
      return { valid: false, error: 'GTIN must contain 8, 12, 13 or 14 digits.' };
    }
    var gtin = raw.padStart(14, '0');
    if (checkDigit(gtin.slice(0, -1)) !== gtin.slice(-1)) {
      return { valid: false, gtin: gtin, error: 'INVALID_CHECK_DIGIT' };
    }
    return { valid: true, gtin: gtin };
  }

  function displayExpiry(value) {
    if (!/^\d{6}$/.test(value || '')) return value || '';
    var yy = Number(value.slice(0, 2));
    var year = yy <= 49 ? 2000 + yy : 1900 + yy;
    var month = value.slice(2, 4);
    var day = value.slice(4, 6);
    if (day === '00') {
      day = String(new Date(Date.UTC(year, Number(month), 0)).getUTCDate()).padStart(2, '0');
    }
    return year + '-' + month + '-' + day;
  }

  function invalidIdentity(observation, error, status) {
    return {
      status: status || 'invalid',
      rawFormat: observation.format,
      sourceObservationId: observation.observationId,
      error: error
    };
  }

  function parseDigitalLink(observation) {
    var input = String(observation.rawText == null ? '' : observation.rawText);
    if (/[\u0000-\u001f\u007f]/.test(input)) {
      return invalidIdentity(observation, 'CONTROL_CHARACTER');
    }
    var raw = input.trim();
    var url;
    try {
      url = new URL(raw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    } catch (error) {
      return invalidIdentity(observation, 'MALFORMED_DIGITAL_LINK');
    }

    var segments;
    try {
      segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch (error) {
      return invalidIdentity(observation, 'MALFORMED_DIGITAL_LINK');
    }
    var index = segments.indexOf('01');
    if (index === -1) {
      return invalidIdentity(observation, 'NOT_A_GS1_PRODUCT_IDENTIFIER', 'not-a-product-identifier');
    }
    if (!segments[index + 1]) return invalidIdentity(observation, 'MISSING_GTIN');

    var normalized = normalizeGTIN(segments[index + 1]);
    if (!normalized.valid) return invalidIdentity(observation, normalized.error);

    var lot = '';
    var serial = '';
    var lotIndex = segments.indexOf('10');
    var serialIndex = segments.indexOf('21');
    if (lotIndex !== -1) lot = segments[lotIndex + 1] || '';
    if (serialIndex !== -1) serial = segments[serialIndex + 1] || '';
    var expiry = url.searchParams.get('17') || '';

    return {
      status: 'valid',
      gtin: normalized.gtin,
      lot: lot,
      serial: serial,
      expiry: displayExpiry(expiry),
      rawFormat: observation.format,
      sourceObservationId: observation.observationId
    };
  }

  function parseLinear(observation) {
    var input = String(observation.rawText == null ? '' : observation.rawText);
    if (/[\u0000-\u001f\u007f]/.test(input)) return invalidIdentity(observation, 'CONTROL_CHARACTER');
    var raw = input.trim();
    var normalized = normalizeGTIN(raw);
    if (!normalized.valid) return invalidIdentity(observation, normalized.error);
    return {
      status: 'valid',
      gtin: normalized.gtin,
      lot: '',
      expiry: '',
      rawFormat: observation.format,
      sourceObservationId: observation.observationId
    };
  }

  function parseAndNormalizeObservation(observation) {
    if (!observation || !observation.observationId) {
      return invalidIdentity(observation || { format: 'unknown', observationId: 'missing' }, 'INVALID_OBSERVATION');
    }
    var raw = String(observation.rawText == null ? '' : observation.rawText).trim();
    var format = String(observation.format || '').toUpperCase();
    if (/^https?:\/\//i.test(raw)) return parseDigitalLink(observation);
    if (/EAN|UPC/.test(format)) return parseLinear(observation);
    if (/QR|DATA_MATRIX/.test(format)) {
      return invalidIdentity(observation, 'NOT_A_GS1_PRODUCT_IDENTIFIER', 'not-a-product-identifier');
    }
    if (/^\d+$/.test(raw)) return parseLinear(observation);
    return invalidIdentity(observation, 'UNSUPPORTED_CARRIER');
  }

  function createObservation(input) {
    input = input || {};
    return {
      observationId: input.observationId,
      presentationId: input.presentationId,
      origin: input.origin || 'simulation',
      format: input.format || 'UNKNOWN',
      rawText: String(input.rawText == null ? '' : input.rawText),
      decodedAtMs: Number(input.decodedAtMs || 0)
    };
  }

  function completePresentation(presentation, observations, catalog) {
    var source = presentation || {};
    var items = Array.isArray(observations) ? observations : [];
    var identities = items.map(parseAndNormalizeObservation);
    var ids = items.map(function (item) { return item.observationId; });
    var base = {
      presentationId: source.presentationId || '',
      packageInstanceId: source.packageInstanceId || '',
      origin: source.origin || (items[0] && items[0].origin) || 'simulation',
      observationIds: ids,
      identities: identities,
      quantityAdded: 0
    };

    if (!items.length) {
      return Object.assign(base, { status: 'not_added', reason: 'NO_RESULT' });
    }

    var recognized = identities.filter(function (identity) {
      return identity.status === 'valid' && identity.gtin;
    });
    var uniqueGtins = Array.from(new Set(recognized.map(function (identity) { return identity.gtin; })));

    if (uniqueGtins.length > 1) {
      return Object.assign(base, {
        status: 'needs_review', reason: 'GTIN_CONFLICT', gtins: uniqueGtins
      });
    }
    if (!uniqueGtins.length) {
      var checkDigitFailure = identities.some(function (identity) {
        return identity.error === 'INVALID_CHECK_DIGIT';
      });
      return Object.assign(base, {
        status: 'not_added', reason: checkDigitFailure ? 'INVALID_GTIN' : 'NO_VALID_GTIN'
      });
    }

    var gtin = uniqueGtins[0];
    if (!catalog || !catalog[gtin]) {
      return Object.assign(base, { status: 'needs_review', reason: 'UNKNOWN_PRODUCT', gtin: gtin });
    }
    if (source.wasCommitted) {
      return Object.assign(base, { status: 'ignored', reason: 'SAME_PRESENTATION', gtin: gtin });
    }

    if (!source.cart) throw new Error('A cart object is required.');
    if (!source.cart[gtin]) source.cart[gtin] = { quantity: 0 };
    source.cart[gtin].quantity += 1;
    source.wasCommitted = true;

    return Object.assign(base, {
      status: 'added', reason: recognized.length > 1 ? 'MATCHED_CARRIERS_ONE_PRESENTATION' : 'VALID_GTIN',
      gtin: gtin, quantityAdded: 1
    });
  }

  function decisionLabel(decision) {
    var labels = {
      added: 'Added',
      ignored: 'Ignored (same pass)',
      needs_review: 'Needs review',
      not_added: 'Not added'
    };
    return labels[decision.status] || decision.status;
  }

  return {
    checkDigit: checkDigit,
    normalizeGTIN: normalizeGTIN,
    displayExpiry: displayExpiry,
    parseDigitalLink: parseDigitalLink,
    parseAndNormalizeObservation: parseAndNormalizeObservation,
    createObservation: createObservation,
    completePresentation: completePresentation,
    decisionLabel: decisionLabel
  };
}));
