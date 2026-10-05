import * as Colors from '@tamagui/colors';
import { themes as stockThemes } from '@tamagui/themes';
import { useMemo } from 'react';
import { useTheme as useTamaguiTheme, useThemeName } from 'tamagui';

import { contrastRatio, minContrastRatio, normalizeToHex, relativeLuminance } from './colorRules';
import { tintHueNames } from './createThemes';

/**
 * Chart palette contract.
 *
 * Charts are chrome that renders data, so their DEFAULT colors must come from
 * the one theme channel (Axiom 5 ONE SOURCE) while explicit user/data colors
 * pass through untouched (Axiom 11 VALUE IS DATA):
 *
 * - `single` — every mark of a single-series chart takes the theme identity:
 *   the active accent, or the tint solid when a tint sub-theme is active
 *   (the palette re-anchors under tint exactly like the neutral ramp does).
 * - `categorical` — identity-led list of sanctioned Radix solids for
 *   multi-series data. Slot 0 is the theme identity; the fixed hue cycle
 *   fills the rest, dropping hues indistinguishable from the identity so
 *   adjacent series stay tellable-apart under every tint.
 * - `semantic` — error/success/warning series solids from the sanctioned
 *   semantic ramps ($red/$green/$yellow), tint-independent, scheme-aware.
 *
 * Values resolve from the same Radix scales the theme builder splats into the
 * base themes, so `categorical[1]` under `light` equals `$blue10`, and they
 * stay resolvable on native and under tint sub-themes (which only carry the
 * re-ramped neutral family).
 */
export interface ChartPalette {
  /** Scheme the palette resolved for. */
  scheme: 'light' | 'dark';
  /** Theme-identity solid: paints every mark of a single-series chart. */
  single: string;
  /** Identity-led distinguishable solids for categorical multi-series data. */
  categorical: string[];
  /** Semantic series solids (trend/status series), tint-independent. */
  semantic: { error: string; success: string; warning: string };
}

export interface ResolveChartPaletteInput {
  scheme: 'light' | 'dark';
  /**
   * Resolved theme-identity solid — `accentBackground` in base themes, the
   * re-ramped `$color9` under a tint. Tries the ordered candidates, then
   * falls back to violet when missing, unparseable or below the contrast floor.
   */
  identitySolid?: string;
  /** Ordered alternatives when the identity cannot meet the mark contrast floor. */
  identityCandidates?: readonly (string | undefined)[];
}

/**
 * Fixed categorical hue cycle: Radix solids ordered so neighbouring
 * entries sit far apart on the hue wheel (min adjacent distance ~78°).
 * Light blue, orange, green, amber and teal deepen within their hue to clear
 * 3:1 on reference cards. Dark violet deepens for tinted card backgrounds.
 */
const categoricalHueCycle = [
  { family: 'blue', light: Colors.blue.blue10, dark: Colors.blueDark.blue9 },
  { family: 'orange', light: Colors.orange.orange11, dark: Colors.orangeDark.orange9 },
  { family: 'green', light: Colors.green.green10, dark: Colors.greenDark.green9 },
  { family: 'amber', light: Colors.amber.amber11, dark: Colors.amberDark.amber9 },
  { family: 'pink', light: Colors.pink.pink9, dark: Colors.pinkDark.pink9 },
  { family: 'teal', light: Colors.teal.teal10, dark: Colors.tealDark.teal9 },
  { family: 'violet', light: Colors.violet.violet9, dark: Colors.violetDark.violet10 },
  { family: 'red', light: Colors.red.red9, dark: Colors.redDark.red9 },
] as const;

function configuredTintCardSurfaces(scheme: 'light' | 'dark'): string[] {
  const themes = stockThemes as unknown as Record<string, { background?: string }>;
  return [...tintHueNames].flatMap((hue) => {
    const color = themes[`${scheme}_${hue}_Card`]?.background;
    return color ? [color] : [];
  });
}

// Use the shipped tinted Card backgrounds, which are deeper than their page
// colors. Missing theme names are not invented surfaces. The rendered audit
// still owns actual custom consumer backgrounds and elevation variants.
const chartReferenceSurfaces = {
  light: ['#ffffff', Colors.gray.gray2, Colors.mauve.mauve2, ...configuredTintCardSurfaces('light')],
  dark: [Colors.grayDark.gray2, Colors.mauveDark.mauve2, ...configuredTintCardSurfaces('dark')],
} as const;

function readableIdentity(color: string | undefined, scheme: 'light' | 'dark'): color is string {
  const hex = color ? normalizeToHex(color) : null;
  if (!hex) {
    return false;
  }
  const luminance = relativeLuminance(hex);
  return chartReferenceSurfaces[scheme].every((surface) => {
    const backdrop = normalizeToHex(surface);
    return !!backdrop && contrastRatio(luminance, relativeLuminance(backdrop)) >= minContrastRatio;
  });
}

/**
 * Semantic series solids. Light success deepens to green10 for the mark floor.
 * Error and dark success use step 9. Warning uses
 * the sanctioned $yellow ramp, but yellow9 measures ~1.3:1 against light
 * card surfaces (invisible marks), so light scheme takes the deep yellow11
 * step while dark keeps the bright yellow9 (13:1 on dark surfaces).
 */
const semanticSeries = {
  light: {
    error: Colors.red.red9,
    success: Colors.green.green10,
    warning: Colors.yellow.yellow11,
  },
  dark: {
    error: Colors.redDark.red9,
    success: Colors.greenDark.green9,
    warning: Colors.yellowDark.yellow9,
  },
} as const;

/** Below this HSL saturation the identity is neutral-ish; hue is meaningless. */
const neutralSaturationFloor = 0.15;
/** Cycle hues closer than this to the identity hue are dropped as confusable. */
const hueDedupeThresholdDeg = 30;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function colorToHsl(color: string): Hsl | null {
  const hex = normalizeToHex(color);
  if (!hex) {
    return null;
  }
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return { h: 0, s: 0, l };
  }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Keep every solid after dedupe, moving only an invalid adjacent sequence. */
function orderCategoricalCycle(identity: string, cycle: string[]): string[] {
  const colors = [identity, ...cycle];
  const hsl = colors.map((color) => colorToHsl(color) as Hsl);
  const luminance = colors.map((color) => relativeLuminance(normalizeToHex(color) as string));
  // Any one of hue, saturation or luminance can distinguish a pair.
  const compatible = hsl.map((a, i) =>
    hsl.map(
      (b, j) =>
        (a.s >= neutralSaturationFloor &&
          b.s >= neutralSaturationFloor &&
          hueDistance(a.h, b.h) >= hueDedupeThresholdDeg) ||
        Math.abs(a.s - b.s) >= 0.5 ||
        contrastRatio(luminance[i], luminance[j]) >= 1.5,
    ),
  );
  const indices = cycle.map((_, i) => i + 1);
  if (indices.every((i) => compatible[i - 1][i]) && compatible[colors.length - 1][0]) {
    return cycle;
  }

  // The fixed cycle has at most eight entries. Original-order traversal
  // preserves valid prefixes and the identity remains first, including wrap.
  const arrange = (previous: number, remaining: number[]): number[] | undefined => {
    if (!remaining.length) {
      return compatible[previous][0] ? [] : undefined;
    }
    for (const next of remaining) {
      if (!compatible[previous][next]) {
        continue;
      }
      const tail = arrange(
        next,
        remaining.filter((index) => index !== next),
      );
      if (tail) {
        return [next, ...tail];
      }
    }
    return undefined;
  };
  const ordered = arrange(0, indices);
  // Preserve the supplied series if no permutation can satisfy the rule.
  // The actual chart audit must still report that unsatisfied distinction.
  return ordered ? ordered.map((index) => colors[index]) : cycle;
}

/**
 * Pure palette resolution — see {@link ChartPalette} for the contract.
 * Exported separately from the hook so tests and non-React callers can
 * resolve palettes for any scheme/identity combination.
 */
export function resolveChartPalette(input: ResolveChartPaletteInput): ChartPalette {
  const { scheme } = input;
  const fallbackIdentity = scheme === 'dark' ? Colors.violetDark.violet10 : Colors.violet.violet9;
  const single =
    [input.identitySolid, ...(input.identityCandidates ?? [])].find((candidate) =>
      readableIdentity(candidate, scheme),
    ) ?? fallbackIdentity;
  const identityHsl = colorToHsl(single) as Hsl;

  const cycle = categoricalHueCycle.map((entry) => (scheme === 'dark' ? entry.dark : entry.light));
  const deduped =
    identityHsl.s < neutralSaturationFloor
      ? cycle
      : cycle.filter((value) => {
          const hsl = colorToHsl(value);
          if (!hsl) {
            return true;
          }
          return hueDistance(hsl.h, identityHsl.h) >= hueDedupeThresholdDeg;
        });

  return {
    scheme,
    single,
    categorical: [single, ...orderCategoricalCycle(single, deduped)],
    semantic: semanticSeries[scheme],
  };
}

/**
 * The accent solids ordered nearest-first in luminance to `identity`, so a
 * chart identity that misses the 3:1 mark floor on the reference cards falls
 * to the next accent step before a neutral one. `$accentBackground` is held
 * to the text floor, which in dark lands it one step deeper than
 * the marks need; the chart keeps the accent channel on the step beside it.
 */
export function accentIdentityCandidates(
  identity: string | undefined,
  solids: readonly (string | undefined)[],
): string[] {
  const identityHex = identity ? normalizeToHex(identity) : null;
  if (!identityHex) {
    return [];
  }
  const identityLum = relativeLuminance(identityHex);
  return solids
    .flatMap((solid) => {
      const hex = solid ? normalizeToHex(solid) : null;
      return solid && hex ? [{ solid, distance: Math.abs(relativeLuminance(hex) - identityLum) }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .map(({ solid }) => solid);
}

/**
 * Canonical chart palette for the active Tamagui theme.
 *
 * Reads scheme and tint from the resolved theme name and the identity solid
 * from the active theme (`$color9` under a tint — the re-ramped neutral
 * solid — otherwise `$accentBackground`). Chart chrome MUST take its default
 * series colors from this hook; explicit `color`/`colors` props on chart
 * data are user values and pass through untouched.
 */
export function useChartPalette(): ChartPalette {
  const themeName = useThemeName() as string | undefined;
  const theme = useTamaguiTheme() as unknown as Record<string, { val?: string } | undefined>;
  const scheme: 'light' | 'dark' = themeName?.startsWith('dark') ? 'dark' : 'light';
  const nameParts = (themeName ?? '').split('_');
  const isTint = nameParts.length > 1 && tintHueNames.has(nameParts[1]);
  const color9 = theme.color9?.val;
  const accent = theme.accentBackground?.val;
  const identitySolid = isTint ? (color9 ?? accent) : (accent ?? color9);
  const color10 = theme.color10?.val;
  const color11 = theme.color11?.val;
  const accentSolids = Array.from({ length: 10 }, (_, index) => theme[`accent${index + 1}`]?.val);
  const accentKey = accentSolids.join('|');
  return useMemo(
    () =>
      resolveChartPalette({
        scheme,
        identitySolid,
        identityCandidates: [
          ...(isTint ? [] : accentIdentityCandidates(identitySolid, accentSolids)),
          color10,
          color11,
        ],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme, identitySolid, isTint, accentKey, color10, color11],
  );
}
