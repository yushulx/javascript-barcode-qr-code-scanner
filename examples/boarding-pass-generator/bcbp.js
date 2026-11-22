/*
 * IATA Bar Coded Boarding Pass (BCBP) codec.
 *
 * Implements the linear data layout defined by IATA Resolution 792 — the format
 * carried by the PDF417, Aztec, QR Code and Data Matrix symbols on a boarding
 * pass.
 *
 * BCBP is not a tagged/TLV format. It is a fixed-order sequence of numbered
 * items with nested hexadecimal size fields:
 *
 *   Unique Mandatory Section    23 chars   format code, leg count, name, ETI
 *   Repeated Mandatory Section  35 chars   per leg: PNR, route, flight, seat ...
 *   item 6                     2 hex chars byte count of the leg's variable field
 *   variable field per leg      item 8  '>' + item 9 version
 *                               item 10 (hex) + unique conditional data
 *                               item 17 (hex) + repeated conditional data
 *                               item 4  airline individual use (remainder)
 *   security section (optional) item 25 '^' + item 28 type + item 29 (hex) + data
 *
 * So the fixed block for a single-leg pass is 58 data characters + 2 hex size
 * characters = 60, followed by the leg's variable field.
 *
 * Both directions live in this file on purpose: the generator encodes a record
 * and then parses its own output with decode(), which is the same code path the
 * scanner uses. That makes the "expected scanner output" table a real check of
 * what was written rather than a restatement of the form.
 *
 * No dependencies, no build step. Exposes window.Bcbp.
 */
(function (global) {
  'use strict';

  /* =========================================================================
     Sizes
     ========================================================================= */

  var SIZE = {
    formatCode: 1,
    numberOfLegs: 1,
    passengerName: 20,
    electronicTicketIndicator: 1,
    variableSize: 2,
    /* The part that repeats once per leg, after the 23-character unique header. */
    perLeg: 35,
    uniqueMandatory: 23,
    securityMarker: 1,
    securityType: 1,
    securitySize: 2
  };

  var MAX_LEGS = 4;
  var FORMAT_CODE = 'M';
  var CURRENT_VERSION = 6;

  /* Per-leg mandatory fields, in the order they appear after the unique header.
     `len` is fixed; `start` is the 1-based offset within the full mandatory
     section, used for the byte-offset column in the field table. */
  var LEG_FIELDS = [
    { code: 'pnr', label: 'Operating carrier PNR', item: 7, len: 7, start: 24 },
    { code: 'from', label: 'From airport', item: 26, len: 3, start: 31 },
    { code: 'to', label: 'To airport', item: 38, len: 3, start: 34 },
    { code: 'carrier', label: 'Operating carrier', item: 42, len: 3, start: 37 },
    { code: 'flightNumber', label: 'Flight number', item: 43, len: 5, start: 40 },
    { code: 'julianDate', label: 'Date of flight (Julian)', item: 46, len: 3, start: 45 },
    { code: 'compartment', label: 'Compartment code', item: 71, len: 1, start: 48 },
    { code: 'seat', label: 'Seat number', item: 104, len: 4, start: 49 },
    { code: 'sequence', label: 'Check-in sequence number', item: 107, len: 5, start: 53 },
    { code: 'passengerStatus', label: 'Passenger status', item: 113, len: 1, start: 58 }
  ];

  /* Conditional data that appears once per boarding pass, in this order inside
     the item 10 block named by the first leg. Bag tags are slots of 13 chars. */
  var UNIQUE_SLOTS = [
    { code: 'passengerDescription', label: 'Passenger description', item: 15, len: 1 },
    { code: 'checkinSource', label: 'Source of check-in', item: 12, len: 1 },
    { code: 'issuanceSource', label: 'Source of issuance', item: 14, len: 1 },
    { code: 'issueDate', label: 'Date of issue (Julian)', item: 22, len: 4 },
    { code: 'documentType', label: 'Document type', item: 16, len: 1 },
    { code: 'issuerAirline', label: 'Airline designator of issuer', item: 21, len: 3 },
    { code: 'bagTag1', label: 'Baggage tag 1', item: 23, len: 13 },
    { code: 'bagTag2', label: 'Baggage tag 2', item: 23, len: 13 },
    { code: 'bagTag3', label: 'Baggage tag 3', item: 23, len: 13 },
    { code: 'nonConsecutiveTag1', label: 'Non-consecutive bag tag 1', item: 31, len: 13 },
    { code: 'nonConsecutiveTag2', label: 'Non-consecutive bag tag 2', item: 32, len: 13 }
  ];

  /* Conditional data that repeats once per leg, in this order inside the item 17
     block. Ten slots of 42 characters when every one is present. */
  var REPEATED_SLOTS = [
    { code: 'airlineNumericCode', label: 'Airline numeric code', item: 142, len: 3, numeric: true },
    { code: 'docFormSerial', label: 'Document form / serial number', item: 143, len: 10 },
    { code: 'selectee', label: 'Selectee indicator', item: 18, len: 1 },
    { code: 'intlDocVerification', label: 'International documentation verification', item: 108, len: 1 },
    { code: 'marketingCarrier', label: 'Marketing carrier designator', item: 19, len: 3 },
    { code: 'ffAirline', label: 'Frequent flyer airline', item: 20, len: 3 },
    { code: 'ffNumber', label: 'Frequent flyer number', item: 236, len: 16 },
    { code: 'idAdIndicator', label: 'ID / AD indicator', item: 89, len: 1 },
    { code: 'freeBaggage', label: 'Free baggage allowance', item: 118, len: 3 },
    { code: 'fastTrack', label: 'Fast track', item: 254, len: 1 }
  ];

  /* =========================================================================
     Code lists
     ========================================================================= */

  var ENUMS = {
    passengerDescription: {
      '0': 'Adult', '1': 'Male', '2': 'Female', '3': 'Child', '4': 'Infant',
      '5': 'No passenger (cabin baggage)', '6': 'Adult travelling with infant',
      '7': 'Unaccompanied minor', 'X': 'Unspecified (v8)', 'U': 'Undisclosed (v8)'
    },
    checkinSource: {
      W: 'Web', K: 'Airport kiosk', R: 'Remote / off-site kiosk',
      M: 'Mobile device', O: 'Airport agent', T: 'Town agent', V: 'Third-party vendor'
    },
    issuanceSource: {
      W: 'Web printed', K: 'Airport kiosk printed', X: 'Transfer kiosk printed',
      R: 'Remote / off-site kiosk printed', M: 'Mobile device printed',
      O: 'Airport agent printed', T: 'Town agent printed', V: 'Third-party vendor printed'
    },
    documentType: { B: 'Boarding pass', I: 'Itinerary receipt' },
    compartment: {
      F: 'First', A: 'First (discounted)', P: 'First (discounted)',
      J: 'Business (premium)', C: 'Business', D: 'Business (discounted)',
      I: 'Business (discounted)', Z: 'Business (discounted)',
      W: 'Economy (premium)', S: 'Economy (premium)',
      Y: 'Economy', B: 'Economy', M: 'Economy', H: 'Economy', Q: 'Economy',
      K: 'Economy', L: 'Economy', V: 'Economy', N: 'Economy', G: 'Economy',
      U: 'Economy', E: 'Economy', T: 'Economy', X: 'Economy'
    },
    passengerStatus: {
      '0': 'Not checked in', '1': 'Checked in', '2': 'Boarded',
      '3': 'Bag checked and checked in', '4': 'Bag checked and boarded',
      '5': 'Standby (no seat)', '6': 'Standby (seat assigned)',
      '7': 'Standby, bag checked', '8': 'Standby, bag checked and seat assigned',
      '9': 'Gate hold / other', A: 'Other'
    },
    selectee: { '0': 'Not selected', '1': 'Selected', '3': 'Selected for additional screening' },
    intlDocVerification: {
      ' ': 'Not applicable (domestic)', '0': 'Not required',
      '1': 'Required', '2': 'Verification performed'
    },
    fastTrack: { Y: 'Yes', N: 'No' },
    documentTypeNote: {}
  };

  /* Airports used to pad the generator's random samples and to label a decoded
     route. Not an exhaustive IATA table — enough to make the sample data read
     like a real itinerary. */
  var AIRPORTS = [
    { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson', country: 'US' },
    { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'NL' },
    { code: 'AUS', city: 'Austin', name: 'Austin-Bergstrom', country: 'US' },
    { code: 'BCN', city: 'Barcelona', name: 'El Prat', country: 'ES' },
    { code: 'BOS', city: 'Boston', name: 'Logan International', country: 'US' },
    { code: 'BWI', city: 'Baltimore', name: 'Baltimore-Washington', country: 'US' },
    { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'FR' },
    { code: 'CLT', city: 'Charlotte', name: 'Douglas International', country: 'US' },
    { code: 'DEN', city: 'Denver', name: 'Denver International', country: 'US' },
    { code: 'DFW', city: 'Dallas', name: 'Fort Worth International', country: 'US' },
    { code: 'DTW', city: 'Detroit', name: 'Metro Wayne County', country: 'US' },
    { code: 'EWR', city: 'Newark', name: 'Liberty International', country: 'US' },
    { code: 'FCO', city: 'Rome', name: 'Fiumicino', country: 'IT' },
    { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt am Main', country: 'DE' },
    { code: 'HKG', city: 'Hong Kong', name: 'Chek Lap Kok', country: 'HK' },
    { code: 'IAD', city: 'Washington', name: 'Dulles International', country: 'US' },
    { code: 'IAH', city: 'Houston', name: 'George Bush Intercontinental', country: 'US' },
    { code: 'JFK', city: 'New York', name: 'John F. Kennedy', country: 'US' },
    { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid International', country: 'US' },
    { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'US' },
    { code: 'LHR', city: 'London', name: 'Heathrow', country: 'GB' },
    { code: 'MAD', city: 'Madrid', name: 'Barajas', country: 'ES' },
    { code: 'MCO', city: 'Orlando', name: 'Orlando International', country: 'US' },
    { code: 'MIA', city: 'Miami', name: 'Miami International', country: 'US' },
    { code: 'MSP', city: 'Minneapolis', name: 'Saint Paul International', country: 'US' },
    { code: 'MUC', city: 'Munich', name: 'Franz Josef Strauss', country: 'DE' },
    { code: 'NRT', city: 'Tokyo', name: 'Narita International', country: 'JP' },
    { code: 'ORD', city: 'Chicago', name: "O'Hare International", country: 'US' },
    { code: 'PDX', city: 'Portland', name: 'Portland International', country: 'US' },
    { code: 'PHX', city: 'Phoenix', name: 'Sky Harbor International', country: 'US' },
    { code: 'SAN', city: 'San Diego', name: 'San Diego International', country: 'US' },
    { code: 'SEA', city: 'Seattle', name: 'Tacoma International', country: 'US' },
    { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', country: 'US' },
    { code: 'SIN', city: 'Singapore', name: 'Changi', country: 'SG' },
    { code: 'SLC', city: 'Salt Lake City', name: 'Salt Lake City International', country: 'US' },
    { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'AU' },
    { code: 'YYZ', city: 'Toronto', name: 'Pearson International', country: 'CA' },
    { code: 'YVR', city: 'Vancouver', name: 'Vancouver International', country: 'CA' }
  ];

  var AIRLINES = [
    { iata: 'AA', numeric: '001', name: 'American Airlines' },
    { iata: 'AC', numeric: '014', name: 'Air Canada' },
    { iata: 'AF', numeric: '057', name: 'Air France' },
    { iata: 'AS', numeric: '027', name: 'Alaska Airlines' },
    { iata: 'AY', numeric: '105', name: 'Finnair' },
    { iata: 'AZ', numeric: '055', name: 'ITA Airways' },
    { iata: 'BA', numeric: '125', name: 'British Airways' },
    { iata: 'B6', numeric: '279', name: 'JetBlue Airways' },
    { iata: 'CX', numeric: '160', name: 'Cathay Pacific' },
    { iata: 'DL', numeric: '006', name: 'Delta Air Lines' },
    { iata: 'EK', numeric: '176', name: 'Emirates' },
    { iata: 'IB', numeric: '075', name: 'Iberia' },
    { iata: 'JL', numeric: '131', name: 'Japan Airlines' },
    { iata: 'KL', numeric: '074', name: 'KLM' },
    { iata: 'LH', numeric: '220', name: 'Lufthansa' },
    { iata: 'NH', numeric: '205', name: 'All Nippon Airways' },
    { iata: 'QF', numeric: '081', name: 'Qantas' },
    { iata: 'SQ', numeric: '618', name: 'Singapore Airlines' },
    { iata: 'UA', numeric: '016', name: 'United Airlines' },
    { iata: 'WN', numeric: '526', name: 'Southwest Airlines' }
  ];

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  /* =========================================================================
     Small helpers
     ========================================================================= */

  function str(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function upper(value) {
    return str(value).toUpperCase();
  }

  function padRight(value, len, ch) {
    var s = str(value).slice(0, len);
    while (s.length < len) s += ch;
    return s;
  }

  function padLeft(value, len, ch) {
    var s = str(value).slice(0, len);
    while (s.length < len) s = ch + s;
    return s;
  }

  function digitsOnly(value) {
    return str(value).replace(/[^0-9]/g, '');
  }

  function hex2(n) {
    if (n > 255) {
      throw new Error('A conditional data block of ' + n
        + ' bytes does not fit: the size field is two hexadecimal digits (maximum 255).');
    }
    return n.toString(16).toUpperCase().padStart(2, '0');
  }

  function parseHex(text) {
    var n = parseInt(text, 16);
    return isNaN(n) ? 0 : n;
  }

  function dayOfYear(date) {
    var start = Date.UTC(date.getUTCFullYear(), 0, 1);
    var here = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor((here - start) / 86400000) + 1;
  }

  /* Julian day-of-year to a real date. BCBP carries no year, so the caller has
     to supply one — the issue date's year digit, or the current year. */
  function dateFromJulian(day, year) {
    var d = parseInt(daysOnly3(day), 10);
    if (isNaN(d) || d < 1 || d > 366) return null;
    var date = new Date(Date.UTC(year, 0, 1));
    date.setUTCDate(d);
    if (date.getUTCFullYear() !== year) return null; // day 366 in a common year
    return date;
  }

  function daysOnly3(value) {
    var d = digitsOnly(value);
    return d ? padLeft(d, 3, '0') : '';
  }

  /* The date of issue stores the last digit of the year only. Given a reference
     year, pick the most recent year ending in that digit that is not in the
     future — the same inference a scanner has to make, made explicit. */
  function resolveYear(lastDigit, referenceYear) {
    if (isNaN(lastDigit)) return referenceYear;
    var candidate = Math.floor(referenceYear / 10) * 10 + lastDigit;
    if (candidate > referenceYear) candidate -= 10;
    return candidate;
  }

  function isoDate(date) {
    if (!date) return '';
    return date.toISOString().slice(0, 10);
  }

  function longDate(date) {
    if (!date) return '';
    return date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
  }

  function airport(code) {
    var c = upper(code);
    for (var i = 0; i < AIRPORTS.length; i++) {
      if (AIRPORTS[i].code === c) return AIRPORTS[i];
    }
    return null;
  }

  function airline(code) {
    var c = upper(str(code).trim());
    for (var i = 0; i < AIRLINES.length; i++) {
      if (AIRLINES[i].iata === c) return AIRLINES[i];
    }
    return null;
  }

  function airlineByNumeric(numeric) {
    var n = str(numeric).replace(/[^0-9]/g, '');
    for (var i = 0; i < AIRLINES.length; i++) {
      if (AIRLINES[i].numeric === n) return AIRLINES[i];
    }
    return null;
  }

  function label(map, code) {
    var key = str(code).toUpperCase();
    if (map[key]) return map[key];
    if (map[str(code)]) return map[str(code)];
    return '';
  }

  /* Ticket / seat / sequence encoders. Each one reproduces the padding the
     official examples use, because a scanner has to cope with that exact
     spelling — "0025 " not " 0025". */

  function encodeFlightNumber(value) {
    var v = upper(value).replace(/\s+/g, '');
    var m = /^(\d{1,4})([A-Z]?)$/.exec(v);
    if (!m) {
      throw new Error('Flight number "' + value
        + '" is not valid: it must be 1 to 4 digits with an optional trailing letter.');
    }
    return padRight(m[1].padStart(4, '0') + m[2], 5, ' ');
  }

  function decodeFlightNumber(raw) {
    var m = /^0*(\d+)([A-Z]?)\s*$/.exec(str(raw));
    if (!m) return str(raw).trim();
    return m[1] + m[2];
  }

  function encodeSeat(value) {
    var v = upper(value).replace(/\s+/g, '');
    if (!v) return '    ';
    if (v === 'INF') return 'INF ';
    var m = /^(\d{1,3})([A-Z]{1,2})$/.exec(v);
    if (!m) {
      throw new Error('Seat "' + value
        + '" is not valid: use a row and a letter (18A), or INF for an infant on a separate pass.');
    }
    return m[1].padStart(3, '0') + m[2];
  }

  function decodeSeat(raw) {
    var v = str(raw);
    if (!v.trim()) return '';
    if (v.trim().toUpperCase() === 'INF') return 'INF';
    var m = /^0*(\d+)([A-Z]+)\s*$/.exec(v);
    if (!m) return v.trim();
    return m[1] + m[2];
  }

  function encodeSequence(value) {
    var d = digitsOnly(value);
    if (!d) return '     ';
    if (d.length >= 5) return d.slice(0, 5);
    /* The IATA examples print four digits followed by a blank, so pad to four
       and leave the fifth position as the guide's trailing space. */
    return padRight(d.padStart(4, '0'), 5, ' ');
  }

  function decodeSequence(raw) {
    var v = str(raw).trim();
    if (!v) return '';
    var n = parseInt(v, 10);
    return isNaN(n) ? v : String(n);
  }

  /* A baggage tag is a 10-digit licence plate plus a 3-digit count of
     consecutive bags. The plate starts with a leading zero, then the carrier's
     three-digit numeric code, then the six-digit initial tag number. */
  function buildBagTag(carrierNumeric, initial, bagCount) {
    return '0' + padLeft(digitsOnly(carrierNumeric), 3, '0')
      + padLeft(digitsOnly(initial), 6, '0')
      + padLeft(digitsOnly(bagCount), 3, '0');
  }

  function describeBagTag(raw) {
    var v = str(raw).trim();
    if (!v || v.length < 13 || !/^\d{13}$/.test(v)) return null;
    var carrier = airlineByNumeric(v.slice(1, 4));
    return {
      plate: v.slice(0, 10),
      count: parseInt(v.slice(10, 13), 10),
      airline: carrier ? carrier.name : '',
      designator: carrier ? carrier.iata : ''
    };
  }

  /* =========================================================================
     Encoding
     ========================================================================= */

  function normaliseLeg(input, defaults) {
    var leg = input || {};
    var fallback = defaults || {};
    return {
      /* The PNR sits in the repeating block and each leg may carry its own —
         a two-leg pass can hold different locators per leg. */
      pnr: upper(leg.pnr === undefined ? fallback.pnr : leg.pnr).replace(/\s+/g, '').trim(),
      from: upper(leg.from).trim(),
      to: upper(leg.to).trim(),
      carrier: upper(leg.carrier).trim(),
      flightNumber: upper(leg.flightNumber).trim(),
      julianDate: digitsOnly(leg.julianDate),
      compartment: upper(leg.compartment).trim() || 'Y',
      seat: upper(leg.seat).trim(),
      sequence: digitsOnly(leg.sequence),
      /* Passenger status sits inside the repeating block, so it is stored per
         leg even though a real itinerary normally carries the same value. */
      passengerStatus: upper(leg.passengerStatus === undefined
        ? fallback.passengerStatus : leg.passengerStatus).trim(),
      /* Item 4 is "airline individual use": free-form, private to the carrier,
         and stored per leg. A record-level value applies to every leg. */
      airlineUse: upper(leg.airlineUse === undefined ? fallback.airlineUse : leg.airlineUse).trim(),
      airlineNumericCode: digitsOnly(leg.airlineNumericCode),
      docFormSerial: upper(leg.docFormSerial).trim(),
      selectee: upper(leg.selectee).trim(),
      intlDocVerification: upper(leg.intlDocVerification).trim(),
      marketingCarrier: upper(leg.marketingCarrier).trim(),
      ffAirline: upper(leg.ffAirline).trim(),
      ffNumber: upper(leg.ffNumber).trim(),
      idAdIndicator: upper(leg.idAdIndicator).trim(),
      freeBaggage: upper(leg.freeBaggage).trim(),
      fastTrack: upper(leg.fastTrack).trim()
    };
  }

  function normaliseRecord(input) {
    var r = input || {};
    var version = r.version === null || r.version === undefined || r.version === ''
      ? CURRENT_VERSION
      : String(r.version);
    return {
      passengerName: upper(r.passengerName).replace(/\s+/g, ' ').trim(),
      electronicTicket: r.electronicTicket !== false,
      pnr: upper(r.pnr).replace(/\s+/g, '').trim(),
      passengerStatus: r.passengerStatus === null || r.passengerStatus === undefined
        ? '' : upper(r.passengerStatus).trim(),
      passengerDescription: upper(r.passengerDescription).trim(),
      checkinSource: upper(r.checkinSource).trim(),
      issuanceSource: upper(r.issuanceSource).trim(),
      issueDate: digitsOnly(r.issueDate),
      documentType: upper(r.documentType).trim(),
      issuerAirline: upper(r.issuerAirline).trim(),
      bagTags: (r.bagTags || []).map(function (t) { return digitsOnly(t); }).filter(Boolean).slice(0, 3),
      nonConsecutiveTags: (r.nonConsecutiveTags || []).map(function (t) { return digitsOnly(t); }).filter(Boolean).slice(0, 2),
      airlineUse: upper(r.airlineUse).trim(),
      security: r.security && r.security.data
        ? { type: upper(r.security.type || '1').slice(0, 1), data: String(r.security.data) }
        : null,
      version: version,
      legs: (r.legs || []).map(function (leg) {
        return normaliseLeg(leg, {
          airlineUse: r.airlineUse,
          passengerStatus: r.passengerStatus,
          pnr: r.pnr
        });
      })
    };
  }

  /* Slots are packed in order and only trailing empties are dropped: BCBP has
     no way to express "field 4 present, field 2 absent". An interior gap is
     therefore filled with that field's own padding character, and validate()
     reports it so the generator can tell the user rather than hide it. */
  function packSlots(slots, values) {
    var last = -1;
    for (var i = 0; i < slots.length; i++) {
      if (str(values[slots[i].code]).trim() !== '') last = i;
    }
    if (last === -1) return '';
    var out = '';
    for (var j = 0; j <= last; j++) {
      var slot = slots[j];
      var value = str(values[slot.code]);
      out += slot.numeric ? padLeft(value, slot.len, '0') : padRight(value, slot.len, ' ');
    }
    return out;
  }

  function encodeUnique(r) {
    return packSlots(UNIQUE_SLOTS, {
      passengerDescription: r.passengerDescription,
      checkinSource: r.checkinSource,
      issuanceSource: r.issuanceSource,
      issueDate: r.issueDate,
      documentType: r.documentType,
      issuerAirline: r.issuerAirline,
      bagTag1: r.bagTags[0] || '',
      bagTag2: r.bagTags[1] || '',
      bagTag3: r.bagTags[2] || '',
      nonConsecutiveTag1: r.nonConsecutiveTags[0] || '',
      nonConsecutiveTag2: r.nonConsecutiveTags[1] || ''
    });
  }

  function encodeRepeated(leg) {
    return packSlots(REPEATED_SLOTS, leg);
  }

  function encodeMandatory(r, leg, index, variableSize) {
    var out = '';
    if (index === 0) {
      out += FORMAT_CODE;                                 // item 1
      out += String(r.legs.length);                       // item 5
      out += padRight(r.passengerName, SIZE.passengerName, ' '); // item 11
      out += r.electronicTicket ? 'E' : ' ';              // item 253
    }
    out += padRight(leg.pnr, 7, ' ');                     // item 7
    out += padRight(leg.from, 3, ' ');                    // item 26
    out += padRight(leg.to, 3, ' ');                      // item 38
    out += padRight(leg.carrier, 3, ' ');                 // item 42
    out += encodeFlightNumber(leg.flightNumber);          // item 43
    out += padLeft(leg.julianDate, 3, '0');               // item 46
    out += padRight(leg.compartment, 1, ' ');             // item 71
    out += encodeSeat(leg.seat);                          // item 104
    out += encodeSequence(leg.sequence);                  // item 107
    out += padRight(leg.passengerStatus, 1, ' ');         // item 113
    out += hex2(variableSize);                            // item 6
    return out;
  }

  /**
   * Encode a record into a BCBP string.
   *
   * @param {Object} record  passenger data plus a `legs` array
   * @returns {string} the BCBP payload, ready to hand to a barcode encoder
   */
  function encode(record) {
    var r = normaliseRecord(record);

    var problems = validate(r);
    if (problems.length) {
      throw new Error(problems[0]);
    }

    var blocks = r.legs.map(function (leg, index) {
      var repeated = encodeRepeated(leg);
      var airlineUse = leg.airlineUse;
      var body;
      if (index === 0) {
        /* A "version 0" pass predates the version marker. Item 6 is then 00 and
           nothing at all follows it — not even the item 17 size field. */
        if (r.version === '0') {
          body = '';
        } else {
          var unique = encodeUnique(r);
          body = '>' + r.version + hex2(unique.length) + unique
            + hex2(repeated.length) + repeated + airlineUse;
        }
      } else {
        body = hex2(repeated.length) + repeated + airlineUse;
      }
      /* item 6 counts everything that follows it, including the nested size
         fields: item 8 + item 9 (2), item 10's two hex digits (2) and item 17's
         two hex digits (2). Taking the length of the assembled block is the one
         definition that cannot drift out of step with the bytes. */
      return { size: body.length, body: body };
    });

    var out = r.legs.map(function (leg, index) {
      return encodeMandatory(r, leg, index, blocks[index].size) + blocks[index].body;
    }).join('');

    return out + encodeSecurity(r.security);
  }

  /* Reserved security data (items 25–30), written once after the last leg. */
  function encodeSecurity(security) {
    if (!security || !security.data) return '';
    return '^' + padRight(upper(security.type) || '1', 1, ' ') + hex2(security.data.length) + security.data;
  }

  /**
   * Check a normalised record for problems a scanner would reject or misread.
   * Returns an array of human-readable messages; empty means clean.
   */
  function validate(r) {
    var problems = [];

    if (!r.legs.length) problems.push('A boarding pass needs at least one flight leg.');
    if (r.legs.length > MAX_LEGS) problems.push('BCBP allows at most ' + MAX_LEGS + ' legs.');

    if (!r.passengerName) problems.push('Enter a passenger name.');
    if (r.passengerName.length > SIZE.passengerName) {
      problems.push('The passenger name is limited to ' + SIZE.passengerName + ' characters.');
    }
    if (r.passengerName.indexOf('/') === -1) {
      problems.push('Format the passenger name as SURNAME/GIVEN NAME.');
    }
    if (!r.pnr) problems.push('Enter a passenger name record (PNR) locator.');
    if (r.pnr.length > 7) problems.push('A PNR is at most 7 characters.');

    r.legs.forEach(function (leg, i) {
      var where = r.legs.length > 1 ? ' (leg ' + (i + 1) + ')' : '';
      if (!leg.pnr) problems.push('Enter a PNR locator' + where + '.');
      if (leg.pnr.length > 7) problems.push('A PNR is at most 7 characters' + where + '.');
      if (leg.passengerStatus && !/^[0-9A-Z]$/.test(leg.passengerStatus)) {
        problems.push('Passenger status' + where + ' must be a single digit or letter.');
      }
      if (!/^[A-Z]{3}$/.test(leg.from)) problems.push('Origin airport' + where + ' must be a 3-letter IATA code.');
      if (!/^[A-Z]{3}$/.test(leg.to)) problems.push('Destination airport' + where + ' must be a 3-letter IATA code.');
      if (leg.from && leg.from === leg.to) problems.push('Origin and destination' + where + ' are the same airport.');
      if (!/^[A-Z0-9]{2}$/.test(leg.carrier)) problems.push('Operating carrier' + where + ' must be a 2-character IATA designator.');
      if (!/^\d{1,4}[A-Z]?$/.test(leg.flightNumber)) {
        problems.push('Flight number' + where + ' must be 1 to 4 digits with an optional trailing letter.');
      }
      var day = parseInt(leg.julianDate, 10);
      if (!(day >= 1 && day <= 366)) problems.push('Julian date' + where + ' must be a day of year from 001 to 366.');
      if (!leg.compartment) problems.push('Compartment code' + where + ' is required.');
      if (leg.seat && leg.seat !== 'INF' && !/^\d{1,3}[A-Z]{1,2}$/.test(leg.seat)) {
        problems.push('Seat' + where + ' must be a row and a letter (18A), INF, or left blank.');
      }
      if (leg.freeBaggage && !/^\d{1,2}[A-Z]{0,2}$/.test(leg.freeBaggage)) {
        problems.push('Free baggage allowance' + where + ' looks like 2PC or 20K.');
      }
      if (leg.fastTrack && !/^[YN]$/.test(leg.fastTrack)) problems.push('Fast track' + where + ' is Y or N.');
      if (leg.airlineNumericCode && !/^\d{3}$/.test(leg.airlineNumericCode)) {
        problems.push('Airline numeric code' + where + ' is 3 digits.');
      }
      if (leg.ffNumber.length > 16) problems.push('A frequent flyer number is at most 16 characters.');
      if (leg.airlineUse.length > 60) problems.push('Airline individual use' + where + ' is limited to 60 characters.');
    });

    if (r.issueDate && !/^\d{4}$/.test(r.issueDate)) {
      problems.push('The date of issue is 4 digits: the last digit of the year plus the Julian day.');
    }
    if (r.bagTags.concat(r.nonConsecutiveTags).some(function (tag) { return !/^\d{13}$/.test(tag); })) {
      problems.push('A baggage tag is 13 digits: the 10-digit licence plate plus a 3-digit bag count.');
    }
    if (r.airlineUse.length > 60) problems.push('Airline individual use is limited to 60 characters.');
    if (!/^[0-9]$/.test(r.version)) problems.push('The BCBP version is a single digit, or 0 for a pass with no version field.');

    if (r.version === '0') {
      if (r.legs.length > 1) {
        problems.push('A pass with no version field can only carry one leg — the repeated block has no size field to read it back with.');
      }
      var carriesConditional = encodeUnique(r) !== ''
        || r.legs.some(function (leg) { return encodeRepeated(leg) !== '' || leg.airlineUse !== ''; });
      if (carriesConditional) {
        problems.push('A pass with no version field cannot carry conditional data. Pick a version, or clear the optional fields.');
      }
    }

    if (r.security) {
      if (r.security.data.length > 100) problems.push('Security data is limited to 100 characters.');
      if (!/^[0-9A-Z]$/.test(r.security.type)) problems.push('The security data type is a single letter or digit.');
    }

    /* Interior gaps: the packed block will contain a filler the user did not
       type. Report it instead of silently inventing data. */
    var filled = firstInteriorGap(UNIQUE_SLOTS, {
      passengerDescription: r.passengerDescription,
      checkinSource: r.checkinSource,
      issuanceSource: r.issuanceSource,
      issueDate: r.issueDate,
      documentType: r.documentType,
      issuerAirline: r.issuerAirline,
      bagTag1: r.bagTags[0] || '',
      bagTag2: r.bagTags[1] || '',
      bagTag3: r.bagTags[2] || '',
      nonConsecutiveTag1: r.nonConsecutiveTags[0] || '',
      nonConsecutiveTag2: r.nonConsecutiveTags[1] || ''
    });
    if (filled) {
      problems.push('The optional fields are written in a fixed order, so "' + filled
        + '" cannot be included while an earlier optional field is left out.');
    }

    return problems;
  }

  function firstInteriorGap(slots, values) {
    var last = -1;
    slots.forEach(function (slot, i) {
      if (str(values[slot.code]).trim() !== '') last = i;
    });
    for (var i = 0; i < last; i++) {
      if (str(values[slots[i].code]).trim() === '') return slots[i].label;
    }
    return null;
  }

  /* =========================================================================
     Decoding
     ========================================================================= */

  function makeField(slot, raw, offset, legIndex) {
    var value = str(raw);
    var trimmed = value.trim();
    var field = {
      code: slot.code,
      label: slot.label,
      item: slot.item,
      raw: value,
      length: slot.len,
      offset: offset,
      leg: legIndex === undefined ? null : legIndex,
      value: trimmed
    };
    if (slot.code === 'seat') field.value = decodeSeat(value);
    if (slot.code === 'sequence') field.value = decodeSequence(value);
    if (slot.code === 'flightNumber') field.value = decodeFlightNumber(value);
    var codes = ENUMS[slot.code];
    var meaning = codes ? label(codes, trimmed) : '';
    if (meaning) field.meaning = meaning;
    /* The date of issue is resolved in decode(), once the reference year is
       known: it carries only the last digit of the year, so the field alone
       cannot say whether "6" means 2006, 2016 or 2026. */
    if (slot.code.indexOf('bagTag') === 0 || slot.code.indexOf('nonConsecutiveTag') === 0) {
      var tag = describeBagTag(trimmed);
      if (tag) {
        field.value = tag.plate + ' \u00b7 ' + tag.count + ' bag' + (tag.count === 1 ? '' : 's');
        field.meaning = tag.airline ? tag.airline + ' (' + tag.designator + ')' : '';
      }
    }
    return field;
  }

  function parseSlotBlock(slots, block, baseOffset, legIndex) {
    var fields = [];
    var pos = 0;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (pos + slot.len > block.length) break;
      var raw = block.substr(pos, slot.len);
      fields.push(makeField(slot, raw, baseOffset + pos, legIndex));
      pos += slot.len;
    }
    return fields;
  }

  /**
   * Parse a BCBP payload.
   *
   * @param {string} text  the decoded barcode content
   * @param {Object} [options]
   * @param {number} [options.referenceYear]  year used to resolve the flight and
   *        issue dates, which BCBP stores without a year. Defaults to the
   *        current year.
   * @returns {Object} `{ ok: true, ... }` or `{ ok: false, error }`
   */
  function decode(text, options) {
    var opts = options || {};
    var referenceYear = opts.referenceYear || new Date().getUTCFullYear();

    var raw = str(text);
    /* Some readers append a line terminator or NUL padding. */
    raw = raw.replace(/[\r\n\0]+$/, '');
    if (!raw) return fail('The barcode was empty.');

    var checks = [];
    var warnings = [];

    if (raw.length < SIZE.uniqueMandatory + SIZE.perLeg) {
      return fail('Only ' + raw.length + ' characters: a BCBP payload is at least 58, plus a 2-character size field.');
    }

    var formatCode = raw.charAt(0);
    if (formatCode !== FORMAT_CODE) {
      if (formatCode === 'S') {
        warnings.push('The payload starts with "S", the legacy format that was withdrawn in 2007. It is parsed here as a modern pass.');
      } else {
        return fail('The payload starts with "' + formatCode + '" rather than "M", so it is not a BCBP boarding pass.');
      }
    }

    var legDigit = raw.charAt(1);
    var legCount = parseInt(legDigit, 10);
    if (!(legCount >= 1)) {
      warnings.push('The leg count field is "' + legDigit + '"; assuming a single leg.');
      legCount = 1;
    } else if (legCount > MAX_LEGS) {
      warnings.push('The payload declares ' + legCount + ' legs; the standard allows at most ' + MAX_LEGS + '.');
    }

    var nameRaw = raw.substr(2, SIZE.passengerName);
    var passengerName = nameRaw.trim();
    var nameParts = passengerName.split('/');
    var surname = (nameParts[0] || '').trim();
    var givenNames = (nameParts[1] || '').trim();

    var eti = raw.charAt(22);

    var result = {
      ok: true,
      formatCode: formatCode,
      raw: raw,
      length: raw.length,
      legCount: legCount,
      version: null,
      passengerName: passengerName,
      surname: surname,
      givenNames: givenNames,
      electronicTicket: eti === 'E',
      pnr: '',
      passengerStatus: '',
      passengerStatusLabel: '',
      unique: [],
      legs: [],
      security: null,
      fields: [],
      checks: checks,
      warnings: warnings,
      referenceYear: referenceYear
    };

    var pos = SIZE.uniqueMandatory; // first leg's data starts after the 23-char header

    for (var i = 0; i < legCount; i++) {
      if (pos + SIZE.perLeg + SIZE.variableSize > raw.length) {
        warnings.push('The payload ends before leg ' + (i + 1) + ' is complete.');
        break;
      }

      var legStart = pos;
      var leg = {
        index: i + 1,
        start: legStart + 1, // 1-based, for display
        fields: [],
        airlineUse: '',
        uniqueSize: 0,
        repeatedSize: 0,
        blockSize: 0
      };

      function take(slot) {
        var value = raw.substr(pos, slot.len);
        leg.fields.push(makeField(slot, value, pos, i + 1));
        pos += slot.len;
        return value;
      }

      var isFirst = i === 0;
      if (isFirst) {
        leg.pnr = take(LEG_FIELDS[0]).trim();
        result.pnr = leg.pnr;
      } else {
        /* Later legs repeat the same fields but the PNR is only written once;
           the 7 characters are still present and hold the same locator. */
        leg.pnr = raw.substr(pos, 7).trim();
        leg.fields.push(makeField(LEG_FIELDS[0], raw.substr(pos, 7), pos, i + 1));
        pos += 7;
      }

      leg.from = take(LEG_FIELDS[1]).trim();
      leg.to = take(LEG_FIELDS[2]).trim();
      leg.carrier = take(LEG_FIELDS[3]).trim();
      leg.flightNumber = decodeFlightNumber(take(LEG_FIELDS[4]));
      var julianRaw = take(LEG_FIELDS[5]);
      leg.julianDate = julianRaw;
      leg.compartment = take(LEG_FIELDS[6]).trim();
      leg.compartmentLabel = label(ENUMS.compartment, leg.compartment);
      var seatRaw = take(LEG_FIELDS[7]);
      leg.seat = decodeSeat(seatRaw);
      leg.seatRaw = seatRaw;
      leg.sequence = decodeSequence(take(LEG_FIELDS[8]));
      var statusRaw = take(LEG_FIELDS[9]);

      if (isFirst) {
        result.passengerStatus = statusRaw.trim();
        result.passengerStatusLabel = label(ENUMS.passengerStatus, result.passengerStatus);
      } else {
        leg.passengerStatus = statusRaw.trim();
      }

      var sizeRaw = raw.substr(pos, SIZE.variableSize);
      pos += SIZE.variableSize;
      var declaredSize = parseHex(sizeRaw);
      leg.blockSize = declaredSize;
      leg.blockSizeRaw = sizeRaw;

      var available = Math.min(declaredSize, Math.max(0, raw.length - pos));
      var block = raw.substr(pos, available);
      var blockStart = pos;

      var body = block;
      if (isFirst && body.charAt(0) === '>') {
        result.version = body.charAt(1);
        var p = 2;
        leg.uniqueSize = parseHex(body.substr(p, 2));
        p += 2;
        result.unique = parseSlotBlock(UNIQUE_SLOTS, body.substr(p, leg.uniqueSize),
          blockStart + p, null);
        p += leg.uniqueSize;
        leg.repeatedSize = parseHex(body.substr(p, 2));
        p += 2;
        leg.fields = leg.fields.concat(parseSlotBlock(REPEATED_SLOTS, body.substr(p, leg.repeatedSize),
          blockStart + p, i + 1));
        p += leg.repeatedSize;
        leg.airlineUse = body.slice(p);
      } else {
        leg.repeatedSize = parseHex(body.substr(0, 2));
        var q = 2;
        leg.fields = leg.fields.concat(parseSlotBlock(REPEATED_SLOTS, body.substr(q, leg.repeatedSize),
          blockStart + q, i + 1));
        q += leg.repeatedSize;
        leg.airlineUse = body.slice(q);
      }

      /* The leg's own start position, for the offset column. */
      leg.fields.forEach(function (field) { field.leg = i + 1; });

      pos = blockStart + declaredSize;
      if (pos > raw.length) pos = raw.length;

      result.legs.push(leg);

      if (declaredSize !== available) {
        warnings.push('Leg ' + (i + 1) + ' declares a ' + declaredSize
          + '-byte data block but ' + available + ' bytes are present.');
      }
    }

    /* Optional security section, once, after the last leg. */
    if (pos < raw.length && raw.charAt(pos) === '^') {
      var secStart = pos;
      var type = raw.substr(pos + SIZE.securityMarker, SIZE.securityType);
      var secSizeText = raw.substr(pos + SIZE.securityMarker + SIZE.securityType, SIZE.securitySize);
      var secSize = parseHex(secSizeText);
      var dataStart = pos + SIZE.securityMarker + SIZE.securityType + SIZE.securitySize;
      var data = raw.substr(dataStart, secSize);
      result.security = {
        type: type,
        sizeText: secSizeText,
        size: secSize,
        data: data,
        offset: secStart + 1,
        truncated: data.length !== secSize
      };
      pos = dataStart + secSize;
    } else if (pos < raw.length) {
      warnings.push((raw.length - pos) + ' trailing characters after the last leg were ignored.');
    }

    if (result.version !== null && !/^[1-9]$/.test(result.version)) {
      warnings.push('Unknown BCBP version "' + result.version + '". The layout is assumed to be the v2\u2013v8 layout.');
    }

    var year = referenceYear;
    if (result.version === null) {
      result.versionLabel = 'no version field (item 6 was 00)';
    } else {
      result.versionLabel = 'version ' + result.version;
    }

    /* The date of issue carries only the last digit of the year, so it is
       resolved against the reference year: a pass issued in 2026 encodes "6",
       and reading that as 2006 would be plainly wrong. resolveYear() picks the
       most recent year ending in that digit that is not in the future. */
    result.unique.forEach(function (field) {
      if (field.code !== 'issueDate') return;
      var digits = field.raw.trim();
      if (!/^\d{4}$/.test(digits)) return;
      var issued = dateFromJulian(digits.slice(1),
        resolveYear(parseInt(digits.charAt(0), 10), year));
      if (issued) {
        field.value = isoDate(issued);
        field.meaning = longDate(issued);
      }
    });

    result.legs.forEach(function (leg) {
      var d = dateFromJulian(leg.julianDate, year);
      leg.flightDate = d ? isoDate(d) : null;
      leg.flightDateLabel = d ? longDate(d) : '';
      var from = airport(leg.from);
      var to = airport(leg.to);
      leg.fromCity = from ? from.city : '';
      leg.fromName = from ? from.name : '';
      leg.toCity = to ? to.city : '';
      leg.toName = to ? to.name : '';
      var op = airline(leg.carrier);
      leg.carrierName = op ? op.name : '';
      var numeric = leg.fields.filter(function (f) { return f.code === 'airlineNumericCode'; })[0];
      if (numeric && numeric.value) {
        var byNumeric = airlineByNumeric(numeric.value);
        if (byNumeric) leg.carrierNumericName = byNumeric.name;
      }
      leg.route = leg.from + ' \u2192 ' + leg.to;
    });

    if (result.legs.length) {
      var first = result.legs[0];
      result.route = first.route;
      result.carrier = first.carrier;
      result.flightNumber = first.flightNumber;
      result.seat = first.seat;
      result.sequence = first.sequence;
    }

    result.fields = result.legs.length ? result.legs[0].fields.slice() : [];
    result.allFields = result.unique.concat(result.fields).concat(
      result.legs.slice(1).reduce(function (acc, leg) {
        return acc.concat(leg.fields.filter(function (f) { return f.code !== 'pnr'; }));
      }, [])
    );

    result.checks = buildChecks(result, raw);

    return result;
  }

  function fail(message) {
    return { ok: false, error: message, checks: [], warnings: [] };
  }

  /* Structural checks. These are the things that can actually be wrong in a
     BCBP payload: the declared sizes, the fixed widths, and the code fields
     whose value space is closed. */
  function buildChecks(result, raw) {
    var checks = [];

    function add(id, labelText, ok, detail) {
      checks.push({ id: id, label: labelText, ok: ok, detail: detail || '' });
    }

    add('format', 'Format code is M', result.formatCode === 'M',
      result.formatCode === 'M' ? 'Mandatory (single) format' : 'Found "' + result.formatCode + '"');

    var expected = SIZE.uniqueMandatory;
    result.legs.forEach(function (leg) {
      expected += SIZE.perLeg + SIZE.variableSize + leg.blockSize;
    });
    if (result.security) expected += 4 + result.security.size;
    add('length', 'Payload length matches the declared sizes', expected === raw.length,
      'computed ' + expected + ' characters, payload has ' + raw.length);

    var legsInRange = result.legs.every(function (leg) { return leg.index <= result.legCount; });
    add('legs', 'Leg count is consistent with the data', legsInRange && result.legs.length === result.legCount,
      result.legs.length + ' leg' + (result.legs.length === 1 ? '' : 's')
      + ' parsed, header declares ' + result.legCount);

    var versionOk = result.version === null || /^[1-9]$/.test(result.version);
    add('version', 'Version field present and recognised', versionOk,
      result.version === null ? 'item 6 was 00, so there is no conditional data' : 'version ' + result.version);

    var badAirports = result.legs.filter(function (leg) {
      return !/^[A-Z]{3}$/.test(leg.from) || !/^[A-Z]{3}$/.test(leg.to);
    });
    add('airports', 'Airport codes are 3 letters', badAirports.length === 0,
      badAirports.length ? 'check ' + badAirports.map(function (l) { return l.from + '/' + l.to; }).join(', ')
        : result.legs.map(function (l) { return l.from + '\u2013' + l.to; }).join(', '));

    var badDates = result.legs.filter(function (leg) {
      var d = parseInt(leg.julianDate, 10);
      return !(d >= 1 && d <= 366);
    });
    add('julian', 'Julian flight dates are within 001\u2013366', badDates.length === 0,
      badDates.length ? 'out of range on ' + badDates.length + ' leg(s)'
        : result.legs.map(function (l) { return l.flightDateLabel || l.julianDate; }).join(', '));

    var badSeats = result.legs.filter(function (leg) {
      return leg.seat && leg.seat !== 'INF' && !/^\d{1,3}[A-Z]{1,2}$/.test(leg.seat);
    });
    add('seat', 'Seat numbers follow the row-plus-letter form', badSeats.length === 0,
      badSeats.length ? 'unrecognised: ' + badSeats.map(function (l) { return l.seatRaw; }).join(', ')
        : result.legs.map(function (l) { return l.seat || 'unassigned'; }).join(', '));

    var sizesOk = result.legs.every(function (leg) {
      return leg.blockSize === (leg.blockSizeRaw ? parseHex(leg.blockSizeRaw) : 0);
    });
    add('item6', 'Declared block sizes agree with the data present', sizesOk && !result.warnings.length,
      sizesOk ? result.legs.map(function (l) { return l.blockSize + ' bytes'; }).join(', ')
        : 'see the warnings below');

    /* The security section is the only variable-length block outside the legs,
       so it gets its own size check rather than hiding inside the length one. */
    if (result.security) {
      add('security', 'Security data length matches the size in item 29', !result.security.truncated,
        'type ' + result.security.type + ' \u00b7 item 29 says ' + result.security.size
        + ' \u00b7 ' + result.security.data.length + ' characters present');
    } else {
      add('security', 'Security data length matches the size in item 29', true,
        'no security section — item 30 was left empty');
    }

    return checks;
  }

  /* =========================================================================
     Rebuilding a record from a parsed payload
     ========================================================================= */

  function rawOf(fields, code) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].code === code) return fields[i].raw;
    }
    return '';
  }

  function trimmedRawOf(fields, code) {
    return rawOf(fields, code).trim();
  }

  /**
   * Turn a decode() result back into the record shape encode() accepts, keeping
   * the raw spellings (a Julian issue date stays "1325" rather than the date it
   * resolves to). Used to prove the round trip and to let the generator load a
   * pass that was scanned instead of typed.
   */
  function toRecord(decoded) {
    if (!decoded || !decoded.ok) {
      throw new Error('Only a payload that parsed successfully can be turned back into a record.');
    }

    var unique = decoded.unique || [];
    var bagTags = ['bagTag1', 'bagTag2', 'bagTag3']
      .map(function (code) { return trimmedRawOf(unique, code); })
      .filter(Boolean);
    var nonConsecutiveTags = ['nonConsecutiveTag1', 'nonConsecutiveTag2']
      .map(function (code) { return trimmedRawOf(unique, code); })
      .filter(Boolean);

    return {
      passengerName: decoded.passengerName,
      electronicTicket: decoded.electronicTicket,
      pnr: decoded.pnr,
      passengerStatus: decoded.passengerStatus,
      passengerDescription: trimmedRawOf(unique, 'passengerDescription'),
      checkinSource: trimmedRawOf(unique, 'checkinSource'),
      issuanceSource: trimmedRawOf(unique, 'issuanceSource'),
      issueDate: trimmedRawOf(unique, 'issueDate'),
      documentType: trimmedRawOf(unique, 'documentType'),
      issuerAirline: trimmedRawOf(unique, 'issuerAirline'),
      bagTags: bagTags,
      nonConsecutiveTags: nonConsecutiveTags,
      airlineUse: '',
      security: decoded.security
        ? { type: decoded.security.type, data: decoded.security.data }
        : null,
      version: decoded.version === null ? '0' : decoded.version,
      legs: (decoded.legs || []).map(function (leg) {
        return {
          pnr: leg.pnr,
          from: leg.from,
          to: leg.to,
          carrier: leg.carrier,
          flightNumber: leg.flightNumber,
          julianDate: leg.julianDate,
          compartment: leg.compartment,
          seat: leg.seat,
          sequence: leg.sequence,
          passengerStatus: leg.index === 1 ? decoded.passengerStatus : leg.passengerStatus,
          airlineUse: leg.airlineUse,
          airlineNumericCode: trimmedRawOf(leg.fields, 'airlineNumericCode'),
          docFormSerial: trimmedRawOf(leg.fields, 'docFormSerial'),
          selectee: trimmedRawOf(leg.fields, 'selectee'),
          intlDocVerification: trimmedRawOf(leg.fields, 'intlDocVerification'),
          marketingCarrier: trimmedRawOf(leg.fields, 'marketingCarrier'),
          ffAirline: trimmedRawOf(leg.fields, 'ffAirline'),
          ffNumber: trimmedRawOf(leg.fields, 'ffNumber'),
          idAdIndicator: trimmedRawOf(leg.fields, 'idAdIndicator'),
          freeBaggage: trimmedRawOf(leg.fields, 'freeBaggage'),
          fastTrack: trimmedRawOf(leg.fields, 'fastTrack')
        };
      })
    };
  }

  /* =========================================================================
     Security signature — WebCrypto (ECDSA P-256, SHA-256)
     ========================================================================= */

  /* The signature covers the payload WITHOUT items 25–30: a signature cannot
     cover itself, so the issuer signs everything up to the end of the last leg
     and appends the security section afterwards. securityBase() computes that
     prefix and both sign and verify go through it, so the two can never
     disagree about what was signed.

     No key material lives in this file: the scanner loads this same bcbp.js,
     and a reader must only ever hold the public key. Each page passes its own
     key in — the generator the demo private key, the scanner the matching
     public key — which is how a real issuer/reader pair is built as well. */

  var SIGN_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
  var SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' };
  var importedKeys = {};

  function subtleCrypto() {
    var root = typeof globalThis !== 'undefined' ? globalThis
      : (typeof window !== 'undefined' ? window : null);
    return root && root.crypto && root.crypto.subtle ? root.crypto.subtle : null;
  }

  function bytesFromBase64(text) {
    var binary = atob(str(text).replace(/\s+/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function base64FromBytes(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function importSigningKey(format, base64, usages) {
    var subtle = subtleCrypto();
    if (!subtle) return Promise.reject(new Error('WebCrypto is not available in this context.'));
    var cacheKey = format + ':' + base64;
    if (!importedKeys[cacheKey]) {
      importedKeys[cacheKey] = subtle.importKey(format, bytesFromBase64(base64),
        SIGN_ALGORITHM, false, usages);
    }
    return importedKeys[cacheKey];
  }

  /** The payload with its security section removed — the bytes that get signed. */
  function securityBase(payload) {
    var text = str(payload);
    var parsed = decode(text);
    if (!parsed.ok || !parsed.security) return text;
    /* decoded.security.offset points at the type character (item 28); the '^'
       marking item 25 sits immediately before it. */
    return text.slice(0, parsed.security.offset - 1);
  }

  /**
   * Sign a payload and return the item 30 value: base64 of the raw 64-byte
   * r||s signature, 88 characters — inside the 100-character limit validate()
   * puts on item 30 (hex would be 128 and is rejected). Resolves to null when
   * WebCrypto is unavailable, so a caller can degrade to an unsigned pass
   * instead of breaking.
   */
  function signSecurityData(payload, privateKeyBase64) {
    var subtle = subtleCrypto();
    if (!subtle) return Promise.resolve(null);
    var data = new TextEncoder().encode(securityBase(payload));
    return importSigningKey('pkcs8', privateKeyBase64, ['sign'])
      .then(function (key) { return subtle.sign(SIGN_PARAMS, key, data); })
      .then(function (signature) { return base64FromBytes(new Uint8Array(signature)); })
      .catch(function () { return null; });
  }

  /**
   * Verify a payload's security section against a public key:
   *   'none'        items 25–30 absent — nothing to verify, not an error
   *   'ok'          the signature matches this payload
   *   'bad'         present but does not verify: edited, truncated, other key
   *   'unsupported' WebCrypto unavailable
   *   'error'       the payload did not decode at all
   * Returns a Promise of { state, ok, message }.
   */
  function verifySecurityData(payload, publicKeyBase64) {
    var text = str(payload);
    var parsed = decode(text);
    if (!parsed.ok) {
      return Promise.resolve({ state: 'error', ok: false, message: parsed.error });
    }
    if (!parsed.security) {
      return Promise.resolve({
        state: 'none', ok: false,
        message: 'No security section \u2014 items 25\u201330 are absent.'
      });
    }
    if (parsed.security.truncated) {
      return Promise.resolve({
        state: 'bad', ok: false,
        message: 'Item 29 declares ' + parsed.security.size + ' bytes but only '
          + parsed.security.data.length + ' are present.'
      });
    }
    var subtle = subtleCrypto();
    if (!subtle) {
      return Promise.resolve({
        state: 'unsupported', ok: false,
        message: 'WebCrypto is not available in this context, so nothing can be verified.'
      });
    }
    var signature;
    try {
      signature = bytesFromBase64(parsed.security.data);
    } catch (error) {
      return Promise.resolve({
        state: 'bad', ok: false,
        message: 'Item 30 is not valid base64, so it is not a signature this reader understands.'
      });
    }
    var data = new TextEncoder().encode(securityBase(text));
    return importSigningKey('spki', publicKeyBase64, ['verify'])
      .then(function (key) { return subtle.verify(SIGN_PARAMS, key, signature, data); })
      .then(function (valid) {
        return valid
          ? { state: 'ok', ok: true, message: 'Signature matches this payload (ECDSA P-256).' }
          : {
            state: 'bad', ok: false,
            message: 'The signature does not match this payload \u2014 it was changed '
              + 'after signing, or it was signed with a different key.'
          };
      })
      .catch(function (error) {
        return { state: 'error', ok: false, message: error.message };
      });
  }

  /* =========================================================================
     Random sample data
     ========================================================================= */

  /* Sample data is generated with Math.random on purpose: it fills a specimen
     boarding pass that is meant to be recognisable as fake. Nothing here is a
     credential, a token or a secret, so an unpredictable generator would add
     cost without adding safety. Use crypto.getRandomValues for anything that
     actually needs to be unguessable. */

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomDigits(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
    return out;
  }

  /**
   * A stand-in for item 30. Real carriers put a digital signature of the payload
   * there: item 28 names the algorithm used, item 29 is the byte count written in
   * hexadecimal, item 30 the signature bytes themselves. This produces the same
   * shape — 20 random bytes spelled out as 40 hexadecimal characters, the length a
   * SHA-1 signature has — so the section encodes, parses back and passes the length
   * check, but it was not signed by anything and verifies against nothing.
   */
  function randomSecurity() {
    var hex = '0123456789ABCDEF';
    var data = '';
    for (var i = 0; i < 40; i++) data += hex.charAt(Math.floor(Math.random() * 16));
    return { type: '1', data: data };
  }

  var SAMPLE_SURNAMES = ['NAKAMURA', 'OKAFOR', 'LINDQVIST', 'MOREAU', 'HERNANDEZ',
    'KOWALSKI', 'ABDI', 'PETROV', 'SILVA', 'TANAKA', 'FERRARI', 'ODEGAARD',
    'MUTHONI', 'REYES', 'ZHAO', 'KOVACS'];
  var SAMPLE_GIVEN = ['AMARA', 'LIAM', 'SOFIA', 'NOAH', 'YUKI', 'ELENA', 'OMAR',
    'ASTRID', 'MATEO', 'PRIYA', 'JONAS', 'MEI', 'DIEGO', 'FREYA', 'HASSAN', 'CLARA'];
  var SEAT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'J', 'K'];

  /**
   * Build a plausible, clearly synthetic boarding pass record. Numbers are
   * random rather than sequential so a batch of samples does not look like a
   * single flight's passenger list.
   */
  function randomRecord(options) {
    var opts = options || {};
    var legCount = opts.legs || 1;
    var airlinePick = opts.airline ? airline(opts.airline) || pick(AIRLINES) : pick(AIRLINES);
    var includeConditional = opts.conditional !== false;

    var used = {};
    var legs = [];
    var cursor = pick(AIRPORTS);
    for (var i = 0; i < legCount; i++) {
      used[cursor.code] = true;
      var next = pick(AIRPORTS);
      var guard = 0;
      while (used[next.code] && guard++ < 40) next = pick(AIRPORTS);
      used[next.code] = true;

      var row = 1 + Math.floor(Math.random() * 42);
      var date = new Date();
      date.setUTCDate(date.getUTCDate() + 3 + Math.floor(Math.random() * 60));

      legs.push({
        from: cursor.code,
        to: next.code,
        carrier: airlinePick.iata,
        flightNumber: String(1 + Math.floor(Math.random() * 1899)),
        julianDate: padLeft(String(dayOfYear(date)), 3, '0'),
        compartment: pick(['Y', 'Y', 'Y', 'W', 'C', 'F']),
        seat: row + pick(SEAT_LETTERS),
        sequence: String(1 + Math.floor(Math.random() * 180)),
        airlineNumericCode: includeConditional ? airlinePick.numeric : '',
        docFormSerial: '',
        selectee: '',
        intlDocVerification: includeConditional ? pick([' ', '1', '2']) : '',
        marketingCarrier: includeConditional ? airlinePick.iata : '',
        ffAirline: includeConditional ? airlinePick.iata : '',
        ffNumber: includeConditional ? airlinePick.iata + randomDigits(9) : '',
        idAdIndicator: ' ',
        freeBaggage: includeConditional ? pick(['1PC', '2PC', '23K', '']) : '',
        fastTrack: includeConditional ? pick([' ', 'Y', 'N']) : ''
      });
      cursor = next;
    }

    var issueYear = new Date().getUTCFullYear() % 10;
    var pnr = randomPnr();

    /* Every leg carries its own PNR field. A single-leg pass repeats the same
       locator; a multi-leg itinerary can legitimately differ per leg, which is
       why the generator keeps the field per leg rather than once per pass. */
    legs.forEach(function (leg) { leg.pnr = pnr; });

    return {
      passengerName: pick(SAMPLE_SURNAMES) + '/' + pick(SAMPLE_GIVEN),
      electronicTicket: true,
      pnr: pnr,
      passengerStatus: pick(['1', '1', '1', '2', '3']),
      passengerDescription: includeConditional ? pick(['1', '2', '0', '3', '6']) : '',
      checkinSource: includeConditional ? pick(['W', 'M', 'K', 'O']) : '',
      issuanceSource: includeConditional ? pick(['W', 'M', 'K', 'O']) : '',
      issueDate: includeConditional
        ? String(issueYear) + padLeft(String(dayOfYear(new Date())), 3, '0')
        : '',
      documentType: includeConditional ? 'B' : '',
      issuerAirline: includeConditional ? airlinePick.iata : '',
      bagTags: includeConditional && Math.random() < 0.55
        ? [buildBagTag(airlinePick.numeric, randomDigits(6), 1 + Math.floor(Math.random() * 3))]
        : [],
      nonConsecutiveTags: [],
      airlineUse: '',
      security: opts.security === false ? null : randomSecurity(),
      version: CURRENT_VERSION,
      legs: legs
    };
  }

  /* PNR locators avoid vowels and easily confused letters, as airline
     reservation systems do. */
  function randomPnr() {
    var alphabet = 'BCDFGHJKLMNPQRSTVWXYZ0123456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return out;
  }

  /* =========================================================================
     Self test — the official Resolution 792 examples
     ========================================================================= */

  var SELF_TEST_VECTORS = [
    {
      name: 'IATA example 1 — single leg, no conditional data',
      payload: 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100',
      expect: { legs: 1, from: 'YUL', to: 'FRA', carrier: 'AC', flight: '834', seat: '1A', version: null }
    },
    {
      name: 'IATA example 2 — single leg with unique, repeated and security data',
      payload: 'M1DESMARAIS/LUC       EAB12C3 YULFRAAC 0834 326J003A0027 167>5321WW1325BAC 0014123456002001412346700100141234789012A0141234567890 1AC AC 1234567890123    4PCYLX58Z^108ABCDEFGH',
      expect: { legs: 1, from: 'YUL', to: 'FRA', carrier: 'AC', flight: '834', seat: '3A', version: '5' }
    },
    {
      name: 'IATA example 4 — two legs',
      payload: 'M2DESMARAIS/LUC       EAB12C3 YULFRAAC 0834 326J003A0027 167>5321WW1325BAC 0014123456002001412346700100141234789012A0141234567890 1AC AC 1234567890123    4PCYLX58ZDEF456 FRAGVALH 3664 327C012C0002 12E2A0140987654321 1AC AC 1234567890123    3PCNWQ^108ABCDEFGH',
      expect: { legs: 2, from: 'YUL', to: 'FRA', carrier: 'AC', flight: '834', seat: '3A', version: '5' }
    },
    {
      name: 'Version 6 with empty conditional blocks',
      payload: 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 226F001A0025 106>60000',
      expect: { legs: 1, from: 'YUL', to: 'FRA', carrier: 'AC', flight: '834', seat: '1A', version: '6' }
    }
  ];

  /**
   * Parse every official example and check the fields that the resolution
   * fixes. Returns `{ passed, failed, results }`.
   */
  function selfTest() {
    var results = SELF_TEST_VECTORS.map(function (vector) {
      var decoded = decode(vector.payload);
      var problems = [];
      if (!decoded.ok) {
        problems.push(decoded.error);
      } else {
        var e = vector.expect;
        if (decoded.legs.length !== e.legs) problems.push('legs ' + decoded.legs.length + ' \u2260 ' + e.legs);
        var leg = decoded.legs[0];
        if (leg.from !== e.from) problems.push('from ' + leg.from + ' \u2260 ' + e.from);
        if (leg.to !== e.to) problems.push('to ' + leg.to + ' \u2260 ' + e.to);
        if (leg.carrier !== e.carrier) problems.push('carrier ' + leg.carrier + ' \u2260 ' + e.carrier);
        if (leg.flightNumber !== e.flight) problems.push('flight ' + leg.flightNumber + ' \u2260 ' + e.flight);
        if (leg.seat !== e.seat) problems.push('seat ' + leg.seat + ' \u2260 ' + e.seat);
        if (decoded.version !== e.version) problems.push('version ' + decoded.version + ' \u2260 ' + e.version);
        /* The round trip has to hold for the examples too: parse, rebuild the
           record, re-encode, and the bytes must come back identical. */
        try {
          var reencoded = encode(toRecord(decoded));
          if (reencoded !== vector.payload) {
            problems.push('re-encode differs from the original payload');
          }
        } catch (error) {
          problems.push('re-encode failed: ' + error.message);
        }
      }
      return { name: vector.name, passed: problems.length === 0, problems: problems };
    });

    return {
      passed: results.filter(function (r) { return r.passed; }).length,
      failed: results.filter(function (r) { return !r.passed; }).length,
      results: results
    };
  }

  global.Bcbp = {
    SIZE: SIZE,
    MAX_LEGS: MAX_LEGS,
    CURRENT_VERSION: CURRENT_VERSION,
    LEG_FIELDS: LEG_FIELDS,
    UNIQUE_SLOTS: UNIQUE_SLOTS,
    REPEATED_SLOTS: REPEATED_SLOTS,
    ENUMS: ENUMS,
    AIRPORTS: AIRPORTS,
    AIRLINES: AIRLINES,
    SELF_TEST_VECTORS: SELF_TEST_VECTORS,
    encode: encode,
    decode: decode,
    toRecord: toRecord,
    validate: function (record) { return validate(normaliseRecord(record)); },
    normaliseRecord: normaliseRecord,
    randomRecord: randomRecord,
    randomPnr: randomPnr,
    signSecurityData: signSecurityData,
    verifySecurityData: verifySecurityData,
    securityBase: securityBase,
    buildBagTag: buildBagTag,
    describeBagTag: describeBagTag,
    dateFromJulian: dateFromJulian,
    dayOfYear: dayOfYear,
    airport: airport,
    airline: airline,
    airlineByNumeric: airlineByNumeric,
    labelFor: label,
    selfTest: selfTest
  };
})(typeof window !== 'undefined' ? window : this);
