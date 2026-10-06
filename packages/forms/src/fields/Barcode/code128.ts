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
  11_011_001_100, 11_001_101_100, 11_001_100_110, 10_010_011_000, 10_010_001_100, 10_001_001_100, 10_011_001_000,
  10_011_000_100, 10_001_100_100, 11_001_001_000, 11_001_000_100, 11_000_100_100, 10_110_011_100, 10_011_011_100,
  10_011_001_110, 10_111_001_100, 10_011_101_100, 10_011_100_110, 11_001_110_010, 11_001_011_100, 11_001_001_110,
  11_011_100_100, 11_001_110_100, 11_101_101_110, 11_101_001_100, 11_100_101_100, 11_100_100_110, 11_101_100_100,
  11_100_110_100, 11_100_110_010, 11_011_011_000, 11_011_000_110, 11_000_110_110, 10_100_011_000, 10_001_011_000,
  10_001_000_110, 10_110_001_000, 10_001_101_000, 10_001_100_010, 11_010_001_000, 11_000_101_000, 11_000_100_010,
  10_110_111_000, 10_110_001_110, 10_001_101_110, 10_111_011_000, 10_111_000_110, 10_001_110_110, 11_101_110_110,
  11_010_001_110, 11_000_101_110, 11_011_101_000, 11_011_100_010, 11_011_101_110, 11_101_011_000, 11_101_000_110,
  11_100_010_110, 11_101_101_000, 11_101_100_010, 11_100_011_010, 11_101_111_010, 11_001_000_010, 11_110_001_010,
  10_100_110_000, 10_100_001_100, 10_010_110_000, 10_010_000_110, 10_000_101_100, 10_000_100_110, 10_110_010_000,
  10_110_000_100, 10_011_010_000, 10_011_000_010, 10_000_110_100, 10_000_110_010, 11_000_010_010, 11_001_010_000,
  11_110_111_010, 11_000_010_100, 10_001_111_010, 10_100_111_100, 10_010_111_100, 10_010_011_110, 10_111_100_100,
  10_011_110_100, 10_011_110_010, 11_110_100_100, 11_110_010_100, 11_110_010_010, 11_011_011_110, 11_011_110_110,
  11_110_110_110, 10_101_111_000, 10_100_011_110, 10_001_011_110, 10_111_101_000, 10_111_100_010, 11_110_101_000,
  11_110_100_010, 10_111_011_110, 10_111_101_110, 11_101_011_110, 11_110_101_110, 11_010_000_100, 11_010_010_000,
  11_010_011_100, 1_100_011_101_011,
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
export const encodeCode128B = (value: string): Code128Run[] | null => {
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
};

/** Total module count of an encoded symbol (for width math in previews). */
export const countModules = (runs: Code128Run[]): number => runs.reduce((sum, run) => sum + run.modules, 0);
