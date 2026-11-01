import { getDefaultColumnAlign } from '@repo/table';
// FrappeReportView contract: `frappe.desk.query_report.run` payloads render
// through the house DataTable. These specs cover the pure payload
// normalization (dict/string columns, dict/array rows incl. the server's
// array-shaped total row), the fieldtype → DataTableColumn mapping
// (DG-TBL-01 align-by-type on the typed meta channel), row activation via
// DataTable's first-class `onRowPress`/`rowLabel` (the replacement contract
// for the deleted per-cell pressable layer: one pressable row unit, one
// roving tab stop per LC-49, Enter AND Space per LC-50, honest row names
// per DG-A11Y-06), the filter → refetch flow (debounced runs,
// controlled/uncontrolled values, defaults seeding, refresh), and the honest
// empty / error states.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  compactFilterValues,
  FrappeReportView,
  normalizeReportColumn,
  normalizeReportPayload,
  normalizeReportRows,
  reportColumnToDataTableColumn,
  reportFieldtypeToTableField,
  reportRowLabel,
  scrubFieldname,
} from './FrappeReportView';
import type {
  FrappeReportColumn,
  FrappeReportFixture,
  FrappeReportRunResponse,
  FrappeReportViewProps,
} from './FrappeReportView';

type ReportLoader = Exclude<FrappeReportFixture, FrappeReportRunResponse>;
type FiltersChange = NonNullable<FrappeReportViewProps['onFiltersChange']>;

// ---------------------------------------------------------------------------
// Payload normalization
// ---------------------------------------------------------------------------

const columns: FrappeReportColumn[] = [
  { label: 'Table', fieldname: 'table', fieldtype: 'Data', width: 200 },
  { label: 'Size (MB)', fieldname: 'size', fieldtype: 'Float' },
];

// ---------------------------------------------------------------------------
// Column mapping (fieldtype → field / align / format)
// ---------------------------------------------------------------------------

const alignOf = (fieldtype: string) => {
  const { field, fieldProps } = reportFieldtypeToTableField({
    label: 'X',
    fieldname: 'x',
    fieldtype,
  });
  return getDefaultColumnAlign({ field, fieldProps });
};

const alignFor = (fieldtype: string) =>
  reportColumnToDataTableColumn({ label: 'X', fieldname: 'x', fieldtype }).meta?.align;

// ---------------------------------------------------------------------------
// Component states + filter → refetch flow (fixture-backed)
// ---------------------------------------------------------------------------

const storageReport: FrappeReportRunResponse = {
  columns: [
    { label: 'Table', fieldname: 'table', fieldtype: 'Data', width: 200 },
    { label: 'Size (MB)', fieldname: 'size', fieldtype: 'Float' },
  ],
  result: [
    { table: 'tabDocField', size: 3.09 },
    { table: 'tabError Log', size: 0.89 },
  ],
};

// ---------------------------------------------------------------------------
// Row activation — DataTable onRowPress (the replacement contract for the
// deleted per-cell pressable layer)
// ---------------------------------------------------------------------------

const pressableReport: FrappeReportRunResponse = {
  columns: [
    { label: 'Name', fieldname: 'name', fieldtype: 'Link', options: 'ToDo', width: 140 },
    { label: 'Table', fieldname: 'table', fieldtype: 'Data', width: 200 },
    { label: 'Size (MB)', fieldname: 'size', fieldtype: 'Float' },
  ],
  result: [
    { name: 'ROW-0001', table: 'tabDocField', size: 3.09 },
    { name: 'ROW-0002', table: 'tabError Log', size: 0.89 },
    { name: 'ROW-0003', table: 'tabSeries', size: 0.02 },
  ],
};

const pressRows = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('[data-row-press="true"]'),
];

const renderPressableReport = (extraProps: Partial<FrappeReportViewProps> = {}) => {
  const onRowPress = vi.fn<NonNullable<FrappeReportViewProps['onRowPress']>>();
  const result = renderWithProviders(
    <FrappeReportView
      reportName="Pressable Report"
      fixture={pressableReport}
      onRowPress={onRowPress}
      tableProps={{ layout: 'table', enablePagination: false }}
      {...extraProps}
    />,
  );
  return { ...result, onRowPress };
};

describe('FrappeReportView module', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  afterEach(cleanup);

  describe(scrubFieldname, () => {
    it('mirrors frappe.scrub (lowercase, spaces/dashes to underscores)', () => {
      expect(scrubFieldname('Size (MB)')).toBe('size_(mb)');
      expect(scrubFieldname('Modified On')).toBe('modified_on');
      expect(scrubFieldname('Multi-Word Label')).toBe('multi_word_label');
    });
  });

  // normalizeReportColumn is the query-report model's column normalizer under
  // FrappeReportView's old name (MPO-15, GL-28): widths come back as numbers
  // and an untyped column carries fieldtype "", the shape both report views read.
  describe(normalizeReportColumn, () => {
    it('parses legacy string columns (Label:Fieldtype/Options:Width)', () => {
      // oxlint-disable-next-line vitest/prefer-strict-equal -- the normalizer emits unset optional keys as undefined; the contract is the defined fields
      expect(normalizeReportColumn('Name:Link/ToDo:120')).toEqual({
        label: 'Name',
        fieldname: 'name',
        fieldtype: 'Link',
        options: 'ToDo',
        width: 120,
      });
    });

    it('parses string columns with an empty fieldtype segment', () => {
      // oxlint-disable-next-line vitest/prefer-strict-equal -- the normalizer emits unset optional keys as undefined; the contract is the defined fields
      expect(normalizeReportColumn('Status::100')).toEqual({
        label: 'Status',
        fieldname: 'status',
        fieldtype: '',
        width: 100,
      });
    });

    it('parses bare label strings', () => {
      // oxlint-disable-next-line vitest/prefer-strict-equal -- the normalizer emits unset optional keys as undefined; the contract is the defined fields
      expect(normalizeReportColumn('Total Amount')).toEqual({
        label: 'Total Amount',
        fieldname: 'total_amount',
        fieldtype: '',
      });
    });

    it('fills missing fieldname on dict columns from the label', () => {
      // oxlint-disable-next-line vitest/prefer-strict-equal -- the normalizer emits unset optional keys as undefined; the contract is the defined fields
      expect(normalizeReportColumn({ label: 'Data Size' })).toEqual({
        label: 'Data Size',
        fieldname: 'data_size',
        fieldtype: '',
      });
    });

    it('keeps complete dict columns untouched', () => {
      const col = { label: 'Size (MB)', fieldname: 'size', fieldtype: 'Float', width: 100 };
      // oxlint-disable-next-line vitest/prefer-strict-equal -- the normalizer emits unset optional keys as undefined; the contract is the defined fields
      expect(normalizeReportColumn(col)).toEqual(col);
    });
  });

  describe(normalizeReportRows, () => {
    it('passes dict rows through and re-keys array rows by column order', () => {
      const rows = normalizeReportRows(columns, [{ table: 'tabDocField', size: 3.09 }, ['Total', 3.09]]);
      expect(rows).toStrictEqual([
        { table: 'tabDocField', size: 3.09 },
        { table: 'Total', size: 3.09 },
      ]);
    });

    it('returns an empty list for missing results', () => {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; a missing result is the case under test
      expect(normalizeReportRows(columns, undefined)).toStrictEqual([]);
      expect(normalizeReportRows(columns, [])).toStrictEqual([]);
    });
  });

  describe(normalizeReportPayload, () => {
    it('normalizes columns, rows, and the total-row flag', () => {
      const payload = normalizeReportPayload({
        columns: [columns[0], 'Size (MB):Float'],
        result: [{ table: 'tabDocField', 'size_(mb)': 3.09 }, ['Total', 3.09]],
        add_total_row: true,
      });
      expect(payload.columns.map((c) => c.fieldname)).toStrictEqual(['table', 'size_(mb)']);
      expect(payload.rows[1]).toStrictEqual({ table: 'Total', 'size_(mb)': 3.09 });
      expect(payload.addTotalRow).toBe(true);
    });

    it('suppresses the total-row flag when skip_total_row is set', () => {
      const payload = normalizeReportPayload({
        columns,
        result: [],
        add_total_row: 1,
        skip_total_row: 1,
      });
      expect(payload.addTotalRow).toBe(false);
    });

    it('joins list messages into one user-facing string', () => {
      expect(normalizeReportPayload({ message: ['Part one.', 'Part two.'] }).message).toBe('Part one. Part two.');
      expect(normalizeReportPayload({ message: null }).message).toBeUndefined();
    });
  });

  describe(compactFilterValues, () => {
    it('drops empty values but keeps falsy data (0 / false)', () => {
      expect(
        compactFilterValues({
          status: 'Open',
          user: '',
          doctype: null,
          // oxlint-disable-next-line sonarjs/no-undefined-assignment -- undefined is one of the empty values under test
          limit: undefined,
          show: 0,
          flag: false,
        }),
      ).toStrictEqual({ status: 'Open', show: 0, flag: false });
    });

    it('returns an empty object for undefined input', () => {
      expect(compactFilterValues()).toStrictEqual({});
    });
  });

  describe('reportFieldtypeToTableField (DG-TBL-01 align-by-type)', () => {
    it('maps numeric fieldtypes to right-aligned numeric cells', () => {
      for (const fieldtype of ['Int', 'Float', 'Currency', 'Percent']) {
        expect(reportFieldtypeToTableField({ label: 'X', fieldname: 'x', fieldtype }).field).toBe('stepper');
        expect(alignOf(fieldtype)).toBe('right');
      }
      expect(alignOf('Duration')).toBe('right');
    });

    it('maps Check to a centered boolean cell', () => {
      expect(reportFieldtypeToTableField({ label: 'X', fieldname: 'x', fieldtype: 'Check' })).toStrictEqual({
        field: 'checkbox',
      });
      expect(alignOf('Check')).toBe('center');
    });

    it('keeps text-like fieldtypes left-aligned', () => {
      for (const fieldtype of ['Data', 'Link', 'Dynamic Link', 'HTML', 'Text']) {
        expect(reportFieldtypeToTableField({ label: 'X', fieldname: 'x', fieldtype }).field).toBe('input');
        expect(alignOf(fieldtype)).toBe('left');
      }
    });

    it('maps date/time fieldtypes to their picker display variants', () => {
      expect(reportFieldtypeToTableField({ label: 'X', fieldname: 'x', fieldtype: 'Date' }).field).toBe('datepicker');
      expect(reportFieldtypeToTableField({ label: 'X', fieldname: 'x', fieldtype: 'Datetime' }).field).toBe(
        'datetimepicker',
      );
      expect(reportFieldtypeToTableField({ label: 'X', fieldname: 'x', fieldtype: 'Time' }).field).toBe('timepicker');
    });

    it('respects column precision on Float columns', () => {
      expect(
        reportFieldtypeToTableField({ label: 'X', fieldname: 'x', fieldtype: 'Float', precision: 4 }).fieldProps,
      ).toStrictEqual({ precision: 4 });
    });

    it("parses Select options and drops the blank 'all' entry", () => {
      const { field, fieldProps } = reportFieldtypeToTableField({
        label: 'X',
        fieldname: 'x',
        fieldtype: 'Select',
        options: '\nOpen\nClosed',
      });
      expect(field).toBe('select');
      expect(fieldProps).toStrictEqual({
        options: [
          { label: 'Open', value: 'Open' },
          { label: 'Closed', value: 'Closed' },
        ],
      });
    });
  });

  describe(reportColumnToDataTableColumn, () => {
    it('maps fieldname/label/width to the DataTable column shape', () => {
      const col = reportColumnToDataTableColumn({
        label: 'Size (MB)',
        fieldname: 'size',
        fieldtype: 'Float',
        width: '200',
      });
      expect(col).toMatchObject({
        id: 'size',
        accessorKey: 'size',
        header: 'Size (MB)',
        width: 200,
        field: 'stepper',
        fieldProps: { precision: 2 },
      });
    });

    it('drops non-numeric widths', () => {
      const col = reportColumnToDataTableColumn({
        label: 'Table',
        fieldname: 'table',
        width: 'wide',
      });
      expect(col.width).toBeUndefined();
    });

    it('pins DG-TBL-01 alignment on the typed meta channel (numerics right)', () => {
      expect(alignFor('Int')).toBe('right');
      expect(alignFor('Float')).toBe('right');
      expect(alignFor('Currency')).toBe('right');
      expect(alignFor('Check')).toBe('center');
      expect(alignFor('Data')).toBe('left');
    });
  });

  describe(reportRowLabel, () => {
    it('names rows by name, then title, and stays empty otherwise', () => {
      expect(reportRowLabel({ name: 'SINV-0001', title: 'Acme' })).toBe('SINV-0001');
      expect(reportRowLabel({ title: 'Acme Corp' })).toBe('Acme Corp');
      expect(reportRowLabel({ name: 42 })).toBe('42');
      // Empty defers to DataTable's fallbacks (first cell → "Row N").
      expect(reportRowLabel({ table: 'tabDocField' })).toBe('');
      expect(reportRowLabel({ name: '' })).toBe('');
    });
  });

  describe(FrappeReportView, () => {
    it('renders report columns and rows from a fixture payload', async () => {
      renderWithProviders(
        <FrappeReportView
          reportName="Database Storage Usage By Tables"
          fixture={storageReport}
        />,
      );
      await expect(screen.findByText('tabDocField')).resolves.toBeTruthy();
      expect(screen.getByText('tabError Log')).toBeTruthy();
      expect(screen.getAllByText('Size (MB)').length).toBeGreaterThan(0);
    });

    it('shows the honest empty state when the report has no rows', async () => {
      renderWithProviders(
        <FrappeReportView
          reportName="Empty Report"
          fixture={{ columns: storageReport.columns, result: [] }}
        />,
      );
      await expect(screen.findByText('No results for Empty Report')).resolves.toBeTruthy();
    });

    it('shows the honest error state when the run fails', async () => {
      renderWithProviders(
        <FrappeReportView
          reportName="Broken Report"
          fixture={() => {
            throw new Error("You don't have access to Report: Broken Report");
          }}
        />,
      );
      await expect(screen.findByText('Error running Broken Report')).resolves.toBeTruthy();
    });

    it('permission chrome does not render a python traceback', async () => {
      const err = Object.assign(
        new Error(
          '["Traceback (most recent call last):\\n  File "apps/frappe/frappe/app.py", line 120, in application',
        ),
        { status: 403 },
      );
      renderWithProviders(
        <FrappeReportView
          reportName="Database Storage Usage By Tables"
          fixture={() => {
            throw err;
          }}
        />,
      );
      await expect(screen.findByText("You can't run Database Storage Usage By Tables")).resolves.toBeTruthy();
      expect(screen.queryByText(/Traceback/u)).toBeNull();
    });

    it('re-runs the report when a filter value changes (filter → refetch)', async () => {
      const loader = vi.fn<ReportLoader>(async ({ filters }) => ({
        columns: storageReport.columns,
        result:
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- report filter values are untyped; the spec only feeds the table filter a string
          typeof filters.table === 'string' && filters.table !== ''
            ? [{ table: filters.table, size: 1 }]
            : storageReport.result,
      }));
      const onFiltersChange = vi.fn<FiltersChange>();
      renderWithProviders(
        <FrappeReportView
          reportName="Filtered Report"
          fixture={loader}
          debounceMs={0}
          filterFields={[{ fieldname: 'table', label: 'Table', fieldtype: 'Data' }]}
          onFiltersChange={onFiltersChange}
        />,
      );
      await expect(screen.findByText('tabDocField')).resolves.toBeTruthy();
      expect(loader).toHaveBeenCalledOnce();
      expect(loader.mock.calls[0][0].filters).toStrictEqual({});

      fireEvent.change(screen.getByPlaceholderText('Table'), { target: { value: 'tabSeries' } });
      expect(onFiltersChange).toHaveBeenCalledWith({ table: 'tabSeries' });
      await waitFor(() => {
        expect(loader).toHaveBeenCalledTimes(2);
      });
      expect(loader.mock.calls[1][0].filters).toStrictEqual({ table: 'tabSeries' });
      await expect(screen.findByText('tabSeries')).resolves.toBeTruthy();
    });

    it('re-runs the report on refresh', async () => {
      const loader = vi.fn<ReportLoader>(async () => storageReport);
      renderWithProviders(
        <FrappeReportView
          reportName="Refresh Report"
          fixture={loader}
        />,
      );
      await screen.findByText('tabDocField');
      expect(loader).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByLabelText('Refresh report'));
      await waitFor(() => {
        expect(loader).toHaveBeenCalledTimes(2);
      });
    });

    it('honors controlled filters and reports edits without applying them', async () => {
      const loader = vi.fn<ReportLoader>(async () => storageReport);
      const onFiltersChange = vi.fn<FiltersChange>();
      renderWithProviders(
        <FrappeReportView
          reportName="Controlled Report"
          fixture={loader}
          debounceMs={0}
          filters={{ table: 'tabDocField' }}
          filterFields={[{ fieldname: 'table', label: 'Table', fieldtype: 'Data' }]}
          onFiltersChange={onFiltersChange}
        />,
      );
      await screen.findByText('tabDocField');
      expect(loader.mock.calls[0][0].filters).toStrictEqual({ table: 'tabDocField' });

      fireEvent.change(screen.getByPlaceholderText('Table'), { target: { value: 'tabX' } });
      expect(onFiltersChange).toHaveBeenCalledWith({ table: 'tabX' });
      // Controlled mode: the value on the wire stays owner-controlled.
      await waitFor(() => {
        expect(loader).toHaveBeenCalledOnce();
      });
    });

    it('seeds DB-defined filter defaults before the first visible run settles', async () => {
      const loader = vi.fn<ReportLoader>(async () => storageReport);
      renderWithProviders(
        <FrappeReportView
          reportName="Seeded Report"
          fixture={loader}
          debounceMs={0}
          filterFields={[{ fieldname: 'status', label: 'Status', fieldtype: 'Data', default: 'Open' }]}
        />,
      );
      await screen.findByText('tabDocField');
      await waitFor(() => {
        const lastCall = loader.mock.calls.at(-1);
        expect(lastCall?.[0].filters).toStrictEqual({ status: 'Open' });
      });
    });

    it('renders the server-side report message', async () => {
      renderWithProviders(
        <FrappeReportView
          reportName="Message Report"
          fixture={{ ...storageReport, message: 'Nothing to see here' }}
        />,
      );
      await expect(screen.findByText('Nothing to see here')).resolves.toBeTruthy();
    });
  });

  describe('FrappeReportView onRowPress → DataTable onRowPress', () => {
    it('activates on mouse click anywhere in the row and on Enter AND Space', async () => {
      const { container, onRowPress } = renderPressableReport();
      await screen.findByText('tabDocField');
      const rows = pressRows(container);
      expect(rows).toHaveLength(3);

      // Mouse: any cell in the row is the row's press target (index keeps
      // its full-row-set meaning).
      fireEvent.click(screen.getByText('tabError Log'));
      expect(onRowPress).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'ROW-0002' }), 1);

      // Keyboard: Enter AND Space activate the focused row (LC-50).
      rows[0].focus();
      fireEvent.keyDown(rows[0], { key: 'Enter' });
      expect(onRowPress).toHaveBeenCalledTimes(2);
      expect(onRowPress).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'ROW-0001' }), 0);
      fireEvent.keyDown(rows[0], { key: ' ' });
      expect(onRowPress).toHaveBeenCalledTimes(3);
    });

    it('exposes ONE roving tab stop, names rows honestly, and keeps cells pressable-free', async () => {
      const { container } = renderPressableReport();
      await screen.findByText('tabDocField');
      const rows = pressRows(container);

      // LC-49: exactly one tab stop across the row set; arrows rove it.
      expect(rows.map((row) => row.getAttribute('tabindex'))).toStrictEqual(['0', '-1', '-1']);
      rows[0].focus();
      fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(rows[1]);

      // DG-A11Y-06: rows named by report identity (the name column).
      expect(rows.map((row) => row.getAttribute('aria-label'))).toStrictEqual(['ROW-0001', 'ROW-0002', 'ROW-0003']);

      // The per-cell pressable layer is GONE: no cell-level buttons or
      // extra tab stops inside pressable rows.
      for (const row of rows) {
        expect(row.querySelectorAll('[role="button"]')).toHaveLength(0);
        expect(row.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
      }
    });

    it('falls back to the first visible cell for rows without a name/title column', async () => {
      const { container } = renderPressableReport({ fixture: storageReport });
      await screen.findByText('tabDocField');
      expect(pressRows(container).map((row) => row.getAttribute('aria-label'))).toStrictEqual([
        'tabDocField',
        'tabError Log',
      ]);
    });
  });
});
