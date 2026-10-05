/**
 * Chart chrome theming — the one channel (Axiom 5 ONE SOURCE).
 *
 * SVG attributes need resolved color/font strings, not Tamagui tokens, so
 * this hook resolves the chart chrome from the live theme + knobs exactly
 * once per chart:
 *
 * - series colors come ONLY from `useChartPalette()` — explicit
 *   data colors pass through untouched at the call sites. The
 *   categorical cycle is a third list (distinguishability), never
 *   `preset.tints`;
 * - axis/grid/label chrome maps the componentColors roles (border `$color6`,
 *   divider `$color4`, muted text `$color11`) through `useTheme().val`, so
 *   chrome re-anchors under schemes and tints like every other surface;
 * - label typography follows the `bodyFont` + `size` knobs (family resolved
 *   from the Tamagui font config — KNOB-TOTALITY for text inside SVG);
 * - `transition` carries the animation knob (undefined at `none`/PRM via
 *   `useResolvedKnobs`) so draw-in motion stops per A-CONTINUOUS;
 * - `barCornerRadius` resolves the borderRadius knob through the DEFAULT
 *   class (Part 2b: 0/5/9/16/50) and caps at the mark's own anatomy
 *   (R-SCALE-DATA: half the band, and the bar's own value extent).
 */

import {
  radiusStopFromToken,
  resolveRadiusClass,
  useChartPalette,
  useResolvedKnobs,
  type ChartPalette,
} from '@repo/theme';
import * as Colors from '@tamagui/colors';
import { useMemo } from 'react';
import { getConfig, getVariableValue, useTheme as useTamaguiTheme, useThemeName, type TransitionProp } from 'tamagui';

export interface ChartTheme {
  scheme: 'light' | 'dark';
  /** Canonical series palette. */
  palette: ChartPalette;
  /** Axis line + tick marks (border role, `$color6`). */
  axisColor: string;
  /** Grid lines (divider role, `$color4`). */
  gridColor: string;
  /** Tick/legend label fill (muted text role, `$color11` — AA floor). */
  labelColor: string;
  /** Resolved body-font family for SVG text (bodyFont knob). */
  labelFontFamily?: string;
  /** Label size stepped by the size knob (11/12/13). */
  labelFontSize: number;
  /** Animation-knob transition; undefined at `none` / reduced motion. */
  transition?: TransitionProp;
  /** True when draw-in / continuous motion may play (A-CONTINUOUS). */
  animationEnabled: boolean;
  /** Value-end bar corner radius from the borderRadius knob, clamped to anatomy. */
  barCornerRadius: (bandWidth: number, barHeight: number) => number;
}

const labelFontSizeBySizeToken: Record<string, number> = {
  $3: 11,
  $4: 12,
  $5: 13,
};

function resolveFontFamily(fontToken: unknown): string | undefined {
  if (typeof fontToken !== 'string') {
    return undefined;
  }
  try {
    const fonts = getConfig()?.fontsParsed as Record<string, { family?: unknown } | undefined> | undefined;
    const family = fonts?.[fontToken]?.family;
    const value = getVariableValue(family as Parameters<typeof getVariableValue>[0]);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function useChartTheme(): ChartTheme {
  const { knobProps } = useResolvedKnobs();
  const palette = useChartPalette();
  const themeName = useThemeName() as string | undefined;
  const theme = useTamaguiTheme() as unknown as Record<string, { val?: string } | undefined>;
  const scheme: 'light' | 'dark' = themeName?.startsWith('dark') ? 'dark' : 'light';

  // Same last-resort strategy as chartPalette: sanctioned ramp constants,
  // used only when the live theme is unreadable (SSR pre-hydration).
  const gray = scheme === 'dark' ? Colors.grayDark : Colors.gray;
  const axisColor = theme.color6?.val ?? gray.gray6;
  const gridColor = theme.color4?.val ?? gray.gray4;
  const labelColor = theme.color11?.val ?? gray.gray11;

  const bodyFontToken = knobProps.body.fontFamily;
  const sizeToken = String(knobProps.sizeToken);
  const radiusToken = String(knobProps.borderRadius.borderRadius);
  const transition = knobProps.transition;

  return useMemo(() => {
    const radiusStop = radiusStopFromToken(radiusToken);
    const barRadiusBase = radiusStop ? resolveRadiusClass('DEFAULT', radiusStop) : 0;
    return {
      scheme,
      palette,
      axisColor,
      gridColor,
      labelColor,
      labelFontFamily: resolveFontFamily(bodyFontToken),
      labelFontSize: labelFontSizeBySizeToken[sizeToken] ?? 12,
      transition,
      animationEnabled: transition !== null && transition !== undefined,
      barCornerRadius: (bandWidth: number, barHeight: number) =>
        Math.max(0, Math.min(barRadiusBase, bandWidth / 2, barHeight)),
    };
  }, [scheme, palette, axisColor, gridColor, labelColor, bodyFontToken, sizeToken, radiusToken, transition]);
}
