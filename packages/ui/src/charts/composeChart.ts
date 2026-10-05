/**
 * Shared layout/color plumbing for the composed charts (Bar/Line/Area/Pie).
 * Pure helpers — unit-testable without a renderer.
 */

import type { ChartPalette } from '@repo/theme';

import { AXIS_LABEL_GAP, AXIS_TICK_LENGTH } from './Axis';
import { approximateTextWidth } from './math';
import type { ChartDatum, ChartSize, PlotArea } from './types';

export interface CartesianPlotInput {
  showXAxis: boolean;
  showYAxis: boolean;
  /** Formatted y tick labels (drives the left margin). */
  yTickLabels: string[];
  fontSize: number;
}

/**
 * Reserve margins for axes inside the measured surface and return the plot
 * rectangle. Label widths are approximated cross-platform (no DOM measure);
 * the approximation over-reserves slightly so labels never clip.
 */
export function computeCartesianPlot(size: ChartSize, input: CartesianPlotInput): PlotArea {
  const { showXAxis, showYAxis, yTickLabels, fontSize } = input;
  const top = Math.ceil(fontSize / 2) + 2;
  const right = 4;
  const bottom = showXAxis ? AXIS_TICK_LENGTH + AXIS_LABEL_GAP + Math.ceil(fontSize * 1.15) : 4;
  const maxYLabelWidth = showYAxis
    ? Math.max(0, ...yTickLabels.map((label) => approximateTextWidth(label, fontSize)))
    : 0;
  const left = showYAxis ? Math.ceil(maxYLabelWidth) + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + 2 : 4;
  return {
    x: left,
    y: top,
    width: Math.max(0, size.width - left - right),
    height: Math.max(0, size.height - top - bottom),
  };
}

export interface SeriesFillsInput {
  /** Explicit single-series color (a prop-level data color). */
  color?: string;
  /** Explicit per-datum colors (prop-level data colors). */
  colors?: string[];
  /** Paint per-datum categorical identity instead of one series color. */
  categorical?: boolean;
}

/**
 * Resolve one fill per datum:
 * per-datum `color` > explicit `colors`/`color` props (VALUE IS DATA — pass
 * through untouched) > canonical palette (categorical cycle for categorical
 * data, otherwise the single theme identity for every mark).
 *
 * `palette.categorical` is a third list on purpose (distinguishability,
 * not nest order). Never fold it into `preset.tints`.
 */
export function resolveSeriesFills(data: ChartDatum[], palette: ChartPalette, input?: SeriesFillsInput): string[] {
  return data.map((datum, index) => {
    if (datum.color) {
      return datum.color;
    }
    if (input?.colors && input.colors.length > 0) {
      return input.colors[index % input.colors.length];
    }
    if (input?.categorical) {
      return palette.categorical[index % palette.categorical.length];
    }
    return input?.color ?? palette.single;
  });
}

/** Widest x label a slot may spend before thinning kicks in (px). */
const MAX_X_LABEL_SLOT = 72;
const X_LABEL_SLOT_GAP = 8;

/**
 * Pick an evenly-strided subset of category labels that fits the plot width
 * without overlap (at phone widths): every label gets a slot sized by
 * the widest label (capped), and the stride skips the rest.
 */
export function thinCategories(labels: string[], plotWidth: number, fontSize: number): string[] {
  if (labels.length <= 1 || plotWidth <= 0) {
    return labels;
  }
  const widest = Math.max(...labels.map((label) => approximateTextWidth(label, fontSize)));
  const slot = Math.min(widest, MAX_X_LABEL_SLOT) + X_LABEL_SLOT_GAP;
  const capacity = Math.max(1, Math.floor(plotWidth / slot));
  if (labels.length <= capacity) {
    return labels;
  }
  const stride = Math.ceil(labels.length / capacity);
  return labels.filter((_, index) => index % stride === 0);
}
