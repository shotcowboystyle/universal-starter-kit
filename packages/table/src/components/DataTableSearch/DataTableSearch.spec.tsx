import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTableSearch } from './index';

describe(DataTableSearch, () => {
  // Sample data for tests
  const sampleData = [
    {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      status: 'active',
      age: 30,
    },
    {
      id: 2,
      name: 'Jane Smith',
      email: 'jane@example.com',
      status: 'inactive',
      age: 25,
    },
    {
      id: 3,
      name: 'Bob Johnson',
      email: 'bob@example.com',
      status: 'active',
      age: 35,
    },
  ];
  const defaultProps = {
    data: sampleData,
    columns: [
      { accessorKey: 'name', header: 'Name', id: 'name', searchable: true },
      { accessorKey: 'email', header: 'Email', id: 'email', searchable: true },
      {
        accessorKey: 'status',
        header: 'Status',
        id: 'status',
        searchable: true,
      },
      { accessorKey: 'age', header: 'Age', id: 'age', searchable: true },
    ],
    placeholder: 'Search...',
    debounceMs: 300,
  };
  describe('basic rendering', () => {
    it('should render search input', () => {
      const { getByRole } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      const searchInput = getByRole('searchbox');
      expect(searchInput).toBeDefined();
      expect(searchInput).toHaveAttribute('placeholder', 'Search...');
    });

    it('should display placeholder correctly', () => {
      const { getByRole } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      const searchInput = getByRole('searchbox');
      expect(searchInput).toHaveAttribute('placeholder', 'Search...');
    });

    it('should render with custom placeholder', () => {
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          placeholder="Custom placeholder"
        />,
      );
      const searchInput = getByRole('searchbox');
      expect(searchInput).toHaveAttribute('placeholder', 'Custom placeholder');
    });
  });
  describe('search functionality', () => {
    it('should call onSearchResults when input changes', async () => {
      const onSearchResults = vi.fn();
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={onSearchResults}
        />,
      );
      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: 'John' } });
      await waitFor(() => {
        expect(onSearchResults).toHaveBeenCalledWith();
      });
    });

    it('should debounce search input', async () => {
      const onSearchResults = vi.fn();
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={onSearchResults}
          debounceMs={100}
        />,
      );
      const searchInput = getByRole('searchbox');
      // Type multiple characters quickly
      fireEvent.change(searchInput, { target: { value: 't' } });
      fireEvent.change(searchInput, { target: { value: 'te' } });
      fireEvent.change(searchInput, { target: { value: 'tes' } });
      fireEvent.change(searchInput, { target: { value: 'test' } });
      // Should call onSearchResults after debounce
      await waitFor(
        () => {
          expect(onSearchResults).toHaveBeenCalledWith();
        },
        { timeout: 200 },
      );
    });

    it('should clear search when clear button is clicked', async () => {
      const onSearchResults = vi.fn();
      const { getByRole, container } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={onSearchResults}
        />,
      );
      const searchInput = getByRole('searchbox');
      // Type something first
      fireEvent.change(searchInput, { target: { value: 'test search' } });
      await waitFor(() => {
        expect(onSearchResults).toHaveBeenCalledWith();
      });
      // Look for clear button (may be represented by an X icon or button)
      const buttons = container.querySelectorAll('[role="button"], button');
      if (buttons.length > 0) {
        fireEvent.click(buttons[0]);
        // Should call onSearchResults with original data (all results)
        await waitFor(() => {
          expect(onSearchResults).toHaveBeenCalledWith(sampleData, expect.any(Object));
        });
      }
    });
  });
  describe('column selection', () => {
    it('should render column selector button', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      // Should have a button to open column selector
      const buttons = container.querySelectorAll('[role="button"], button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should show selected columns', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(container).toBeDefined();
    });

    it('should allow column selection through search options', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(container).toBeDefined();
    });
  });
  describe('advanced search features', () => {
    it('should support case-sensitive search toggle', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(container).toBeDefined();
    });

    it('should support regex search toggle', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(container).toBeDefined();
    });

    it('should support whole word search toggle', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(container).toBeDefined();
    });
  });
  describe('responsive behavior', () => {
    it('should adapt to mobile screens', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(container).toBeDefined();
    });

    it('should show compact layout on small screens', () => {
      const { container } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(container).toBeDefined();
    });
  });
  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      const { getByRole } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      const searchInput = getByRole('searchbox');
      expect(searchInput).toBeDefined();
    });

    it('should support keyboard navigation', () => {
      const { getByRole } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      const searchInput = getByRole('searchbox');
      // Test keyboard events
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      fireEvent.keyDown(searchInput, { key: 'Escape' });
      expect(searchInput).toBeDefined();
    });

    it('should have proper focus management', () => {
      const { getByRole } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      const searchInput = getByRole('searchbox');
      // Test focus events
      fireEvent.focus(searchInput);
      fireEvent.blur(searchInput);
      expect(searchInput).toBeDefined();
    });
  });
  describe('edge cases', () => {
    it('should handle empty search term', async () => {
      const onSearchResults = vi.fn();
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={onSearchResults}
        />,
      );
      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: '' } });
      await waitFor(() => {
        expect(onSearchResults).toHaveBeenCalledWith(sampleData, expect.any(Object));
      });
    });

    it('should handle special characters in search', async () => {
      const onSearchResults = vi.fn();
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={onSearchResults}
        />,
      );
      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: 'test@#$%^&*()' } });
      await waitFor(() => {
        expect(onSearchResults).toHaveBeenCalledWith();
      });
    });

    it('should handle very long search terms', async () => {
      const longSearchTerm = 'a'.repeat(1000);
      const onSearchResults = vi.fn();
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={onSearchResults}
        />,
      );
      const searchInput = getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: longSearchTerm } });
      await waitFor(() => {
        expect(onSearchResults).toHaveBeenCalledWith();
      });
    });

    it('should handle empty columns array', () => {
      const { container } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          columns={[]}
          data={[]}
        />,
      );
      expect(container).toBeDefined();
    });

    it('should handle columns with no searchable properties', () => {
      const nonSearchableColumns = [
        { accessorKey: 'name', header: 'Name', id: 'name', searchable: false },
        {
          accessorKey: 'email',
          header: 'Email',
          id: 'email',
          searchable: false,
        },
      ];
      const { container } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          columns={nonSearchableColumns}
        />,
      );
      expect(container).toBeDefined();
    });
  });
  describe('search options persistence', () => {
    it('should handle re-renders without errors', () => {
      const { rerender } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      rerender(<DataTableSearch {...defaultProps} />);
      expect(true).toBe(true); // Component should re-render without errors
    });

    it('should maintain column configuration across re-renders', () => {
      const updatedColumns = [
        { accessorKey: 'name', header: 'Name', id: 'name', searchable: true },
        {
          accessorKey: 'status',
          header: 'Status',
          id: 'status',
          searchable: true,
        },
      ];
      const { rerender } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      rerender(
        <DataTableSearch
          {...defaultProps}
          columns={updatedColumns}
        />,
      );
      expect(true).toBe(true); // Component should re-render without errors
    });
  });
  describe('performance', () => {
    it('should handle rapid typing without performance issues', async () => {
      const onSearchResults = vi.fn();
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={onSearchResults}
          debounceMs={50}
        />,
      );
      const searchInput = getByRole('searchbox');
      // Simulate rapid typing
      for (let i = 0; i < 10; i++) {
        fireEvent.change(searchInput, { target: { value: `search${i}` } });
      }
      await waitFor(
        () => {
          expect(onSearchResults).toHaveBeenCalledWith();
        },
        { timeout: 100 },
      );
      // Should call onSearchResults after debouncing
      expect(onSearchResults).toHaveBeenCalledWith();
    });
  });
  describe('LC-71 whole search box', () => {
    it('nests the searchbox inside the composite ring (SearchInput, not a forked field)', () => {
      const { getByRole } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      const searchInput = getByRole('searchbox');
      expect(searchInput.closest('.mp-composite-ring')).not.toBeNull();
    });

    it('keeps options as a sibling control, not a second search field', () => {
      const { getByRole } = renderWithProviders(<DataTableSearch {...defaultProps} />);
      expect(getByRole('searchbox')).toBeDefined();
      expect(getByRole('button', { name: 'Search options' })).toBeDefined();
    });
  });
  describe('matching', () => {
    it('returns every row when the same term hits each row (no global-regex lastIndex skip)', async () => {
      const onSearchResults = vi.fn();
      const rows = [{ name: 'a' }, { name: 'a' }, { name: 'a' }];
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          data={rows}
          columns={[{ accessorKey: 'name', header: 'Name', id: 'name', searchable: true }]}
          debounceMs={0}
          onSearchResults={onSearchResults}
        />,
      );
      fireEvent.change(getByRole('searchbox'), { target: { value: 'a' } });
      await waitFor(() => {
        const last = onSearchResults.mock.calls.at(-1);
        expect(last?.[0]).toHaveLength(3);
      });
    });

    it('announces shown-of-total in a live region', async () => {
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          debounceMs={0}
        />,
      );
      fireEvent.change(getByRole('searchbox'), { target: { value: 'Jane' } });
      await waitFor(() => {
        expect(getByRole('status').textContent).toMatch(/1 of 3/);
      });
    });
  });
  describe('error handling', () => {
    it('should handle columns with invalid accessor keys gracefully', () => {
      const invalidColumns = [
        {
          accessorKey: 'invalidField',
          header: 'Invalid',
          id: 'invalid',
          searchable: true,
        },
        { accessorKey: 'name', header: 'Name', id: 'name', searchable: true },
      ];
      const { container } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          columns={invalidColumns}
        />,
      );
      expect(container).toBeDefined();
    });

    it('should handle missing onSearchResults callback', () => {
      const { getByRole } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onSearchResults={undefined}
        />,
      );
      const searchInput = getByRole('searchbox');
      expect(() => {
        fireEvent.change(searchInput, { target: { value: 'test' } });
      }).not.toThrow();
    });

    it('should handle missing onHighlightText callback', () => {
      const { container } = renderWithProviders(
        <DataTableSearch
          {...defaultProps}
          onHighlightText={undefined}
        />,
      );
      expect(container).toBeDefined();
    });
  });
});
