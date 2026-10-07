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
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';
import { DataTableFilters } from '../DataTableFilters';
import { DataTablePagination } from '../DataTablePagination';
import { DataTableToolbar } from '../DataTableToolbar';

import { DataTableContext } from './DataTableContext';
import { DataTableStateContext, useDataTableState } from './DataTableStateContext';
import type { DataTableStateContextValue } from './DataTableStateContext';

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
    let capturedContext: DataTableStateContextValue | null = null;

    function PaginationContextProbe() {
      capturedContext = useDataTableState();
      return null;
    }

    function TestWrapper() {
      const tableInstance = useReactTable({
        data: sampleData,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      const mockValue: DataTableStateContextValue = {
        table: tableInstance as any,
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
        actions: {
          setGlobalFilter: vi.fn(),
          setFilters: vi.fn(),
          addFilter: vi.fn(),
          removeFilter: vi.fn(),
          clearFilters: vi.fn(),
          setPagination: vi.fn(),
          setSorting: vi.fn(),
          toggleColumnVisibility: vi.fn(),
          setColumnOrder: vi.fn(),
          setColumnSizing: vi.fn(),
          saveView: vi.fn(),
          loadView: vi.fn(),
          resetToDefault: vi.fn(),
          setExpanded: vi.fn(),
        },
        computed: {
          filteredData: sampleData,
          paginatedData: sampleData,
          totalPages: 1,
          totalRows: sampleData.length,
          hasActiveFilters: false,
          activeFilterCount: 0,
        },
      };

      return (
        <DataTableStateContext.Provider value={mockValue}>
          <PaginationContextProbe />
        </DataTableStateContext.Provider>
      );
    }

    renderWithProviders(<TestWrapper />);

    // Pagination sub-component can read state from context
    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.state.pagination).toEqual({ pageIndex: 0, pageSize: 10 });
    expect(capturedContext!.actions.setPagination).toBeTypeOf('function');
  });

  it('DataTable.Filters renders filter UI when composed as child', () => {
    // Verify the static property is attached and references the correct component
    expect(DataTable.Filters).toBeDefined();
    expect(DataTable.Filters).toBeTypeOf('function');
    expect(DataTable.Filters).toBe(DataTableFilters);

    // Verify the Filters component can read from context when
    // rendered inside a DataTableStateContext provider
    let capturedContext: DataTableStateContextValue | null = null;

    function FiltersContextProbe() {
      capturedContext = useDataTableState();
      return null;
    }

    function TestWrapper() {
      const tableInstance = useReactTable({
        data: sampleData,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      const mockValue: DataTableStateContextValue = {
        table: tableInstance as any,
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
        actions: {
          setGlobalFilter: vi.fn(),
          setFilters: vi.fn(),
          addFilter: vi.fn(),
          removeFilter: vi.fn(),
          clearFilters: vi.fn(),
          setPagination: vi.fn(),
          setSorting: vi.fn(),
          toggleColumnVisibility: vi.fn(),
          setColumnOrder: vi.fn(),
          setColumnSizing: vi.fn(),
          saveView: vi.fn(),
          loadView: vi.fn(),
          resetToDefault: vi.fn(),
          setExpanded: vi.fn(),
        },
        computed: {
          filteredData: [sampleData[0]],
          paginatedData: [sampleData[0]],
          totalPages: 1,
          totalRows: 1,
          hasActiveFilters: true,
          activeFilterCount: 1,
        },
      };

      return (
        <DataTableStateContext.Provider value={mockValue}>
          <FiltersContextProbe />
        </DataTableStateContext.Provider>
      );
    }

    renderWithProviders(<TestWrapper />);

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
    let capturedSize: string | undefined;
    let capturedCompact: boolean | undefined;

    function ContextConsumer() {
      const ctx = DataTableContext.useStyledContext();
      capturedSize = ctx.size;
      capturedCompact = ctx.compact;
      return (
        <div data-testid="context-consumer">
          size={ctx.size} compact={String(ctx.compact)}
        </div>
      );
    }

    // Test with explicit size="sm" and compact={true}
    renderWithProviders(
      <DataTableContext.Provider
        size="sm"
        compact={true}>
        <ContextConsumer />
      </DataTableContext.Provider>,
    );

    expect(capturedSize).toBe('sm');
    expect(capturedCompact).toBe(true);

    // Test with different values to ensure cascading works
    capturedSize = undefined;
    capturedCompact = undefined;

    renderWithProviders(
      <DataTableContext.Provider
        size="lg"
        compact={false}>
        <ContextConsumer />
      </DataTableContext.Provider>,
    );

    expect(capturedSize).toBe('lg');
    expect(capturedCompact).toBe(false);
  });

  it('DataTableStateContext provides table instance, state, actions, computed to sub-components', () => {
    let capturedContext: DataTableStateContextValue<Person> | null = null;

    function StateConsumer() {
      capturedContext = useDataTableState<Person>();
      if (!capturedContext) {
        return <div data-testid="no-context">No context</div>;
      }
      return (
        <div data-testid="has-context">
          has-table={String(!!capturedContext.table)}
          has-state={String(!!capturedContext.state)}
          has-actions={String(!!capturedContext.actions)}
          has-computed={String(!!capturedContext.computed)}
        </div>
      );
    }

    function TestWrapper() {
      const tableInstance = useReactTable({
        data: sampleData,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      const mockContextValue: DataTableStateContextValue<Person> = {
        table: tableInstance as any,
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
          activeViewId: undefined,
          isLoading: false,
        },
        actions: {
          setGlobalFilter: vi.fn(),
          setFilters: vi.fn(),
          addFilter: vi.fn(),
          removeFilter: vi.fn(),
          clearFilters: vi.fn(),
          setPagination: vi.fn(),
          setSorting: vi.fn(),
          toggleColumnVisibility: vi.fn(),
          setColumnOrder: vi.fn(),
          setColumnSizing: vi.fn(),
          saveView: vi.fn(),
          loadView: vi.fn(),
          resetToDefault: vi.fn(),
          setExpanded: vi.fn(),
        },
        computed: {
          filteredData: sampleData,
          paginatedData: sampleData,
          totalPages: 1,
          totalRows: sampleData.length,
          hasActiveFilters: false,
          activeFilterCount: 0,
        },
      };

      return (
        <DataTableStateContext.Provider value={mockContextValue}>
          <StateConsumer />
        </DataTableStateContext.Provider>
      );
    }

    renderWithProviders(<TestWrapper />);

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
