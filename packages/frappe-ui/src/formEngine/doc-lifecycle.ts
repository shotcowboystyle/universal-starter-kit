/**
 * The docstatus lifecycle of a submittable doctype, with desk's rules
 * (frappe/public/js/frappe/form/toolbar.js `get_action_status`,
 * form.js `amend_doc`, model/create_new.js `copy_doc`):
 *
 *   docstatus 0  Draft      Save, or Submit once saved and clean
 *   docstatus 1  Submitted  Update when an allow_on_submit field is dirty,
 *                           else Cancel
 *   docstatus 2  Cancelled  Amend into a new draft with amended_from
 *
 * The toolbar shows exactly one of those actions at a time, picked in
 * desk's order: Submit, Save, Update, Cancel, Amend. A submitted document
 * cannot be deleted. A read-only view (a record page) has no Save or
 * Update: its Edit opens the editor, and Submit, Cancel and Amend stay.
 */

import { formatCalendarDate } from '@repo/theme';

import type { DocRights } from './doc-permissions';
import type { DocFieldMeta, DoctypeMeta } from './doctype-meta';

export type DocAction = 'save' | 'submit' | 'update' | 'cancel' | 'amend';

export type DocStatusIndicator = 'notSaved' | 'draft' | 'submitted' | 'cancelled';

/**
 * The session's level-0 rights the toolbar needs (desk `frm.perm[0]`), as
 * docPermissions.ts resolves them. `write` is `create` on a new document.
 */
export type DocActionPerms = Pick<DocRights, 'write' | 'submit' | 'cancel' | 'amend'>;

export interface DocActionState {
  docstatus: number;
  isCreate: boolean;
  isDirty: boolean;
  isSubmittable: boolean;
  perms: DocActionPerms;
  /** The form is a read-only view whose Edit stands in for Save and Update. */
  isReadOnlyView?: boolean;
}

const resolveDeskAction = (state: DocActionState): DocAction | undefined => {
  const { docstatus, isCreate, isDirty, isSubmittable, perms } = state;
  if (docstatus === 0) {
    if (isSubmittable && !isCreate && !isDirty && perms.submit) {
      return 'submit';
    }
    return perms.write ? 'save' : undefined;
  }
  if (!isSubmittable) {
    return undefined;
  }
  if (docstatus === 1) {
    if (isDirty && perms.write && perms.submit) {
      return 'update';
    }
    return perms.cancel ? 'cancel' : undefined;
  }
  if (docstatus === 2 && perms.amend) {
    return 'amend';
  }
  return undefined;
};

/** The one lifecycle action desk offers for this state, if any. */
export const resolveDocAction = (state: DocActionState): DocAction | undefined => {
  const action = resolveDeskAction(state);
  if (state.isReadOnlyView && (action === 'save' || action === 'update')) {
    return undefined;
  }
  return action;
};

/** Desk hides Delete on a submitted document. */
export const canDeleteDoc = (docstatus: number): boolean => docstatus !== 1;

/**
 * A saved document still has something to edit: any draft, a submitted one
 * only through its allow_on_submit fields, a cancelled one nothing.
 */
export const canEditDoc = (docstatus: number, meta: Pick<DoctypeMeta, 'fields'> | undefined): boolean => {
  if (docstatus === 0) {
    return true;
  }
  if (docstatus === 1) {
    return meta?.fields.some((field) => Boolean(field.allow_on_submit)) ?? false;
  }
  return false;
};

/** Desk's title indicator for the document's state. */
export const resolveDocIndicator = (state: {
  docstatus: number;
  isCreate: boolean;
  isDirty: boolean;
  isSubmittable: boolean;
}): DocStatusIndicator | undefined => {
  if (state.isCreate || state.isDirty) {
    return 'notSaved';
  }
  if (state.docstatus === 1) {
    return 'submitted';
  }
  if (state.docstatus === 2) {
    return 'cancelled';
  }
  return state.isSubmittable ? 'draft' : undefined;
};

/** Desk refuses to amend a doctype that has no `amended_from` field. */
export const isAmendable = (meta: Pick<DoctypeMeta, 'fields'> | undefined): boolean =>
  meta?.fields.some((field) => field.fieldname === 'amended_from') ?? false;

const amendSkipped = new Set(['name', 'amended_from', 'amendment_date', 'cancel_reason']);
const rowBookkeeping = new Set([
  'name',
  'parent',
  'parentfield',
  'parenttype',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'docstatus',
]);
const tableTypes = new Set(['Table', 'Table MultiSelect']);

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- doc field values are DocType-defined; keys and types are only known from runtime meta
type DocValues = Record<string, unknown>;

/** A child row without the identity and bookkeeping the server reissues. */
const stripRowIdentity = (row: DocValues | null | undefined): DocValues =>
  Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !rowBookkeeping.has(key)));

/**
 * The new draft Amend opens (desk `copy_doc(doc, from_amend=1)`): every
 * field value including `no_copy` ones, never a password, child rows
 * stripped of their identity, `amended_from` pointing at the cancelled
 * document and `amendment_date` set to today when the doctype has one.
 */
export const buildAmendValues = (fields: DocFieldMeta[], doc: DocValues, cancelledName: string) => {
  const draft: DocValues = {};
  for (const field of fields) {
    const value = doc[field.fieldname];
    const skipped = amendSkipped.has(field.fieldname) || field.fieldtype === 'Password' || value === undefined;
    if (!skipped && !tableTypes.has(field.fieldtype)) {
      draft[field.fieldname] = value;
    } else if (!skipped && Array.isArray(value)) {
      draft[field.fieldname] = value.map(stripRowIdentity);
    }
  }
  draft.amended_from = cancelledName;
  draft.docstatus = 0;
  if (fields.some((field) => field.fieldname === 'amendment_date')) {
    draft.amendment_date = formatCalendarDate(new Date());
  }
  return draft;
};
