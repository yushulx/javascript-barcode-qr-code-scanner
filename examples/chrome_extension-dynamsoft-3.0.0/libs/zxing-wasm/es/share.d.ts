import type { Merge } from "type-fest";
import { type ReaderOptions, type ReadResult, type WriterOptions, type ZXingReaderOptions, type ZXingReadResult, type ZXingVector, type ZXingWriteResult, type ZXingWriterOptions } from "./bindings/index.js";
export type ZXingModuleType = "reader" | "writer" | "full";
/**
 * @internal
 */
export interface ZXingReaderModule extends EmscriptenModule {
    readBarcodesFromImage(bufferPtr: number, bufferLength: number, zxingReaderOptions: ZXingReaderOptions): ZXingVector<ZXingReadResult>;
    readBarcodesFromPixmap(bufferPtr: number, imgWidth: number, imgHeight: number, zxingReaderOptions: ZXingReaderOptions): ZXingVector<ZXingReadResult>;
}
/**
 * @internal
 */
export interface ZXingWriterModule extends EmscriptenModule {
    writeBarcodeFromText(text: string, zxingWriterOptions: ZXingWriterOptions): ZXingWriteResult;
    writeBarcodeFromBytes(bufferPtr: number, bufferLength: number, zxingWriterOptions: ZXingWriterOptions): ZXingWriteResult;
}
/**
 * @internal
 */
export interface ZXingFullModule extends ZXingReaderModule, ZXingWriterModule {
}
export type ZXingReaderModuleFactory = EmscriptenModuleFactory<ZXingReaderModule>;
export type ZXingWriterModuleFactory = EmscriptenModuleFactory<ZXingWriterModule>;
export type ZXingFullModuleFactory = EmscriptenModuleFactory<ZXingFullModule>;
interface TypeModuleMap {
    reader: [ZXingReaderModule, ZXingReaderModuleFactory];
    writer: [ZXingWriterModule, ZXingWriterModuleFactory];
    full: [ZXingFullModule, ZXingFullModuleFactory];
}
export type ZXingModule<T extends ZXingModuleType = ZXingModuleType> = TypeModuleMap[T][0];
export type ZXingModuleFactory<T extends ZXingModuleType = ZXingModuleType> = TypeModuleMap[T][1];
export type ZXingModuleOverrides = Partial<EmscriptenModule>;
export declare const ZXING_WASM_VERSION: string;
export declare const ZXING_CPP_COMMIT: string;
export interface PrepareZXingModuleOptions {
    /**
     * The Emscripten module overrides to be passed to the factory function.
     * The `locateFile` function is overridden by default to load the WASM file from the jsDelivr CDN.
     */
    overrides?: ZXingModuleOverrides;
    /**
     * A function to compare the cached overrides with the input overrides.
     * So that the module promise can be reused if the overrides are the same.
     * Defaults to a shallow equality function.
     */
    equalityFn?: (cachedOverrides: ZXingModuleOverrides, overrides: ZXingModuleOverrides) => boolean;
    /**
     * Whether to instantiate the module immediately.
     * If `true`, the module is eagerly instantiated and a promise of the module is returned.
     * If `false`, only the overrides are updated and module instantiation is deferred
     * to the first read/write operation.
     *
     * @default false
     */
    fireImmediately?: boolean;
}
/**
 * Performs a shallow equality comparison between two objects.
 *
 * @param a - First object to compare
 * @param b - Second object to compare
 * @returns `true` if objects are shallowly equal, `false` otherwise
 *
 * @remarks
 * Objects are considered shallowly equal if:
 * - They are the same reference (using Object.is)
 * - They have the same number of keys
 * - All keys in `a` exist in `b` with strictly equal values (===)
 *
 * Note: This comparison only checks the first level of properties.
 * Nested objects or arrays are compared by reference, not by value.
 *
 * @example
 * ```ts
 * shallow({ a: 1, b: 2 }, { a: 1, b: 2 }) // returns true
 * shallow({ a: 1 }, { a: 1, b: 2 }) // returns false
 * shallow({ a: {x: 1} }, { a: {x: 1} }) // returns false (different object references)
 * ```
 */
export declare function shallow<T extends Record<string, unknown>>(a: T, b: T): boolean;
export declare function prepareZXingModuleWithFactory<T extends ZXingModuleType>(zxingModuleFactory: ZXingModuleFactory<T>, options?: Merge<PrepareZXingModuleOptions, {
    fireImmediately?: false;
}>): void;
export declare function prepareZXingModuleWithFactory<T extends ZXingModuleType>(zxingModuleFactory: ZXingModuleFactory<T>, options: Merge<PrepareZXingModuleOptions, {
    fireImmediately: true;
}>): Promise<ZXingModule<T>>;
export declare function prepareZXingModuleWithFactory<T extends ZXingModuleType>(zxingModuleFactory: ZXingModuleFactory<T>, options?: PrepareZXingModuleOptions): void | Promise<ZXingModule<T>>;
/**
 * Removes a ZXing module instance from the internal cache.
 *
 * @param zxingModuleFactory - The factory function used to create the ZXing module instance
 *
 * @remarks
 * This function is used to clean up cached ZXing module instances when they are no longer needed.
 */
export declare function purgeZXingModuleWithFactory<T extends ZXingModuleType>(zxingModuleFactory: ZXingModuleFactory<T>): void;
/**
 * Reads barcodes from an image using a ZXing module factory.
 *
 * @param zxingModuleFactory - Factory function to create a ZXing module instance
 * @param input - Source image data as a Blob, ArrayBuffer, Uint8Array, or ImageData
 * @param readerOptions - Optional configuration options for barcode reading (defaults to defaultReaderOptions)
 * @returns An array of ReadResult objects containing decoded barcode information
 *
 * @remarks
 * The function manages memory allocation and deallocation for the ZXing module
 * and properly cleans up resources after processing.
 */
export declare function readBarcodesWithFactory<T extends "reader" | "full">(zxingModuleFactory: ZXingModuleFactory<T>, input: Blob | ArrayBuffer | Uint8Array | ImageData, readerOptions?: ReaderOptions): Promise<ReadResult[]>;
/**
 * Generates a barcode image using a ZXing module factory with support for text and binary input.
 *
 * @param zxingModuleFactory - The factory function that creates a ZXing module instance
 * @param input - The data to encode in the barcode, either as a string or Uint8Array
 * @param writerOptions - Optional configuration options for barcode generation
 * @returns A promise that resolves to the barcode write result
 *
 * @remarks
 * The function handles memory management automatically when processing binary input,
 * ensuring proper allocation and deallocation of memory in the ZXing module.
 */
export declare function writeBarcodeWithFactory<T extends "writer" | "full">(zxingModuleFactory: ZXingModuleFactory<T>, input: string | Uint8Array, writerOptions?: WriterOptions): Promise<{
    image: Blob | null;
    svg: string;
    utf8: string;
    error: string;
    symbol: import("./bindings/barcodeSymbol.js").BarcodeSymbol;
}>;
export {};
