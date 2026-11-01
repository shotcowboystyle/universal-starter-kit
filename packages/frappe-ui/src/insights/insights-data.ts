/**
 * The aggregates an insights page draws from the rows one list reads and the
 * values its facet reading found: no React, no IO.
 */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- insights rows are open Frappe docs of any doctype; fields are coerced where read
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

const numberOf = (row: Row, field: string): number => {
  const value = Number(row[field]);
  return Number.isFinite(value) ? value : 0;
};

/** Records per facet value among `rows`, most common first, ties A to Z. */
export const facetDistribution = (
  values: ReadonlyMap<string, readonly string[]>,
  rows: readonly Row[],
): InsightsCount[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of values.get(row.name ?? '') ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return (
    [...counts]
      .map(([value, count]) => ({ value, count }))
      // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is not guaranteed on every Hermes runtime this ships to
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  );
};

/** At most `max` entries: the tail folds into one `other` entry holding its sum. */
export const foldDistribution = (entries: readonly InsightsCount[], max: number): InsightsCount[] => {
  if (entries.length <= max) {
    return [...entries];
  }
  const kept = entries.slice(0, Math.max(0, max - 1));
  const tail = entries.slice(kept.length).reduce((sum, entry) => sum + entry.count, 0);
  return [...kept, { value: '', count: tail, other: true }];
};

/** Records among `rows` carrying more than one facet value. */
export const multiValued = (values: ReadonlyMap<string, readonly string[]>, rows: readonly Row[]): number =>
  rows.filter((row) => (values.get(row.name ?? '') ?? []).length > 1).length;

export const average = (rows: readonly Row[], field: string): number => {
  if (rows.length === 0) {
    return 0;
  }
  return rows.reduce((sum, row) => sum + numberOf(row, field), 0) / rows.length;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- compares raw field values of open docs, whatever their representation
const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return -1;
  }
  if (b === null || b === undefined) {
    return 1;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- numbers order numerically, everything else as text
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- non-numeric field values order by their text form
  return String(a).localeCompare(String(b));
};

/**
 * The rows in an order-by's order, key by key: a collection does not promise
 * it (a fixture corpus answers in insertion order), and ranks break their
 * ties in this order.
 */
export const orderRows = <TRow extends Row>(
  rows: readonly TRow[],
  orderBy: readonly { field: string; order: string }[] | null | undefined,
): TRow[] => {
  if (orderBy == null || orderBy.length === 0) {
    return [...rows];
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is not guaranteed on every Hermes runtime this ships to
  return [...rows].sort((a, b) => {
    for (const { field, order } of orderBy) {
      const compared = compareValues(a[field], b[field]);
      if (compared !== 0) {
        return order === 'desc' ? -compared : compared;
      }
    }
    return 0;
  });
};

/** The `n` rows with the largest `field`; ties keep the rows' order. */
export const topBy = <TRow extends Row>(rows: readonly TRow[], field: string, n: number): TRow[] =>
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is not guaranteed on every Hermes runtime this ships to
  [...rows].sort((a, b) => numberOf(b, field) - numberOf(a, field)).slice(0, Math.max(0, n));

/** A round bucket width (1, 2 or 5 times a power of ten) for about six buckets up to `max`. */
export const bucketWidth = (max: number): number => {
  const raw = max / 6;
  // oxlint-disable-next-line sonarjs/no-inverted-boolean-check -- the negation also catches NaN, which `raw <= 1` would let through
  if (!(raw > 1)) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((step) => step * magnitude).find((width) => width >= raw) ?? raw;
};

/**
 * Counts of `field` in `width`-wide buckets from 0, empty buckets between
 * occupied ones kept so a bar chart's axis reads as a scale.
 */
export const histogram = (rows: readonly Row[], field: string, width?: number): InsightsBucket[] => {
  if (rows.length === 0) {
    return [];
  }
  const values = rows.map((row) => Math.max(0, numberOf(row, field)));
  const size = width !== undefined && width > 0 ? width : bucketWidth(Math.max(...values));
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
};
