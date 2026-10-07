import type { DataTableState, TableFilter, TableSorting } from '../types';

import { DEFAULT_PAGE_SIZE } from './paginationDefaults';

// URL State Serialization

export function serializeTableState(state: Partial<DataTableState>): Record<string, string> {
  const urlState: Record<string, string> = {};

  // Pagination
  if (state.pagination) {
    urlState.page = String(state.pagination.pageIndex + 1); // 1-based for URL
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
  if (state.globalFilter) {
    urlState.search = state.globalFilter;
  }

  // Active View
  if (state.activeViewId) {
    urlState.view = state.activeViewId;
  }

  return urlState;
}

// URL State Deserialization

export function deserializeTableState(urlState: Record<string, string>): Partial<DataTableState> {
  const state: Partial<DataTableState> = {};

  // Pagination
  if (urlState.page) {
    const pageIndex = Number.parseInt(urlState.page, 10) - 1; // Convert to 0-based
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
        .filter((sort) => sort.id); // Filter out invalid entries

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
      const filters: TableFilter[] = JSON.parse(atob(urlState.filters));
      if (Array.isArray(filters)) {
        state.filters = filters;
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
}

// URL State Validation

export function validateUrlState(urlState: Record<string, string>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate pagination
  if (urlState.page) {
    const pageNum = Number.parseInt(urlState.page, 10);
    if (Number.isNaN(pageNum) || pageNum < 1) {
      errors.push('Invalid page number');
    }
  }

  if (urlState.pageSize) {
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
      const filters = JSON.parse(atob(urlState.filters));
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
}

// URL State Compression/Decompression
