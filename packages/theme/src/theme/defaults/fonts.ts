import { defaultConfig } from '@tamagui/config/v5';
import { createInterFont } from '@tamagui/font-inter';
// `@tamagui/web`, not `tamagui`: createDefaultThemeConfig.test.ts mocks the
// whole `tamagui` module down to `createTamagui`, and this module is on that
// spec's import graph.
import { createFont, type GenericFont } from '@tamagui/web';

import { flooredLineHeight, fontCategoryMetrics } from '../fontCategoryMetrics';
import { fontCategoryStacks } from '../fontCategoryStacks';
import type { FontCategory } from '../knobs';

// Default purpose fonts for components that reference $heading / $body
// directly, both backed by Inter.
//
// These tables used to be @tamagui/config/v4's — headings on a
// 1.4x scale (H1 $10 = 64px) at whatever weight the knob happened to default
// to, body at 14px with `lineHeight = size + 10`. Against the v5 era this
// package now pins (see `TAMAGUI_ERA` in createDefaultThemeConfig.ts) that is a
// different typographic voice, not a variation on one: H1 was 64px/400 where
// stock v5 is 40px/800, large and light against compact and heavy. And
// `size + 10` is not a ratio at all — 1.91 at 11px, 1.22 at 46px — which is
// why v5 replaced it with an explicit taper.
//
// So the tables are no longer transcribed. They are READ from
// `defaultConfig.fonts`, which means the era pin is load-bearing rather than
// decorative: re-point it and the type scale follows, and there is no local
// copy that can drift from upstream between pins. That also retires the
// hand-mirrored `interBaseSizes` table this file used to carry purely so
// tracking could be computed per key — the size table it needed IS the one
// upstream ships.
//
// Tracking-by-size (Axiom 15 OPTICS): letter-spacing is a function
// of the rendered size, not a constant — slightly loose at caption sizes,
// increasingly tight at display sizes (the same optical behavior Apple's SF
// implements per point size). The curve is Inter's own dynamic-metrics
// model (rsms.me/inter/dynmetrics): tracking(em) = a + b·e^(c·size).
//
// ── Category fonts (re-derived against the era pin) ──────────────
//
// A bodyFont stop is a FAMILY choice. It must move the family and nothing
// else, so every category font is built from the era's own `$body` tables
// rather than a ramp of its own. Measured on the label text node before this
// change, both schemes:
//
//   sans-serif   Inter          15px/23px
//   serif        Georgia        14px/24px
//   mono         ui-monospace   14px/24px
//   rounded      Nunito         14px/24px
//
// Registering the families (the first half of the fix) stopped the collapse to
// -apple-system 14px/normal, but the era pin landed after it and moved `$body`
// to 15/23 — so ten of eleven stops were left on a second ladder, and flipping
// the knob resized the label by a pixel and moved its leading. Same defect
// class as the original one: the knob was still taking type off
// the ramp, just more quietly.
//
// Three deliberate departures from `$body`, all upward and all for legibility:
//
//  1. Leading is floored per category — `flooredLineHeight` raises the era's
//     value where the taper falls under the category's ratio, never lowers
//     it. Only display steps move; every text step is `$body`'s own value.
//  2. Tracking is 0, not Inter's curve. That curve is Inter-specific, and an
//     empty table is not neutral: the class Tamagui emits for `$mono` does
//     not declare `--f-letterSpacing-*`, so the value fell through to the
//     `:root` Inter one and Georgia and Nunito rendered at Inter's −0.13px.
//     There is no measured optical curve for these faces, so 0 is the honest
//     value rather than a borrowed one.
//  3. Weight is the era's (400 at every step). The previous default was 300,
//     which is off the reference's label weight in the other direction.
//
// `$body` itself is untouched: it IS upstream's table under the pin. Its
// ratio dips below the 1.4 body leading floor from $11 up; FontKnobStyles
// floors that scope on web, and correcting the table would have to be argued
// on its own, not smuggled in here.

const TRACKING_A = -0.0223;
const TRACKING_B = 0.185;
const TRACKING_C = -0.1745;

/** Inter dynamic tracking for a rendered `sizePx`, in em. */
export function interTrackingEm(sizePx: number): number {
  return TRACKING_A + TRACKING_B * Math.exp(TRACKING_C * sizePx);
}

/** Inter dynamic tracking for a rendered `sizePx`, in px (2-decimal). */
export function interTrackingPx(sizePx: number): number {
  return Math.round(interTrackingEm(sizePx) * sizePx * 100) / 100;
}

/**
 * Legacy `size + 10` leading. Kept for `createDefaultFont` callers that pass
 * their own size table and therefore have no era leading to floor.
 */
export const BODY_LINE_HEIGHT_OFFSET = 10;

export function bodyLineHeightPx(sizePx: number): number {
  return sizePx + BODY_LINE_HEIGHT_OFFSET;
}

/**
 * A tamagui font table with Variables unwrapped and `$` prefixes stripped.
 * Upstream hands these back either raw or wrapped depending on where in the
 * config pipeline they were read, and `createInterFont` wants them raw.
 */
function plain<T>(raw: unknown): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries((raw ?? {}) as Record<string, T | { val?: T }>)) {
    const unwrapped = value && typeof value === 'object' && 'val' in value ? (value as { val?: T }).val : (value as T);
    if (unwrapped !== undefined) {
      out[key.replace(/^\$/, '')] = unwrapped;
    }
  }
  return out;
}

/** A tamagui font table's numbers, with Variables and `$` prefixes unwrapped. */
const numbers = (raw: unknown) => plain<number>(raw);

/** Inter dynamic tracking for every key of a size table. */
function trackingFor(sizes: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(sizes).map(([key, px]) => [key, interTrackingPx(px)]));
}

/** Zero tracking for every key of a size table (non-Inter faces). */
function neutralTracking(sizes: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.keys(sizes).map((key) => [key, 0]));
}

const v5Body = defaultConfig.fonts.body;
const v5Heading = defaultConfig.fonts.heading;
const bodySizes = numbers(v5Body.size);
const bodyLineHeights = numbers(v5Body.lineHeight);
const bodyWeights = plain<string>(v5Body.weight);
const headingSizes = numbers(v5Heading.size);

/**
 * The era's body size table. Exported under its historical name because
 * `createDefaultFont` defaults to it, so a consumer-registered category font
 * lands on the same ladder as the built-in ones instead of a private copy
 * that drifts at the next pin.
 */
export const bodyFontSizes: Record<string, number> = bodySizes;

/** The era's body leading, before any per-category floor. */
export const bodyFontLineHeights: Record<string, number> = bodyLineHeights;

/**
 * Inter faces the workspace ships. v5 heading weights are sparse — 600 up to
 * $5, 700 at $6–$8, 800 from $9 — and A4's reading of that is the point:
 * everything between inherits, so bold is rare and therefore means something.
 * Each declared weight needs a face or the browser synthesises one.
 */
const interFaces = {
  400: { normal: 'Inter' },
  600: { normal: 'InterSemiBold' },
  700: { normal: 'InterBold' },
  800: { normal: 'InterExtraBold' },
} as const;

/**
 * Concrete family stacks for each `headingFont`/`bodyFont` category. Alias of
 * the one table in `fontCategoryStacks.ts`, which `FontKnobStyles` also reads
 * for its `--f-family` fallback — one stop cannot render two faces.
 */
export const fontFamilyStacks = fontCategoryStacks;

export type FontFamilyCategory = FontCategory;

/**
 * Leading for one category: the era's body table with the category's leading
 * floor applied. Every text step comes back as `$body`'s own value; only the
 * display steps, where the era's taper eases below the floor, move up.
 */
export function categoryLineHeights(category: FontCategory): Record<string, number> {
  const minRatio = (fontCategoryMetrics[category] ?? fontCategoryMetrics['sans-serif']).body;
  return Object.fromEntries(
    Object.entries(bodySizes).map(([key, px]) => [
      key,
      flooredLineHeight(px, bodyLineHeights[key] ?? bodyLineHeightPx(px), minRatio),
    ]),
  );
}

/**
 * Category font on the `$body` ladder: same sizes (including `true`), same
 * weights, leading floored per category, tracking neutral. A missing `true` key
 * is what collapsed `$serif`/`$mono`/`$rounded` to the system face at
 * `line-height: normal`.
 */
export function createCategoryFont(category: FontCategory, family: string): GenericFont {
  return createFont({
    family,
    size: bodySizes,
    lineHeight: categoryLineHeights(category),
    weight: bodyWeights,
    letterSpacing: neutralTracking(bodySizes),
  }) as GenericFont;
}

export const defaultHeadingFont = createInterFont(
  {
    face: interFaces,
    size: headingSizes,
    lineHeight: numbers(v5Heading.lineHeight),
    weight: plain<string>(v5Heading.weight),
    letterSpacing: trackingFor(headingSizes),
  },
  { sizeSize: (size) => size },
);

export const defaultBodyFont = createInterFont(
  {
    face: interFaces,
    size: bodySizes,
    lineHeight: bodyLineHeights,
    weight: bodyWeights,
    letterSpacing: trackingFor(bodySizes),
  },
  { sizeSize: (size) => size },
);

export const defaultSerifFont = createCategoryFont('serif', fontFamilyStacks.serif);
export const defaultMonoFont = createCategoryFont('mono', fontFamilyStacks.mono);
export const defaultSlabFont = createCategoryFont('slab', fontFamilyStacks.slab);
export const defaultRoundedFont = createCategoryFont('rounded', fontFamilyStacks.rounded);
export const defaultCondensedFont = createCategoryFont('condensed', fontFamilyStacks.condensed);
export const defaultCursiveFont = createCategoryFont('cursive', fontFamilyStacks.cursive);
export const defaultHandwritingFont = createCategoryFont('handwriting', fontFamilyStacks.handwriting);
export const defaultPixelFont = createCategoryFont('pixel', fontFamilyStacks.pixel);
export const defaultBlackletterFont = createCategoryFont('blackletter', fontFamilyStacks.blackletter);
export const defaultGeometricFont = createCategoryFont('geometric', fontFamilyStacks.geometric);

/** All purpose + category fonts registered by `createDefaultThemeConfig`. */
export const defaultFonts = {
  heading: defaultHeadingFont,
  body: defaultBodyFont,
  serif: defaultSerifFont,
  mono: defaultMonoFont,
  slab: defaultSlabFont,
  rounded: defaultRoundedFont,
  condensed: defaultCondensedFont,
  cursive: defaultCursiveFont,
  handwriting: defaultHandwritingFont,
  pixel: defaultPixelFont,
  blackletter: defaultBlackletterFont,
  geometric: defaultGeometricFont,
} as const;
