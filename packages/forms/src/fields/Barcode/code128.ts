/**
 * Minimal Code 128 (set B) encoder — turns a printable-ASCII string into the
 * bar/space run lengths of a valid, scannable symbol (start code, checksum,
 * stop pattern included). Used by BarcodePreview to draw honest previews
 * without a canvas/svg barcode dependency.
 */

/**
 * Code 128 symbol patterns (ISO/IEC 15417). Index = symbol value 0–106; each
 * entry is the 11-module bar/space pattern written as a binary number
 * (1 = bar, 0 = space). The final entry is the 13-module stop pattern.
 */
const BARS = [
  11011001100, 11001101100, 11001100110, 10010011000, 10010001100, 10001001100, 10011001000, 10011000100, 10001100100,
  11001001000, 11001000100, 11000100100, 10110011100, 10011011100, 10011001110, 10111001100, 10011101100, 10011100110,
  11001110010, 11001011100, 11001001110, 11011100100, 11001110100, 11101101110, 11101001100, 11100101100, 11100100110,
  11101100100, 11100110100, 11100110010, 11011011000, 11011000110, 11000110110, 10100011000, 10001011000, 10001000110,
  10110001000, 10001101000, 10001100010, 11010001000, 11000101000, 11000100010, 10110111000, 10110001110, 10001101110,
  10111011000, 10111000110, 10001110110, 11101110110, 11010001110, 11000101110, 11011101000, 11011100010, 11011101110,
  11101011000, 11101000110, 11100010110, 11101101000, 11101100010, 11100011010, 11101111010, 11001000010, 11110001010,
  10100110000, 10100001100, 10010110000, 10010000110, 10000101100, 10000100110, 10110010000, 10110000100, 10011010000,
  10011000010, 10000110100, 10000110010, 11000010010, 11001010000, 11110111010, 11000010100, 10001111010, 10100111100,
  10010111100, 10010011110, 10111100100, 10011110100, 10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
  11011110110, 11110110110, 10101111000, 10100011110, 10001011110, 10111101000, 10111100010, 11110101000, 11110100010,
  10111011110, 10111101110, 11101011110, 11110101110, 11010000100, 11010010000, 11010011100, 1100011101011,
] as const;

const START_B = 104;
const STOP = 106;
const MODULO = 103;

export interface Code128Run {
  /** true = ink bar, false = space */
  bar: boolean;
  /** run length in barcode modules */
  modules: number;
}

/**
 * Encode a string as Code 128 set B (printable ASCII 32–126). Returns the
 * bar/space runs of the complete symbol, or null when the value is empty or
 * contains characters set B cannot represent.
 */
export function encodeCode128B(value: string): Code128Run[] | null {
  if (!value) {
    return null;
  }
  const codes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i) - 32;
    if (code < 0 || code > 94) {
      return null;
    }
    codes.push(code);
  }
  let checksum = START_B;
  for (let i = 0; i < codes.length; i++) {
    checksum += codes[i] * (i + 1);
  }
  const sequence = [START_B, ...codes, checksum % MODULO, STOP];

  const moduleString = sequence.map((symbol) => String(BARS[symbol])).join('');
  const runs: Code128Run[] = [];
  for (const char of moduleString) {
    const bar = char === '1';
    const last = runs[runs.length - 1];
    if (last && last.bar === bar) {
      last.modules += 1;
    } else {
      runs.push({ bar, modules: 1 });
    }
  }
  return runs;
}

/** Total module count of an encoded symbol (for width math in previews). */
export function countModules(runs: Code128Run[]): number {
  return runs.reduce((sum, run) => sum + run.modules, 0);
}
