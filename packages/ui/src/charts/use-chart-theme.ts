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

import { radiusStopFromToken, resolveRadiusClass, useChartPalette, useResolvedKnobs } from '@repo/theme';
import type { ChartPalette } from '@repo/theme';
import { gray, grayDark } from '@tamagui/colors';
import { useMemo } from 'react';
import { getConfig, getVariableValue, useTheme as useTamaguiTheme, useThemeName } from 'tamagui';
import type { TransitionProp } from 'tamagui';

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

const labelFontSizeBySizeToken = new Map([
  ['$3', 11],
  ['$4', 12],
  ['$5', 13],
]);

const resolveFontFamily = (fontToken: string): string | undefined => {
  try {
    const { family } = getConfig().fontsParsed[fontToken];
    const value: unknown = getVariableValue(family);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- getVariableValue returns `any`; typeof narrows the resolved family to a string
    return typeof value === 'string' ? value : undefined;
  } catch {
    // Safe to continue: no tamagui config or unknown font token means no resolvable family; callers fall back to the default font.
    return undefined;
  }
};

export const useChartTheme = (): ChartTheme => {
  const { knobProps } = useResolvedKnobs();
  const palette = useChartPalette();
  const themeName = useThemeName();
  const theme: Record<string, { val?: string } | undefined> = useTamaguiTheme();
  const scheme: 'light' | 'dark' = themeName?.startsWith('dark') ? 'dark' : 'light';

  // Same last-resort strategy as chartPalette: sanctioned ramp constants,
  // used only when the live theme is unreadable (SSR pre-hydration).
  const ramp = scheme === 'dark' ? grayDark : gray;
  const axisColor = theme.color6?.val ?? ramp.gray6;
  const gridColor = theme.color4?.val ?? ramp.gray4;
  const labelColor = theme.color11?.val ?? ramp.gray11;

  const bodyFontToken = knobProps.body.fontFamily;
  const { sizeToken } = knobProps;
  const radiusToken = knobProps.borderRadius.borderRadius;
  const { transition } = knobProps;

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
      labelFontSize: labelFontSizeBySizeToken.get(sizeToken) ?? 12,
      transition,
      animationEnabled: transition !== null && transition !== undefined,
      barCornerRadius: (bandWidth: number, barHeight: number) =>
        Math.max(0, Math.min(barRadiusBase, bandWidth / 2, barHeight)),
    };
  }, [scheme, palette, axisColor, gridColor, labelColor, bodyFontToken, sizeToken, radiusToken, transition]);
};
