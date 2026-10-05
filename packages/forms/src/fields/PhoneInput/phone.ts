import { sizeRecipeForToken } from '@repo/theme';

import { dialCodes, regionCodes } from './dialCodes';
import { regionNames } from './regionNames';

/** Countries pinned to the top of the picker (intl-tel preferredCountries). */
export const PREFERRED_REGIONS = ['US', 'GB', 'CA', 'AU', 'IN', 'DE', 'FR', 'BR', 'MX', 'JP'] as const;

const NANP = new Set([
  'US',
  'CA',
  'AG',
  'AI',
  'AS',
  'BB',
  'BM',
  'BS',
  'DM',
  'DO',
  'GD',
  'GU',
  'JM',
  'KN',
  'KY',
  'LC',
  'MP',
  'MS',
  'PR',
  'SX',
  'TC',
  'TT',
  'VC',
  'VG',
  'VI',
]);

/** National-digit grouping from the start (spaces). US/CA/GB are special-cased. */
const GROUPS: Record<string, number[]> = {
  AE: [2, 3, 4],
  AU: [4, 3, 3],
  BR: [2, 5, 4],
  CN: [3, 4, 4],
  DE: [4, 4, 4],
  ES: [3, 3, 3],
  FR: [2, 2, 2, 2, 2],
  HK: [4, 4],
  IE: [2, 3, 4],
  IN: [5, 5],
  IT: [3, 3, 4],
  JP: [3, 4, 4],
  KR: [3, 4, 4],
  MX: [2, 4, 4],
  NL: [2, 4, 4],
  NZ: [2, 3, 4],
  SA: [2, 3, 4],
  SG: [4, 4],
  ZA: [2, 3, 4],
};

/** Example national digits for the selected country (intl-tel placeholderNumberType). */
const EXAMPLES: Record<string, string> = {
  AE: '501234567',
  AU: '0412345678',
  BR: '11987654321',
  CA: '4165550123',
  CN: '13123456789',
  DE: '03012345678',
  ES: '612345678',
  FR: '0612345678',
  GB: '07400123456',
  HK: '51234567',
  IE: '0851234567',
  IN: '9876543210',
  IT: '3123456789',
  JP: '09012345678',
  KR: '1012345678',
  MX: '5512345678',
  NL: '0612345678',
  NZ: '0211234567',
  SA: '501234567',
  SG: '81234567',
  US: '2015550123',
  ZA: '0821234567',
};

// Flag/caret glyphs are control-internal icons: they ride the
// generated recipe's icon channel, not a handwritten per-token px map. The
// caret is a chevron accent at 3/4 of the icon (md keeps the previous 12).

export interface PhoneCountryOption {
  value: string;
  label: string;
  keywords: string;
}

export interface ParsedPhone {
  region: string;
  national: string;
}

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

export function countryCodeToFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function flagSizeForToken(sizeToken: string | undefined): number {
  return sizeRecipeForToken(sizeToken ?? '$4').iconSize;
}

export function caretSizeForToken(sizeToken: string | undefined): number {
  return Math.round(sizeRecipeForToken(sizeToken ?? '$4').iconSize * 0.75);
}

export function dialOf(region: string): string {
  return String(dialCodes[region] ?? 1);
}

function regionName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    if (name && name !== code) {
      return name;
    }
  } catch {
    // Hermes: no Intl.DisplayNames.
  }
  return regionNames[code] ?? code;
}

export function detectRegion(raw: string, hint = 'US'): string {
  const fallback = hint in dialCodes ? hint : 'US';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('+')) {
    return fallback;
  }
  const rest = digitsOnly(trimmed.slice(1));
  if (!rest) {
    return fallback;
  }

  const matches: { region: string; len: number }[] = [];
  for (const [region, code] of Object.entries(dialCodes)) {
    const s = String(code);
    if (rest.startsWith(s)) {
      matches.push({ region, len: s.length });
    }
  }
  if (matches.length === 0) {
    return fallback;
  }
  const maxLen = Math.max(...matches.map((m) => m.len));
  const tied = matches.filter((m) => m.len === maxLen);
  if (tied.some((m) => m.region === fallback)) {
    return fallback;
  }
  const preferred = PREFERRED_REGIONS.find((r) => tied.some((m) => m.region === r));
  if (preferred) {
    return preferred;
  }
  return tied[0]?.region ?? fallback;
}

export function nationalDigitsFromRaw(raw: string, region: string): string {
  let d = digitsOnly(raw);
  const cc = dialOf(region);
  const max = Math.max(4, 15 - cc.length);
  if (raw.trim().startsWith('+') && d.startsWith(cc)) {
    d = d.slice(cc.length);
  }
  return d.slice(0, max);
}

export function toE164(region: string, national: string): string {
  const cc = dialOf(region);
  let d = digitsOnly(national);
  if (d.startsWith('0')) {
    d = d.slice(1);
  }
  if (!d) {
    return '';
  }
  return `+${cc}${d}`;
}

function formatNanp(d: string): string {
  const core = d.slice(0, 10);
  const extra = d.slice(10);
  let out = core;
  if (core.length > 6) {
    out = `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`;
  } else if (core.length > 3) {
    out = `(${core.slice(0, 3)}) ${core.slice(3)}`;
  }
  return extra ? `${out} ${extra}` : out;
}

function formatGb(d: string): string {
  if (d.startsWith('07') && d.length > 5) {
    return formatGrouped(d, [5, 3, 3]);
  }
  if (d.length <= 4) {
    return d;
  }
  if (d.length <= 7) {
    return `${d.slice(0, 4)} ${d.slice(4)}`;
  }
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 11)}`;
}

function formatGrouped(d: string, groups: number[]): string {
  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= d.length) {
      break;
    }
    parts.push(d.slice(i, i + g));
    i += g;
  }
  if (i < d.length) {
    parts.push(d.slice(i));
  }
  return parts.join(' ');
}

export function formatNational(region: string, national: string): string {
  const d = digitsOnly(national);
  if (!d) {
    return '';
  }
  if (NANP.has(region)) {
    return formatNanp(d);
  }
  if (region === 'GB') {
    return formatGb(d);
  }
  const groups = GROUPS[region];
  if (groups) {
    return formatGrouped(d, groups);
  }
  return formatGrouped(d, [3, 3, 3, 3]);
}

export function parsePhone(raw: string | undefined, defaultRegion = 'US'): ParsedPhone {
  const fallback = defaultRegion in dialCodes ? defaultRegion : 'US';
  if (!raw || !String(raw).trim()) {
    return { region: fallback, national: '' };
  }
  const text = String(raw);
  const region = detectRegion(text, fallback);
  return { region, national: nationalDigitsFromRaw(text, region) };
}

export function examplePlaceholder(region: string): string {
  const digits = EXAMPLES[region] ?? EXAMPLES.US;
  return formatNational(region, digits);
}

export function caretIndexForDigitCount(formatted: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0;
  }
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i] ?? '')) {
      seen++;
      if (seen >= digitCount) {
        return i + 1;
      }
    }
  }
  return formatted.length;
}

let countryOptionsCache: PhoneCountryOption[] | undefined;

export function getCountryOptions(): PhoneCountryOption[] {
  if (countryOptionsCache) {
    return countryOptionsCache;
  }
  const preferred = new Set<string>(PREFERRED_REGIONS);
  const make = (code: string): PhoneCountryOption => {
    const name = regionName(code);
    const dial = dialOf(code);
    return {
      value: code,
      label: `${countryCodeToFlag(code)}  ${name}  +${dial}`,
      keywords: `${code} +${dial} ${name}`,
    };
  };
  const rest = regionCodes
    .filter((code) => !preferred.has(code))
    .sort((a, b) => regionName(a).localeCompare(regionName(b)));
  countryOptionsCache = [...PREFERRED_REGIONS.filter((code) => code in dialCodes), ...rest].map(make);
  return countryOptionsCache;
}
