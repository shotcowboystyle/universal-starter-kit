/**
 * listFields — permlevel column pruning (desk parity with base_list.js
 * `get_fields_in_list_view`: in_list_view fields above the session roles'
 * READ permlevel never render as columns). The matrix itself is the form
 * workstream's fieldPermissions module (perm.js parity) — reused, not forked.
 * buildListColumns maps listViewFields 1:1 into column defs, so pruning is
 * asserted here on the pure module.
 */
import { describe, expect, it } from 'vitest';

import type { DoctypeMeta } from '../formEngine/doctype-meta';
import { buildPermLevelMatrix } from '../formEngine/field-permissions';
import type { PermLevelMatrix } from '../formEngine/field-permissions';

import { listDocumentColumnIds, listFieldsToFetch, listViewFields } from './list-fields';

const meta: DoctypeMeta = {
  name: 'User',
  title_field: 'full_name',
  fields: [
    { fieldname: 'full_name', fieldtype: 'Data', label: 'Full Name', in_list_view: 1 },
    { fieldname: 'enabled', fieldtype: 'Check', label: 'Enabled', in_list_view: 1 },
    {
      fieldname: 'role_profile_name',
      fieldtype: 'Link',
      label: 'Role Profile',
      in_list_view: 1,
      permlevel: 1,
    },
    {
      fieldname: 'api_secret_hint',
      fieldtype: 'Data',
      label: 'API Secret Hint',
      in_list_view: 1,
      permlevel: 2,
    },
    { fieldname: 'bio', fieldtype: 'Small Text', label: 'Bio' },
  ],
  permissions: [
    { role: 'System Manager', permlevel: 0, read: 1, write: 1 },
    { role: 'System Manager', permlevel: 1, read: 1, write: 1 },
    // No rows at permlevel 2 — desk gap-fills {} and hides those fields.
  ],
};

const viewFieldnames = (matrix?: PermLevelMatrix): string[] =>
  listViewFields(meta, meta.title_field ?? 'name', matrix).map((field) => field.fieldname);

describe('listViewFields permlevel pruning', () => {
  it('without a matrix (fixtures / roles unavailable) prunes nothing', () => {
    const names = viewFieldnames();
    expect(names).toContain('enabled');
    expect(names).toContain('role_profile_name');
    expect(names).toContain('api_secret_hint');
  });

  it('keeps fields whose permlevel the roles can read, prunes the rest', () => {
    const matrix = buildPermLevelMatrix(meta.permissions, ['System Manager']);
    const names = viewFieldnames(matrix);
    // Level 0.
    expect(names).toContain('enabled');
    // Level 1, granted.
    expect(names).toContain('role_profile_name');
    // Level 2 has no granting rows at all → hidden (desk gap-fill).
    expect(names).not.toContain('api_secret_hint');
  });

  it('prunes every above-zero level for roles with no granting rows', () => {
    const matrix = buildPermLevelMatrix(meta.permissions, ['Desk User']);
    const names = viewFieldnames(matrix);
    expect(names).toContain('enabled');
    expect(names).not.toContain('role_profile_name');
    expect(names).not.toContain('api_secret_hint');
  });

  it('excludes the title field regardless of the matrix (title column owns it)', () => {
    expect(viewFieldnames()).not.toContain('full_name');
    const matrix = buildPermLevelMatrix(meta.permissions, ['Desk User']);
    expect(viewFieldnames(matrix)).not.toContain('full_name');
  });

  it('never includes fields that are not in_list_view', () => {
    expect(viewFieldnames()).not.toContain('bio');
  });
});

describe('listFieldsToFetch permlevel pruning', () => {
  it('skips unreadable in_list_view fields but keeps bookkeeping fields', () => {
    const matrix = buildPermLevelMatrix(meta.permissions, ['Desk User']);
    const fields = listFieldsToFetch(meta, matrix);
    expect(fields).toStrictEqual(expect.arrayContaining(['name', 'modified', 'full_name', 'enabled', '_comments']));
    expect(fields).not.toContain('role_profile_name');
    expect(fields).not.toContain('api_secret_hint');
  });

  it('fetches everything in_list_view when no matrix is available', () => {
    const fields = listFieldsToFetch(meta);
    expect(fields).toContain('role_profile_name');
    expect(fields).toContain('api_secret_hint');
  });
});

// frappe/model/__init__.py default_fields and optional_fields: the only names
// frappe.desk.reportview.validate_fields lets through without a DocField.
// Anything else that isn't a field of the doctype answers 417 "Field not
// permitted in query" for every user without the query bypass (MPO-389).
const frappeStandardFields = new Set([
  'doctype',
  'name',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'docstatus',
  'idx',
  '_user_tags',
  '_comments',
  '_assign',
  '_liked_by',
  '_seen',
]);

describe('listFieldsToFetch asks only for columns Frappe will select', () => {
  it("names nothing but the doctype's fields and Frappe's standard columns", () => {
    const fieldnames = new Set(meta.fields.map((field) => field.fieldname));
    const rejected = listFieldsToFetch(meta).filter((name) => !fieldnames.has(name) && !frappeStandardFields.has(name));
    expect(rejected).toStrictEqual([]);
  });

  it('reads the comment count from _comments instead of the computed _comment_count', () => {
    const fields = listFieldsToFetch(meta);
    expect(fields).toContain('_comments');
    expect(fields).not.toContain('_comment_count');
  });
});

describe('listDocumentColumnIds desk list anatomy', () => {
  it('is title, in_list_view values, then the activity cluster — no extra ID/modified', () => {
    expect(listDocumentColumnIds(meta)).toStrictEqual([
      'full_name',
      'enabled',
      'role_profile_name',
      'api_secret_hint',
      '_activity',
    ]);
  });
});
