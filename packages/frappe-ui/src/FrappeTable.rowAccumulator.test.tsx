/**
 * A running balance on a FrappeTable (MPO-250).
 *
 * The gap this closes: `FrappeTableProps` omits `data`, so before the row
 * accumulator existed there was NO prop that reached the rows. A consumer who
 * wanted a folded column on a Frappe doctype had to fetch the doctype again
 * itself and hand the folded rows to a bare DataTable — a second read path, a
 * second error path, and no saved filters or refresh channel.
 *
 * What this locks: `rowAccumulator` passes through FrappeTable to the table,
 * folds the rows FrappeTable already fetched, and the figures continue onto
 * page two.
 *
 * Fixture-hermetic: postings ride InMemoryFixtureProvider.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import type { DataTableColumn, RowAccumulator } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

interface Posting {
  name: string;
  doctype: string;
  date: string;
  payee: string;
  amount: number;
  /** Derived by the accumulator — declared on the doc type so a column can
   *  name it in accessorKey. */
  running?: number;
}

const postings: Posting[] = Array.from({ length: 8 }, (_, i) => ({
  name: `POST-${String(i + 1).padStart(2, '0')}`,
  doctype: 'Posting',
  date: `2026-02-${String(i + 1).padStart(2, '0')}`,
  payee: `Payee ${i + 1}`,
  amount: 10,
}));

const runningBalance: RowAccumulator<Partial<Posting>, number> = {
  initial: 0,
  reduce: (carried, row) => carried + (row.amount ?? 0),
  derive: (carried) => ({ running: carried }),
  order: (a, b) => String(a.date).localeCompare(String(b.date)),
};

const columns: DataTableColumn<Partial<Posting>>[] = [
  { id: 'name', accessorKey: 'name', header: 'ID' },
  { id: 'amount', accessorKey: 'amount', header: 'Amount' },
  {
    id: 'running',
    accessorKey: 'running',
    header: 'Balance',
    sortable: false,
    // Marked so an assertion can tell a balance of 10 from an amount of 10.
    cell: ({ row }) => `bal ${row.original.running}`,
  },
];

const filterFields = [{ id: 'payee', label: 'Payee', type: 'text' as const }];

describe('FrappeTable rowAccumulator', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('folds the rows FrappeTable fetched, and page two continues', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <FrappeProvider
        baseURL="https://frappetable-fold.spec.test"
        fixtures={new InMemoryFixtureProvider({ Posting: postings })}>
        <FrappeTable<Posting>
          doctype="Posting"
          columns={columns}
          fields={['name', 'date', 'payee', 'amount']}
          filterableFields={filterFields}
          rowAccumulator={runningBalance}
          layout="table"
          initialState={{ pagination: { pageIndex: 0, pageSize: 4 } }}
        />
      </FrappeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('POST-01')).toBeTruthy();
    });
    expect(screen.getByText('bal 10')).toBeTruthy();
    expect(screen.getByText('bal 40')).toBeTruthy();
    expect(screen.queryByText('bal 50')).toBeNull();

    await user.click(screen.getByLabelText('Go to next page'));
    await waitFor(() => {
      expect(screen.getByText('POST-05')).toBeTruthy();
    });
    expect(screen.getByText('bal 50'), 'page two continues the fold').toBeTruthy();
    expect(screen.getByText('bal 80')).toBeTruthy();
    expect(screen.queryByText('bal 10'), "page one's opening balance is gone").toBeNull();
  });
});
