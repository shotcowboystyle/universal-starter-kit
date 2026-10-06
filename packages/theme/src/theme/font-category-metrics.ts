import type { FontCategory } from './knobs';

/**
 * Per-category legibility floors (FONT-FAMILY-METRICS).
 *
 * `heading` / `body` are minimum lineHeight:fontSize ratios. `letterSpacing:
 * "neutral"` marks the families where Inter's tracking-by-size curve is
 * actively wrong — fixed-pitch faces must keep their pitch, and connected
 * scripts break when tracked apart.
 *
 * Two consumers read this table and they must never drift apart:
 *
 *  - `FontKnobStyles` emits `--f-lineHeight-N` overrides on the `.font_body`
 *    / `.font_heading` CSS scopes, which is how the knob restyles text that
 *    never asked for a category token (web only).
 *  - `defaults/fonts.ts` bakes the same floors into each registered category
 *    font's own lineHeight table, which is the path the knob actually takes:
 *    `bodyFont: "serif"` renders `.font_serif`, and the CSS scope rules above
 *    are keyed to `.font_body`, so they never reach it. Native has no CSS at
 *    all and depends on the table entirely.
 *
 * "sans-serif" is the default scope and is listed for completeness — the
 * `$body` / `$heading` tables are upstream's under the v5 era pin and this file does not rewrite them.
 */
export const fontCategoryMetrics: Record<
  FontCategory,
  { heading: number; body: number; letterSpacing: 'inherit' | 'neutral' }
> = {
  'sans-serif': { heading: 1.15, body: 1.4, letterSpacing: 'inherit' },
  serif: { heading: 1.2, body: 1.4, letterSpacing: 'inherit' },
  mono: { heading: 1.25, body: 1.45, letterSpacing: 'neutral' },
  // Heading floors below are sized to each configured face's em box
  // (ascent+descent) so display headings never clip: Roboto Slab
  // ≈1.32, Nunito ≈1.36, Silkscreen ≈1.3, Poppins/Futura ≈1.4.
  slab: { heading: 1.35, body: 1.4, letterSpacing: 'inherit' },
  rounded: { heading: 1.4, body: 1.4, letterSpacing: 'inherit' },
  condensed: { heading: 1.15, body: 1.4, letterSpacing: 'inherit' },
  cursive: { heading: 1.3, body: 1.5, letterSpacing: 'neutral' },
  handwriting: { heading: 1.25, body: 1.45, letterSpacing: 'neutral' },
  pixel: { heading: 1.35, body: 1.4, letterSpacing: 'neutral' },
  blackletter: { heading: 1.3, body: 1.45, letterSpacing: 'neutral' },
  geometric: { heading: 1.45, body: 1.4, letterSpacing: 'inherit' },
};

/**
 * Leading for one size step: the era's own value, raised to the category's
 * floor when the era's taper falls under it. Never below the base, so a
 * category can only ever ask for MORE room than `$body` takes, never less.
 */
export function flooredLineHeight(sizePx: number, baseLineHeightPx: number, minRatio: number): number {
  return Math.max(baseLineHeightPx, Math.round(sizePx * minRatio));
}
