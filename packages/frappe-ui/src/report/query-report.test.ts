// Normalizer specs pinned to PROBED bench payloads (see queryReport.ts
// header): v15 dict columns/rows from frappe.desk.query_report.run plus the
// defensive old-style string-column / positional-array-row forms, and the
// script-module filter extraction (probed get_script payloads).
import { describe, expect, it } from 'vitest';

import {
  buildRunFilters,
  compactFilterValues,
  compactQueryReportFilters,
  defaultFilterValues,
  extractScriptFilters,
  humanizeFrappeError,
  normalizeFilterMeta,
  normalizeQueryReportColumns,
  normalizeQueryReportPayload,
  normalizeQueryReportRows,
  scrubFieldname,
  stripHtml,
} from './query-report';

describe(normalizeQueryReportColumns, () => {
  it('normalizes v15 dict columns (probed ToDo report shape)', () => {
    const columns = normalizeQueryReportColumns([
      { fieldtype: 'Link', options: 'ToDo', width: '90', label: 'ID', fieldname: 'id' },
      { fieldtype: '', width: '60', label: 'Priority', fieldname: 'priority' },
      { fieldtype: 'Date', label: 'Date', fieldname: 'date' },
      {
        fieldtype: 'Data',
        width: '120',
        label: 'Assigned To/Owner',
        fieldname: 'assigned_to/owner',
      },
    ]);
    expect(columns).toStrictEqual([
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
      { fieldname: 'id', label: 'ID', fieldtype: 'Link', options: 'ToDo', width: 90, precision: undefined },
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
      { fieldname: 'priority', label: 'Priority', fieldtype: '', options: undefined, width: 60, precision: undefined },
      {
        fieldname: 'date',
        label: 'Date',
        fieldtype: 'Date',
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        options: undefined,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        width: undefined,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        precision: undefined,
      },
      {
        fieldname: 'assigned_to/owner',
        label: 'Assigned To/Owner',
        fieldtype: 'Data',
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        options: undefined,
        width: 120,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        precision: undefined,
      },
    ]);
  });

  it('normalizes old-style SQL alias strings', () => {
    const columns = normalizeQueryReportColumns(['ID:Link/ToDo:120', 'Status::100', 'Modified On:Date:110']);
    expect(columns).toStrictEqual([
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
      { fieldname: 'id', label: 'ID', fieldtype: 'Link', options: 'ToDo', width: 120, precision: undefined },
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
      { fieldname: 'status', label: 'Status', fieldtype: '', options: undefined, width: 100, precision: undefined },
      {
        fieldname: 'modified_on',
        label: 'Modified On',
        fieldtype: 'Date',
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        options: undefined,
        width: 110,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        precision: undefined,
      },
    ]);
  });

  it('dedupes colliding fieldnames and skips junk entries', () => {
    const columns = normalizeQueryReportColumns(['Total::80', 'Total::80', null, 42]);
    expect(columns.map((column) => column.fieldname)).toStrictEqual(['total', 'total_1']);
  });
});

describe(normalizeQueryReportRows, () => {
  const columns = normalizeQueryReportColumns(['ID:Link/ToDo:120', 'Status::100']);

  it('passes dict rows through (probed v15 shape)', () => {
    const rows = normalizeQueryReportRows([{ id: 'TD-1', status: 'Open' }], columns);
    expect(rows).toStrictEqual([{ id: 'TD-1', status: 'Open' }]);
  });

  it('zips positional array rows onto column fieldnames', () => {
    const rows = normalizeQueryReportRows([['TD-1', 'Open']], columns);
    expect(rows).toStrictEqual([{ id: 'TD-1', status: 'Open' }]);
  });

  it('drops scalar/null separator entries', () => {
    expect(normalizeQueryReportRows([null, 'sep', 3, ['TD-1', 'Open']], columns)).toHaveLength(1);
  });
});

describe(scrubFieldname, () => {
  // python: cstr(txt).replace(" ", "_").replace("-", "_").lower(). The probed
  // to-do report above sends fieldname "assigned_to/owner" for the label
  // "Assigned To/Owner", which is the same function at work server-side.
  it('is frappe.scrub, character for character', () => {
    expect(scrubFieldname('Modified On')).toBe('modified_on');
    expect(scrubFieldname('Assigned To/Owner')).toBe('assigned_to/owner');
    expect(scrubFieldname('Multi-Word Label')).toBe('multi_word_label');
    expect(scrubFieldname('Size (MB)')).toBe('size_(mb)');
    expect(scrubFieldname('  Total (USD) ')).toBe('__total_(usd)_');
  });

  it('keys a label-only column the way the server keys its rows', () => {
    const [column] = normalizeQueryReportColumns([{ label: 'Assigned To/Owner' }]);
    expect(column.fieldname).toBe('assigned_to/owner');
    expect(normalizeQueryReportRows([{ 'assigned_to/owner': 'jane@example.com' }], [column])).toStrictEqual([
      { 'assigned_to/owner': 'jane@example.com' },
    ]);
  });
});

describe(normalizeQueryReportPayload, () => {
  it('normalizes a run and flags the server total row', () => {
    const payload = normalizeQueryReportPayload({
      columns: ['Amount:Currency:120', { label: 'Rate', fieldname: 'rate', precision: '3' }],
      result: [{ amount: 5, rate: 0.125 }, [10]],
      message: ['Part one.', 'Part two.'],
      add_total_row: 1,
    });
    expect(payload.columns.map((column) => [column.fieldname, column.width])).toStrictEqual([
      ['amount', 120],
      ['rate', undefined],
    ]);
    expect(payload.columns[1].precision).toBe(3);
    expect(payload.rows).toStrictEqual([
      { amount: 5, rate: 0.125 },
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
      { amount: 10, rate: undefined },
    ]);
    expect(payload.message).toBe('Part one. Part two.');
    expect(payload.addTotalRow).toBe(true);
  });

  it('leaves the total row off when the server skips it', () => {
    expect(normalizeQueryReportPayload({ add_total_row: 1, skip_total_row: 1 }).addTotalRow).toBe(false);
  });
});

describe(compactFilterValues, () => {
  it('drops empty values and keeps falsy ones that mean something', () => {
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an undefined value is the case under test
    expect(compactFilterValues({ a: '', b: null, c: undefined, d: 0, e: false, f: 'x' })).toStrictEqual({
      d: 0,
      e: false,
      f: 'x',
    });
    expect(compactFilterValues()).toStrictEqual({});
  });
});

describe(humanizeFrappeError, () => {
  it("reads the server's sentence and keeps the status and exc_type", () => {
    const failure = Object.assign(new Error('request failed'), {
      status: 403,
      data: {
        exc_type: 'PermissionError',
        _server_messages: JSON.stringify([JSON.stringify({ message: 'Not permitted' })]),
      },
    });
    const humanized = humanizeFrappeError(failure) as Error & {
      status?: number;
      exc_type?: string;
    };
    expect(humanized.message).toBe('Not permitted');
    expect(humanized.status).toBe(403);
    expect(humanized.exc_type).toBe('PermissionError');
  });

  it('keeps a <details> summary and its body on separate lines (MPO-473)', () => {
    const failure = Object.assign(new Error('request failed'), {
      status: 403,
      data: {
        exc_type: 'PermissionError',
        _server_messages: JSON.stringify([
          JSON.stringify({
            message:
              '<details><summary>You are not permitted to access this resource. Login to access</summary>Function <strong>frappe.desk.query_report.run</strong> is not whitelisted.</details>',
          }),
        ]),
      },
    });
    expect(humanizeFrappeError(failure).message).toBe(
      'You are not permitted to access this resource. Login to access\nFunction frappe.desk.query_report.run is not whitelisted.',
    );
  });
});

describe(stripHtml, () => {
  it('flattens desk anchor markup (probed ToDo reference cell)', () => {
    expect(stripHtml('<a href="/app/Form/ToDo/oftgr5usq3">ToDo: oftgr5usq3</a>')).toBe('ToDo: oftgr5usq3');
  });

  it('decodes basic entities and leaves plain text alone', () => {
    expect(stripHtml('A &amp; B')).toBe('A & B');
    expect(stripHtml('plain')).toBe('plain');
  });
});

describe(normalizeFilterMeta, () => {
  it('normalizes Report Filter doc rows (mandatory flag, wildcard, defaults)', () => {
    expect(
      normalizeFilterMeta([
        {
          fieldname: 'status',
          label: 'Status',
          fieldtype: 'Select',
          options: 'Open\nClosed',
          mandatory: 1,
          wildcard_filter: 0,
          default: 'Open',
        },
        { label: 'Search Term', fieldtype: 'Data', wildcard_filter: '1' },
        null,
        'junk',
      ]),
    ).toStrictEqual([
      {
        fieldname: 'status',
        label: 'Status',
        fieldtype: 'Select',
        options: 'Open\nClosed',
        default: 'Open',
        mandatory: 1,
        wildcard_filter: 0,
        hidden: 0,
        read_only: 0,
      },
      {
        fieldname: 'search_term',
        label: 'Search Term',
        fieldtype: 'Data',
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        options: undefined,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        default: undefined,
        mandatory: 0,
        wildcard_filter: 1,
        hidden: 0,
        read_only: 0,
      },
    ]);
  });

  it('accepts script vocabulary: required, boolean/number defaults, options arrays', () => {
    const [filter] = normalizeFilterMeta([
      {
        fieldname: 'show_permissions',
        fieldtype: 'Check',
        required: 1,
        default: true,
        options: ['', 'Open', 'Closed'],
      },
    ]);
    expect(filter).toMatchObject({
      fieldname: 'show_permissions',
      mandatory: 1,
      default: 1,
      options: '\nOpen\nClosed',
    });
  });

  it('honors read_only / readOnly so locked filters stay visible but inert', () => {
    const [locked] = normalizeFilterMeta([
      { fieldname: 'company', fieldtype: 'Link', options: 'Company', read_only: 1 },
    ]);
    const [alsoLocked] = normalizeFilterMeta([
      { fieldname: 'company', fieldtype: 'Link', options: 'Company', readOnly: true },
    ]);
    expect(locked).toMatchObject({ read_only: 1 });
    expect(alsoLocked).toMatchObject({ read_only: 1 });
  });
});

describe(extractScriptFilters, () => {
  it('extracts the declarative subset (probed Permitted Documents For User script)', () => {
    // Verbatim get_script payload from the bench probe (2026-08-13) —
    // includes a get_query function that must be skipped, not parsed.
    const script = `// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.query_reports["Permitted Documents For User"] = {
\tfilters: [
\t\t{
\t\t\tfieldname: "user",
\t\t\tlabel: __("User"),
\t\t\tfieldtype: "Link",
\t\t\toptions: "User",
\t\t\trequired: 1,
\t\t},
\t\t{
\t\t\tfieldname: "doctype",
\t\t\tlabel: __("DocType"),
\t\t\tfieldtype: "Link",
\t\t\toptions: "DocType",
\t\t\trequired: 1,
\t\t\tget_query: function () {
\t\t\t\treturn {
\t\t\t\t\tquery: "frappe.core.report.permitted_documents_for_user.permitted_documents_for_user.query_doctypes",
\t\t\t\t\tfilters: {
\t\t\t\t\t\tuser: frappe.query_report.get_filter_value("user"),
\t\t\t\t\t},
\t\t\t\t};
\t\t\t},
\t\t},
\t\t{
\t\t\tfieldname: "show_permissions",
\t\t\tlabel: __("Show Permissions"),
\t\t\tfieldtype: "Check",
\t\t},
\t],
};

//# sourceURL=permitted_documents_for_user.js`;
    const extraction = extractScriptFilters(script);
    expect(extraction.declared).toBe(true);
    expect(extraction.declaredCount).toBe(3);
    expect(extraction.filters).toStrictEqual([
      {
        fieldname: 'user',
        label: 'User',
        fieldtype: 'Link',
        options: 'User',
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        default: undefined,
        mandatory: 1,
        wildcard_filter: 0,
        hidden: 0,
        read_only: 0,
      },
      {
        fieldname: 'doctype',
        label: 'DocType',
        fieldtype: 'Link',
        options: 'DocType',
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        default: undefined,
        mandatory: 1,
        wildcard_filter: 0,
        hidden: 0,
        read_only: 0,
      },
      {
        fieldname: 'show_permissions',
        label: 'Show Permissions',
        fieldtype: 'Check',
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        options: undefined,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the kept undefined key
        default: undefined,
        mandatory: 0,
        wildcard_filter: 0,
        hidden: 0,
        read_only: 0,
      },
    ]);
  });

  it('treats an empty declared array as declared with no filters (probed ToDo script)', () => {
    const extraction = extractScriptFilters('frappe.query_reports["ToDo"] = {\n\tfilters: [],\n};\n');
    expect(extraction).toStrictEqual({ declared: true, declaredCount: 0, filters: [] });
  });

  it('reports no declaration for scripts without a filters key (and for no script)', () => {
    expect(extractScriptFilters('frappe.query_reports["X"] = {};').declared).toBe(false);
    expect(extractScriptFilters().declared).toBe(false);
  });

  it('counts non-declarative and desk-only entries as gaps', () => {
    const script = `frappe.query_reports["X"] = {
      filters: [
        { fieldname: "user", fieldtype: "Link", options: "User" },
        { fieldname: dynamic_name, fieldtype: "Data" },
        { fieldname: "companies", label: __("Companies"), fieldtype: "MultiSelectList",
          get_data: function (txt) { return frappe.db.get_link_options("Company", txt); } },
      ],
    };`;
    const extraction = extractScriptFilters(script);
    expect(extraction.declaredCount).toBe(3);
    expect(extraction.filters.map((filter) => filter.fieldname)).toStrictEqual(['user']);
  });

  it('skips dynamic defaults but keeps scalar ones (numbers, quoted strings, arrays)', () => {
    const script = `frappe.query_reports["X"] = {
      filters: [
        { fieldname: "from_date", fieldtype: "Date", default: frappe.datetime.get_today() },
        { fieldname: "status", fieldtype: "Select", options: ["", "Open", "Closed"], default: "Open" },
        { fieldname: "limit", fieldtype: "Int", default: 20 },
        // trailing comment inside the array
        { fieldname: "hidden_flag", fieldtype: "Check", default: 1, hidden: 1 },
      ],
    };`;
    const extraction = extractScriptFilters(script);
    expect(extraction.declaredCount).toBe(4);
    expect(extraction.filters).toHaveLength(4);
    const [fromDate, status, limit, hiddenFlag] = extraction.filters;
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- pins the dynamic default as dropped (undefined)
    expect(fromDate).toMatchObject({ fieldname: 'from_date', default: undefined });
    expect(status).toMatchObject({ options: '\nOpen\nClosed', default: 'Open' });
    expect(limit).toMatchObject({ default: 20 });
    expect(hiddenFlag).toMatchObject({ hidden: 1, default: 1 });
  });

  it('handles strings containing commas, braces, and escapes', () => {
    const script = `frappe.query_reports["X"] = {
      filters: [
        { fieldname: "note", fieldtype: "Data", label: __("A, {B} \\"quoted\\"") },
      ],
    };`;
    const [filter] = extractScriptFilters(script).filters;
    expect(filter.label).toBe('A, {B} "quoted"');
  });

  it('drops Select/Link entries without options (unrenderable)', () => {
    const script = `frappe.query_reports["X"] = {
      filters: [{ fieldname: "pick", fieldtype: "Select" }],
    };`;
    const extraction = extractScriptFilters(script);
    expect(extraction.declaredCount).toBe(1);
    expect(extraction.filters).toHaveLength(0);
  });
});

describe(defaultFilterValues, () => {
  it('collects seedable defaults and skips empty ones', () => {
    expect(
      defaultFilterValues([
        { fieldname: 'status', default: 'Open' },
        { fieldname: 'limit', default: 0 },
        { fieldname: 'user', default: '' },
        { fieldname: 'doctype' },
      ]),
    ).toStrictEqual({ status: 'Open', limit: 0 });
  });
});

describe(compactQueryReportFilters, () => {
  it('drops empty values and keeps hidden defaults so a visible clear-all is honest', () => {
    const meta = normalizeFilterMeta([
      { fieldname: 'status', fieldtype: 'Select', options: 'Open\nClosed' },
      { fieldname: 'owner', fieldtype: 'Data' },
      { fieldname: 'hidden_flag', fieldtype: 'Check', hidden: 1, default: 1 },
    ]);
    expect(
      compactQueryReportFilters(meta, {
        status: 'Open',
        owner: '',
        hidden_flag: 1,
      }),
    ).toStrictEqual({ status: 'Open', hidden_flag: 1 });
  });
});

describe(buildRunFilters, () => {
  const meta = normalizeFilterMeta([
    { fieldname: 'search', fieldtype: 'Data', wildcard_filter: 1 },
    { fieldname: 'limit', fieldtype: 'Int' },
    { fieldname: 'show_permissions', fieldtype: 'Check' },
  ]);

  it('omits empty and falsy values (desk get_filter_values parity)', () => {
    expect(
      buildRunFilters(meta, {
        search: '',
        limit: 0,
        show_permissions: false,
        user: null,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an undefined value is the case under test
        doctype: undefined,
      }),
    ).toStrictEqual({});
  });

  it('wraps wildcard filters and coerces numeric fieldtypes', () => {
    expect(buildRunFilters(meta, { search: 'todo', limit: '25', show_permissions: true })).toStrictEqual({
      search: '%todo%',
      limit: 25,
      show_permissions: 1,
    });
  });

  it('respects user-typed wildcards and passes unknown fieldnames through', () => {
    expect(buildRunFilters(meta, { search: 'to%do', extra: 'kept' })).toStrictEqual({
      search: 'to%do',
      extra: 'kept',
    });
  });
});
