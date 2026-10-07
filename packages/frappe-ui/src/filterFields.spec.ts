import type { DocTypeField } from '@repo/frappe';
import { describe, expect, it } from 'vitest';

import {
  docFieldsToFilterFields,
  filterableFieldsFromMeta,
  standardDocFilterFields,
  standardFiltersFromMeta,
} from './filterFields';
import type { DoctypeMeta } from './formEngine/doctypeMeta';
import { filterValueToFrappeTuple } from './FrappeTable';

const docFields = [
  { fieldname: 'customer_name', fieldtype: 'Data', label: 'Customer Name' },
  { fieldname: 'territory', fieldtype: 'Link', label: 'Territory', options: 'Territory' },
  {
    fieldname: 'status',
    fieldtype: 'Select',
    label: 'Status',
    options: 'Active\nInactive\nLead',
  },
  { fieldname: 'credit_limit', fieldtype: 'Currency', label: 'Credit Limit' },
  { fieldname: 'disabled', fieldtype: 'Check', label: 'Disabled' },
  { fieldname: 'since', fieldtype: 'Date', label: 'Customer Since' },
  { fieldname: 'notes', fieldtype: 'Text Editor', label: 'Notes' },
  { fieldname: 'score', fieldtype: 'Rating', label: 'Score' },
  { fieldname: 'tier', fieldtype: 'Autocomplete', label: 'Tier', options: 'Gold\nSilver' },
  // Non-filterable noise
  { fieldname: 'section_1', fieldtype: 'Section Break' },
  { fieldname: 'col_1', fieldtype: 'Column Break' },
  { fieldname: 'items', fieldtype: 'Table', label: 'Items', options: 'Customer Item' },
  { fieldname: 'photo', fieldtype: 'Attach Image', label: 'Photo' },
] as DocTypeField[];

describe(docFieldsToFilterFields, () => {
  const fields = docFieldsToFilterFields(docFields);
  const byId = Object.fromEntries(fields.map((f) => [f.id, f]));

  it('maps Frappe fieldtypes through the registry to filter editor types', () => {
    expect(byId.customer_name.type).toBe('text');
    expect(byId.territory.type).toBe('text'); // Link filters as text (id match)
    expect(byId.status.type).toBe('select');
    expect(byId.credit_limit.type).toBe('number');
    expect(byId.disabled.type).toBe('boolean');
    expect(byId.since.type).toBe('date');
    expect(byId.notes.type).toBe('text');
  });

  it('Rating filters as a number despite its custom cell render', () => {
    expect(byId.score.type).toBe('number');
  });

  it('Autocomplete filters as a select with its static options', () => {
    expect(byId.tier.type).toBe('select');
    expect(byId.tier.options).toEqual([
      { label: 'Gold', value: 'Gold' },
      { label: 'Silver', value: 'Silver' },
    ]);
  });

  it('parses Select options into label/value pairs', () => {
    expect(byId.status.options).toEqual([
      { label: 'Active', value: 'Active' },
      { label: 'Inactive', value: 'Inactive' },
      { label: 'Lead', value: 'Lead' },
    ]);
  });

  it('skips layout, child-table, and attachment fieldtypes', () => {
    expect(byId.section_1).toBeUndefined();
    expect(byId.col_1).toBeUndefined();
    expect(byId.items).toBeUndefined();
    expect(byId.photo).toBeUndefined();
  });

  it('appends the standard doc fields, the desk facet columns included', () => {
    expect(byId.name).toMatchObject({ label: 'ID', type: 'text' });
    expect(byId.owner?.type).toBe('text');
    expect(byId.creation?.type).toBe('date');
    expect(byId.modified?.type).toBe('date');
    expect(byId.modified_by).toMatchObject({ label: 'Last Updated By', type: 'text' });
    expect(byId._assign).toMatchObject({ label: 'Assigned To', type: 'text' });
    expect(byId._user_tags).toMatchObject({ label: 'Tags', type: 'text' });
    expect(byId._liked_by).toMatchObject({ label: 'Liked By', type: 'text' });
    expect(byId._comments).toMatchObject({ label: 'Comments', type: 'text' });
  });

  it('offers exactly the fields and labels the desk filter picker offers (one vocabulary)', () => {
    const desk = filterableFieldsFromMeta({ name: 'Customer', fields: docFields } as DoctypeMeta);
    expect(fields.map((field) => [field.id, field.label])).toEqual(desk.map((field) => [field.fieldname, field.label]));
    const standard = standardDocFilterFields().map((field) => field.fieldname);
    expect(fields.slice(-standard.length).map((field) => field.id)).toEqual(standard);
  });

  it('does not repeat a standard field the doctype already declares', () => {
    const out = docFieldsToFilterFields([
      { fieldname: 'owner', fieldtype: 'Link', label: 'Owner', options: 'User' } as DocTypeField,
    ]);
    expect(out.filter((field) => field.id === 'owner')).toEqual([{ id: 'owner', label: 'Owner', type: 'text' }]);
  });

  it('uses the label when present and falls back to fieldname', () => {
    const out = docFieldsToFilterFields([{ fieldname: 'custom_x', fieldtype: 'Data' } as DocTypeField]);
    expect(out.find((f) => f.id === 'custom_x')?.label).toBe('custom_x');
  });
});

describe(filterValueToFrappeTuple, () => {
  it('maps text operators to like patterns', () => {
    expect(filterValueToFrappeTuple('email', { operator: 'contains', value: 'corp' })).toEqual([
      'email',
      'like',
      '%corp%',
    ]);
    expect(filterValueToFrappeTuple('email', { operator: 'doesNotContain', value: 'corp' })).toEqual([
      'email',
      'not like',
      '%corp%',
    ]);
    expect(filterValueToFrappeTuple('email', { operator: 'startsWith', value: 'ada' })).toEqual([
      'email',
      'like',
      'ada%',
    ]);
    expect(filterValueToFrappeTuple('email', { operator: 'endsWith', value: '.org' })).toEqual([
      'email',
      'like',
      '%.org',
    ]);
  });

  it('maps empty checks to Frappe set/not-set', () => {
    expect(filterValueToFrappeTuple('email', { operator: 'isEmpty', value: null })).toEqual(['email', 'is', 'not set']);
    expect(filterValueToFrappeTuple('email', { operator: 'isNotEmpty', value: null })).toEqual(['email', 'is', 'set']);
  });

  it('maps comparisons and equality', () => {
    expect(filterValueToFrappeTuple('age', { operator: 'isGreaterThan', value: '30' })).toEqual(['age', '>', '30']);
    expect(filterValueToFrappeTuple('since', { operator: 'isOnOrBefore', value: '2025-01-01' })).toEqual([
      'since',
      '<=',
      '2025-01-01',
    ]);
    expect(filterValueToFrappeTuple('status', { operator: 'is', value: 'Active' })).toEqual(['status', '=', 'Active']);
  });

  it('maps multi-value operators to in / not in', () => {
    expect(
      filterValueToFrappeTuple('status', {
        operator: 'isAnyOf',
        value: null,
        values: ['Active', 'Lead'],
      }),
    ).toEqual(['status', 'in', ['Active', 'Lead']]);
    expect(
      filterValueToFrappeTuple('status', {
        operator: 'isNoneOf',
        value: null,
        values: ['Inactive'],
      }),
    ).toEqual(['status', 'not in', ['Inactive']]);
  });

  it('returns null for value-carrying operators with no value (half-built live filters)', () => {
    expect(filterValueToFrappeTuple('email', { operator: 'contains', value: '' })).toBeNull();
    expect(filterValueToFrappeTuple('email', { operator: 'is', value: null })).toBeNull();
    expect(filterValueToFrappeTuple('status', { operator: 'isAnyOf', value: null, values: [] })).toBeNull();
  });
});

describe(standardFiltersFromMeta, () => {
  const todoMeta = {
    name: 'ToDo',
    title_field: 'description',
    fields: [
      {
        fieldname: 'status',
        fieldtype: 'Select',
        label: 'Status',
        options: 'Open\nClosed',
        in_standard_filter: 1,
      },
      { fieldname: 'description', fieldtype: 'Small Text', label: 'Description' },
      { fieldname: 'priority', fieldtype: 'Select', label: 'Priority', in_list_view: 1 },
    ],
  } as DoctypeMeta;

  it('prepends ID and the title field when they are not already standard filters', () => {
    const names = standardFiltersFromMeta(todoMeta).map((field) => field.fieldname);
    expect(names[0]).toBe('name');
    expect(names).toContain('description');
    expect(names).toContain('status');
    expect(names).not.toContain('priority');
  });
});
