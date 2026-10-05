/**
 * Chart data contracts shared by the headless math core, the SVG primitives,
 * and the composed charts.
 *
 * `ChartDatum` is intentionally shape-compatible with the existing
 * `ChartDataPoint` (views/Dashboard) and ReportBuilder's
 * `{ label, value }` rows so surfaces can migrate without data mapping.
 */

export interface ChartDatum {
  /** Category / point label (x identity for band charts). */
  label: string;
  /** Numeric value (y). */
  value: number;
  /**
   * Explicit data color — a value, not chrome (Axiom 11 VALUE IS DATA).
   * Passes through untouched; never restyled by theme or palette.
   */
  color?: string;
}

/** A resolved pixel-space point (post-scale). */
export interface PixelPoint {
  x: number;
  y: number;
}

/** Measured drawing viewport handed to chart content by ChartSurface. */
export interface ChartSize {
  width: number;
  height: number;
}

/** Plot rectangle inside the surface after axis margins are reserved. */
export interface PlotArea {
  /** Left edge (px). */
  x: number;
  /** Top edge (px). */
  y: number;
  width: number;
  height: number;
}

export type ChartCurve = 'linear' | 'monotone' | 'natural' | 'step';

/** Per-datum interaction callbacks (tooltip-ready targets). */
export interface ChartDatumEvents {
  /** Press / click on a datum target. */
  onDatumPress?: (datum: ChartDatum, index: number) => void;
  /** Pointer enters a datum target (web hover; native pressIn). */
  onDatumHoverIn?: (datum: ChartDatum, index: number) => void;
  /** Pointer leaves a datum target (web hover out; native pressOut). */
  onDatumHoverOut?: (datum: ChartDatum, index: number) => void;
}
