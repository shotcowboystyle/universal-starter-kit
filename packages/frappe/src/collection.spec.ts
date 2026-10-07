import { beforeEach, describe, expect, it, vi } from 'vitest';

import { frappeCollectionOptions, createFrappeCollection } from './collection';
import type { FrappeDocData } from './common/types';
import type { SyncModule } from './sync';
import { Operation } from './sync/types';

interface TestDoc extends FrappeDocData {
  name: string;
  doctype: string;
  title: string;
  status: string;
}

function createMockSyncModule(): SyncModule {
  const listeners = new Set<() => void>();
  let subscriptionDocs: TestDoc[] = [];

  return {
    subscribe: vi.fn().mockImplementation(async () => ({ subscriptionId: 'sub-123' })),
    unsubscribe: vi.fn(),
    mutate: vi.fn().mockResolvedValue(),
    getDocsForSubscription: vi.fn().mockImplementation(() => subscriptionDocs),
    subscribeStore: vi.fn().mockImplementation((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
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
}

describe(frappeCollectionOptions, () => {
  let mockSync: SyncModule;

  beforeEach(() => {
    mockSync = createMockSyncModule();
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

    expect(mockSync.mutate).toHaveBeenCalledWith(
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

    expect(mockSync.mutate).toHaveBeenCalledWith(
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

    expect(mockSync.mutate).toHaveBeenCalledWith(
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
    const cleanup = syncFn({
      begin: vi.fn(),
      write: vi.fn(),
      commit: vi.fn(),
      markReady: vi.fn(),
      truncate: vi.fn(),
      collection: {} as any,
    });

    // Wait for async initSync to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSync.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        doctype: 'Task',
        fields: ['name', 'title', 'status'],
        filters: { status: 'Open' },
      }),
    );

    // Cleanup
    if (typeof cleanup === 'function') {
      cleanup();
    }
  });

  it('calls onSyncError when the initial subscription fetch fails', async () => {
    const error = new Error('PermissionError: not permitted');
    (mockSync.subscribe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);
    const onSyncError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
      onSyncError,
    });

    const markReady = vi.fn();
    const syncFn = options.sync.sync;
    const cleanup = syncFn({
      begin: vi.fn(),
      write: vi.fn(),
      commit: vi.fn(),
      markReady,
      truncate: vi.fn(),
      collection: {} as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onSyncError).toHaveBeenCalledWith(error);
    // Collection still marks ready so consumers are never stuck loading
    expect(markReady).toHaveBeenCalledWith();

    consoleError.mockRestore();
    if (typeof cleanup === 'function') {
      cleanup();
    }
  });

  it('does not call onSyncError on a successful initial sync', async () => {
    const onSyncError = vi.fn();
    const options = frappeCollectionOptions<TestDoc>('Task', {
      sync: mockSync,
      onSyncError,
    });

    const syncFn = options.sync.sync;
    const cleanup = syncFn({
      begin: vi.fn(),
      write: vi.fn(),
      commit: vi.fn(),
      markReady: vi.fn(),
      truncate: vi.fn(),
      collection: {} as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onSyncError).not.toHaveBeenCalled();
    if (typeof cleanup === 'function') {
      cleanup();
    }
  });
});

describe(createFrappeCollection, () => {
  it('should create a TanStack DB collection', () => {
    const mockSync = createMockSyncModule();

    const collection = createFrappeCollection<TestDoc>('Task', {
      sync: mockSync,
    });

    expect(collection).toBeDefined();
  });
});
