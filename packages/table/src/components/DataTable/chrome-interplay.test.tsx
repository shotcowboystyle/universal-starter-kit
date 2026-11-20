/**
 * Interplay matrix for the table chrome trio: Export × BulkActions × Grouping.
 *
 * - export while grouped → leaf rows only, no group-header artifacts
 * - bulk-select while grouped → selection counts/payloads are leaf rows only
 * - export with an active selection → exports the full filtered view
 *   (documented contract: DataTableExport has no export-selected mode; a
 *   selection-scoped export is a BulkAction concern)
 *
 * Plus the external-filter-authority arm: Search × injected filters ×
 * enableFiltering — `enableFiltering={false}` suppresses every filter entry
 * point while filters injected via `initialState.filters` keep applying and
 * cannot be mutated from table chrome (external filter authority contract, MOD-04).
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDataTableState } from './data-table-state-context';

import { DataTable } from './index';

interface Item {
  id: string;
  name: string;
  status: string;
}

const rows: Item[] = [
  { id: '1', name: 'Alpha', status: 'ready' },
  { id: '2', name: 'Bravo', status: 'blocked' },
  { id: '3', name: 'Charlie', status: 'ready' },
  { id: '4', name: 'Delta', status: 'blocked' },
];

const columns = [
  { id: 'name', accessorKey: 'name', header: 'Name' },
  { id: 'status', accessorKey: 'status', header: 'Status' },
];

// Grouping state has no initialState channel — it's driven via
// actions.setGrouping (as the toolbar's grouping config does).
const GroupingProbe = ({ by }: { by: string[] }) => {
  const ctx = useDataTableState();
  const applied = React.useRef(false);
  React.useEffect(() => {
    if (!applied.current && ctx?.actions.setGrouping !== undefined) {
      applied.current = true;
      ctx.actions.setGrouping(by);
    }
  }, [ctx, by]);
  return null;
};

const mockCreateObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'mock-url');
Object.defineProperty(window.URL, 'createObjectURL', {
  writable: true,
  value: mockCreateObjectURL,
});
Object.defineProperty(window.URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn<(url: string) => void>(),
});

describe('chrome interplay: Export × BulkActions × Grouping', () => {
  it('export while grouped emits leaf rows only (no group headers, no undefined)', async () => {
    mockCreateObjectURL.mockClear();

    renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        enableGrouping>
        <GroupingProbe by={['status']} />
        <DataTable.Export />
      </DataTable>,
    );

    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1) as unknown as [Blob];
    const text = await blob.text();
    const lines = text.trim().split('\n');

    // TanStack's default groupedColumnMode:"reorder" moves the grouped column
    // to the front of the view; the export mirrors the on-screen order.
    expect(lines[0]).toBe('Status,Name');
    // All four leaf rows present, exactly once each.
    expect(lines).toHaveLength(5);
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
      expect(lines.filter((l) => l.includes(name))).toHaveLength(1);
    }
    expect(text).not.toContain('undefined');
  });

  it('bulk select-all while grouped counts and delivers leaf rows only', async () => {
    const received: Item[][] = [];
    const bulkActions = [
      {
        id: 'tag',
        label: 'Tag',
        onExecute: (items: Item[]) => {
          received.push(items);
        },
      },
    ];

    renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        enableGrouping
        enableRowSelection
        bulkActions={bulkActions}>
        <GroupingProbe by={['status']} />
      </DataTable>,
    );

    fireEvent.click(screen.getByLabelText('Select all rows'));

    // Group rows are selected transitively but never counted — the count is
    // the leaf-row selection, and the action payload contains only real rows.
    await expect(screen.findByText('4 selected')).resolves.toBeInTheDocument();

    fireEvent.click(screen.getByText('Tag'));
    await waitFor(() => {
      expect(received).toHaveLength(1);
    });
    expect(received[0].map((r) => r.id).toSorted()).toStrictEqual(['1', '2', '3', '4']);
    expect(received[0].map((r) => r.name).toSorted()).toStrictEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('export with an active row selection exports the full filtered view (documented contract)', async () => {
    mockCreateObjectURL.mockClear();

    renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        enableRowSelection
        bulkActions={[
          {
            id: 'noop',
            label: 'Noop',
            onExecute: vi.fn<(selectedItems: Item[], clearSelection: () => void) => void>(),
          },
        ]}>
        <DataTable.Export />
      </DataTable>,
    );

    fireEvent.click(screen.getAllByLabelText(/^Select row/u)[0]);
    await expect(screen.findByText('1 selected')).resolves.toBeInTheDocument();

    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1) as unknown as [Blob];
    const text = await blob.text();
    // Selection does NOT scope the default export — all 4 rows ship.
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
      expect(text).toContain(name);
    }
  });
});

describe('chrome interplay: Search × injected filters × enableFiltering', () => {
  // layout="table" pins the grid: the happy-dom env resolves sm=false, so
  // the auto layout would render cards (no header funnels there).
  const injectedReadyFilter = [
    { id: 'ext-status', columnId: 'status', value: { operator: 'is' as const, value: 'ready' } },
  ];
  const statusFilterField = [{ id: 'status', label: 'Status', type: 'text' as const }];

  it('enableFiltering=false renders no filter entry points while injected filters still apply', () => {
    // Positive control first: the same composition WITH filter chrome shows
    // every entry point, proving the suppressed-render queries can match.
    const control = renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        layout="table"
        enableFiltering
        filterableFields={statusFilterField}
        initialState={{ filters: injectedReadyFilter }}
      />,
    );
    expect(screen.getByLabelText('Filter')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Filter column/u).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Active filters')).toBeInTheDocument();
    control.unmount();

    renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        layout="table"
        enableFiltering={false}
        filterableFields={statusFilterField}
        initialState={{ filters: injectedReadyFilter }}
      />,
    );

    // Injected filters keep applying: only the "ready" rows render.
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
    expect(screen.queryByText('Delta')).not.toBeInTheDocument();

    // No filter chrome: toolbar Filter button, column funnels, chips row.
    expect(screen.queryByLabelText('Filter')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Filter column/u)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Active filters')).not.toBeInTheDocument();

    // Search survives suppression (it is not part of the filter chrome).
    expect(screen.getByLabelText('Search table data')).toBeInTheDocument();
  });

  it("enableFiltering=false suppresses the card layout's filter control too", () => {
    // auto layout renders cards below sm (the test env default).
    // MPO-300: the default card path owns the canonical all-field Filter in
    // the toolbar; the lower Card list controls toolbar and its Add Filter
    // builder only mount behind a custom toolbar now.
    const control = renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        enableFiltering
        initialState={{ filters: injectedReadyFilter }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByText('Add Filter')).not.toBeInTheDocument();
    control.unmount();

    renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        enableFiltering={false}
        initialState={{ filters: injectedReadyFilter }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByText('Add Filter')).not.toBeInTheDocument();
    // Injected filters still scope the card list.
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
  });

  it('search clear X preserves injected filters when enableFiltering=false', async () => {
    renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        layout="table"
        enableFiltering={false}
        initialState={{ filters: injectedReadyFilter }}
      />,
    );

    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'Alp' } });
    await waitFor(() => {
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear search'));

    // Search text cleared → both "ready" rows return; the injected filter
    // is untouched (Bravo/Delta stay filtered out).
    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
    expect(screen.queryByText('Delta')).not.toBeInTheDocument();
  });

  it('search clear X clears injected filters when the table owns filtering (existing contract)', async () => {
    renderWithProviders(
      <DataTable
        data={rows}
        columns={columns as any}
        layout="table"
        enableFiltering
        filterableFields={statusFilterField}
        initialState={{ filters: injectedReadyFilter }}
      />,
    );

    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();

    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'x' } });
    fireEvent.click(screen.getByLabelText('Clear search'));

    // Explicit clear intent with an owned filter surface clears everything.
    await waitFor(() => {
      expect(screen.getByText('Bravo')).toBeInTheDocument();
    });
    expect(screen.getByText('Delta')).toBeInTheDocument();
  });
});
