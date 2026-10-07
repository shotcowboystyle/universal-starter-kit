import type { ColumnFiltersState } from '@tanstack/react-table';
import { useCallback, useState } from 'react';

import type { TableFilter } from '../types';
import { generateFilterId } from '../utils/filterUtils';

export interface UseTableFilteringOptions {
  enableFiltering?: boolean;
  manualFiltering?: boolean;
  initialFilters?: TableFilter[];
  initialColumnFilters?: ColumnFiltersState;
  initialGlobalFilter?: string;
}

export interface UseTableFilteringReturn {
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  advancedFilters: TableFilter[];
  setFilters: React.Dispatch<React.SetStateAction<TableFilter[]>>;
  /** Adds an advanced filter and returns its generated id. */
  addFilter: (filter: Omit<TableFilter, 'id'>) => string;
  /** Updates an existing advanced filter in place (live commit, LC-21). */
  updateFilter: (filterId: string, updates: Partial<Omit<TableFilter, 'id'>>) => void;
  removeFilter: (filterId: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
}

export function useTableFiltering({
  initialFilters = [],
  initialColumnFilters = [],
  initialGlobalFilter = '',
}: UseTableFilteringOptions = {}): UseTableFilteringReturn {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
  const [globalFilter, setGlobalFilter] = useState<string>(initialGlobalFilter);
  const [advancedFilters, setAdvancedFilters] = useState<TableFilter[]>(initialFilters);

  // Advanced filters are their own pipeline (applied via applyFiltersToData
  // client-side, or mapped to server params under manualFiltering). They are
  // deliberately NOT mirrored into TanStack columnFilters — mirroring double-
  // applied them and broke on fields with no matching column.
  const addFilter = useCallback((filter: Omit<TableFilter, 'id'>) => {
    const id = generateFilterId();
    setAdvancedFilters((prev) => [...prev, { ...filter, id }]);
    return id;
  }, []);

  const updateFilter = useCallback((filterId: string, updates: Partial<Omit<TableFilter, 'id'>>) => {
    setAdvancedFilters((prev) => prev.map((f) => (f.id === filterId ? { ...f, ...updates, id: f.id } : f)));
  }, []);

  const removeFilter = useCallback((filterId: string) => {
    setAdvancedFilters((prev) => prev.filter((f) => f.id !== filterId));
  }, []);

  const clearFilters = useCallback(() => {
    setAdvancedFilters([]);
    setColumnFilters([]);
    setGlobalFilter('');
  }, []);

  const hasActiveFilters = advancedFilters.length > 0 || columnFilters.length > 0 || !!globalFilter;

  const activeFilterCount = advancedFilters.length + columnFilters.length + (globalFilter ? 1 : 0);

  return {
    columnFilters,
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
    advancedFilters,
    setFilters: setAdvancedFilters,
    addFilter,
    updateFilter,
    removeFilter,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
  };
}
