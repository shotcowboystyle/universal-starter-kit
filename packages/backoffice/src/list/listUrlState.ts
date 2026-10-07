/**
 * URL state codec for the list surface — the `?f=` / `?sort=` query params.
 *
 * Schema (desk URL-state parity, rule candidate from the 2026-08-12 audit):
 *   f    = urlencoded JSON array of frappe filter tuples
 *          (`[["status","=","Open"],["priority","in",["High","Medium"]]]`);
 *          absent when no user filters apply.
 *   sort = `<fieldname>.<asc|desc>` (frappe fieldnames are snake_case
 *          identifiers, so "." never collides); absent while the list rides
 *          the doctype's meta default sort.
 *
 * Inbound `?f=` predates this module (connections panels / dashboards deep
 * link with it); the codec makes the contract BIDIRECTIONAL — the screen
 * writes state back through the navigator's `setParams` (the desk
 * `update_url_with_filters` → history.replaceState channel), so refresh,
 * back/forward, and shared links reproduce filters and sort.
 */
import type { FrappeFilter, FrappeFilters } from '../shared/types';

export interface ListSortState {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Parse the `?f=` deep-link query (urlencoded JSON FrappeFilters). The
 * router usually decodes the param already, so the raw value is tried first
 * (same contract as ReportView's parser). Malformed input degrades to no
 * filters.
 */
export function parseFiltersParam(raw: string | undefined): FrappeFilters {
  if (!raw) {
    return [];
  }
  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) {
      candidates.push(decoded);
    }
  } catch {
    // raw is not percent-encoded — the direct candidate covers it
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!Array.isArray(parsed)) {
        continue;
      }
      const filters = parsed
        .filter(
          (tuple): tuple is [string, string, ...unknown[]] =>
            Array.isArray(tuple) && tuple.length >= 3 && typeof tuple[0] === 'string' && typeof tuple[1] === 'string',
        )
        .map((tuple) => [tuple[0], tuple[1], tuple[2]] as FrappeFilter);
      if (filters.length > 0) {
        return filters;
      }
    } catch {
      // not JSON — try the next candidate
    }
  }
  return [];
}

/** Filters → `?f=` value (raw JSON — the router encodes); undefined drops the param. */
export function serializeFiltersParam(filters: FrappeFilters): string | undefined {
  return filters.length > 0 ? JSON.stringify(filters) : undefined;
}

/** Parse `?sort=<fieldname>.<asc|desc>`; anything malformed → undefined. */
export function parseSortParam(raw: string | undefined): ListSortState | undefined {
  if (!raw) {
    return undefined;
  }
  let value = raw;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) {
      value = decoded;
    }
  } catch {
    // not percent-encoded — use as-is
  }
  const dot = value.lastIndexOf('.');
  if (dot <= 0) {
    return undefined;
  }
  const field = value.slice(0, dot);
  const order = value.slice(dot + 1);
  if (order !== 'asc' && order !== 'desc') {
    return undefined;
  }
  return { field, order };
}

/** Sort state → `?sort=` value. */
export function serializeSortParam(sort: ListSortState): string {
  return `${sort.field}.${sort.order}`;
}
