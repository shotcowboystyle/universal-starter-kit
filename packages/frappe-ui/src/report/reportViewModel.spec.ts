import { describe, expect, it } from 'vitest';

import type { DoctypeMeta } from '../formEngine/doctypeMeta';

import {
  buildGridRows,
  buildReportCsv,
  columnFilterTuple,
  columnFilterTuples,
  computeTotals,
  defaultReportFieldnames,
  fromDeskReportSettings,
  orderReportRows,
  parseDeskOrderBy,
  parseReportFiltersParam,
  reportColumnsFromMeta,
  resolveSelectedColumns,
  toDeskReportSettings,
} from './reportViewModel';
import type { ReportColumnDef, ReportRow } from './reportViewModel';

const userMeta: DoctypeMeta = {
  name: 'User',
  title_field: 'full_name',
  sort_field: 'modified',
  sort_order: 'DESC',
  fields: [
    { fieldname: 'basic_section', fieldtype: 'Section Break' },
    { fieldname: 'email', label: 'Email', fieldtype: 'Data', in_list_view: 1 },
    { fieldname: 'first_name', label: 'First Name', fieldtype: 'Data', in_standard_filter: 1 },
    { fieldname: 'full_name', label: 'Full Name', fieldtype: 'Data', in_list_view: 1 },
    { fieldname: 'enabled', label: 'Enabled', fieldtype: 'Check', in_standard_filter: 1 },
    {
      fieldname: 'user_type',
      label: 'User Type',
      fieldtype: 'Select',
      options: 'System User\nWebsite User',
      in_list_view: 1,
      in_standard_filter: 1,
    },
    {
      fieldname: 'api_secret',
      label: 'API Secret',
      fieldtype: 'Data',
      in_list_view: 1,
      report_hide: 1,
    },
    {
      fieldname: 'roles',
      label: 'Roles',
      fieldtype: 'Table',
      options: 'Has Role',
      in_list_view: 1,
    },
    { fieldname: 'bio', label: 'Bio', fieldtype: 'Small Text' },
    { fieldname: 'points', label: 'Points', fieldtype: 'Int' },
    {
      fieldname: 'role_profile',
      label: 'Role Profile',
      fieldtype: 'Link',
      options: 'Role Profile',
    },
  ],
};

function column(fieldname: string, overrides: Partial<ReportColumnDef> = {}): ReportColumnDef {
  return {
    fieldname,
    label: fieldname,
    fieldtype: 'Data',
    kind: 'text',
    width: 160,
    align: 'left',
    ...overrides,
  };
}

describe(defaultReportFieldnames, () => {
  it('seeds desk defaults: name, title field, in_list_view/in_standard_filter, modified', () => {
    expect(defaultReportFieldnames(userMeta)).toEqual([
      'name',
      'full_name',
      'email',
      'first_name',
      'enabled',
      'user_type',
      'modified',
    ]);
  });

  it('excludes report_hide, layout and table fields, dedupes the title field', () => {
    const fields = defaultReportFieldnames(userMeta);
    expect(fields).not.toContain('api_secret');
    expect(fields).not.toContain('roles');
    expect(fields).not.toContain('basic_section');
    expect(fields.filter((field) => field === 'full_name')).toHaveLength(1);
  });

  it('degrades to name + modified without meta', () => {
    expect(defaultReportFieldnames()).toEqual(['name', 'modified']);
  });

  it('includes the image_field after the title field (desk set_default_fields)', () => {
    const meta: DoctypeMeta = {
      ...userMeta,
      image_field: 'user_image',
      fields: [...userMeta.fields, { fieldname: 'user_image', label: 'User Image', fieldtype: 'Attach Image' }],
    };
    const fields = defaultReportFieldnames(meta);
    expect(fields.indexOf('user_image')).toBe(fields.indexOf('full_name') + 1);
  });

  it('seeds an unflagged status docfield right after name', () => {
    const meta: DoctypeMeta = {
      name: 'ToDo',
      fields: [
        { fieldname: 'status', label: 'Status', fieldtype: 'Select', options: 'Open\nClosed' },
        { fieldname: 'description', label: 'Description', fieldtype: 'Text', in_list_view: 1 },
      ],
    };
    expect(defaultReportFieldnames(meta)).toEqual(['name', 'status', 'description', 'modified']);
  });

  it('pulls the currency-source field referenced by a flagged Currency column', () => {
    const meta: DoctypeMeta = {
      name: 'Quote',
      fields: [
        {
          fieldname: 'amount',
          label: 'Amount',
          fieldtype: 'Currency',
          options: 'currency',
          in_list_view: 1,
        },
        { fieldname: 'currency', label: 'Currency', fieldtype: 'Link', options: 'Currency' },
        {
          fieldname: 'converted',
          label: 'Converted',
          fieldtype: 'Currency',
          options: 'Company:company:default_currency',
          in_list_view: 1,
        },
      ],
    };
    expect(defaultReportFieldnames(meta)).toEqual(['name', 'amount', 'converted', 'currency', 'company', 'modified']);
  });
});

describe(reportColumnsFromMeta, () => {
  it('offers ID first, all value-type meta fields, then standard doc fields', () => {
    const columns = reportColumnsFromMeta(userMeta);
    expect(columns[0].fieldname).toBe('name');
    const names = columns.map((entry) => entry.fieldname);
    expect(names).toContain('bio');
    expect(names).toContain('points');
    expect(names).toContain('owner');
    expect(names).toContain('modified');
    expect(names).not.toContain('roles');
    expect(names).not.toContain('basic_section');
  });

  it('derives kind, width and alignment from the fieldtype', () => {
    const columns = reportColumnsFromMeta(userMeta);
    const points = columns.find((entry) => entry.fieldname === 'points');
    expect(points).toMatchObject({ kind: 'number', align: 'right' });
    const enabled = columns.find((entry) => entry.fieldname === 'enabled');
    expect(enabled).toMatchObject({ kind: 'check', align: 'center' });
    const userType = columns.find((entry) => entry.fieldname === 'user_type');
    expect(userType).toMatchObject({ kind: 'select', options: 'System User\nWebsite User' });
  });
});

describe(resolveSelectedColumns, () => {
  it('keeps selection order and drops unknown fieldnames', () => {
    const all = reportColumnsFromMeta(userMeta);
    const resolved = resolveSelectedColumns(all, ['user_type', 'nope', 'name']);
    expect(resolved.map((entry) => entry.fieldname)).toEqual(['user_type', 'name']);
  });
});

describe(columnFilterTuple, () => {
  it('wraps text in contains-like (user wildcards win)', () => {
    expect(columnFilterTuple(column('email'), 'test')).toEqual(['email', 'like', '%test%']);
    expect(columnFilterTuple(column('email'), 'test%')).toEqual(['email', 'like', 'test%']);
    expect(columnFilterTuple(column('email'), '  ')).toBeNull();
  });

  it('equals exact select options (case-insensitive), likes partials', () => {
    const select = column('user_type', {
      fieldtype: 'Select',
      kind: 'select',
      options: 'System User\nWebsite User',
    });
    expect(columnFilterTuple(select, 'system user')).toEqual(['user_type', '=', 'System User']);
    expect(columnFilterTuple(select, 'Sys')).toEqual(['user_type', 'like', '%Sys%']);
  });

  it('parses check values, rejects unparseable input', () => {
    const check = column('enabled', { fieldtype: 'Check', kind: 'check' });
    expect(columnFilterTuple(check, 'yes')).toEqual(['enabled', '=', 1]);
    expect(columnFilterTuple(check, '0')).toEqual(['enabled', '=', 0]);
    expect(columnFilterTuple(check, 'maybe')).toBeNull();
  });

  it('supports comparison prefixes on numbers and dates', () => {
    const points = column('points', { fieldtype: 'Int', kind: 'number' });
    expect(columnFilterTuple(points, '>= 10')).toEqual(['points', '>=', '10']);
    expect(columnFilterTuple(points, '5')).toEqual(['points', '=', '5']);
    expect(columnFilterTuple(points, '>')).toBeNull();
    const modified = column('modified', { fieldtype: 'Datetime', kind: 'date' });
    expect(columnFilterTuple(modified, '>2026-01-01')).toEqual(['modified', '>', '2026-01-01']);
  });
});

describe(columnFilterTuples, () => {
  it('collects only parseable inputs, keyed by fieldname', () => {
    const columns = [column('email'), column('enabled', { fieldtype: 'Check', kind: 'check' })];
    expect(columnFilterTuples(columns, { email: 'a', enabled: '??', other: 'x' })).toEqual([['email', 'like', '%a%']]);
  });
});

describe('desk report settings round trip', () => {
  it('serializes fields/filters/order_by/group_by in desk shape', () => {
    const settings = toDeskReportSettings('User', {
      fieldnames: ['name', 'email'],
      filters: [['enabled', '=', 1]],
      sort: { field: 'creation', order: 'asc' },
      pageSize: 100,
      groupBy: 'user_type',
      addTotals: true,
    });
    expect(settings.fields).toEqual([
      ['name', 'User'],
      ['email', 'User'],
    ]);
    expect(settings.filters).toEqual([['User', 'enabled', '=', 1]]);
    expect(settings.order_by).toBe('`tabUser`.`creation` asc');
    expect(settings.add_totals_row).toBe(1);
    expect(settings.page_length).toBe(100);
    expect(settings.group_by).toEqual({
      group_by: '`tabUser`.`user_type`',
      aggregate_function: 'count',
      aggregate_on: null,
    });
  });

  it('parses desk json back (dropping child-doctype fields and filters)', () => {
    const parsed = fromDeskReportSettings('User', {
      fields: [['name', 'User'], ['role', 'Has Role'], 'email'],
      filters: [
        ['User', 'enabled', '=', 1],
        ['Has Role', 'role', '=', 'System Manager'],
        ['user_type', '=', 'System User'],
      ],
      order_by: '`tabUser`.`modified` desc',
      add_totals_row: 1,
      page_length: 500,
      group_by: { group_by: '`tabUser`.`user_type`', aggregate_function: 'count' },
    });
    expect(parsed).toEqual({
      fieldnames: ['name', 'email'],
      filters: [
        ['enabled', '=', 1],
        ['user_type', '=', 'System User'],
      ],
      sort: { field: 'modified', order: 'desc' },
      pageSize: 500,
      groupBy: 'user_type',
      addTotals: true,
    });
  });

  it('round-trips through its own serialization', () => {
    const config = {
      fieldnames: ['name', 'points'],
      filters: [['points', '>', '5']] as [string, string, unknown][],
      sort: { field: 'points', order: 'asc' as const },
      pageSize: 20,
      groupBy: null,
      addTotals: false,
    };
    const parsed = fromDeskReportSettings('User', toDeskReportSettings('User', config));
    expect(parsed).toEqual(config);
  });

  it('tolerates garbage', () => {
    expect(fromDeskReportSettings('User', null)).toBeUndefined();
    expect(fromDeskReportSettings('User', '{}')).toBeUndefined();
    expect(fromDeskReportSettings('User', {})).toMatchObject({ fieldnames: [], filters: [] });
  });
});

describe(parseDeskOrderBy, () => {
  it('parses backticked and bare expressions', () => {
    expect(parseDeskOrderBy('`tabUser`.`modified` desc')).toEqual({
      field: 'modified',
      order: 'desc',
    });
    expect(parseDeskOrderBy('creation asc')).toEqual({ field: 'creation', order: 'asc' });
    expect(parseDeskOrderBy('')).toBeUndefined();
    expect(parseDeskOrderBy(42)).toBeUndefined();
  });
});

describe('orderReportRows / buildGridRows', () => {
  const rows: ReportRow[] = [
    { name: 'c', status: 'Open', points: 3 },
    { name: 'a', status: 'Closed', points: 1 },
    { name: 'b', status: 'Open', points: 2 },
    { name: 'd', status: 'Open', points: null },
  ];

  it('orders by sort field with name tiebreak, nulls last', () => {
    const ordered = orderReportRows(rows, { field: 'points', order: 'desc' });
    expect(ordered.map((row) => row.name)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('groups first when grouping, then sorts inside groups', () => {
    const ordered = orderReportRows(rows, { field: 'points', order: 'asc' }, 'status');
    expect(ordered.map((row) => row.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('injects group headers with full-result counts inside the page', () => {
    const ordered = orderReportRows(rows, { field: 'points', order: 'asc' }, 'status');
    const page = buildGridRows(ordered, 0, 2, 'status');
    expect(page).toHaveLength(4);
    expect(page[0]).toMatchObject({ kind: 'group', value: 'Closed', count: 1 });
    expect(page[1]).toMatchObject({ kind: 'row', key: 'a', index: 1 });
    expect(page[2]).toMatchObject({ kind: 'group', value: 'Open', count: 3 });
    expect(page[3]).toMatchObject({ kind: 'row', key: 'b', index: 2 });
  });

  it('numbers rows across pages without grouping', () => {
    const ordered = orderReportRows(rows, { field: 'name', order: 'asc' });
    const page = buildGridRows(ordered, 2, 2);
    expect(page).toEqual([
      { kind: 'row', key: 'c', row: ordered[2], index: 3 },
      { kind: 'row', key: 'd', row: ordered[3], index: 4 },
    ]);
  });
});

describe(computeTotals, () => {
  it('sums numeric visible columns over all rows', () => {
    const columns = [column('name'), column('points', { fieldtype: 'Int', kind: 'number' })];
    const totals = computeTotals(columns, [
      { name: 'a', points: 1 },
      { name: 'b', points: 2 },
      { name: 'c', points: 'x' },
    ]);
    expect(totals).toEqual([{ fieldname: 'points', fieldtype: 'Int', value: 3 }]);
  });

  it('is empty without rows', () => {
    expect(computeTotals([column('points', { fieldtype: 'Int', kind: 'number' })], [])).toEqual([]);
  });
});

describe(buildReportCsv, () => {
  it('escapes quotes, commas and newlines', () => {
    const csv = buildReportCsv(
      [column('name', { label: 'ID' }), column('bio', { label: 'Bio, or so' })],
      [{ name: 'a', bio: 'say "hi"\nplease' }],
    );
    expect(csv).toBe('ID,"Bio, or so"\na,"say ""hi""\nplease"');
  });
});

describe(parseReportFiltersParam, () => {
  it('parses raw and urlencoded JSON tuples', () => {
    expect(parseReportFiltersParam('[["enabled","=",1]]')).toEqual([['enabled', '=', 1]]);
    expect(parseReportFiltersParam(encodeURIComponent('[["user_type","=","System User"]]'))).toEqual([
      ['user_type', '=', 'System User'],
    ]);
  });

  it('degrades to undefined on malformed input', () => {
    expect(parseReportFiltersParam('not json')).toBeUndefined();
    expect(parseReportFiltersParam('')).toBeUndefined();
    expect(parseReportFiltersParam(42)).toBeUndefined();
  });
});
