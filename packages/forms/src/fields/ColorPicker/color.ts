// ---------------------------------------------------------------------------
// Color conversion utilities
// ---------------------------------------------------------------------------

const SHORT_HEX = /^#(?<r>[a-f\d])(?<g>[a-f\d])(?<b>[a-f\d])$/iu;
const LONG_HEX = /^#(?<r>[a-f\d]{2})(?<g>[a-f\d]{2})(?<b>[a-f\d]{2})(?<a>[a-f\d]{2})?$/iu;
const VALID_HEX = /^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/iu;

export const hsvToRgb = (h: number, s: number, v: number) => {
  const h6 = (h / 360) * 6;
  const s1 = s / 100;
  const v1 = v / 100;

  const i = Math.floor(h6);
  const f = h6 - i;
  const p = v1 * (1 - s1);
  const q = v1 * (1 - f * s1);
  const t = v1 * (1 - (1 - f) * s1);

  let r: number;
  let g: number;
  let b: number;

  switch (i % 6) {
    case 0: {
      r = v1;
      g = t;
      b = p;
      break;
    }
    case 1: {
      r = q;
      g = v1;
      b = p;
      break;
    }
    case 2: {
      r = p;
      g = v1;
      b = t;
      break;
    }
    case 3: {
      r = p;
      g = q;
      b = v1;
      break;
    }
    case 4: {
      r = t;
      g = p;
      b = v1;
      break;
    }
    default: {
      r = v1;
      g = p;
      b = q;
      break;
    }
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
};

const channelHex = (x: number) => {
  const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`.toUpperCase();

export const hsvToHex = (h: number, s: number, v: number): string => {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
};

/** Parse #RGB, #RRGGBB, or #RRGGBBAA. Alpha is 0–100. */
export const parseHex = (hex: string): { r: number; g: number; b: number; alpha: number } | null => {
  const raw = hex.startsWith('#') ? hex : `#${hex}`;
  const short = SHORT_HEX.exec(raw)?.groups;
  if (short) {
    return {
      r: Number.parseInt(short.r + short.r, 16),
      g: Number.parseInt(short.g + short.g, 16),
      b: Number.parseInt(short.b + short.b, 16),
      alpha: 100,
    };
  }
  const long = LONG_HEX.exec(raw)?.groups;
  if (long) {
    return {
      r: Number.parseInt(long.r, 16),
      g: Number.parseInt(long.g, 16),
      b: Number.parseInt(long.b, 16),
      alpha: long.a === undefined ? 100 : Math.round((Number.parseInt(long.a, 16) / 255) * 100),
    };
  }
  return null;
};

export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const parsed = parseHex(hex);
  if (!parsed) {
    return null;
  }
  return { r: parsed.r, g: parsed.g, b: parsed.b };
};

export const rgbToHsv = (r: number, g: number, b: number) => {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;

  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  if (d !== 0) {
    switch (max) {
      case r1: {
        h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) / 6;
        break;
      }
      case g1: {
        h = ((b1 - r1) / d + 2) / 6;
        break;
      }
      // max is b1: it is always one of the three channels.
      default: {
        h = ((r1 - g1) / d + 4) / 6;
        break;
      }
    }
    h *= 360;
  }

  return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
};

export const hexToHsv = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return { h: 0, s: 100, v: 100 };
  }
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
};

export const isValidHex = (hex: string): boolean => VALID_HEX.test(hex);

/** RGB hex (#RRGGBB). 8-digit input drops the alpha byte (use parseHex for alpha). */
export const normalizeHex = (hex: string): string => {
  const parsed = parseHex(hex);
  if (!parsed) {
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    return normalized.toUpperCase();
  }
  return rgbToHex(parsed.r, parsed.g, parsed.b);
};

export const hexAlphaByte = (alpha: number): string => {
  const clamped = Math.max(0, Math.min(100, Math.round(alpha)));
  return Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
};
