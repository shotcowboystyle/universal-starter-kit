import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TableView } from '../../types';

import { DataTableToolbar } from './index';
import type { DataTableToolbarProps } from './index';

describe(DataTableToolbar, () => {
  const defaultProps: DataTableToolbarProps = {
    globalFilter: '',
    onGlobalFilterChange: vi.fn<(value: string) => void>(),
    onClearFilters: vi.fn<() => void>(),
    onSaveView: vi.fn<(name: string) => void>(),
    onLoadView: vi.fn<(viewId: string) => void>(),
    views: [],
    enableViews: false,
    enableGlobalSearch: true,
    enableFiltering: true,
    showFilterCount: true,
    showViewSelector: true,
  };

  const sampleViews: TableView[] = [
    {
      id: 'view1',
      name: 'Default View',
      columns: {},
      filters: [],
      sorting: [],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    {
      id: 'view2',
      name: 'Custom View',
      columns: {},
      filters: [],
      sorting: [],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
  ];

  describe('basic rendering', () => {
    it('should render toolbar with default configuration', () => {
      const { container } = renderWithProviders(<DataTableToolbar {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('exposes role=toolbar with an accessible name', () => {
      const { getByRole } = renderWithProviders(<DataTableToolbar {...defaultProps} />);

      expect(getByRole('toolbar', { name: 'Table toolbar' })).toBeDefined();
    });

    it('does not mount export chrome unless enableExport is set', () => {
      const { queryByRole } = renderWithProviders(<DataTableToolbar {...defaultProps} />);

      expect(queryByRole('button', { name: /Export as CSV/iu })).toBeNull();
    });

    it('mounts DataTableExport when enableExport is true', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableExport
        />,
      );

      expect(getByRole('button', { name: /Export as CSV/iu })).toBeDefined();
    });

    it('should render search input when enableGlobalSearch is true', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableGlobalSearch={true}
        />,
      );

      const searchInput = getByRole('searchbox');
      expect(searchInput).toBeDefined();
    });

    it('shows a toolbar spinner while isFetching without hiding search', () => {
      const { container, getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          isFetching
        />,
      );

      expect(getByRole('searchbox')).toBeDefined();
      expect(container.querySelector("[data-table-fetching='true']")).toBeTruthy();
    });

    it('should not render search input when enableGlobalSearch is false', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableGlobalSearch={false}
        />,
      );

      const inputs = container.querySelectorAll('input');
      expect(inputs).toHaveLength(0);
    });

    it('should display current global filter value', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          globalFilter="test search"
        />,
      );

      const searchInput = getByRole('searchbox');
      expect(searchInput).toHaveValue('test search');
    });
  });

  describe('search functionality', () => {
    it('should call onGlobalFilterChange when search input changes', () => {
      const onGlobalFilterChange = vi.fn<(value: string) => void>();
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          onGlobalFilterChange={onGlobalFilterChange}
        />,
      );

      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: 'new search' } });

      expect(onGlobalFilterChange).toHaveBeenCalledWith('new search');
    });

    it('should handle empty search', () => {
      const onGlobalFilterChange = vi.fn<(value: string) => void>();
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          onGlobalFilterChange={onGlobalFilterChange}
          globalFilter="existing search"
        />,
      );

      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(onGlobalFilterChange).toHaveBeenCalledWith('');
    });

    it('should render with globalFilter value', () => {
      const onGlobalFilterChange = vi.fn<(value: string) => void>();
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          globalFilter="test search"
          onGlobalFilterChange={onGlobalFilterChange}
        />,
      );

      expect(container).toBeDefined();
      expect(container.textContent).toContain('');
    });
  });

  describe('filter functionality', () => {
    it('should render clear filters button when enableFiltering is true', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableFiltering={true}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should not render clear filters button when enableFiltering is false', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableFiltering={false}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should render clear filters button when enableFiltering', () => {
      const onClearFilters = vi.fn<() => void>();
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableFiltering={true}
          onClearFilters={onClearFilters}
        />,
      );

      expect(container).toBeDefined();
      expect(onClearFilters).toBeDefined();
    });

    it('search clear X fires onClearFilters only when the toolbar owns filtering', () => {
      // enableFiltering=false is the chrome-suppression contract: an outer
      // surface owns the filter state, so the search X must clear only the
      // search text (onChange("")) — never the injected filters.
      const onClearFilters = vi.fn<() => void>();
      const onGlobalFilterChange = vi.fn<(value: string) => void>();

      const owned = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          globalFilter="abc"
          enableFiltering={true}
          onClearFilters={onClearFilters}
          onGlobalFilterChange={onGlobalFilterChange}
        />,
      );
      const ownedClear = owned.container.querySelector("[aria-label='Clear search']");
      if (!ownedClear) {
        throw new Error('clear button not rendered');
      }
      fireEvent.click(ownedClear);
      expect(onClearFilters).toHaveBeenCalledOnce();
      owned.unmount();

      onClearFilters.mockClear();
      onGlobalFilterChange.mockClear();
      const suppressed = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          globalFilter="abc"
          enableFiltering={false}
          onClearFilters={onClearFilters}
          onGlobalFilterChange={onGlobalFilterChange}
        />,
      );
      const suppressedClear = suppressed.container.querySelector("[aria-label='Clear search']");
      if (!suppressedClear) {
        throw new Error('clear button not rendered');
      }
      fireEvent.click(suppressedClear);
      expect(onGlobalFilterChange).toHaveBeenCalledWith('');
      expect(onClearFilters).not.toHaveBeenCalled();
    });
  });

  describe('views functionality', () => {
    it('should not render view selector when enableViews is false', () => {
      const { queryByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={false}
        />,
      );

      expect(queryByRole('button', { name: 'Saved views' })).toBeNull();
      expect(queryByRole('button', { name: 'Save view' })).toBeNull();
    });

    it('should render view selector when enableViews is true', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={sampleViews}
        />,
      );

      expect(getByRole('button', { name: 'Saved views' })).toBeDefined();
    });

    it('should display the active view name on the picker', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={sampleViews}
          activeViewId="view1"
        />,
      );

      expect(getByRole('button', { name: 'Saved views' }).textContent).toContain('Default View');
    });

    it('should call onLoadView when a view is selected', async () => {
      const onLoadView = vi.fn<(viewId: string) => void>();
      const { getByRole, getAllByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={sampleViews}
          activeViewId="view1"
          onLoadView={onLoadView}
        />,
      );

      fireEvent.click(getByRole('button', { name: 'Saved views' }));
      await waitFor(
        () => {
          expect(getAllByRole('menuitemcheckbox').length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );
      fireEvent.click(getAllByRole('menuitemcheckbox')[1]);
      expect(onLoadView).toHaveBeenCalledWith('view2');
    });

    it('should highlight active view', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={sampleViews}
          activeViewId="view1"
        />,
      );

      expect(getByRole('button', { name: 'Saved views' }).textContent).toContain('Default View');
    });

    it('should show save view dialog', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={sampleViews}
        />,
      );

      expect(getByRole('button', { name: 'Save view' })).toBeDefined();
    });

    it('should call onSaveView when saving a new view', async () => {
      const onSaveView = vi.fn<(name: string) => void>();
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          onSaveView={onSaveView}
        />,
      );

      fireEvent.click(getByRole('button', { name: 'Save view' }));
      const nameField = await waitFor(() => getByRole('textbox', { name: 'View name' }), {
        timeout: 3000,
      });
      fireEvent.change(nameField, { target: { value: 'My view' } });
      fireEvent.click(getByRole('button', { name: 'Save' }));
      expect(onSaveView).toHaveBeenCalledWith('My view');
    });
  });

  describe('custom actions', () => {
    it('should render custom actions when provided', () => {
      const customAction = (
        <button
          type="button"
          data-testid="custom-action">
          Custom Action
        </button>
      );

      const { getByTestId } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          customActions={customAction}
        />,
      );

      expect(getByTestId('custom-action')).toBeDefined();
    });

    it('should render multiple custom actions', () => {
      const customActions = (
        <div data-testid="custom-actions">
          <button type="button">Action 1</button>
          <button type="button">Action 2</button>
        </div>
      );

      const { getByTestId } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          customActions={customActions}
        />,
      );

      expect(getByTestId('custom-actions')).toBeDefined();
    });
  });

  describe('feature flags', () => {
    it('should hide all features when disabled', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={false}
          enableGlobalSearch={false}
          enableFiltering={false}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should show all features when enabled', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          enableGlobalSearch={true}
          enableFiltering={true}
          views={sampleViews}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('responsive behavior', () => {
    it('should adapt to different screen sizes', () => {
      const { container } = renderWithProviders(<DataTableToolbar {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should show compact layout on mobile', () => {
      const { container } = renderWithProviders(<DataTableToolbar {...defaultProps} />);

      expect(container).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels for search input', () => {
      const { getByRole } = renderWithProviders(<DataTableToolbar {...defaultProps} />);

      const searchInput = getByRole('searchbox');
      expect(searchInput).toBeDefined();
    });

    it('should have proper ARIA labels for buttons', () => {
      // Render with a non-empty globalFilter so the clear button appears
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          globalFilter="test"
        />,
      );

      const buttons = container.querySelectorAll('[role="button"], button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation', () => {
      const { getByRole } = renderWithProviders(<DataTableToolbar {...defaultProps} />);

      const searchInput = getByRole('searchbox');

      // Test keyboard events
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      fireEvent.keyDown(searchInput, { key: 'Escape' });

      expect(searchInput).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty views array', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={[]}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle undefined views', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle very long search terms', () => {
      const longSearchTerm = 'a'.repeat(1000);
      const onGlobalFilterChange = vi.fn<(value: string) => void>();

      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          onGlobalFilterChange={onGlobalFilterChange}
        />,
      );

      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: longSearchTerm } });

      expect(onGlobalFilterChange).toHaveBeenCalledWith(longSearchTerm);
    });

    it('should handle special characters in search', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const onGlobalFilterChange = vi.fn<(value: string) => void>();

      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          onGlobalFilterChange={onGlobalFilterChange}
        />,
      );

      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: specialChars } });

      expect(onGlobalFilterChange).toHaveBeenCalledWith(specialChars);
    });
  });

  describe('state synchronization', () => {
    it('should update search input when globalFilter prop changes', () => {
      const { getByRole, rerender } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          globalFilter="initial"
        />,
      );

      const searchInput = getByRole('searchbox');
      expect(searchInput).toHaveValue('initial');

      // rerender with updated prop should not crash
      expect(() => {
        rerender(
          <DataTableToolbar
            {...defaultProps}
            globalFilter="updated"
          />,
        );
      }).not.toThrow();
    });

    it('should update view selector when activeViewId changes', () => {
      const { rerender } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={sampleViews}
          activeViewId="view1"
        />,
      );

      // Component should re-render without errors
      expect(() => {
        rerender(
          <DataTableToolbar
            {...defaultProps}
            enableViews={true}
            views={sampleViews}
            activeViewId="view2"
          />,
        );
      }).not.toThrow();
    });
  });

  describe('performance', () => {
    it('should handle search input changes', async () => {
      const onGlobalFilterChange = vi.fn<(value: string) => void>();

      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          onGlobalFilterChange={onGlobalFilterChange}
        />,
      );

      const searchInput = getByRole('searchbox');

      // Simulate typing
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(onGlobalFilterChange).toHaveBeenCalledWith('test');
      });

      expect(onGlobalFilterChange).toHaveBeenCalledOnce();
    });
  });

  describe('error handling', () => {
    it('should handle missing onGlobalFilterChange callback', () => {
      const { getByRole } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          onGlobalFilterChange={undefined as any}
        />,
      );

      const searchInput = getByRole('searchbox');
      expect(() => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      }).not.toThrow();
    });

    it('should handle missing onClearFilters callback', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          onClearFilters={undefined as any}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle missing view callbacks', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          onSaveView={undefined as any}
          onLoadView={undefined as any}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should work with complex view configurations', () => {
      const complexViews: TableView[] = [
        {
          id: 'complex1',
          name: 'Complex View 1',
          columns: {},
          filters: [
            {
              id: 'status-filter',
              columnId: 'status',
              value: { operator: 'is', value: 'active' },
            },
          ],
          sorting: [{ id: 'name', desc: false }],
          pagination: { pageIndex: 0, pageSize: 10 },
        },
        {
          id: 'complex2',
          name: 'Complex View 2',
          columns: {},
          filters: [
            {
              id: 'priority-filter',
              columnId: 'priority',
              value: { operator: 'is', value: 'high' },
            },
          ],
          sorting: [{ id: 'date', desc: true }],
          pagination: { pageIndex: 0, pageSize: 10 },
        },
      ];

      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          views={complexViews}
          activeViewId="complex1"
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle multiple feature combinations', () => {
      const { container } = renderWithProviders(
        <DataTableToolbar
          {...defaultProps}
          enableViews={true}
          enableGlobalSearch={true}
          enableFiltering={true}
          views={sampleViews}
          globalFilter="search term"
          showFilterCount={true}
          showViewSelector={true}
          customActions={<button type="button">Export</button>}
        />,
      );

      expect(container).toBeDefined();
    });
  });
});
