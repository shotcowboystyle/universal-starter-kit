/**
 * Minimal QR Code encoder (ISO/IEC 18004) — turns a string into the dark/light
 * module matrix of a valid, scannable symbol (Reed-Solomon error correction,
 * penalty-scored masking, format/version information included). Used by
 * BarcodePreview to draw honest 2-D previews the same Views-drawn, canvas-free
 * way code128.ts powers the 1-D strip. Pure logic: no DOM, no canvas, no
 * dependency — the encoder half of the symmetry whose decoder half already
 * lives in scannerTypes.ts ('qr' in NATIVE_BARCODE_TYPES).
 *
 * Scope: byte mode (UTF-8), versions 1–10 (up to 213 bytes at level M), all
 * four error-correction levels, all eight masks with ISO 18004 §8.8.2 penalty
 * selection. Values beyond version 10 capacity return null — callers fall
 * back to honest text, mirroring encodeCode128B's contract.
 */

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrEncodeOptions {
  /** Error-correction level (default "M", the common interchange default). */
  ecLevel?: QrErrorCorrectionLevel;
  /** Pin a mask pattern 0–7 (default: lowest ISO penalty score wins). */
  mask?: number;
}

export interface QrMatrix {
  /** Modules per side (17 + 4·version). */
  size: number;
  /** Symbol version 1–10. */
  version: number;
  /** Error-correction level encoded in the format information. */
  ecLevel: QrErrorCorrectionLevel;
  /** Mask pattern 0–7 encoded in the format information. */
  mask: number;
  /** Row-major dark flags, size × size entries, 1 = dark module. */
  modules: Uint8Array;
}

export interface QrRun {
  /** true = dark (ink) module run, false = light run */
  dark: boolean;
  /** run length in modules */
  modules: number;
}

/** ISO 18004 §9.1: the quiet zone is 4 light modules on every side. */
export const QR_QUIET_ZONE_MODULES = 4;

const MAX_VERSION = 10;

/** Total codewords per version 1–10 (ISO 18004 table 1). */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346] as const;

/**
 * Error-correction structure per level and version 1–10 (ISO 18004 table 9):
 * [ecCodewordsPerBlock, [blockCount, dataCodewordsPerBlock][]].
 */
type QrBlockStructure = readonly [number, readonly (readonly [number, number])[]];
const EC_BLOCKS: Record<QrErrorCorrectionLevel, readonly QrBlockStructure[]> = {
  L: [
    [7, [[1, 19]]],
    [10, [[1, 34]]],
    [15, [[1, 55]]],
    [20, [[1, 80]]],
    [26, [[1, 108]]],
    [18, [[2, 68]]],
    [20, [[2, 78]]],
    [24, [[2, 97]]],
    [30, [[2, 116]]],
    [
      18,
      [
        [2, 68],
        [2, 69],
      ],
    ],
  ],
  M: [
    [10, [[1, 16]]],
    [16, [[1, 28]]],
    [26, [[1, 44]]],
    [18, [[2, 32]]],
    [24, [[2, 43]]],
    [16, [[4, 27]]],
    [18, [[4, 31]]],
    [
      22,
      [
        [2, 38],
        [2, 39],
      ],
    ],
    [
      22,
      [
        [3, 36],
        [2, 37],
      ],
    ],
    [
      26,
      [
        [4, 43],
        [1, 44],
      ],
    ],
  ],
  Q: [
    [13, [[1, 13]]],
    [22, [[1, 22]]],
    [18, [[2, 17]]],
    [26, [[2, 24]]],
    [
      18,
      [
        [2, 15],
        [2, 16],
      ],
    ],
    [24, [[4, 19]]],
    [
      18,
      [
        [2, 14],
        [4, 15],
      ],
    ],
    [
      22,
      [
        [4, 18],
        [2, 19],
      ],
    ],
    [
      20,
      [
        [4, 16],
        [4, 17],
      ],
    ],
    [
      24,
      [
        [6, 19],
        [2, 20],
      ],
    ],
  ],
  H: [
    [17, [[1, 9]]],
    [28, [[1, 16]]],
    [22, [[2, 13]]],
    [16, [[4, 9]]],
    [
      22,
      [
        [2, 11],
        [2, 12],
      ],
    ],
    [28, [[4, 15]]],
    [
      26,
      [
        [4, 13],
        [1, 14],
      ],
    ],
    [
      26,
      [
        [4, 14],
        [2, 15],
      ],
    ],
    [
      24,
      [
        [4, 12],
        [4, 13],
      ],
    ],
    [
      28,
      [
        [6, 15],
        [2, 16],
      ],
    ],
  ],
};

/** Alignment pattern center coordinates per version 1–10 (ISO 18004 annex E). */
const ALIGNMENT_CENTERS: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Format information EC-level indicator bits (ISO 18004 table 25). */
const EC_INDICATOR: Record<QrErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

// ─── GF(256) arithmetic (primitive polynomial x⁸+x⁴+x³+x²+1 = 0x11d) ───

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
}

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Generator polynomial ∏(x − α^i), i = 0…degree−1, highest-degree first. */
function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMultiply(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon EC codewords: remainder of data·x^degree mod the generator. */
function rsEncode(data: Uint8Array, degree: number): Uint8Array {
  const generator = rsGeneratorPoly(degree);
  const remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < degree; j++) {
        remainder[j] ^= gfMultiply(generator[j + 1], factor);
      }
    }
  }
  return remainder;
}

// ─── BCH codes for format / version information ───

function bitLength(value: number): number {
  let length = 0;
  for (let v = value; v > 0; v >>>= 1) {
    length++;
  }
  return length;
}

function bchRemainder(value: number, generator: number): number {
  const generatorLength = bitLength(generator);
  let remainder = value;
  while (bitLength(remainder) >= generatorLength) {
    remainder ^= generator << (bitLength(remainder) - generatorLength);
  }
  return remainder;
}

/** 15-bit format information: 2 EC bits + 3 mask bits, BCH(15,5), XOR 0x5412. */
function formatInformation(ecLevel: QrErrorCorrectionLevel, mask: number): number {
  const data = (EC_INDICATOR[ecLevel] << 3) | mask;
  return ((data << 10) | bchRemainder(data << 10, 0x537)) ^ 0x5412;
}

/** 18-bit version information (versions ≥ 7): 6 version bits, BCH(18,6). */
function versionInformation(version: number): number {
  return (version << 12) | bchRemainder(version << 12, 0x1f25);
}

// ─── Byte-mode bit stream ───

/** UTF-8 code units for a string — hand-rolled so the encoder stays pure. */
function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const char of value) {
    const cp = char.codePointAt(0) as number;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  return bytes;
}

function dataCodewordCount(version: number, ecLevel: QrErrorCorrectionLevel): number {
  const [, groups] = EC_BLOCKS[ecLevel][version - 1];
  return groups.reduce((sum, [blocks, perBlock]) => sum + blocks * perBlock, 0);
}

/** Byte-mode character count field width (ISO 18004 table 3). */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Smallest version 1–10 whose byte-mode capacity fits, or null. */
function pickVersion(byteCount: number, ecLevel: QrErrorCorrectionLevel): number | null {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const capacityBits = dataCodewordCount(version, ecLevel) * 8;
    const neededBits = 4 + charCountBits(version) + byteCount * 8;
    if (neededBits <= capacityBits) {
      return version;
    }
  }
  return null;
}

/** Mode indicator + count + data, terminator, bit padding, pad codewords. */
function buildDataCodewords(bytes: number[], version: number, ecLevel: QrErrorCorrectionLevel): Uint8Array {
  const bits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, charCountBits(version));
  for (const byte of bytes) {
    pushBits(byte, 8);
  }

  const capacityBits = dataCodewordCount(version, ecLevel) * 8;
  pushBits(0, Math.min(4, capacityBits - bits.length));
  if (bits.length % 8 !== 0) {
    pushBits(0, 8 - (bits.length % 8));
  }

  const codewords = new Uint8Array(capacityBits / 8);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      codewords[i >> 3] |= 0x80 >> (i & 7);
    }
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8; i < codewords.length; i++) {
    codewords[i] = padBytes[(i - bits.length / 8) % 2];
  }
  return codewords;
}

/** Split into RS blocks, encode, and interleave (ISO 18004 §8.6). */
function interleaveCodewords(data: Uint8Array, version: number, ecLevel: QrErrorCorrectionLevel): Uint8Array {
  const [ecPerBlock, groups] = EC_BLOCKS[ecLevel][version - 1];
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [blockCount, perBlock] of groups) {
    for (let b = 0; b < blockCount; b++) {
      const block = data.subarray(offset, offset + perBlock);
      offset += perBlock;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecPerBlock));
    }
  }
  const result = new Uint8Array(TOTAL_CODEWORDS[version - 1]);
  let index = 0;
  const maxDataLength = Math.max(...dataBlocks.map((block) => block.length));
  for (let i = 0; i < maxDataLength; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) {
        result[index++] = block[i];
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) {
      result[index++] = block[i];
    }
  }
  return result;
}

// ─── Matrix construction ───

interface MatrixState {
  size: number;
  /** 1 = dark */
  modules: Uint8Array;
  /** 1 = function pattern / reserved (never masked) */
  reserved: Uint8Array;
}

function setModule(state: MatrixState, row: number, col: number, dark: number): void {
  const index = row * state.size + col;
  state.modules[index] = dark;
  state.reserved[index] = 1;
}

/** Finder patterns, separators, timing, alignment, dark module, reservations. */
function placeFunctionPatterns(state: MatrixState, version: number): void {
  const { size } = state;
  // Finder patterns with their light separators (8×8 corner incl. separator).
  const corners: readonly (readonly [number, number])[] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [top, left] of corners) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) {
          continue;
        }
        const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inRing && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setModule(state, row, col, dark ? 1 : 0);
      }
    }
  }
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0 ? 1 : 0;
    setModule(state, 6, i, dark);
    setModule(state, i, 6, dark);
  }
  // Alignment patterns (skip the three that would overlap finders).
  const centers = ALIGNMENT_CENTERS[version - 1];
  const last = centers[centers.length - 1];
  for (const centerRow of centers) {
    for (const centerCol of centers) {
      const overlapsFinder =
        (centerRow === 6 && centerCol === 6) ||
        (centerRow === 6 && centerCol === last) ||
        (centerRow === last && centerCol === 6);
      if (overlapsFinder) {
        continue;
      }
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setModule(state, centerRow + r, centerCol + c, dark ? 1 : 0);
        }
      }
    }
  }
  // Dark module (ISO 18004 §8.9.1: always dark at (4·version + 9, 8)).
  setModule(state, size - 8, 8, 1);
  // Reserve the format information areas so data placement skips them.
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      state.reserved[8 * size + i] = 1;
      state.reserved[i * size + 8] = 1;
    }
    if (i < 8) {
      state.reserved[8 * size + (size - 1 - i)] = 1;
      if (i < 7) {
        state.reserved[(size - 1 - i) * size + 8] = 1;
      }
    }
  }
  // Version information blocks (versions ≥ 7): 6×3 top-right + 3×6 bottom-left.
  if (version >= 7) {
    const info = versionInformation(version);
    for (let i = 0; i < 18; i++) {
      const dark = (info >> i) & 1;
      const row = size - 11 + (i % 3);
      const col = Math.floor(i / 3);
      setModule(state, row, col, dark);
      setModule(state, col, row, dark);
    }
  }
}

/** Zigzag data placement, two columns at a time, skipping the timing column. */
function placeData(state: MatrixState, codewords: Uint8Array): void {
  const { size } = state;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const col of [right, right - 1]) {
        const index = row * size + col;
        if (state.reserved[index]) {
          continue;
        }
        // Remainder positions beyond the bit stream stay light (0).
        state.modules[index] = bitIndex < totalBits ? (codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1 : 0;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

/** Mask conditions 0–7 (ISO 18004 table 23): true = flip the module. */
function maskBit(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

/** Place both copies of the 15-bit format information for a chosen mask. */
function placeFormatInformation(
  modules: Uint8Array,
  size: number,
  ecLevel: QrErrorCorrectionLevel,
  mask: number,
): void {
  const info = formatInformation(ecLevel, mask);
  const bit = (i: number) => (info >> i) & 1;
  // Copy 1 around the top-left finder.
  for (let i = 0; i <= 5; i++) {
    modules[8 * size + i] = bit(14 - i);
  }
  modules[8 * size + 7] = bit(8);
  modules[8 * size + 8] = bit(7);
  modules[7 * size + 8] = bit(6);
  for (let i = 0; i <= 5; i++) {
    modules[i * size + 8] = bit(i);
  }
  // Copy 2 split between bottom-left (col 8) and top-right (row 8).
  for (let i = 0; i < 7; i++) {
    modules[(size - 1 - i) * size + 8] = bit(14 - i);
  }
  for (let i = 0; i < 8; i++) {
    modules[8 * size + (size - 1 - i)] = bit(i);
  }
}

/** ISO 18004 §8.8.2 penalty score of a fully placed symbol. */
function penaltyScore(modules: Uint8Array, size: number): number {
  let score = 0;
  // N1: runs of 5+ same-color modules in rows and columns.
  for (let axis = 0; axis < 2; axis++) {
    for (let a = 0; a < size; a++) {
      let runColor = -1;
      let runLength = 0;
      for (let b = 0; b < size; b++) {
        const dark = axis === 0 ? modules[a * size + b] : modules[b * size + a];
        if (dark === runColor) {
          runLength++;
          if (runLength === 5) {
            score += 3;
          } else if (runLength > 5) {
            score += 1;
          }
        } else {
          runColor = dark;
          runLength = 1;
        }
      }
    }
  }
  // N2: 2×2 blocks of a single color (all overlapping positions).
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const dark = modules[row * size + col];
      if (
        dark === modules[row * size + col + 1] &&
        dark === modules[(row + 1) * size + col] &&
        dark === modules[(row + 1) * size + col + 1]
      ) {
        score += 3;
      }
    }
  }
  // N3: finder-like 1011101 pattern with 4 light modules on either side.
  const window = 11;
  const isFinderLike = (bits: number[]): boolean => {
    const core = [1, 0, 1, 1, 1, 0, 1];
    const matchesAt = (offset: number) => core.every((v, i) => bits[offset + i] === v);
    const lightRun = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        if (bits[i] !== 0) {
          return false;
        }
      }
      return true;
    };
    return (matchesAt(0) && lightRun(7, 11)) || (matchesAt(4) && lightRun(0, 4));
  };
  for (let axis = 0; axis < 2; axis++) {
    for (let a = 0; a < size; a++) {
      for (let start = 0; start + window <= size; start++) {
        const bits: number[] = [];
        for (let b = start; b < start + window; b++) {
          bits.push(axis === 0 ? modules[a * size + b] : modules[b * size + a]);
        }
        if (isFinderLike(bits)) {
          score += 40;
        }
      }
    }
  }
  // N4: dark-module proportion, 10 points per full 5% step away from 50%.
  let darkCount = 0;
  for (const module of modules) {
    darkCount += module;
  }
  const percent = (darkCount * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/**
 * Encode a string as a byte-mode QR symbol. Returns the module matrix, or
 * null when the value is empty or exceeds version 10 capacity at the chosen
 * error-correction level (callers fall back to honest text).
 */
export function encodeQr(value: string, options?: QrEncodeOptions): QrMatrix | null {
  const ecLevel = options?.ecLevel ?? 'M';
  if (!value) {
    return null;
  }
  const bytes = utf8Bytes(value);
  const version = pickVersion(bytes.length, ecLevel);
  if (version === null) {
    return null;
  }

  const codewords = interleaveCodewords(buildDataCodewords(bytes, version, ecLevel), version, ecLevel);

  const size = 17 + 4 * version;
  const base: MatrixState = {
    size,
    modules: new Uint8Array(size * size),
    reserved: new Uint8Array(size * size),
  };
  placeFunctionPatterns(base, version);
  placeData(base, codewords);

  const candidateMasks =
    options?.mask !== undefined && options.mask >= 0 && options.mask <= 7 ? [options.mask] : [0, 1, 2, 3, 4, 5, 6, 7];

  let best: { mask: number; modules: Uint8Array; score: number } | null = null;
  for (const mask of candidateMasks) {
    const masked = new Uint8Array(base.modules);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const index = row * size + col;
        if (!base.reserved[index] && maskBit(mask, row, col)) {
          masked[index] ^= 1;
        }
      }
    }
    placeFormatInformation(masked, size, ecLevel, mask);
    const score = penaltyScore(masked, size);
    if (!best || score < best.score) {
      best = { mask, modules: masked, score };
    }
  }
  const chosen = best as { mask: number; modules: Uint8Array; score: number };
  return { size, version, ecLevel, mask: chosen.mask, modules: chosen.modules };
}

/**
 * Compress each matrix row into dark/light runs — the QR twin of code128's
 * run list, so BarcodePreview draws one View per run instead of per module.
 */
export function qrRowRuns(matrix: QrMatrix): QrRun[][] {
  const rows: QrRun[][] = [];
  for (let row = 0; row < matrix.size; row++) {
    const runs: QrRun[] = [];
    for (let col = 0; col < matrix.size; col++) {
      const dark = matrix.modules[row * matrix.size + col] === 1;
      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun.dark === dark) {
        lastRun.modules += 1;
      } else {
        runs.push({ dark, modules: 1 });
      }
    }
    rows.push(runs);
  }
  return rows;
}
