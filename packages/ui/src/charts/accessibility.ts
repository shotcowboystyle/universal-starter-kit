/**
 * Generated accessible chart summaries (Axiom 12 LEGIBLE FLOOR).
 *
 * Every chart surface exposes `role="img"` with a generated text summary so
 * screen-reader users get the shape of the data, not silence. The functions
 * are pure; components pass already-translated type/title labels in, and the
 * numbers format through the house number register (`formatChartValue`) so a
 * summary speaks the same value a sighted reader sees.
 */

import { formatChartValue } from './math';
import type { ChartDatum } from './types';

export interface DescribeChartInput {
  /** Already-translated chart-kind label, e.g. `t("Bar chart")`. */
  typeLabel: string;
  /** Optional already-translated chart title. */
  title?: string;
  data: ChartDatum[];
  /** Value formatter (defaults to the house number register). */
  formatValue?: (value: number) => string;
  /**
   * Include each datum's share of the total (pie/donut summaries).
   */
  includeShare?: boolean;
}

/**
 * One-sentence data summary for a whole chart:
 * "Bar chart, Revenue: 5 data points. Highest May (1,200); lowest Jan (400)."
 */
export function describeChart(input: DescribeChartInput): string {
  const { typeLabel, title, data } = input;
  const formatValue = input.formatValue ?? formatChartValue;
  const head = title ? `${typeLabel}, ${title}` : typeLabel;
  if (data.length === 0) {
    return `${head}: no data`;
  }
  if (data.length === 1) {
    return `${head}: 1 data point. ${data[0].label} ${formatValue(data[0].value)}`;
  }
  let highest = data[0];
  let lowest = data[0];
  let total = 0;
  for (const datum of data) {
    if (datum.value > highest.value) {
      highest = datum;
    }
    if (datum.value < lowest.value) {
      lowest = datum;
    }
    total += datum.value;
  }
  const parts = [
    `${head}: ${data.length} data points`,
    `highest ${highest.label} (${formatValue(highest.value)})`,
    `lowest ${lowest.label} (${formatValue(lowest.value)})`,
  ];
  if (input.includeShare) {
    parts.push(`total ${formatValue(total)}`);
  }
  return `${parts[0]}. ${parts.slice(1).join('; ')}`;
}

export interface DescribeDatumInput {
  datum: ChartDatum;
  /** Sum of all values — adds a percentage share when provided. */
  total?: number;
  formatValue?: (value: number) => string;
}

/**
 * Per-datum accessible name for interactive targets:
 * "May: 1,200" or "May: 1,200 (31%)".
 */
export function describeDatum(input: DescribeDatumInput): string {
  const formatValue = input.formatValue ?? formatChartValue;
  const base = `${input.datum.label}: ${formatValue(input.datum.value)}`;
  if (input.total && input.total > 0) {
    const share = Math.round((input.datum.value / input.total) * 100);
    return `${base} (${share}%)`;
  }
  return base;
}

/** Exact datum text for the independently opened data view, separate from the image name. */
export function chartDatumText(data: ChartDatum[], formatValue = formatChartValue): Array<[string, string]> {
  return data.map((datum) => [datum.label.trim(), formatValue(datum.value).trim()]);
}
