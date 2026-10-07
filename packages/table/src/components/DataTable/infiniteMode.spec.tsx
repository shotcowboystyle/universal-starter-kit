/**
 * DataTable paginationMode specs — pages (default, footer pager) vs
 * infinite (tail status + accumulation, no footer pager), plus the
 * loader-mode prefetch contract observed through the component.
 */

import { renderWithProviders } from '@repo/test-utils';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, PageLoadQuery, PageLoadResult } from '../../types';

import { DataTable } from './index';

interface Row {
  id: number;
  name: string;
}

const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  name: `Row ${i + 1}`,
}));

const columns: DataTableColumn<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
];

const query = (container: HTMLElement, testId: string) => container.querySelector(`[data-testid="${testId}"]`);

describe('DataTable paginationMode', () => {
  it('pages mode (default) renders the footer pager and no infinite tail', () => {
    const { container, getByLabelText } = renderWithProviders(
      <DataTable
        data={rows}
        columns={columns}
        readOnly
      />,
    );
    // Catalog Pagination signature (numbered variant next-page control).
    expect(getByLabelText('Go to next page')).toBeDefined();
    expect(query(container, 'infinite-status')).toBeNull();
  });

  it('infinite mode hides the footer pager and renders the tail status', () => {
    const { container, queryByLabelText, getByText } = renderWithProviders(
      <DataTable
        data={rows}
        columns={columns}
        readOnly
        paginationMode="infinite"
        initialState={{ pagination: { pageIndex: 0, pageSize: 10 } }}
      />,
    );
    expect(queryByLabelText('Go to next page')).toBeNull();
    const status = query(container, 'infinite-status');
    expect(status).not.toBeNull();
    expect(status!.getAttribute('aria-live')).toBe('polite');
    // Client mode reveals only the first chunk.
    expect(getByText('Row 1')).toBeDefined();
    expect(status!.textContent).toContain('10');
    expect(status!.textContent).toContain('50');
  });

  it('switching modes swaps chrome without losing data', () => {
    const { container, rerender, queryByLabelText, getByLabelText } = renderWithProviders(
      <DataTable
        data={rows}
        columns={columns}
        readOnly
        paginationMode="pages"
      />,
    );
    expect(getByLabelText('Go to next page')).toBeDefined();

    rerender(
      <DataTable
        data={rows}
        columns={columns}
        readOnly
        paginationMode="infinite"
      />,
    );
    expect(queryByLabelText('Go to next page')).toBeNull();
    expect(query(container, 'infinite-status')).not.toBeNull();

    rerender(
      <DataTable
        data={rows}
        columns={columns}
        readOnly
        paginationMode="pages"
      />,
    );
    expect(getByLabelText('Go to next page')).toBeDefined();
    expect(query(container, 'infinite-status')).toBeNull();
  });

  it('loader mode prefetches page 1 while page 0 renders', async () => {
    const loader = vi.fn(async (q: PageLoadQuery): Promise<PageLoadResult<Row>> => {
      const start = q.pageIndex * q.pageSize;
      return { rows: rows.slice(start, start + q.pageSize), totalCount: rows.length };
    });
    const { getByText } = renderWithProviders(
      <DataTable
        data={[]}
        columns={columns}
        readOnly
        paginationMode="infinite"
        loadPage={loader}
        initialState={{ pagination: { pageIndex: 0, pageSize: 10 } }}
      />,
    );

    await waitFor(() => {
      expect(getByText('Row 1')).toBeDefined();
    });
    // Prefetch-ahead: page 1 requested while page 0 is the visible page.
    await waitFor(() => {
      const requested = loader.mock.calls.map(([q]) => q.pageIndex);
      expect(requested).toEqual([0, 1]);
    });
  });

  it('loader mode shows honest end state when the loader is empty', async () => {
    const loader = vi.fn(async (_q: PageLoadQuery): Promise<PageLoadResult<Row>> => ({ rows: [], totalCount: 0 }));
    const { container } = renderWithProviders(
      <DataTable
        data={[]}
        columns={columns}
        readOnly
        paginationMode="infinite"
        loadPage={loader}
      />,
    );
    await waitFor(() => {
      const status = query(container, 'infinite-status');
      expect(status).not.toBeNull();
      expect(status!.textContent?.length).toBeGreaterThan(0);
    });
    // Exactly one page-0 probe; nothing else to prefetch.
    expect(loader.mock.calls.map(([q]) => q.pageIndex)).toEqual([0]);
  });
});
