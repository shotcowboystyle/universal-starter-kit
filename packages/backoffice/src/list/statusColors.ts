/**
 * Status pill colors — moved to
 * `@repo/frappe-ui/src/list/statusColors` (MPO-15) with the
 * column builder that consumes them. Re-exported here so existing imports
 * keep resolving (the GNOME shim deep-imports this path).
 */

export { statusPillColors } from '@repo/frappe-ui';
export type { StatusPillColors } from '@repo/frappe-ui';
