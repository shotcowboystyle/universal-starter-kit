import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * A raw saved filter record as stored in persistence.
 */
export interface SavedFilter {
  name: string;
  filter_name?: string;
  for_user?: string;
  filters?: string;
  [key: string]: unknown;
}

/**
 * A parsed, ready-to-use saved filter.
 */
export interface ParsedFilter {
  name: string;
  filter_name: string;
  for_user: string;
  filters: [string, string, unknown][];
  isGlobal: boolean;
}

/**
 * Generic storage adapter for saved filters.
 * Implement this interface to connect to any persistence backend
 * (REST API, localStorage, IndexedDB, Frappe, etc.).
 */
export interface SavedFiltersStorage {
  /** Load all saved filters for a given context */
  load: () => Promise<SavedFilter[]> | SavedFilter[];
  /** Persist a new saved filter */
  save: (filter: SavedFilter) => Promise<void> | void;
  /** Remove a saved filter by name/id */
  remove: (name: string) => Promise<void> | void;
}

export interface UseSavedFiltersOptions {
  /** Storage adapter for persistence. If omitted, filters are kept in memory only. */
  storage?: SavedFiltersStorage;
  /** Pre-populated filters (useful for testing or SSR) */
  initialFilters?: SavedFilter[];
  /** Current user ID (used to determine isGlobal) */
  userId?: string;
}

export interface SavedFiltersHook {
  filters: ParsedFilter[];
  isLoading: boolean;
  saveFilter: (filterName: string, filterArray: [string, string, unknown][], isGlobal?: boolean) => Promise<void>;
  deleteFilter: (name: string) => Promise<void>;
  getFilterByName: (name: string) => ParsedFilter | undefined;
}

function parseRawFilter(filter: SavedFilter): ParsedFilter | null {
  try {
    const filtersStr = String(filter.filters ?? '[]');
    const filterArray = JSON.parse(filtersStr);
    return {
      name: filter.name || '',
      filter_name: String(filter.filter_name ?? ''),
      for_user: String(filter.for_user ?? ''),
      filters: Array.isArray(filterArray) ? filterArray : [],
      isGlobal: !filter.for_user || filter.for_user === '',
    };
  } catch (error) {
    console.error('Failed to parse filter:', filter, error);
    return null;
  }
}

/**
 * Generic hook for managing saved filters with optional persistence.
 *
 * This hook is storage-agnostic — provide a `SavedFiltersStorage` adapter
 * to connect to any backend, or omit it for in-memory-only operation.
 *
 * @example
 * ```tsx
 * // In-memory only
 * const { filters, saveFilter } = useSavedFilters();
 *
 * // With localStorage persistence
 * const { filters, saveFilter } = useSavedFilters({
 *   storage: {
 *     load: () => JSON.parse(localStorage.getItem('filters') || '[]'),
 *     save: (f) => {
 *       const all = JSON.parse(localStorage.getItem('filters') || '[]');
 *       all.push(f);
 *       localStorage.setItem('filters', JSON.stringify(all));
 *     },
 *     remove: (name) => {
 *       const all = JSON.parse(localStorage.getItem('filters') || '[]');
 *       localStorage.setItem('filters', JSON.stringify(all.filter(f => f.name !== name)));
 *     },
 *   },
 * });
 * ```
 */
export function useSavedFilters(options: UseSavedFiltersOptions = {}): SavedFiltersHook {
  const { storage, initialFilters, userId } = options;
  const [rawFilters, setRawFilters] = useState<SavedFilter[]>(initialFilters ?? []);
  const [isLoading, setIsLoading] = useState(!!storage);

  useEffect(() => {
    if (!storage) {
      return;
    }
    let cancelled = false;

    const loadFilters = async () => {
      setIsLoading(true);
      try {
        const loaded = await storage.load();
        if (!cancelled) {
          setRawFilters(loaded);
        }
      } catch (error) {
        console.error('Failed to load saved filters:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const parsedFilters = useMemo<ParsedFilter[]>(() => {
    if (!rawFilters || rawFilters.length === 0) {
      return [];
    }
    return rawFilters.map(parseRawFilter).filter((f): f is ParsedFilter => f !== null);
  }, [rawFilters]);

  const saveFilter = useCallback(
    async (filterName: string, filterArray: [string, string, unknown][], isGlobal = false) => {
      const newFilter: SavedFilter = {
        name: `filter-${Date.now()}`,
        filter_name: filterName,
        for_user: isGlobal ? '' : (userId ?? ''),
        filters: JSON.stringify(filterArray),
      };

      if (storage) {
        await storage.save(newFilter);
        // Reload from storage to stay in sync
        const loaded = await storage.load();
        setRawFilters(loaded);
      } else {
        setRawFilters((prev) => [...prev, newFilter]);
      }
    },
    [storage, userId],
  );

  const deleteFilter = useCallback(
    async (name: string) => {
      if (storage) {
        await storage.remove(name);
        const loaded = await storage.load();
        setRawFilters(loaded);
      } else {
        setRawFilters((prev) => prev.filter((f) => f.name !== name));
      }
    },
    [storage],
  );

  const getFilterByName = useCallback(
    (name: string) => parsedFilters.find((f) => f.name === name),
    [parsedFilters],
  );

  return {
    filters: parsedFilters,
    isLoading,
    saveFilter,
    deleteFilter,
    getFilterByName,
  };
}
