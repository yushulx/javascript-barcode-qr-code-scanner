/*
 * AAMVA DL/ID Card Design Standard — jurisdiction table and PDF417 payload builder.
 *
 * Everything here runs in the browser. Payloads follow the AAMVA Card Design
 * Standard (v8 2013 / v9 2016 / v10 2020) so the generated PDF417 can be read
 * back by any AAMVA-aware parser, including Dynamsoft's AAMVA_DL_ID code parser
 * used by /codepool/demos/driver-license-scanner/.
 *
 * Header (byte offsets from 0):
 *   @            compliance indicator                      1
 *   \n           data element separator                    1
 *   \x1e         record separator                          1
 *   \r           segment terminator                        1
 *   ANSI␠        file type                                 5
 *   IIN          issuer identification number             6
 *   AAMVA ver    standard version                          2
 *   Juris. ver   jurisdiction extension version            2
 *   Entries      number of subfiles                        2
 *
 * Subfile designator: <type:2><offset:4><length:4>
 * Subfile: <type:2> then `CODE + value` elements joined by \n, ended by \r.
 */
(function (global) {
  'use strict';

  var LF = '\n';
  var RS = '\x1e';
  var CR = '\r';

  /*
   * Issuer Identification Numbers assigned by AAMVA
   * (https://aamva.org/identity/issuer-identification-numbers-(iin)).
   * Columns: code, name, iin, country, sample city, postal, licence-number
   * pattern. In the pattern, '#' is a random digit, 'A' a random uppercase
   * letter and 'X' a random alphanumeric character. The patterns are
   * illustrative samples, not an authoritative per-jurisdiction spec.
   */
  var JURISDICTIONS = [
    // --- United States ---
    ['AL', 'Alabama', '636033', 'USA', 'Birmingham', '35201', '#######'],
    ['AK', 'Alaska', '636059', 'USA', 'Anchorage', '99501', '#######'],
    ['AZ', 'Arizona', '636026', 'USA', 'Phoenix', '85001', 'A#######'],
    ['AR', 'Arkansas', '636021', 'USA', 'Little Rock', '72201', '#########'],
    ['CA', 'California', '636014', 'USA', 'Sacramento', '95814', 'A#######'],
    ['CO', 'Colorado', '636020', 'USA', 'Denver', '80202', '#########'],
    ['CT', 'Connecticut', '636006', 'USA', 'Hartford', '06103', '#########'],
    ['DE', 'Delaware', '636011', 'USA', 'Wilmington', '19801', '#######'],
    ['DC', 'District of Columbia', '636043', 'USA', 'Washington', '20001', '#########'],
    ['FL', 'Florida', '636010', 'USA', 'Tallahassee', '32301', 'A########'],
    ['GA', 'Georgia', '636055', 'USA', 'Atlanta', '30301', '#########'],
    ['HI', 'Hawaii', '636047', 'USA', 'Honolulu', '96801', 'A########'],
    ['ID', 'Idaho', '636050', 'USA', 'Boise', '83701', 'X#######'],
    ['IL', 'Illinois', '636035', 'USA', 'Springfield', '62701', 'X#######'],
    ['IN', 'Indiana', '636037', 'USA', 'Indianapolis', '46204', 'X#######'],
    ['IA', 'Iowa', '636018', 'USA', 'Des Moines', '50309', '#########'],
    ['KS', 'Kansas', '636022', 'USA', 'Topeka', '66603', 'X#######'],
    ['KY', 'Kentucky', '636046', 'USA', 'Frankfort', '40601', 'X#######'],
    ['LA', 'Louisiana', '636007', 'USA', 'Baton Rouge', '70801', '#########'],
    ['ME', 'Maine', '636041', 'USA', 'Augusta', '04330', '#######'],
    ['MD', 'Maryland', '636003', 'USA', 'Annapolis', '21401', 'X#######'],
    ['MA', 'Massachusetts', '636002', 'USA', 'Boston', '02108', 'X########'],
    ['MI', 'Michigan', '636032', 'USA', 'Lansing', '48933', 'A#######'],
    ['MN', 'Minnesota', '636038', 'USA', 'Saint Paul', '55101', 'A#######'],
    ['MS', 'Mississippi', '636051', 'USA', 'Jackson', '39201', '#########'],
    ['MO', 'Missouri', '636030', 'USA', 'Jefferson City', '65101', 'X#######'],
    ['MT', 'Montana', '636008', 'USA', 'Helena', '59601', 'X#######'],
    ['NE', 'Nebraska', '636054', 'USA', 'Lincoln', '68508', 'A#######'],
    ['NV', 'Nevada', '636049', 'USA', 'Carson City', '89701', '#########'],
    ['NH', 'New Hampshire', '636039', 'USA', 'Concord', '03301', '#########'],
    ['NJ', 'New Jersey', '636036', 'USA', 'Trenton', '08608', 'A#######'],
    ['NM', 'New Mexico', '636009', 'USA', 'Santa Fe', '87501', '#########'],
    ['NY', 'New York', '636001', 'USA', 'Albany', '12207', '#########'],
    ['NC', 'North Carolina', '636004', 'USA', 'Raleigh', '27601', '#########'],
    ['ND', 'North Dakota', '636034', 'USA', 'Bismarck', '58501', 'X#######'],
    ['OH', 'Ohio', '636023', 'USA', 'Columbus', '43215', 'X#######'],
    ['OK', 'Oklahoma', '636058', 'USA', 'Oklahoma City', '73102', 'X#######'],
    ['OR', 'Oregon', '636029', 'USA', 'Salem', '97301', '#########'],
    ['PA', 'Pennsylvania', '636025', 'USA', 'Harrisburg', '17101', '########'],
    ['RI', 'Rhode Island', '636052', 'USA', 'Providence', '02903', 'X#######'],
    ['SC', 'South Carolina', '636005', 'USA', 'Columbia', '29201', '#########'],
    ['SD', 'South Dakota', '636042', 'USA', 'Pierre', '57501', '#########'],
    ['TN', 'Tennessee', '636053', 'USA', 'Nashville', '37201', '#########'],
    ['TX', 'Texas', '636015', 'USA', 'Austin', '78701', '########'],
    ['UT', 'Utah', '636040', 'USA', 'Salt Lake City', '84101', '#########'],
    ['VT', 'Vermont', '636024', 'USA', 'Montpelier', '05602', '#########'],
    ['VA', 'Virginia', '636000', 'USA', 'Richmond', '23219', 'X#######'],
    ['WA', 'Washington', '636045', 'USA', 'Olympia', '98501', 'X#######'],
    ['WV', 'West Virginia', '636061', 'USA', 'Charleston', '25301', '#########'],
    ['WI', 'Wisconsin', '636031', 'USA', 'Madison', '53703', 'A#######'],
    ['WY', 'Wyoming', '636060', 'USA', 'Cheyenne', '82001', '#########'],
    // US territories
    ['AS', 'American Samoa', '604427', 'USA', 'Pago Pago', '96799', '#######'],
    ['GU', 'Guam', '636019', 'USA', 'Hagatna', '96910', '#######'],
    ['MP', 'Northern Mariana Islands', '604430', 'USA', 'Saipan', '96950', '#######'],
    ['PR', 'Puerto Rico', '604431', 'USA', 'San Juan', '00901', '#########'],
    ['VI', 'U.S. Virgin Islands', '636062', 'USA', 'Charlotte Amalie', '00802', '#######'],

    // --- Canada ---
    ['AB', 'Alberta', '604432', 'CAN', 'Edmonton', 'T5J 0N3', '#########'],
    ['BC', 'British Columbia', '636028', 'CAN', 'Victoria', 'V8W 1A1', '########'],
    ['MB', 'Manitoba', '636048', 'CAN', 'Winnipeg', 'R3C 0V8', '########'],
    ['NB', 'New Brunswick', '636017', 'CAN', 'Fredericton', 'E3B 1B1', '#######'],
    ['NL', 'Newfoundland and Labrador', '636016', 'CAN', "St. John's", 'A1C 5M2', 'A#######'],
    ['NS', 'Nova Scotia', '636013', 'CAN', 'Halifax', 'B3H 2Y9', '########'],
    ['NT', 'Northwest Territories', '604434', 'CAN', 'Yellowknife', 'X1A 2P7', '########'],
    ['NU', 'Nunavut', '604433', 'CAN', 'Iqaluit', 'X0A 0H0', '#######'],
    ['ON', 'Ontario', '636012', 'CAN', 'Toronto', 'M5H 2N1', 'A####-#####'],
    ['PE', 'Prince Edward Island', '604426', 'CAN', 'Charlottetown', 'C1A 1N3', '#######'],
    ['QC', 'Quebec', '604428', 'CAN', 'Quebec City', 'G1R 4S9', 'A#########'],
    ['SK', 'Saskatchewan', '636044', 'CAN', 'Regina', 'S4P 3Y2', '#######'],
    ['YT', 'Yukon', '604429', 'CAN', 'Whitehorse', 'Y1A 1B4', '########'],

    // --- Mexico (the two jurisdictions AAMVA assigns an IIN to) ---
    ['CU', 'Coahuila', '636056', 'MEX', 'Saltillo', '25000', '#########'],
    ['HL', 'Hidalgo', '636057', 'MEX', 'Pachuca', '42000', '#########']
  ];

  // Illustrative defaults per country of issue.
  var COUNTRY_DEFAULTS = {
    USA: { vehicleClass: 'C', restrictions: 'NONE', endorsements: 'NONE' },
    CAN: { vehicleClass: 'G', restrictions: 'NONE', endorsements: 'NONE' },
    MEX: { vehicleClass: 'A', restrictions: 'NONE', endorsements: 'NONE' }
  };

  var EYE_COLORS = ['BRO', 'BLU', 'GRN', 'HAZ', 'GRY', 'BLK'];
  var HAIR_COLORS = ['BRO', 'BLK', 'BLN', 'GRY', 'RED', 'SDY', 'WHI'];
  var FIRST_NAMES_M = ['JAMES', 'MICHAEL', 'ROBERT', 'DAVID', 'WILLIAM', 'RICHARD', 'JOSEPH', 'THOMAS'];
  var FIRST_NAMES_F = ['MARY', 'JENNIFER', 'LINDA', 'PATRICIA', 'ELIZABETH', 'SUSAN', 'JESSICA', 'SARAH'];
  var LAST_NAMES = ['SAMPLE', 'TESTER', 'SPECIMEN', 'DOE', 'EXAMPLE', 'DEMO', 'PLACEHOLDER', 'SAMPLEMAN'];
  var MIDDLE_NAMES = ['A', 'B', 'C', 'D', 'LEE', 'RAY', 'ANN', 'MAY'];
  var STREETS = ['123 MAIN ST', '456 OAK AVE', '789 MAPLE DR', '22 SAMPLE RD', '100 DEMO BLVD', '9 TEST LN'];

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function pad(num, len) {
    var s = String(num);
    while (s.length < len) s = '0' + s;
    return s;
  }

  function randomFromPattern(pattern) {
    var out = '';
    for (var i = 0; i < pattern.length; i++) {
      var c = pattern[i];
      if (c === '#') out += Math.floor(Math.random() * 10);
      else if (c === 'A') out += String.fromCharCode(65 + Math.floor(Math.random() * 26));
      else if (c === 'X') out += '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)];
      else out += c;
    }
    return out;
  }

  function findJurisdiction(code) {
    for (var i = 0; i < JURISDICTIONS.length; i++) {
      if (JURISDICTIONS[i][0] === code) {
        return {
          code: JURISDICTIONS[i][0],
          name: JURISDICTIONS[i][1],
          iin: JURISDICTIONS[i][2],
          country: JURISDICTIONS[i][3],
          city: JURISDICTIONS[i][4],
          postal: JURISDICTIONS[i][5],
          licencePattern: JURISDICTIONS[i][6]
        };
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * Sample data
   * --------------------------------------------------------------------- */

  function mmddyyyy(date) {
    return pad(date.getMonth() + 1, 2) + pad(date.getDate(), 2) + date.getFullYear();
  }

  function shiftYears(date, years) {
    var d = new Date(date.getTime());
    d.setFullYear(d.getFullYear() + years);
    return d;
  }

  function randomDateOfBirth() {
    var now = new Date();
    var age = 18 + Math.floor(Math.random() * 45);          // 18..62
    var d = new Date(now.getFullYear() - age, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
    return d;
  }

  /**
   * Build a complete, self-consistent sample record for a jurisdiction.
   */
  function randomSample(jurisdictionCode, cardType) {
    var j = findJurisdiction(jurisdictionCode);
    if (!j) throw new Error('Unknown jurisdiction: ' + jurisdictionCode);

    var defaults = COUNTRY_DEFAULTS[j.country] || COUNTRY_DEFAULTS.USA;
    var sexCode = Math.random() < 0.5 ? '1' : '2';
    var firstName = sexCode === '1' ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F);
    var birth = randomDateOfBirth();
    var today = new Date();
    var issue = new Date(today.getFullYear(), today.getMonth(), 1 + Math.floor(Math.random() * 28));
    var expiry = shiftYears(issue, 4 + Math.floor(Math.random() * 5));

    var postal = j.postal;
    if (j.country === 'USA') {
      // 9-digit ZIP + 2 trailing spaces, as seen on real US payloads.
      postal = postal.replace(/\D/g, '') + pad(Math.floor(Math.random() * 10000), 4) + '  ';
    } else if (j.country === 'CAN') {
      postal = postal.replace(/\s+/g, '');
    }

    var inches = 60 + Math.floor(Math.random() * 16);       // 5'0" .. 6'3"
    var pounds = 110 + Math.floor(Math.random() * 130);

    var discriminator = '';
    for (var i = 0; i < 20; i++) discriminator += Math.floor(Math.random() * 10);

    return {
      jurisdiction: j,
      cardType: cardType === 'ID' ? 'ID' : 'DL',
      firstName: firstName,
      middleName: pick(MIDDLE_NAMES),
      lastName: pick(LAST_NAMES),
      suffix: '',
      licenceNumber: randomFromPattern(j.licencePattern),
      birthDate: birth,
      issueDate: issue,
      expiryDate: expiry,
      sexCode: sexCode,
      height: pad(inches, 3) + ' in',
      weightLbs: String(pounds),
      eyeColor: pick(EYE_COLORS),
      hairColor: pick(HAIR_COLORS),
      street: pick(STREETS),
      city: j.city,
      postal: postal,
      vehicleClass: defaults.vehicleClass,
      restrictions: defaults.restrictions,
      endorsements: defaults.endorsements,
      documentDiscriminator: discriminator,
      complianceType: 'F'
    };
  }

  /* -----------------------------------------------------------------------
   * Payload assembly
   * --------------------------------------------------------------------- */

  /**
   * Build the AAMVA barcode payload string for a sample record.
   *
   * @param {object} s            record from randomSample() (or a hand-built one)
   * @param {string} aamvaVersion '08' | '09' | '10'
   * @param {string} jurisdictionVersion 2-digit jurisdiction version
   * @returns {string} raw payload, control characters included
   */
  function buildPayload(s, aamvaVersion, jurisdictionVersion) {
    var elements = [];
    function add(code, value) {
      if (value === undefined || value === null || value === '') return;
      elements.push(code + value);
    }

    add('DAQ', s.licenceNumber);
    add('DCS', s.lastName);
    add('DDE', 'N');
    add('DAC', s.firstName);
    add('DDF', 'N');
    add('DAD', s.middleName);
    add('DDG', 'N');
    add('DCU', s.suffix);
    add('DCA', s.vehicleClass);
    add('DCB', s.restrictions);
    add('DCD', s.endorsements);
    add('DBD', mmddyyyy(s.issueDate));
    add('DBB', mmddyyyy(s.birthDate));
    add('DBA', mmddyyyy(s.expiryDate));
    add('DBC', s.sexCode);
    add('DAU', s.height);
    add('DAY', s.eyeColor);
    add('DAZ', s.hairColor);
    add('DAG', s.street);
    add('DAI', s.city);
    add('DAJ', s.jurisdiction.code);
    add('DAK', s.postal);
    add('DCF', s.documentDiscriminator);
    add('DCG', s.jurisdiction.country);
    add('DDA', s.complianceType);
    add('DDB', mmddyyyy(s.issueDate));
    add('DDD', '1');
    add('DAW', s.weightLbs);

    var subfile = s.cardType + elements.join(LF) + CR;

    var entryCount = 1;
    var header = '@' + LF + RS + CR + 'ANSI '
      + s.jurisdiction.iin
      + aamvaVersion
      + jurisdictionVersion
      + pad(entryCount, 2);

    var offset = header.length + 10 * entryCount;
    var designator = s.cardType + pad(offset, 4) + pad(subfile.length, 4);

    return header + designator + subfile;
  }

  /** Human-readable rendering of control characters, for the preview box. */
  function escapePayload(payload) {
    return payload
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n\n')
      .replace(/\x1e/g, '\\x1e');
  }

  global.AamvaGenerator = {
    JURISDICTIONS: JURISDICTIONS,
    VERSIONS: ['10', '09', '08'],
    findJurisdiction: findJurisdiction,
    randomSample: randomSample,
    buildPayload: buildPayload,
    escapePayload: escapePayload,
    mmddyyyy: mmddyyyy
  };
})(window);
