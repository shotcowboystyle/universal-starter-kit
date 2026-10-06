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

// GF(256), Reed-Solomon and BCH arithmetic are carry-less (XOR) by definition.
// Every other shift/mask/or in this file is expressed as integer arithmetic.
// oxlint-disable-next-line eslint/no-bitwise -- carry-less addition over GF(2) has no arithmetic equivalent; confined to this single helper
const xor = (a: number, b: number): number => a ^ b;

// ─── GF(256) arithmetic (primitive polynomial x⁸+x⁴+x³+x²+1 = 0x11d) ───

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x *= 2;
    if (x >= 0x1_00) {
      x = xor(x, 0x1_1d);
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
}

const gfMultiply = (a: number, b: number): number => {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
};

/** Generator polynomial ∏(x − α^i), i = 0…degree−1, highest-degree first. */
const rsGeneratorPoly = (degree: number): Uint8Array => {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = xor(next[j], poly[j]);
      next[j + 1] = xor(next[j + 1], gfMultiply(poly[j], GF_EXP[i]));
    }
    poly = next;
  }
  return poly;
};

/** Reed-Solomon EC codewords: remainder of data·x^degree mod the generator. */
const rsEncode = (data: Uint8Array, degree: number): Uint8Array => {
  const generator = rsGeneratorPoly(degree);
  const remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = xor(byte, remainder[0]);
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < degree; j += 1) {
        remainder[j] = xor(remainder[j], gfMultiply(generator[j + 1], factor));
      }
    }
  }
  return remainder;
};

// ─── BCH codes for format / version information ───

/** Bit `index` (0 = least significant) of a non-negative integer. */
const bitAt = (value: number, index: number): number => Math.floor(value / 2 ** index) % 2;

const bitLength = (value: number): number => {
  let length = 0;
  for (let v = value; v > 0; v = Math.floor(v / 2)) {
    length += 1;
  }
  return length;
};

const bchRemainder = (value: number, generator: number): number => {
  const generatorLength = bitLength(generator);
  let remainder = value;
  while (bitLength(remainder) >= generatorLength) {
    remainder = xor(remainder, generator * 2 ** (bitLength(remainder) - generatorLength));
  }
  return remainder;
};

/** 15-bit format information: 2 EC bits + 3 mask bits, BCH(15,5), XOR 0x5412. */
const formatInformation = (ecLevel: QrErrorCorrectionLevel, mask: number): number => {
  const data = EC_INDICATOR[ecLevel] * 8 + mask;
  return xor(data * 1024 + bchRemainder(data * 1024, 0x5_37), 0x54_12);
};

/** 18-bit version information (versions ≥ 7): 6 version bits, BCH(18,6). */
const versionInformation = (version: number): number => version * 4096 + bchRemainder(version * 4096, 0x1f_25);

// ─── Byte-mode bit stream ───

/** UTF-8 code units for a string — hand-rolled so the encoder stays pure. */
const utf8Bytes = (value: string): number[] => {
  const bytes: number[] = [];
  for (const char of value) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x8_00) {
      bytes.push(0xc0 + Math.floor(cp / 64), 0x80 + (cp % 64));
    } else if (cp < 0x1_00_00) {
      bytes.push(0xe0 + Math.floor(cp / 4096), 0x80 + (Math.floor(cp / 64) % 64), 0x80 + (cp % 64));
    } else {
      bytes.push(
        0xf0 + Math.floor(cp / 262_144),
        0x80 + (Math.floor(cp / 4096) % 64),
        0x80 + (Math.floor(cp / 64) % 64),
        0x80 + (cp % 64),
      );
    }
  }
  return bytes;
};

const dataCodewordCount = (version: number, ecLevel: QrErrorCorrectionLevel): number => {
  const [, groups] = EC_BLOCKS[ecLevel][version - 1];
  return groups.reduce((sum, [blocks, perBlock]) => sum + blocks * perBlock, 0);
};

/** Byte-mode character count field width (ISO 18004 table 3). */
const charCountBits = (version: number): number => (version <= 9 ? 8 : 16);

/** Smallest version 1–10 whose byte-mode capacity fits, or null. */
const pickVersion = (byteCount: number, ecLevel: QrErrorCorrectionLevel): number | null => {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const capacityBits = dataCodewordCount(version, ecLevel) * 8;
    const neededBits = 4 + charCountBits(version) + byteCount * 8;
    if (neededBits <= capacityBits) {
      return version;
    }
  }
  return null;
};

/** Mode indicator + count + data, terminator, bit padding, pad codewords. */
const buildDataCodewords = (bytes: number[], version: number, ecLevel: QrErrorCorrectionLevel): Uint8Array => {
  const bits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push(bitAt(value, i));
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
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] === 1) {
      codewords[Math.floor(i / 8)] += 0x80 / 2 ** (i % 8);
    }
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8; i < codewords.length; i += 1) {
    codewords[i] = padBytes[(i - bits.length / 8) % 2];
  }
  return codewords;
};

/** Split into RS blocks, encode, and interleave (ISO 18004 §8.6). */
const interleaveCodewords = (data: Uint8Array, version: number, ecLevel: QrErrorCorrectionLevel): Uint8Array => {
  const [ecPerBlock, groups] = EC_BLOCKS[ecLevel][version - 1];
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [blockCount, perBlock] of groups) {
    for (let b = 0; b < blockCount; b += 1) {
      const block = data.subarray(offset, offset + perBlock);
      offset += perBlock;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecPerBlock));
    }
  }
  const result = new Uint8Array(TOTAL_CODEWORDS[version - 1]);
  let index = 0;
  const maxDataLength = Math.max(...dataBlocks.map((block) => block.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) {
        result[index] = block[i];
        index += 1;
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) {
      result[index] = block[i];
      index += 1;
    }
  }
  return result;
};

// ─── Matrix construction ───

interface MatrixState {
  size: number;
  /** 1 = dark */
  modules: Uint8Array;
  /** 1 = function pattern / reserved (never masked) */
  reserved: Uint8Array;
}

const setModule = (state: MatrixState, row: number, col: number, dark: number): void => {
  const index = row * state.size + col;
  state.modules[index] = dark;
  state.reserved[index] = 1;
};

/** Dark flag of a finder pattern module at offset (r, c) from its top-left corner. */
const isFinderModuleDark = (r: number, c: number): boolean => {
  if (r < 0 || r > 6 || c < 0 || c > 6) {
    return false;
  }
  if (r === 0 || r === 6 || c === 0 || c === 6) {
    return true;
  }
  return r >= 2 && r <= 4 && c >= 2 && c <= 4;
};

/** Finder patterns with their light separators (8×8 corner incl. separator). */
const placeFinderPatterns = (state: MatrixState): void => {
  const { size } = state;
  const corners: readonly (readonly [number, number])[] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [top, left] of corners) {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const row = top + r;
        const col = left + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          setModule(state, row, col, isFinderModuleDark(r, c) ? 1 : 0);
        }
      }
    }
  }
};

const placeTimingPatterns = (state: MatrixState): void => {
  for (let i = 8; i < state.size - 8; i += 1) {
    const dark = i % 2 === 0 ? 1 : 0;
    setModule(state, 6, i, dark);
    setModule(state, i, 6, dark);
  }
};

/** True for the three alignment centers that would collide with a finder pattern. */
const overlapsFinder = (centerRow: number, centerCol: number, last: number | undefined): boolean => {
  const colIsFirst = centerCol === 6;
  const topEdge = centerRow === 6 && (colIsFirst || centerCol === last);
  const bottomLeft = centerRow === last && colIsFirst;
  return topEdge || bottomLeft;
};

const placeAlignmentPattern = (state: MatrixState, centerRow: number, centerCol: number): void => {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      setModule(state, centerRow + r, centerCol + c, dark ? 1 : 0);
    }
  }
};

/** Alignment patterns (skip the three that would overlap finders). */
const placeAlignmentPatterns = (state: MatrixState, version: number): void => {
  const centers = ALIGNMENT_CENTERS[version - 1];
  const last = centers.at(-1);
  for (const centerRow of centers) {
    for (const centerCol of centers) {
      if (!overlapsFinder(centerRow, centerCol, last)) {
        placeAlignmentPattern(state, centerRow, centerCol);
      }
    }
  }
};

/** Reserve the format information areas so data placement skips them. */
const reserveFormatAreas = (state: MatrixState): void => {
  const { size } = state;
  for (let i = 0; i <= 8; i += 1) {
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
};

/** Version information blocks (versions ≥ 7): 6×3 top-right + 3×6 bottom-left. */
const placeVersionInformation = (state: MatrixState, version: number): void => {
  const info = versionInformation(version);
  for (let i = 0; i < 18; i += 1) {
    const dark = bitAt(info, i);
    const row = state.size - 11 + (i % 3);
    const col = Math.floor(i / 3);
    setModule(state, row, col, dark);
    setModule(state, col, row, dark);
  }
};

/** Finder patterns, separators, timing, alignment, dark module, reservations. */
const placeFunctionPatterns = (state: MatrixState, version: number): void => {
  placeFinderPatterns(state);
  placeTimingPatterns(state);
  placeAlignmentPatterns(state, version);
  // Dark module (ISO 18004 §8.9.1: always dark at (4·version + 9, 8)).
  setModule(state, state.size - 8, 8, 1);
  reserveFormatAreas(state);
  if (version >= 7) {
    placeVersionInformation(state, version);
  }
};

/** Zigzag data placement, two columns at a time, skipping the timing column. */
const placeData = (state: MatrixState, codewords: Uint8Array): void => {
  const { size } = state;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;
  let right = size - 1;
  while (right >= 1) {
    if (right === 6) {
      right = 5;
    }
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (const col of [right, right - 1]) {
        const index = row * size + col;
        if (state.reserved[index] === 0) {
          // Remainder positions beyond the bit stream stay light (0).
          state.modules[index] =
            bitIndex < totalBits ? bitAt(codewords[Math.floor(bitIndex / 8)], 7 - (bitIndex % 8)) : 0;
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
    right -= 2;
  }
};

/** Mask conditions 0–7 (ISO 18004 table 23): true = flip the module. */
const maskBit = (mask: number, row: number, col: number): boolean => {
  switch (mask) {
    case 0: {
      return (row + col) % 2 === 0;
    }
    case 1: {
      return row % 2 === 0;
    }
    case 2: {
      return col % 3 === 0;
    }
    case 3: {
      return (row + col) % 3 === 0;
    }
    case 4: {
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    }
    case 5: {
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    }
    case 6: {
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
    default: {
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
  }
};

/** Place both copies of the 15-bit format information for a chosen mask. */
const placeFormatInformation = (
  modules: Uint8Array,
  size: number,
  ecLevel: QrErrorCorrectionLevel,
  mask: number,
): void => {
  const info = formatInformation(ecLevel, mask);
  const bit = (i: number) => bitAt(info, i);
  // Copy 1 around the top-left finder.
  for (let i = 0; i <= 5; i += 1) {
    modules[8 * size + i] = bit(14 - i);
  }
  modules[8 * size + 7] = bit(8);
  modules[8 * size + 8] = bit(7);
  modules[7 * size + 8] = bit(6);
  for (let i = 0; i <= 5; i += 1) {
    modules[i * size + 8] = bit(i);
  }
  // Copy 2 split between bottom-left (col 8) and top-right (row 8).
  for (let i = 0; i < 7; i += 1) {
    modules[(size - 1 - i) * size + 8] = bit(14 - i);
  }
  for (let i = 0; i < 8; i += 1) {
    modules[8 * size + (size - 1 - i)] = bit(i);
  }
};

/** Module at position `b` along line `a`: rows when axis is 0, columns otherwise. */
const lineModule = (modules: Uint8Array, size: number, axis: number, a: number, b: number): number =>
  axis === 0 ? modules[a * size + b] : modules[b * size + a];

/** N1: runs of 5+ same-color modules in rows and columns. */
const penaltyRuns = (modules: Uint8Array, size: number): number => {
  let score = 0;
  for (let axis = 0; axis < 2; axis += 1) {
    for (let a = 0; a < size; a += 1) {
      let runColor = -1;
      let runLength = 0;
      for (let b = 0; b < size; b += 1) {
        const dark = lineModule(modules, size, axis, a, b);
        if (dark === runColor) {
          runLength += 1;
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
  return score;
};

/** N2: 2×2 blocks of a single color (all overlapping positions). */
const penaltyBlocks = (modules: Uint8Array, size: number): number => {
  let score = 0;
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
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
  return score;
};

const FINDER_CORE = [1, 0, 1, 1, 1, 0, 1];

/** 1011101 with 4 light modules on either side, within an 11-module window. */
const isFinderLike = (bits: number[]): boolean => {
  const matchesAt = (offset: number) => FINDER_CORE.every((v, i) => bits[offset + i] === v);
  const lightRun = (from: number, to: number) => {
    for (let i = from; i < to; i += 1) {
      if (bits[i] !== 0) {
        return false;
      }
    }
    return true;
  };
  return (matchesAt(0) && lightRun(7, 11)) || (matchesAt(4) && lightRun(0, 4));
};

/** N3: finder-like patterns in rows and columns. */
const penaltyFinderLike = (modules: Uint8Array, size: number): number => {
  const window = 11;
  let score = 0;
  for (let axis = 0; axis < 2; axis += 1) {
    for (let a = 0; a < size; a += 1) {
      for (let start = 0; start + window <= size; start += 1) {
        const bits: number[] = [];
        for (let b = start; b < start + window; b += 1) {
          bits.push(lineModule(modules, size, axis, a, b));
        }
        if (isFinderLike(bits)) {
          score += 40;
        }
      }
    }
  }
  return score;
};

/** N4: dark-module proportion, 10 points per full 5% step away from 50%. */
const penaltyBalance = (modules: Uint8Array, size: number): number => {
  let darkCount = 0;
  for (const cell of modules) {
    darkCount += cell;
  }
  const percent = (darkCount * 100) / (size * size);
  return Math.floor(Math.abs(percent - 50) / 5) * 10;
};

/** ISO 18004 §8.8.2 penalty score of a fully placed symbol. */
const penaltyScore = (modules: Uint8Array, size: number): number =>
  penaltyRuns(modules, size) +
  penaltyBlocks(modules, size) +
  penaltyFinderLike(modules, size) +
  penaltyBalance(modules, size);

/** The base symbol with one mask applied, its format information placed, and its penalty scored. */
const scoreMask = (base: MatrixState, ecLevel: QrErrorCorrectionLevel, mask: number) => {
  const { size } = base;
  const modules = new Uint8Array(base.modules);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col;
      if (base.reserved[index] === 0 && maskBit(mask, row, col)) {
        modules[index] = 1 - modules[index];
      }
    }
  }
  placeFormatInformation(modules, size, ecLevel, mask);
  return { mask, modules, score: penaltyScore(modules, size) };
};

/**
 * Encode a string as a byte-mode QR symbol. Returns the module matrix, or
 * null when the value is empty or exceeds version 10 capacity at the chosen
 * error-correction level (callers fall back to honest text).
 */
export const encodeQr = (value: string, options?: QrEncodeOptions): QrMatrix | null => {
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

  // Strict `<` keeps the first lowest-penalty mask on ties.
  const scored = candidateMasks.map((mask) => scoreMask(base, ecLevel, mask));
  let [chosen] = scored;
  for (const candidate of scored) {
    if (candidate.score < chosen.score) {
      chosen = candidate;
    }
  }
  return { size, version, ecLevel, mask: chosen.mask, modules: chosen.modules };
};

/**
 * Compress each matrix row into dark/light runs — the QR twin of code128's
 * run list, so BarcodePreview draws one View per run instead of per module.
 */
export const qrRowRuns = (matrix: QrMatrix): QrRun[][] => {
  const rows: QrRun[][] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    const runs: QrRun[] = [];
    for (let col = 0; col < matrix.size; col += 1) {
      const dark = matrix.modules[row * matrix.size + col] === 1;
      const lastRun = runs.at(-1);
      if (lastRun !== undefined && lastRun.dark === dark) {
        lastRun.modules += 1;
      } else {
        runs.push({ dark, modules: 1 });
      }
    }
    rows.push(runs);
  }
  return rows;
};
