import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableState, TableFilter } from '../types';

import { useDataTable } from './use-data-table';

describe(useDataTable, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(useDataTable).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// controlledState adoption — the keep-rows-and-reconcile channel
// (filter/sort changes from an OUTER surface adopt in place, no remount)
// ---------------------------------------------------------------------------

const data = [
  { id: 1, name: 'Alice', status: 'Active' },
  { id: 2, name: 'Bob', status: 'Lead' },
  { id: 3, name: 'Charlie', status: 'Active' },
];

const columns: DataTableColumn<(typeof data)[number]>[] = [
  { id: 'name', accessorKey: 'name', header: 'Name' },
  { id: 'status', accessorKey: 'status', header: 'Status' },
];

const statusFilter = (value: string): TableFilter => ({
  id: `status-${value}`,
  columnId: 'status',
  value: { operator: 'is', value },
});

const renderControlled = (initialControlled: Partial<Pick<DataTableState, 'filters' | 'sorting'>>) =>
  renderHook(
    ({ controlled }: { controlled: Partial<Pick<DataTableState, 'filters' | 'sorting'>> }) =>
      useDataTable({
        data,
        columns,
        controlledState: controlled,
        initialState: {
          filters: initialControlled.filters ?? [],
          sorting: initialControlled.sorting ?? [],
          pagination: { pageIndex: 2, pageSize: 1 },
        },
      }),
    { initialProps: { controlled: initialControlled } },
  );

describe('useDataTable controlledState adoption', () => {
  it('adopts an inbound filter CONTENT change in place and resets to page 0', () => {
    const { result, rerender } = renderControlled({ filters: [] });
    expect(result.current.state.filters).toStrictEqual([]);
    expect(result.current.state.pagination.pageIndex).toBe(2);

    act(() => {
      rerender({ controlled: { filters: [statusFilter('Active')] } });
    });

    expect(result.current.state.filters).toHaveLength(1);
    expect(result.current.state.filters[0].columnId).toBe('status');
    expect(result.current.state.pagination.pageIndex).toBe(0);
  });

  it('a same-content echo (new array identity) is a no-op — internal state is never fought', () => {
    const initial = { filters: [statusFilter('Active')] };
    const { result, rerender } = renderControlled(initial);

    // User pages forward through the table's own chrome.
    act(() => {
      result.current.actions.setPagination({ pageIndex: 1, pageSize: 1 });
    });
    expect(result.current.state.pagination.pageIndex).toBe(1);

    // Outer surface re-renders with the SAME tuples in a fresh array.
    act(() => {
      rerender({ controlled: { filters: [statusFilter('Active')] } });
    });

    // No adoption: page position (user work) survives.
    expect(result.current.state.pagination.pageIndex).toBe(1);
    expect(result.current.state.filters).toHaveLength(1);
  });

  it('adopts an inbound sorting change in place and resets to page 0', () => {
    const { result, rerender } = renderControlled({ sorting: [{ id: 'name', desc: false }] });
    expect(result.current.state.sorting).toStrictEqual([{ id: 'name', desc: false }]);
    expect(result.current.state.pagination.pageIndex).toBe(2);

    act(() => {
      rerender({ controlled: { sorting: [{ id: 'status', desc: true }] } });
    });

    expect(result.current.state.sorting).toStrictEqual([{ id: 'status', desc: true }]);
    expect(result.current.state.pagination.pageIndex).toBe(0);
  });

  it('clearing filters through the channel adopts the empty set', () => {
    const { result, rerender } = renderControlled({ filters: [statusFilter('Active')] });
    expect(result.current.state.filters).toHaveLength(1);

    act(() => {
      rerender({ controlled: { filters: [] } });
    });

    expect(result.current.state.filters).toStrictEqual([]);
  });
});

describe('useDataTable column width normalization', () => {
  type Row = (typeof data)[number];

  it.each<[Partial<DataTableColumn<Row>>, number]>([
    [{ width: 320 }, 320],
    [{ width: 320, size: 90 }, 90],
    [{ width: 320, minWidth: 200, maxWidth: 240 }, 240],
    [{ width: 320, size: 90, minWidth: 200, minSize: 60, maxWidth: 80, maxSize: 100 }, 90],
    [{ width: 320, size: 180, maxWidth: 140 }, 140],
    [{ width: 125.5 }, 125.5],
    [{ width: 0 }, 20],
    [{ width: 0, minWidth: 0 }, 0],
    [{ width: 320, size: 0, minSize: 0 }, 0],
    [{ width: Number.NaN }, 150],
    [{ width: Number.POSITIVE_INFINITY }, 150],
    [{ width: -1 }, 150],
    [{ minWidth: Number.NaN, maxWidth: -1 }, 150],
  ])('resolves %j to %s through the real table', (sizing, expected) => {
    const { result } = renderHook(() =>
      useDataTable({ data, columns: [{ id: 'name', accessorKey: 'name', ...sizing }] }),
    );
    expect(result.current.table.getColumn('name')?.getSize()).toBe(expected);
  });

  it('preserves input objects and normalizes grouped leaves without distributing group width', () => {
    const leaf: DataTableColumn<Row> = { id: 'name', accessorKey: 'name', width: 320 };
    const group: DataTableColumn<Row> = {
      id: 'group',
      header: 'Group',
      width: 900,
      columns: [leaf],
    };
    const plain: DataTableColumn<Row> = { id: 'status', accessorKey: 'status' };
    Object.freeze(leaf);
    Object.freeze(group.columns);
    Object.freeze(group);
    Object.freeze(plain);
    const source = [group, plain];
    Object.freeze(source);
    const { result, rerender } = renderHook(() => useDataTable({ data, columns: source }));
    expect(result.current.table.getColumn('name')?.getSize()).toBe(320);
    expect(leaf).not.toHaveProperty('size');
    expect(group.columns?.[0]).toBe(leaf);
    expect(result.current.table.options.columns[1]).toBe(plain);
    const normalized = result.current.table.options.columns;
    rerender();
    expect(result.current.table.options.columns).toBe(normalized);
  });

  it('keeps sizing state ahead of updated declarations and resets to the current definition', () => {
    const { result, rerender } = renderHook(
      ({ width }) => useDataTable({ data, columns: [{ id: 'name', accessorKey: 'name', width }] }),
      { initialProps: { width: 320 } },
    );
    expect(result.current.table.getColumn('name')?.getSize()).toBe(320);
    act(() => {
      result.current.actions.setColumnSizing({ name: 210 });
    });
    rerender({ width: 400 });
    expect(result.current.table.getColumn('name')?.getSize()).toBe(210);
    act(() => {
      result.current.actions.resetToDefault();
    });
    expect(result.current.table.getColumn('name')?.getSize()).toBe(400);
  });

  it('loads existing view width state without renaming its persistence field', () => {
    const { result } = renderHook(() =>
      useDataTable({
        data,
        columns: [{ id: 'name', accessorKey: 'name', width: 320 }],
        initialState: {
          views: [
            {
              id: 'saved',
              name: 'Saved',
              columns: { name: { id: 'name', visible: true, width: 205, order: 0 } },
              filters: [],
              sorting: [],
              pagination: { pageIndex: 0, pageSize: 10 },
            },
          ],
        },
      }),
    );
    act(() => {
      result.current.actions.loadView('saved');
    });
    expect(result.current.table.getColumn('name')?.getSize()).toBe(205);
    expect(result.current.state.columnSizing).toStrictEqual({ name: 205 });
    act(() => {
      result.current.actions.resetToDefault();
    });
    expect(result.current.table.getColumn('name')?.getSize()).toBe(320);
  });

  it('preserves sorting/filter aliases and explicit overrides alongside width', () => {
    const sortingFn = vi.fn<() => number>(() => 0);
    const { result } = renderHook(() =>
      useDataTable({
        data,
        columns: [
          { id: 'name', accessorKey: 'name', width: 320, sortable: false, filterable: false },
          {
            id: 'status',
            accessorKey: 'status',
            width: 90,
            sortable: false,
            enableSorting: true,
            sortingFn,
          },
        ],
      }),
    );
    expect(result.current.table.getColumn('name')?.getSize()).toBe(320);
    expect(result.current.table.getColumn('name')?.getCanSort()).toBe(false);
    expect(result.current.table.getColumn('name')?.getCanFilter()).toBe(false);
    expect(result.current.table.getColumn('status')?.getCanSort()).toBe(true);
    expect(result.current.table.getColumn('status')?.columnDef.sortingFn).toBe(sortingFn);
  });
});

// ---------------------------------------------------------------------------
// columnOrder seeding — id-less columns keep the caller's declared order
// (MPO-292: `col.id || ""` matched no column, so every id-less column fell
// behind every id'd one)
// ---------------------------------------------------------------------------

describe('useDataTable columnOrder seeding', () => {
  interface Row {
    id: number;
    name: string;
    status: string;
    owner: { name: string };
  }
  const rows: Row[] = [
    { id: 1, name: 'Alice', status: 'Active', owner: { name: 'Ops' } },
    { id: 2, name: 'Bob', status: 'Lead', owner: { name: 'Sales' } },
  ];

  it("seeds columnOrder with TanStack's own key for every column, id or not", () => {
    const mixedColumns = [
      { accessorKey: 'name', header: 'Name' },
      { id: '_actions', header: 'Actions', cell: () => null },
      { accessorKey: 'owner.name', header: 'Owner' },
      { accessorFn: (row: Row) => row.status, header: 'Status' },
    ] as DataTableColumn<Row>[];
    const { result } = renderHook(() => useDataTable({ data: rows, columns: mixedColumns }));
    const order = result.current.state.columnOrder;
    expect(order).toStrictEqual(['name', '_actions', 'owner_name', 'Status']);
    expect(new Set(order).size).toBe(mixedColumns.length);
    for (const key of order) {
      expect(result.current.table.getColumn(key)?.id).toBe(key);
    }
  });

  it("renders getVisibleCells() in the declared order when id'd and id-less columns mix", () => {
    const mixedColumns = [
      { accessorKey: 'name', header: 'Name' },
      { id: '_actions', header: 'Actions', cell: () => null },
      { accessorKey: 'status', header: 'Status' },
    ] as DataTableColumn<Row>[];
    const { result } = renderHook(() => useDataTable({ data: rows, columns: mixedColumns }));
    const cells = result.current.table.getRowModel().rows[0].getVisibleCells();
    expect(cells.map((cell) => cell.column.id)).toStrictEqual(['name', '_actions', 'status']);
  });
});
