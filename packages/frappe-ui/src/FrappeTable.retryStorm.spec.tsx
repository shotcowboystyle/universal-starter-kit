/**
 * FrappeTable retry-storm regression — a persistently-failing fetch must
 * not loop (fetch → error → evict → refetch at microtask speed; the storm
 * that froze storybook renderers and OOM'd vitest workers).
 *
 * The protection lives at the shared altitude: the collection cache in
 * `@repo/frappe` (frappe-react.ts) HOLDS an errored entry while
 * any consumer retains it, so the error-state re-render re-acquires the
 * same entry instead of starting a fresh failing sync; the entry is evicted
 * on LAST release, making retry-by-remount exactly one fresh attempt.
 * FrappeTable/Kanban/Calendar/TreeView/Gantt all consume that one hook —
 * there is no per-view latch (the old attachments.tsx latch is gone).
 *
 * Cache-level pins live in public/frappe/src/frappe-react.test.ts
 * ("REGRESSION: an error-state consumer does not loop failing fetches").
 * This spec pins the same contract end-to-end through a real view that was
 * once flagged unprotected: FrappeTable with a down bench.
 */

import type { FixtureProvider } from '@repo/frappe';
import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

afterEach(() => {
  cleanup();
});

interface Customer {
  name: string;
  doctype: string;
  customer_name: string;
}

const columns: DataTableColumn<Partial<Customer>>[] = [
  { id: 'name', accessorKey: 'name', header: 'ID' },
  { id: 'customer_name', accessorKey: 'customer_name', header: 'Customer Name' },
];

// Explicit filterableFields skip the doctype-meta fetch (hermetic — the
// only network the table needs is the list subscription itself).
const filterFields = [{ id: 'customer_name', label: 'Customer Name', type: 'text' as const }];

/**
 * A bench that is down: every list fetch rejects. Counts attempts so the
 * spec can assert the bound. The cap is a safety valve — a regressed
 * (evict-on-error) cache refetches at microtask speed and would hang the
 * worker before any assertion runs; "recovering" after the cap lets the
 * test fail on the count instead.
 */
class DownBenchFixtureProvider implements FixtureProvider {
  getListCalls = 0;

  async getList(): Promise<never[]> {
    this.getListCalls++;
    if (this.getListCalls > 25) {
      return [];
    }
    throw new Error('bench down');
  }

  async getDoc(): Promise<null> {
    return null;
  }

  async createDoc(): Promise<never> {
    throw new Error('unsupported');
  }

  async updateDoc(): Promise<never> {
    throw new Error('unsupported');
  }

  async deleteDoc(): Promise<never> {
    throw new Error('unsupported');
  }
}

function renderTable(fixtures: FixtureProvider) {
  return renderWithProviders(
    <FrappeProvider
      baseURL="https://frappetable-retrystorm.spec.test"
      fixtures={fixtures}>
      <FrappeTable<Customer>
        doctype="Customer"
        columns={columns}
        filterableFields={filterFields}
        layout="table"
        enablePagination={false}
        error={(err) => <div data-testid="table-error">{err.message}</div>}
      />
    </FrappeProvider>,
  );
}

describe('FrappeTable retry-storm regression (persistently-failing fetch)', () => {
  it('surfaces the failure from exactly one bounded fetch attempt — no refetch loop', async () => {
    const fixtures = new DownBenchFixtureProvider();
    renderTable(fixtures);

    // Honest error surface (not an empty table), carrying the sync detail.
    const errorNode = await screen.findByTestId('table-error');
    expect(errorNode.textContent).toMatch(/bench down/);

    // The error-state re-render re-acquired the HELD errored entry — the
    // failure came from ONE sync attempt, not a loop.
    expect(fixtures.getListCalls).toBe(1);

    // Give a storm every chance: run well past the sync layer's debounce
    // and GC grace windows, then re-check the bound.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(fixtures.getListCalls).toBe(1);
  });

  it('retry-by-remount starts exactly ONE fresh attempt (bounded, explicit retries)', async () => {
    const fixtures = new DownBenchFixtureProvider();
    const first = renderTable(fixtures);
    await screen.findByTestId('table-error');
    expect(fixtures.getListCalls).toBe(1);

    // Last consumer releases the errored entry → evicted immediately; the
    // remount (the Retry contract) is the one place a fresh sync starts.
    first.unmount();
    renderTable(fixtures);
    await screen.findByTestId('table-error');
    expect(fixtures.getListCalls).toBe(2);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(fixtures.getListCalls).toBe(2);
  });
});
