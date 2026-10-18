/**
 * URL state codec for the query-report surface — the `?filters=` query param.
 *
 * Schema (list `?f=` sibling, one JSON param per surface):
 *   filters = urlencoded JSON OBJECT of filter values keyed by fieldname
 *             (`{"status":"Open","from_date":"2026-08-01","show_permissions":1}`)
 *             — the exact dict shape frappe.desk.query_report.run accepts;
 *             absent while every filter sits at its default/empty state.
 *
 * Bidirectional best-effort channel (desk update_url_with_filters parity):
 * the screen writes applied values through the navigator's optional
 * `setParams` (history REPLACE, no remount) and adopts inbound param changes
 * (deep links, back/forward), so reload and shared links reproduce the run.
 */
/* oxlint-disable anti-slop/no-runtime-typeof -- this module is the `?filters=` parse boundary: typeof checks are the parsing */
import { isEmptyFilterValue } from '@repo/frappe-ui';
import type { QueryReportFilters } from '@repo/frappe-ui';

/**
 * Parse the `?filters=` deep-link value. The router usually decodes the
 * param already, so the raw value is tried first (same contract as the
 * list's `?f=` parser). Only scalar values survive (strings, numbers,
 * booleans — the run dict vocabulary); malformed input degrades to {}.
 */
export const parseQueryReportFiltersParam = (raw?: string | string[]): QueryReportFilters => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === '') {
    return {};
  }
  const candidates = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) {
      candidates.push(decoded);
    }
  } catch {
    // raw is not percent-encoded — the direct candidate covers it
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }
      const filters: QueryReportFilters = {};
      for (const [fieldname, entry] of Object.entries(parsed)) {
        if ((typeof entry === 'string' && entry !== '') || typeof entry === 'number' || typeof entry === 'boolean') {
          filters[fieldname] = entry;
        }
      }
      if (Object.keys(filters).length > 0) {
        return filters;
      }
    } catch {
      // not JSON — try the next candidate
    }
  }
  return {};
};

/** Code-unit key order (not locale order), so serialization is stable across runtimes. */
const compareKeys = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

/**
 * Filter values → `?filters=` value (raw JSON — the router encodes);
 * undefined drops the param. Keys are sorted so equal states serialize
 * identically (the inbound-adoption echo guard compares these strings).
 */
export const serializeQueryReportFiltersParam = (filters: QueryReportFilters): string | undefined => {
  const entries = Object.entries(filters)
    .filter(
      ([, value]) =>
        !isEmptyFilterValue(value) &&
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'),
    )
    .toSorted(([a], [b]) => compareKeys(a, b));
  if (entries.length === 0) {
    return undefined;
  }
  return JSON.stringify(Object.fromEntries(entries));
};
