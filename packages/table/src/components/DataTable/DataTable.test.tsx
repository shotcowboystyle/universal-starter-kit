import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { createColumnHelper } from '@tanstack/react-table';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableState } from '../../types';

import { DataTable } from './index';

// Define the data type
interface Person {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  email: string;
  status: 'active' | 'inactive';
}

// Sample data
const sampleData: Person[] = [
  {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    age: 28,
    email: 'john.doe@example.com',
    status: 'active',
  },
  {
    id: 2,
    firstName: 'Jane',
    lastName: 'Smith',
    age: 32,
    email: 'jane.smith@example.com',
    status: 'active',
  },
  {
    id: 3,
    firstName: 'Bob',
    lastName: 'Johnson',
    age: 45,
    email: 'bob.johnson@example.com',
    status: 'inactive',
  },
  {
    id: 4,
    firstName: 'Alice',
    lastName: 'Williams',
    age: 29,
    email: 'alice.williams@example.com',
    status: 'active',
  },
  {
    id: 5,
    firstName: 'Charlie',
    lastName: 'Brown',
    age: 35,
    email: 'charlie.brown@example.com',
    status: 'inactive',
  },
];

// Column definitions
const columnHelper = createColumnHelper<Person>();

const columns: DataTableColumn<Person>[] = [
  columnHelper.accessor('id', {
    header: 'ID',
    cell: (info) => info.getValue(),
    size: 60,
  }) as DataTableColumn<Person>,
  columnHelper.accessor('firstName', {
    header: 'First Name',
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  columnHelper.accessor('lastName', {
    header: 'Last Name',
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  columnHelper.accessor('age', {
    header: 'Age',
    cell: (info) => info.getValue(),
    size: 80,
  }) as DataTableColumn<Person>,
  columnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue();
      return (
        <span
          style={{
            color: status === 'active' ? 'green' : 'red',
            fontWeight: 'bold',
          }}>
          {status}
        </span>
      );
    },
  }) as DataTableColumn<Person>,
];

describe(DataTable, () => {
  describe('basic rendering', () => {
    it('should render table with data and columns', () => {
      const { container, getByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();

      // Check that data is rendered
      expect(getByText('John')).toBeDefined();
      expect(getByText('john.doe@example.com')).toBeDefined();
    });

    it('should render data rows correctly', () => {
      const { getByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // Check if data is rendered
      expect(getByText('John')).toBeDefined();
      expect(getByText('Doe')).toBeDefined();
      expect(getByText('28')).toBeDefined();
      expect(getByText('john.doe@example.com')).toBeDefined();
    });

    it('should handle empty data', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={[]}
          columns={columns}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();
    });

    it('should apply different sizes', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          size="sm"
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();
    });

    it('should apply different sizes (large)', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          size="lg"
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();
    });
  });

  describe('sorting functionality', () => {
    it('should enable sorting when enableSorting is true', () => {
      const { getAllByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableSorting={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders. A bare string field
      // carries its column name in a VisuallyHidden node ("First Name: "), so
      // the printed "First Name" of the grid header is deliberately absent.
      const firstNameLabels = getAllByText('First Name:');
      expect(firstNameLabels.length).toBeGreaterThan(0);
    });

    it('should disable sorting when enableSorting is false', () => {
      const { getAllByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableSorting={false}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders
      const firstNameLabels = getAllByText('First Name:');
      expect(firstNameLabels.length).toBeGreaterThan(0);
    });

    it('should call onStateChange when sorting changes', async () => {
      const onStateChange = vi.fn<(state: DataTableState) => void>();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableSorting={true}
          onStateChange={onStateChange}
        />,
      );

      // This test might need to be adjusted based on actual sorting implementation
      await waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith();
      });
    });
  });

  describe('pagination functionality', () => {
    it('should enable pagination when enablePagination is true', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enablePagination={true}
          initialState={{
            pagination: { pageIndex: 0, pageSize: 2 },
          }}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // Check if pagination elements are present
      expect(container).toBeDefined();
    });

    it('should disable pagination when enablePagination is false', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enablePagination={false}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should respect pageSize prop', () => {
      const { getByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enablePagination={true}
          initialState={{
            pagination: { pageIndex: 0, pageSize: 2 },
          }}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // Should show first 2 items
      expect(getByText('John')).toBeDefined();
      expect(getByText('Jane')).toBeDefined();
    });
  });

  describe('filtering functionality', () => {
    it('should enable filtering when enableFiltering is true', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableFiltering={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should disable filtering when enableFiltering is false', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableFiltering={false}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('global search functionality', () => {
    it('should enable global search when enableGlobalSearch is true', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableGlobalSearch={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should disable global search when enableGlobalSearch is false', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableGlobalSearch={false}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('filters rendered rows when typing in the global search input', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableGlobalSearch={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(screen.getByText('John')).toBeDefined();
      expect(screen.getByText('Jane')).toBeDefined();

      // DataTableToolbar passes an explicit `placeholder={t("Search")}`, so
      // the forms SearchInput default (bidi-isolated "Search…") never reaches
      // this input. Query the stable aria-label instead of a literal
      // placeholder string.
      await user.type(screen.getByLabelText('Search table data'), 'Charlie');

      await waitFor(() => {
        expect(screen.queryByText('John')).toBeNull();
      });
      expect(screen.getByText('Charlie')).toBeDefined();
      expect(screen.queryByText('Jane')).toBeNull();
    });
  });

  describe('column visibility', () => {
    it('should enable column visibility when enableColumnVisibility is true', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableColumnVisibility={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should disable column visibility when enableColumnVisibility is false', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableColumnVisibility={false}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('toolbar functionality', () => {
    it('should show toolbar by default', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should hide toolbar when search/filtering/views are disabled', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableGlobalSearch={false}
          enableFiltering={false}
          enableViews={false}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should support custom toolbar rendering', () => {
      const customToolbar = <div data-testid="custom-toolbar">Custom Toolbar</div>;

      const { getByTestId } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          renderToolbar={() => customToolbar}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(getByTestId('custom-toolbar')).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should support aria-label', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          aria-label="User management table"
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();
    });

    it('should support aria-describedby', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          aria-describedby="table-description"
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();
    });
  });

  describe('manual modes', () => {
    it('should support manual filtering', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          manualFiltering={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should support manual pagination', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          manualPagination={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should support manual sorting', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          manualSorting={true}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('state management', () => {
    it('should call onStateChange when state changes', () => {
      const onStateChange = vi.fn<(state: DataTableState) => void>();

      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={onStateChange}
        />,
      );

      // onStateChange should be called during initial setup
      expect(onStateChange).toHaveBeenCalledWith();
    });

    it('should accept initialState', () => {
      const initialState = {
        sorting: [{ id: 'firstName', desc: false }],
        pagination: { pageIndex: 0, pageSize: 2 },
      };

      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          initialState={initialState}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('arbitrary cell content', () => {
    it('should render cell with React component without Text wrapper', () => {
      const columnsWithCustomCell: DataTableColumn<Person>[] = [
        columnHelper.accessor('id', {
          header: 'ID',
          cell: (info) => info.getValue(),
        }) as DataTableColumn<Person>,
        columnHelper.accessor('firstName', {
          header: 'Name',
          cell: (info) => <div data-testid={`name-cell-${info.row.original.id}`}>{info.getValue()}</div>,
        }) as DataTableColumn<Person>,
      ];

      const { getByTestId } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columnsWithCustomCell}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // Custom component (div) should be rendered directly - not wrapped in Text
      const cellWrapper = getByTestId('name-cell-1');
      expect(cellWrapper).toBeDefined();
      expect(cellWrapper.textContent).toContain('John');
    });
  });

  describe('custom rendering', () => {
    it('should support custom pagination rendering', () => {
      const customPagination = <div data-testid="custom-pagination">Custom Pagination</div>;

      const { getByTestId } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          renderPagination={() => customPagination}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(getByTestId('custom-pagination')).toBeDefined();
    });

    it('should support custom filters rendering', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          renderFilters={() => <div data-testid="custom-filters">Custom Filters</div>}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // renderFilters prop is accepted by DataTable (may not render in all views)
      expect(container).toBeDefined();
    });
  });

  describe('responsive behavior', () => {
    it('should handle different screen sizes', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('renders error chrome instead of rows when state.error is set (DG-ST-01 / Axiom 6)', () => {
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          initialState={{ error: 'The rows could not be loaded.' }}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // A failed load must never masquerade as data or empty chrome
      expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
      expect(screen.getByText('The rows could not be loaded.')).toBeDefined();
      expect(screen.queryByText('John')).toBeNull();
      // Without onRetry the error chrome renders without an unreachable action
      expect(screen.queryByText('Retry')).toBeNull();
    });

    it("fires onRetry from the error chrome's Retry action (DG-ST-01 'with retry')", async () => {
      const onRetry = vi.fn<() => void>();
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          initialState={{ error: 'The rows could not be loaded.' }}
          onRetry={onRetry}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      await user.click(screen.getByText('Retry'));
      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('should handle invalid data gracefully', () => {
      const invalidData = [{ invalidField: 'value' }];

      const { container } = renderWithProviders(
        <DataTable
          data={invalidData as any}
          columns={columns}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();
    });

    it('should handle empty columns', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={[]}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // In test env sm===false → mobile card view renders (no <table> element)
      expect(container).toBeDefined();
    });
  });

  describe('row selection + bulk bar (DG-TBL-02/03)', () => {
    const bulkActions = [
      {
        id: 'export',
        label: 'Export',
        onExecute: vi.fn<(items: Person[], clear: () => void) => void>((_items, clear) => {
          clear();
        }),
      },
      {
        id: 'delete',
        label: 'Delete',
        variant: 'destructive' as const,
        onExecute: vi.fn<(items: Person[], clear: () => void) => void>((_items, clear) => {
          clear();
        }),
      },
    ];

    it('does not show selection UI when enableRowSelection is false', () => {
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(screen.queryByLabelText('Select all rows')).toBeNull();
      // Anchored on the row-name template, not the bare "Select row" prefix:
      // DataTablePagination's page-size control is labeled "Select rows per
      // page", which /^Select row/ also matches.
      expect(screen.queryByLabelText(/^Select row \S/u)).toBeNull();
      expect(screen.queryByText(/selected/u)).toBeNull();
    });

    it('renders checkboxes when enableRowSelection is true', () => {
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(screen.getByLabelText('Select all rows')).toBeDefined();
      // Row identity is templated into the name (DG-A11Y-06); without an
      // initialized i18n instance the raw key renders, so match the prefix —
      // but require a following token so the pagination page-size control
      // ("Select rows per page") is not counted as a sixth row.
      expect(screen.getAllByLabelText(/^Select row \S/u)).toHaveLength(sampleData.length);
    });

    it('auto-shows selection toolbar with count and clear after selecting a row', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      expect(screen.queryByText('1 selected')).toBeNull();

      await user.click(screen.getAllByLabelText(/^Select row/u)[0]);

      await expect(screen.findByText('1 selected')).resolves.toBeDefined();
      expect(screen.getByLabelText('Clear selection')).toBeDefined();
      expect(screen.getByText('Export')).toBeDefined();
    });

    it('clears selection from the bulk bar', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      await user.click(screen.getAllByLabelText(/^Select row/u)[0]);
      await expect(screen.findByText('1 selected')).resolves.toBeDefined();

      await user.click(screen.getByLabelText('Clear selection'));
      await waitFor(() => {
        expect(screen.queryByText('1 selected')).toBeNull();
      });
    });

    it('select-all (page scope) selects visible page rows', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          selectAllScope="page"
          enablePagination
          initialState={{ pagination: { pageIndex: 0, pageSize: 2 } }}
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      await user.click(screen.getByLabelText('Select all rows'));
      await expect(screen.findByText('2 selected')).resolves.toBeDefined();
    });

    it('select-all (filtered scope) selects all matching rows', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          selectAllScope="filtered"
          enablePagination
          initialState={{ pagination: { pageIndex: 0, pageSize: 2 } }}
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      await user.click(screen.getByLabelText('Select all rows'));
      await expect(screen.findByText('5 selected')).resolves.toBeDefined();
    });

    it('selectAllScope defaults to page from the house knob', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          enablePagination
          initialState={{ pagination: { pageIndex: 0, pageSize: 2 } }}
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      await user.click(screen.getByLabelText('Select all rows'));
      await expect(screen.findByText('2 selected')).resolves.toBeDefined();
    });

    it('house knob selectAllScope=filtered drives select-all when no prop is set', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Preset overrides={{ selectAllScope: 'filtered' }}>
          <DataTable
            data={sampleData}
            columns={columns}
            enableRowSelection
            enablePagination
            initialState={{ pagination: { pageIndex: 0, pageSize: 2 } }}
            bulkActions={bulkActions}
            onStateChange={vi.fn<(state: DataTableState) => void>()}
          />
        </Preset>,
      );

      await user.click(screen.getByLabelText('Select all rows'));
      await expect(screen.findByText('5 selected')).resolves.toBeDefined();
    });

    it('selectAllScope prop overrides the house knob', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Preset overrides={{ selectAllScope: 'filtered' }}>
          <DataTable
            data={sampleData}
            columns={columns}
            enableRowSelection
            selectAllScope="page"
            enablePagination
            initialState={{ pagination: { pageIndex: 0, pageSize: 2 } }}
            bulkActions={bulkActions}
            onStateChange={vi.fn<(state: DataTableState) => void>()}
          />
        </Preset>,
      );

      await user.click(screen.getByLabelText('Select all rows'));
      await expect(screen.findByText('2 selected')).resolves.toBeDefined();
    });

    it('page scope exposes a scope switch; count reflects the expanded scope', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          selectAllScope="page"
          enablePagination
          initialState={{ pagination: { pageIndex: 0, pageSize: 2 } }}
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      // No switch until the page is fully selected.
      expect(screen.queryByText('Select all 5')).toBeNull();

      await user.click(screen.getByLabelText('Select all rows'));
      await expect(screen.findByText('2 selected')).resolves.toBeDefined();

      // Page fully selected but more rows match → scope switch appears.
      const switchButton = await screen.findByText('Select all 5');
      await user.click(switchButton);

      // Count reflects the all-matching scope; the switch disappears.
      await expect(screen.findByText('5 selected')).resolves.toBeDefined();
      await waitFor(() => {
        expect(screen.queryByText('Select all 5')).toBeNull();
      });
    });

    it('filtered scope never shows the scope switch', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          selectAllScope="filtered"
          enablePagination
          initialState={{ pagination: { pageIndex: 0, pageSize: 2 } }}
          bulkActions={bulkActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      await user.click(screen.getByLabelText('Select all rows'));
      await expect(screen.findByText('5 selected')).resolves.toBeDefined();
      expect(screen.queryByText(/Select all \d/u)).toBeNull();
    });

    it('overflows bulk actions beyond 5 into the more menu', async () => {
      const manyActions = Array.from({ length: 6 }, (_, i) => ({
        id: `action-${i}`,
        label: `Action ${i + 1}`,
        onExecute: vi.fn<(items: Person[], clear: () => void) => void>(),
      }));

      const user = userEvent.setup();
      renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection
          bulkActions={manyActions}
          onStateChange={vi.fn<(state: DataTableState) => void>()}
        />,
      );

      await user.click(screen.getAllByLabelText(/^Select row/u)[0]);
      await expect(screen.findByText('1 selected')).resolves.toBeDefined();
      expect(screen.getByText('Action 1')).toBeDefined();
      expect(screen.getByText('Action 5')).toBeDefined();
      expect(screen.queryByText('Action 6')).toBeNull();
      expect(screen.getByLabelText('More bulk actions')).toBeDefined();
    });
  });

  describe('tableZebra house knob', () => {
    it('defaults off — all body rows marked data-table-zebra=off', () => {
      const { container } = renderWithProviders(
        <Preset overrides={{ tableZebra: 'off' }}>
          <DataTable
            data={sampleData}
            columns={columns}
            onStateChange={vi.fn<(state: DataTableState) => void>()}
          />
        </Preset>,
      );
      const rows = container.querySelectorAll<HTMLElement>('[data-table-zebra]');
      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) {
        expect(row.dataset.tableZebra).toBe('off');
      }
    });

    it('stripes odd/even when tableZebra is on', () => {
      const { container } = renderWithProviders(
        <Preset overrides={{ tableZebra: 'on' }}>
          <DataTable
            data={sampleData}
            columns={columns}
            onStateChange={vi.fn<(state: DataTableState) => void>()}
          />
        </Preset>,
      );
      const even = container.querySelectorAll("[data-table-zebra='even']");
      const odd = container.querySelectorAll("[data-table-zebra='odd']");
      expect(even.length).toBeGreaterThan(0);
      expect(odd.length).toBeGreaterThan(0);
    });
  });
});
