import type { SortingState } from '@tanstack/react-table';
import { useState } from 'react';

export interface UseTableSortingOptions {
  enableSorting?: boolean;
  manualSorting?: boolean;
  initialSorting?: SortingState;
}

export interface UseTableSortingReturn {
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
}

export function useTableSorting({ initialSorting = [] }: UseTableSortingOptions = {}): UseTableSortingReturn {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  return {
    sorting,
    setSorting,
  };
}
