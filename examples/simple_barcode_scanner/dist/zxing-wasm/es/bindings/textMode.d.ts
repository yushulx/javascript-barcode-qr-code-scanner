export declare const textModes: readonly ["Plain", "ECI", "HRI", "Hex", "Escaped"];
export type TextMode = (typeof textModes)[number];
/**
 * Encodes a text mode into its corresponding numeric value.
 *
 * @param textMode - The text mode to encode
 * @returns A number representing the encoded text mode.
 */
export declare function encodeTextMode(textMode: TextMode): number;
/**
 * Decodes a numeric value into its corresponding text mode.
 *
 * @param number - The numeric value to decode into a text mode
 * @returns The decoded text mode.
 */
export declare function decodeTextMode(number: number): TextMode;
