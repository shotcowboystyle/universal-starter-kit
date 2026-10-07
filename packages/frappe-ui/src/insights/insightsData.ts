/**
 * The aggregates an insights page draws from the rows one list reads and the
 * values its facet reading found: no React, no IO.
 */

type Row = { name?: string } & Record<string, unknown>;

export interface InsightsCount {
  value: string;
  count: number;
  /** The folded tail of a distribution. */
  other?: boolean;
}

export interface InsightsBucket {
  /** The bucket's range, "60–119". */
  label: string;
  value: number;
}

function numberOf(row: Row, field: string): number {
  const value = Number(row[field]);
  return Number.isFinite(value) ? value : 0;
}

/** Records per facet value among `rows`, most common first, ties A to Z. */
export function facetDistribution(
  values: ReadonlyMap<string, readonly string[]>,
  rows: readonly Row[],
): InsightsCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of values.get(row.name ?? '') ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** At most `max` entries: the tail folds into one `other` entry holding its sum. */
export function foldDistribution(entries: readonly InsightsCount[], max: number): InsightsCount[] {
  if (entries.length <= max) {
    return [...entries];
  }
  const kept = entries.slice(0, Math.max(0, max - 1));
  const tail = entries.slice(kept.length).reduce((sum, entry) => sum + entry.count, 0);
  return [...kept, { value: '', count: tail, other: true }];
}

/** Records among `rows` carrying more than one facet value. */
export function multiValued(values: ReadonlyMap<string, readonly string[]>, rows: readonly Row[]): number {
  return rows.filter((row) => (values.get(row.name ?? '') ?? []).length > 1).length;
}

export function average(rows: readonly Row[], field: string): number {
  if (rows.length === 0) {
    return 0;
  }
  return rows.reduce((sum, row) => sum + numberOf(row, field), 0) / rows.length;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return -1;
  }
  if (b === null || b === undefined) {
    return 1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

/**
 * The rows in an order-by's order, key by key: a collection does not promise
 * it (a fixture corpus answers in insertion order), and ranks break their
 * ties in this order.
 */
export function orderRows<TRow extends Row>(
  rows: readonly TRow[],
  orderBy: readonly { field: string; order: string }[] | undefined,
): TRow[] {
  if (!orderBy?.length) {
    return [...rows];
  }
  return [...rows].sort((a, b) => {
    for (const { field, order } of orderBy) {
      const compared = compareValues(a[field], b[field]);
      if (compared !== 0) {
        return order === 'desc' ? -compared : compared;
      }
    }
    return 0;
  });
}

/** The `n` rows with the largest `field`; ties keep the rows' order. */
export function topBy<TRow extends Row>(rows: readonly TRow[], field: string, n: number): TRow[] {
  return [...rows].sort((a, b) => numberOf(b, field) - numberOf(a, field)).slice(0, Math.max(0, n));
}

/** A round bucket width (1, 2 or 5 times a power of ten) for about six buckets up to `max`. */
export function bucketWidth(max: number): number {
  const raw = max / 6;
  if (!(raw > 1)) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((step) => step * magnitude).find((width) => width >= raw) ?? raw;
}

/**
 * Counts of `field` in `width`-wide buckets from 0, empty buckets between
 * occupied ones kept so a bar chart's axis reads as a scale.
 */
export function histogram(rows: readonly Row[], field: string, width?: number): InsightsBucket[] {
  if (rows.length === 0) {
    return [];
  }
  const values = rows.map((row) => Math.max(0, numberOf(row, field)));
  const size = width && width > 0 ? width : bucketWidth(Math.max(...values));
  const counts = new Map<number, number>();
  let last = 0;
  for (const value of values) {
    const bucket = Math.floor(value / size);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    last = Math.max(last, bucket);
  }
  return Array.from({ length: last + 1 }, (_, bucket) => ({
    label: `${bucket * size}–${(bucket + 1) * size - 1}`,
    value: counts.get(bucket) ?? 0,
  }));
}
