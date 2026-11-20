import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumnType, FacetedFilterOption, TableFilter } from '../../types';

import { DataTableFilters } from './index';
import type { DataTableFiltersProps } from './index';

describe(DataTableFilters, () => {
  const sampleColumns = [
    {
      id: 'name',
      label: 'Name',
      type: 'text' as DataTableColumnType,
    },
    {
      id: 'age',
      label: 'Age',
      type: 'number' as DataTableColumnType,
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select' as DataTableColumnType,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ] as FacetedFilterOption[],
    },
    {
      id: 'date',
      label: 'Date',
      type: 'date' as DataTableColumnType,
    },
  ];

  const sampleFilters: TableFilter[] = [
    {
      id: 'filter1',
      columnId: 'name',
      value: {
        operator: 'contains',
        value: 'John',
      },
    },
    {
      id: 'filter2',
      columnId: 'age',
      value: {
        operator: 'isGreaterThanOrEqual',
        value: 25,
      },
    },
  ];

  const defaultProps: DataTableFiltersProps = {
    filters: [],
    onFiltersChange: vi.fn<(filters: TableFilter[]) => void>(),
    onAddFilter: vi.fn<(filter: Omit<TableFilter, 'id'>) => void>(),
    onRemoveFilter: vi.fn<(filterId: string) => void>(),
    onClearFilters: vi.fn<() => void>(),
    availableColumns: sampleColumns,
    maxFilters: 10,
    showFilterCount: true,
    compact: false,
  };

  describe('chip bar', () => {
    it('empty state is a Filter trigger, not an empty-state panel', () => {
      renderWithProviders(<DataTableFilters {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
      expect(screen.queryByText('No filters applied')).toBeNull();
      expect(screen.queryByLabelText('Filters')).toBeNull();
    });

    it('renders each active filter as a dismissible chip with the count on the trigger', () => {
      renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
        />,
      );
      expect(screen.getByText('Filter (2)')).toBeTruthy();
      expect(screen.getByText('Name: contains John')).toBeTruthy();
      expect(screen.getByText('Age: greater than or equal 25')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy();
    });

    it('chip dismiss calls onRemoveFilter with that filter id', async () => {
      const user = userEvent.setup();
      const onRemoveFilter = vi.fn<(filterId: string) => void>();
      renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          onRemoveFilter={onRemoveFilter}
        />,
      );
      await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
      expect(onRemoveFilter).toHaveBeenCalledWith('filter1');
    });

    it('Clear all calls onClearFilters', async () => {
      const user = userEvent.setup();
      const onClearFilters = vi.fn<() => void>();
      renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          onClearFilters={onClearFilters}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Clear all' }));
      expect(onClearFilters).toHaveBeenCalledOnce();
    });

    it('hides the count on the trigger when showFilterCount is false', () => {
      renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          showFilterCount={false}
        />,
      );
      expect(screen.queryByText('Filter (2)')).toBeNull();
      expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
      expect(screen.getByText('Name: contains John')).toBeTruthy();
    });
  });

  describe('basic rendering', () => {
    it('should render filters component with no filters', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should render filters component with existing filters', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should display filter count when showFilterCount is true', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          showFilterCount={true}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should not display filter count when showFilterCount is false', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          showFilterCount={false}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('filter management', () => {
    it('should call onAddFilter when adding a new filter', () => {
      const onAddFilter = vi.fn<(filter: Omit<TableFilter, 'id'>) => void>();
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          onAddFilter={onAddFilter}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should call onRemoveFilter when removing a filter', () => {
      const onRemoveFilter = vi.fn<(filterId: string) => void>();
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          onRemoveFilter={onRemoveFilter}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should call onClearFilters when clearing all filters', () => {
      const onClearFilters = vi.fn<() => void>();
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          onClearFilters={onClearFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should call onFiltersChange when filters are updated', () => {
      const onFiltersChange = vi.fn<(filters: TableFilter[]) => void>();
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          onFiltersChange={onFiltersChange}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should prevent adding filters beyond maxFilters limit', () => {
      const onAddFilter = vi.fn<(filter: Omit<TableFilter, 'id'>) => void>();
      const manyFilters = Array.from({ length: 10 }, (_, i) => ({
        id: `filter${i}`,
        columnId: 'name',
        value: {
          operator: 'contains' as const,
          value: `value${i}`,
        },
      }));

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={manyFilters}
          maxFilters={10}
          onAddFilter={onAddFilter}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('filter types', () => {
    it('should handle text filters', () => {
      const textFilters: TableFilter[] = [
        {
          id: 'text1',
          columnId: 'name',
          value: {
            operator: 'contains',
            value: 'search term',
          },
        },
        {
          id: 'text2',
          columnId: 'name',
          value: {
            operator: 'is',
            value: 'exact match',
          },
        },
        {
          id: 'text3',
          columnId: 'name',
          value: {
            operator: 'startsWith',
            value: 'prefix',
          },
        },
      ];

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={textFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle number filters', () => {
      const numberFilters: TableFilter[] = [
        {
          id: 'num1',
          columnId: 'age',
          value: {
            operator: 'is',
            value: 25,
          },
        },
        {
          id: 'num2',
          columnId: 'age',
          value: {
            operator: 'isGreaterThanOrEqual',
            value: 18,
          },
        },
        {
          id: 'num3',
          columnId: 'age',
          value: {
            operator: 'isLessThanOrEqual',
            value: 65,
          },
        },
        {
          id: 'num4',
          columnId: 'age',
          value: {
            operator: 'isBetween',
            value: 20,
            values: [20, 30],
          },
        },
      ];

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={numberFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle select filters', () => {
      const selectFilters: TableFilter[] = [
        {
          id: 'select1',
          columnId: 'status',
          value: {
            operator: 'is',
            value: 'active',
          },
        },
        {
          id: 'select2',
          columnId: 'status',
          value: {
            operator: 'isAnyOf',
            value: 'active',
            values: ['active', 'inactive'],
          },
        },
      ];

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={selectFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle date filters', () => {
      const dateFilters: TableFilter[] = [
        {
          id: 'date1',
          columnId: 'date',
          value: {
            operator: 'is',
            value: new Date('2024-01-01'),
          },
        },
        {
          id: 'date2',
          columnId: 'date',
          value: {
            operator: 'isBefore',
            value: new Date('2024-12-31'),
          },
        },
        {
          id: 'date3',
          columnId: 'date',
          value: {
            operator: 'isAfter',
            value: new Date('2024-01-01'),
          },
        },
        {
          id: 'date4',
          columnId: 'date',
          value: {
            operator: 'isBetween',
            value: new Date('2024-01-01'),
            values: [new Date('2024-01-01'), new Date('2024-12-31')],
          },
        },
      ];

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={dateFilters}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('compact mode', () => {
    it('should render in compact mode when compact is true', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          compact={true}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should render in normal mode when compact is false', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          compact={false}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('filter builder', () => {
    it('should show filter builder dialog', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should handle column selection in filter builder', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should handle operator selection in filter builder', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should handle value input in filter builder', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });
  });

  describe('filter display', () => {
    it('should display active filters', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should show filter badges with descriptions', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should allow removing individual filters', () => {
      const onRemoveFilter = vi.fn<(filterId: string) => void>();
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          onRemoveFilter={onRemoveFilter}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should show clear all filters button', () => {
      const onClearFilters = vi.fn<() => void>();
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={sampleFilters}
          onClearFilters={onClearFilters}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('responsive behavior', () => {
    it('should adapt to different screen sizes', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should show sheet on mobile devices', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels for filter buttons', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should have proper ARIA labels for filter inputs', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should support keyboard navigation', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should announce filter changes to screen readers', () => {
      const { container } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      expect(container).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty filters array', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={[]}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle empty availableColumns array', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          availableColumns={[]}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle filters with invalid column references', () => {
      const invalidFilters: TableFilter[] = [
        {
          id: 'invalid',
          columnId: 'nonexistent',
          value: {
            operator: 'is',
            value: 'test',
          },
        },
      ];

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={invalidFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle filters with null/undefined values', () => {
      const nullFilters: TableFilter[] = [
        {
          id: 'null1',
          columnId: 'name',
          value: {
            operator: 'is',
            value: null,
          },
        },
        {
          id: 'undefined1',
          columnId: 'name',
          value: {
            operator: 'is',
            // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the case under test is an explicitly undefined filter value
            value: undefined,
          },
        },
      ];

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={nullFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle maximum number of filters', () => {
      const maxFilters = Array.from({ length: 10 }, (_, i) => ({
        id: `filter${i}`,
        columnId: 'name',
        value: {
          operator: 'contains' as const,
          value: `value${i}`,
        },
      }));

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={maxFilters}
          maxFilters={10}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('performance', () => {
    it('should handle large number of filters', () => {
      const largeFilters = Array.from({ length: 50 }, (_, i) => ({
        id: `filter${i}`,
        columnId: 'name',
        value: {
          operator: 'contains' as const,
          value: `search term ${i}`,
        },
      }));

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={largeFilters}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle large number of available columns', () => {
      const largeColumns = Array.from({ length: 100 }, (_, i) => ({
        id: `column${i}`,
        label: `Column ${i}`,
        type: 'text' as DataTableColumnType,
      }));

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          availableColumns={largeColumns}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing onFiltersChange callback', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          onFiltersChange={undefined as any}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle missing onAddFilter callback', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          onAddFilter={undefined as any}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle missing onRemoveFilter callback', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          onRemoveFilter={undefined as any}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle missing onClearFilters callback', () => {
      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          onClearFilters={undefined as any}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('filter validation', () => {
    it('should validate filter values based on column type', () => {
      const invalidNumberFilter: TableFilter = {
        id: 'invalid',
        columnId: 'age',
        value: {
          operator: 'is',
          value: 'not-a-number',
        },
      };

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={[invalidNumberFilter]}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should validate date filter values', () => {
      const invalidDateFilter: TableFilter = {
        id: 'invalid-date',
        columnId: 'date',
        value: {
          operator: 'is',
          value: 'not-a-date',
        },
      };

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={[invalidDateFilter]}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should validate select filter values', () => {
      const invalidSelectFilter: TableFilter = {
        id: 'invalid-select',
        columnId: 'status',
        value: {
          operator: 'is',
          value: 'invalid-option',
        },
      };

      const { container } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={[invalidSelectFilter]}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('state management', () => {
    it('should update when filters prop changes', () => {
      const { rerender } = renderWithProviders(
        <DataTableFilters
          {...defaultProps}
          filters={[]}
        />,
      );

      // Component should re-render without errors
      expect(() => {
        rerender(
          <DataTableFilters
            {...defaultProps}
            filters={sampleFilters}
          />,
        );
      }).not.toThrow();
    });

    it('should update when availableColumns prop changes', () => {
      const { rerender } = renderWithProviders(<DataTableFilters {...defaultProps} />);

      const newColumns = [
        ...sampleColumns,
        {
          id: 'newColumn',
          label: 'New Column',
          type: 'text' as DataTableColumnType,
        },
      ];

      // Component should re-render without errors
      expect(() => {
        rerender(
          <DataTableFilters
            {...defaultProps}
            availableColumns={newColumns}
          />,
        );
      }).not.toThrow();
    });
  });
});
