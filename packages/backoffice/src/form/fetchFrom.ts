/**
 * `fetch_from` map + lock helpers — moved to
 * `@repo/frappe-ui/src/formEngine/fetchFrom` (MPO-15).
 * Re-exported here so existing imports keep resolving.
 */

export { applyFetchedValues, buildFetchMap, isFetchLocked } from '@repo/frappe-ui';
export type { FetchMap, FetchRule } from '@repo/frappe-ui';
