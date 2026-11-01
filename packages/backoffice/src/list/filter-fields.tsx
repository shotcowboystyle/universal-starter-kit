/**
 * The filterable-field vocabulary — moved to
 * `@repo/frappe-ui/src/filter-fields` (MPO-15), where it is the
 * one vocabulary both list stacks read: this desk chrome and FrappeTable's
 * toolbar (`docFieldsToFilterFields`). Re-exported here so the barrel and
 * the `@repo/backoffice/src/list/filter-fields` deep import
 * keep resolving (the GNOME shim deep-imports this path). New code imports
 * from `@repo/frappe-ui`.
 */

export {
  defaultOperatorForKind,
  DESK_OPERATOR_LABELS,
  draftToTuple,
  fieldKind,
  fieldLabelFor,
  filterableFieldsFromMeta,
  filterTupleLabel,
  operatorsForKind,
  quickFilterValue,
  selectOptionsFromField,
  setFieldFilter,
  standardDocFilterFields,
  standardFiltersFromMeta,
  tupleToDraft,
} from '@repo/frappe-ui';
export type { DeskOperator, FilterFieldDescriptor, FilterFieldKind, FilterRowDraft } from '@repo/frappe-ui';
