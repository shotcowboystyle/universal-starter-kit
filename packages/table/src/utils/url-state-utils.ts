import type { DataTableState, TableFilter, TableSorting } from '../types';

import { DEFAULT_PAGE_SIZE } from './pagination-defaults';

// URL State Serialization

/** URL query params keyed by param name (`page`, `pageSize`, `sort`, `filters`, `search`, `view`). */
type TableUrlParams = Record<string, string>;

export const serializeTableState = (state: Partial<DataTableState>): TableUrlParams => {
  const urlState: TableUrlParams = {};

  // Pagination
  if (state.pagination) {
    // 1-based for URL
    urlState.page = String(state.pagination.pageIndex + 1);
    urlState.pageSize = String(state.pagination.pageSize);
  }

  // Sorting
  if (state.sorting && state.sorting.length > 0) {
    urlState.sort = state.sorting.map((sort) => `${sort.id}:${sort.desc ? 'desc' : 'asc'}`).join(',');
  }

  // Filters
  if (state.filters && state.filters.length > 0) {
    try {
      urlState.filters = btoa(JSON.stringify(state.filters));
    } catch (error) {
      console.warn('Failed to serialize filters for URL:', error);
    }
  }

  // Global Filter (Search)
  if (state.globalFilter !== undefined && state.globalFilter !== '') {
    urlState.search = state.globalFilter;
  }

  // Active View
  if (state.activeViewId !== undefined && state.activeViewId !== '') {
    urlState.view = state.activeViewId;
  }

  // oxlint-disable-next-line anti-slop/no-known-value-widening -- only the params that are set are present; an open string map is the URL contract
  return urlState;
};

// URL State Deserialization

export const deserializeTableState = (urlState: Record<string, string>): Partial<DataTableState> => {
  const state: Partial<DataTableState> = {};

  // Pagination
  if (urlState.page) {
    // Convert to 0-based. parseInt is deliberate: it tolerates trailing junk ("2abc" -> 2) where Number() would not.
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient URL parse, see above
    const pageIndex = Number.parseInt(urlState.page, 10) - 1;
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient URL parse, see above
    const pageSize = urlState.pageSize ? Number.parseInt(urlState.pageSize, 10) : DEFAULT_PAGE_SIZE;

    if (!Number.isNaN(pageIndex) && !Number.isNaN(pageSize)) {
      state.pagination = { pageIndex, pageSize };
    }
  }

  // Sorting
  if (urlState.sort) {
    try {
      const sorting: TableSorting[] = urlState.sort
        .split(',')
        .map((sortStr) => {
          const [id, direction] = sortStr.split(':');
          return {
            id,
            desc: direction === 'desc',
          };
        })
        // Filter out invalid entries
        .filter((sort) => sort.id);

      if (sorting.length > 0) {
        state.sorting = sorting;
      }
    } catch (error) {
      console.warn('Failed to deserialize sorting from URL:', error);
    }
  }

  // Filters
  if (urlState.filters) {
    try {
      const filters: unknown = JSON.parse(atob(urlState.filters));
      if (Array.isArray(filters)) {
        // SAFETY: the param is produced by serializeTableState from TableFilter[]; element shape is not re-validated here
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Array.isArray narrows to any[]; see SAFETY above
        state.filters = filters as TableFilter[];
      }
    } catch (error) {
      console.warn('Failed to deserialize filters from URL:', error);
    }
  }

  // Global Filter (Search)
  if (urlState.search) {
    state.globalFilter = urlState.search;
  }

  // Active View
  if (urlState.view) {
    state.activeViewId = urlState.view;
  }

  return state;
};

// URL State Validation

interface UrlStateValidation {
  isValid: boolean;
  errors: string[];
}

export const validateUrlState = (urlState: Record<string, string>): UrlStateValidation => {
  const errors: string[] = [];

  // Validate pagination
  if (urlState.page) {
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- must mirror the lenient parseInt in deserializeTableState
    const pageNum = Number.parseInt(urlState.page, 10);
    if (Number.isNaN(pageNum) || pageNum < 1) {
      errors.push('Invalid page number');
    }
  }

  if (urlState.pageSize) {
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- must mirror the lenient parseInt in deserializeTableState
    const pageSizeNum = Number.parseInt(urlState.pageSize, 10);
    if (Number.isNaN(pageSizeNum) || pageSizeNum < 1) {
      errors.push('Invalid page size');
    }
  }

  // Validate sorting
  if (urlState.sort) {
    try {
      const sortParts = urlState.sort.split(',');
      for (const sortPart of sortParts) {
        const [id, direction] = sortPart.split(':');
        if (!id || !['asc', 'desc'].includes(direction)) {
          errors.push(`Invalid sort parameter: ${sortPart}`);
          break;
        }
      }
    } catch {
      errors.push('Invalid sort format');
    }
  }

  // Validate filters (basic structure check)
  if (urlState.filters) {
    try {
      const filters: unknown = JSON.parse(atob(urlState.filters));
      if (!Array.isArray(filters)) {
        errors.push('Filters must be an array');
      }
    } catch {
      errors.push('Invalid filters format');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// URL State Compression/Decompression
