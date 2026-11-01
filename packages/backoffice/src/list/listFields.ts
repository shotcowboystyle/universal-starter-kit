/**
 * List field selection — moved to
 * `@repo/frappe-ui/src/list/list-fields` (MPO-15) with the
 * column builder that consumes it. Re-exported here so existing imports
 * keep resolving (the GNOME shim deep-imports this path).
 */

export { listDocumentColumnIds, listFieldsToFetch, listViewFields } from '@repo/frappe-ui';
