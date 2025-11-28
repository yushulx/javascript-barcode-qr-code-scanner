import type { Merge } from "type-fest";
import type { ReaderOptions } from "../bindings/index.js";
import { type PrepareZXingModuleOptions, type ZXingModuleOverrides, type ZXingReaderModule } from "../share.js";
export declare function prepareZXingModule(options?: Merge<PrepareZXingModuleOptions, {
    fireImmediately?: false;
}>): void;
export declare function prepareZXingModule(options: Merge<PrepareZXingModuleOptions, {
    fireImmediately: true;
}>): Promise<ZXingReaderModule>;
export declare function prepareZXingModule(options?: PrepareZXingModuleOptions): void | Promise<ZXingReaderModule>;
export declare function purgeZXingModule(): void;
/**
 * @deprecated Use {@link prepareZXingModule | `prepareZXingModule`} instead.
 * This function is equivalent to the following:
 *
 * ```ts
 * prepareZXingModule({
 *   overrides: zxingModuleOverrides,
 *   equalityFn: Object.is,
 *   fireImmediately: true,
 * });
 * ```
 */
export declare function getZXingModule(zxingModuleOverrides?: ZXingModuleOverrides): Promise<ZXingReaderModule>;
/**
 * @deprecated Use {@link prepareZXingModule | `prepareZXingModule`} instead.
 * This function is equivalent to the following:
 *
 * ```ts
 * prepareZXingModule({
 *   overrides: zxingModuleOverrides,
 *   equalityFn: Object.is,
 *   fireImmediately: false,
 * });
 * ```
 */
export declare function setZXingModuleOverrides(zxingModuleOverrides: ZXingModuleOverrides): void;
export declare function readBarcodes(input: Blob | ArrayBuffer | Uint8Array | ImageData, readerOptions?: ReaderOptions): Promise<import("./index.js").ReadResult[]>;
/**
 * @deprecated Use {@link readBarcodes | `readBarcodes`} instead.
 */
export declare function readBarcodesFromImageFile(imageFile: Blob, readerOptions?: ReaderOptions): Promise<import("./index.js").ReadResult[]>;
/**
 * @deprecated Use {@link readBarcodes | `readBarcodes`} instead.
 */
export declare function readBarcodesFromImageData(imageData: ImageData, readerOptions?: ReaderOptions): Promise<import("./index.js").ReadResult[]>;
export * from "../bindings/exposedReaderBindings.js";
export { type PrepareZXingModuleOptions, ZXING_CPP_COMMIT, ZXING_WASM_VERSION, type ZXingModuleOverrides, type ZXingReaderModule, } from "../share.js";
export declare const ZXING_WASM_SHA256: string;
