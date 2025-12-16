import type { Merge } from "type-fest";
import type { ReaderOptions, WriterOptions } from "../bindings/index.js";
import { type PrepareZXingModuleOptions, type ZXingFullModule, type ZXingModuleOverrides } from "../share.js";
export declare function prepareZXingModule(options?: Merge<PrepareZXingModuleOptions, {
    fireImmediately?: false;
}>): void;
export declare function prepareZXingModule(options: Merge<PrepareZXingModuleOptions, {
    fireImmediately: true;
}>): Promise<ZXingFullModule>;
export declare function prepareZXingModule(options?: PrepareZXingModuleOptions): void | Promise<ZXingFullModule>;
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
export declare function getZXingModule(zxingModuleOverrides?: ZXingModuleOverrides): Promise<ZXingFullModule>;
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
export declare function writeBarcode(input: string | Uint8Array, writerOptions?: WriterOptions): Promise<{
    image: Blob | null;
    svg: string;
    utf8: string;
    error: string;
    symbol: import("../bindings/barcodeSymbol.js").BarcodeSymbol;
}>;
export * from "../bindings/exposedReaderBindings.js";
export * from "../bindings/exposedWriterBindings.js";
export { type PrepareZXingModuleOptions, ZXING_CPP_COMMIT, ZXING_WASM_VERSION, type ZXingFullModule, type ZXingModuleOverrides, } from "../share.js";
export declare const ZXING_WASM_SHA256: string;
