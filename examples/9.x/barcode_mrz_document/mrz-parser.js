function mrzParseLine(line, startIndex, endIndex, isDate = false) {
    let extractedString = line.substring(startIndex, endIndex).replace(/</g, ' ').trim();
    return isDate ? formatDateString(extractedString) : extractedString;
}

function formatDateString(dateString) {
    let currentYear = new Date().getFullYear();
    let century = parseInt(dateString.substr(0, 2)) > currentYear % 100 ? '19' : '20';
    return century + dateString.slice(0, 2) + '-' + dateString.slice(2, 4) + '-' + dateString.slice(4);
}

function extractType(typeChar) {
    if (!/[IPV]/.test(typeChar)) return false;
    switch (typeChar) {
        case 'P': return 'PASSPORT (TD-3)';
        case 'V': return line1.length === 44 ? 'VISA (MRV-A)' : 'VISA (MRV-B)';
        case 'I': return 'ID CARD (TD-2)';
        default: return false;
    }
}

function mrzParseTwoLine(line1, line2) {
    let passportMRZ = {};

    passportMRZ.type = extractType(line1.substring(0, 1));
    if (!passportMRZ.type) return false;

    passportMRZ.nationality = mrzParseLine(line1, 2, 5);
    passportMRZ.surname = mrzParseLine(line1, 5, line1.indexOf("<<"));
    passportMRZ.givenname = mrzParseLine(line1, line1.indexOf("<<") + 2);

    passportMRZ.passportnumber = mrzParseLine(line2, 0, 9);
    passportMRZ.issuecountry = mrzParseLine(line2, 10, 13);
    passportMRZ.birth = mrzParseLine(line2, 13, 19, true);
    passportMRZ.gender = line2[20];
    passportMRZ.expiry = mrzParseLine(line2, 21, 27, true);

    return passportMRZ;
}

function mrzParseThreeLine(line1, line2, line3) {
    let passportMRZ = {};

    passportMRZ.type = extractType(line1.substring(0, 1));
    if (!passportMRZ.type) return false;

    passportMRZ.nationality = mrzParseLine(line2, 15, 18);
    passportMRZ.surname = mrzParseLine(line3, 0, line3.indexOf("<<"));
    passportMRZ.givenname = mrzParseLine(line3, line3.indexOf("<<") + 2);

    passportMRZ.passportnumber = mrzParseLine(line1, 5, 14);
    passportMRZ.issuecountry = mrzParseLine(line1, 2, 5);
    passportMRZ.birth = mrzParseLine(line2, 0, 6, true);
    passportMRZ.gender = line2[7].replace('<', 'X');
    passportMRZ.expiry = mrzParseLine(line2, 8, 14, true);

    return passportMRZ;
}
