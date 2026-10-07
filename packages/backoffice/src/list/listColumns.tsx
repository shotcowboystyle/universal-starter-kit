/**
 * Desk list column builder — moved to
 * `@repo/frappe-ui/src/list/listColumns` (MPO-15), where
 * FrappeTable derives its default columns from it. Re-exported here so the
 * barrel and the `@repo/backoffice/src/list/listColumns` deep
 * import keep resolving (the GNOME shim deep-imports this path). New code
 * imports from `@repo/frappe-ui`.
 */

export { buildListColumns } from '@repo/frappe-ui';
export type { BuildListColumnsArgs, ListDoc, ListRow } from '@repo/frappe-ui';
