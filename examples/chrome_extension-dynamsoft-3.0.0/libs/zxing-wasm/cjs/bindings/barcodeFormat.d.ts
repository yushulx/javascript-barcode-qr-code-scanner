declare const barcodeFormatsWithMeta: readonly [readonly ["Aztec", "M"], readonly ["Codabar", "L"], readonly ["Code39", "L"], readonly ["Code93", "L"], readonly ["Code128", "L"], readonly ["DataBar", "L"], readonly ["DataBarExpanded", "L"], readonly ["DataMatrix", "M"], readonly ["EAN-8", "L"], readonly ["EAN-13", "L"], readonly ["ITF", "L"], readonly ["MaxiCode", "M"], readonly ["PDF417", "M"], readonly ["QRCode", "M"], readonly ["UPC-A", "L"], readonly ["UPC-E", "L"], readonly ["MicroQRCode", "M"], readonly ["rMQRCode", "M"], readonly ["DXFilmEdge", "L"], readonly ["DataBarLimited", "L"]];
export declare const barcodeFormats: ("Aztec" | "Codabar" | "Code39" | "Code93" | "Code128" | "DataBar" | "DataBarExpanded" | "DataMatrix" | "EAN-8" | "EAN-13" | "ITF" | "MaxiCode" | "PDF417" | "QRCode" | "UPC-A" | "UPC-E" | "MicroQRCode" | "rMQRCode" | "DXFilmEdge" | "DataBarLimited")[];
type TakeFirst<T> = T extends readonly [infer U, ...unknown[]] ? U : never;
export type LinearBarcodeFormat = TakeFirst<Extract<(typeof barcodeFormatsWithMeta)[number], readonly [string, "L", ...unknown[]]>>;
export declare const linearBarcodeFormats: LinearBarcodeFormat[];
export type MatrixBarcodeFormat = TakeFirst<Extract<(typeof barcodeFormatsWithMeta)[number], readonly [string, "M", ...unknown[]]>>;
export declare const matrixBarcodeFormats: MatrixBarcodeFormat[];
/**
 * @internal
 */
export type BarcodeFormat = (typeof barcodeFormats)[number];
/**
 * Barcode formats that can be used in {@link ReaderOptions.formats | `ReaderOptions.formats`} to read barcodes.
 */
export type ReadInputBarcodeFormat = BarcodeFormat | "Linear-Codes" | "Matrix-Codes" | "Any";
/**
 * Barcode formats that can be used in {@link WriterOptions.format | `WriterOptions.format`} to write barcodes.
 */
export type WriteInputBarcodeFormat = TakeFirst<Exclude<(typeof barcodeFormatsWithMeta)[number], readonly [string, string, "W-"]>>;
/**
 * Barcode formats that may be returned in {@link ReadResult.format | `ReadResult.format`} in read functions.
 */
export type ReadOutputBarcodeFormat = BarcodeFormat | "None";
export type LooseBarcodeFormat = ReadInputBarcodeFormat | WriteInputBarcodeFormat | ReadOutputBarcodeFormat;
/**
 * Encodes a barcode format into its numeric representation.
 *
 * @param format - The barcode format to encode. Can be a specific format, "Linear-Codes",
 *                "Matrix-Codes", "Any", or "None"
 * @returns A number representing the encoded format where:
 *          - For specific formats: returns a power of 2 based on format's index
 *          - For "Linear-Codes": returns bitwise OR of all linear format codes
 *          - For "Matrix-Codes": returns bitwise OR of all matrix format codes
 *          - For "Any": returns a number with all format bits set
 *          - For "None": returns 0
 */
export declare function encodeFormat(format: LooseBarcodeFormat): number;
/**
 * Decodes a numeric format value into a barcode format string.
 *
 * @param number - A numeric value representing the encoded barcode format
 * @returns The decoded barcode format string
 *
 * @remarks
 * Uses bit position to determine the format, where the position of the highest set bit
 * corresponds to an index in the barcode formats array. Returns "None" for zero value.
 */
export declare function decodeFormat(number: number): ReadOutputBarcodeFormat;
/**
 * Encodes an array of barcode formats into a single numeric value using bitwise operations.
 *
 * @param formats - Array of barcode formats to be encoded
 * @returns A number representing the combined encoded formats using bitwise OR operations
 */
export declare function encodeFormats(formats: LooseBarcodeFormat[]): number;
/**
 * Decodes a numeric value into an array of barcode formats based on bit flags.
 *
 * @param number - A numeric value where each bit represents a different barcode format
 * @returns An array of decoded BarcodeFormat values. Returns empty array if input is 0
 *
 * @remarks
 * This function uses bitwise operations to decode a number into individual barcode formats.
 * Each bit position in the input number corresponds to a specific barcode format.
 * The function iterates through each bit, and if set, adds the corresponding format to the result array.
 */
export declare function decodeFormats(number: number): BarcodeFormat[];
export {};
