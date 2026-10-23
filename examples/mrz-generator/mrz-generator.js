/**
 * Pure JavaScript MRZ Generator
 * Supports TD1, TD2, TD3, MRVA, and MRVB document types
 */

class MRZGenerator {
    /**
     * Calculate check digit for MRZ using the standard algorithm
     * @param {string} data - The string to calculate check digit for
     * @returns {string} - Single digit check character
     */
    static calculateCheckDigit(data) {
        const weights = [7, 3, 1];
        const charValues = {
            '<': 0, '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
            'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15, 'G': 16, 'H': 17, 'I': 18,
            'J': 19, 'K': 20, 'L': 21, 'M': 22, 'N': 23, 'O': 24, 'P': 25, 'Q': 26, 'R': 27,
            'S': 28, 'T': 29, 'U': 30, 'V': 31, 'W': 32, 'X': 33, 'Y': 34, 'Z': 35
        };

        let total = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data[i].toUpperCase();
            const value = charValues[char] !== undefined ? charValues[char] : 0;
            total += value * weights[i % 3];
        }
        return (total % 10).toString();
    }

    /**
     * Pad a string with '<' characters to reach the desired length
     * @param {string} str - String to pad
     * @param {number} length - Desired length
     * @returns {string} - Padded string
     */
    static pad(str, length) {
        str = str || '';
        return (str + '<'.repeat(length)).substring(0, length);
    }

    /**
     * Format names by replacing spaces with '<' and converting to uppercase
     * @param {string} names - Names to format
     * @returns {string} - Formatted names
     */
    static formatNames(names) {
        return names.toUpperCase().replace(/ /g, '<');
    }

    /**
     * Normalize issuing state / nationality codes to the values used in the MRZ.
     * ICAO Doc 9303 uses a few codes that differ from ISO 3166-1 alpha-3,
     * e.g. Germany is encoded as 'D' instead of 'DEU'.
     * @param {string} code - Country code
     * @returns {string} - Normalized code
     */
    static normalizeCountryCode(code) {
        const overrides = { 'DEU': 'D' };
        const upper = (code || '').toUpperCase();
        return overrides[upper] || upper;
    }
}

/**
 * TD3 Code Generator (Passport - 2 lines of 44 characters)
 */
class TD3CodeGenerator extends MRZGenerator {
    constructor(documentType, countryCode, surname, givenNames, documentNumber, nationality, birthDate, sex, expiryDate, optionalData) {
        super();
        this.documentType = documentType.toUpperCase() || 'P';
        this.countryCode = MRZGenerator.normalizeCountryCode(countryCode);
        this.surname = surname.toUpperCase() || '';
        this.givenNames = givenNames.toUpperCase() || '';
        this.documentNumber = documentNumber.toUpperCase() || '';
        this.nationality = MRZGenerator.normalizeCountryCode(nationality);
        this.birthDate = birthDate || '';
        this.sex = sex.toUpperCase() || '';
        this.expiryDate = expiryDate || '';
        this.optionalData = optionalData ? optionalData.toUpperCase() : '';
    }

    generate() {
        // Line 1: Document type (1) + Country code (3) + Names (39)
        const docType = MRZGenerator.pad(this.documentType, 2);
        const country = MRZGenerator.pad(this.countryCode, 3);

        const names = this.surname + '<<' + MRZGenerator.formatNames(this.givenNames);
        const namesField = MRZGenerator.pad(names, 39);

        const line1 = docType + country + namesField;

        // Line 2: Document number (9) + check digit (1) + nationality (3) + birth date (6) + check digit (1) + sex (1) + expiry date (6) + check digit (1) + optional data (14) + check digit (1)
        const docNum = MRZGenerator.pad(this.documentNumber, 9);
        const docNumCheck = MRZGenerator.calculateCheckDigit(docNum);

        const nat = MRZGenerator.pad(this.nationality, 3);
        const birth = MRZGenerator.pad(this.birthDate, 6);
        const birthCheck = MRZGenerator.calculateCheckDigit(birth);

        const sexField = MRZGenerator.pad(this.sex, 1);
        const expiry = MRZGenerator.pad(this.expiryDate, 6);
        const expiryCheck = MRZGenerator.calculateCheckDigit(expiry);

        const optional = MRZGenerator.pad(this.optionalData, 14);

        // Composite check digit: document number, birth date, expiry date and optional
        // data, each followed by its own check digit (ICAO Doc 9303-4)
        const optionalCheck = MRZGenerator.calculateCheckDigit(optional);
        const compositeData = docNum + docNumCheck + birth + birthCheck + expiry + expiryCheck + optional + optionalCheck;
        const compositeCheck = MRZGenerator.calculateCheckDigit(compositeData);

        const line2 = docNum + docNumCheck + nat + birth + birthCheck + sexField + expiry + expiryCheck + optional + optionalCheck + compositeCheck;

        return line1 + '\n' + line2;
    }

    toString() {
        return this.generate();
    }
}

/**
 * TD2 Code Generator (ID Card - 2 lines of 36 characters)
 */
class TD2CodeGenerator extends MRZGenerator {
    constructor(documentType, countryCode, surname, givenNames, documentNumber, nationality, birthDate, sex, expiryDate, optionalData) {
        super();
        this.documentType = documentType.toUpperCase() || 'I';
        this.countryCode = MRZGenerator.normalizeCountryCode(countryCode);
        this.surname = surname.toUpperCase() || '';
        this.givenNames = givenNames.toUpperCase() || '';
        this.documentNumber = documentNumber.toUpperCase() || '';
        this.nationality = MRZGenerator.normalizeCountryCode(nationality);
        this.birthDate = birthDate || '';
        this.sex = sex.toUpperCase() || '';
        this.expiryDate = expiryDate || '';
        this.optionalData = optionalData ? optionalData.toUpperCase() : '';
    }

    generate() {
        // Line 1: Document type (2) + Country code (3) + Names (31)
        const docType = MRZGenerator.pad(this.documentType, 2);
        const country = MRZGenerator.pad(this.countryCode, 3);

        const names = this.surname + '<<' + MRZGenerator.formatNames(this.givenNames);
        const namesField = MRZGenerator.pad(names, 31);

        const line1 = docType + country + namesField;

        // Line 2: Document number (9) + check digit (1) + nationality (3) + birth date (6) + check digit (1) + sex (1) + expiry date (6) + check digit (1) + optional data (7) + check digit (1)
        const docNum = MRZGenerator.pad(this.documentNumber, 9);
        const docNumCheck = MRZGenerator.calculateCheckDigit(docNum);

        const nat = MRZGenerator.pad(this.nationality, 3);
        const birth = MRZGenerator.pad(this.birthDate, 6);
        const birthCheck = MRZGenerator.calculateCheckDigit(birth);

        const sexField = MRZGenerator.pad(this.sex, 1);
        const expiry = MRZGenerator.pad(this.expiryDate, 6);
        const expiryCheck = MRZGenerator.calculateCheckDigit(expiry);

        const optional = MRZGenerator.pad(this.optionalData, 7);
        const optionalCheck = MRZGenerator.calculateCheckDigit(optional);

        const line2 = docNum + docNumCheck + nat + birth + birthCheck + sexField + expiry + expiryCheck + optional + optionalCheck;

        return line1 + '\n' + line2;
    }

    toString() {
        return this.generate();
    }
}

/**
 * TD1 Code Generator (ID Card - 3 lines of 30 characters)
 */
class TD1CodeGenerator extends MRZGenerator {
    constructor(documentType, countryCode, documentNumber, birthDate, sex, expiryDate, nationality, surname, givenNames, optionalData1, optionalData2) {
        super();
        this.documentType = documentType.toUpperCase() || 'I';
        this.countryCode = MRZGenerator.normalizeCountryCode(countryCode);
        this.documentNumber = documentNumber.toUpperCase() || '';
        this.birthDate = birthDate || '';
        this.sex = sex.toUpperCase() || '';
        this.expiryDate = expiryDate || '';
        this.nationality = MRZGenerator.normalizeCountryCode(nationality);
        this.surname = surname.toUpperCase() || '';
        this.givenNames = givenNames.toUpperCase() || '';
        this.optionalData1 = optionalData1 ? optionalData1.toUpperCase() : '';
        this.optionalData2 = optionalData2 ? optionalData2.toUpperCase() : '';
    }

    generate() {
        // Line 1: Document type (2) + Country code (3) + Document number (9) + check digit (1) + optional data (15)
        const docType = MRZGenerator.pad(this.documentType, 2);
        const country = MRZGenerator.pad(this.countryCode, 3);
        const docNum = MRZGenerator.pad(this.documentNumber, 9);
        const docNumCheck = MRZGenerator.calculateCheckDigit(docNum);
        const optional1 = MRZGenerator.pad(this.optionalData1, 15);

        const line1 = docType + country + docNum + docNumCheck + optional1;

        // Line 2: Birth date (6) + check digit (1) + sex (1) + expiry date (6) + check digit (1) + nationality (3) + optional data (11) + check digit (1)
        const birth = MRZGenerator.pad(this.birthDate, 6);
        const birthCheck = MRZGenerator.calculateCheckDigit(birth);
        const sexField = MRZGenerator.pad(this.sex, 1);
        const expiry = MRZGenerator.pad(this.expiryDate, 6);
        const expiryCheck = MRZGenerator.calculateCheckDigit(expiry);
        const nat = MRZGenerator.pad(this.nationality, 3);
        const optional2 = MRZGenerator.pad(this.optionalData2, 11);

        // Composite check digit
        const compositeData = docNum + docNumCheck + optional1 + birth + birthCheck + expiry + expiryCheck + optional2;
        const compositeCheck = MRZGenerator.calculateCheckDigit(compositeData);

        const line2 = birth + birthCheck + sexField + expiry + expiryCheck + nat + optional2 + compositeCheck;

        // Line 3: Names (30)
        const names = this.surname + '<<' + MRZGenerator.formatNames(this.givenNames);
        const namesField = MRZGenerator.pad(names, 30);

        const line3 = namesField;

        return line1 + '\n' + line2 + '\n' + line3;
    }

    toString() {
        return this.generate();
    }
}

/**
 * MRVA Code Generator (Visa Type A - 2 lines of 44 characters)
 */
class MRVACodeGenerator extends MRZGenerator {
    constructor(documentType, countryCode, surname, givenNames, documentNumber, nationality, birthDate, sex, expiryDate, optionalData) {
        super();
        this.documentType = documentType.toUpperCase() || 'V';
        this.countryCode = MRZGenerator.normalizeCountryCode(countryCode);
        this.surname = surname.toUpperCase() || '';
        this.givenNames = givenNames.toUpperCase() || '';
        this.documentNumber = documentNumber.toUpperCase() || '';
        this.nationality = MRZGenerator.normalizeCountryCode(nationality);
        this.birthDate = birthDate || '';
        this.sex = sex.toUpperCase() || '';
        this.expiryDate = expiryDate || '';
        this.optionalData = optionalData ? optionalData.toUpperCase() : '';
    }

    generate() {
        // Line 1: Document type (2) + Country code (3) + Names (39)
        const docType = MRZGenerator.pad(this.documentType, 2);
        const country = MRZGenerator.pad(this.countryCode, 3);

        const names = this.surname + '<<' + MRZGenerator.formatNames(this.givenNames);
        const namesField = MRZGenerator.pad(names, 39);

        const line1 = docType + country + namesField;

        // Line 2: Document number (9) + check digit (1) + nationality (3) + birth date (6) + check digit (1) + sex (1) + expiry date (6) + check digit (1) + optional data (16)
        const docNum = MRZGenerator.pad(this.documentNumber, 9);
        const docNumCheck = MRZGenerator.calculateCheckDigit(docNum);

        const nat = MRZGenerator.pad(this.nationality, 3);
        const birth = MRZGenerator.pad(this.birthDate, 6);
        const birthCheck = MRZGenerator.calculateCheckDigit(birth);

        const sexField = MRZGenerator.pad(this.sex, 1);
        const expiry = MRZGenerator.pad(this.expiryDate, 6);
        const expiryCheck = MRZGenerator.calculateCheckDigit(expiry);

        const optional = MRZGenerator.pad(this.optionalData, 16);

        const line2 = docNum + docNumCheck + nat + birth + birthCheck + sexField + expiry + expiryCheck + optional;

        return line1 + '\n' + line2;
    }

    toString() {
        return this.generate();
    }
}

/**
 * MRVB Code Generator (Visa Type B - 2 lines of 36 characters)
 */
class MRVBCodeGenerator extends MRZGenerator {
    constructor(documentType, countryCode, surname, givenNames, documentNumber, nationality, birthDate, sex, expiryDate, optionalData) {
        super();
        this.documentType = documentType.toUpperCase() || 'V';
        this.countryCode = MRZGenerator.normalizeCountryCode(countryCode);
        this.surname = surname.toUpperCase() || '';
        this.givenNames = givenNames.toUpperCase() || '';
        this.documentNumber = documentNumber.toUpperCase() || '';
        this.nationality = MRZGenerator.normalizeCountryCode(nationality);
        this.birthDate = birthDate || '';
        this.sex = sex.toUpperCase() || '';
        this.expiryDate = expiryDate || '';
        this.optionalData = optionalData ? optionalData.toUpperCase() : '';
    }

    generate() {
        // Line 1: Document type (2) + Country code (3) + Names (31)
        const docType = MRZGenerator.pad(this.documentType, 2);
        const country = MRZGenerator.pad(this.countryCode, 3);

        const names = this.surname + '<<' + MRZGenerator.formatNames(this.givenNames);
        const namesField = MRZGenerator.pad(names, 31);

        const line1 = docType + country + namesField;

        // Line 2: Document number (9) + check digit (1) + nationality (3) + birth date (6) + check digit (1) + sex (1) + expiry date (6) + check digit (1) + optional data (8)
        const docNum = MRZGenerator.pad(this.documentNumber, 9);
        const docNumCheck = MRZGenerator.calculateCheckDigit(docNum);

        const nat = MRZGenerator.pad(this.nationality, 3);
        const birth = MRZGenerator.pad(this.birthDate, 6);
        const birthCheck = MRZGenerator.calculateCheckDigit(birth);

        const sexField = MRZGenerator.pad(this.sex, 1);
        const expiry = MRZGenerator.pad(this.expiryDate, 6);
        const expiryCheck = MRZGenerator.calculateCheckDigit(expiry);

        const optional = MRZGenerator.pad(this.optionalData, 8);

        const line2 = docNum + docNumCheck + nat + birth + birthCheck + sexField + expiry + expiryCheck + optional;

        return line1 + '\n' + line2;
    }

    toString() {
        return this.generate();
    }
}
