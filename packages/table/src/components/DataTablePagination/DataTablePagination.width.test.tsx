import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { createElement, forwardRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { View as TamaguiView, XStack as TamaguiXStack } from 'tamagui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTablePagination } from './index';

const observed = vi.hoisted(() => ({
  onLayout: null as null | ((event: LayoutChangeEvent) => void),
  change: vi.fn<(next: { pageIndex: number; pageSize: number }) => void>(),
  sizeWidth: 0,
}));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the factory swaps View/XStack for observing forwardRef wrappers whose type differs from the module's
vi.mock('tamagui', async (importOriginal) => {
  const actual = await importOriginal<{ View: typeof TamaguiView; XStack: typeof TamaguiXStack }>();
  return {
    ...actual,
    useMedia: () => ({ sm: true }),
    View: forwardRef(function ObservedView(props: any, ref) {
      if (props['data-pagination-control'] === 'size') {
        observed.sizeWidth = props.width;
      }
      return createElement(actual.View, { ...props, ref });
    }),
    XStack: forwardRef(function ObservedXStack(props: any, ref) {
      if (props['aria-label'] === 'Table pagination') {
        observed.onLayout = props.onLayout;
      }
      return createElement(actual.XStack, { ...props, ref });
    }),
  };
});
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the stub returns only the state/computed/actions slice the pager reads, which the typed factory rejects
vi.mock('../DataTable/data-table-state-context', () => ({
  useDataTableState: () => ({
    state: { pagination: { pageIndex: 0, pageSize: 25 } },
    computed: { totalPages: 40, totalRows: 1000 },
    actions: { setPagination: observed.change },
  }),
}));

const measure = (width: number) => {
  expect(observed.onLayout).toBeTypeOf('function');
  act(() =>
    observed.onLayout?.({
      nativeEvent: { layout: { width, height: 44, x: 0, y: 0 } },
    } as LayoutChangeEvent),
  );
};

const renderPager = (compact: boolean) => (
  <Preset overrides={{ space: 'large' }}>
    <DataTablePagination compact={compact} />
  </Preset>
);

const NAV_PAGE = { name: 'Page' } as const;
const pager = () => within(screen.getByRole('navigation', NAV_PAGE));
const PAGE_OF_TOTAL = /1\D*40/u;

describe('bounded compact table pagination', () => {
  beforeEach(() => {
    observed.change.mockReset();
    observed.onLayout = null;
  });

  it('preserves the default footprint and grows for wide numeric options', () => {
    const { rerender } = renderWithProviders(<DataTablePagination compact />);
    expect(observed.sizeWidth).toBe(80);
    rerender(
      <DataTablePagination
        compact
        pageSizeOptions={[10, 25, 1_000_000]}
      />,
    );
    expect(observed.sizeWidth).toBeGreaterThan(80);
  });

  it('budgets the always-compact Select independently from footer spacing', () => {
    const { rerender } = renderWithProviders(renderPager(false));
    const width = observed.sizeWidth;
    expect(width).toBeGreaterThan(80);
    rerender(renderPager(true));
    expect(observed.sizeWidth).toBe(width);
  });

  it('starts safely and responds to container width even on a desktop viewport', () => {
    renderWithProviders(<DataTablePagination compact />);
    expect(pager().getAllByRole('button')).toHaveLength(2);
    measure(1000);
    expect(pager().getAllByRole('button').length).toBeGreaterThan(2);
    measure(249);
    expect(pager().getAllByRole('button')).toHaveLength(2);
    expect(pager().getByText(PAGE_OF_TOTAL)).toBeInTheDocument();
    expect(screen.getByLabelText('Select rows per page')).toBeInTheDocument();
    fireEvent.click(pager().getByLabelText('Go to next page'));
    expect(observed.change).toHaveBeenCalledExactlyOnceWith({ pageIndex: 1, pageSize: 25 });
  });

  it('preserves the presentation when a container reports its width again', () => {
    renderWithProviders(<DataTablePagination compact />);
    measure(249);
    const pagerEl = screen.getByRole('navigation', { name: 'Page' });
    const buttons = within(pagerEl).getAllByRole('button');
    measure(249);
    expect(within(pagerEl).getAllByRole('button')).toStrictEqual(buttons);
    expect(observed.change).not.toHaveBeenCalled();
  });

  it('resets to the first page when rows per page changes in a narrow table', async () => {
    renderWithProviders(
      <DataTablePagination
        compact
        pagination={{ pageIndex: 5, pageSize: 25, totalPages: 40, totalCount: 1000 }}
      />,
    );
    measure(249);
    fireEvent.click(screen.getByLabelText('Select rows per page'));
    fireEvent.keyDown(await screen.findByRole('option', { name: '50' }), {
      key: 'Enter',
    });
    expect(observed.change).toHaveBeenCalledExactlyOnceWith({ pageIndex: 0, pageSize: 50 });
  });
});
