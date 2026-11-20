import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDataTable } from '../hooks/use-data-table';
import { useTablePagination } from '../hooks/use-table-pagination';

import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS } from './pagination-defaults';
import { deserializeTableState } from './url-state-utils';

describe('pagination defaults (DG-TBL-04)', () => {
  it('exports pageSize 25 and options 10/25/50/100', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect([...DEFAULT_PAGE_SIZE_OPTIONS]).toStrictEqual([10, 25, 50, 100]);
  });

  it('useTablePagination defaults pageSize to 25', () => {
    const { result } = renderHook(() => useTablePagination());
    expect(result.current.pagination.pageSize).toBe(25);
    expect(result.current.pagination.pageIndex).toBe(0);
  });

  it('useDataTable defaults pageSize to 25 when initialState omits pagination', () => {
    const { result } = renderHook(() =>
      useDataTable({
        data: [{ id: 1, name: 'a' }],
        columns: [{ id: 'name', accessorKey: 'name', header: 'Name' }],
      }),
    );
    expect(result.current.state.pagination.pageSize).toBe(25);
  });

  it('URL deserialize falls back to default pageSize 25 when pageSize is omitted', () => {
    const result = deserializeTableState({ page: '1' });
    expect(result.pagination).toStrictEqual({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('URL serialize/deserialize round-trips pageSize (persist via syncWithUrl pattern)', () => {
    const serialized = {
      page: '2',
      pageSize: '50',
    };
    const state = deserializeTableState(serialized);
    expect(state.pagination).toStrictEqual({ pageIndex: 1, pageSize: 50 });
  });
});
