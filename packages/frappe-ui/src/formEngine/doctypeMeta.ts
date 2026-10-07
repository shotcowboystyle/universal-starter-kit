/**
 * The desk's names for the one DocType meta model, which
 * `@repo/frappe` declares (MPO-15). These are aliases, not
 * shapes: the form engine, the backoffice surfaces and `useDocTypeMeta`
 * all read the same `DocTypeField` / `DocTypeMeta`, so a field key the
 * server sends reaches every one of them or none.
 */
import type { DocTypeField, DocTypeLink, DocTypeMeta, DocTypePermission } from '@repo/frappe';

export type DocFieldMeta = DocTypeField;
export type DocLinkMeta = DocTypeLink;
export type DocPermissionRule = DocTypePermission;
export type DoctypeMeta = DocTypeMeta;
