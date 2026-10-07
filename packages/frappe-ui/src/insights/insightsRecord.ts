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

export function metricValue(doc: unknown, field: string): number {
  const value = Number((doc as Record<string, unknown>)[field]);
  return Number.isFinite(value) ? value : 0;
}

export function formatMetric(metric: FrappeInsightsMetric, value: number): string {
  return metric.format ? metric.format(value) : String(value);
}
