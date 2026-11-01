/** A record as the insights sections draw it, resolved once by FrappeInsights. */
export interface InsightsRecordView<TDoc> {
  title: (doc: TDoc) => string;
  code: (doc: TDoc) => string | undefined;
  images: (doc: TDoc) => string[];
  /** The facet values' tints, first value first. */
  tints: (doc: TDoc) => (string | undefined)[];
  /** The record's facet values. */
  values: (doc: TDoc) => string[];
  valueLabel: (value: string) => string;
  valueTint: (value: string) => string | undefined;
  open: (doc: TDoc) => void;
}

export interface FrappeInsightsMetric {
  /** A numeric field of the doctype. */
  field: string;
  label: string;
  /** A value as shown (units, precision); defaults to the number. */
  format?: (value: number) => string;
  /** Names the metric's record-holder tile ("Tallest"); without it, no tile. */
  record?: string;
  /** Histogram bucket width; defaults to a round width for about six buckets. */
  bucket?: number;
  /** A record page fills a bar under the value to this ceiling. */
  max?: number;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- docs are open Frappe rows of any doctype; this coerces one field to a number
export const metricValue = (doc: unknown, field: string): number => {
  // SAFETY: docs are plain Frappe row objects; a missing field reads undefined and coerces to NaN, handled below
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
  const value = Number((doc as Record<string, unknown>)[field]);
  return Number.isFinite(value) ? value : 0;
};

export const formatMetric = (metric: FrappeInsightsMetric, value: number): string =>
  metric.format ? metric.format(value) : String(value);
