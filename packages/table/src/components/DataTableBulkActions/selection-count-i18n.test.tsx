// D-15: the selection-count label is i18n-safe — each variant is ONE
// whole-sentence t() key ("{{n}} selected", "{{n}} selected (+{{hidden}}
// filtered out)"), never concatenated English fragments, so locales own the
// word order. This spec runs with an initialized i18next instance whose
// translations deliberately differ from the keys (reordered words), proving
// the label routes through t() — the sibling DataTableBulkActions.test.tsx
// covers the untranslated fallback (withInterp fills the raw key).
import { renderWithProviders } from '@repo/test-utils';
import { getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DataTableStateContext } from '../DataTable/data-table-state-context';

import { DataTableBulkActions } from './index';
import type { BulkAction } from './index';

interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: 'a', name: 'Alpha', status: 'ready' },
  { id: 'b', name: 'Bravo', status: 'blocked' },
];

const actions: BulkAction<Row>[] = [{ id: 'x', label: 'X', onExecute: vi.fn<() => void>() }];

const NO_FILTERS: { id: string; value: any }[] = [];

const Harness = ({ columnFilters = NO_FILTERS }: { columnFilters?: { id: string; value: any }[] }) => {
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({
    a: true,
    b: true,
  });
  const table = useReactTable({
    data: rows,
    columns: [
      { id: 'name', accessorKey: 'name', header: 'Name' },
      { id: 'status', accessorKey: 'status', header: 'Status' },
    ] as any,
    state: { rowSelection, columnFilters, pagination: { pageIndex: 0, pageSize: 10 } },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
  });
  const ctxValue = React.useMemo(
    () => ({ table, state: {} as any, actions: {} as any, computed: {} as any }) as any,
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- table instance is stable; selection/filter changes must still publish a new context value
    [table, rowSelection, columnFilters],
  );
  return (
    <DataTableStateContext.Provider value={ctxValue}>
      <DataTableBulkActions actions={actions} />
    </DataTableStateContext.Provider>
  );
};

describe('selection count label i18n (D-15)', () => {
  beforeAll(async () => {
    // Same natural-language keys registered in packages/i18n/en/common.json,
    // mapped to a pseudo-locale that reorders the sentence.
    // oxlint-disable-next-line import/no-named-as-default-member -- i18next.use is the documented instance API, not the standalone named export
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: {
        en: {
          translation: {
            '{{n}} selected': 'selected: {{n}}',
            '{{n}} selected (+{{hidden}} filtered out)': 'selected: {{n}} (hidden by filter: {{hidden}})',
          },
        },
      },
    });
  });

  afterEach(cleanup);

  it('base count renders through the {{n}} selected key', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('selected: 2')).toBeInTheDocument();
    expect(screen.queryByText(/\d selected/u)).not.toBeInTheDocument();
  });

  it('filtered-out annotation renders through its own whole-sentence key', () => {
    renderWithProviders(<Harness columnFilters={[{ id: 'status', value: 'ready' }]} />);
    expect(screen.getByText('selected: 2 (hidden by filter: 1)')).toBeInTheDocument();
    expect(screen.queryByText(/filtered out/u)).not.toBeInTheDocument();
  });
});
