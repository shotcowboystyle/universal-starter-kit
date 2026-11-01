import type { DocFieldMeta, DoctypeMeta } from '../formEngine/doctype-meta';
// Pure (node-safe, no UI imports) field selection for the doctype list:
// which fields to fetch and which in_list_view fields render as columns.
// Kept out of listColumns.tsx so the pruning logic is unit-testable without
// the components barrel.
//
// Permlevel pruning reuses the form workstream's UI-free role-matrix module
// (desk perm.js parity) rather than forking it (schema conformance §10
// handoff).
import { canReadLevel } from '../formEngine/field-permissions';
import type { PermLevelMatrix } from '../formEngine/field-permissions';

/** Image fields never render as list columns. */
const IMAGE_FIELDTYPES = new Set(['Image', 'Attach Image']);

/** Read access for a field's permlevel (level 0 / no matrix always read). */
const fieldLevelReadable = (field: DocFieldMeta, permMatrix?: PermLevelMatrix): boolean =>
  canReadLevel(permMatrix, (field.permlevel ?? 0) || 0);

/** Fields the list view fetches for a doctype (columns + niceties). */
export const listFieldsToFetch = (meta?: DoctypeMeta, permMatrix?: PermLevelMatrix): string[] => {
  const fields = new Set<string>(['name', 'modified', 'owner', '_liked_by', '_assign', '_user_tags', '_comments']);
  if (meta?.title_field !== undefined && meta.title_field !== '') {
    fields.add(meta.title_field);
  }
  for (const field of meta?.fields ?? []) {
    if (Boolean(field.in_list_view) && field.fieldname && fieldLevelReadable(field, permMatrix)) {
      fields.add(field.fieldname);
    }
  }
  return [...fields];
};

/**
 * The in_list_view fields to render as columns (title field excluded).
 * Desk parity: fields above the session's read permlevel never render as
 * list columns (base_list.js `get_fields_in_list_view` →
 * `frappe.perm.has_perm(doctype, df.permlevel, "read")`). An undefined
 * matrix (fixtures / roles unavailable) prunes nothing — the server strips
 * no-read values either way.
 */
export const listViewFields = (
  meta: DoctypeMeta | undefined,
  titleField: string,
  permMatrix?: PermLevelMatrix,
): DocFieldMeta[] =>
  (meta?.fields ?? []).filter(
    (field) =>
      Boolean(field.in_list_view) &&
      field.fieldname !== titleField &&
      !IMAGE_FIELDTYPES.has(field.fieldtype) &&
      fieldLevelReadable(field, permMatrix),
  );

/** Column ids the list view paints, in order: title, in_list_view, activity. */
export const listDocumentColumnIds = (meta?: DoctypeMeta, permMatrix?: PermLevelMatrix): string[] => {
  const titleField = meta?.title_field ?? 'name';
  return [titleField, ...listViewFields(meta, titleField, permMatrix).map((field) => field.fieldname), '_activity'];
};
