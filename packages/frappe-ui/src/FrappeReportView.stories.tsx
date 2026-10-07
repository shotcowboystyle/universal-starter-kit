import { action } from '@repo/storybook';

import { FrappeReportView } from './FrappeReportView';
import type { FrappeReportRunResponse } from './FrappeReportView';
import { FrappeStoryProvider, frappeStoriesLive } from './frappeStoryTarget';

export default {
  title: 'FrappeUI/FrappeReportView',
  component: FrappeReportView,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Renders a named server-side report (Query Report / Script Report) via frappe.desk.query_report.run through the house DataTable. Report columns map to read-only cells with DG-TBL-01 align-by-type defaults (numerics right, Check centered); rows format through the forms FieldDisplay pipeline. A filter bar builds from the report's DB-defined filters (or the filterFields prop — required for standard reports whose filters live in client JS), values debounce into refetches, and CSV/JSON export reuses DataTableExport. Stories are fixture-first: the fixture prop takes a run-response payload or an async loader.",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Fixtures — one representative payload exercising the fieldtype mapping
// ---------------------------------------------------------------------------

const salesReport: FrappeReportRunResponse = {
  columns: [
    {
      label: 'Invoice',
      fieldname: 'invoice',
      fieldtype: 'Link',
      options: 'Sales Invoice',
      width: 140,
    },
    { label: 'Customer', fieldname: 'customer', fieldtype: 'Data', width: 180 },
    {
      label: 'Status',
      fieldname: 'status',
      fieldtype: 'Select',
      options: '\nPaid\nUnpaid\nOverdue',
    },
    { label: 'Posting Date', fieldname: 'posting_date', fieldtype: 'Date', width: 120 },
    { label: 'Qty', fieldname: 'qty', fieldtype: 'Int', width: 80 },
    { label: 'Amount', fieldname: 'amount', fieldtype: 'Currency', width: 120 },
    { label: 'Margin %', fieldname: 'margin', fieldtype: 'Percent', width: 100 },
    { label: 'Paid', fieldname: 'paid', fieldtype: 'Check', width: 70 },
  ],
  result: [
    // prettier-ignore
    { invoice: "SINV-0001", customer: "Acme Industries", status: "Paid", posting_date: "2026-07-03", qty: 12, amount: 2400.5, margin: 22.4, paid: 1 },
    // prettier-ignore
    { invoice: "SINV-0002", customer: "Globex Corporation", status: "Unpaid", posting_date: "2026-07-11", qty: 3, amount: 812, margin: 18.75, paid: 0 },
    // prettier-ignore
    { invoice: "SINV-0003", customer: "Initech LLC", status: "Overdue", posting_date: "2026-07-19", qty: 44, amount: 10_230.25, margin: 31.05, paid: 0 },
    // prettier-ignore
    { invoice: "SINV-0004", customer: "Umbrella Supplies", status: "Paid", posting_date: "2026-08-02", qty: 7, amount: 1490, margin: 12.2, paid: 1 },
    // The server appends the total row as a plain ARRAY (add_total_row) —
    // the fixture mirrors that wire shape on purpose ("Total" in the first
    // non-numeric column, empty elsewhere).
    ['Total', '', '', '', 66, 14_932.75, 21.1, null],
  ],
  add_total_row: true,
};

export const Main = () => (
  <FrappeReportView
    reportName="Quarterly Sales"
    fixture={salesReport}
    onRowPress={action('onRowPress')}
  />
);
Main.parameters = {
  docs: {
    description: {
      story:
        'A query_report.run payload rendered read-only: Link/Data/Select left, Date formatted, Int/Currency/Percent right-aligned mono numerics (DG-TBL-01), Check centered. The final array-shaped total row (server add_total_row wire shape) is re-keyed client-side and renders like any row. Rows are pressable (onRowPress).',
    },
  },
};

// ---------------------------------------------------------------------------
// Filters — loader fixture re-runs on every (debounced) filter change
// ---------------------------------------------------------------------------

const filterableLoader = async ({
  filters,
}: {
  reportName: string;
  filters: Record<string, unknown>;
}): Promise<FrappeReportRunResponse> => {
  action('run')(filters);
  const rows = (salesReport.result ?? []).filter((row): row is Record<string, unknown> => !Array.isArray(row));
  const status = filters.status ? String(filters.status) : undefined;
  const customer = filters.customer ? String(filters.customer).toLowerCase() : undefined;
  const fromDate = filters.from_date ? String(filters.from_date) : undefined;
  const paidOnly = Boolean(filters.paid_only);
  return {
    columns: salesReport.columns,
    result: rows.filter(
      (row) =>
        (!status || row.status === status) &&
        (!customer || String(row.customer).toLowerCase().includes(customer)) &&
        (!fromDate || String(row.posting_date) >= fromDate) &&
        (!paidOnly || row.paid === 1),
    ),
  };
};

export const WithFilters = () => (
  <FrappeReportView
    reportName="Quarterly Sales"
    fixture={filterableLoader}
    filterFields={[
      {
        fieldname: 'status',
        label: 'Status',
        fieldtype: 'Select',
        options: '\nPaid\nUnpaid\nOverdue',
      },
      { fieldname: 'customer', label: 'Customer', fieldtype: 'Data' },
      { fieldname: 'from_date', label: 'From Date', fieldtype: 'Date' },
      { fieldname: 'paid_only', label: 'Paid Only', fieldtype: 'Check' },
    ]}
    onFiltersChange={action('onFiltersChange')}
  />
);
WithFilters.parameters = {
  docs: {
    description: {
      story:
        'Filter bar from explicit filterFields (Select / Data / Date / Check — the same fields standard reports define in client JS). Value changes debounce into report re-runs against the loader fixture; clearing a filter drops it from the run payload. Filtering everything out lands on the honest empty state with the bar still mounted, so a bad filter can always be corrected.',
    },
  },
};

const refusedLoader = async (): Promise<FrappeReportRunResponse> => {
  throw Object.assign(new Error("You don't have access to Report: Quarterly Sales"), {
    status: 403,
    exc_type: 'PermissionError',
  });
};

export const Refused = () => (
  <FrappeReportView
    reportName="Quarterly Sales"
    fixture={refusedLoader}
  />
);
Refused.parameters = {
  docs: {
    description: {
      story:
        "The server refuses the run (403 PermissionError): a permission state that says the reader can't run the report, with the server's sentence and no retry, since a retry cannot succeed (LC-96).",
    },
  },
};

// ---------------------------------------------------------------------------
// Live bench story — a stock Script Report over the real query_report.run
// ---------------------------------------------------------------------------

/** Fixture stand-in mirroring the live report's real column contract. */
const storageReportFixture: FrappeReportRunResponse = {
  columns: [
    { label: 'Table', fieldname: 'table', fieldtype: 'Data', width: 200 },
    { label: 'Size (MB)', fieldname: 'size', fieldtype: 'Float' },
    { label: 'Data (MB)', fieldname: 'data_size', fieldtype: 'Float' },
    { label: 'Index (MB)', fieldname: 'index_size', fieldtype: 'Float' },
  ],
  result: [
    { table: 'tabDocField', size: 3.09, data_size: 2.52, index_size: 0.58 },
    { table: 'tabError Log', size: 0.89, data_size: 0.88, index_size: 0.01 },
    { table: 'tabDeleted Document', size: 0.79, data_size: 0.76, index_size: 0.03 },
    ['Total', 4.77, 4.16, 0.62],
  ],
  add_total_row: true,
};

export const Live = () =>
  frappeStoriesLive ? (
    <FrappeStoryProvider>
      <FrappeReportView
        reportName="Database Storage Usage By Tables"
        onRowPress={action('onRowPress')}
      />
    </FrappeStoryProvider>
  ) : (
    <FrappeReportView
      reportName="Database Storage Usage By Tables"
      fixture={storageReportFixture}
      onRowPress={action('onRowPress')}
    />
  );
Live.parameters = {
  docs: {
    description: {
      story:
        "Runs the stock 'Database Storage Usage By Tables' Script Report against the real bench through the Storybook proxy. A session without Report permission (a plain Desk User) sees the permission EmptyState — 'You can't run …' with the server's sentence and no retry (LC-96) — not a python traceback; same honesty as QueryReportScreen Live. System Manager / Administrator sees the table. When the bench is down the story renders a fixture payload mirroring the same column contract.",
    },
  },
};
