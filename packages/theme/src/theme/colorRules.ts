/**
 * Color Rules — reference constants and utilities for the 12-step color scale.
 *
 * The 12 Radix/Tamagui steps divide into semantic groups:
 *   1–2   Background
 *   3–5   UI Background
 *   6–8   Border
 *   9–10  Primary
 *   11–12 Text
 *
 * Tamagui's templates handle all color-to-component mapping automatically.
 * This module provides:
 *   - Semantic group definitions for the debugger
 *   - Luminance/contrast utilities for accessibility checks
 *   - Component color ramp config (button vs input)
 */

// ── Luminance / contrast utilities ────────────────────────────

function parseChannel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

function linearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parse a CSS color string to a 6-digit hex (handles hex, rgb, hsl, named "white"/"black"). */
export function normalizeToHex(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (s === 'white' || s === '#fff' || s === '#ffffff') {
    return '#ffffff';
  }
  if (s === 'black' || s === '#000' || s === '#000000') {
    return '#000000';
  }
  if (s.startsWith('#') && (s.length === 7 || s.length === 4)) {
    if (s.length === 4) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    return s;
  }
  const hslMatch = s.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (hslMatch) {
    // Treat only fully-opaque hsla as a plain color; alpha blends depend on
    // the backdrop and cannot be reduced to a single hex.
    if (hslMatch[4] !== undefined && Number(hslMatch[4]) < 0.999) {
      return null;
    }
    const h = Number(hslMatch[1]);
    const sat = Number(hslMatch[2]) / 100;
    const l = Number(hslMatch[3]) / 100;
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255)
        .toString(16)
        .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }
  return null;
}

/** WCAG 2.x relative luminance from a 6-digit hex string. */
export function relativeLuminance(hex: string): number {
  return (
    0.2126 * linearize(parseChannel(hex, 1)) +
    0.7152 * linearize(parseChannel(hex, 3)) +
    0.0722 * linearize(parseChannel(hex, 5))
  );
}

/** WCAG contrast ratio (always >= 1). */
export function contrastRatio(l1: number, l2: number): number {
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

export const minContrastRatio = 3;

/** WCAG AA contrast floor for normal-size body/label text. */
export const aaTextContrastRatio = 4.5;

// ── Contrast floor assertion ─────────
//
// `aaTextContrastRatio` declared a floor that no code enforced: the
// outlined warning $color11 (#9e6c00, 4.34:1) and success (#218358, 4.48:1)
// and the dark accent toast action pill (#46349d on #161519, 1.94:1)
// all shipped through review, tests and a design pass. This is THE one
// enforcement — theme specs here, app contrast specs and the
// theme matrix all call it instead of re-deriving the arithmetic.

/** A foreground/background pair held to a WCAG contrast floor. */
export interface ContrastPair {
  /** Text/glyph color, in any format `normalizeToHex` accepts. */
  foreground: string;
  /** The fill the foreground sits on. */
  background: string;
  /** Floor the pair owes. Defaults to `aaTextContrastRatio` (4.5). */
  floor?: number;
  /** Names the pair in reports, e.g. "light_accent: color on background". */
  label?: string;
}

/** Measured outcome for one {@link ContrastPair}. */
export interface ContrastReport {
  label: string;
  /** The colors actually measured, as normalized 6-digit hex. */
  foreground: string;
  background: string;
  /** Unrounded WCAG 2.x ratio. Round only when formatting a display value. */
  ratio: number;
  floor: number;
  pass: boolean;
}

/**
 * Measure one pair against its floor. Throws when a color cannot be reduced
 * to an opaque hex: an alpha color has no contrast of its own and the house
 * ramps are fully opaque, so an unmeasurable pair is a genuine failure,
 * never a skip. Compare the actual ratio: rounding before classification
 * can turn a below-floor pair into a passing one.
 */
export function measureContrast(pair: ContrastPair): ContrastReport {
  const floor = pair.floor ?? aaTextContrastRatio;
  const label = pair.label ?? `${pair.foreground} on ${pair.background}`;
  const foreground = normalizeToHex(pair.foreground);
  if (!foreground) {
    throw new Error(`${label}: foreground is not an opaque color: ${pair.foreground}`);
  }
  const background = normalizeToHex(pair.background);
  if (!background) {
    throw new Error(`${label}: background is not an opaque color: ${pair.background}`);
  }
  const ratio = contrastRatio(relativeLuminance(foreground), relativeLuminance(background));
  return { label, foreground, background, ratio, floor, pass: ratio >= floor };
}

/**
 * The contrast floor assertion. Measures every pair and throws ONE error
 * naming every pair under its floor — a sweep reports the whole damage, not
 * the first miss. Returns the reports when all pass, so callers can attach
 * the measured numbers as proof.
 */
export function assertContrast(pairs: ContrastPair | ContrastPair[]): ContrastReport[] {
  const reports = (Array.isArray(pairs) ? pairs : [pairs]).map(measureContrast);
  const misses = reports.filter((report) => !report.pass);
  if (misses.length > 0) {
    const lines = misses.map(
      (report) =>
        `${report.label}: ${report.foreground} on ${report.background} = ` +
        `${report.ratio}:1 — under the ${report.floor}:1 floor`,
    );
    throw new Error(`contrast floor missed (${misses.length} of ${reports.length} pairs):\n${lines.join('\n')}`);
  }
  return reports;
}

/** Addresses a {@link ContrastPair} inside built themes by name and keys. */
export interface ThemeContrastPair {
  /** Theme name, e.g. "light_accent" or "dark". */
  theme: string;
  /** Theme key carrying the text/glyph color, e.g. "color" or "color11". */
  foreground: string;
  /** Theme key carrying the fill, e.g. "background" or "color2". */
  background: string;
  /** Floor the pair owes. Defaults to `aaTextContrastRatio` (4.5). */
  floor?: number;
}

/**
 * Resolve a pair out of BUILT themes — the record `createThemesBuilder`
 * returns, the same objects handed to createTamagui. Asserting on built
 * themes rather than source ramps is the point: the pairing that fails is
 * produced layers away by the theme-builder template, so reading a palette
 * file tells you nothing about what lands under a label. Addressed by theme
 * name + key so a failure names the thing a designer would change; a missing
 * theme or key throws rather than skips.
 */
export function resolveThemeContrast(
  themes: Record<string, Record<string, string> | undefined>,
  pair: ThemeContrastPair,
): ContrastPair {
  const theme = themes[pair.theme];
  if (!theme) {
    throw new Error(`no such theme: ${pair.theme}`);
  }
  const foreground = theme[pair.foreground];
  if (!foreground) {
    throw new Error(`${pair.theme} has no ${pair.foreground}`);
  }
  const background = theme[pair.background];
  if (!background) {
    throw new Error(`${pair.theme} has no ${pair.background}`);
  }
  return {
    foreground,
    background,
    floor: pair.floor,
    label: `${pair.theme}: ${pair.foreground} on ${pair.background}`,
  };
}

/**
 * Axiom 15 OPTICS — pick whichever candidate foreground carries more WCAG
 * contrast on a given `fill`. The canonical "readable foreground on a fill"
 * primitive: intent Buttons (defaults/builderOptions), the Switch thumb and
 * on-accent labels (useReadableTextOn) all reduce to this. Inputs/outputs are
 * raw color strings so callers keep their own tokens/hsla; returns
 * `candidateA` unchanged when any color fails to parse (safe default).
 */
export function pickReadableForeground(fill: string, candidateA: string, candidateB: string): string {
  const fillHex = normalizeToHex(fill);
  const aHex = normalizeToHex(candidateA);
  const bHex = normalizeToHex(candidateB);
  if (!fillHex || !aHex || !bHex) {
    return candidateA;
  }
  const fillLum = relativeLuminance(fillHex);
  return contrastRatio(relativeLuminance(aHex), fillLum) >= contrastRatio(relativeLuminance(bHex), fillLum)
    ? candidateA
    : candidateB;
}

/**
 * Axiom 12 backstop for ink on a fill: `ink` when it clears `floor` on
 * `fill`, otherwise the pole (`#000000` / `#ffffff`) that reads better on it,
 * when that pole beats `ink`. A mid-luminance fill, such as a literal
 * `#cc4e00` bar or a Radix step-8 chip in dark, can sit where neither scheme
 * anchor clears AA while a pole does. Returns `ink` unchanged when a color
 * fails to parse.
 */
export function holdInkFloor(fill: string, ink: string, floor = aaTextContrastRatio): string {
  const fillHex = normalizeToHex(fill);
  const inkHex = normalizeToHex(ink);
  if (!fillHex || !inkHex) {
    return ink;
  }
  const fillLum = relativeLuminance(fillHex);
  const inkRatio = contrastRatio(relativeLuminance(inkHex), fillLum);
  if (inkRatio >= floor) {
    return ink;
  }
  const onWhite = contrastRatio(1, fillLum);
  const onBlack = contrastRatio(0, fillLum);
  const poleRatio = Math.max(onWhite, onBlack);
  if (poleRatio <= inkRatio) {
    return ink;
  }
  return onWhite >= onBlack ? '#ffffff' : '#000000';
}

/**
 * Given a 12-color scale (hex strings), a background step, and a starting
 * text step, scan towards `preferredDir` for the first step whose contrast
 * ratio meets minContrastRatio. Falls back to the opposite direction,
 * then to the step with the highest contrast if nothing passes.
 */
export function findReadableStep(scale: string[], bgStep: number, startStep: number, preferredDir: 1 | -1): number {
  const bgLum = relativeLuminance(scale[bgStep - 1]);

  if (contrastRatio(bgLum, relativeLuminance(scale[startStep - 1])) >= minContrastRatio) {
    return startStep;
  }

  for (let s = startStep + preferredDir; s >= 1 && s <= 12; s += preferredDir) {
    if (contrastRatio(bgLum, relativeLuminance(scale[s - 1])) >= minContrastRatio) {
      return s;
    }
  }

  for (let s = startStep - preferredDir; s >= 1 && s <= 12; s -= preferredDir) {
    if (contrastRatio(bgLum, relativeLuminance(scale[s - 1])) >= minContrastRatio) {
      return s;
    }
  }

  const l1 = relativeLuminance(scale[0]);
  const l12 = relativeLuminance(scale[11]);
  return contrastRatio(bgLum, l1) >= contrastRatio(bgLum, l12) ? 1 : 12;
}

// ── Component color ramps ─────────────────────────────────────

export type ColorStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface ColorRamp {
  base: ColorStep;
  hover: ColorStep;
  /** press for buttons, active/checked for inputs */
  active: ColorStep;
}

export interface ComponentColorConfig {
  bg: ColorRamp;
  border: ColorRamp;
}

export interface ButtonColorConfig extends ComponentColorConfig {
  textLow: ColorRamp;
}

export const buttonColors: ButtonColorConfig = {
  bg: { base: 5, hover: 4, active: 6 },
  border: { base: 7, hover: 6, active: 8 },
  textLow: { base: 7, hover: 6, active: 10 },
};

export const inputColors: ComponentColorConfig = {
  bg: { base: 4, hover: 3, active: 5 },
  border: { base: 7, hover: 6, active: 8 },
};

export function $color(step: ColorStep) {
  return `$color${step}` as const;
}

// ── Semantic groups ───────────────────────────────────────────

export interface SemanticGroup {
  key: string;
  label: string;
  from: number;
  to: number;
  color: string;
}

export const semanticGroups: SemanticGroup[] = [
  { key: 'background', label: 'Background', from: 1, to: 2, color: '#6ec' },
  { key: 'ui', label: 'UI Background', from: 3, to: 5, color: '#b89af5' },
  { key: 'border', label: 'Border', from: 6, to: 8, color: '#ea8' },
  { key: 'primary', label: 'Primary', from: 9, to: 10, color: '#f66' },
  { key: 'text', label: 'Text', from: 11, to: 12, color: '#5af' },
];

/** Normalise a raw color scale into 6-digit hex strings. Returns null when parsing fails. */
export function normalizeColorScale(raw: string[]): string[] | null {
  if (raw.length !== 12) {
    return null;
  }
  const out: string[] = [];
  for (const c of raw) {
    const hex = normalizeToHex(c);
    if (!hex) {
      return null;
    }
    out.push(hex);
  }
  return out;
}
