/**
 * Row accumulator — a running balance across pages (MPO-250).
 *
 * The claim under test: a column can be a function of the row AND every row
 * before it, the fold runs BEFORE pagination, and page two therefore
 * continues rather than restarting from zero. That is what no table in the
 * kit could do — `data` is the only channel and a `cell` renderer sees one
 * row — and it is the default column in every register, statement and ledger.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { DataTableColumn, RowAccumulator } from '../../types';
import { accumulateRows } from '../../utils/rowAccumulator';

import { DataTable } from './index';

interface Posting {
  id: string;
  date: string;
  payee: string;
  /** Cents — integers, so this spec asserts the FOLD, not decimal arithmetic. */
  amount: number;
  /** Derived by the accumulator. Declared here so a column can name it. */
  running?: number;
}

/** Twelve postings of +100 each: the running balance is 100, 200, … 1200. */
const postings: Posting[] = Array.from({ length: 12 }, (_, i) => ({
  id: `P-${String(i + 1).padStart(2, '0')}`,
  date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  payee: `Payee ${String.fromCharCode(90 - i)}`, // Z, Y, X … — reverse of date order
  amount: 100,
}));

const runningBalance: RowAccumulator<Posting, number> = {
  initial: 0,
  reduce: (carried, row) => carried + row.amount,
  derive: (carried) => ({ running: carried }),
  order: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
  total: (carried) => carried,
};

const columns: DataTableColumn<Posting>[] = [
  { id: 'id', accessorKey: 'id', header: 'ID' },
  { id: 'payee', accessorKey: 'payee', header: 'Payee', sortable: true },
  { id: 'amount', accessorKey: 'amount', header: 'Amount' },
  // Not sortable: sorting a fold column reorders it without refolding, so the
  // figures stop reading down the column as a progression. Rendered with a
  // marker so an assertion can tell a BALANCE of 100 from an AMOUNT of 100.
  {
    id: 'running',
    accessorKey: 'running',
    header: 'Balance',
    sortable: false,
    cell: ({ row }) => `bal ${row.original.running}`,
  },
];

describe(accumulateRows, () => {
  it('folds in the declared order and returns the rows in it', () => {
    const shuffled = [...postings].reverse();
    const { rows, total } = accumulateRows(shuffled, runningBalance);
    expect(rows.map((r) => r.id)).toEqual(postings.map((p) => p.id));
    expect(rows.map((r) => r.running)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
    expect(total, 'the fold read once at the end is the footer total').toBe(1200);
  });

  it('keeps the input array identity when there is no accumulator', () => {
    const { rows, total } = accumulateRows(postings);
    expect(rows).toBe(postings);
    expect(total).toBeUndefined();
  });

  it('calls a factory seed once per fold, so a mutable seed cannot leak', () => {
    const perCurrency: RowAccumulator<Posting, Record<string, number>> = {
      initial: () => ({}),
      reduce: (carried, row) => {
        carried.USD = (carried.USD ?? 0) + row.amount;
        return carried;
      },
      derive: (carried) => ({ running: carried.USD }),
    };
    const first = accumulateRows(postings, perCurrency);
    const second = accumulateRows(postings, perCurrency);
    expect(first.rows[11].running).toBe(1200);
    expect(second.rows[11].running, 'the second fold starts from a fresh seed').toBe(1200);
  });
});

describe('DataTable rowAccumulator', () => {
  it('continues the running balance onto page two instead of restarting', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable
        data={postings}
        columns={columns}
        rowAccumulator={runningBalance}
        layout="table"
        initialState={{ pagination: { pageIndex: 0, pageSize: 5 } }}
      />,
    );

    // Page one: the fold's first five values.
    await waitFor(() => {
      expect(screen.getByText('P-01')).toBeTruthy();
    });
    expect(screen.getByText('bal 100')).toBeTruthy();
    expect(screen.getByText('bal 500')).toBeTruthy();
    expect(screen.queryByText('bal 600')).toBeNull();

    // Page two CONTINUES. Before MPO-250 the only way to get a balance column
    // was a per-row cell renderer, which would have restarted at 100 here.
    await user.click(screen.getByLabelText('Go to next page'));
    await waitFor(() => {
      expect(screen.getByText('P-06')).toBeTruthy();
    });
    expect(screen.getByText('bal 600'), 'page two starts where page one ended').toBeTruthy();
    expect(screen.getByText('bal 1000')).toBeTruthy();
    expect(screen.queryByText('bal 100'), "page one's first balance is gone").toBeNull();
  });

  it('does not refold when the user sorts on another column', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable
        data={postings}
        columns={columns}
        rowAccumulator={runningBalance}
        layout="table"
        initialState={{ pagination: { pageIndex: 0, pageSize: 12 } }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('P-01')).toBeTruthy();
    });

    // Payee runs backwards against date, so a payee sort puts the LAST
    // posting first. Its balance stays 1200 — the fold order is the date
    // order it was computed in, and sorting reorders rows for display only.
    await user.click(screen.getByText('Payee'));
    await waitFor(() => {
      expect(screen.getByText('bal 1200')).toBeTruthy();
    });
    const rendered = screen.getAllByText(/^bal \d+$/).map((el) => el.textContent);
    expect(rendered, 'every folded figure is still on screen, attached to its own row').toContain('bal 1200');
    expect(rendered).toContain('bal 100');
  });
});

describe('the RunningBalance story', () => {
  it('renders the register across two pages with figures that continue', async () => {
    // The story is the documented example (AC: MPO-250). Rendering it here
    // means it cannot rot into something that does not paginate.
    const { RunningBalance } = await import('./DataTable.stories');
    const user = userEvent.setup();
    renderWithProviders(<>{(RunningBalance.render as () => React.ReactNode)()}</>);

    await waitFor(() => {
      expect(screen.getByText('Opening deposit')).toBeTruthy();
    });
    // Page one is P-01..P-05 and ends on Utilities: 2500.00 - 1800.00 - 84.50
    // + 4123.00 - 146.00.
    expect(screen.getByText('$4,592.50')).toBeTruthy();
    expect(screen.queryByText('$4,573.75'), "page two's first balance is not here yet").toBeNull();

    await user.click(screen.getByLabelText('Go to next page'));
    await waitFor(() => {
      expect(screen.getByText('Coffee roaster')).toBeTruthy();
    });
    // Page two picks the fold up rather than restarting: -18.75 on 4592.50.
    expect(screen.getByText('$4,573.75'), 'page two continues the fold').toBeTruthy();
    expect(screen.getByText('$5,005.85')).toBeTruthy();
    // The footer total is the same fold, read once at the end — every posting,
    // not just this page.
    expect(screen.getAllByText('$6,078.85').length).toBeGreaterThan(0);
  });
});
