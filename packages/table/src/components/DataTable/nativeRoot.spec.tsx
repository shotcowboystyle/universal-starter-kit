/**
 * The native root honours the props the web root does (MPO-454).
 *
 * index.native.tsx handed useDataTable a subset of the web root's options
 * and never drew a bulk bar, so on iOS the backoffice list (infinite server
 * mode, rows only through `loadPage`) showed "No data available", and
 * checked rows offered no Export CSV. These specs render the native root
 * itself: the suite runs on web, so `react-native` resolves to
 * react-native-web and FlashList, which the list layout never mounts, is
 * stubbed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BulkAction, DataTableColumn, PageLoadQuery, PageLoadResult } from '../../types';

import { DataTable } from './index.native';

vi.mock(import('@shopify/flash-list'), () => ({ FlashList: () => null }));

interface Row {
  id: number;
  name: string;
}

const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

const columns: DataTableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Name', meta: { role: 'title' } },
  { accessorKey: 'id', header: 'ID' },
];

function pageLoader() {
  return vi.fn(async (q: PageLoadQuery): Promise<PageLoadResult<Row>> => {
    const start = q.pageIndex * q.pageSize;
    return { rows: rows.slice(start, start + q.pageSize), totalCount: rows.length };
  });
}

function renderInfinite(loadPage: ReturnType<typeof pageLoader>) {
  return renderWithProviders(
    <DataTable
      data={[]}
      columns={columns}
      layout="list"
      readOnly
      paginationMode="infinite"
      loadPage={loadPage}
      initialState={{ pagination: { pageIndex: 0, pageSize: 10 } }}
    />,
  );
}

/** Where the tail sentinel reports itself on screen, via measureInWindow. */
function placeSentinel(top: number) {
  const real = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid !== 'infinite-sentinel') {
      return real.call(this);
    }
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 320,
      bottom: top + 1,
      width: 320,
      height: 1,
    } as DOMRect;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('native DataTable infinite mode', () => {
  it('renders page 0 from loadPage instead of the empty state', async () => {
    const loadPage = pageLoader();
    renderInfinite(loadPage);
    await expect(screen.findByText('Row 1')).resolves.toBeDefined();
    expect(screen.getByText('Row 10')).toBeDefined();
    expect(screen.queryByText('Row 11')).toBeNull();
    expect(screen.queryByText('No data available')).toBeNull();
    expect(loadPage.mock.calls[0][0].pageIndex).toBe(0);
    expect(screen.getByTestId('infinite-status').textContent).toContain('50');
    expect(screen.queryByLabelText('Go to next page')).toBeNull();
  });

  it('appends the next page once the tail sentinel comes on screen', async () => {
    placeSentinel(200);
    const loadPage = pageLoader();
    renderInfinite(loadPage);
    await expect(screen.findByText('Row 11', undefined, { timeout: 3000 })).resolves.toBeDefined();
    expect(screen.getByText('Row 20')).toBeDefined();
  });

  it('holds the next page while the tail sentinel is below the fold', async () => {
    placeSentinel(100_000);
    const loadPage = pageLoader();
    renderInfinite(loadPage);
    await expect(screen.findByText('Row 10')).resolves.toBeDefined();
    await waitFor(() => {
      expect(loadPage.mock.calls.map(([q]) => q.pageIndex)).toEqual([0, 1]);
    });
    await new Promise((settle) => setTimeout(settle, 800));
    expect(screen.queryByText('Row 11')).toBeNull();
  });
});

describe('native DataTable bulk actions', () => {
  it('checking rows shows the bulk bar, and an action receives the checked rows', async () => {
    const exportCsv = vi.fn();
    const bulkActions: BulkAction<Row>[] = [
      { id: 'assign', label: 'Assign To', onExecute: vi.fn() },
      { id: 'export', label: 'Export CSV', onExecute: exportCsv },
    ];
    renderWithProviders(
      <DataTable
        data={rows.slice(0, 3)}
        columns={columns}
        layout="list"
        readOnly
        enablePagination={false}
        enableRowSelection
        bulkActions={bulkActions}
      />,
    );
    expect(screen.queryByText('Export CSV')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Row 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Row 3' }));

    await expect(screen.findByText('2 selected')).resolves.toBeDefined();
    expect(screen.getByRole('button', { name: 'Assign To' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => {
      expect(exportCsv).toHaveBeenCalledOnce();
    });
    expect(exportCsv.mock.calls[0][0].map((row: Row) => row.name)).toEqual(['Row 1', 'Row 3']);
  });
});

describe('native DataTable root parity with web', () => {
  const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf-8');

  /** Option names a root hands useDataTable. */
  function useDataTableOptions(source: string): Set<string> {
    const start = source.indexOf('useDataTable({');
    const body = source.slice(start, source.indexOf('});', start));
    return new Set([...body.matchAll(/^\s*([A-Za-z]+)\s*[,:]/gm)].map((match) => match[1]));
  }

  /** Prop names every `<Component ... />` call site in a root passes. */
  function propNames(source: string, component: string): Set<string> {
    const names = new Set<string>();
    for (const site of source.split(`<${component}`).slice(1)) {
      // Stop at the element's end or at a nested element, whichever is first.
      const end = site.search(/\/>|</);
      const element = end === -1 ? site : site.slice(0, end);
      for (const match of element.matchAll(/(?:^|\s)([A-Za-z][A-Za-z0-9]*)=[{"]/g)) {
        names.add(match[1]);
      }
    }
    return names;
  }

  it('hands useDataTable every option the web root does', () => {
    const web = useDataTableOptions(read('DataTableRoot.tsx'));
    const native = useDataTableOptions(read('index.native.tsx'));
    expect(web.size).toBeGreaterThan(0);
    expect([...web].filter((option) => !native.has(option)).sort()).toEqual([]);
  });

  it.each(['DataTableBulkActions', 'DataTableInfiniteTail'])('renders %s with every prop web passes', (component) => {
    const web = propNames(read('DataTableRoot.tsx'), component);
    const native = propNames(read('index.native.tsx'), component);
    expect(web.size).toBeGreaterThan(0);
    expect([...web].filter((prop) => !native.has(prop)).sort()).toEqual([]);
  });
});
