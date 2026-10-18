import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DataTableColumn } from '../types';
import { serializeTableState, deserializeTableState } from '../utils/url-state-utils';

import { useDataTable } from './use-data-table';
import { useTableFiltering } from './use-table-filtering';
import { useTableGrouping } from './use-table-grouping';
import { useTablePagination } from './use-table-pagination';
import { useTableSearch } from './use-table-search';
import { useTableSelection } from './use-table-selection';
import { useTableSorting } from './use-table-sorting';

describe(useTableFiltering, () => {
  it('applying an advanced filter reduces filtered data tracking', () => {
    const { result } = renderHook(() =>
      useTableFiltering({
        enableFiltering: true,
        initialFilters: [],
      }),
    );

    expect(result.current.advancedFilters).toHaveLength(0);
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.activeFilterCount).toBe(0);

    act(() => {
      result.current.addFilter({
        columnId: 'name',
        value: {
          operator: 'contains',
          value: 'test',
        },
      });
    });

    expect(result.current.advancedFilters).toHaveLength(1);
    expect(result.current.hasActiveFilters).toBe(true);
    // Advanced filters are no longer mirrored into columnFilters — they have
    // their own pipeline (applyFiltersToData / server params).
    expect(result.current.activeFilterCount).toBe(1);
    expect(result.current.columnFilters).toHaveLength(0);
    expect(result.current.advancedFilters[0].columnId).toBe('name');

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.advancedFilters).toHaveLength(0);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('updateFilter edits an advanced filter in place; addFilter returns its id', () => {
    const { result } = renderHook(() => useTableFiltering());

    let id = '';
    act(() => {
      id = result.current.addFilter({
        columnId: 'status',
        value: { operator: 'is', value: 'open' },
      });
    });

    expect(id).toBeTruthy();
    expect(result.current.advancedFilters[0].id).toBe(id);

    act(() => {
      result.current.updateFilter(id, { value: { operator: 'isNot', value: 'closed' } });
    });

    expect(result.current.advancedFilters).toHaveLength(1);
    expect(result.current.advancedFilters[0].value).toStrictEqual({
      operator: 'isNot',
      value: 'closed',
    });

    act(() => {
      result.current.removeFilter(id);
    });

    expect(result.current.advancedFilters).toHaveLength(0);
  });
});

describe(useTableSorting, () => {
  it('setting sort state updates correctly', () => {
    const { result } = renderHook(() =>
      useTableSorting({
        enableSorting: true,
        initialSorting: [],
      }),
    );

    expect(result.current.sorting).toStrictEqual([]);

    act(() => {
      result.current.setSorting([{ id: 'name', desc: false }]);
    });

    expect(result.current.sorting).toStrictEqual([{ id: 'name', desc: false }]);

    act(() => {
      result.current.setSorting([
        { id: 'name', desc: true },
        { id: 'age', desc: false },
      ]);
    });

    expect(result.current.sorting).toHaveLength(2);
    expect(result.current.sorting[0].desc).toBe(true);
    expect(result.current.sorting[1].id).toBe('age');
  });
});

describe(useTablePagination, () => {
  it('pageIndex/pageSize produce correct computed totalPages, hasNext, hasPrev', () => {
    const { result } = renderHook(() =>
      useTablePagination({
        enablePagination: true,
        manualPagination: true,
        rowCount: 100,
        initialPagination: {
          pageIndex: 0,
          pageSize: 10,
        },
      }),
    );

    expect(result.current.pagination.pageIndex).toBe(0);
    expect(result.current.pagination.pageSize).toBe(10);
    expect(result.current.totalPages).toBe(10);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasPreviousPage).toBe(false);

    act(() => {
      result.current.setPagination({
        pageIndex: 5,
        pageSize: 10,
      });
    });

    expect(result.current.pagination.pageIndex).toBe(5);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasPreviousPage).toBe(true);

    act(() => {
      result.current.setPagination({
        pageIndex: 9,
        pageSize: 10,
      });
    });

    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.hasPreviousPage).toBe(true);
  });
});

describe(useTableSearch, () => {
  it('global search filters rows by text match', () => {
    const { result } = renderHook(() =>
      useTableSearch({
        columns: [{ accessorKey: 'name' }, { accessorKey: 'email' }],
      }),
    );

    expect(result.current.searchQuery).toBe('');

    act(() => {
      result.current.setSearchQuery('test');
    });

    expect(result.current.searchQuery).toBe('test');
    expect(result.current.searchOptions.columns).toStrictEqual(['name', 'email']);
  });
});

describe(useTableSelection, () => {
  it('selecting/deselecting rows updates selection state', () => {
    const { result } = renderHook(() => useTableSelection());

    expect(result.current.rowSelection).toStrictEqual({});
    expect(result.current.selectedRows).toStrictEqual([]);

    act(() => {
      result.current.setRowSelection({ '0': true });
    });

    expect(result.current.rowSelection).toStrictEqual({
      '0': true,
    });
    expect(result.current.selectedRows).toStrictEqual(['0']);

    act(() => {
      result.current.setRowSelection({
        '0': true,
        '2': true,
      });
    });

    expect(result.current.selectedRows).toHaveLength(2);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.rowSelection).toStrictEqual({});
    expect(result.current.selectedRows).toStrictEqual([]);
  });
});

describe(useTableGrouping, () => {
  it('grouping by a column key produces grouped row model', () => {
    const testData = [
      { name: 'Alice', department: 'Engineering' },
      { name: 'Bob', department: 'Engineering' },
      { name: 'Charlie', department: 'Marketing' },
      { name: 'Diana', department: 'Marketing' },
      { name: 'Eve', department: 'Sales' },
    ];

    const { result } = renderHook(() =>
      useTableGrouping({
        data: testData,
        initialGrouping: ['department'],
      }),
    );

    expect(result.current.isGrouped).toBe(true);
    expect(result.current.groupedData).not.toBeNull();
    expect(result.current.groupedData).toHaveLength(3);

    const engineeringGroup = result.current.groupedData?.find((g) => g.value === 'Engineering');
    expect(engineeringGroup?.count).toBe(2);
    expect(engineeringGroup?.items).toHaveLength(2);

    const marketingGroup = result.current.groupedData?.find((g) => g.value === 'Marketing');
    expect(marketingGroup?.count).toBe(2);

    const salesGroup = result.current.groupedData?.find((g) => g.value === 'Sales');
    expect(salesGroup?.count).toBe(1);
  });
});

describe('useTableUrlSync', () => {
  it('serialization round-trip produces identical state', () => {
    const originalState = {
      pagination: { pageIndex: 2, pageSize: 25 },
      sorting: [
        { id: 'name', desc: false },
        { id: 'date', desc: true },
      ],
      filters: [
        {
          id: 'f1',
          columnId: 'status',
          value: {
            operator: 'is' as const,
            value: 'active',
          },
        },
      ],
      globalFilter: 'search query',
      activeViewId: 'view-123',
    };

    const serialized = serializeTableState(originalState);

    // 1-based
    expect(serialized.page).toBe('3');
    expect(serialized.pageSize).toBe('25');
    expect(serialized.sort).toBe('name:asc,date:desc');
    expect(serialized.search).toBe('search query');
    expect(serialized.view).toBe('view-123');

    const deserialized = deserializeTableState(serialized);

    // back to 0-based
    expect(deserialized.pagination?.pageIndex).toBe(2);
    expect(deserialized.pagination?.pageSize).toBe(25);
    expect(deserialized.sorting).toHaveLength(2);
    expect(deserialized.sorting?.[0]).toStrictEqual({
      id: 'name',
      desc: false,
    });
    expect(deserialized.sorting?.[1]).toStrictEqual({
      id: 'date',
      desc: true,
    });
    expect(deserialized.globalFilter).toBe('search query');
    expect(deserialized.activeViewId).toBe('view-123');
    expect(deserialized.filters).toHaveLength(1);
    expect(deserialized.filters?.[0].columnId).toBe('status');
  });
});

describe('useDataTable composition', () => {
  it('enabling filtering + sorting + pagination together produces a valid table instance', () => {
    const testData = [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25 },
      { id: 3, name: 'Charlie', age: 35 },
      { id: 4, name: 'Diana', age: 28 },
      { id: 5, name: 'Eve', age: 32 },
    ];

    const testColumns: DataTableColumn<any>[] = [
      { id: 'name', accessorKey: 'name', header: 'Name' },
      { id: 'age', accessorKey: 'age', header: 'Age' },
    ];

    const { result } = renderHook(() =>
      useDataTable({
        data: testData,
        columns: testColumns,
        enableFiltering: true,
        enableSorting: true,
        enablePagination: true,
        initialState: {
          pagination: { pageIndex: 0, pageSize: 10 },
        },
      }),
    );

    // Verify return shape: { table, state, actions, computed }
    expect(result.current.table).toBeDefined();
    expect(result.current.state).toBeDefined();
    expect(result.current.actions).toBeDefined();
    expect(result.current.computed).toBeDefined();

    // Verify table instance has expected methods
    expect(result.current.table.getRowModel).toBeDefined();
    expect(result.current.table.getFilteredRowModel).toBeDefined();
    expect(result.current.table.getSortedRowModel).toBeDefined();

    // Verify state shape
    expect(result.current.state.data).toStrictEqual(testData);
    expect(result.current.state.pagination.pageIndex).toBe(0);
    expect(result.current.state.pagination.pageSize).toBe(10);
    expect(result.current.state.sorting).toStrictEqual([]);
    expect(result.current.state.filters).toStrictEqual([]);

    // Verify actions shape
    expect(result.current.actions.setGlobalFilter).toBeDefined();
    expect(result.current.actions.setFilters).toBeDefined();
    expect(result.current.actions.addFilter).toBeDefined();
    expect(result.current.actions.removeFilter).toBeDefined();
    expect(result.current.actions.clearFilters).toBeDefined();
    expect(result.current.actions.setPagination).toBeDefined();
    expect(result.current.actions.setSorting).toBeDefined();
    expect(result.current.actions.toggleColumnVisibility).toBeDefined();
    expect(result.current.actions.setColumnOrder).toBeDefined();
    expect(result.current.actions.setColumnSizing).toBeDefined();
    expect(result.current.actions.saveView).toBeDefined();
    expect(result.current.actions.loadView).toBeDefined();
    expect(result.current.actions.resetToDefault).toBeDefined();

    // Verify computed shape
    expect(result.current.computed.filteredData).toBeDefined();
    expect(result.current.computed.paginatedData).toBeDefined();
    expect(result.current.computed.totalPages).toBeDefined();
    expect(result.current.computed.hasActiveFilters).toBe(false);
    expect(result.current.computed.activeFilterCount).toBe(0);

    // Verify data flows through
    expect(result.current.computed.filteredData).toHaveLength(5);
    expect(result.current.computed.paginatedData).toHaveLength(5);
  });
});
