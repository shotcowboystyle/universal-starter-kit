import { setTimeout as sleep } from 'node:timers/promises';

import type { SyncConfig } from '@tanstack/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { frappeCollectionOptions, createFrappeCollection } from './collection';
import type { FrappeCollectionOptionsConfig } from './collection';
import type { FrappeDocData } from './common/types';
import type { SyncModule } from './sync';
import { Operation } from './sync/types';

interface TestDoc extends FrappeDocData {
  name: string;
  doctype: string;
  title: string;
  status: string;
}

const createMockSyncModule = () => {
  const listeners = new Set<() => void>();
  let subscriptionDocs: TestDoc[] = [];
  const subscribe = vi.fn<() => Promise<{ subscriptionId: string }>>(async () => ({ subscriptionId: 'sub-123' }));
  const mutate = vi.fn<SyncModule['mutate']>().mockResolvedValue();

  const sync = {
    subscribe,
    unsubscribe: vi.fn<SyncModule['unsubscribe']>(),
    mutate,
    getDocsForSubscription: vi.fn<() => TestDoc[]>(() => subscriptionDocs),
    subscribeStore: vi.fn<SyncModule['subscribeStore']>((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    backfill: vi.fn<() => Promise<void>>().mockResolvedValue(),
    replayPending: vi.fn<() => Promise<void>>().mockResolvedValue(),
    getDocFromCache: vi.fn<SyncModule['getDocFromCache']>(),
    getSubscription: vi.fn<SyncModule['getSubscription']>(),
    getPage: vi.fn<() => Promise<TestDoc[]>>().mockResolvedValue([]),
    getNextBatch: vi.fn<() => Promise<TestDoc[]>>().mockResolvedValue([]),
    getPageInfo: vi.fn<SyncModule['getPageInfo']>(),
    refetchDocs: vi.fn<() => Promise<void>>().mockResolvedValue(),
    resetCache: vi.fn<SyncModule['resetCache']>(),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(),
    isLeader: vi.fn<() => boolean>().mockReturnValue(false),
    // Test helpers
    _setDocs: (docs: TestDoc[]) => {
      subscriptionDocs = docs;
    },
    _emitChange: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  } as unknown as SyncModule;

  return { sync, subscribe, mutate };
};

type SyncFn = SyncConfig<TestDoc, string>['sync'];
type SyncParams = Parameters<SyncFn>[0];
type OnSyncError = NonNullable<FrappeCollectionOptionsConfig<TestDoc>['onSyncError']>;

const createSyncParams = (): SyncParams => ({
  begin: vi.fn<SyncParams['begin']>(),
  write: vi.fn<SyncParams['write']>(),
  commit: vi.fn<SyncParams['commit']>(),
  markReady: vi.fn<SyncParams['markReady']>(),
  truncate: vi.fn<SyncParams['truncate']>(),
  collection: {} as any,
});

// `sync()` returns void, a cleanup function or a config object; only the function form needs running.
const runCleanup = (cleanup: ReturnType<SyncFn>) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- picks the cleanup-function variant of TanStack's sync() return union
  if (typeof cleanup === 'function') {
    cleanup();
  }
};

describe(frappeCollectionOptions, () => {
  let mockSync: SyncModule;
  let subscribeMock: ReturnType<typeof createMockSyncModule>['subscribe'];
  let mutateMock: ReturnType<typeof createMockSyncModule>['mutate'];

  beforeEach(() => {
    ({ sync: mockSync, subscribe: subscribeMock, mutate: mutateMock } = createMockSyncModule());
  });

  it('should return a valid collection config', () => {
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
    });

    expect(options).toBeDefined();
    expect(options.id).toBe('Task');
    expect(options.getKey).toBeDefined();
    expect(options.sync).toBeDefined();
    expect(options.onInsert).toBeDefined();
    expect(options.onUpdate).toBeDefined();
    expect(options.onDelete).toBeDefined();
  });

  it('should use custom id when provided', () => {
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
      id: 'custom-tasks',
    });

    expect(options.id).toBe('custom-tasks');
  });

  it('should extract key from doc name', () => {
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
    });

    const doc = { name: 'TASK-001', doctype: 'Task', title: 'Test', status: 'Open' } as TestDoc;
    expect(options.getKey(doc)).toBe('TASK-001');
  });

  it('onInsert should delegate to SyncModule.mutate with create operation', async () => {
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
    });

    const mockTransaction = {
      mutations: [
        {
          modified: { name: 'TASK-001', doctype: 'Task', title: 'New Task', status: 'Open' },
        },
      ],
    };

    await options.onInsert!({ transaction: mockTransaction } as any);

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: Operation.Create,
        doc: expect.objectContaining({
          doctype: 'Task',
          title: 'New Task',
        }),
      }),
    );
  });

  it('onUpdate should delegate to SyncModule.mutate with update operation', async () => {
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
    });

    const mockTransaction = {
      mutations: [
        {
          key: 'TASK-001',
          changes: { status: 'Closed' },
          modified: { name: 'TASK-001', doctype: 'Task', title: 'Test', status: 'Closed' },
        },
      ],
    };

    await options.onUpdate!({ transaction: mockTransaction } as any);

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: Operation.Update,
        doc: expect.objectContaining({
          doctype: 'Task',
          name: 'TASK-001',
        }),
      }),
    );
  });

  it('onDelete should delegate to SyncModule.mutate with delete operation', async () => {
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
    });

    const mockTransaction = {
      mutations: [
        {
          key: 'TASK-001',
        },
      ],
    };

    await options.onDelete!({ transaction: mockTransaction } as any);

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: Operation.Delete,
        doc: expect.objectContaining({
          doctype: 'Task',
          name: 'TASK-001',
        }),
      }),
    );
  });

  it('should pass fields and filters to subscription query', async () => {
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
      fields: ['name', 'title', 'status'],
      filters: { status: 'Open' },
    });

    // Trigger the sync function to create the subscription
    const syncFn = options.sync.sync;
    const cleanup = syncFn(createSyncParams());

    // Wait for async initSync to complete
    await sleep(10);

    expect(subscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        doctype: 'Task',
        fields: ['name', 'title', 'status'],
        filters: { status: 'Open' },
      }),
    );

    // Cleanup
    runCleanup(cleanup);
  });

  it('calls onSyncError when the initial subscription fetch fails', async () => {
    const error = new Error('PermissionError: not permitted');
    subscribeMock.mockRejectedValueOnce(error);
    const onSyncError = vi.fn<OnSyncError>();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
      onSyncError,
    });

    const markReady = vi.fn<SyncParams['markReady']>();
    const syncFn = options.sync.sync;
    const cleanup = syncFn({ ...createSyncParams(), markReady });

    await sleep(10);

    expect(onSyncError).toHaveBeenCalledWith(error);
    // Collection still marks ready so consumers are never stuck loading
    expect(markReady).toHaveBeenCalledWith();

    consoleError.mockRestore();
    runCleanup(cleanup);
  });

  it('does not call onSyncError on a successful initial sync', async () => {
    const onSyncError = vi.fn<OnSyncError>();
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
      onSyncError,
    });

    const syncFn = options.sync.sync;
    const cleanup = syncFn(createSyncParams());

    await sleep(10);

    expect(onSyncError).not.toHaveBeenCalled();
    runCleanup(cleanup);
  });
});

describe(createFrappeCollection, () => {
  it('should create a TanStack DB collection', () => {
    const { sync: mockSync } = createMockSyncModule();

    const collection = createFrappeCollection<TestDoc>('Task', {
      sync: mockSync,
    });

    expect(collection).toBeDefined();
  });
});
