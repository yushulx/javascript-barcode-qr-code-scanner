import DriverLicenseScanner from "../DriverLicenseScanner";
import DriverLicenseNormalizerView from "../views/DriverLicenseCorrectionView";
import DriverLicenseScannerView from "../views/DriverLicenseScannerView";
import DriverLicenseResultView from "../views/DriverLicenseResultView";
import { EnumResultStatus, EnumFlowType } from "../utils/types";
import { EnumDriverLicenseScannerViews, EnumDriverLicenseScanSide } from "../utils/DriverLicenseParser";
import { DeskewedImageResultItem } from "dynamsoft-capture-vision-bundle";

export const DDLS = {
  DriverLicenseScanner,
  DriverLicenseNormalizerView,
  DriverLicenseScannerView,
  DriverLicenseResultView,
  EnumResultStatus,
  EnumFlowType,
  EnumDriverLicenseScannerViews,
  EnumDriverLicenseScanSide,
};

export type { DeskewedImageResultItem };
export type { DriverLicenseScannerConfig, SharedResources } from "../DriverLicenseScanner";
export type { DriverLicenseScannerViewConfig } from "../views/DriverLicenseScannerView";
export type {
  DriverLicenseCorrectionViewConfig,
  DriverLicenseCorrectionViewToolbarButtonsConfig,
} from "../views/DriverLicenseCorrectionView";
export type {
  DriverLicenseResultViewConfig,
  DriverLicenseResultViewToolbarButtonsConfig,
} from "../views/DriverLicenseResultView";
export type { UtilizedTemplateNames, ResultStatus, ToolbarButtonConfig } from "../utils/types";
export type { DriverLicenseImageResult } from "../utils/DriverLicenseParser";

export {
  DriverLicenseScanner,
  DriverLicenseNormalizerView,
  DriverLicenseScannerView,
  DriverLicenseResultView,
  EnumResultStatus,
  EnumDriverLicenseScanSide,
};

export default DDLS;
