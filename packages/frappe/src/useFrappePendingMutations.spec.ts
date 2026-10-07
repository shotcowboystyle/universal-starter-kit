/**
 * useFrappePendingMutations contract specs.
 *
 * This hook is the state behind the rejected-write UI contract: a surface
 * that started an optimistic write reads `failed` from here and renders it
 * inline (frappe-ui's SyncErrorNotice), with `retry` and `dismiss` as the two
 * ways out. Three things are worth pinning, because each has a silent failure
 * mode:
 *
 *  - the SPLIT. `pending` and `failed` are derived from one ledger read, so a
 *    mis-filtered status would show a rejected write as still in flight.
 *  - the SIGNATURE GUARD. The hook re-reads on every store emit but only
 *    re-renders when ids × status × retryCount move; a broken guard turns a
 *    busy sync engine into a render storm.
 *  - the SCOPE. `doctype` narrows the ledger, and re-scoping has to re-read.
 *
 * The sync engine is mocked the same way frappeReact.spec.ts mocks it: the
 * hook's whole dependency on it is getMutationEntries / subscribeStore /
 * replayPending / dismissMutation.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetMutationEntries, mockSubscribeStore, mockReplayPending, mockDismissMutation } = vi.hoisted(() => ({
  mockGetMutationEntries: vi.fn(),
  mockSubscribeStore: vi.fn(),
  mockReplayPending: vi.fn(),
  mockDismissMutation: vi.fn(),
}));

vi.mock(import('./sync'), () => ({
  SyncModule: class {
    getMutationEntries = mockGetMutationEntries;
    subscribeStore = mockSubscribeStore;
    replayPending = mockReplayPending;
    dismissMutation = mockDismissMutation;
    subscribe = vi.fn();
    unsubscribe = vi.fn();
  },
}));
vi.mock(import('./realtime'), () => ({ RealtimeModule: class {} }));
vi.mock(import('./core/http'), () => ({ HttpClient: class {} }));
vi.mock(import('./db'), () => ({ DbModule: class {} }));
vi.mock(import('./collection'), () => ({
  createFrappeCollection: vi.fn(),
  releaseFrappeCollectionSync: () => false,
}));
vi.mock(import('./fixtureDb'), () => ({ FixtureDbModule: class {} }));

const { mockIsBrowser } = vi.hoisted(() => ({ mockIsBrowser: vi.fn(() => true) }));
vi.mock(import('./util'), () => ({ isBrowser: mockIsBrowser }));

import { useFrappePendingMutations } from './frappeReact';
import type { DebugMutationEntry } from './sync/types';
import { Operation, Status } from './sync/types';

function entry(id: string, status: Status, overrides: Partial<DebugMutationEntry> = {}): DebugMutationEntry {
  return {
    id,
    operation: Operation.Update,
    doctype: 'ToDo',
    docname: id.toUpperCase(),
    status,
    createdAt: 1_700_000_000_000,
    retryCount: 0,
    ...overrides,
  };
}

let storeListener: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  storeListener = undefined;
  mockIsBrowser.mockReturnValue(true);
  mockGetMutationEntries.mockReturnValue([]);
  mockSubscribeStore.mockImplementation((listener: () => void) => {
    storeListener = listener;
    return () => {
      storeListener = undefined;
    };
  });
});

// A distinct baseURL per test keeps the module-level SyncModule cache from
// handing one test the engine another test configured.
let n = 0;
const freshConfig = () => ({ baseURL: `https://ledger-${++n}.test` });

describe('useFrappePendingMutations ledger split', () => {
  it('splits one ledger read into pending and failed', () => {
    mockGetMutationEntries.mockReturnValue([
      entry('a', Status.Pending),
      entry('b', Status.Failed, { error: 'rejected' }),
      entry('c', Status.Pending),
    ]);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(result.current.entries).toHaveLength(3);
    expect(result.current.pending.map((e) => e.id)).toEqual(['a', 'c']);
    expect(result.current.failed.map((e) => e.id)).toEqual(['b']);
  });

  it('a confirmed entry is neither pending nor failed', () => {
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Confirmed), entry('b', Status.Failed)]);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(result.current.pending).toHaveLength(0);
    expect(result.current.failed.map((e) => e.id)).toEqual(['b']);
  });

  it('an empty ledger yields empty arrays, never undefined', () => {
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(result.current.entries).toEqual([]);
    expect(result.current.pending).toEqual([]);
    expect(result.current.failed).toEqual([]);
  });

  it('no config means no ledger and no engine read', () => {
    const { result } = renderHook(() => useFrappePendingMutations());
    expect(result.current.entries).toEqual([]);
    expect(mockGetMutationEntries).not.toHaveBeenCalled();
  });

  it('outside a browser the hook stays empty (server render)', () => {
    mockIsBrowser.mockReturnValue(false);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(result.current.entries).toEqual([]);
    expect(mockGetMutationEntries).not.toHaveBeenCalled();
  });
});

describe('useFrappePendingMutations reactivity', () => {
  it('subscribes to the store and re-reads on an emit', async () => {
    mockGetMutationEntries.mockReturnValue([]);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(mockSubscribeStore).toHaveBeenCalledWith();
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Failed, { error: 'boom' })]);
    act(() => storeListener?.());
    await waitFor(() => {
      expect(result.current.failed).toHaveLength(1);
    });
    expect(result.current.failed[0]?.error).toBe('boom');
  });

  it('an emit that does not move the ledger does not produce a new result object', () => {
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Pending)]);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    const before = result.current;
    act(() => storeListener?.());
    act(() => storeListener?.());
    expect(result.current).toBe(before);
  });

  it('a retryCount bump is a real change and does reach the caller', async () => {
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Failed, { retryCount: 0 })]);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(result.current.failed[0]?.retryCount).toBe(0);
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Failed, { retryCount: 1 })]);
    act(() => storeListener?.());
    await waitFor(() => {
      expect(result.current.failed[0]?.retryCount).toBe(1);
    });
  });

  it('a status change from pending to failed moves the entry between the lists', async () => {
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Pending)]);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(result.current.pending).toHaveLength(1);
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Failed, { error: 'nope' })]);
    act(() => storeListener?.());
    await waitFor(() => {
      expect(result.current.failed).toHaveLength(1);
    });
    expect(result.current.pending).toHaveLength(0);
  });

  it('unsubscribes from the store on unmount', () => {
    const { unmount } = renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(storeListener).toBeTypeOf('function');
    unmount();
    expect(storeListener).toBeUndefined();
  });
});

describe('useFrappePendingMutations doctype scope', () => {
  it('passes the doctype through to the ledger read', () => {
    renderHook(() => useFrappePendingMutations(freshConfig(), 'Note'));
    expect(mockGetMutationEntries).toHaveBeenCalledWith('Note');
  });

  it('an unscoped hook reads the whole ledger', () => {
    renderHook(() => useFrappePendingMutations(freshConfig()));
    expect(mockGetMutationEntries).toHaveBeenCalledWith(undefined);
  });

  it('re-scoping re-reads with the new doctype', () => {
    const config = freshConfig();
    const { rerender } = renderHook(({ doctype }: { doctype: string }) => useFrappePendingMutations(config, doctype), {
      initialProps: { doctype: 'ToDo' },
    });
    expect(mockGetMutationEntries).toHaveBeenCalledWith('ToDo');
    rerender({ doctype: 'Note' });
    expect(mockGetMutationEntries).toHaveBeenCalledWith('Note');
  });
});

describe('useFrappePendingMutations retry and dismiss', () => {
  it('retry replays the pending queue on the engine', async () => {
    mockReplayPending.mockResolvedValue();
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    await act(async () => {
      await result.current.retry();
    });
    expect(mockReplayPending).toHaveBeenCalledOnce();
  });

  it('dismiss drops one entry by id, not the whole ledger', () => {
    mockGetMutationEntries.mockReturnValue([entry('a', Status.Failed)]);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    act(() => {
      result.current.dismiss('a');
    });
    expect(mockDismissMutation).toHaveBeenCalledWith('a');
    expect(mockDismissMutation).toHaveBeenCalledOnce();
  });

  it('retry and dismiss are stable across re-renders', () => {
    const config = freshConfig();
    const { result, rerender } = renderHook(() => useFrappePendingMutations(config));
    const { retry, dismiss } = result.current;
    rerender();
    expect(result.current.retry).toBe(retry);
    expect(result.current.dismiss).toBe(dismiss);
  });

  it('retry with no engine resolves rather than throwing', async () => {
    mockIsBrowser.mockReturnValue(false);
    const { result } = renderHook(() => useFrappePendingMutations(freshConfig()));
    await expect(result.current.retry()).resolves.toBeUndefined();
  });
});
