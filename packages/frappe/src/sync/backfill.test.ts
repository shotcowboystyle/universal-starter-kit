import { setTimeout as sleep } from 'node:timers/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';

import { BackfillManager, BackfillReason } from './backfill';
import type { NormalizedCache } from './normalized-cache';
import { Order } from './types';
import type { Subscription, SubscriptionQuery } from './types';
import { VirtualSubscription } from './virtual-page-manager';
import type { ProgressiveCache } from './virtual-page-manager';

// Mock matchesFilters so individual tests can control its behavior
vi.mock(import('./filters'), () => ({
  matchesFilters: vi.fn<() => boolean>(() => true),
}));

interface ListArgs {
  cursor?: string;
  limitStart?: number;
  limit?: number;
}

interface CdcPage {
  rows: { name: string; modified?: string }[];
  deleted: { name: string }[];
  checkpoint?: string;
  has_more?: boolean;
}

type GetDocListFn = (doctype: string, options?: ListArgs) => Promise<FrappeDoc<FrappeDocData>[]>;
type SubscriptionOverrides = Omit<Partial<VirtualSubscription>, 'progressiveCache'> & {
  progressiveCache?: Partial<ProgressiveCache>;
};
type CdcBackfillFn = (options: { modifiedAfter?: string; limit?: number }) => Promise<CdcPage>;

describe(BackfillManager, () => {
  let backfillManager: BackfillManager;
  let mockDb: DbModule;
  let mockNormalizedCache: NormalizedCache;
  let getDocList: Mock<GetDocListFn>;
  let cdcBackfill: Mock<CdcBackfillFn>;
  let upsert: Mock<(doc: FrappeDoc<FrappeDocData>) => void>;
  let remove: Mock<(doc: { doctype: string; name: string }) => void>;

  const mockDocs: FrappeDoc<FrappeDocData>[] = Array.from({ length: 100 }, (_, i) => ({
    name: `doc-${i}`,
    doctype: 'TestDoc',
    owner: 'user',
    modified: new Date(2024, 0, 1, 0, 0, i).toISOString(),
    creation: new Date(2024, 0, 1).toISOString(),
    modified_by: 'user',
    value: i,
    title: `Document ${i}`,
  }));

  class MockVirtualSubscription extends VirtualSubscription {
    constructor(
      id: string,
      query: SubscriptionQuery,
      docIds: string[],
      progressiveCache: any,
      viewWindow: { currentPage: number; pageSize: number },
      overrides?: Partial<VirtualSubscription>,
    ) {
      // Create a mock subscription base
      const baseSubscription = {
        id,
        query,
        docIds,
        tombstones: new Set<string>(),
        ...overrides,
      } as Subscription;

      super(baseSubscription, progressiveCache, viewWindow);

      // Apply any additional overrides
      if (overrides) {
        Object.assign(this, overrides);
      }
    }

    // Expose protected progressiveCache for testing
    get testProgressiveCache() {
      return this.progressiveCache;
    }

    set testProgressiveCache(value: any) {
      this.progressiveCache = value;
    }
  }

  const createMockSubscription = (overrides?: SubscriptionOverrides): MockVirtualSubscription => {
    const defaultProgressiveCache = {
      docIds: mockDocs.slice(0, 20).map((d) => d.name),
      nextCursor: 'doc-19',
      hasMore: true,
    };

    const { progressiveCache: overrideCache, ...otherOverrides } = overrides ?? {};
    const progressiveCache = overrideCache ?? defaultProgressiveCache;

    return new MockVirtualSubscription(
      'sub-1',
      {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'modified', order: Order.Asc },
      },
      [],
      progressiveCache,
      {
        currentPage: 1,
        pageSize: 20,
      },
      otherOverrides,
    );
  };

  const mockEndlessCdcPages = () => {
    // Server always reports truncation with an advancing checkpoint, so
    // only the page cap can stop the drain.
    let page = 0;
    cdcBackfill.mockImplementation(async () => {
      page += 1;
      return {
        rows: [{ name: `cdc-doc-${page}`, modified: new Date(2024, 0, 2, 0, 0, page).toISOString() }],
        deleted: [],
        checkpoint: `2024-01-02 00:00:${String(page).padStart(2, '0')}.000000|cdc-doc-${page}`,
        has_more: true,
      };
    });
  };

  beforeEach(() => {
    getDocList = vi.fn<GetDocListFn>(async (_doctype, options) => {
      let start: number;
      if (options?.cursor === undefined) {
        start = options?.limitStart ?? 0;
      } else {
        const cursorIndex = mockDocs.findIndex((d) => d.name === options.cursor);
        start = cursorIndex === -1 ? 0 : cursorIndex + 1;
      }
      const limit = options?.limit ?? 20;
      return mockDocs.slice(start, start + limit);
    });
    cdcBackfill = vi.fn<CdcBackfillFn>(async (options) => {
      const { modifiedAfter } = options;
      const limit = options.limit ?? 200;

      // Filter documents modified after checkpoint
      const filtered =
        modifiedAfter === undefined
          ? mockDocs
          : mockDocs.filter((d) => d.modified !== undefined && d.modified > modifiedAfter);

      return {
        rows: filtered.slice(0, limit),
        deleted: [],
      };
    });
    upsert = vi.fn<(doc: FrappeDoc<FrappeDocData>) => void>();
    remove = vi.fn<(doc: { doctype: string; name: string }) => void>();

    mockDb = {
      getDocList,
      backfill: cdcBackfill,
      getCount: vi.fn<() => Promise<number>>(async () => mockDocs.length),
      getDoc: vi.fn<() => void>(),
      createDoc: vi.fn<() => void>(),
      updateDoc: vi.fn<() => void>(),
      deleteDoc: vi.fn<() => void>(),
    } as unknown as DbModule;

    mockNormalizedCache = {
      get: vi.fn<(doctype: string, name: string) => FrappeDoc<FrappeDocData> | null>((_doctype, name) => {
        const doc = mockDocs.find((d) => d.name === name);
        return doc ?? null;
      }),
      upsert,
      remove,
      delete: vi.fn<() => void>(),
      clear: vi.fn<() => void>(),
      getAll: vi.fn<() => void>(),
      hasDoc: vi.fn<() => void>(),
      getAllByDoctype: vi.fn<() => void>(),
      batchUpsert: vi.fn<() => void>(),
      batchDelete: vi.fn<() => void>(),
      clearByDoctype: vi.fn<() => void>(),
      size: vi.fn<() => void>(),
      sizeByDoctype: vi.fn<() => void>(),
    } as unknown as NormalizedCache;

    backfillManager = new BackfillManager(mockDb, mockNormalizedCache, {
      pageSize: 50,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  describe('backfill', () => {
    it('should perform backfill for initial reason', async () => {
      const subscription = createMockSubscription();

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      expect(getDocList).toHaveBeenCalledWith('TestDoc', expect.objectContaining({ limitStart: 0, limit: 50 }));
      expect(subscription.testProgressiveCache.docIds).toHaveLength(50);
      expect(subscription.testProgressiveCache.lastFetchedAt).toBeInstanceOf(Date);
    });

    it('should queue backfill if already in progress', async () => {
      const subscription = createMockSubscription();

      // Start first backfill
      const firstPromise = backfillManager.backfill(subscription, BackfillReason.Initial);

      // Queue second backfill while first is in progress
      const secondPromise = backfillManager.backfill(subscription, BackfillReason.Pagination);

      // Both should resolve
      await expect(firstPromise).resolves.toBeUndefined();
      await expect(secondPromise).resolves.toBeUndefined();
    });

    it('should process queued backfills after completion', async () => {
      const subscription = createMockSubscription();

      // Mock delay for first backfill
      getDocList.mockImplementationOnce(async () => {
        await sleep(50);
        return mockDocs.slice(0, 50);
      });

      // Start multiple backfills
      const promise1 = backfillManager.backfill(subscription, BackfillReason.Initial);
      const promise2 = backfillManager.backfill(subscription, BackfillReason.Pagination);
      const promise3 = backfillManager.backfill(subscription, BackfillReason.DeleteGap);

      await Promise.all([promise1, promise2, promise3]);

      // All backfills should have been processed (queued ones run after active resolves)
      await sleep(200);
      // One fetch each: Initial (full refresh), Pagination (cursor fetch), DeleteGap (backfill one)
      expect(getDocList).toHaveBeenCalledTimes(3);
    });

    it('should handle different backfill reasons', async () => {
      const subscription = createMockSubscription();

      // Test each reason
      await backfillManager.backfill(subscription, BackfillReason.Pagination);
      expect(subscription.testProgressiveCache.docIds.length).toBeGreaterThan(0);

      await backfillManager.backfill(subscription, BackfillReason.DeleteGap);
      expect(subscription.pendingBackfill).toBe(false);

      await backfillManager.backfill(subscription, BackfillReason.RemoteCreate);
      expect(subscription.needsRehydration).toBe(false);
    });
  });

  describe('backfillOne', () => {
    it('should fetch and add one document', async () => {
      const subscription = createMockSubscription();

      const doc = await backfillManager.backfillOne(subscription);

      expect(doc).toBeDefined();
      // Next document after initial 20
      expect(doc?.name).toBe('doc-20');
      expect(subscription.testProgressiveCache.docIds).toContain('doc-20');
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'doc-20' }));
    });

    it('should return null when no more documents', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: mockDocs.map((d) => d.name),
          nextCursor: 'doc-99',
          hasMore: false,
          totalCount: 100,
        },
      });

      const doc = await backfillManager.backfillOne(subscription);

      expect(doc).toBeNull();
      expect(getDocList).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      const subscription = createMockSubscription();

      getDocList.mockRejectedValueOnce(new Error('Network error'));

      const doc = await backfillManager.backfillOne(subscription);

      expect(doc).toBeNull();
    });

    it('should update hasMore flag when no documents returned', async () => {
      const subscription = createMockSubscription();

      getDocList.mockResolvedValueOnce([]);

      const doc = await backfillManager.backfillOne(subscription);

      expect(doc).toBeNull();
      expect(subscription.testProgressiveCache.hasMore).toBe(false);
    });
  });

  describe('rehydrateCurrentPage', () => {
    it('should refresh current page from server', async () => {
      const subscription = createMockSubscription({
        viewWindow: { currentPage: 2, pageSize: 20 },
        needsRehydration: true,
      });

      await backfillManager.rehydrateCurrentPage(subscription);

      expect(getDocList).toHaveBeenCalledWith('TestDoc', {
        orderBy: { field: 'modified', order: Order.Asc },
        // Page 2 starts at index 20
        limitStart: 20,
        limit: 20,
      });

      expect(subscription.needsRehydration).toBe(false);
    });

    it('should update normalized cache with fetched documents', async () => {
      const subscription = createMockSubscription();

      await backfillManager.rehydrateCurrentPage(subscription);

      expect(upsert).toHaveBeenCalledTimes(20);
    });

    it('should replace page in progressive cache', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: Array.from({ length: 40 }, (_, i) => `doc-${i}`),
          nextCursor: 'doc-39',
          hasMore: true,
        },
        viewWindow: { currentPage: 1, pageSize: 20 },
      });

      const originalSecondPage = subscription.testProgressiveCache.docIds.slice(20, 40);

      await backfillManager.rehydrateCurrentPage(subscription);

      // First page should be replaced, second page should remain
      expect(subscription.testProgressiveCache.docIds.slice(0, 20)).toStrictEqual(
        mockDocs.slice(0, 20).map((d) => d.name),
      );
      expect(subscription.testProgressiveCache.docIds.slice(20, 40)).toStrictEqual(originalSecondPage);
    });

    it('should handle errors and propagate them', async () => {
      const subscription = createMockSubscription();

      getDocList.mockRejectedValueOnce(new Error('Server error'));

      await expect(backfillManager.rehydrateCurrentPage(subscription)).rejects.toThrow('Server error');
    });
  });

  describe('strategy determination', () => {
    it('should use FullRefresh for Initial reason', async () => {
      const subscription = createMockSubscription();
      subscription.testProgressiveCache.docIds = [];

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      // Full refresh clears and rebuilds cache
      expect(subscription.testProgressiveCache.docIds.length).toBeGreaterThan(0);
      expect(subscription.testProgressiveCache.lastFetchedAt).toBeDefined();
    });

    it('should use CursorFetch for Pagination with cursor', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: mockDocs.slice(0, 20).map((d) => d.name),
          nextCursor: 'doc-19',
          hasMore: true,
        },
      });

      const initialLength = subscription.testProgressiveCache.docIds.length;

      await backfillManager.backfill(subscription, BackfillReason.Pagination);

      // Should append more documents
      expect(subscription.testProgressiveCache.docIds.length).toBeGreaterThan(initialLength);
    });

    it('should use GapFill for DeleteGap reason', async () => {
      const subscription = createMockSubscription({
        pendingBackfill: true,
      });

      await backfillManager.backfill(subscription, BackfillReason.DeleteGap);

      expect(subscription.pendingBackfill).toBe(false);
    });

    it('should use PageOnly for RemoteCreate/Update', async () => {
      const subscription = createMockSubscription({
        needsRehydration: true,
        viewWindow: { currentPage: 1, pageSize: 20 },
      });

      await backfillManager.backfill(subscription, BackfillReason.RemoteCreate);

      expect(subscription.needsRehydration).toBe(false);
      expect(getDocList).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limitStart: 0,
          limit: 20,
        }),
      );
    });

    it('should use Incremental for Periodic with checkpoint', async () => {
      const originalCheckpoint = new Date(2024, 0, 1, 0, 0, 10).toISOString();
      const subscription = createMockSubscription({
        checkpoint: originalCheckpoint,
      });

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(cdcBackfill).toHaveBeenCalledWith(
        expect.objectContaining({
          modifiedAfter: originalCheckpoint,
        }),
      );
    });

    it('should use FullRefresh for Recovery without checkpoint', async () => {
      const subscription = createMockSubscription();

      await backfillManager.backfill(subscription, BackfillReason.Recovery);

      // Full refresh behavior
      expect(subscription.testProgressiveCache.docIds).toBeDefined();
      expect(subscription.testProgressiveCache.lastFetchedAt).toBeDefined();
    });
  });

  describe('incremental backfill', () => {
    it('should handle CDC backfill with updates', async () => {
      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1, 0, 0, 10).toISOString(),
        progressiveCache: {
          docIds: mockDocs.slice(0, 20).map((d) => d.name),
          nextCursor: 'doc-19',
          hasMore: true,
        },
      });

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(cdcBackfill).toHaveBeenCalledWith(expect.objectContaining({ doctype: 'TestDoc' }));
      expect(subscription.checkpoint).toBeDefined();
      expect(subscription.checkpoint).not.toBe(new Date(2024, 0, 1, 0, 0, 10).toISOString());
    });

    it('should process deletions from CDC response', async () => {
      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1).toISOString(),
        progressiveCache: {
          docIds: ['doc-1', 'doc-2', 'doc-3'],
          nextCursor: 'doc-3',
          hasMore: false,
          totalCount: 3,
        },
      });

      cdcBackfill.mockResolvedValueOnce({
        rows: [],
        deleted: [{ name: 'doc-2' }],
      });

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(subscription.testProgressiveCache.docIds).not.toContain('doc-2');
      expect(subscription.testProgressiveCache.docIds).toContain('doc-1');
      expect(subscription.testProgressiveCache.docIds).toContain('doc-3');
      expect(remove).toHaveBeenCalledWith({
        doctype: 'TestDoc',
        name: 'doc-2',
      });
    });

    it('should handle documents that no longer match filters', async () => {
      const { matchesFilters } = await import('./filters');
      vi.mocked(matchesFilters).mockImplementation(
        (doc: any, _filters: any) =>
          // doc-1 no longer matches
          doc.name !== 'doc-1',
      );

      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1).toISOString(),
        progressiveCache: {
          docIds: ['doc-1', 'doc-2', 'doc-3'],
          nextCursor: 'doc-3',
          hasMore: false,
          totalCount: 3,
        },
      });

      cdcBackfill.mockResolvedValueOnce({
        rows: [
          { name: 'doc-1', modified: new Date().toISOString() },
          { name: 'doc-2', modified: new Date().toISOString() },
        ],
        deleted: [],
      });

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(subscription.testProgressiveCache.docIds).not.toContain('doc-1');
      expect(subscription.testProgressiveCache.docIds).toContain('doc-2');
    });

    it('should mark for rehydration when new document matches', async () => {
      const { matchesFilters } = await import('./filters');
      vi.mocked(matchesFilters).mockReturnValue(true);

      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1).toISOString(),
        progressiveCache: {
          docIds: ['doc-1', 'doc-2'],
          nextCursor: 'doc-2',
          hasMore: false,
          totalCount: 2,
        },
      });

      cdcBackfill.mockResolvedValueOnce({
        rows: [
          // New doc that matches
          { name: 'doc-3', modified: new Date().toISOString() },
        ],
        deleted: [],
      });

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(subscription.needsRehydration).toBe(true);
    });

    it('should fallback to full refresh on error', async () => {
      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1).toISOString(),
      });

      cdcBackfill.mockRejectedValueOnce(new Error('CDC error'));

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      // Should have called getDocList for full refresh
      expect(getDocList).toHaveBeenCalledWith('TestDoc', expect.objectContaining({ limitStart: 0 }));
      expect(subscription.testProgressiveCache.docIds.length).toBeGreaterThan(0);
    });

    it('should stop draining at the configured maxPages cap', async () => {
      const cappedManager = new BackfillManager(mockDb, mockNormalizedCache, {
        pageSize: 50,
        maxPages: 2,
      });
      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1).toISOString(),
      });
      mockEndlessCdcPages();

      await cappedManager.backfill(subscription, BackfillReason.Periodic);

      expect(cdcBackfill).toHaveBeenCalledTimes(2);
    });

    it('should default the drain cap to 20 pages when maxPages is not set', async () => {
      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1).toISOString(),
      });
      mockEndlessCdcPages();

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(cdcBackfill).toHaveBeenCalledTimes(20);
    });
  });

  describe('cursor-based fetching', () => {
    it('should fetch next batch using cursor', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: mockDocs.slice(0, 20).map((d) => d.name),
          nextCursor: 'doc-19',
          hasMore: true,
        },
      });

      await backfillManager.backfill(subscription, BackfillReason.Pagination);

      expect(getDocList).toHaveBeenCalledWith('TestDoc', {
        orderBy: { field: 'modified', order: Order.Asc },
        cursor: 'doc-19',
        // batchSize (falls back to pageSize)
        limit: 50,
      });

      expect(subscription.testProgressiveCache.docIds.length).toBeGreaterThan(20);
    });

    it('should update cursor and hasMore flag', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: mockDocs.slice(0, 80).map((d) => d.name),
          nextCursor: 'doc-79',
          hasMore: true,
        },
      });

      // Mock returning less than requested (end of data)
      getDocList.mockResolvedValueOnce(mockDocs.slice(80, 100));

      await backfillManager.backfill(subscription, BackfillReason.Pagination);

      expect(subscription.testProgressiveCache.hasMore).toBe(false);
      expect(subscription.testProgressiveCache.nextCursor).toBe('doc-99');
    });

    it('should not fetch if no more data available', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: mockDocs.map((d) => d.name),
          nextCursor: 'doc-99',
          hasMore: false,
          totalCount: 100,
        },
      });

      const initialLength = subscription.testProgressiveCache.docIds.length;

      await backfillManager.backfill(subscription, BackfillReason.Pagination);

      // For cursor fetch when hasMore is false, it shouldn't fetch
      expect(subscription.testProgressiveCache.docIds).toHaveLength(initialLength);
    });
  });

  describe('queue management', () => {
    it('should not queue duplicate reasons', async () => {
      const subscription = createMockSubscription();

      // Mock slow backfill
      const { promise: firstPromise, resolve: resolveFirst } = Promise.withResolvers<null>();

      getDocList.mockImplementationOnce(async () => {
        await firstPromise;
        return mockDocs.slice(0, 50);
      });

      // Start first backfill
      const promise1 = backfillManager.backfill(subscription, BackfillReason.Initial);

      // Queue same reason multiple times
      const promise2 = backfillManager.backfill(subscription, BackfillReason.Pagination);
      const promise3 = backfillManager.backfill(subscription, BackfillReason.Pagination);
      const promise4 = backfillManager.backfill(subscription, BackfillReason.Pagination);

      // Resolve first backfill
      resolveFirst(null);

      await Promise.all([promise1, promise2, promise3, promise4]);

      // Should only execute twice: Initial + one Pagination (duplicates ignored)
      expect(getDocList).toHaveBeenCalledTimes(2);
    });

    it('should process queue in FIFO order', async () => {
      const subscription = createMockSubscription();
      const callOrder: BackfillReason[] = [];

      // Mock to track call order
      getDocList.mockImplementation(async () => {
        await sleep(10);
        return mockDocs.slice(0, 50);
      });

      // Override private method to track reasons
      const originalPerform = (backfillManager as any).performBackfill;
      (backfillManager as any).performBackfill = async function performBackfill(sub: any, reason: BackfillReason) {
        callOrder.push(reason);
        return originalPerform.call(this, sub, reason);
      };

      // Start multiple backfills
      const promise1 = backfillManager.backfill(subscription, BackfillReason.Initial);
      const promise2 = backfillManager.backfill(subscription, BackfillReason.Pagination);
      const promise3 = backfillManager.backfill(subscription, BackfillReason.DeleteGap);

      await Promise.all([promise1, promise2, promise3]);

      // Wait for all queued backfills to drain (they run non-awaited after active resolves)
      await sleep(200);
      expect(callOrder).toStrictEqual([BackfillReason.Initial, BackfillReason.Pagination, BackfillReason.DeleteGap]);
    });
  });

  describe('checkpoint calculation', () => {
    it('should calculate checkpoint from highest modified timestamp', async () => {
      const subscription = createMockSubscription();

      const testDocs = [
        { ...mockDocs[0], modified: '2024-01-01T00:00:00Z' },
        { ...mockDocs[1], modified: '2024-01-01T00:00:30Z' },
        { ...mockDocs[2], modified: '2024-01-01T00:00:15Z' },
      ];

      getDocList.mockResolvedValueOnce(testDocs);

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      expect(subscription.checkpoint).toBe('2024-01-01T00:00:30Z');
    });

    it('should handle documents without modified field', async () => {
      const subscription = createMockSubscription();

      const testDocs = [
        { name: 'doc-1', doctype: 'TestDoc' },
        { name: 'doc-2', doctype: 'TestDoc', modified: '2024-01-01T00:00:00Z' },
        { name: 'doc-3', doctype: 'TestDoc' },
      ];

      getDocList.mockResolvedValueOnce(testDocs);

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      expect(subscription.checkpoint).toBe('2024-01-01T00:00:00Z');
    });

    it('should return undefined for empty document list', async () => {
      const subscription = createMockSubscription();

      getDocList.mockResolvedValueOnce([]);

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      expect(subscription.checkpoint).toBeUndefined();
    });
  });
});
