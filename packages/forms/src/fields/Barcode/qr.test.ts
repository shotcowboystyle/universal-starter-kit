import { describe, expect, it } from 'vitest';

import type { QrErrorCorrectionLevel, QrMatrix } from './qr';
import { QR_QUIET_ZONE_MODULES, encodeQr, qrRowRuns } from './qr';

/** Rebuild row strings ("1" = dark) from a matrix for vector comparison. */
function toRowStrings(matrix: QrMatrix): string[] {
  const rows: string[] = [];
  for (let r = 0; r < matrix.size; r++) {
    let row = '';
    for (let c = 0; c < matrix.size; c++) {
      row += matrix.modules[r * matrix.size + c] ? '1' : '0';
    }
    rows.push(row);
  }
  return rows;
}

function darkCount(matrix: QrMatrix): number {
  let count = 0;
  for (const module of matrix.modules) {
    count += module;
  }
  return count;
}

/**
 * Reference vectors generated with the battle-tested `qrcode` npm package
 * (soldair/node-qrcode), byte-mode segments, auto mask. Each is the complete
 * module matrix of the reference symbol; every vector was additionally
 * decode-verified with jsQR during generation.
 */
const REFERENCE_VECTORS: {
  value: string;
  ecLevel: QrErrorCorrectionLevel;
  version: number;
  mask: number;
  rows: string[];
}[] = [
  {
    value: 'A',
    ecLevel: 'M',
    version: 1,
    mask: 3,
    rows: [
      '111111101001001111111',
      '100000101111101000001',
      '101110100010101011101',
      '101110101101101011101',
      '101110100111001011101',
      '100000100101101000001',
      '111111101010101111111',
      '000000001101100000000',
      '101101110011101001011',
      '010110010101111001000',
      '110011101101000001101',
      '101101000001001111100',
      '100111100100100100100',
      '000000001011001001001',
      '111111101001100101000',
      '100000101100000110110',
      '101110100110111110001',
      '101110101111001111110',
      '101110101010101100000',
      '100000100010010100101',
      '111111101000010010000',
    ],
  },
  {
    value: 'SKU-001234',
    ecLevel: 'M',
    version: 1,
    mask: 2,
    rows: [
      '111111100011001111111',
      '100000100001101000001',
      '101110101010001011101',
      '101110101110101011101',
      '101110101101101011101',
      '100000101100101000001',
      '111111101010101111111',
      '000000001011100000000',
      '101111100000101111100',
      '000000001010100010000',
      '100101101111001101010',
      '001100000000000001111',
      '010001110011011101100',
      '000000001001100011110',
      '111111100100111101110',
      '100000101101100100101',
      '101110101110111100001',
      '101110101000110011000',
      '101110101101000101100',
      '100000100110000100100',
      '111111101111000101010',
    ],
  },
  {
    value: 'https://multiplatform.one',
    ecLevel: 'M',
    version: 2,
    mask: 2,
    rows: [
      '1111111000101000101111111',
      '1000001000100111001000001',
      '1011101011010001101011101',
      '1011101010110111101011101',
      '1011101011010100101011101',
      '1000001011100111101000001',
      '1111111010101010101111111',
      '0000000011001011000000000',
      '1011111001100111001111100',
      '0010000111101010110100010',
      '1111101000100101011101011',
      '0011010011110001111110001',
      '1011101011101110011010111',
      '1110100101000100100101010',
      '1000001010011011010111011',
      '1010100101010011001110001',
      '1010011101111101111110100',
      '0000000011001100100011000',
      '1111111001100110101010111',
      '1000001011000000100011011',
      '1011101010101111111110100',
      '1011101011010100011011111',
      '1011101011001111110001101',
      '1000001001110011111111001',
      '1111111010011110001111111',
    ],
  },
];

/**
 * Compact fingerprints (version, auto mask, dark-module count) for cases
 * whose full matrices would bloat the spec — same trusted generator, all
 * decode-verified. Covers multi-byte UTF-8, versions 5 and 10, and the
 * L/Q/H error-correction levels.
 */
const REFERENCE_FINGERPRINTS: [
  label: string,
  value: string,
  ecLevel: QrErrorCorrectionLevel,
  version: number,
  mask: number,
  dark: number,
][] = [
  ['héllo', 'héllo', 'M', 1, 2, 224],
  ['日本語のテキスト', '日本語のテキスト', 'M', 2, 3, 314],
  ['80 digits', '0123456789'.repeat(8), 'M', 5, 2, 682],
  ['213 bytes (v10 capacity edge)', 'x'.repeat(213), 'M', 10, 0, 1674],
  ['SKU-001234 level L', 'SKU-001234', 'L', 1, 4, 232],
  ['SKU-001234 level Q', 'SKU-001234', 'Q', 1, 1, 216],
  ['SKU-001234 level H', 'SKU-001234', 'H', 2, 6, 332],
];

describe('encodeQr — reference vectors', () => {
  for (const vector of REFERENCE_VECTORS) {
    it(`reproduces the reference matrix for ${JSON.stringify(vector.value)} (${vector.ecLevel}, v${vector.version})`, () => {
      const matrix = encodeQr(vector.value, { ecLevel: vector.ecLevel });
      expect(matrix).not.toBeNull();
      expect(matrix!.version).toBe(vector.version);
      expect(matrix!.mask).toBe(vector.mask);
      expect(matrix!.size).toBe(17 + 4 * vector.version);
      expect(toRowStrings(matrix!)).toEqual(vector.rows);
    });
  }

  for (const [label, value, ecLevel, version, mask, dark] of REFERENCE_FINGERPRINTS) {
    it(`matches the reference fingerprint for ${label}`, () => {
      const matrix = encodeQr(value, { ecLevel });
      expect(matrix).not.toBeNull();
      expect(matrix!.version).toBe(version);
      expect(matrix!.mask).toBe(mask);
      expect(darkCount(matrix!)).toBe(dark);
    });
  }

  it('encodes what Code 128 B cannot — the scan-but-cannot-draw asymmetry is closed', () => {
    // encodeCode128B("héllo") is null (non-ASCII); the QR encoder draws it.
    expect(encodeQr('héllo')).not.toBeNull();
  });
});

describe('encodeQr — structural invariants', () => {
  const isDark = (matrix: QrMatrix, row: number, col: number) => matrix.modules[row * matrix.size + col] === 1;

  /** The 7×7 finder ring: dark border, light ring, dark 3×3 core. */
  function expectFinderAt(matrix: QrMatrix, top: number, left: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const expected = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        expect(isDark(matrix, top + r, left + c)).toBe(expected);
      }
    }
  }

  const samples = ['A', 'SKU-001234', '0123456789'.repeat(8), 'x'.repeat(213)];

  for (const value of samples) {
    it(`places finders, timing, and the dark module for ${value.length} byte(s)`, () => {
      const matrix = encodeQr(value)!;
      const { size } = matrix;
      expect(size).toBe(17 + 4 * matrix.version);
      expectFinderAt(matrix, 0, 0);
      expectFinderAt(matrix, 0, size - 7);
      expectFinderAt(matrix, size - 7, 0);
      // Separators are light.
      for (let i = 0; i < 8; i++) {
        expect(isDark(matrix, 7, i)).toBe(false);
        expect(isDark(matrix, i, 7)).toBe(false);
        expect(isDark(matrix, 7, size - 1 - i)).toBe(false);
        expect(isDark(matrix, i, size - 8)).toBe(false);
        expect(isDark(matrix, size - 8, i)).toBe(false);
        expect(isDark(matrix, size - 1 - i, 7)).toBe(false);
      }
      // Timing patterns alternate, dark on even coordinates.
      for (let i = 8; i < size - 8; i++) {
        expect(isDark(matrix, 6, i)).toBe(i % 2 === 0);
        expect(isDark(matrix, i, 6)).toBe(i % 2 === 0);
      }
      // The always-dark module beside the bottom-left finder.
      expect(isDark(matrix, size - 8, 8)).toBe(true);
    });
  }

  it('agrees between both format information copies and encodes the declared mask', () => {
    for (const value of samples) {
      const matrix = encodeQr(value)!;
      const { size } = matrix;
      const bits = new Array<number>(15).fill(0);
      // Copy 1 around the top-left finder (bit 14 → bit 0).
      for (let i = 0; i <= 5; i++) {
        bits[14 - i] = isDark(matrix, 8, i) ? 1 : 0;
      }
      bits[8] = isDark(matrix, 8, 7) ? 1 : 0;
      bits[7] = isDark(matrix, 8, 8) ? 1 : 0;
      bits[6] = isDark(matrix, 7, 8) ? 1 : 0;
      for (let i = 0; i <= 5; i++) {
        bits[i] = isDark(matrix, i, 8) ? 1 : 0;
      }
      // Copy 2 must agree bit-for-bit.
      const copy2 = new Array<number>(15).fill(0);
      for (let i = 0; i < 7; i++) {
        copy2[14 - i] = isDark(matrix, size - 1 - i, 8) ? 1 : 0;
      }
      for (let i = 0; i < 8; i++) {
        copy2[i] = isDark(matrix, 8, size - 1 - i) ? 1 : 0;
      }
      expect(copy2).toEqual(bits);
      // Unmask (XOR 0x5412) and check the declared mask and EC level survive.
      const raw = bits.reduce((acc, bit, index) => acc | (bit << index), 0) ^ 0x5412;
      expect((raw >> 10) & 0b111).toBe(matrix.mask);
      const ecIndicator = { L: 1, M: 0, Q: 3, H: 2 }[matrix.ecLevel];
      expect((raw >> 13) & 0b11).toBe(ecIndicator);
    }
  });

  it('emits BCH-valid version information blocks for versions ≥ 7', () => {
    const matrix = encodeQr('x'.repeat(213))!; // v10
    const { size } = matrix;
    let info = 0;
    for (let i = 0; i < 18; i++) {
      const row = size - 11 + (i % 3);
      const col = Math.floor(i / 3);
      if (isDark(matrix, row, col)) {
        info |= 1 << i;
      }
      // The top-right copy mirrors the bottom-left one.
      expect(isDark(matrix, col, row)).toBe(isDark(matrix, row, col));
    }
    expect(info >> 12).toBe(matrix.version);
    // Golay(18,6) residue check: the whole 18-bit word divides by 0x1f25.
    let remainder = info;
    while (remainder >= 1 << 12) {
      let shift = 0;
      for (let v = remainder >> 13; v > 0; v >>= 1) {
        shift++;
      }
      remainder ^= 0x1f25 << shift;
    }
    expect(remainder).toBe(0);
  });
});

describe('encodeQr — capacity and null contract', () => {
  it('returns null for the empty value (hosts own the empty state)', () => {
    expect(encodeQr('')).toBeNull();
  });

  it('selects the smallest version that fits (byte capacity boundaries)', () => {
    expect(encodeQr('x'.repeat(14), { ecLevel: 'M' })!.version).toBe(1);
    expect(encodeQr('x'.repeat(15), { ecLevel: 'M' })!.version).toBe(2);
    expect(encodeQr('x'.repeat(213), { ecLevel: 'M' })!.version).toBe(10);
  });

  it('returns null past version 10 capacity instead of lying', () => {
    expect(encodeQr('x'.repeat(214), { ecLevel: 'M' })).toBeNull();
  });

  it('counts UTF-8 bytes, not code units', () => {
    // 14 × 'é' = 28 bytes — past v1-M's 14-byte capacity despite length 14.
    const matrix = encodeQr('é'.repeat(14), { ecLevel: 'M' })!;
    expect(matrix.version).toBeGreaterThan(1);
  });
});

describe('encodeQr — masks', () => {
  it('produces eight distinct, format-consistent symbols when pinned', () => {
    const seen = new Set<string>();
    for (let mask = 0; mask < 8; mask++) {
      const matrix = encodeQr('SKU-001234', { mask })!;
      expect(matrix.mask).toBe(mask);
      seen.add(toRowStrings(matrix).join(''));
    }
    expect(seen.size).toBe(8);
  });

  it('auto-selects the reference mask (penalty scoring, ISO 18004 §8.8.2)', () => {
    // Auto choice must equal the pinned-reference mask from the vectors above.
    expect(encodeQr('A')!.mask).toBe(3);
    expect(encodeQr('SKU-001234')!.mask).toBe(2);
  });
});

describe('qrRowRuns', () => {
  it('compresses rows into alternating runs that rebuild the matrix', () => {
    const matrix = encodeQr('SKU-001234')!;
    const rows = qrRowRuns(matrix);
    expect(rows).toHaveLength(matrix.size);
    for (let r = 0; r < matrix.size; r++) {
      let col = 0;
      for (let i = 0; i < rows[r].length; i++) {
        const run = rows[r][i];
        if (i > 0) {
          expect(run.dark).toBe(!rows[r][i - 1].dark);
        }
        for (let k = 0; k < run.modules; k++) {
          expect(matrix.modules[r * matrix.size + col] === 1).toBe(run.dark);
          col++;
        }
      }
      expect(col).toBe(matrix.size);
    }
  });

  it('exposes the ISO quiet zone width for renderers', () => {
    expect(QR_QUIET_ZONE_MODULES).toBe(4);
  });
});
