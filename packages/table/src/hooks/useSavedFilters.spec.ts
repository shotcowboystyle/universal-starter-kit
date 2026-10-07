import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSavedFilters } from './useSavedFilters';
import type { SavedFilter, SavedFiltersStorage } from './useSavedFilters';

describe(useSavedFilters, () => {
  describe('in-memory mode (no storage)', () => {
    it('starts with empty filters when no initialFilters provided', () => {
      const { result } = renderHook(() => useSavedFilters());

      expect(result.current.filters).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('initializes with provided initialFilters', () => {
      const initial: SavedFilter[] = [
        {
          name: 'f1',
          filter_name: 'Active Users',
          for_user: 'user@example.com',
          filters: JSON.stringify([['status', 'is', 'active']]),
        },
        {
          name: 'f2',
          filter_name: 'Global Filter',
          for_user: '',
          filters: JSON.stringify([['priority', 'is', 'high']]),
        },
      ];

      const { result } = renderHook(() => useSavedFilters({ initialFilters: initial }));

      expect(result.current.filters).toHaveLength(2);
      expect(result.current.filters[0].filter_name).toBe('Active Users');
      expect(result.current.filters[0].isGlobal).toBe(false);
      expect(result.current.filters[1].filter_name).toBe('Global Filter');
      expect(result.current.filters[1].isGlobal).toBe(true);
    });

    it('saves a filter in memory', async () => {
      const { result } = renderHook(() => useSavedFilters({ userId: 'user@test.com' }));

      await act(async () => {
        await result.current.saveFilter('My Filter', [['name', 'contains', 'test']], false);
      });

      expect(result.current.filters).toHaveLength(1);
      expect(result.current.filters[0].filter_name).toBe('My Filter');
      expect(result.current.filters[0].for_user).toBe('user@test.com');
      expect(result.current.filters[0].isGlobal).toBe(false);
      expect(result.current.filters[0].filters).toEqual([['name', 'contains', 'test']]);
    });

    it('saves a global filter in memory', async () => {
      const { result } = renderHook(() => useSavedFilters({ userId: 'user@test.com' }));

      await act(async () => {
        await result.current.saveFilter('Global Filter', [['status', 'is', 'active']], true);
      });

      expect(result.current.filters).toHaveLength(1);
      expect(result.current.filters[0].for_user).toBe('');
      expect(result.current.filters[0].isGlobal).toBe(true);
    });

    it('deletes a filter from memory', async () => {
      const initial: SavedFilter[] = [
        {
          name: 'f1',
          filter_name: 'Filter One',
          for_user: '',
          filters: JSON.stringify([['a', 'is', 'b']]),
        },
        {
          name: 'f2',
          filter_name: 'Filter Two',
          for_user: '',
          filters: JSON.stringify([['c', 'is', 'd']]),
        },
      ];

      const { result } = renderHook(() => useSavedFilters({ initialFilters: initial }));

      expect(result.current.filters).toHaveLength(2);

      await act(async () => {
        await result.current.deleteFilter('f1');
      });

      expect(result.current.filters).toHaveLength(1);
      expect(result.current.filters[0].name).toBe('f2');
    });

    it('retrieves a filter by name', () => {
      const initial: SavedFilter[] = [
        {
          name: 'f1',
          filter_name: 'First',
          for_user: '',
          filters: JSON.stringify([['x', 'is', 'y']]),
        },
      ];

      const { result } = renderHook(() => useSavedFilters({ initialFilters: initial }));

      expect(result.current.getFilterByName('f1')).toBeDefined();
      expect(result.current.getFilterByName('f1')?.filter_name).toBe('First');
      expect(result.current.getFilterByName('nonexistent')).toBeUndefined();
    });

    it('handles malformed filter JSON gracefully', () => {
      const initial: SavedFilter[] = [
        {
          name: 'bad',
          filter_name: 'Bad Filter',
          for_user: '',
          filters: 'not valid json{{{',
        },
        {
          name: 'good',
          filter_name: 'Good Filter',
          for_user: '',
          filters: JSON.stringify([['a', 'is', 'b']]),
        },
      ];

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useSavedFilters({ initialFilters: initial }));

      // Should skip the malformed filter and include the valid one
      expect(result.current.filters).toHaveLength(1);
      expect(result.current.filters[0].name).toBe('good');
      consoleError.mockRestore();
    });
  });

  describe('with storage adapter', () => {
    it('loads filters from storage on mount', async () => {
      const storedFilters: SavedFilter[] = [
        {
          name: 'stored-1',
          filter_name: 'From Storage',
          for_user: '',
          filters: JSON.stringify([['field', 'is', 'value']]),
        },
      ];

      const storage: SavedFiltersStorage = {
        load: vi.fn().mockResolvedValue(storedFilters),
        save: vi.fn(),
        remove: vi.fn(),
      };

      const { result } = renderHook(() => useSavedFilters({ storage }));

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.filters).toHaveLength(1);
      expect(result.current.filters[0].filter_name).toBe('From Storage');
      expect(storage.load).toHaveBeenCalledOnce();
    });

    it('saves and reloads via storage adapter', async () => {
      const stored: SavedFilter[] = [];
      const storage: SavedFiltersStorage = {
        load: vi.fn().mockResolvedValue([...stored]),
        save: vi.fn().mockImplementation(async (filter: SavedFilter) => {
          stored.push(filter);
          return Promise.resolve();
        }),
        remove: vi.fn(),
      };

      const { result } = renderHook(() => useSavedFilters({ storage, userId: 'me' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.saveFilter('New', [['a', 'is', 'b']]);
      });

      expect(storage.save).toHaveBeenCalledOnce();
      // load is called on mount + after save
      expect(storage.load).toHaveBeenCalledTimes(2);
    });

    it('deletes via storage adapter', async () => {
      const stored: SavedFilter[] = [
        {
          name: 'to-delete',
          filter_name: 'Delete Me',
          for_user: '',
          filters: JSON.stringify([['a', 'is', 'b']]),
        },
      ];

      const storage: SavedFiltersStorage = {
        load: vi.fn().mockResolvedValue([...stored]),
        save: vi.fn(),
        remove: vi.fn().mockImplementation(async (name: string) => {
          const idx = stored.findIndex((f) => f.name === name);
          if (idx !== -1) {
            stored.splice(idx, 1);
          }
          return Promise.resolve();
        }),
      };

      const { result } = renderHook(() => useSavedFilters({ storage }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.filters).toHaveLength(1);

      await act(async () => {
        await result.current.deleteFilter('to-delete');
      });

      expect(storage.remove).toHaveBeenCalledWith('to-delete');
      expect(storage.load).toHaveBeenCalledTimes(2);
    });
  });
});
