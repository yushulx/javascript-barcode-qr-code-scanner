/**
 * Extract structured MRZ information from a Dynamsoft CodeParser result.
 * @param {object} result - Dynamsoft CodeParser parse result
 * @returns {object} Human-readable passport / ID card fields
 */
export function extractMrzInfo(result) {
  const info = {};
  const type = result.getFieldValue('documentCode');

  info['Document Type'] = JSON.parse(result.jsonString).CodeType;
  info['Issuing State'] = result.getFieldValue('issuingState');
  info['Surname'] = result.getFieldValue('primaryIdentifier');
  info['Given Name'] = result.getFieldValue('secondaryIdentifier');
  info['Passport Number'] =
    type === 'P'
      ? result.getFieldValue('passportNumber')
      : result.getFieldValue('documentNumber');
  info['Nationality'] = result.getFieldValue('nationality');
  info['Gender'] = result.getFieldValue('sex');

  // Birth date
  let birthYear = result.getFieldValue('birthYear');
  const birthMonth = result.getFieldValue('birthMonth');
  const birthDay = result.getFieldValue('birthDay');
  birthYear =
    parseInt(birthYear) > new Date().getFullYear() % 100
      ? '19' + birthYear
      : '20' + birthYear;
  info['Date of Birth (YYYY-MM-DD)'] = `${birthYear}-${birthMonth}-${birthDay}`;

  // Expiry date
  let expiryYear = result.getFieldValue('expiryYear');
  const expiryMonth = result.getFieldValue('expiryMonth');
  const expiryDay = result.getFieldValue('expiryDay');
  expiryYear = parseInt(expiryYear) >= 60 ? '19' + expiryYear : '20' + expiryYear;
  info['Date of Expiry (YYYY-MM-DD)'] = `${expiryYear}-${expiryMonth}-${expiryDay}`;

  return info;
}
