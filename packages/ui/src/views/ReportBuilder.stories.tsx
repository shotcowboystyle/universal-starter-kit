import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';

import { ReportBuilder, type ReportColumn } from './ReportBuilder';

const columns: ReportColumn[] = [
  { fieldname: 'name', label: 'Name', fieldtype: 'Data', enabled: true },
  { fieldname: 'status', label: 'Status', fieldtype: 'Select', enabled: true },
  { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', enabled: true },
  { fieldname: 'date', label: 'Date', fieldtype: 'Date', enabled: true },
];

const data = [
  { name: 'Order 001', status: 'Completed', amount: 1200, date: '2026-01-15' },
  { name: 'Order 002', status: 'Pending', amount: 850, date: '2026-01-16' },
  { name: 'Order 003', status: 'Completed', amount: 2100, date: '2026-01-17' },
  { name: 'Order 004', status: 'Pending', amount: 430, date: '2026-01-18' },
];

const meta: Meta = {
  title: 'Components/ReportBuilder',
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

export const Default = {
  name: 'Main',
  render: () => (
    <ReportBuilder
      columns={columns}
      data={data}
      height={420}
      onExport={action('onExport')}
      onColumnsChange={action('onColumnsChange')}
      onGroupByChange={action('onGroupByChange')}
      onRowPress={action('onRowPress')}
    />
  ),
};

/**
 * Frappe Report View grouping: collapse/expand sections, aggregation, chart.
 */
export const Grouped = {
  render: () => (
    <ReportBuilder
      columns={columns}
      data={data}
      height={520}
      groupBy={{ field: 'status', aggregation: 'sum', aggregationField: 'amount' }}
      showChart
      onExport={action('onExport')}
      onColumnsChange={action('onColumnsChange')}
      onGroupByChange={action('onGroupByChange')}
      onRowPress={action('onRowPress')}
    />
  ),
};

/**
 * Zero rows — the inline "No data to display" empty state (Axiom 6: empty ≠ error).
 * The report body is a flex/scroll region, so page-flow stories give it an
 * explicit height (same pattern as the ImageGrid state stories).
 */
export const Empty = {
  render: () => <ReportBuilder columns={columns} data={[]} height={420} />,
};

/** Rows still loading — table-shaped skeleton twin inside the report card. */
export const Loading = {
  render: () => <ReportBuilder columns={columns} data={[]} height={420} isLoading />,
};

/**
 * Rows exist upstream but the active filters match nothing — "No results
 * found" renders instead of the true-empty chrome (Axiom 6:
 * empty ≠ no-results). The caller signals narrowing via `hasActiveFilters`.
 */
export const NoResults = {
  render: () => <ReportBuilder columns={columns} data={[]} height={420} hasActiveFilters />,
};

/**
 * Failed load wins over empty — error chrome with Retry replaces the report;
 * the toolbar's column count and the table hide so they can't lie.
 */
export const Error = {
  render: () => (
    <ReportBuilder
      columns={columns}
      data={[]}
      error="The report rows could not be loaded."
      onRetry={action('onRetry')}
    />
  ),
};
