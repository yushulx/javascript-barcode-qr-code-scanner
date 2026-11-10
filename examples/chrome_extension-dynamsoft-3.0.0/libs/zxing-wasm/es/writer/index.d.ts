/**
 * The writer part API of this package is subject to change a lot.
 * Please track the status of [this issue](https://github.com/zxing-cpp/zxing-cpp/issues/332).
 *
 * @packageDocumentation
 */
import type { Merge } from "type-fest";
import type { WriterOptions } from "../bindings/index.js";
import { type PrepareZXingModuleOptions, type ZXingModuleOverrides, type ZXingWriterModule } from "../share.js";
export declare function prepareZXingModule(options?: Merge<PrepareZXingModuleOptions, {
    fireImmediately?: false;
}>): void;
export declare function prepareZXingModule(options: Merge<PrepareZXingModuleOptions, {
    fireImmediately: true;
}>): Promise<ZXingWriterModule>;
export declare function prepareZXingModule(options?: PrepareZXingModuleOptions): void | Promise<ZXingWriterModule>;
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
export declare function getZXingModule(zxingModuleOverrides?: ZXingModuleOverrides): Promise<ZXingWriterModule>;
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
export declare function writeBarcode(input: string | Uint8Array, writerOptions?: WriterOptions): Promise<{
    image: Blob | null;
    svg: string;
    utf8: string;
    error: string;
    symbol: import("../bindings/barcodeSymbol.js").BarcodeSymbol;
}>;
export * from "../bindings/exposedWriterBindings.js";
export { type PrepareZXingModuleOptions, ZXING_CPP_COMMIT, ZXING_WASM_VERSION, type ZXingModuleOverrides, type ZXingWriterModule, } from "../share.js";
export declare const ZXING_WASM_SHA256: string;
