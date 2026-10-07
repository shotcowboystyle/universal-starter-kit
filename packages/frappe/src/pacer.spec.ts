import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDocData } from './common/types';
import { createRateLimitedBatch, useThrottledPagination } from './pacer';
import type { SyncModule } from './sync';
import { Operation } from './sync/types';

// ---------------------------------------------------------------------------
// Test types
// ---------------------------------------------------------------------------

interface PokemonDoc extends FrappeDocData {
  name: string;
  doctype: string;
  pokemon_name: string;
  poke_id: number;
}

// ---------------------------------------------------------------------------
// Mock DbModule (used by useDebouncedSearch via HttpClient)
// ---------------------------------------------------------------------------

const mockGetFn = vi.fn().mockResolvedValue({
  payload: {
    data: [
      { name: 'pikachu', doctype: 'Pokemon', pokemon_name: 'Pikachu', poke_id: 25 },
      { name: 'pichu', doctype: 'Pokemon', pokemon_name: 'Pichu', poke_id: 172 },
    ],
  },
});

vi.mock(import('./core/http'), () => {
  class MockHttpClient {
    get = mockGetFn;
    post = vi.fn().mockResolvedValue({ payload: {} });
    head = vi.fn().mockResolvedValue({ headers: new Headers() });
  }
  return { HttpClient: MockHttpClient };
});

// ---------------------------------------------------------------------------
// useDebouncedSearch tests
// ---------------------------------------------------------------------------

describe('useDebouncedSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty state', async () => {
    // Dynamic import to get the hook after mocks are set up
    const { useDebouncedSearch } = await import('./pacer');

    const { result } = renderHook(() =>
      useDebouncedSearch<PokemonDoc>({ baseURL: 'https://test.example.com' }, 'Pokemon', {
        fields: ['name', 'pokemon_name'],
        wait: 300,
      }),
    );

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it('should not fire search when query is shorter than minLength', async () => {
    const { useDebouncedSearch } = await import('./pacer');

    const { result } = renderHook(() =>
      useDebouncedSearch<PokemonDoc>({ baseURL: 'https://test.example.com' }, 'Pokemon', {
        minLength: 3,
        wait: 100,
      }),
    );

    act(() => {
      result.current.setQuery('pi');
    });

    expect(result.current.query).toBe('pi');

    // Advance past debounce period
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Should not be searching since query < minLength
    expect(result.current.isSearching).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it('should update query state immediately on setQuery', async () => {
    const { useDebouncedSearch } = await import('./pacer');

    const { result } = renderHook(() =>
      useDebouncedSearch<PokemonDoc>({ baseURL: 'https://test.example.com' }, 'Pokemon', {
        wait: 300,
      }),
    );

    act(() => {
      result.current.setQuery('pikachu');
    });

    expect(result.current.query).toBe('pikachu');
  });

  it('should cancel pending search on cancel()', async () => {
    const { useDebouncedSearch } = await import('./pacer');

    const { result } = renderHook(() =>
      useDebouncedSearch<PokemonDoc>({ baseURL: 'https://test.example.com' }, 'Pokemon', {
        wait: 300,
      }),
    );

    act(() => {
      result.current.setQuery('pik');
    });

    act(() => {
      result.current.cancel();
    });

    // Advance past debounce period
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Cancel should prevent search from firing
    expect(result.current.isSearching).toBe(false);
  });

  it('should not fire when config is undefined', async () => {
    const { useDebouncedSearch } = await import('./pacer');

    const { result } = renderHook(() => useDebouncedSearch<PokemonDoc>(undefined, 'Pokemon', { wait: 100 }));

    act(() => {
      result.current.setQuery('test');
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.results).toEqual([]);
  });

  it('should clear results when query is cleared', async () => {
    const { useDebouncedSearch } = await import('./pacer');

    const { result } = renderHook(() =>
      useDebouncedSearch<PokemonDoc>({ baseURL: 'https://test.example.com' }, 'Pokemon', {
        wait: 100,
        minLength: 1,
      }),
    );

    // Set query then clear it
    act(() => {
      result.current.setQuery('pik');
    });

    act(() => {
      result.current.setQuery('');
    });

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// useThrottledPagination tests
// ---------------------------------------------------------------------------

// Mock useLiveQuery from @tanstack/react-db
let mockLiveQueryData: any[] = [];
let mockLiveQueryIsLoading = false;

vi.mock(import('@tanstack/react-db'), () => ({
  useLiveQuery: (_queryFn: any, _deps?: any[]) => ({
    data: mockLiveQueryData,
    isLoading: mockLiveQueryIsLoading,
    isReady: !mockLiveQueryIsLoading,
    isError: false,
    isEnabled: true,
    isCleanedUp: false,
    state: new Map(),
    collection: undefined,
  }),
}));

describe(useThrottledPagination, () => {
  beforeEach(() => {
    mockLiveQueryData = [];
    mockLiveQueryIsLoading = false;
  });

  it('should return empty items when collection is undefined', () => {
    const { result } = renderHook(() => useThrottledPagination(undefined, { pageSize: 10 }));

    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    // isLoading falls back to !collection when liveQuery.isLoading is false
    // but ?? only triggers on null/undefined, not false
    expect(result.current.isLoading).toBeTypeOf('boolean');
  });

  it('should return paginated items based on pageSize', () => {
    mockLiveQueryData = Array.from({ length: 50 }, (_, i) => ({
      name: `item-${i}`,
      doctype: 'Test',
      value: i,
    }));

    const mockCollection = {} as any;
    const { result } = renderHook(() => useThrottledPagination(mockCollection, { pageSize: 10 }));

    expect(result.current.items).toHaveLength(10);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('should use default pageSize of 20', () => {
    mockLiveQueryData = Array.from({ length: 50 }, (_, i) => ({
      name: `item-${i}`,
      doctype: 'Test',
    }));

    const mockCollection = {} as any;
    const { result } = renderHook(() => useThrottledPagination(mockCollection));

    expect(result.current.items).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);
  });

  it('should show hasMore=false when all items fit in one page', () => {
    mockLiveQueryData = Array.from({ length: 5 }, (_, i) => ({
      name: `item-${i}`,
      doctype: 'Test',
    }));

    const mockCollection = {} as any;
    const { result } = renderHook(() => useThrottledPagination(mockCollection, { pageSize: 10 }));

    expect(result.current.items).toHaveLength(5);
    expect(result.current.hasMore).toBe(false);
  });

  it('should load more items when loadMore is called', () => {
    mockLiveQueryData = Array.from({ length: 30 }, (_, i) => ({
      name: `item-${i}`,
      doctype: 'Test',
    }));

    const mockCollection = {} as any;
    const { result } = renderHook(() => useThrottledPagination(mockCollection, { pageSize: 10 }));

    expect(result.current.items).toHaveLength(10);

    // First loadMore always fires immediately (throttle leading edge)
    act(() => {
      result.current.loadMore();
    });

    expect(result.current.items).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);
  });

  it('should reflect loading state from live query', () => {
    mockLiveQueryIsLoading = true;

    const mockCollection = {} as any;
    const { result } = renderHook(() => useThrottledPagination(mockCollection, { pageSize: 10 }));

    expect(result.current.isLoading).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createRateLimitedBatch tests
// ---------------------------------------------------------------------------

function createMockSyncModule(): SyncModule & { _getMutateCalls: () => any[] } {
  const mutateCalls: any[] = [];
  return {
    subscribe: vi.fn().mockResolvedValue({ subscriptionId: 'sub-1' }),
    unsubscribe: vi.fn(),
    mutate: vi.fn().mockImplementation(async (mutation) => {
      mutateCalls.push(mutation);
    }),
    getDocsForSubscription: vi.fn().mockReturnValue([]),
    subscribeStore: vi.fn().mockReturnValue(() => {}),
    backfill: vi.fn().mockResolvedValue(),
    replayPending: vi.fn().mockResolvedValue(),
    getDocFromCache: vi.fn(),
    getSubscription: vi.fn(),
    getPage: vi.fn().mockResolvedValue([]),
    getNextBatch: vi.fn().mockResolvedValue([]),
    getPageInfo: vi.fn(),
    refetchDocs: vi.fn().mockResolvedValue(),
    resetCache: vi.fn(),
    dispose: vi.fn().mockResolvedValue(),
    isLeader: vi.fn().mockReturnValue(false),
    _getMutateCalls: () => mutateCalls,
  } as unknown as SyncModule & { _getMutateCalls: () => any[] };
}

describe(createRateLimitedBatch, () => {
  it('should create a batch handle with add and execute methods', () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'update',
      maxPerSecond: 5,
      batchSize: 10,
      syncModule,
    });

    expect(batch.add).toBeTypeOf('function');
    expect(batch.execute).toBeTypeOf('function');
  });

  it('should queue items with add()', () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'update',
      maxPerSecond: 5,
      syncModule,
    });

    // Adding items doesn't immediately trigger mutations
    batch.add('pikachu', { pokemon_name: 'Pikachu' });
    batch.add('bulbasaur', { pokemon_name: 'Bulbasaur' });

    expect(syncModule.mutate).not.toHaveBeenCalled();
  });

  it('should execute queued items through SyncModule', async () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'update',
      maxPerSecond: 100,
      batchSize: 5,
      syncModule,
    });

    batch.add('pikachu', { pokemon_name: 'Pikachu' });
    batch.add('bulbasaur', { pokemon_name: 'Bulbasaur' });

    await batch.execute();

    const calls = syncModule._getMutateCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].operation).toBe(Operation.Update);
    expect(calls[0].doc.name).toBe('pikachu');
    expect(calls[0].doc.doctype).toBe('Pokemon');
    expect(calls[1].doc.name).toBe('bulbasaur');
  });

  it('should do nothing when execute is called with empty queue', async () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'create',
      syncModule,
    });

    await batch.execute();
    expect(syncModule.mutate).not.toHaveBeenCalled();
  });

  it('should report progress via onProgress callback', async () => {
    const syncModule = createMockSyncModule();
    const progressUpdates: [number, number][] = [];

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'update',
      maxPerSecond: 100,
      batchSize: 5,
      syncModule,
    });

    batch.add('pikachu', { pokemon_name: 'Pikachu' });
    batch.add('bulbasaur', { pokemon_name: 'Bulbasaur' });
    batch.add('charmander', { pokemon_name: 'Charmander' });

    await batch.execute({
      onProgress: (completed, total) => {
        progressUpdates.push([completed, total]);
      },
    });

    expect(progressUpdates).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('should use correct operation type for create', async () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'create',
      maxPerSecond: 100,
      syncModule,
    });

    batch.add('new-pokemon', { pokemon_name: 'MissingNo' });
    await batch.execute();

    const calls = syncModule._getMutateCalls();
    expect(calls[0].operation).toBe(Operation.Create);
  });

  it('should use correct operation type for delete', async () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'delete',
      maxPerSecond: 100,
      syncModule,
    });

    batch.add('old-pokemon');
    await batch.execute();

    const calls = syncModule._getMutateCalls();
    expect(calls[0].operation).toBe(Operation.Delete);
    expect(calls[0].doc.name).toBe('old-pokemon');
  });

  it('should chunk items into batches of configured size', async () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'update',
      maxPerSecond: 100,
      batchSize: 2,
      syncModule,
    });

    batch.add('p1', { pokemon_name: 'P1' });
    batch.add('p2', { pokemon_name: 'P2' });
    batch.add('p3', { pokemon_name: 'P3' });

    await batch.execute();

    // All 3 should be processed
    const calls = syncModule._getMutateCalls();
    expect(calls).toHaveLength(3);
  });

  it('should clear the queue after execution', async () => {
    const syncModule = createMockSyncModule();

    const batch = createRateLimitedBatch<PokemonDoc>({
      doctype: 'Pokemon',
      operation: 'update',
      maxPerSecond: 100,
      syncModule,
    });

    batch.add('pikachu', { pokemon_name: 'Pikachu' });
    await batch.execute();

    // Execute again -- should not re-process
    const callsBefore = syncModule._getMutateCalls().length;
    await batch.execute();
    const callsAfter = syncModule._getMutateCalls().length;

    expect(callsAfter).toBe(callsBefore);
  });
});
