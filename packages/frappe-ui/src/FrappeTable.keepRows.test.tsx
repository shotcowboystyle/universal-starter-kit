/**
 * Keep-rows-and-reconcile (the read arm of the ONE optimistic pattern):
 * changing the table's filters must NOT tear the list down and re-render
 * from empty. The current rows stay mounted, the new filter applies
 * locally to what is already on screen (optimistic narrowing), and the
 * real query reconciles when data returns — no blanking, no skeleton
 * flash, no scroll reset.
 *
 * The named reproducer was the backoffice list: every filter toggle
 * remounted FrappeTable (list keyed on a filter generation), resetting
 * `hasLoadedOnce` and flashing the AsyncBoundary skeleton for the full
 * round-trip (~1.6s of blank list against the live bench). These specs pin
 * the replacement contract at the FrappeTable layer: the `filters` prop
 * adopts in place (content-keyed), held rows render while the swapped
 * collection loads, and the loading boundary is reserved for the FIRST
 * load only.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

interface Customer {
  name: string;
  doctype: string;
  customer_name: string;
  status: string;
}

const customers: Customer[] = [
  { name: 'CUST-001', doctype: 'Customer', customer_name: 'Acme Corp', status: 'Active' },
  { name: 'CUST-002', doctype: 'Customer', customer_name: 'Globex', status: 'Active' },
  { name: 'CUST-003', doctype: 'Customer', customer_name: 'Initech', status: 'Lead' },
];

const columns: DataTableColumn<Partial<Customer>>[] = [
  { id: 'name', accessorKey: 'name', header: 'ID' },
  { id: 'customer_name', accessorKey: 'customer_name', header: 'Customer Name' },
  { id: 'status', accessorKey: 'status', header: 'Status' },
];

const filterFields = [{ id: 'status', label: 'Status', type: 'text' as const }];

/**
 * Fixture provider whose getList can be gated: while `gate` is set, list
 * fetches wait on it — models the server round-trip a filter change causes,
 * so the specs can assert what renders DURING the gap.
 */
class GatedFixtureProvider extends InMemoryFixtureProvider {
  gate: Promise<null> | null = null;

  override async getList<TDoc extends { name: string; doctype: string }>(
    ...args: Parameters<InMemoryFixtureProvider['getList']>
  ) {
    if (this.gate) {
      await this.gate;
    }
    return await (super.getList(...args) as Promise<Partial<TDoc>[]>);
  }
}

const renderTable = (fixtures: InMemoryFixtureProvider, filters: [keyof Customer, string, unknown][]) =>
  renderWithProviders(
    <FrappeProvider
      baseURL="https://frappetable-keeprows.spec.test"
      fixtures={fixtures}>
      <FrappeTable<Customer>
        doctype="Customer"
        columns={columns}
        filterableFields={filterFields}
        filters={filters}
        layout="table"
        enablePagination={false}
      />
    </FrappeProvider>,
  );

const rerenderTable = (
  rerender: (ui: React.ReactElement) => void,
  fixtures: InMemoryFixtureProvider,
  filters: [keyof Customer, string, unknown][],
) => {
  rerender(
    <FrappeProvider
      baseURL="https://frappetable-keeprows.spec.test"
      fixtures={fixtures}>
      <FrappeTable<Customer>
        doctype="Customer"
        columns={columns}
        filterableFields={filterFields}
        filters={filters}
        layout="table"
        enablePagination={false}
      />
    </FrappeProvider>,
  );
};

describe('FrappeTable keep-rows-and-reconcile on filter change', () => {
  beforeAll(async () => {
    if (!i18next.isInitialized) {
      // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
      await i18next.use(initReactI18next).init({
        lng: 'en',
        interpolation: { escapeValue: false },
        resources: { en: { translation: {} } },
      });
    }
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps current rows rendered and locally narrows them while the new query is in flight, then reconciles', async () => {
    const fixtures = new GatedFixtureProvider({ Customer: customers });
    const { rerender } = renderTable(fixtures, []);
    await screen.findByText('Acme Corp');
    expect(screen.getByText('Initech')).toBeTruthy();

    // Gate the round-trip the filter change will cause.
    const { promise: gate, resolve: release } = Promise.withResolvers<null>();
    fixtures.gate = gate;

    rerenderTable(rerender, fixtures, [['status', '=', 'Active']]);

    // DURING the gap: the matching rows never left the screen, the filter
    // already applied to what was cached locally, and no loading boundary
    // replaced the table.
    await waitFor(() => {
      expect(screen.queryByText('Initech')).toBeNull();
    });
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(screen.getByText('Globex')).toBeTruthy();
    expect(screen.queryByText(/No Customer records found/iu)).toBeNull();

    // Reconcile: the server (fixture) result replaces the held rows.
    release(null);
    fixtures.gate = null;
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeTruthy();
      expect(screen.getByText('Globex')).toBeTruthy();
      expect(screen.queryByText('Initech')).toBeNull();
    });
  });

  it('a filter that matches no current rows keeps the last-good rows mounted (no empty boundary)', async () => {
    const fixtures = new GatedFixtureProvider({ Customer: customers });
    const { rerender } = renderTable(fixtures, []);
    await screen.findByText('Acme Corp');

    const { promise: gate, resolve: release } = Promise.withResolvers<null>();
    fixtures.gate = gate;

    rerenderTable(rerender, fixtures, [['status', '=', 'Closed']]);

    // DURING the gap: local apply would empty the page — previous rows stay
    // as placeholderData. The empty AsyncBoundary must not replace the table.
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(screen.getByText('Initech')).toBeTruthy();
    expect(screen.queryByText(/No Customer records found/iu)).toBeNull();

    release(null);
    fixtures.gate = null;
    await waitFor(() => {
      expect(screen.queryByText('Acme Corp')).toBeNull();
      expect(screen.getByText(/No Customer records found/iu)).toBeTruthy();
    });
  });

  it('clearing the filter keeps the narrowed rows rendered until the wider set reconciles in', async () => {
    const fixtures = new GatedFixtureProvider({ Customer: customers });
    const { rerender } = renderTable(fixtures, [['status', '=', 'Active']]);
    await screen.findByText('Acme Corp');
    expect(screen.queryByText('Initech')).toBeNull();

    const { promise: gate, resolve: release } = Promise.withResolvers<null>();
    fixtures.gate = gate;

    rerenderTable(rerender, fixtures, []);

    // DURING the gap: last-good rows stay (no filter to narrow with).
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(screen.getByText('Globex')).toBeTruthy();
    expect(screen.queryByText(/No Customer records found/iu)).toBeNull();

    release(null);
    fixtures.gate = null;
    // Reconcile: the wider set (including Initech) arrives.
    await screen.findByText('Initech');
    expect(screen.getByText('Acme Corp')).toBeTruthy();
  });
});
