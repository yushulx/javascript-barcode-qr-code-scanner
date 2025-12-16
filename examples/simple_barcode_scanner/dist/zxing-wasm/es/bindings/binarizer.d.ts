export declare const binarizers: readonly ["LocalAverage", "GlobalHistogram", "FixedThreshold", "BoolCast"];
export type Binarizer = (typeof binarizers)[number];
/**
 * Encodes a binarizer to its numeric representation.
 *
 * @param binarizer - The binarizer to encode
 * @returns A number representing the encoded binarizer
 */
export declare function encodeBinarizer(binarizer: Binarizer): number;
/**
 * Decodes a binarizer from a numeric identifier.
 *
 * @param number - The numeric identifier of the binarizer
 * @returns The decoded binarizer
 */
export declare function decodeBinarizer(number: number): Binarizer;
