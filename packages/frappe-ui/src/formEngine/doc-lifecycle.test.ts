import { describe, expect, it } from 'vitest';

import {
  buildAmendValues,
  canDeleteDoc,
  canEditDoc,
  isAmendable,
  resolveDocAction,
  resolveDocIndicator,
} from './doc-lifecycle';
import type { DocActionPerms } from './doc-lifecycle';
import { resolveDocRights } from './doc-permissions';
import type { DocFieldMeta, DocPermissionRule } from './doctype-meta';

const all: DocActionPerms = { write: true, submit: true, cancel: true, amend: true };
const none: DocActionPerms = { write: false, submit: false, cancel: false, amend: false };

const action = (
  docstatus: number,
  overrides: {
    isCreate?: boolean;
    isDirty?: boolean;
    isSubmittable?: boolean;
    isReadOnlyView?: boolean;
  } = {},
  perms: DocActionPerms = all,
) =>
  resolveDocAction({
    docstatus,
    isCreate: false,
    isDirty: false,
    isSubmittable: true,
    perms,
    ...overrides,
  });

describe('resolveDocAction follows desk get_action_status', () => {
  it('a saved, clean draft submits', () => {
    expect(action(0)).toBe('submit');
  });

  it('a new or dirty draft saves', () => {
    expect(action(0, { isCreate: true })).toBe('save');
    expect(action(0, { isDirty: true })).toBe('save');
  });

  it('a draft saves when the roles cannot submit', () => {
    expect(action(0, {}, { ...all, submit: false })).toBe('save');
  });

  it('Save and Update need write, which is create on a new document', () => {
    const readOnly = { ...all, write: false };
    expect(action(0, { isCreate: true }, readOnly)).toBeUndefined();
    expect(action(0, { isDirty: true }, readOnly)).toBeUndefined();
    expect(action(0, { isSubmittable: false }, readOnly)).toBeUndefined();
    expect(action(0, {}, readOnly)).toBe('submit');
    expect(action(1, { isDirty: true }, readOnly)).toBe('cancel');
  });

  it('a doctype that is not submittable only ever saves', () => {
    expect(action(0, { isSubmittable: false })).toBe('save');
    expect(action(1, { isSubmittable: false })).toBeUndefined();
  });

  it('a submitted document cancels, or updates while an allow_on_submit edit is pending', () => {
    expect(action(1)).toBe('cancel');
    expect(action(1, { isDirty: true })).toBe('update');
    expect(action(1, { isDirty: true }, { ...all, submit: false })).toBe('cancel');
    expect(action(1, {}, { ...all, cancel: false })).toBeUndefined();
  });

  it('a cancelled document amends, given the right', () => {
    expect(action(2)).toBe('amend');
    expect(action(2, {}, none)).toBeUndefined();
  });

  it('a read-only view drops Save and Update for its Edit and keeps Submit, Cancel and Amend', () => {
    const view = { isReadOnlyView: true };
    expect(action(0, view)).toBe('submit');
    expect(action(0, { ...view, isSubmittable: false })).toBeUndefined();
    expect(action(0, view, { ...all, submit: false })).toBeUndefined();
    expect(action(1, view)).toBe('cancel');
    expect(action(1, { ...view, isDirty: true })).toBeUndefined();
    expect(action(2, view)).toBe('amend');
  });
});

describe(canEditDoc, () => {
  const title: DocFieldMeta = { fieldname: 'title', fieldtype: 'Data' };
  const remarks: DocFieldMeta = { fieldname: 'remarks', fieldtype: 'Data', allow_on_submit: 1 };
  const plain = { fields: [title] };
  const onSubmit = { fields: [title, remarks] };

  it('edits any draft, a submitted document only through allow_on_submit, a cancelled one never', () => {
    expect(canEditDoc(0, plain)).toBe(true);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(canEditDoc(0, undefined)).toBe(true);
    expect(canEditDoc(1, plain)).toBe(false);
    expect(canEditDoc(1, onSubmit)).toBe(true);
    expect(canEditDoc(2, onSubmit)).toBe(false);
  });
});

describe("the toolbar reads the session's level-0 rights", () => {
  const rules: DocPermissionRule[] = [
    { role: 'Clerk', permlevel: 0, read: 1, write: 1, submit: 1 },
    { role: 'Manager', permlevel: 0, read: 1, cancel: 1, amend: 1 },
    { role: 'Auditor', permlevel: 1, read: 1, write: 1, submit: 1, cancel: 1, amend: 1 },
  ];
  const perms = (roles: string[]) => resolveDocRights({ permissions: rules, roles });

  it('a Clerk saves and submits but neither cancels nor amends', () => {
    expect(action(0, {}, perms(['Clerk']))).toBe('submit');
    expect(action(1, {}, perms(['Clerk']))).toBeUndefined();
    expect(action(2, {}, perms(['Clerk']))).toBeUndefined();
    expect(action(2, {}, perms(['Clerk', 'Manager']))).toBe('amend');
  });

  it('rows above level 0 grant no lifecycle action', () => {
    expect(action(0, { isDirty: true }, perms(['Auditor']))).toBeUndefined();
    expect(action(1, {}, perms(['Auditor']))).toBeUndefined();
  });
});

describe('desk indicator and delete', () => {
  it('names the state the way the desk title pill does', () => {
    const base = { docstatus: 0, isCreate: false, isDirty: false, isSubmittable: true };
    expect(resolveDocIndicator({ ...base, isCreate: true })).toBe('notSaved');
    expect(resolveDocIndicator({ ...base, isDirty: true, docstatus: 1 })).toBe('notSaved');
    expect(resolveDocIndicator(base)).toBe('draft');
    expect(resolveDocIndicator({ ...base, docstatus: 1 })).toBe('submitted');
    expect(resolveDocIndicator({ ...base, docstatus: 2 })).toBe('cancelled');
    expect(resolveDocIndicator({ ...base, isSubmittable: false })).toBeUndefined();
  });

  it('never deletes a submitted document', () => {
    expect(canDeleteDoc(0)).toBe(true);
    expect(canDeleteDoc(1)).toBe(false);
    expect(canDeleteDoc(2)).toBe(true);
  });
});

describe('buildAmendValues follows desk copy_doc(from_amend)', () => {
  const fields: DocFieldMeta[] = [
    { fieldname: 'title', fieldtype: 'Data' },
    { fieldname: 'ref_no', fieldtype: 'Data', no_copy: 1 },
    { fieldname: 'secret', fieldtype: 'Password' },
    { fieldname: 'cancel_reason', fieldtype: 'Small Text' },
    { fieldname: 'items', fieldtype: 'Table', options: 'Loan Item' },
    { fieldname: 'amendment_date', fieldtype: 'Date' },
    { fieldname: 'amended_from', fieldtype: 'Link', options: 'Asset Loan', no_copy: 1 },
  ];
  const cancelled = {
    name: 'LOAN-1',
    docstatus: 2,
    title: 'Laptop',
    ref_no: 'R-7',
    secret: 'hunter2',
    cancel_reason: 'Wrong serial',
    amended_from: 'LOAN-0',
    items: [
      {
        name: 'row-1',
        parent: 'LOAN-1',
        parentfield: 'items',
        parenttype: 'Asset Loan',
        docstatus: 2,
        idx: 1,
        item: 'Charger',
      },
    ],
  };

  it('copies no_copy fields, skips passwords and the cancel reason, points at the cancelled doc', () => {
    const draft = buildAmendValues(fields, cancelled, 'LOAN-1');
    expect(draft.title).toBe('Laptop');
    expect(draft.ref_no).toBe('R-7');
    expect(draft).not.toHaveProperty('secret');
    expect(draft).not.toHaveProperty('cancel_reason');
    expect(draft).not.toHaveProperty('name');
    expect(draft.amended_from).toBe('LOAN-1');
    expect(draft.docstatus).toBe(0);
    expect(draft.amendment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it('strips child rows of their identity', () => {
    const draft = buildAmendValues(fields, cancelled, 'LOAN-1');
    expect(draft.items).toStrictEqual([{ idx: 1, item: 'Charger' }]);
  });

  it('amends only a doctype that carries amended_from', () => {
    expect(isAmendable({ fields })).toBe(true);
    expect(isAmendable({ fields: fields.slice(0, 2) })).toBe(false);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(isAmendable(undefined)).toBe(false);
  });
});
