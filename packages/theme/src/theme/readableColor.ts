import { useMemo } from 'react';
import { useTheme as useTamaguiTheme } from 'tamagui';

import {
  aaTextContrastRatio,
  contrastRatio,
  holdInkFloor,
  normalizeToHex,
  pickReadableForeground,
  relativeLuminance,
} from './colorRules';

/**
 * Luminance-computed readable text/glyph colors (Axiom 15 OPTICS + Axiom 12
 * LEGIBLE FLOOR).
 *
 * Two catalog-wide contrast traps this module closes:
 *
 * 1. Text sitting ON an accent/solid FILL (`useReadableTextOn`). Components
 *    that paint a selected/active row, chip or avatar with `$accentBackground`
 *    (or any solid step) and then let the label inherit the scheme's `$color`
 *    render ink-on-accent (~2.6:1) or, worse, near-white-on-bright-tint
 *    (~1.2:1). The readable foreground is whichever scheme anchor
 *    (paper `$color1` / ink `$color12`) carries more contrast on the ACTUAL
 *    fill — never assumed.
 *
 * 2. Accent-hued text on the PAGE (`useAccentOnSurface`). The readable accent
 *    is the most chromatic step of the theme's own accent ramp that still
 *    clears AA (4.5:1) on both page surfaces — a mid accent in light, a pale
 *    accent in dark.
 *
 * Both read live theme values so they stay correct across schemes, tints and
 * custom accent palettes; they mirror the runtime pattern already used by the
 * Switch thumb, Toast and Calendar chip.
 */

function resolveTokenValue(theme: Record<string, { val?: unknown } | undefined>, token: string): string | undefined {
  const key = token.startsWith('$') ? token.slice(1) : token;
  const val = theme[key]?.val;
  return typeof val === 'string' ? val : undefined;
}

/**
 * Readable text/glyph color to sit ON `fill` (a token like "$accentBackground"
 * / "$color8", or an already-resolved color value — e.g. the step returned by
 * `useAccentTintedSurface`): the scheme's paper (`$color1`) or ink (`$color12`)
 * anchor, whichever contrasts more on the resolved fill, returned as a concrete
 * value so no nested sub-theme can flip it. When neither anchor clears AA on
 * the fill, the pole that does (`holdInkFloor`). Returns `undefined` when any
 * color fails to resolve/parse — callers keep their own default in that case.
 */
export function useReadableTextOn(fill_: string | undefined): string | undefined {
  const theme = useTamaguiTheme() as unknown as Record<string, { val?: unknown } | undefined>;
  const fill = fill_?.startsWith('$') ? resolveTokenValue(theme, fill_) : fill_;
  const paper = resolveTokenValue(theme, 'color1');
  const ink = resolveTokenValue(theme, 'color12');
  return useMemo(() => {
    if (!fill || !paper || !ink) {
      return undefined;
    }
    if (!normalizeToHex(fill) || !normalizeToHex(paper) || !normalizeToHex(ink)) {
      return undefined;
    }
    return holdInkFloor(fill, pickReadableForeground(fill, paper, ink));
  }, [fill, paper, ink]);
}

/**
 * Pure resolver behind {@link useLegibleInkOn}: `preferred` when it clears AA
 * on `fill`, otherwise the readable anchor (paper or ink) held to the floor
 * by `holdInkFloor`. Any unparseable input returns `preferred`.
 */
export function resolveLegibleInkOn({
  fill,
  preferred,
  paper,
  ink,
}: {
  fill?: string;
  preferred?: string;
  paper?: string;
  ink?: string;
}): string | undefined {
  const fillHex = fill ? normalizeToHex(fill) : null;
  const preferredHex = preferred ? normalizeToHex(preferred) : null;
  if (!fill || !fillHex || !preferred || !preferredHex) {
    return preferred;
  }
  const fillLum = relativeLuminance(fillHex);
  if (contrastRatio(relativeLuminance(preferredHex), fillLum) >= aaTextContrastRatio) {
    return preferred;
  }
  const anchor =
    paper && ink && normalizeToHex(paper) && normalizeToHex(ink) ? pickReadableForeground(fill, paper, ink) : preferred;
  return holdInkFloor(fill, anchor);
}

/**
 * Keep a component's own ink (`preferred`, e.g. a chip's `$blue12` or a
 * muted `$color11` title) on `fill` while it clears AA, and hand over to the
 * readable anchor, then a pole, where it does not. The token comes back
 * untouched when it passes, so a scheme where the pair already reads keeps
 * its exact paint; a replacement comes back as a concrete color.
 */
export function useLegibleInkOn(fill_: string | undefined, preferred: string): string {
  const theme = useTamaguiTheme() as unknown as Record<string, { val?: unknown } | undefined>;
  const fill = fill_?.startsWith('$') ? resolveTokenValue(theme, fill_) : fill_;
  const preferredValue = preferred.startsWith('$') ? resolveTokenValue(theme, preferred) : preferred;
  const paper = resolveTokenValue(theme, 'color1');
  const ink = resolveTokenValue(theme, 'color12');
  return useMemo(() => {
    const resolved = resolveLegibleInkOn({ fill, preferred: preferredValue, paper, ink });
    return !resolved || resolved === preferredValue ? preferred : resolved;
  }, [fill, preferred, preferredValue, paper, ink]);
}

/**
 * Accent-hued text/link color readable on the page surfaces (color1/color2).
 * Scans the theme's own accent ramp for the most chromatic step that clears
 * the AA text floor against BOTH page surfaces; falls back to readable neutral
 * ink (`$color12`) when no accent step qualifies or the ramp is absent (e.g.
 * tint sub-themes, where neutral text is the house default anyway).
 */
export function useAccentOnSurface(): string {
  const theme = useTamaguiTheme() as unknown as Record<string, { val?: unknown } | undefined>;
  const c1 = resolveTokenValue(theme, 'color1');
  const c2 = resolveTokenValue(theme, 'color2');
  const ink = resolveTokenValue(theme, 'color12') ?? '$color12';
  const steps: (string | undefined)[] = [];
  for (let i = 1; i <= 12; i++) {
    steps.push(resolveTokenValue(theme, `accent${i}`));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const bg1 = c1 ? normalizeToHex(c1) : null;
    const bg2 = c2 ? normalizeToHex(c2) : null;
    if (!bg1 || !bg2) {
      return ink;
    }
    const l1 = relativeLuminance(bg1);
    const l2 = relativeLuminance(bg2);
    let best: string | undefined;
    let bestMin = Number.POSITIVE_INFINITY;
    for (const step of steps) {
      const hex = step ? normalizeToHex(step) : null;
      if (!step || !hex) {
        continue;
      }
      const stepLum = relativeLuminance(hex);
      const min = Math.min(contrastRatio(stepLum, l1), contrastRatio(stepLum, l2));
      // Most chromatic passing step = the lowest contrast that still clears AA
      // (accent steps get paler/whiter as contrast climbs).
      if (min >= aaTextContrastRatio && min < bestMin) {
        bestMin = min;
        best = step;
      }
    }
    return best ?? ink;
  }, [c1, c2, ink, steps.join('|')]);
}

/**
 * Accent SURFACE tier of the accent ramp, mirrored by scheme — the fill for a
 * selected/current chip that must carry the accent language at SURFACE
 * strength rather than as a solid (selection is accent; the ViewSwitcher
 * rider pins segmented-control strength at "tinted", not the solid an accent
 * CTA takes).
 *
 * The step is a declared ramp POSITION, the same way the neutral ramp declares
 * its tiers (surface `$color2`, UI background `$color3`-`$color5`, text
 * `$color11`-`$color12`): the accent ramp's surface end is its palest step in a
 * light scheme and its deepest in a dark one, so the chip reads as a tinted
 * surface on either page. Scheme polarity comes from the paper/ink ANCHORS,
 * never from a surface token — a tint re-ramps surfaces, and keying off one
 * made this pick drift a step per tint (measured: the chip slid from the pale
 * accent to the palest accent under a yellow tint).
 *
 * Returns `undefined` when the accent ramp is absent or unparseable (tint
 * sub-themes without an accent ramp) — callers keep their neutral default
 * rather than render an unthemed chip.
 */
// Ramp positions (1-based) of the accent surface tier per scheme.
const ACCENT_SURFACE_STEP_LIGHT = 11;
const ACCENT_SURFACE_STEP_DARK = 1;

export interface ResolveAccentTintedSurfaceInput {
  /** Accent ramp steps 1..12, as raw color values; holes allowed. */
  steps: (string | undefined)[];
  /** Scheme paper anchor (`$color1`). */
  paper?: string;
  /** Scheme ink anchor (`$color12`). */
  ink?: string;
}

/** Pure resolver behind {@link useAccentTintedSurface} — see its docs. */
export function resolveAccentTintedSurface({ steps, paper, ink }: ResolveAccentTintedSurfaceInput): string | undefined {
  const paperHex = paper ? normalizeToHex(paper) : null;
  const inkHex = ink ? normalizeToHex(ink) : null;
  if (!paperHex || !inkHex) {
    return undefined;
  }
  const isLight = relativeLuminance(paperHex) > relativeLuminance(inkHex);
  const step = steps[(isLight ? ACCENT_SURFACE_STEP_LIGHT : ACCENT_SURFACE_STEP_DARK) - 1];
  if (!step || !normalizeToHex(step)) {
    return undefined;
  }
  return step;
}

export function useAccentTintedSurface(): string | undefined {
  const theme = useTamaguiTheme() as unknown as Record<string, { val?: unknown } | undefined>;
  const paper = resolveTokenValue(theme, 'color1');
  const ink = resolveTokenValue(theme, 'color12');
  const steps: (string | undefined)[] = [];
  for (let i = 1; i <= 12; i++) {
    steps.push(resolveTokenValue(theme, `accent${i}`));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveAccentTintedSurface({ steps, paper, ink }), [paper, ink, steps.join('|')]);
}

/**
 * A named solid in the accent ramp. `token` is what a caller paints
 * (`$accentBackground`, `$accent9`); `value` is the resolved color.
 */
export interface AaSolidCandidate {
  token: string;
  value: string | undefined;
}

export interface ResolveAaSolidFillInput {
  /** The selected solid, usually `$accentBackground`. */
  preferred: AaSolidCandidate;
  /**
   * Accent solids (steps 1–10). Pale anchors 11–12 are tinted surfaces, not
   * selection solids — they would pass AA as chips and fail as selection marks.
   */
  solids: AaSolidCandidate[];
  paper?: string;
  ink?: string;
  /** Defaults to {@link aaTextContrastRatio} (4.5). */
  floor?: number;
}

function bestAnchorContrast(fill: string, paperLum: number, inkLum: number): number {
  const hex = normalizeToHex(fill);
  if (!hex) {
    return 0;
  }
  const fillLum = relativeLuminance(hex);
  return Math.max(contrastRatio(fillLum, paperLum), contrastRatio(fillLum, inkLum));
}

/**
 * Pick an accent solid that can carry AA text (paper or ink ≥ 4.5).
 *
 * A mid-chroma solid can clear the graphic 3:1 tier and still miss the text
 * floor with both scheme anchors (the stock dark `#7766cc` measured 4.02:1
 * before the build held `$accentBackground` to it). Walking to the
 * nearest passing solid keeps the mark on the accent channel instead
 * of dropping to ink or a tinted surface.
 *
 * Returns the preferred token when it already clears the floor, otherwise
 * the solid token whose resolved luminance is closest to the preferred fill.
 */
export function resolveAaSolidFill({
  preferred,
  solids,
  paper,
  ink,
  floor = aaTextContrastRatio,
}: ResolveAaSolidFillInput): string {
  const paperHex = paper ? normalizeToHex(paper) : null;
  const inkHex = ink ? normalizeToHex(ink) : null;
  if (!paperHex || !inkHex) {
    return preferred.token;
  }
  const paperLum = relativeLuminance(paperHex);
  const inkLum = relativeLuminance(inkHex);

  if (preferred.value && bestAnchorContrast(preferred.value, paperLum, inkLum) >= floor) {
    return preferred.token;
  }

  const preferredHex = preferred.value ? normalizeToHex(preferred.value) : null;
  const preferredLum = preferredHex ? relativeLuminance(preferredHex) : undefined;
  let bestToken: string | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const { token, value } of solids) {
    if (!value || bestAnchorContrast(value, paperLum, inkLum) < floor) {
      continue;
    }
    const hex = normalizeToHex(value);
    if (!hex) {
      continue;
    }
    const dist = preferredLum === undefined ? 0 : Math.abs(relativeLuminance(hex) - preferredLum);
    if (dist < bestDist) {
      bestDist = dist;
      bestToken = token;
    }
  }
  return bestToken ?? preferred.token;
}

/**
 * Token to paint as a selected/current solid so on-fill text clears AA.
 * See {@link resolveAaSolidFill}.
 */
export function useAaSolidFill(preferredToken: string): string {
  const theme = useTamaguiTheme() as unknown as Record<string, { val?: unknown } | undefined>;
  const paper = resolveTokenValue(theme, 'color1');
  const ink = resolveTokenValue(theme, 'color12');
  const preferredValue = preferredToken.startsWith('$') ? resolveTokenValue(theme, preferredToken) : preferredToken;
  const solids: AaSolidCandidate[] = [];
  for (let i = 1; i <= 10; i++) {
    solids.push({ token: `$accent${i}`, value: resolveTokenValue(theme, `accent${i}`) });
  }
  const solidsKey = solids.map((s) => s.value ?? '').join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () =>
      resolveAaSolidFill({
        preferred: { token: preferredToken, value: preferredValue },
        solids,
        paper,
        ink,
      }),
    [preferredToken, preferredValue, paper, ink, solidsKey],
  );
}
