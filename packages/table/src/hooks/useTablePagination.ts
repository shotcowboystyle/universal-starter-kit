import type { PaginationState } from '@tanstack/react-table';
import { useState } from 'react';

import { DEFAULT_PAGE_SIZE } from '../utils/paginationDefaults';

export interface UseTablePaginationOptions {
  enablePagination?: boolean;
  manualPagination?: boolean;
  initialPagination?: PaginationState;
  rowCount?: number;
  pageCount?: number;
}

export interface UseTablePaginationReturn {
  pagination: PaginationState;
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function useTablePagination({
  manualPagination = false,
  initialPagination,
  rowCount,
  pageCount,
}: UseTablePaginationOptions = {}): UseTablePaginationReturn {
  const [pagination, setPagination] = useState<PaginationState>(
    initialPagination ?? {
      pageIndex: 0,
      pageSize: DEFAULT_PAGE_SIZE,
    },
  );

  const totalPages =
    manualPagination && pageCount != null
      ? pageCount
      : manualPagination && rowCount != null
        ? Math.ceil(rowCount / pagination.pageSize)
        : 0;

  const hasNextPage = manualPagination ? pagination.pageIndex < totalPages - 1 : false;

  const hasPreviousPage = pagination.pageIndex > 0;

  return {
    pagination,
    setPagination,
    totalPages,
    hasNextPage,
    hasPreviousPage,
  };
}
