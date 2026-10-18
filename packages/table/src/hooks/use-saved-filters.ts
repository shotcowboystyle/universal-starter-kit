import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * A raw saved filter record as stored in persistence.
 */
export interface SavedFilter {
  name: string;
  filter_name?: string;
  for_user?: string;
  filters?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- storage records carry backend-specific extra fields this hook never reads
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

const parseRawFilter = (filter: SavedFilter): ParsedFilter | null => {
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- storage adapters return untyped records at runtime; coerce at this parse boundary
    const filtersStr = String(filter.filters ?? '[]');
    const filterArray: unknown = JSON.parse(filtersStr);
    return {
      name: filter.name || '',
      // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- storage adapters return untyped records at runtime; coerce at this parse boundary
      filter_name: String(filter.filter_name ?? ''),
      // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- storage adapters return untyped records at runtime; coerce at this parse boundary
      for_user: String(filter.for_user ?? ''),
      // SAFETY: saved filter payloads are Frappe-style [field, operator, value] tuples written by saveFilter
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tuple elements are not validated individually; consumers treat them as opaque filter triples
      filters: Array.isArray(filterArray) ? (filterArray as [string, string, unknown][]) : [],
      isGlobal: filter.for_user == null || filter.for_user === '',
    };
  } catch (error) {
    console.error('Failed to parse filter:', filter, error);
    return null;
  }
};

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
export const useSavedFilters = (options: UseSavedFiltersOptions = {}): SavedFiltersHook => {
  const { storage, initialFilters, userId } = options;
  const [rawFilters, setRawFilters] = useState<SavedFilter[]>(initialFilters ?? []);
  const [isLoading, setIsLoading] = useState(!!storage);

  useEffect(() => {
    if (!storage) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
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
      }
      if (!cancelled) {
        setIsLoading(false);
      }
    };

    void loadFilters();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const parsedFilters = useMemo<ParsedFilter[]>(() => {
    if (rawFilters.length === 0) {
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

  const getFilterByName = useCallback((name: string) => parsedFilters.find((f) => f.name === name), [parsedFilters]);

  return {
    filters: parsedFilters,
    isLoading,
    saveFilter,
    deleteFilter,
    getFilterByName,
  };
};
