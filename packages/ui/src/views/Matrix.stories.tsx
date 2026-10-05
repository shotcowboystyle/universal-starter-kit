import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';

import { MatrixView, type MatrixRow } from './Matrix';
import type { MatrixCell } from './matrixMath';

const accounts: MatrixRow[] = [
  { id: 'checking', label: 'Checking' },
  { id: 'savings', label: 'Savings' },
  { id: 'credit', label: 'Credit card' },
  { id: 'brokerage', label: 'Brokerage' },
  { id: 'mortgage', label: 'Mortgage' },
  { id: 'hsa', label: 'HSA' },
];

/** A point in month `m` (0-based) of 2026. */
const inMonth = (rowId: string, m: number, value?: number): MatrixCell => ({
  rowId,
  date: new Date(2026, m, 15),
  ...(value === undefined ? null : { value }),
});

// Statement coverage by account and month. Three different absences on
// purpose: Savings has a real 0 in April (a statement with no transactions),
// Credit card has NO statement for May–June (a gap), and HSA has never
// imported at all (an empty row).
const coverage: MatrixCell[] = [
  ...[42, 38, 51, 47, 55, 49, 60, 58, 44, 52, 63, 71].map((n, m) => inMonth('checking', m, n)),
  ...[3, 2, 4, 0, 5, 2, 3, 6, 2, 4, 3, 5].map((n, m) => inMonth('savings', m, n)),
  ...[18, 22, 25, 19].map((n, m) => inMonth('credit', m, n)),
  ...[27, 31, 24, 29, 33, 30].map((n, m) => inMonth('credit', m + 6, n)),
  ...[7, 5, 9, 8, 6, 11, 10, 7, 9, 12, 8, 10].map((n, m) => inMonth('brokerage', m, n)),
  ...Array.from({ length: 12 }, (_, m) => inMonth('mortgage', m, 1)),
];

const year2026 = { start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) };

const meta: Meta = {
  title: 'Components/Matrix',
  parameters: {
    status: { type: 'beta' },
  },
};

export default meta;

export const Default = {
  name: 'Main',
  render: () => (
    <MatrixView
      rows={accounts}
      cells={coverage}
      rule="month"
      range={year2026}
      subjectLabel="Account"
      onCellPress={action('onCellPress')}
      height={440}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Statements by account and month: one row per account, one column per month generated from the rule over 2026, one cell per intersection carrying the statement count as a value and as a paint strength. A real zero (Savings, April) paints at the floor of the ramp; a month nothing landed in (Credit card, May–June; the whole HSA row) paints nothing and shows a dot, so an absence never reads as a zero. The header row and the account column stay pinned while the grid scrolls; the switcher regenerates the axis by day, week or month.',
      },
    },
  },
};

const services: MatrixRow[] = [
  { id: 'api', label: 'API' },
  { id: 'auth', label: 'Auth' },
  { id: 'search', label: 'Search' },
  { id: 'billing', label: 'Billing' },
];

const day = (offset: number) => new Date(2026, 2, 1 + offset);

const status = {
  success: { intent: 'success' as const, label: 'OK' },
  warning: { intent: 'warning' as const, label: 'Degraded' },
  error: { intent: 'error' as const, label: 'Down' },
};

// Health by service and day. Bare presence (no value) paints at full
// strength in the intent's hue, so the grid reads as a status board.
const health: MatrixCell[] = [
  ...Array.from({ length: 14 }, (_, i) => ({ rowId: 'api', date: day(i), ...status.success })),
  ...Array.from({ length: 14 }, (_, i) => ({
    rowId: 'auth',
    date: day(i),
    ...(i === 4 ? status.error : i === 5 ? status.warning : status.success),
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    rowId: 'search',
    date: day(i + 4),
    ...(i > 7 ? status.warning : status.success),
  })),
  ...Array.from({ length: 14 }, (_, i) =>
    i % 3 === 1 ? [] : [{ rowId: 'billing', date: day(i), ...status.success }],
  ).flat(),
];

export const Intents = {
  render: () => (
    <MatrixView
      rows={services}
      cells={health}
      rule="day"
      range={{ start: day(0), end: day(14) }}
      subjectLabel="Service"
      legendItems={[
        { label: 'Healthy', intent: 'success' },
        { label: 'Degraded', intent: 'warning' },
        { label: 'Down', intent: 'error' },
      ]}
      onCellPress={action('onCellPress')}
      showRuleSwitcher={false}
      height={360}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Service health by day. Cells carry an intent and a label instead of a value, rendered through the theme ramps (LC-05), and the legend names each intent the caller uses. A day with no check at all (Search before the 5th, every third day of Billing) stays a dot.',
      },
    },
  },
};

export const WeekRule = {
  name: 'Week Rule',
  render: () => (
    <MatrixView
      rows={accounts}
      cells={coverage}
      rule="week"
      range={{ start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) }}
      firstDayOfWeek={1}
      subjectLabel="Account"
      onCellPress={action('onCellPress')}
      height={440}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The same data bucketed by Monday-start weeks over the first quarter: the window snaps to week boundaries and the axis is regenerated, nothing re-declared. Points fall into whichever week holds their date.',
      },
    },
  },
};
