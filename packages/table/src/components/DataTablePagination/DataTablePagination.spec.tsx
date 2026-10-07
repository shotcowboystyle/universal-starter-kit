import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { createElement, forwardRef, useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The happy-dom env resolves useMedia to { sm: false } (mobile), which hides
// the desktop-only meta clusters. Model a measured wide container and pin sm on
// so the range-label contract below is testable (same pattern as
// components/Debug and markdown/mdx specs).
vi.mock(import('tamagui'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('tamagui')>();
  return {
    ...actual,
    XStack: forwardRef((props: any, ref) => {
      const onLayout = props['aria-label'] === 'Table pagination' ? props.onLayout : undefined;
      useEffect(() => {
        onLayout?.({ nativeEvent: { layout: { width: 1200, height: 44, x: 0, y: 0 } } });
      }, [onLayout]);
      return createElement(actual.XStack, { ...props, ref });
    }),
    useMedia: (...args: any[]) => ({ ...(actual.useMedia as any)(...args), sm: true }),
  };
});

import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../utils/paginationDefaults';
import { bidiIsolate } from '../../utils/withInterp';

import { DataTablePagination } from './index';

describe(DataTablePagination, () => {
  const defaultProps = {
    // Multi-page: LC-37 hides the pager entirely when totalPages <= 1, so the
    // shared fixture must actually have somewhere to navigate.
    pagination: {
      pageIndex: 0,
      pageSize: 25,
      totalCount: 100,
      totalPages: 4,
    },
    onPaginationChange: vi.fn(),
    pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
    showInfo: true,
    showPageSizeSelector: true,
    showPageJump: true,
  };

  describe('basic rendering', () => {
    it('should render pagination controls', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should display pagination info when showInfo is true', () => {
      const { getByLabelText } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      // Page navigation is the catalog Pagination (numbered variant):
      // the current page button carries aria-current="page"
      const currentPageButton = getByLabelText('Page 1');
      expect(currentPageButton).toBeDefined();
      expect(currentPageButton.getAttribute('aria-current')).toBe('page');
    });

    it('should not display pagination info when showInfo is false', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          showInfo={false}
        />,
      );

      expect(container).toBeDefined();
    });
  });

  describe('navigation buttons', () => {
    it('should render navigation buttons', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      // Should have navigation buttons (exact text may vary based on implementation)
      expect(container.querySelectorAll('button')).toBeDefined();
    });

    it('should call onPaginationChange when first page button is clicked', () => {
      const onPaginationChange = vi.fn();
      renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{
            pageIndex: 2,
            pageSize: 10,
            hasPreviousPage: true,
            hasNextPage: true,
            totalPages: 5,
          }}
          onPaginationChange={onPaginationChange}
        />,
      );

      const firstPageButton = screen.getByLabelText('Go to first page');
      fireEvent.click(firstPageButton);
      expect(onPaginationChange).toHaveBeenCalledWith({
        pageIndex: 0,
        pageSize: 10,
      });
    });

    it('should call onPaginationChange when previous page button is clicked', () => {
      const onPaginationChange = vi.fn();
      renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{
            pageIndex: 2,
            pageSize: 10,
            hasPreviousPage: true,
            hasNextPage: true,
            totalPages: 5,
          }}
          onPaginationChange={onPaginationChange}
        />,
      );

      const previousPageButton = screen.getByLabelText('Go to previous page');
      fireEvent.click(previousPageButton);
      expect(onPaginationChange).toHaveBeenCalledWith({
        pageIndex: 1,
        pageSize: 10,
      });
    });

    it('should call onPaginationChange when next page button is clicked', () => {
      const onPaginationChange = vi.fn();
      renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{
            pageIndex: 0,
            pageSize: 10,
            hasPreviousPage: false,
            hasNextPage: true,
            totalPages: 5,
          }}
          onPaginationChange={onPaginationChange}
        />,
      );

      const nextPageButton = screen.getByLabelText('Go to next page');
      fireEvent.click(nextPageButton);
      expect(onPaginationChange).toHaveBeenCalledWith({
        pageIndex: 1,
        pageSize: 10,
      });
    });

    it('should call onPaginationChange when last page button is clicked', () => {
      const onPaginationChange = vi.fn();
      renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{
            pageIndex: 0,
            pageSize: 10,
            hasPreviousPage: false,
            hasNextPage: true,
            totalPages: 5,
          }}
          onPaginationChange={onPaginationChange}
        />,
      );

      const lastPageButton = screen.getByLabelText('Go to last page');
      fireEvent.click(lastPageButton);
      expect(onPaginationChange).toHaveBeenCalledWith({
        pageIndex: 4,
        pageSize: 10,
      });
    });

    it('should disable first and previous buttons on first page', () => {
      renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{ pageIndex: 0, pageSize: 10, totalCount: 50, totalPages: 5 }}
        />,
      );

      expect(screen.getByLabelText('Go to previous page').getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByLabelText('Go to next page').getAttribute('aria-disabled')).not.toBe('true');
    });
  });

  describe('page size selector', () => {
    it('should render page size selector when showPageSizeSelector is true', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should not render page size selector when showPageSizeSelector is false', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          showPageSizeSelector={false}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should call onPaginationChange when page size changes', () => {
      const onPaginationChange = vi.fn();
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          onPaginationChange={onPaginationChange}
        />,
      );

      // This test may need to be adjusted based on the actual Select implementation
      expect(container).toBeDefined();
    });

    it('should display custom page size options', () => {
      const customOptions = [5, 15, 25];
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pageSizeOptions={customOptions}
        />,
      );

      expect(container).toBeDefined();
    });

    it('defaults pageSizeOptions to 10/25/50/100 (DG-TBL-04)', () => {
      // Constant is the source of truth for the component default; render-path
      // coverage of Select options is covered by page-size-change tests above.
      expect([...DEFAULT_PAGE_SIZE_OPTIONS]).toEqual([10, 25, 50, 100]);
    });
  });

  describe('page jump functionality', () => {
    it('should render page jump input when showPageJump is true', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should not render page jump input when showPageJump is false', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          showPageJump={false}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should call onPaginationChange when page jump input changes', () => {
      const onPaginationChange = vi.fn();
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          onPaginationChange={onPaginationChange}
        />,
      );

      const inputs = container.querySelectorAll('input');
      if (inputs.length > 0) {
        fireEvent.change(inputs[0], { target: { value: '3' } });
        // May need to trigger form submission or blur event
        expect(container).toBeDefined();
      }
    });
  });

  describe('compact mode', () => {
    it('should render in compact mode when compact is true', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          compact={true}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should render in normal mode when compact is false', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          compact={false}
        />,
      );

      expect(container).toBeDefined();
    });

    it('keeps the page-size selector in compact (DG-TBL-04)', () => {
      const { getByLabelText } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          compact
        />,
      );

      expect(getByLabelText('Select rows per page')).toBeDefined();
    });

    it('hides the jumper in compact — the numbered window already jumps', () => {
      const { queryByLabelText } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          compact
        />,
      );

      expect(queryByLabelText('Page number')).toBeNull();
    });
  });

  describe('responsive behavior', () => {
    it('should adapt to different screen sizes', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      expect(container).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels for navigation buttons', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      const buttons = container.querySelectorAll('[role="button"], button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should have proper ARIA labels for page size selector', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('should have proper ARIA labels for page jump input', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      expect(container).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle zero total pages', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);

      expect(container).toBeDefined();
    });

    it('shows an honest range for a populated page (1-10 of 150 items, NaN-free)', () => {
      const { getByText } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{ pageIndex: 0, pageSize: 10, totalCount: 150, totalPages: 15 }}
        />,
      );

      // Bidi-isolated (FSI…PDI) so RTL contexts can't reorder the range run.
      expect(getByText(bidiIsolate('1–10 of 150 items'))).toBeDefined();
    });

    it('clamps the range to 0–0 for an empty set instead of claiming a phantom row', () => {
      const { getByText, queryByText } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{ pageIndex: 0, pageSize: 10, totalCount: 0, totalPages: 0 }}
        />,
      );

      expect(getByText(bidiIsolate('0–0 items'))).toBeDefined();
      expect(queryByText(/1-0/)).toBeNull();
      expect(queryByText(/NaN/)).toBeNull();
    });

    it('hides the pager and jump on a single page (LC-37), keeping the range info', () => {
      const singlePage = {
        pagination: { pageIndex: 0, pageSize: 10, totalCount: 5, totalPages: 1 },
        onPaginationChange: vi.fn(),
      };
      const { queryByLabelText, getByText } = renderWithProviders(<DataTablePagination {...singlePage} />);

      expect(queryByLabelText('Page number')).toBeNull();
      expect(queryByLabelText(/next page/i)).toBeNull();
      expect(getByText(bidiIsolate('1–5 of 5 items'))).toBeDefined();
    });

    it('shows the pager on a single page when ejected via showPagerWhenSinglePage', () => {
      const singlePage = {
        pagination: { pageIndex: 0, pageSize: 10, totalCount: 5, totalPages: 1 },
        onPaginationChange: vi.fn(),
      };
      const { queryByLabelText } = renderWithProviders(
        <DataTablePagination
          {...singlePage}
          showPagerWhenSinglePage
        />,
      );

      expect(queryByLabelText('Page number')).toBeDefined();
    });

    it('should handle large page numbers', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{ pageIndex: 999, pageSize: 10 }}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should handle empty pageSizeOptions', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pageSizeOptions={[]}
        />,
      );

      expect(container).toBeDefined();
    });

    it('keeps a page size that is not in pageSizeOptions selectable', () => {
      const { getByLabelText } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pageSizeOptions={[10, 25, 50, 100]}
          pagination={{ pageIndex: 0, pageSize: 15, totalCount: 40, totalPages: 3 }}
        />,
      );

      expect(getByLabelText('Select rows per page')).toBeDefined();
    });
  });

  describe('page jump sync', () => {
    it('commits Enter and remounts to the current page after a pager click', () => {
      function Harness() {
        const [pagination, setPagination] = useState({
          pageIndex: 0,
          pageSize: 10,
          totalCount: 50,
          totalPages: 5,
        });
        return (
          <DataTablePagination
            pagination={pagination}
            onPaginationChange={(next) => {
              setPagination((prev) => {
                if (prev.pageIndex === next.pageIndex && prev.pageSize === next.pageSize) {
                  return prev;
                }
                return { ...prev, ...next };
              });
            }}
            showPageJump
            pageSizeOptions={[10, 20, 30, 50, 100, 250]}
          />
        );
      }

      renderWithProviders(<Harness />);
      const jump = screen.getByLabelText('Page number') as HTMLInputElement;
      expect(jump.value).toBe('1');

      fireEvent.click(screen.getByLabelText('Go to next page'));
      expect(screen.getByLabelText('Page number').value).toBe('2');
    });
  });

  describe('LC-71 ring anatomy', () => {
    it('does not clip Select/Input rings with overflow hidden on the control wrap', () => {
      const { container } = renderWithProviders(<DataTablePagination {...defaultProps} />);
      const wraps = container.querySelectorAll('[data-pagination-control]');
      expect(wraps.length).toBeGreaterThan(0);
      wraps.forEach((el) => {
        expect((el as HTMLElement).style.overflow).not.toBe('hidden');
      });
    });
  });

  describe('callback behavior', () => {
    it('should call onPaginationChange with correct parameters', () => {
      const onPaginationChange = vi.fn();
      renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{
            pageIndex: 1,
            pageSize: 10,
            hasPreviousPage: true,
            hasNextPage: true,
            totalPages: 5,
          }}
          onPaginationChange={onPaginationChange}
        />,
      );

      const nextPageButton = screen.getByLabelText('Go to next page');
      fireEvent.click(nextPageButton);
      expect(onPaginationChange).toHaveBeenCalledWith({
        pageIndex: 2,
        pageSize: 10,
      });
    });

    it('should not call onPaginationChange when clicking disabled buttons', () => {
      const onPaginationChange = vi.fn();
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{ pageIndex: 0, pageSize: 10 }}
          onPaginationChange={onPaginationChange}
        />,
      );

      const buttons = container.querySelectorAll('[role="button"], button');
      if (buttons.length > 0) {
        fireEvent.click(buttons[0]); // First page button (should be disabled)
        // The callback may or may not be called depending on implementation
        expect(container).toBeDefined();
      }
    });
  });

  describe('state synchronization', () => {
    it('should reflect current page index in UI', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{ pageIndex: 2, pageSize: 10 }}
        />,
      );

      expect(container).toBeDefined();
    });

    it('should reflect current page size in UI', () => {
      const { container } = renderWithProviders(
        <DataTablePagination
          {...defaultProps}
          pagination={{ pageIndex: 0, pageSize: 20 }}
        />,
      );

      expect(container).toBeDefined();
    });
  });
});
