import {
  Quadrilateral,
  DeskewedImageResultItem,
  EnumValidationStatus,
  ParsedResultItem,
  OriginalImageResultItem,
  DCEFrame,
} from "dynamsoft-capture-vision-bundle";
import { EnumFlowType, EnumResultStatus, ResultStatus } from "./types";

// =============================================================================
// CONSTANTS AND ENUMS
// =============================================================================

export const DRIVER_LICENSE_CARD_RATIO = 1.588;

export enum EnumDriverLicenseScanMode {
  Image = "image",
  Barcode = "barcode",
}

export enum EnumDriverLicenseScanSide {
  Front = "frontSide",
  Back = "backSide",
}

export enum EnumDriverLicenseScannerViews {
  Scanner = "scanner",
  Result = "scan-result",
  Verify = "scan-verify",
  Correction = "correction",
}

export const DEFAULT_TEMPLATE_NAMES = {
  detect: "DL_detect",
  normalize: "DL_normalize",
  barcode: "DL_barcode",
};

export enum EnumDriverLicenseData {
  // Basic fields
  InvalidFields = "invalidFields",
  LicenseType = "licenseType",
  LicenseNumber = "licenseNumber",

  // Document metadata
  AAMVAVersionNumber = "aamvaVersionNumber",
  IssuerIdentificationNumber = "issuerIdentificationNumber",
  JurisdictionVersionNumber = "jurisdictionVersionNumber",
  DocumentDiscriminator = "documentDiscriminator",
  IssuingCountry = "issuingCountry",
  ComplianceType = "complianceType",

  // Personal information
  FullName = "fullName",
  FirstName = "firstName",
  LastName = "lastName",
  MiddleName = "middleName",
  NamePrefix = "namePrefix",
  NameSuffix = "nameSuffix",
  DateOfBirth = "dateOfBirth",
  Age = "age",
  Sex = "sex",

  // Alternative/Alias information
  NameAlias = "nameAlias",
  FirstNameAlias = "firstNameAlias",
  LastNameAlias = "lastNameAlias",
  MiddleNameAlias = "middleNameAlias",
  PrefixAlias = "prefixAlias",
  SuffixAlias = "suffixAlias",
  AlternativeBirthDate = "alternativeBirthDate",
  AlternativeSocialSecurityNumber = "alternativeSocialSecurityNumber",

  // Physical characteristics
  Height = "height",
  HeightInCentimeters = "heightInCentimeters",
  Weight = "weight",
  WeightInKilograms = "weightInKilograms",
  WeightInPounds = "weightInPounds",
  WeightRange = "weightRange",
  EyeColor = "eyeColor",
  HairColor = "hairColor",
  Race = "race",

  // Address information
  Address = "address",
  Street1 = "street1",
  Street2 = "street2",
  City = "city",
  State = "state",
  PostalCode = "postalCode",

  // Residence address (separate from mailing)
  ResidenceStreet1 = "residenceStreet1",
  ResidenceStreet2 = "residenceStreet2",
  ResidenceCity = "residenceCity",
  ResidenceState = "residenceState",
  ResidencePostalCode = "residencePostalCode",

  // Dates
  ExpiryDate = "expiryDate",
  IssueDate = "issueDate",
  IssueTimestamp = "issueTimestamp",
  CardRevisionDate = "cardRevisionDate",
  HazmatEndorsementExpiryDate = "hazmatEndorsementExpiryDate",
  Under18Until = "under18Until",
  Under19Until = "under19Until",
  Under21Until = "under21Until",

  // Vehicle classification
  VehicleClass = "vehicleClass",
  StandardVehicleClassification = "standardVehicleClassification",
  VehicleCodeDescription = "vehicleCodeDescription",

  // Restrictions and endorsements
  Restrictions = "restrictions",
  RestrictionsCode = "restrictionsCode",
  StandardRestrictionCode = "standardRestrictionCode",
  RestrictionCodeDescription = "restrictionCodeDescription",
  Endorsements = "endorsements",
  EndorsementsCode = "endorsementsCode",
  StandardEndorsementsCode = "standardEndorsementsCode",
  EndorsementsCodeDescription = "endorsementsCodeDescription",

  // Permit information
  PermitClassificationCode = "permitClassificationCode",
  PermitIdentifier = "permitIdentifier",
  PermitExpirationDate = "permitExpirationDate",
  PermitIssuedDate = "permitIssuedDate",
  PermitRestrictionCode = "permitRestrictionCode",
  PermitEndorsementCode = "permitEndorsementCode",

  // Identifiers
  CustomerIdentifier = "customerIdentifier",
  SocialSecurityNumber = "socialSecurityNumber",
  InventoryControlNumber = "inventoryControlNumber",
  NumberOfDuplicates = "numberOfDuplicates",

  // Indicators and flags
  MedicalIndicator = "medicalIndicator",
  OrganDonorIndicator = "organDonorIndicator",
  NonResidentIndicator = "nonResidentIndicator",
  VeteranIndicator = "veteranIndicator",
  LimitedDurationDocumentIndicator = "limitedDurationDocumentIndicator",

  // Federal and commercial
  FederalCommercialVehicleCodes = "federalCommercialVehicleCodes",

  // Truncation indicators
  FamilyNameTruncation = "familyNameTruncation",
  FirstNameTruncation = "firstNameTruncation",
  MiddleNameTruncation = "middleNameTruncation",

  // Additional information
  BirthPlace = "birthPlace",
  AuditInformation = "auditInformation",
  JurisdictionSubfiles = "jurisdictionSubfiles",

  // Magstripe specific fields
  Track1 = "track1",
  Track2 = "track2",
  Track3 = "track3",
  LRCforTrack1 = "LRCforTrack1",
  LRCforTrack2 = "LRCforTrack2",
  LRCforTrack3 = "LRCforTrack3",
  ISOIIN = "ISOIIN",
  DLorID_NumberOverflow = "DLorID_NumberOverflow",
  MagStripeVersion = "magStripeVersion",
  DiscretionaryData1 = "discretionaryData1",
  DiscretionaryData2 = "discretionaryData2",
  SecurityFunction = "securityFunction",

  // South African specific fields
  IdNumber = "idNumber",
  IdNumberType = "idNumberType",
  IdIssuedCountry = "idIssuedCountry",
  Surname = "surname",
  Initials = "initials",
  LicenseIssuedCountry = "licenseIssuedCountry",
  LicenseIssueNumber = "licenseIssueNumber",
  LicenseValidityFrom = "licenseValidityFrom",
  LicenseValidityTo = "licenseValidityTo",
  ProfessionalDrivingPermitExpiryDate = "professionalDrivingPermitExpiryDate",
  ProfessionalDrivingPermitCodes = "professionalDrivingPermitCodes",
  VehicleLicense = "vehicleLicense",
  VehicleCode1 = "vehicleCode1",
  VehicleCode2 = "vehicleCode2",
  VehicleCode3 = "vehicleCode3",
  VehicleCode4 = "vehicleCode4",
  VehicleRestriction1 = "vehicleRestriction1",
  VehicleRestriction2 = "vehicleRestriction2",
  VehicleRestriction3 = "vehicleRestriction3",
  VehicleRestriction4 = "vehicleRestriction4",
  LicenseCodeIssuedDate1 = "licenseCodeIssuedDate1",
  LicenseCodeIssuedDate2 = "licenseCodeIssuedDate2",
  LicenseCodeIssuedDate3 = "licenseCodeIssuedDate3",
  LicenseCodeIssuedDate4 = "licenseCodeIssuedDate4",
}

export enum EnumDriverLicenseType {
  AAMVA_DL_ID = "AAMVA_DL_ID",
  AAMVA_DL_ID_WITH_MAG_STRIPE = "AAMVA_DL_ID_WITH_MAG_STRIPE",
  SOUTH_AFRICA_DL = "SOUTH_AFRICA_DL",
}

export interface DriverLicenseDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface LicenseVerificationStatus {
  isVerified: boolean;
  errorMessage?: string;
}

export interface DriverLicenseData {
  _flowType?: EnumFlowType;
  licenseVerificationStatus?: LicenseVerificationStatus;
  status: ResultStatus;

  // Basic fields
  [EnumDriverLicenseData.InvalidFields]?: EnumDriverLicenseData[];
  [EnumDriverLicenseData.LicenseType]?: EnumDriverLicenseType;
  [EnumDriverLicenseData.LicenseNumber]?: string;

  // Document metadata
  [EnumDriverLicenseData.AAMVAVersionNumber]?: string;
  [EnumDriverLicenseData.IssuerIdentificationNumber]?: string;
  [EnumDriverLicenseData.JurisdictionVersionNumber]?: string;
  [EnumDriverLicenseData.DocumentDiscriminator]?: string;
  [EnumDriverLicenseData.IssuingCountry]?: string;
  [EnumDriverLicenseData.ComplianceType]?: string;

  // Personal information
  [EnumDriverLicenseData.FullName]?: string;
  [EnumDriverLicenseData.FirstName]?: string;
  [EnumDriverLicenseData.LastName]?: string;
  [EnumDriverLicenseData.MiddleName]?: string;
  [EnumDriverLicenseData.NamePrefix]?: string;
  [EnumDriverLicenseData.NameSuffix]?: string;
  [EnumDriverLicenseData.DateOfBirth]?: DriverLicenseDate;
  [EnumDriverLicenseData.Age]?: number;
  [EnumDriverLicenseData.Sex]?: string;

  // Alternative/Alias information
  [EnumDriverLicenseData.NameAlias]?: string;
  [EnumDriverLicenseData.FirstNameAlias]?: string;
  [EnumDriverLicenseData.LastNameAlias]?: string;
  [EnumDriverLicenseData.MiddleNameAlias]?: string;
  [EnumDriverLicenseData.PrefixAlias]?: string;
  [EnumDriverLicenseData.SuffixAlias]?: string;
  [EnumDriverLicenseData.AlternativeBirthDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.AlternativeSocialSecurityNumber]?: string;

  // Physical characteristics
  [EnumDriverLicenseData.Height]?: string;
  [EnumDriverLicenseData.HeightInCentimeters]?: string;
  [EnumDriverLicenseData.Weight]?: string;
  [EnumDriverLicenseData.WeightInKilograms]?: string;
  [EnumDriverLicenseData.WeightInPounds]?: string;
  [EnumDriverLicenseData.WeightRange]?: string;
  [EnumDriverLicenseData.EyeColor]?: string;
  [EnumDriverLicenseData.HairColor]?: string;
  [EnumDriverLicenseData.Race]?: string;

  // Address information
  [EnumDriverLicenseData.Address]?: string;
  [EnumDriverLicenseData.Street1]?: string;
  [EnumDriverLicenseData.Street2]?: string;
  [EnumDriverLicenseData.City]?: string;
  [EnumDriverLicenseData.State]?: string;
  [EnumDriverLicenseData.PostalCode]?: string;

  // Residence address
  [EnumDriverLicenseData.ResidenceStreet1]?: string;
  [EnumDriverLicenseData.ResidenceStreet2]?: string;
  [EnumDriverLicenseData.ResidenceCity]?: string;
  [EnumDriverLicenseData.ResidenceState]?: string;
  [EnumDriverLicenseData.ResidencePostalCode]?: string;

  // Dates
  [EnumDriverLicenseData.ExpiryDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.IssueDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.IssueTimestamp]?: string;
  [EnumDriverLicenseData.CardRevisionDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.HazmatEndorsementExpiryDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.Under18Until]?: DriverLicenseDate;
  [EnumDriverLicenseData.Under19Until]?: DriverLicenseDate;
  [EnumDriverLicenseData.Under21Until]?: DriverLicenseDate;

  // Vehicle classification
  [EnumDriverLicenseData.VehicleClass]?: string;
  [EnumDriverLicenseData.StandardVehicleClassification]?: string;
  [EnumDriverLicenseData.VehicleCodeDescription]?: string;

  // Restrictions and endorsements
  [EnumDriverLicenseData.Restrictions]?: string;
  [EnumDriverLicenseData.RestrictionsCode]?: string;
  [EnumDriverLicenseData.StandardRestrictionCode]?: string;
  [EnumDriverLicenseData.RestrictionCodeDescription]?: string;
  [EnumDriverLicenseData.Endorsements]?: string;
  [EnumDriverLicenseData.EndorsementsCode]?: string;
  [EnumDriverLicenseData.StandardEndorsementsCode]?: string;
  [EnumDriverLicenseData.EndorsementsCodeDescription]?: string;

  // Permit information
  [EnumDriverLicenseData.PermitClassificationCode]?: string;
  [EnumDriverLicenseData.PermitIdentifier]?: string;
  [EnumDriverLicenseData.PermitExpirationDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.PermitIssuedDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.PermitRestrictionCode]?: string;
  [EnumDriverLicenseData.PermitEndorsementCode]?: string;

  // Identifiers
  [EnumDriverLicenseData.CustomerIdentifier]?: string;
  [EnumDriverLicenseData.SocialSecurityNumber]?: string;
  [EnumDriverLicenseData.InventoryControlNumber]?: string;
  [EnumDriverLicenseData.NumberOfDuplicates]?: string;

  // Indicators and flags
  [EnumDriverLicenseData.MedicalIndicator]?: string;
  [EnumDriverLicenseData.OrganDonorIndicator]?: string;
  [EnumDriverLicenseData.NonResidentIndicator]?: string;
  [EnumDriverLicenseData.VeteranIndicator]?: string;
  [EnumDriverLicenseData.LimitedDurationDocumentIndicator]?: string;

  // Federal and commercial
  [EnumDriverLicenseData.FederalCommercialVehicleCodes]?: string;

  // Truncation indicators
  [EnumDriverLicenseData.FamilyNameTruncation]?: string;
  [EnumDriverLicenseData.FirstNameTruncation]?: string;
  [EnumDriverLicenseData.MiddleNameTruncation]?: string;

  // Additional information
  [EnumDriverLicenseData.BirthPlace]?: string;
  [EnumDriverLicenseData.AuditInformation]?: string;
  [EnumDriverLicenseData.JurisdictionSubfiles]?: string;

  // Magstripe specific fields
  [EnumDriverLicenseData.Track1]?: string;
  [EnumDriverLicenseData.Track2]?: string;
  [EnumDriverLicenseData.Track3]?: string;
  [EnumDriverLicenseData.LRCforTrack1]?: string;
  [EnumDriverLicenseData.LRCforTrack2]?: string;
  [EnumDriverLicenseData.LRCforTrack3]?: string;
  [EnumDriverLicenseData.ISOIIN]?: string;
  [EnumDriverLicenseData.DLorID_NumberOverflow]?: string;
  [EnumDriverLicenseData.MagStripeVersion]?: string;
  [EnumDriverLicenseData.DiscretionaryData1]?: string;
  [EnumDriverLicenseData.DiscretionaryData2]?: string;
  [EnumDriverLicenseData.SecurityFunction]?: string;

  // South African specific fields
  [EnumDriverLicenseData.IdNumber]?: string;
  [EnumDriverLicenseData.IdNumberType]?: string;
  [EnumDriverLicenseData.IdIssuedCountry]?: string;
  [EnumDriverLicenseData.Surname]?: string;
  [EnumDriverLicenseData.Initials]?: string;
  [EnumDriverLicenseData.LicenseIssuedCountry]?: string;
  [EnumDriverLicenseData.LicenseIssueNumber]?: string;
  [EnumDriverLicenseData.LicenseValidityFrom]?: DriverLicenseDate;
  [EnumDriverLicenseData.LicenseValidityTo]?: DriverLicenseDate;
  [EnumDriverLicenseData.ProfessionalDrivingPermitExpiryDate]?: DriverLicenseDate;
  [EnumDriverLicenseData.ProfessionalDrivingPermitCodes]?: string;
  [EnumDriverLicenseData.VehicleLicense]?: string;
  [EnumDriverLicenseData.VehicleCode1]?: string;
  [EnumDriverLicenseData.VehicleCode2]?: string;
  [EnumDriverLicenseData.VehicleCode3]?: string;
  [EnumDriverLicenseData.VehicleCode4]?: string;
  [EnumDriverLicenseData.VehicleRestriction1]?: string;
  [EnumDriverLicenseData.VehicleRestriction2]?: string;
  [EnumDriverLicenseData.VehicleRestriction3]?: string;
  [EnumDriverLicenseData.VehicleRestriction4]?: string;
  [EnumDriverLicenseData.LicenseCodeIssuedDate1]?: DriverLicenseDate;
  [EnumDriverLicenseData.LicenseCodeIssuedDate2]?: DriverLicenseDate;
  [EnumDriverLicenseData.LicenseCodeIssuedDate3]?: DriverLicenseDate;
  [EnumDriverLicenseData.LicenseCodeIssuedDate4]?: DriverLicenseDate;
}

export interface DriverLicenseImageResult {
  status: ResultStatus;
  deskewedImageResult?:
  | DeskewedImageResultItem
  | { imageData: OriginalImageResultItem["imageData"]; toBlob: () => Blob };
  originalImageResult?: OriginalImageResultItem["imageData"] | DCEFrame;
  detectedQuadrilateral?: Quadrilateral;
  _flowType?: EnumFlowType;
  imageData?: boolean;
  _imageData?: DeskewedImageResultItem | { imageData: OriginalImageResultItem["imageData"]; toBlob: () => Blob };
}

export interface DriverLicenseFullResult {
  [EnumDriverLicenseScanSide.Front]: DriverLicenseImageResult;
  [EnumDriverLicenseScanSide.Back]: DriverLicenseImageResult;
  licenseData?: DriverLicenseData;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getFieldValue(parsedResult: ParsedResultItem, fieldName: string): string | undefined {
  try {
    return parsedResult.getFieldValue(fieldName) || undefined;
  } catch (error) {
    console.warn(`Failed to get field value for ${fieldName}:`, error);
    return undefined;
  }
}

function isFieldInvalid(parsedResult: ParsedResultItem, fieldName: string): boolean {
  try {
    const status = parsedResult.getFieldValidationStatus(fieldName);
    return status === EnumValidationStatus.VS_FAILED;
  } catch {
    return false;
  }
}

function parseDate(dateString: string, country?: string, isMagstripe?: boolean): DriverLicenseDate {
  if (!dateString?.trim()) {
    return { year: undefined, month: undefined, day: undefined };
  }

  let year: number | undefined, month: number | undefined, day: number | undefined;

  try {
    if (isMagstripe) {
      // Try different magstripe formats based on length and content
      if (dateString.length === 4) {
        // Could be YYMM or MMYY
        const firstTwo = parseInt(dateString.slice(0, 2), 10);
        const lastTwo = parseInt(dateString.slice(2, 4), 10);

        // Try YYMM first (more common in expiration dates)
        if (firstTwo <= 99 && lastTwo >= 1 && lastTwo <= 12) {
          year = firstTwo > 50 ? 1900 + firstTwo : 2000 + firstTwo;
          month = lastTwo;
        }
        // Try MMYY if YYMM doesn't make sense
        else if (firstTwo >= 1 && firstTwo <= 12 && lastTwo <= 99) {
          month = firstTwo;
          year = lastTwo > 50 ? 1900 + lastTwo : 2000 + lastTwo;
        }
      } else if (dateString.length === 6) {
        // Could be YYMMDD or MMDDYY
        const part1 = parseInt(dateString.slice(0, 2), 10);
        const part2 = parseInt(dateString.slice(2, 4), 10);
        const part3 = parseInt(dateString.slice(4, 6), 10);

        // Try YYMMDD first
        if (part1 <= 99 && part2 >= 1 && part2 <= 12 && part3 >= 1 && part3 <= 31) {
          year = part1 > 50 ? 1900 + part1 : 2000 + part1;
          month = part2;
          day = part3;
        }
        // Try MMDDYY
        else if (part1 >= 1 && part1 <= 12 && part2 >= 1 && part2 <= 31 && part3 <= 99) {
          month = part1;
          day = part2;
          year = part3 > 50 ? 1900 + part3 : 2000 + part3;
        }
      } else if (dateString.length === 8) {
        // Could be YYYYMMDD or MMDDYYYY
        const part1 = parseInt(dateString.slice(0, 4), 10);
        const part2 = parseInt(dateString.slice(4, 6), 10);
        const part3 = parseInt(dateString.slice(6, 8), 10);

        // Try YYYYMMDD first
        if (part1 >= 1900 && part1 <= 2100 && part2 >= 1 && part2 <= 12 && part3 >= 1 && part3 <= 31) {
          year = part1;
          month = part2;
          day = part3;
        } else {
          // Try MMDDYYYY
          const yearPart = parseInt(dateString.slice(4, 8), 10);
          if (part1 >= 1 && part1 <= 12 && part2 >= 1 && part2 <= 31 && yearPart >= 1900 && yearPart <= 2100) {
            month = part1;
            day = part2;
            year = yearPart;
          }
        }
      } else if (dateString.length === 2) {
        // Could be just YY or MM
        const value = parseInt(dateString, 10);
        if (value <= 99) {
          // Assume it's a year if > 12, otherwise could be month
          if (value > 12) {
            year = value > 50 ? 1900 + value : 2000 + value;
          } else {
            // Ambiguous - could be month or year, prefer year for expiration dates
            year = value > 50 ? 1900 + value : 2000 + value;
          }
        }
      }

      // If magstripe parsing failed, fall through to standard parsing
      if (!year && !month && !day) {
        isMagstripe = false;
      }
    }

    if (!isMagstripe) {
      if (country === "USA") {
        // US format: MMDDCCYY or variations
        if (dateString.length >= 2) {
          month = parseInt(dateString.slice(0, 2), 10);
        }
        if (dateString.length >= 4) {
          day = parseInt(dateString.slice(2, 4), 10);
        }
        if (dateString.length >= 6) {
          year = parseInt(dateString.slice(4), 10);
          if (year < 100) {
            year = year > 50 ? 1900 + year : 2000 + year;
          }
        }
      } else {
        // Default format: YYYYMMDD or variations
        if (dateString.length >= 4) {
          year = parseInt(dateString.slice(0, 4), 10);
        }
        if (dateString.length >= 6) {
          month = parseInt(dateString.slice(4, 6), 10);
        }
        if (dateString.length >= 8) {
          day = parseInt(dateString.slice(6, 8), 10);
        }

        // Handle delimited formats
        if (dateString.includes("-") || dateString.includes("/")) {
          const parts = dateString.split(/[-\/]/);
          if (parts.length >= 1 && parts[0].length === 4) {
            year = parseInt(parts[0], 10);
          }
          if (parts.length >= 2) {
            month = parseInt(parts[1], 10);
          }
          if (parts.length >= 3) {
            day = parseInt(parts[2], 10);
          }
        }
      }

      // Validate components
      if (year !== undefined && (year < 1900 || year > 2100)) year = undefined;
      if (month !== undefined && (month < 1 || month > 12)) month = undefined;
      if (day !== undefined && (day < 1 || day > 31)) day = undefined;

      return { year, month, day };
    }
  } catch {
    return { year: undefined, month: undefined, day: undefined };
  }
}

function safeParseDateField(
  dateString: string | undefined,
  country?: string,
  invalidFields?: EnumDriverLicenseData[],
  fieldType?: EnumDriverLicenseData,
  isMagstripe?: boolean
): DriverLicenseDate | undefined {
  if (!dateString) {
    return { year: undefined, month: undefined, day: undefined };
  }

  try {
    const parsedDate = parseDate(dateString, country, isMagstripe);

    // Consider a date invalid only if we couldn't parse any component
    if (!parsedDate.year && !parsedDate.month && !parsedDate.day) {
      if (invalidFields && fieldType) {
        invalidFields.push(fieldType);
      }
      return { year: undefined, month: undefined, day: undefined };
    }

    return parsedDate;
  } catch (e) {
    console.warn(`Failed to parse date field ${fieldType}:`, e);
    if (invalidFields && fieldType) {
      invalidFields.push(fieldType);
    }
    return { year: undefined, month: undefined, day: undefined };
  }
}

function parseMagstripeDate(
  combinedDate: string | undefined,
  yearComponent: string | undefined,
  monthComponent: string | undefined,
  dayComponent: string | undefined,
  invalidFields?: EnumDriverLicenseData[],
  fieldType?: EnumDriverLicenseData
): DriverLicenseDate | undefined {
  // Strategy 1: Use individual components if available (most reliable)
  if (yearComponent || monthComponent || dayComponent) {
    const result = constructDateFromComponents(yearComponent, monthComponent, dayComponent);
    if (result && (result.year || result.month || result.day)) {
      return result;
    }
  }

  // Strategy 2: Parse combined string with magstripe-specific logic
  if (combinedDate?.trim()) {
    const magstripeResult = safeParseDateField(combinedDate, "USA", invalidFields, fieldType, true);
    if (magstripeResult && (magstripeResult.year || magstripeResult.month || magstripeResult.day)) {
      return magstripeResult;
    }

    // Strategy 3: Try standard USA date parsing as fallback
    const usaResult = safeParseDateField(combinedDate, "USA", invalidFields, fieldType, false);
    if (usaResult && (usaResult.year || usaResult.month || usaResult.day)) {
      return usaResult;
    }

    // Strategy 4: Try default date parsing as last resort
    const defaultResult = safeParseDateField(combinedDate, undefined, invalidFields, fieldType, false);
    if (defaultResult && (defaultResult.year || defaultResult.month || defaultResult.day)) {
      return defaultResult;
    }
  }

  return { year: undefined, month: undefined, day: undefined };
}

function constructDateFromComponents(year?: string, month?: string, day?: string): DriverLicenseDate | undefined {
  if (!year && !month && !day) return undefined;

  const parsedYear = year ? parseInt(year, 10) : undefined;
  const parsedMonth = month ? parseInt(month, 10) : undefined;
  const parsedDay = day ? parseInt(day, 10) : undefined;

  let adjustedYear = parsedYear;
  if (parsedYear && parsedYear < 100) {
    adjustedYear = parsedYear > 50 ? 1900 + parsedYear : 2000 + parsedYear;
  }

  return {
    year: adjustedYear,
    month: parsedMonth,
    day: parsedDay,
  };
}

function calculateAge(birthDate: DriverLicenseDate): number {
  if (!birthDate.year) return 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let age = currentYear - birthDate.year;

  if (birthDate.month) {
    if (currentMonth < birthDate.month) {
      age--;
    } else if (currentMonth === birthDate.month && birthDate.day) {
      if (currentDay < birthDate.day) {
        age--;
      }
    } else if (currentMonth === birthDate.month && !birthDate.day) {
      age--;
    }
  }

  return Math.max(age, 0);
}

function isValidPartialDate(date: DriverLicenseDate): boolean {
  if (!date) return false;

  const hasValidYear = date.year && date.year >= 1900 && date.year <= 2100;
  const hasValidMonth = date.month && date.month >= 1 && date.month <= 12;
  const hasValidDay = date.day && date.day >= 1 && date.day <= 31;

  return !!(hasValidYear || hasValidMonth || hasValidDay);
}

function buildFullName(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ") || "N/A";
}

function buildAddress(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(", ") || "N/A";
}

function createBaseResult(): Partial<DriverLicenseData> {
  return {
    status: {
      code: EnumResultStatus.RS_SUCCESS,
      message: "Success",
    },
  };
}

// =============================================================================
// AAMVA STANDARD PROCESSOR (ENHANCED WITH ALL FIELDS)
// =============================================================================

function processAAMVAStandard(parsedResult: ParsedResultItem): DriverLicenseData {
  const invalidFields: EnumDriverLicenseData[] = [];

  // Document metadata
  const aamvaVersionNumber = getFieldValue(parsedResult, "AAMVAVersionNumber");
  const issuerIdentificationNumber = getFieldValue(parsedResult, "issuerIdentificationNumber");
  const jurisdictionVersionNumber = getFieldValue(parsedResult, "jurisdictionVersionNumber");
  const licenseNumber = getFieldValue(parsedResult, "licenseNumber");
  const issuingCountry = getFieldValue(parsedResult, "issuingCountry") || getFieldValue(parsedResult, "issuingState");
  const documentDiscriminator = getFieldValue(parsedResult, "documentDiscriminator");
  const complianceType = getFieldValue(parsedResult, "complianceType");

  // Personal information
  const firstName = getFieldValue(parsedResult, "firstName") || getFieldValue(parsedResult, "givenName");
  const lastName = getFieldValue(parsedResult, "lastName") || getFieldValue(parsedResult, "familyName");
  const middleName = getFieldValue(parsedResult, "middleName") || getFieldValue(parsedResult, "middleInitial");
  const fullName = getFieldValue(parsedResult, "fullName");
  const prefix = getFieldValue(parsedResult, "prefix") || getFieldValue(parsedResult, "namePrefix");
  const suffix = getFieldValue(parsedResult, "suffix") || getFieldValue(parsedResult, "nameSuffix");
  const sex = getFieldValue(parsedResult, "sex") || getFieldValue(parsedResult, "gender");

  // Alternative/Alias information
  const nameAlias = getFieldValue(parsedResult, "nameAlias");
  const firstNameAlias = getFieldValue(parsedResult, "firstNameAlias") || getFieldValue(parsedResult, "givenNameAlias");
  const lastNameAlias = getFieldValue(parsedResult, "lastNameAlias");
  const middleNameAlias = getFieldValue(parsedResult, "middleNameAlias");
  const prefixAlias = getFieldValue(parsedResult, "prefixAlias");
  const suffixAlias = getFieldValue(parsedResult, "suffixAlias");
  const alternativeBirthDateRaw = getFieldValue(parsedResult, "alternativeBirthDate");
  const alternativeSocialSecurityNumber = getFieldValue(parsedResult, "alternativeSocialSecurityNumber");

  // Dates
  const birthDateRaw = getFieldValue(parsedResult, "birthDate") || getFieldValue(parsedResult, "dateOfBirth");
  const expiryDateRaw = getFieldValue(parsedResult, "expirationDate") || getFieldValue(parsedResult, "expiryDate");
  const issueDateRaw = getFieldValue(parsedResult, "issuedDate") || getFieldValue(parsedResult, "issueDate");
  const issueTimestamp = getFieldValue(parsedResult, "issueTimestamp");
  const cardRevisionDateRaw = getFieldValue(parsedResult, "cardRevisionDate");
  const hazmatEndorsementExpiryDateRaw = getFieldValue(parsedResult, "hazmatEndorsementExpirationDate");
  const under18UntilRaw = getFieldValue(parsedResult, "under18Until");
  const under19UntilRaw = getFieldValue(parsedResult, "under19Until");
  const under21UntilRaw = getFieldValue(parsedResult, "under21Until");

  // Parse dates
  const dateOfBirth = safeParseDateField(
    birthDateRaw,
    issuingCountry,
    invalidFields,
    EnumDriverLicenseData.DateOfBirth,
    false
  );
  const expiryDate = safeParseDateField(
    expiryDateRaw,
    issuingCountry,
    invalidFields,
    EnumDriverLicenseData.ExpiryDate,
    false
  );
  const issueDate = safeParseDateField(
    issueDateRaw,
    issuingCountry,
    invalidFields,
    EnumDriverLicenseData.IssueDate,
    false
  );
  const alternativeBirthDate = safeParseDateField(alternativeBirthDateRaw, issuingCountry);
  const cardRevisionDate = safeParseDateField(cardRevisionDateRaw, issuingCountry);
  const hazmatEndorsementExpiryDate = safeParseDateField(hazmatEndorsementExpiryDateRaw, issuingCountry);
  const under18Until = safeParseDateField(under18UntilRaw, issuingCountry);
  const under19Until = safeParseDateField(under19UntilRaw, issuingCountry);
  const under21Until = safeParseDateField(under21UntilRaw, issuingCountry);

  // Physical characteristics
  const height = getFieldValue(parsedResult, "height");
  const heightInCentimeters = getFieldValue(parsedResult, "heightInCentimeters");
  const weight = getFieldValue(parsedResult, "weight");
  const weightInKilograms = getFieldValue(parsedResult, "weightInKilograms");
  const weightInPounds = getFieldValue(parsedResult, "weightInPounds");
  const weightRange = getFieldValue(parsedResult, "weightRange");
  const eyeColor = getFieldValue(parsedResult, "eyeColor");
  const hairColor = getFieldValue(parsedResult, "hairColor");
  const race = getFieldValue(parsedResult, "race");

  // Address information
  const street1 = getFieldValue(parsedResult, "street_1") || getFieldValue(parsedResult, "addressLine1");
  const street2 = getFieldValue(parsedResult, "street_2") || getFieldValue(parsedResult, "addressLine2");
  const city = getFieldValue(parsedResult, "city");
  const state = getFieldValue(parsedResult, "jurisdictionCode") || getFieldValue(parsedResult, "stateOrProvince");
  const postalCode = getFieldValue(parsedResult, "postalCode") || getFieldValue(parsedResult, "zipCode");

  // Residence address (separate from mailing address)
  const residenceStreet1 = getFieldValue(parsedResult, "residenceStreet_1");
  const residenceStreet2 = getFieldValue(parsedResult, "residenceStreet_2");
  const residenceCity = getFieldValue(parsedResult, "residenceCity");
  const residenceState = getFieldValue(parsedResult, "residenceJurisdictionCode");
  const residencePostalCode = getFieldValue(parsedResult, "residencePostalCode");

  // Vehicle classification
  const vehicleClass = getFieldValue(parsedResult, "vehicleClass");
  const standardVehicleClassification = getFieldValue(parsedResult, "standardVehicleClassification");
  const vehicleCodeDescription = getFieldValue(parsedResult, "vehicleCodeDescription");

  // Restrictions and endorsements
  const restrictionCode = getFieldValue(parsedResult, "restrictionCode");
  const standardRestrictionCode = getFieldValue(parsedResult, "standardRestrictionCode");
  const restrictionCodeDescription = getFieldValue(parsedResult, "restrictionCodeDescription");
  const endorsementsCode = getFieldValue(parsedResult, "endorsementsCode");
  const standardEndorsementsCode = getFieldValue(parsedResult, "standardEndorsementsCode");
  const endorsementsCodeDescription = getFieldValue(parsedResult, "endorsementsCodeDescription");

  // Permit information
  const permitClassificationCode = getFieldValue(parsedResult, "permitClassificationCode");
  const permitIdentifier = getFieldValue(parsedResult, "permitIdentifier");
  const permitExpirationDateRaw = getFieldValue(parsedResult, "permitExpirationDate");
  const permitIssuedDateRaw = getFieldValue(parsedResult, "permitIssuedDate");
  const permitRestrictionCode = getFieldValue(parsedResult, "permitRestrictionCode");
  const permitEndorsementCode = getFieldValue(parsedResult, "permitEndorsementCode");

  const permitExpirationDate = safeParseDateField(permitExpirationDateRaw, issuingCountry);
  const permitIssuedDate = safeParseDateField(permitIssuedDateRaw, issuingCountry);

  // Identifiers
  const customerIdentifier = getFieldValue(parsedResult, "customerIdentifier");
  const socialSecurityNumber = getFieldValue(parsedResult, "socialSecurityNumber");
  const inventoryControlNumber = getFieldValue(parsedResult, "inventoryControlNumber");
  const numberOfDuplicates = getFieldValue(parsedResult, "numberOfDuplicates");

  // Indicators and flags
  const medicalIndicator = getFieldValue(parsedResult, "medicalIndicator");
  const organDonorIndicator = getFieldValue(parsedResult, "organDonorIndicator");
  const nonResidentIndicator = getFieldValue(parsedResult, "nonResidentIndicator");
  const veteranIndicator = getFieldValue(parsedResult, "veteranIndicator");
  const limitedDurationDocumentIndicator = getFieldValue(parsedResult, "limitedDurationDocumentIndicator");

  // Federal and commercial
  const federalCommercialVehicleCodes = getFieldValue(parsedResult, "federalCommercialVehicleCodes");

  // Truncation indicators
  const familyNameTruncation = getFieldValue(parsedResult, "familyNameTruncation");
  const firstNameTruncation = getFieldValue(parsedResult, "firstNameTruncation");
  const middleNameTruncation = getFieldValue(parsedResult, "middleNameTruncation");

  // Additional information
  const birthPlace = getFieldValue(parsedResult, "birthPlace");
  const auditInformation =
    getFieldValue(parsedResult, "auditInfomation") || getFieldValue(parsedResult, "auditInformation"); // Handle typo in spec
  const jurisdictionSubfiles = getFieldValue(parsedResult, "jurisdictionSubfiles");

  // Calculate age
  const age = dateOfBirth && isValidPartialDate(dateOfBirth) ? calculateAge(dateOfBirth) : 0;

  // Check field validation for critical fields
  const fieldValidationMappings: Record<any, string[]> = {
    [EnumDriverLicenseData.LicenseNumber]: ["licenseNumber"],
    [EnumDriverLicenseData.FirstName]: ["firstName", "givenName"],
    [EnumDriverLicenseData.LastName]: ["lastName", "familyName"],
    [EnumDriverLicenseData.Sex]: ["sex", "gender"],
  };

  Object.entries(fieldValidationMappings).forEach(([enumKey, fieldNames]) => {
    const hasInvalidField = fieldNames.some((fieldName) => isFieldInvalid(parsedResult, fieldName));
    if (hasInvalidField) {
      invalidFields.push(enumKey as EnumDriverLicenseData);
    }
  });

  // Build comprehensive result
  return {
    ...createBaseResult(),
    [EnumDriverLicenseData.InvalidFields]: invalidFields,
    [EnumDriverLicenseData.LicenseType]: EnumDriverLicenseType.AAMVA_DL_ID,

    // Basic fields
    [EnumDriverLicenseData.LicenseNumber]: licenseNumber || "N/A",

    // Document metadata
    [EnumDriverLicenseData.AAMVAVersionNumber]: aamvaVersionNumber,
    [EnumDriverLicenseData.IssuerIdentificationNumber]: issuerIdentificationNumber,
    [EnumDriverLicenseData.JurisdictionVersionNumber]: jurisdictionVersionNumber,
    [EnumDriverLicenseData.DocumentDiscriminator]: documentDiscriminator,
    [EnumDriverLicenseData.IssuingCountry]: issuingCountry,
    [EnumDriverLicenseData.ComplianceType]: complianceType,

    // Personal information
    [EnumDriverLicenseData.FullName]: fullName || buildFullName(prefix, firstName, middleName, lastName, suffix),
    [EnumDriverLicenseData.FirstName]: firstName || "",
    [EnumDriverLicenseData.LastName]: lastName || "",
    [EnumDriverLicenseData.MiddleName]: middleName,
    [EnumDriverLicenseData.NamePrefix]: prefix,
    [EnumDriverLicenseData.NameSuffix]: suffix,
    [EnumDriverLicenseData.DateOfBirth]: dateOfBirth,
    [EnumDriverLicenseData.Age]: age,
    [EnumDriverLicenseData.Sex]: sex || "N/A",

    // Alternative/Alias information
    [EnumDriverLicenseData.NameAlias]: nameAlias,
    [EnumDriverLicenseData.FirstNameAlias]: firstNameAlias,
    [EnumDriverLicenseData.LastNameAlias]: lastNameAlias,
    [EnumDriverLicenseData.MiddleNameAlias]: middleNameAlias,
    [EnumDriverLicenseData.PrefixAlias]: prefixAlias,
    [EnumDriverLicenseData.SuffixAlias]: suffixAlias,
    [EnumDriverLicenseData.AlternativeBirthDate]: alternativeBirthDate,
    [EnumDriverLicenseData.AlternativeSocialSecurityNumber]: alternativeSocialSecurityNumber,

    // Physical characteristics
    [EnumDriverLicenseData.Height]: height,
    [EnumDriverLicenseData.HeightInCentimeters]: heightInCentimeters,
    [EnumDriverLicenseData.Weight]: weight,
    [EnumDriverLicenseData.WeightInKilograms]: weightInKilograms,
    [EnumDriverLicenseData.WeightInPounds]: weightInPounds,
    [EnumDriverLicenseData.WeightRange]: weightRange,
    [EnumDriverLicenseData.EyeColor]: eyeColor,
    [EnumDriverLicenseData.HairColor]: hairColor,
    [EnumDriverLicenseData.Race]: race,

    // Address information
    [EnumDriverLicenseData.Address]: buildAddress(street1, street2, city, state, postalCode),
    [EnumDriverLicenseData.Street1]: street1,
    [EnumDriverLicenseData.Street2]: street2,
    [EnumDriverLicenseData.City]: city,
    [EnumDriverLicenseData.State]: state,
    [EnumDriverLicenseData.PostalCode]: postalCode,

    // Residence address
    [EnumDriverLicenseData.ResidenceStreet1]: residenceStreet1,
    [EnumDriverLicenseData.ResidenceStreet2]: residenceStreet2,
    [EnumDriverLicenseData.ResidenceCity]: residenceCity,
    [EnumDriverLicenseData.ResidenceState]: residenceState,
    [EnumDriverLicenseData.ResidencePostalCode]: residencePostalCode,

    // Dates
    [EnumDriverLicenseData.ExpiryDate]: expiryDate,
    [EnumDriverLicenseData.IssueDate]: issueDate,
    [EnumDriverLicenseData.IssueTimestamp]: issueTimestamp,
    [EnumDriverLicenseData.CardRevisionDate]: cardRevisionDate,
    [EnumDriverLicenseData.HazmatEndorsementExpiryDate]: hazmatEndorsementExpiryDate,
    [EnumDriverLicenseData.Under18Until]: under18Until,
    [EnumDriverLicenseData.Under19Until]: under19Until,
    [EnumDriverLicenseData.Under21Until]: under21Until,

    // Vehicle classification
    [EnumDriverLicenseData.VehicleClass]: vehicleClass || standardVehicleClassification,
    [EnumDriverLicenseData.StandardVehicleClassification]: standardVehicleClassification,
    [EnumDriverLicenseData.VehicleCodeDescription]: vehicleCodeDescription,

    // Restrictions and endorsements
    [EnumDriverLicenseData.Restrictions]: restrictionCode,
    [EnumDriverLicenseData.RestrictionsCode]: restrictionCode,
    [EnumDriverLicenseData.StandardRestrictionCode]: standardRestrictionCode,
    [EnumDriverLicenseData.RestrictionCodeDescription]: restrictionCodeDescription,
    [EnumDriverLicenseData.Endorsements]: endorsementsCode,
    [EnumDriverLicenseData.EndorsementsCode]: endorsementsCode,
    [EnumDriverLicenseData.StandardEndorsementsCode]: standardEndorsementsCode,
    [EnumDriverLicenseData.EndorsementsCodeDescription]: endorsementsCodeDescription,

    // Permit information
    [EnumDriverLicenseData.PermitClassificationCode]: permitClassificationCode,
    [EnumDriverLicenseData.PermitIdentifier]: permitIdentifier,
    [EnumDriverLicenseData.PermitExpirationDate]: permitExpirationDate,
    [EnumDriverLicenseData.PermitIssuedDate]: permitIssuedDate,
    [EnumDriverLicenseData.PermitRestrictionCode]: permitRestrictionCode,
    [EnumDriverLicenseData.PermitEndorsementCode]: permitEndorsementCode,

    // Identifiers
    [EnumDriverLicenseData.CustomerIdentifier]: customerIdentifier,
    [EnumDriverLicenseData.SocialSecurityNumber]: socialSecurityNumber,
    [EnumDriverLicenseData.InventoryControlNumber]: inventoryControlNumber,
    [EnumDriverLicenseData.NumberOfDuplicates]: numberOfDuplicates,

    // Indicators and flags
    [EnumDriverLicenseData.MedicalIndicator]: medicalIndicator,
    [EnumDriverLicenseData.OrganDonorIndicator]: organDonorIndicator,
    [EnumDriverLicenseData.NonResidentIndicator]: nonResidentIndicator,
    [EnumDriverLicenseData.VeteranIndicator]: veteranIndicator,
    [EnumDriverLicenseData.LimitedDurationDocumentIndicator]: limitedDurationDocumentIndicator,

    // Federal and commercial
    [EnumDriverLicenseData.FederalCommercialVehicleCodes]: federalCommercialVehicleCodes,

    // Truncation indicators
    [EnumDriverLicenseData.FamilyNameTruncation]: familyNameTruncation,
    [EnumDriverLicenseData.FirstNameTruncation]: firstNameTruncation,
    [EnumDriverLicenseData.MiddleNameTruncation]: middleNameTruncation,

    // Additional information
    [EnumDriverLicenseData.BirthPlace]: birthPlace,
    [EnumDriverLicenseData.AuditInformation]: auditInformation,
    [EnumDriverLicenseData.JurisdictionSubfiles]: jurisdictionSubfiles,
  } as DriverLicenseData;
}

// =============================================================================
// AAMVA MAG STRIPE PROCESSOR (WITH ALL FIELDS)
// =============================================================================

function processAAMVAMagStripe(parsedResult: ParsedResultItem): DriverLicenseData {
  const invalidFields: EnumDriverLicenseData[] = [];

  // Basic info
  const licenseNumber = getFieldValue(parsedResult, "DLorID_Number") || getFieldValue(parsedResult, "licenseNumber");
  const documentDiscriminator = getFieldValue(parsedResult, "documentDiscriminator");

  // Personal info
  const fullName = getFieldValue(parsedResult, "name");
  const sex = getFieldValue(parsedResult, "sex") || getFieldValue(parsedResult, "gender");

  // Date components (mag stripe often has separate components)
  const birthDateRaw = getFieldValue(parsedResult, "birthDate");
  const birthYear = getFieldValue(parsedResult, "birthYear");
  const birthMonth = getFieldValue(parsedResult, "birthMonth");
  const birthDay = getFieldValue(parsedResult, "birthDay");

  const expirationDateRaw = getFieldValue(parsedResult, "expirationDate");
  const expirationYear = getFieldValue(parsedResult, "expirationYear");
  const expirationMonth = getFieldValue(parsedResult, "expirationMonth");

  // Physical characteristics
  const height = getFieldValue(parsedResult, "height");
  const weight = getFieldValue(parsedResult, "weight");
  const eyeColor = getFieldValue(parsedResult, "eyeColor");
  const hairColor = getFieldValue(parsedResult, "hairColor");

  // Address
  const address = getFieldValue(parsedResult, "address");
  const city = getFieldValue(parsedResult, "city");
  const stateOrProvince = getFieldValue(parsedResult, "stateOrProvince");
  const postalCode = getFieldValue(parsedResult, "postalCode");
  const issuingCountry = getFieldValue(parsedResult, "issuingCountry") || getFieldValue(parsedResult, "issuingState");

  // Vehicle info
  const vehicleClass = getFieldValue(parsedResult, "class");
  const restrictions = getFieldValue(parsedResult, "restrictions");
  const endorsements = getFieldValue(parsedResult, "endorsements");

  // Track information
  const track1 = getFieldValue(parsedResult, "track1");
  const track2 = getFieldValue(parsedResult, "track2");
  const track3 = getFieldValue(parsedResult, "track3");
  const LRCforTrack1 = getFieldValue(parsedResult, "LRCforTrack1");
  const LRCforTrack2 = getFieldValue(parsedResult, "LRCforTrack2");
  const LRCforTrack3 = getFieldValue(parsedResult, "LRCforTrack3");

  // Additional mag stripe specific fields
  const ISOIIN = getFieldValue(parsedResult, "ISOIIN");
  const DLorID_NumberOverflow = getFieldValue(parsedResult, "DLorID_NumberOverflow");
  const magStripeVersion = getFieldValue(parsedResult, "magStripeVersion");
  const jurisdictionVersion = getFieldValue(parsedResult, "jurisdictionVersion");
  const discretionaryData1 = getFieldValue(parsedResult, "discretionaryData1");
  const discretionaryData2 = getFieldValue(parsedResult, "discretionaryData2");
  const securityFunction = getFieldValue(parsedResult, "securityFunction");

  // Parse dates - use helper function for magstripe date handling
  const dateOfBirth = parseMagstripeDate(
    birthDateRaw,
    birthYear,
    birthMonth,
    birthDay,
    invalidFields,
    EnumDriverLicenseData.DateOfBirth
  );
  const expiryDate = parseMagstripeDate(
    expirationDateRaw,
    expirationYear,
    expirationMonth,
    undefined,
    invalidFields,
    EnumDriverLicenseData.ExpiryDate
  );

  // Parse combined address if individual fields not available
  let parsedCity = city;
  let parsedState = stateOrProvince;

  if (!parsedCity && address) {
    const addressParts = address.split(",").map((part) => part.trim());
    if (addressParts.length >= 2) {
      parsedCity = addressParts[addressParts.length - 2];
      parsedState = addressParts[addressParts.length - 1];
    }
  }

  // Calculate age
  const age = dateOfBirth && isValidPartialDate(dateOfBirth) ? calculateAge(dateOfBirth) : 0;

  // Check field validation
  const fieldValidationMappings: Record<any, string[]> = {
    [EnumDriverLicenseData.LicenseNumber]: ["DLorID_Number", "licenseNumber"],
    [EnumDriverLicenseData.FullName]: ["name"],
    [EnumDriverLicenseData.Sex]: ["sex", "gender"],
  };

  Object.entries(fieldValidationMappings).forEach(([enumKey, fieldNames]) => {
    const hasInvalidField = fieldNames.some((fieldName) => isFieldInvalid(parsedResult, fieldName));
    if (hasInvalidField) {
      invalidFields.push(enumKey as EnumDriverLicenseData);
    }
  });

  // Build result
  return {
    ...createBaseResult(),
    [EnumDriverLicenseData.InvalidFields]: invalidFields,
    [EnumDriverLicenseData.LicenseType]: EnumDriverLicenseType.AAMVA_DL_ID_WITH_MAG_STRIPE,
    [EnumDriverLicenseData.LicenseNumber]: licenseNumber || "N/A",
    [EnumDriverLicenseData.FullName]: fullName || "N/A",
    [EnumDriverLicenseData.FirstName]: "",
    [EnumDriverLicenseData.LastName]: "",
    [EnumDriverLicenseData.MiddleName]: undefined,
    [EnumDriverLicenseData.DateOfBirth]: dateOfBirth,
    [EnumDriverLicenseData.ExpiryDate]: expiryDate,
    [EnumDriverLicenseData.IssueDate]: undefined,
    [EnumDriverLicenseData.Age]: age,
    [EnumDriverLicenseData.Sex]: sex || "N/A",
    [EnumDriverLicenseData.Height]: height,
    [EnumDriverLicenseData.Weight]: weight,
    [EnumDriverLicenseData.EyeColor]: eyeColor,
    [EnumDriverLicenseData.HairColor]: hairColor,
    [EnumDriverLicenseData.Address]: address || "N/A",
    [EnumDriverLicenseData.City]: parsedCity,
    [EnumDriverLicenseData.State]: parsedState,
    [EnumDriverLicenseData.PostalCode]: postalCode,
    [EnumDriverLicenseData.VehicleClass]: vehicleClass,
    [EnumDriverLicenseData.Restrictions]: restrictions,
    [EnumDriverLicenseData.Endorsements]: endorsements,
    [EnumDriverLicenseData.IssuingCountry]: issuingCountry,
    [EnumDriverLicenseData.DocumentDiscriminator]: documentDiscriminator,

    // Magstripe specific fields
    [EnumDriverLicenseData.Track1]: track1,
    [EnumDriverLicenseData.Track2]: track2,
    [EnumDriverLicenseData.Track3]: track3,
    [EnumDriverLicenseData.LRCforTrack1]: LRCforTrack1,
    [EnumDriverLicenseData.LRCforTrack2]: LRCforTrack2,
    [EnumDriverLicenseData.LRCforTrack3]: LRCforTrack3,
    [EnumDriverLicenseData.ISOIIN]: ISOIIN,
    [EnumDriverLicenseData.DLorID_NumberOverflow]: DLorID_NumberOverflow,
    [EnumDriverLicenseData.MagStripeVersion]: magStripeVersion,
    [EnumDriverLicenseData.DiscretionaryData1]: discretionaryData1,
    [EnumDriverLicenseData.DiscretionaryData2]: discretionaryData2,
    [EnumDriverLicenseData.SecurityFunction]: securityFunction,
  } as DriverLicenseData;
}

// =============================================================================
// SOUTH AFRICA PROCESSOR
// =============================================================================

function processSouthAfricanDL(parsedResult: ParsedResultItem): DriverLicenseData {
  const invalidFields: EnumDriverLicenseData[] = [];

  // Basic info
  const licenseNumber = getFieldValue(parsedResult, "licenseNumber");
  const issuingCountry = getFieldValue(parsedResult, "licenseIssuedCountry") || "ZA";
  const idNumber = getFieldValue(parsedResult, "idNumber");

  // South African specific ID fields
  const idNumberType = getFieldValue(parsedResult, "idNumberType");
  const idIssuedCountry = getFieldValue(parsedResult, "idIssuedCountry");
  const licenseIssuedCountry = getFieldValue(parsedResult, "licenseIssuedCountry");
  const licenseIssueNumber = getFieldValue(parsedResult, "licenseIssueNumber");

  // Personal info - South African format
  const surname = getFieldValue(parsedResult, "surname");
  const initials = getFieldValue(parsedResult, "initials");
  const sex = getFieldValue(parsedResult, "gender");

  // Dates
  const birthDateRaw = getFieldValue(parsedResult, "birthDate");
  const licenseValidityFromRaw = getFieldValue(parsedResult, "licenseValidityFrom");
  const licenseValidityToRaw = getFieldValue(parsedResult, "licenseValidityTo");
  const professionalDrivingPermitExpiryDateRaw = getFieldValue(parsedResult, "professionalDrivingPermitExpiryDate");

  const dateOfBirth = safeParseDateField(
    birthDateRaw,
    issuingCountry,
    invalidFields,
    EnumDriverLicenseData.DateOfBirth
  );
  const licenseValidityFrom = safeParseDateField(licenseValidityFromRaw, issuingCountry);
  const licenseValidityTo = safeParseDateField(licenseValidityToRaw, issuingCountry);
  const professionalDrivingPermitExpiryDate = safeParseDateField(
    professionalDrivingPermitExpiryDateRaw,
    issuingCountry
  );

  // Vehicle codes and restrictions (4 categories each)
  const vehicleCode1 = getFieldValue(parsedResult, "vehicleCode_1") || getFieldValue(parsedResult, "vehicleCode1");
  const vehicleCode2 = getFieldValue(parsedResult, "vehicleCode_2") || getFieldValue(parsedResult, "vehicleCode2");
  const vehicleCode3 = getFieldValue(parsedResult, "vehicleCode_3") || getFieldValue(parsedResult, "vehicleCode3");
  const vehicleCode4 = getFieldValue(parsedResult, "vehicleCode_4") || getFieldValue(parsedResult, "vehicleCode4");

  const vehicleRestriction1 =
    getFieldValue(parsedResult, "vehicleRestriction_1") || getFieldValue(parsedResult, "vehicleRestriction1");
  const vehicleRestriction2 =
    getFieldValue(parsedResult, "vehicleRestriction_2") || getFieldValue(parsedResult, "vehicleRestriction2");
  const vehicleRestriction3 =
    getFieldValue(parsedResult, "vehicleRestriction_3") || getFieldValue(parsedResult, "vehicleRestriction3");
  const vehicleRestriction4 =
    getFieldValue(parsedResult, "vehicleRestriction_4") || getFieldValue(parsedResult, "vehicleRestriction4");

  const licenseCodeIssuedDate1Raw =
    getFieldValue(parsedResult, "licenseCodeIssuedDate_1") || getFieldValue(parsedResult, "licenseCodeIssuedDate1");
  const licenseCodeIssuedDate2Raw =
    getFieldValue(parsedResult, "licenseCodeIssuedDate_2") || getFieldValue(parsedResult, "licenseCodeIssuedDate2");
  const licenseCodeIssuedDate3Raw =
    getFieldValue(parsedResult, "licenseCodeIssuedDate_3") || getFieldValue(parsedResult, "licenseCodeIssuedDate3");
  const licenseCodeIssuedDate4Raw =
    getFieldValue(parsedResult, "licenseCodeIssuedDate_4") || getFieldValue(parsedResult, "licenseCodeIssuedDate4");

  const licenseCodeIssuedDate1 = safeParseDateField(licenseCodeIssuedDate1Raw, issuingCountry);
  const licenseCodeIssuedDate2 = safeParseDateField(licenseCodeIssuedDate2Raw, issuingCountry);
  const licenseCodeIssuedDate3 = safeParseDateField(licenseCodeIssuedDate3Raw, issuingCountry);
  const licenseCodeIssuedDate4 = safeParseDateField(licenseCodeIssuedDate4Raw, issuingCountry);

  // Professional driving permit
  const professionalDrivingPermitCodes = getFieldValue(parsedResult, "professionalDrivingPermitCodes");
  const vehicleLicense = getFieldValue(parsedResult, "vehicleLicense");

  // Restrictions
  const restrictions = getFieldValue(parsedResult, "driverRestrictionCodes");

  // Build names and vehicle class
  const fullName = buildFullName(surname, initials);
  const vehicleClass = [vehicleCode1, vehicleCode2, vehicleCode3, vehicleCode4].filter(Boolean).join(", ");

  // Calculate age
  const age = dateOfBirth && isValidPartialDate(dateOfBirth) ? calculateAge(dateOfBirth) : 0;

  // Check field validation
  const fieldValidationMappings: Record<any, string[]> = {
    [EnumDriverLicenseData.LicenseNumber]: ["licenseNumber"],
    [EnumDriverLicenseData.Surname]: ["surname"],
    [EnumDriverLicenseData.Initials]: ["initials"],
    [EnumDriverLicenseData.Sex]: ["gender"],
    [EnumDriverLicenseData.IdNumber]: ["idNumber"],
  };

  Object.entries(fieldValidationMappings).forEach(([enumKey, fieldNames]) => {
    const hasInvalidField = fieldNames.some((fieldName) => isFieldInvalid(parsedResult, fieldName));
    if (hasInvalidField) {
      invalidFields.push(enumKey as EnumDriverLicenseData);
    }
  });

  // Build result
  return {
    ...createBaseResult(),
    [EnumDriverLicenseData.InvalidFields]: invalidFields,
    [EnumDriverLicenseData.LicenseType]: EnumDriverLicenseType.SOUTH_AFRICA_DL,
    [EnumDriverLicenseData.LicenseNumber]: licenseNumber || "N/A",
    [EnumDriverLicenseData.FullName]: fullName,
    [EnumDriverLicenseData.FirstName]: initials || "",
    [EnumDriverLicenseData.LastName]: surname || "",
    [EnumDriverLicenseData.MiddleName]: undefined,
    [EnumDriverLicenseData.DateOfBirth]: dateOfBirth,
    [EnumDriverLicenseData.ExpiryDate]: licenseValidityTo,
    [EnumDriverLicenseData.IssueDate]: licenseValidityFrom,
    [EnumDriverLicenseData.Age]: age,
    [EnumDriverLicenseData.Sex]: sex || "N/A",
    [EnumDriverLicenseData.Height]: undefined,
    [EnumDriverLicenseData.Weight]: undefined,
    [EnumDriverLicenseData.EyeColor]: undefined,
    [EnumDriverLicenseData.HairColor]: undefined,
    [EnumDriverLicenseData.Address]: "N/A",
    [EnumDriverLicenseData.City]: undefined,
    [EnumDriverLicenseData.State]: undefined,
    [EnumDriverLicenseData.PostalCode]: undefined,
    [EnumDriverLicenseData.VehicleClass]: vehicleClass || undefined,
    [EnumDriverLicenseData.Restrictions]: restrictions,
    [EnumDriverLicenseData.Endorsements]: undefined,
    [EnumDriverLicenseData.IssuingCountry]: issuingCountry,
    [EnumDriverLicenseData.DocumentDiscriminator]: idNumber,

    // South African specific fields
    [EnumDriverLicenseData.IdNumber]: idNumber,
    [EnumDriverLicenseData.IdNumberType]: idNumberType,
    [EnumDriverLicenseData.IdIssuedCountry]: idIssuedCountry,
    [EnumDriverLicenseData.Surname]: surname,
    [EnumDriverLicenseData.Initials]: initials,
    [EnumDriverLicenseData.LicenseIssuedCountry]: licenseIssuedCountry,
    [EnumDriverLicenseData.LicenseIssueNumber]: licenseIssueNumber,
    [EnumDriverLicenseData.LicenseValidityFrom]: licenseValidityFrom,
    [EnumDriverLicenseData.LicenseValidityTo]: licenseValidityTo,
    [EnumDriverLicenseData.ProfessionalDrivingPermitExpiryDate]: professionalDrivingPermitExpiryDate,
    [EnumDriverLicenseData.ProfessionalDrivingPermitCodes]: professionalDrivingPermitCodes,
    [EnumDriverLicenseData.VehicleLicense]: vehicleLicense,
    [EnumDriverLicenseData.VehicleCode1]: vehicleCode1,
    [EnumDriverLicenseData.VehicleCode2]: vehicleCode2,
    [EnumDriverLicenseData.VehicleCode3]: vehicleCode3,
    [EnumDriverLicenseData.VehicleCode4]: vehicleCode4,
    [EnumDriverLicenseData.VehicleRestriction1]: vehicleRestriction1,
    [EnumDriverLicenseData.VehicleRestriction2]: vehicleRestriction2,
    [EnumDriverLicenseData.VehicleRestriction3]: vehicleRestriction3,
    [EnumDriverLicenseData.VehicleRestriction4]: vehicleRestriction4,
    [EnumDriverLicenseData.LicenseCodeIssuedDate1]: licenseCodeIssuedDate1,
    [EnumDriverLicenseData.LicenseCodeIssuedDate2]: licenseCodeIssuedDate2,
    [EnumDriverLicenseData.LicenseCodeIssuedDate3]: licenseCodeIssuedDate3,
    [EnumDriverLicenseData.LicenseCodeIssuedDate4]: licenseCodeIssuedDate4,
  } as DriverLicenseData;
}

// =============================================================================
// MAIN PROCESSING FUNCTION
// =============================================================================

export function processDriverLicenseData(parsedResult?: ParsedResultItem): DriverLicenseData | null {
  if (!parsedResult) {
    console.error("No parsed result provided");
    return null;
  }

  try {
    const licenseType = parsedResult.codeType;

    switch (licenseType) {
      case EnumDriverLicenseType.AAMVA_DL_ID:
        return processAAMVAStandard(parsedResult);

      case EnumDriverLicenseType.AAMVA_DL_ID_WITH_MAG_STRIPE:
        return processAAMVAMagStripe(parsedResult);

      case EnumDriverLicenseType.SOUTH_AFRICA_DL:
        return processSouthAfricanDL(parsedResult);

      default:
        console.warn("Unknown license type, defaulting to AAMVA standard:", licenseType);
        return processAAMVAStandard(parsedResult);
    }
  } catch (error) {
    console.error("Error processing driver license data:", error);
    return {
      status: {
        code: EnumResultStatus.RS_FAILED,
        message: `Processing failed: ${error?.message || error}`,
      },
    } as DriverLicenseData;
  }
}

// =============================================================================
// LABELS AND CONSTANTS
// =============================================================================

export const DriverLicenseDataLabel: Record<EnumDriverLicenseData, string> = {
  // Basic fields
  [EnumDriverLicenseData.InvalidFields]: "Invalid Fields",
  [EnumDriverLicenseData.LicenseType]: "License Type",
  [EnumDriverLicenseData.LicenseNumber]: "License Number",

  // Document metadata
  [EnumDriverLicenseData.AAMVAVersionNumber]: "AAMVA Version Number",
  [EnumDriverLicenseData.IssuerIdentificationNumber]: "Issuer ID Number",
  [EnumDriverLicenseData.JurisdictionVersionNumber]: "Jurisdiction Version",
  [EnumDriverLicenseData.DocumentDiscriminator]: "Document Discriminator",
  [EnumDriverLicenseData.IssuingCountry]: "Issuing Country",
  [EnumDriverLicenseData.ComplianceType]: "Compliance Type",

  // Personal information
  [EnumDriverLicenseData.FullName]: "Full Name",
  [EnumDriverLicenseData.FirstName]: "First Name",
  [EnumDriverLicenseData.LastName]: "Last Name",
  [EnumDriverLicenseData.MiddleName]: "Middle Name",
  [EnumDriverLicenseData.NamePrefix]: "Name Prefix",
  [EnumDriverLicenseData.NameSuffix]: "Name Suffix",
  [EnumDriverLicenseData.DateOfBirth]: "Date of Birth",
  [EnumDriverLicenseData.Age]: "Age",
  [EnumDriverLicenseData.Sex]: "Sex",

  // Alternative/Alias information
  [EnumDriverLicenseData.NameAlias]: "Name Alias",
  [EnumDriverLicenseData.FirstNameAlias]: "First Name Alias",
  [EnumDriverLicenseData.LastNameAlias]: "Last Name Alias",
  [EnumDriverLicenseData.MiddleNameAlias]: "Middle Name Alias",
  [EnumDriverLicenseData.PrefixAlias]: "Prefix Alias",
  [EnumDriverLicenseData.SuffixAlias]: "Suffix Alias",
  [EnumDriverLicenseData.AlternativeBirthDate]: "Alternative Birth Date",
  [EnumDriverLicenseData.AlternativeSocialSecurityNumber]: "Alternative SSN",

  // Physical characteristics
  [EnumDriverLicenseData.Height]: "Height",
  [EnumDriverLicenseData.HeightInCentimeters]: "Height (cm)",
  [EnumDriverLicenseData.Weight]: "Weight",
  [EnumDriverLicenseData.WeightInKilograms]: "Weight (kg)",
  [EnumDriverLicenseData.WeightInPounds]: "Weight (lbs)",
  [EnumDriverLicenseData.WeightRange]: "Weight Range",
  [EnumDriverLicenseData.EyeColor]: "Eye Color",
  [EnumDriverLicenseData.HairColor]: "Hair Color",
  [EnumDriverLicenseData.Race]: "Race/Ethnicity",

  // Address information
  [EnumDriverLicenseData.Address]: "Address",
  [EnumDriverLicenseData.Street1]: "Street 1",
  [EnumDriverLicenseData.Street2]: "Street 2",
  [EnumDriverLicenseData.City]: "City",
  [EnumDriverLicenseData.State]: "State/Province",
  [EnumDriverLicenseData.PostalCode]: "Postal Code",

  // Residence address
  [EnumDriverLicenseData.ResidenceStreet1]: "Residence Street 1",
  [EnumDriverLicenseData.ResidenceStreet2]: "Residence Street 2",
  [EnumDriverLicenseData.ResidenceCity]: "Residence City",
  [EnumDriverLicenseData.ResidenceState]: "Residence State",
  [EnumDriverLicenseData.ResidencePostalCode]: "Residence Postal Code",

  // Dates
  [EnumDriverLicenseData.ExpiryDate]: "Expiry Date",
  [EnumDriverLicenseData.IssueDate]: "Issue Date",
  [EnumDriverLicenseData.IssueTimestamp]: "Issue Timestamp",
  [EnumDriverLicenseData.CardRevisionDate]: "Card Revision Date",
  [EnumDriverLicenseData.HazmatEndorsementExpiryDate]: "Hazmat Endorsement Expiry",
  [EnumDriverLicenseData.Under18Until]: "Under 18 Until",
  [EnumDriverLicenseData.Under19Until]: "Under 19 Until",
  [EnumDriverLicenseData.Under21Until]: "Under 21 Until",

  // Vehicle classification
  [EnumDriverLicenseData.VehicleClass]: "Vehicle Class",
  [EnumDriverLicenseData.StandardVehicleClassification]: "Standard Vehicle Class",
  [EnumDriverLicenseData.VehicleCodeDescription]: "Vehicle Code Description",

  // Restrictions and endorsements
  [EnumDriverLicenseData.Restrictions]: "Restrictions",
  [EnumDriverLicenseData.RestrictionsCode]: "Restriction Code",
  [EnumDriverLicenseData.StandardRestrictionCode]: "Standard Restriction Code",
  [EnumDriverLicenseData.RestrictionCodeDescription]: "Restriction Description",
  [EnumDriverLicenseData.Endorsements]: "Endorsements",
  [EnumDriverLicenseData.EndorsementsCode]: "Endorsement Code",
  [EnumDriverLicenseData.StandardEndorsementsCode]: "Standard Endorsement Code",
  [EnumDriverLicenseData.EndorsementsCodeDescription]: "Endorsement Description",

  // Permit information
  [EnumDriverLicenseData.PermitClassificationCode]: "Permit Classification",
  [EnumDriverLicenseData.PermitIdentifier]: "Permit Identifier",
  [EnumDriverLicenseData.PermitExpirationDate]: "Permit Expiry Date",
  [EnumDriverLicenseData.PermitIssuedDate]: "Permit Issue Date",
  [EnumDriverLicenseData.PermitRestrictionCode]: "Permit Restriction Code",
  [EnumDriverLicenseData.PermitEndorsementCode]: "Permit Endorsement Code",

  // Identifiers
  [EnumDriverLicenseData.CustomerIdentifier]: "Customer Identifier",
  [EnumDriverLicenseData.SocialSecurityNumber]: "Social Security Number",
  [EnumDriverLicenseData.InventoryControlNumber]: "Inventory Control Number",
  [EnumDriverLicenseData.NumberOfDuplicates]: "Number of Duplicates",

  // Indicators and flags
  [EnumDriverLicenseData.MedicalIndicator]: "Medical Indicator",
  [EnumDriverLicenseData.OrganDonorIndicator]: "Organ Donor",
  [EnumDriverLicenseData.NonResidentIndicator]: "Non-Resident",
  [EnumDriverLicenseData.VeteranIndicator]: "Veteran",
  [EnumDriverLicenseData.LimitedDurationDocumentIndicator]: "Limited Duration Document",

  // Federal and commercial
  [EnumDriverLicenseData.FederalCommercialVehicleCodes]: "Federal Commercial Vehicle Codes",

  // Truncation indicators
  [EnumDriverLicenseData.FamilyNameTruncation]: "Family Name Truncation",
  [EnumDriverLicenseData.FirstNameTruncation]: "First Name Truncation",
  [EnumDriverLicenseData.MiddleNameTruncation]: "Middle Name Truncation",

  // Additional information
  [EnumDriverLicenseData.BirthPlace]: "Birth Place",
  [EnumDriverLicenseData.AuditInformation]: "Audit Information",
  [EnumDriverLicenseData.JurisdictionSubfiles]: "Jurisdiction Subfiles",

  // Magstripe specific labels
  [EnumDriverLicenseData.Track1]: "Track 1 Data",
  [EnumDriverLicenseData.Track2]: "Track 2 Data",
  [EnumDriverLicenseData.Track3]: "Track 3 Data",
  [EnumDriverLicenseData.LRCforTrack1]: "Track 1 LRC",
  [EnumDriverLicenseData.LRCforTrack2]: "Track 2 LRC",
  [EnumDriverLicenseData.LRCforTrack3]: "Track 3 LRC",
  [EnumDriverLicenseData.ISOIIN]: "ISO IIN",
  [EnumDriverLicenseData.DLorID_NumberOverflow]: "DL/ID Number Overflow",
  [EnumDriverLicenseData.MagStripeVersion]: "Mag Stripe Version",
  [EnumDriverLicenseData.DiscretionaryData1]: "Discretionary Data 1",
  [EnumDriverLicenseData.DiscretionaryData2]: "Discretionary Data 2",
  [EnumDriverLicenseData.SecurityFunction]: "Security Function",

  // South African specific labels
  [EnumDriverLicenseData.IdNumber]: "ID Number",
  [EnumDriverLicenseData.IdNumberType]: "ID Number Type",
  [EnumDriverLicenseData.IdIssuedCountry]: "ID Issued Country",
  [EnumDriverLicenseData.Surname]: "Surname",
  [EnumDriverLicenseData.Initials]: "Initials",
  [EnumDriverLicenseData.LicenseIssuedCountry]: "License Issued Country",
  [EnumDriverLicenseData.LicenseIssueNumber]: "License Issue Number",
  [EnumDriverLicenseData.LicenseValidityFrom]: "License Valid From",
  [EnumDriverLicenseData.LicenseValidityTo]: "License Valid To",
  [EnumDriverLicenseData.ProfessionalDrivingPermitExpiryDate]: "PrDP Permit Expiry Date",
  [EnumDriverLicenseData.ProfessionalDrivingPermitCodes]: "PrDP Codes",
  [EnumDriverLicenseData.VehicleLicense]: "Vehicle License",
  [EnumDriverLicenseData.VehicleCode1]: "Vehicle Code 1",
  [EnumDriverLicenseData.VehicleCode2]: "Vehicle Code 2",
  [EnumDriverLicenseData.VehicleCode3]: "Vehicle Code 3",
  [EnumDriverLicenseData.VehicleCode4]: "Vehicle Code 4",
  [EnumDriverLicenseData.VehicleRestriction1]: "Vehicle Restriction 1",
  [EnumDriverLicenseData.VehicleRestriction2]: "Vehicle Restriction 2",
  [EnumDriverLicenseData.VehicleRestriction3]: "Vehicle Restriction 3",
  [EnumDriverLicenseData.VehicleRestriction4]: "Vehicle Restriction 4",
  [EnumDriverLicenseData.LicenseCodeIssuedDate1]: "License Code Issue Date 1",
  [EnumDriverLicenseData.LicenseCodeIssuedDate2]: "License Code Issue Date 2",
  [EnumDriverLicenseData.LicenseCodeIssuedDate3]: "License Code Issue Date 3",
  [EnumDriverLicenseData.LicenseCodeIssuedDate4]: "License Code Issue Date 4",
};

export const DriverLicenseDateFields = [
  EnumDriverLicenseData.DateOfBirth,
  EnumDriverLicenseData.ExpiryDate,
  EnumDriverLicenseData.IssueDate,
  EnumDriverLicenseData.AlternativeBirthDate,
  EnumDriverLicenseData.CardRevisionDate,
  EnumDriverLicenseData.HazmatEndorsementExpiryDate,
  EnumDriverLicenseData.Under18Until,
  EnumDriverLicenseData.Under19Until,
  EnumDriverLicenseData.Under21Until,
  EnumDriverLicenseData.PermitExpirationDate,
  EnumDriverLicenseData.PermitIssuedDate,
  EnumDriverLicenseData.LicenseValidityFrom,
  EnumDriverLicenseData.LicenseValidityTo,
  EnumDriverLicenseData.ProfessionalDrivingPermitExpiryDate,
  EnumDriverLicenseData.LicenseCodeIssuedDate1,
  EnumDriverLicenseData.LicenseCodeIssuedDate2,
  EnumDriverLicenseData.LicenseCodeIssuedDate3,
  EnumDriverLicenseData.LicenseCodeIssuedDate4,
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function displayDriverLicenseDate(date: DriverLicenseDate): string {
  if (!date || (!date.year && !date.month && !date.day)) {
    return "N/A";
  }

  const twoDigit = (num: number | undefined) =>
    num !== undefined ? (num.toString().length === 1 ? `0${num}` : num.toString()) : "";

  if (date.year && date.month && date.day) {
    return `${date.year}-${twoDigit(date.month)}-${twoDigit(date.day)}`;
  }

  if (date.year && date.month) {
    return `${date.year}-${twoDigit(date.month)}`;
  }

  if (date.year) {
    return `${date.year}`;
  }

  if (date.month && date.day) {
    return `${twoDigit(date.month)}-${twoDigit(date.day)}`;
  }

  if (date.month) {
    return `${twoDigit(date.month)}`;
  }

  if (date.day) {
    return `${twoDigit(date.day)}`;
  }

  return "N/A";
}

export function canCalculateAge(birthDate: DriverLicenseDate | undefined): boolean {
  return !!(birthDate && birthDate.year);
}

export function getAgeDisplayString(birthDate: DriverLicenseDate | undefined): string {
  if (!canCalculateAge(birthDate)) {
    return "N/A";
  }

  const age = calculateAge(birthDate!);

  if (birthDate!.year && birthDate!.month && birthDate!.day) {
    return `${age} years old`;
  } else if (birthDate!.year && birthDate!.month) {
    return `~${age} years old (estimated from month/year)`;
  } else {
    return `~${age} years old (estimated from year only)`;
  }
}

export function getDateDisplayString(date: DriverLicenseDate, fieldName: string): string {
  if (!date) return "N/A";

  const displayDate = displayDriverLicenseDate(date);

  if (date.year && date.month && !date.day) {
    return `${displayDate} (Month/Year only)`;
  } else if (date.year && !date.month && !date.day) {
    return `${displayDate} (Year only)`;
  }

  return displayDate;
}

type LicenseValidationResult = {
  isValid: boolean;
  orientation: "horizontal" | "vertical" | null;
  matchedRatio: "card" | "magstripe" | null;
};

export function isWithinLicenseRatio(points: Quadrilateral["points"], tolerance = 0.1): LicenseValidationResult {
  if (!points) {
    return {
      isValid: false,
      orientation: null,
      matchedRatio: null,
    };
  }

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  // Ignore vertical for now.
  if (height > width) {
    return {
      isValid: false,
      orientation: "vertical",
      matchedRatio: null,
    };
  }

  const ratio = width / height;

  // Check horizontal orientation (width > height)
  const horizontalCardDifference = Math.abs(ratio - DRIVER_LICENSE_CARD_RATIO);
  const horizontalCardPercentDifference = horizontalCardDifference / DRIVER_LICENSE_CARD_RATIO;
  const isHorizontalCardRatio = horizontalCardPercentDifference <= tolerance;

  // Determine result
  if (isHorizontalCardRatio) {
    return {
      isValid: true,
      orientation: "horizontal",
      matchedRatio: "card",
    };
  }

  return {
    isValid: false,
    orientation: null,
    matchedRatio: null,
  };
}
