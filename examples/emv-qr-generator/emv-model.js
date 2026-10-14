/*
 * Shared EMV® QR model.
 *
 * An EMV merchant-presented QR payload is a flat sequence of TLV data objects:
 * a two-digit tag, a two-digit decimal length, then exactly that many
 * characters of value. Fields run together with no delimiter because the
 * length says where the next one starts. The stream ends with tag 63, a
 * CRC-16/CCITT-FALSE over everything before the checksum value itself.
 *
 * Both demos in this pair load this file: the generator builds a payload from
 * a form, the scanner takes one apart again. Keeping it in one place is what
 * lets the scanner trust its own field names instead of repeating the table.
 *
 * Scope: Merchant Presented Mode, EMVCo QR Code Specification v1.1 (2020).
 * Consumer Presented Mode is deliberately not handled — a CPM payload is a
 * different structure and this file would be the wrong place to guess at it.
 *
 * Reference: CRC("123456789") = 0x29B1 for CCITT-FALSE.
 */

var EmvModel = (function () {
    'use strict';

    /* ---------------------------------------------------------------------
       CRC-16/CCITT-FALSE

       Polynomial 0x1021, init 0xFFFF, no reflection, no final XOR. EMV
       requires the checksum over the payload INCLUDING the literal "6304"
       tag+length that introduces it, but NOT the four hex characters the
       checksum protects. Forgetting the "6304" is the single most common
       implementation bug and it produces a code that looks perfect and is
       rejected by every wallet.
       --------------------------------------------------------------------- */
    function crc16CcittFalse(text) {
        var crc = 0xFFFF;
        for (var i = 0; i < text.length; i++) {
            crc ^= (text.charCodeAt(i) & 0xFF) << 8;
            for (var bit = 0; bit < 8; bit++) {
                if (crc & 0x8000) {
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        return crc & 0xFFFF;
    }

    /* Four uppercase hex characters, zero padded — the EMV wire format. */
    function crcHex(text) {
        var hex = crc16CcittFalse(text).toString(16).toUpperCase();
        while (hex.length < 4) hex = '0' + hex;
        return hex;
    }

    /* ---------------------------------------------------------------------
       TLV primitives
       --------------------------------------------------------------------- */

    function twoDigits(n) {
        return (n < 10 ? '0' : '') + n;
    }

    /* Length is written as two decimal digits, so a value longer than 99
       characters cannot be expressed. Callers validate before they get here. */
    function tlv(tag, value) {
        var str = value == null ? '' : String(value);
        if (str.length > 99) {
            throw new Error('Tag ' + tag + ' is ' + str.length
                + ' characters; TLV length is written as two digits and caps at 99.');
        }
        if (!/^[0-9]{2}$/.test(tag)) {
            throw new Error('Tag must be two digits, got "' + tag + '".');
        }
        return tag + twoDigits(str.length) + str;
    }

    /* Recursively parse a TLV stream into {tag, value, children}. Nested
       templates (26-51, 62) hold sub-objects in the same format, so the
       parser walks one level down by default; `depth` guards against a
       malformed payload nesting forever. */
    function parseTlv(payload, depth) {
        var level = depth || 0;
        var out = [];
        var i = 0;

        while (i + 4 <= payload.length) {
            var tag = payload.substr(i, 2);
            var lenText = payload.substr(i + 2, 2);
            if (!/^[0-9]{2}$/.test(tag) || !/^[0-9]{2}$/.test(lenText)) break;

            var len = parseInt(lenText, 10);
            var start = i + 4;
            /* A length that runs past the end means the stream is corrupt.
               Stop rather than throw: a scanner handed a damaged code should
               still show whatever prefix it managed to read. */
            if (start + len > payload.length) {
                out.push({
                    tag: tag,
                    value: payload.slice(start),
                    truncated: true,
                    children: null
                });
                break;
            }

            var value = payload.substr(start, len);
            var entry = { tag: tag, value: value, truncated: false, children: null };

            if (level < 2 && NESTED_TAGS[tag]) {
                entry.children = parseTlv(value, level + 1);
            }
            out.push(entry);
            i = start + len;
        }

        return out;
    }

    /* Tags whose value is itself a TLV sequence. Tag 80-99 holds the
       merchant-information language template, which is also nested. */
    var NESTED_TAGS = (function () {
        var map = {};
        for (var t = 2; t <= 51; t++) map[twoDigits(t)] = true;  // merchant account info
        map['62'] = true;   // additional data
        map['64'] = true;   // merchant information — language template
        map['80'] = true;   // merchant information — reserved
        map['81'] = true;
        map['82'] = true;
        map['83'] = true;
        map['84'] = true;
        map['85'] = true;
        map['86'] = true;
        map['87'] = true;
        map['88'] = true;
        map['89'] = true;
        map['90'] = true;
        map['91'] = true;
        map['92'] = true;
        map['93'] = true;
        map['94'] = true;
        map['95'] = true;
        map['96'] = true;
        map['97'] = true;
        map['98'] = true;
        map['99'] = true;
        return map;
    })();

    /* ---------------------------------------------------------------------
       Field dictionary

       Only top-level tags are named here. Merchant account info (02-51) is
       scheme specific and its GUID is shown verbatim — labelling it would
       mean guessing which payment scheme a private GUID belongs to.
       --------------------------------------------------------------------- */
    var FIELD_NAMES = {
        '00': 'Payload format indicator',
        '01': 'Point of initiation method',
        '26': 'Merchant account information',
        '51': 'Merchant account information',
        '52': 'Merchant category code',
        '53': 'Transaction currency',
        '54': 'Transaction amount',
        '55': 'Tip or convenience indicator',
        '56': 'Convenience fee — fixed',
        '57': 'Convenience fee — percentage',
        '58': 'Country code',
        '59': 'Merchant name',
        '60': 'Merchant city',
        '61': 'Postal code',
        '62': 'Additional data field',
        '63': 'CRC',
        '64': 'Merchant information — language template'
    };

    /* Sub-tags of tag 62, per the EMVCo specification. */
    var ADDITIONAL_DATA_NAMES = {
        '00': 'Bill number',
        '01': 'Mobile number',
        '02': 'Reference label',
        '03': 'Reference label — encoded',
        '04': 'Description',
        '05': 'Reference label',
        '06': 'Terminal type',
        '07': 'Purpose of transaction',
        '08': 'Additional consumer data',
        '09': 'Country code of terminal',
        '10': 'Nationality of cardholder',
        '50': 'Sub-merchant identifier',
        '51': 'Service provider'
    };

    /* Sub-tag 00 of a merchant account info template is the Globally Unique
       Identifier. The AID-style shape is hex BCD of a payment network AID
       (A0000000651 is UPI, A000000333010101 UnionPay); the reverse-DNS shape
       is a national scheme (BR.GOV.BCB.PIX, SG.PAYNOW). Recognising the two
       shapes is not the same as knowing the scheme, so the name stays
       generic and the raw value is always shown. */
    function describeGuid(guid) {
        if (/^A[0-9A-F]{12,}$/i.test(guid)) return 'Payment network AID';
        if (/^[A-Z]{2}\.[A-Z0-9.]+$/.test(guid)) return 'National scheme identifier';
        return 'Scheme identifier';
    }

    function fieldName(tag) {
        if (FIELD_NAMES[tag]) return FIELD_NAMES[tag];
        var n = parseInt(tag, 10);
        if (n >= 2 && n <= 51) return 'Merchant account information';
        if (n >= 65 && n <= 79) return 'Reserved for EMVCo';
        if (n >= 80 && n <= 99) return 'Unreserved template';
        return 'Unknown tag';
    }

    /* ---------------------------------------------------------------------
       Currency and country

       Currency is ISO 4217 numeric, not the alphabetic code the wire carries
       elsewhere. Showing "840" alone would leave a reader guessing, so the
       common ones are named.
       --------------------------------------------------------------------- */
    var CURRENCIES = {
        /* ISO 4217 numeric -> alphabetic, active codes only. Generated from
           the official ISO 4217 list (datasets/currency-codes) rather than
           typed from memory — hand-typed tables are how 978 stops being EUR. */
        '008': 'ALL', '012': 'DZD', '032': 'ARS', '036': 'AUD', '044': 'BSD', '048': 'BHD',
        '050': 'BDT', '051': 'AMD', '052': 'BBD', '060': 'BMD', '064': 'BTN', '068': 'BOB',
        '072': 'BWP', '084': 'BZD', '090': 'SBD', '096': 'BND', '104': 'MMK', '108': 'BIF',
        '116': 'KHR', '124': 'CAD', '132': 'CVE', '136': 'KYD', '144': 'LKR', '152': 'CLP',
        '156': 'CNY', '170': 'COP', '174': 'KMF', '188': 'CRC', '192': 'CUP', '203': 'CZK',
        '208': 'DKK', '214': 'DOP', '222': 'SVC', '230': 'ETB', '232': 'ERN', '238': 'FKP',
        '242': 'FJD', '262': 'DJF', '270': 'GMD', '292': 'GIP', '320': 'GTQ', '324': 'GNF',
        '328': 'GYD', '332': 'HTG', '340': 'HNL', '344': 'HKD', '348': 'HUF', '352': 'ISK',
        '356': 'INR', '360': 'IDR', '364': 'IRR', '368': 'IQD', '376': 'ILS', '388': 'JMD',
        '392': 'JPY', '396': 'XAD', '398': 'KZT', '400': 'JOD', '404': 'KES', '408': 'KPW',
        '410': 'KRW', '414': 'KWD', '417': 'KGS', '418': 'LAK', '422': 'LBP', '426': 'LSL',
        '430': 'LRD', '434': 'LYD', '446': 'MOP', '454': 'MWK', '458': 'MYR', '462': 'MVR',
        '480': 'MUR', '484': 'MXN', '496': 'MNT', '498': 'MDL', '504': 'MAD', '512': 'OMR',
        '516': 'NAD', '524': 'NPR', '532': 'XCG', '533': 'AWG', '548': 'VUV', '554': 'NZD',
        '558': 'NIO', '566': 'NGN', '578': 'NOK', '586': 'PKR', '590': 'PAB', '598': 'PGK',
        '600': 'PYG', '604': 'PEN', '608': 'PHP', '634': 'QAR', '643': 'RUB', '646': 'RWF',
        '682': 'SAR', '690': 'SCR', '702': 'SGD', '704': 'VND', '706': 'SOS', '710': 'ZAR',
        '728': 'SSP', '748': 'SZL', '752': 'SEK', '756': 'CHF', '760': 'SYP', '764': 'THB',
        '776': 'TOP', '780': 'TTD', '784': 'AED', '788': 'TND', '800': 'UGX', '807': 'MKD',
        '818': 'EGP', '826': 'GBP', '840': 'USD', '858': 'UYU', '860': 'UZS', '882': 'WST',
        '886': 'YER', '901': 'TWD', '924': 'ZWG', '925': 'SLE', '926': 'VED', '927': 'UYW',
        '928': 'VES', '929': 'MRU', '930': 'STN', '933': 'BYN', '934': 'TMT', '936': 'GHS',
        '938': 'SDG', '940': 'UYI', '941': 'RSD', '943': 'MZN', '944': 'AZN', '946': 'RON',
        '947': 'CHE', '948': 'CHW', '949': 'TRY', '950': 'XAF', '951': 'XCD', '952': 'XOF',
        '953': 'XPF', '955': 'XBA', '956': 'XBB', '957': 'XBC', '958': 'XBD', '959': 'XAU',
        '960': 'XDR', '961': 'XAG', '962': 'XPT', '963': 'XTS', '964': 'XPD', '965': 'XUA',
        '967': 'ZMW', '968': 'SRD', '969': 'MGA', '970': 'COU', '971': 'AFN', '972': 'TJS',
        '973': 'AOA', '976': 'CDF', '977': 'BAM', '978': 'EUR', '979': 'MXV', '980': 'UAH',
        '981': 'GEL', '984': 'BOV', '985': 'PLN', '986': 'BRL', '990': 'CLF', '994': 'XSU',
        '997': 'USN', '999': 'XXX',
    };

    function currencyName(code) {
        return CURRENCIES[code] || null;
    }

    /* Merchant category codes worth naming. ISO 18245 assigns four digits;
       the ranges below cover retail and services, which is where a
       merchant-presented QR actually turns up. */
    var MCC_NOTES = {
        '5411': 'Grocery stores / supermarkets',
        '5812': 'Eating places and restaurants',
        '5814': 'Fast food restaurants',
        '4111': 'Local commuter transport',
        '4121': 'Taxicabs and rideshare',
        '4511': 'Air travel',
        '7011': 'Lodging',
        '5912': 'Drug stores and pharmacies',
        '8931': 'Accounting and bookkeeping services',
        '8299': 'Educational services'
    };

    function mccNote(code) {
        return MCC_NOTES[code] || null;
    }

    /* ---------------------------------------------------------------------
       Validation

       The specification puts hard limits on a handful of fields. Checking
       them here means both demos report the same thing for the same bad
       input, and a visitor learns the rule instead of getting a rejected
       code from a wallet with no explanation.
       --------------------------------------------------------------------- */

    /* Merchant name: up to 25 characters per EMVCo. City: up to 15. */
    function validateFields(fields) {
        var errors = [];

        if (fields.formatIndicator !== '01') {
            errors.push('Payload format indicator (tag 00) must be "01" — it declares the QR template version.');
        }
        if (['11', '12'].indexOf(fields.pointOfInitiation) === -1) {
            errors.push('Point of initiation method (tag 01) must be "11" for a static code or "12" for a dynamic one.');
        }
        if (fields.pointOfInitiation === '12' && !fields.amount) {
            errors.push('A dynamic code (tag 01 = "12") carries the amount in tag 54; a static code ("11") must not.');
        }
        if (fields.pointOfInitiation === '11' && fields.amount) {
            errors.push('A static code (tag 01 = "11") leaves the amount out — the customer types it in their app.');
        }
        if (fields.amount && !/^[0-9]{1,}[.][0-9]{2}$/.test(fields.amount)) {
            errors.push('Transaction amount (tag 54) must be a decimal with two fraction digits, for example 12.50.');
        }
        if (fields.currency && !/^[0-9]{3}$/.test(fields.currency)) {
            errors.push('Transaction currency (tag 53) must be the three-digit ISO 4217 numeric code, for example 840 for USD.');
        }
        if (fields.mcc && !/^[0-9]{4}$/.test(fields.mcc)) {
            errors.push('Merchant category code (tag 52) must be four digits from ISO 18245.');
        }
        if (fields.country && !/^[A-Z]{2}$/.test(fields.country)) {
            errors.push('Country code (tag 58) must be the two-letter ISO 3166-1 alpha-2 code, for example US.');
        }
        if (fields.merchantName && fields.merchantName.length > 25) {
            errors.push('Merchant name (tag 59) is ' + fields.merchantName.length
                + ' characters; EMVCo allows at most 25.');
        }
        if (fields.merchantCity && fields.merchantCity.length > 15) {
            errors.push('Merchant city (tag 60) is ' + fields.merchantCity.length
                + ' characters; EMVCo allows at most 15.');
        }

        return errors;
    }

    /* ---------------------------------------------------------------------
       Payload assembly

       Top-level objects are emitted in ascending tag order, which the spec
       requires. A caller supplies the human-facing fields; this function
       owns the ordering, the nested templates and the checksum, so no caller
       can get the CRC placement wrong.
       --------------------------------------------------------------------- */
    function buildPayload(fields) {
        var f = fields || {};
        var parts = [];

        parts.push(tlv('00', '01'));
        if (f.pointOfInitiation) parts.push(tlv('01', f.pointOfInitiation));

        /* Merchant account information: tag 26 (or another 02-51 slot) with a
           GUID sub-tag and, when given, an identifier sub-tag. A GUID of
           "BR.GOV.BCB.PIX" is 14 characters, and 14 + "5801" + "A123" is
           still inside the 99-character TLV limit, so the common shapes fit. */
        if (f.guid) {
            var mai = tlv('00', f.guid);
            if (f.merchantId) {
                mai += tlv('04', f.merchantId);
            }
            parts.push(tlv(f.maiTag || '26', mai));
        }

        if (f.mcc) parts.push(tlv('52', f.mcc));
        if (f.currency) parts.push(tlv('53', f.currency));
        if (f.amount) parts.push(tlv('54', f.amount));
        if (f.tipIndicator) parts.push(tlv('55', f.tipIndicator));
        if (f.country) parts.push(tlv('58', f.country));
        if (f.merchantName) parts.push(tlv('59', f.merchantName));
        if (f.merchantCity) parts.push(tlv('60', f.merchantCity));
        if (f.postalCode) parts.push(tlv('61', f.postalCode));

        /* Tag 62 carries the bill number and reference label — the join key
           a payment is reconciled against later. */
        var additional = '';
        if (f.billNumber) additional += tlv('00', f.billNumber);
        if (f.referenceLabel) additional += tlv('05', f.referenceLabel);
        if (additional) parts.push(tlv('62', additional));

        var body = parts.join('');

        /* The checksum covers the payload plus the CRC tag and length, and
           not the checksum characters themselves. */
        var withHeader = body + '6304';
        return withHeader + crcHex(withHeader);
    }

    /* ---------------------------------------------------------------------
       Payload inspection

       Used by the generator to show what it just produced, and by the
       scanner for the actual decode. Both want the same breakdown.
       --------------------------------------------------------------------- */
    function parsePayload(payload) {
        var result = {
            payload: payload,
            entries: [],
            crcDeclared: null,
            crcComputed: null,
            crcValid: false,
            formatIndicator: null,
            pointOfInitiation: null,
            isDynamic: false,
            errors: []
        };

        if (typeof payload !== 'string' || payload.length === 0) {
            result.errors.push('Empty payload.');
            return result;
        }

        result.entries = parseTlv(payload, 0);

        var crcEntry = null;
        result.entries.forEach(function (e) {
            if (e.tag === '63') crcEntry = e;
            if (e.tag === '00') result.formatIndicator = e.value;
            if (e.tag === '01') result.pointOfInitiation = e.value;
        });

        if (!crcEntry) {
            result.errors.push('No CRC (tag 63) in the payload — an EMV QR must end with a checksum.');
            return result;
        }
        if (crcEntry.truncated || crcEntry.value.length !== 4) {
            result.errors.push('The CRC field is not four characters; the payload looks truncated.');
            return result;
        }

        result.crcDeclared = crcEntry.value.toUpperCase();
        /* Everything up to and including "6304", i.e. the payload minus the
           four checksum characters. */
        var covered = payload.slice(0, payload.length - 4);
        result.crcComputed = crcHex(covered);
        result.crcValid = result.crcDeclared === result.crcComputed;

        if (!result.crcValid) {
            result.errors.push('CRC mismatch: the code says ' + result.crcDeclared
                + ' but the content computes to ' + result.crcComputed
                + '. The payload was altered in transit or was never a valid EMV QR.');
        }

        result.isDynamic = result.pointOfInitiation === '12';

        if (result.formatIndicator !== '01') {
            result.errors.push('Payload format indicator is "'
                + (result.formatIndicator || 'missing')
                + '", not "01" — this is not an EMVCo version 1 payment QR.');
        }

        return result;
    }

    /* A payment QR should be a QR carrying an EMV payload. Anything else that
       decodes as a QR — a plain URL, a Wi-Fi login, a vCard — is not one, and
       saying so is more useful than reporting a field list that makes no
       sense. */
    function looksLikeEmv(payload) {
        if (typeof payload !== 'string') return false;
        if (payload.indexOf('6304') === -1) return false;
        return /^\d{4}/.test(payload);
    }

    /* ---------------------------------------------------------------------
       Presets

       Sample merchant data covering the two deployment shapes a real
       merchant-presented QR takes. Every value is fake: the GUIDs are
       illustrative and resolve to nobody.
       --------------------------------------------------------------------- */
    var PRESETS = [
        {
            id: 'static-usd',
            label: 'Static · US dollar · no amount',
            hint: 'A printed sticker. The customer types the amount in their app.',
            fields: {
                pointOfInitiation: '11',
                maiTag: '26',
                guid: 'com.dynamsoft.demo',
                merchantId: 'MERCHANT-0001',
                mcc: '5411',
                currency: '840',
                country: 'US',
                merchantName: 'DYNAMSOFT DEMO STORE',
                merchantCity: 'NEW YORK',
                postalCode: '10001'
            }
        },
        {
            id: 'dynamic-usd',
            label: 'Dynamic · US dollar · 12.50',
            hint: 'Minted per transaction on a POS screen. Carries the amount.',
            fields: {
                pointOfInitiation: '12',
                maiTag: '26',
                guid: 'com.dynamsoft.demo',
                merchantId: 'MERCHANT-0001',
                mcc: '5411',
                currency: '840',
                amount: '12.50',
                country: 'US',
                merchantName: 'DYNAMSOFT DEMO STORE',
                merchantCity: 'NEW YORK',
                postalCode: '10001',
                billNumber: 'INV-2026-0042',
                referenceLabel: 'REF-8841-A1'
            }
        },
        {
            id: 'dynamic-restaurant',
            label: 'Dynamic · restaurant · tip indicator',
            hint: 'A restaurant counter screen: bill number plus a tip prompt.',
            fields: {
                pointOfInitiation: '12',
                maiTag: '26',
                guid: 'com.dynamsoft.demo',
                merchantId: 'MERCHANT-0001',
                mcc: '5812',
                currency: '978',
                amount: '48.00',
                tipIndicator: '01',
                country: 'DE',
                merchantName: 'DYNAMSOFT DEMO CAFE',
                merchantCity: 'BERLIN',
                postalCode: '10115',
                billNumber: 'TABLE-12',
                referenceLabel: 'REF-1120-B7'
            }
        }
    ];

    return {
        /* primitives */
        crc16CcittFalse: crc16CcittFalse,
        crcHex: crcHex,
        tlv: tlv,
        parseTlv: parseTlv,
        /* assembly / inspection */
        buildPayload: buildPayload,
        parsePayload: parsePayload,
        looksLikeEmv: looksLikeEmv,
        validateFields: validateFields,
        /* presentation */
        fieldName: fieldName,
        additionalDataName: function (tag) { return ADDITIONAL_DATA_NAMES[tag] || null; },
        describeGuid: describeGuid,
        currencyName: currencyName,
        mccNote: mccNote,
        presets: PRESETS
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmvModel;
}