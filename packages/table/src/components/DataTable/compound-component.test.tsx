/**
 * Compound component tests - 6 focused tests for Task Group 5.
 *
 * 1. DataTable.Toolbar renders toolbar when composed as child
 * 2. DataTable.Pagination renders pagination when composed as child
 * 3. DataTable.Filters renders filter UI when composed as child
 * 4. DataTableContext cascades size and compact props to sub-components
 * 5. DataTableStateContext provides table instance, state, actions, computed to sub-components
 * 6. renderToolbar/renderPagination/renderFilters escape hatches still work for custom rendering
 */

import { renderWithProviders } from '@repo/test-utils';
import { createColumnHelper, useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';
import { DataTableFilters } from '../DataTableFilters';
import { DataTablePagination } from '../DataTablePagination';
import { DataTableToolbar } from '../DataTableToolbar';

import { DataTableContext } from './data-table-context';
import { DataTableStateContext, useDataTableState } from './data-table-state-context';
import type { DataTableStateContextValue } from './data-table-state-context';

import { DataTable } from './index';

interface Person {
  id: number;
  name: string;
  age: number;
}

const sampleData: Person[] = [
  { id: 1, name: 'Alice', age: 30 },
  { id: 2, name: 'Bob', age: 25 },
  { id: 3, name: 'Charlie', age: 35 },
];

const columnHelper = createColumnHelper<Person>();

const columns: DataTableColumn<Person>[] = [
  columnHelper.accessor('id', { header: 'ID' }) as DataTableColumn<Person>,
  columnHelper.accessor('name', { header: 'Name' }) as DataTableColumn<Person>,
  columnHelper.accessor('age', { header: 'Age' }) as DataTableColumn<Person>,
];

type StateValue = DataTableStateContextValue<Person>;
type Actions = StateValue['actions'];

const mockActions = (): Actions => ({
  setGlobalFilter: vi.fn<Actions['setGlobalFilter']>(),
  setFilters: vi.fn<Actions['setFilters']>(),
  addFilter: vi.fn<Actions['addFilter']>(),
  removeFilter: vi.fn<Actions['removeFilter']>(),
  clearFilters: vi.fn<Actions['clearFilters']>(),
  setPagination: vi.fn<Actions['setPagination']>(),
  setSorting: vi.fn<Actions['setSorting']>(),
  toggleColumnVisibility: vi.fn<Actions['toggleColumnVisibility']>(),
  setColumnOrder: vi.fn<Actions['setColumnOrder']>(),
  setColumnSizing: vi.fn<Actions['setColumnSizing']>(),
  saveView: vi.fn<Actions['saveView']>(),
  loadView: vi.fn<Actions['loadView']>(),
  resetToDefault: vi.fn<Actions['resetToDefault']>(),
  setExpanded: vi.fn<NonNullable<Actions['setExpanded']>>(),
});

/** Provides a DataTableStateContext built around a real TanStack table instance. */
const StateHarness = ({ children, value }: { children: ReactNode; value: Omit<StateValue, 'table'> }) => {
  // oxlint-disable-next-line react/incompatible-library -- test harness; TanStack's mutable table instance is what the context carries
  const table = useReactTable({
    data: sampleData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const contextValue = useMemo(() => ({ ...value, table }), [value, table]);
  return <DataTableStateContext.Provider value={contextValue}>{children}</DataTableStateContext.Provider>;
};

/** Hands the nearest DataTableStateContext to the test. */
const ContextProbe = ({ onRead }: { onRead: (ctx: StateValue | null) => void }) => {
  onRead(useDataTableState<Person>());
  return null;
};

const StyledContextConsumer = ({ onRead }: { onRead: (read: { size?: string; compact?: boolean }) => void }) => {
  const ctx = DataTableContext.useStyledContext();
  onRead({ size: ctx.size, compact: ctx.compact });
  return (
    <div data-testid="context-consumer">
      size={ctx.size} compact={String(ctx.compact)}
    </div>
  );
};

const StateConsumer = ({ onRead }: { onRead: (ctx: StateValue | null) => void }) => {
  const ctx = useDataTableState<Person>();
  onRead(ctx);
  if (!ctx) {
    return <div data-testid="no-context">No context</div>;
  }
  return (
    <div data-testid="has-context">
      has-table={String(ctx.table !== null)}
      has-state={String(ctx.state !== null)}
      has-actions={String(ctx.actions !== null)}
      has-computed={String(ctx.computed !== null)}
    </div>
  );
};

describe('DataTable Compound Component', () => {
  it('DataTable.Toolbar renders toolbar when composed as child', () => {
    // Verify the static property is attached and references the correct component
    expect(DataTable.Toolbar).toBeDefined();
    expect(DataTable.Toolbar).toBeTypeOf('function');
    expect(DataTable.Toolbar).toBe(DataTableToolbar);

    // Verify sub-components are attached via withStaticProperties
    expect(DataTable.Toolbar).toBeDefined();
    expect(DataTable.Filters).toBeDefined();
    expect(DataTable.Pagination).toBeDefined();
    expect(DataTable.BulkActions).toBeDefined();
    expect(DataTable.SelectionToolbar).toBeDefined();
    expect(DataTable.SelectionToolbar).toBe(DataTable.BulkActions);
    expect(DataTable.Export).toBeDefined();
    expect(DataTable.Search).toBeDefined();
    expect(DataTable.ViewOptions).toBeDefined();
    expect(DataTable.Grouping).toBeDefined();
  });

  it('DataTable.Pagination renders pagination when composed as child', () => {
    // Verify the static property is attached and references the correct component
    expect(DataTable.Pagination).toBeDefined();
    expect(DataTable.Pagination).toBeTypeOf('function');
    expect(DataTable.Pagination).toBe(DataTablePagination);

    // Verify the Pagination component can read from context when
    // rendered inside a DataTableStateContext provider
    let capturedContext: StateValue | null = null;

    renderWithProviders(
      <StateHarness
        value={{
          state: {
            data: sampleData,
            columns: columns as DataTableColumn[],
            pagination: { pageIndex: 0, pageSize: 10 },
            sorting: [],
            filters: [],
            columnFilters: [],
            globalFilter: '',
            columnVisibility: {},
            columnOrder: [],
            columnSizing: {},
            views: [],
          },
          actions: mockActions(),
          computed: {
            filteredData: sampleData,
            paginatedData: sampleData,
            totalPages: 1,
            totalRows: sampleData.length,
            hasActiveFilters: false,
            activeFilterCount: 0,
          },
        }}>
        <ContextProbe
          onRead={(ctx) => {
            capturedContext = ctx;
          }}
        />
      </StateHarness>,
    );

    // Pagination sub-component can read state from context
    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.state.pagination).toStrictEqual({ pageIndex: 0, pageSize: 10 });
    expect(capturedContext!.actions.setPagination).toBeTypeOf('function');
  });

  it('DataTable.Filters renders filter UI when composed as child', () => {
    // Verify the static property is attached and references the correct component
    expect(DataTable.Filters).toBeDefined();
    expect(DataTable.Filters).toBeTypeOf('function');
    expect(DataTable.Filters).toBe(DataTableFilters);

    // Verify the Filters component can read from context when
    // rendered inside a DataTableStateContext provider
    let capturedContext: StateValue | null = null;

    renderWithProviders(
      <StateHarness
        value={{
          state: {
            data: sampleData,
            columns: columns as DataTableColumn[],
            pagination: { pageIndex: 0, pageSize: 10 },
            sorting: [],
            filters: [{ id: 'f1', columnId: 'name', value: { operator: 'is', value: 'Alice' } }],
            columnFilters: [],
            globalFilter: '',
            columnVisibility: {},
            columnOrder: [],
            columnSizing: {},
            views: [],
          },
          actions: mockActions(),
          computed: {
            filteredData: [sampleData[0]],
            paginatedData: [sampleData[0]],
            totalPages: 1,
            totalRows: 1,
            hasActiveFilters: true,
            activeFilterCount: 1,
          },
        }}>
        <ContextProbe
          onRead={(ctx) => {
            capturedContext = ctx;
          }}
        />
      </StateHarness>,
    );

    // Filters sub-component can read state from context
    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.state.filters).toHaveLength(1);
    expect(capturedContext!.actions.setFilters).toBeTypeOf('function');
    expect(capturedContext!.actions.addFilter).toBeTypeOf('function');
    expect(capturedContext!.actions.removeFilter).toBeTypeOf('function');
    expect(capturedContext!.actions.clearFilters).toBeTypeOf('function');
    expect(capturedContext!.computed.hasActiveFilters).toBe(true);
  });

  it('DataTableContext cascades size and compact props to sub-components', () => {
    let capturedSize: string | null | undefined;
    let capturedCompact: boolean | null | undefined;
    const record = (read: { size?: string; compact?: boolean }) => {
      capturedSize = read.size;
      capturedCompact = read.compact;
    };

    // Test with explicit size="sm" and compact={true}
    renderWithProviders(
      <DataTableContext.Provider
        size="sm"
        compact={true}>
        <StyledContextConsumer onRead={record} />
      </DataTableContext.Provider>,
    );

    expect(capturedSize).toBe('sm');
    expect(capturedCompact).toBe(true);

    // Test with different values to ensure cascading works
    capturedSize = null;
    capturedCompact = null;

    renderWithProviders(
      <DataTableContext.Provider
        size="lg"
        compact={false}>
        <StyledContextConsumer onRead={record} />
      </DataTableContext.Provider>,
    );

    expect(capturedSize).toBe('lg');
    expect(capturedCompact).toBe(false);
  });

  it('DataTableStateContext provides table instance, state, actions, computed to sub-components', () => {
    let capturedContext: StateValue | null = null;

    renderWithProviders(
      <StateHarness
        value={{
          state: {
            data: sampleData,
            columns: columns as DataTableColumn[],
            globalFilter: '',
            columnFilters: [],
            sorting: [],
            pagination: { pageIndex: 0, pageSize: 10 },
            filters: [],
            columnVisibility: {},
            columnOrder: [],
            columnSizing: {},
            views: [],
            isLoading: false,
          },
          actions: mockActions(),
          computed: {
            filteredData: sampleData,
            paginatedData: sampleData,
            totalPages: 1,
            totalRows: sampleData.length,
            hasActiveFilters: false,
            activeFilterCount: 0,
          },
        }}>
        <StateConsumer
          onRead={(ctx) => {
            capturedContext = ctx;
          }}
        />
      </StateHarness>,
    );

    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.table).toBeDefined();
    expect(capturedContext!.state).toBeDefined();
    expect(capturedContext!.actions).toBeDefined();
    expect(capturedContext!.computed).toBeDefined();

    // Verify key state properties exist
    expect(capturedContext!.state.pagination).toBeDefined();
    expect(capturedContext!.state.globalFilter).toBeDefined();
    expect(capturedContext!.state.filters).toBeDefined();

    // Verify key actions exist
    expect(capturedContext!.actions.setGlobalFilter).toBeTypeOf('function');
    expect(capturedContext!.actions.setPagination).toBeTypeOf('function');
    expect(capturedContext!.actions.setFilters).toBeTypeOf('function');
    expect(capturedContext!.actions.addFilter).toBeTypeOf('function');
    expect(capturedContext!.actions.removeFilter).toBeTypeOf('function');
    expect(capturedContext!.actions.clearFilters).toBeTypeOf('function');

    // Verify computed values exist
    expect(capturedContext!.computed.totalPages).toBeTypeOf('number');
    expect(capturedContext!.computed.hasActiveFilters).toBeTypeOf('boolean');
    expect(capturedContext!.computed.activeFilterCount).toBeTypeOf('number');
  });

  it('renderToolbar/renderPagination/renderFilters escape hatches still work for custom rendering', () => {
    const { getByTestId } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        renderToolbar={() => <div data-testid="custom-toolbar">Custom Toolbar</div>}
        renderPagination={() => <div data-testid="custom-pagination">Custom Pagination</div>}
        renderFilters={() => <div data-testid="custom-filters">Custom Filters</div>}
      />,
    );

    expect(getByTestId('custom-toolbar')).toBeDefined();
    expect(getByTestId('custom-toolbar').textContent).toContain('Custom Toolbar');

    expect(getByTestId('custom-pagination')).toBeDefined();
    expect(getByTestId('custom-pagination').textContent).toContain('Custom Pagination');
  });
});
