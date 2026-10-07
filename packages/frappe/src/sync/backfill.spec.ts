import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';

import { BackfillManager, BackfillReason } from './backfill';
import type { NormalizedCache } from './normalizedCache';
import { Order } from './types';
import type { Subscription, SubscriptionQuery } from './types';
import { VirtualSubscription } from './virtualPageManager';

// Mock matchesFilters so individual tests can control its behavior
vi.mock(import('./filters'), () => ({
  matchesFilters: vi.fn(() => true),
}));

describe(BackfillManager, () => {
  let backfillManager: BackfillManager;
  let mockDb: DbModule;
  let mockNormalizedCache: NormalizedCache;

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
        checkpoint: undefined,
        cursor: undefined,
        boundaries: undefined,
        lockExpiry: undefined,
        pendingRehydration: undefined,
        metadata: undefined,
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

  const createMockSubscription = (
    overrides?: Partial<VirtualSubscription> & { progressiveCache?: any },
  ): MockVirtualSubscription => {
    const defaultProgressiveCache = {
      docIds: mockDocs.slice(0, 20).map((d) => d.name),
      nextCursor: 'doc-19',
      hasMore: true,
      totalCount: undefined,
    };

    const progressiveCache = overrides?.progressiveCache ?? defaultProgressiveCache;
    const { progressiveCache: _, ...otherOverrides } = overrides ?? {};

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

  beforeEach(() => {
    mockDb = {
      getDocList: vi.fn(async (doctype, options) => {
        let start: number;
        if (options?.cursor) {
          const cursorIndex = mockDocs.findIndex((d) => d.name === options.cursor);
          start = cursorIndex === -1 ? 0 : cursorIndex + 1;
        } else {
          start = options?.limitStart ?? 0;
        }
        const limit = options?.limit ?? 20;
        return mockDocs.slice(start, start + limit);
      }),
      backfill: vi.fn(async (options) => {
        const { modifiedAfter } = options;
        const limit = options.limit ?? 200;

        // Filter documents modified after checkpoint
        const filtered = modifiedAfter ? mockDocs.filter((d) => d.modified && d.modified > modifiedAfter) : mockDocs;

        return {
          rows: filtered.slice(0, limit),
          deleted: [],
        };
      }),
      getCount: vi.fn(async () => mockDocs.length),
      getDoc: vi.fn(),
      createDoc: vi.fn(),
      updateDoc: vi.fn(),
      deleteDoc: vi.fn(),
    } as unknown as DbModule;

    mockNormalizedCache = {
      get: vi.fn((doctype, name) => {
        const doc = mockDocs.find((d) => d.name === name);
        return doc ?? null;
      }),
      upsert: vi.fn(),
      remove: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      getAll: vi.fn(),
      hasDoc: vi.fn(),
      getAllByDoctype: vi.fn(),
      batchUpsert: vi.fn(),
      batchDelete: vi.fn(),
      clearByDoctype: vi.fn(),
      size: vi.fn(),
      sizeByDoctype: vi.fn(),
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

      expect(mockDb.getDocList).toHaveBeenCalledWith();
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
      (mockDb.getDocList as any).mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return mockDocs.slice(0, 50);
      });

      // Start multiple backfills
      const promise1 = backfillManager.backfill(subscription, BackfillReason.Initial);
      const promise2 = backfillManager.backfill(subscription, BackfillReason.Pagination);
      const promise3 = backfillManager.backfill(subscription, BackfillReason.DeleteGap);

      await Promise.all([promise1, promise2, promise3]);

      // All backfills should have been processed (queued ones run after active resolves)
      await new Promise((resolve) => setTimeout(resolve, 200));
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
      expect(doc?.name).toBe('doc-20'); // Next document after initial 20
      expect(subscription.testProgressiveCache.docIds).toContain('doc-20');
      expect(mockNormalizedCache.upsert).toHaveBeenCalledWith();
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
      expect(mockDb.getDocList).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      const subscription = createMockSubscription();

      (mockDb.getDocList as any).mockRejectedValueOnce(new Error('Network error'));

      const doc = await backfillManager.backfillOne(subscription);

      expect(doc).toBeNull();
    });

    it('should update hasMore flag when no documents returned', async () => {
      const subscription = createMockSubscription();

      (mockDb.getDocList as any).mockResolvedValueOnce([]);

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

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: undefined,
        filters: undefined,
        orderBy: { field: 'modified', order: Order.Asc },
        limitStart: 20, // Page 2 starts at index 20
        limit: 20,
      });

      expect(subscription.needsRehydration).toBe(false);
    });

    it('should update normalized cache with fetched documents', async () => {
      const subscription = createMockSubscription();

      await backfillManager.rehydrateCurrentPage(subscription);

      expect(mockNormalizedCache.upsert).toHaveBeenCalledTimes(20);
    });

    it('should replace page in progressive cache', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: Array.from({ length: 40 }, (_, i) => `doc-${i}`),
          nextCursor: 'doc-39',
          hasMore: true,
          totalCount: undefined,
        },
        viewWindow: { currentPage: 1, pageSize: 20 },
      });

      const originalSecondPage = subscription.testProgressiveCache.docIds.slice(20, 40);

      await backfillManager.rehydrateCurrentPage(subscription);

      // First page should be replaced, second page should remain
      expect(subscription.testProgressiveCache.docIds.slice(0, 20)).toEqual(mockDocs.slice(0, 20).map((d) => d.name));
      expect(subscription.testProgressiveCache.docIds.slice(20, 40)).toEqual(originalSecondPage);
    });

    it('should handle errors and propagate them', async () => {
      const subscription = createMockSubscription();

      (mockDb.getDocList as any).mockRejectedValueOnce(new Error('Server error'));

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
          totalCount: undefined,
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
      expect(mockDb.getDocList).toHaveBeenCalledWith(
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

      expect(mockDb.backfill).toHaveBeenCalledWith(
        expect.objectContaining({
          modifiedAfter: originalCheckpoint,
        }),
      );
    });

    it('should use FullRefresh for Recovery without checkpoint', async () => {
      const subscription = createMockSubscription({
        checkpoint: undefined,
      });

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
          totalCount: undefined,
        },
      });

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(mockDb.backfill).toHaveBeenCalledWith();
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

      (mockDb.backfill as any).mockResolvedValueOnce({
        rows: [],
        deleted: [{ name: 'doc-2' }],
      });

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(subscription.testProgressiveCache.docIds).not.toContain('doc-2');
      expect(subscription.testProgressiveCache.docIds).toContain('doc-1');
      expect(subscription.testProgressiveCache.docIds).toContain('doc-3');
      expect(mockNormalizedCache.remove).toHaveBeenCalledWith({
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

      (mockDb.backfill as any).mockResolvedValueOnce({
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

      (mockDb.backfill as any).mockResolvedValueOnce({
        rows: [
          { name: 'doc-3', modified: new Date().toISOString() }, // New doc that matches
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

      (mockDb.backfill as any).mockRejectedValueOnce(new Error('CDC error'));

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      // Should have called getDocList for full refresh
      expect(mockDb.getDocList).toHaveBeenCalledWith();
      expect(subscription.testProgressiveCache.docIds.length).toBeGreaterThan(0);
    });

    const mockEndlessCdcPages = () => {
      // Server always reports truncation with an advancing checkpoint, so
      // only the page cap can stop the drain.
      let page = 0;
      (mockDb.backfill as any).mockImplementation(async () => {
        page += 1;
        return {
          rows: [{ name: `cdc-doc-${page}`, modified: new Date(2024, 0, 2, 0, 0, page).toISOString() }],
          deleted: [],
          checkpoint: `2024-01-02 00:00:${String(page).padStart(2, '0')}.000000|cdc-doc-${page}`,
          has_more: true,
        };
      });
    };

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

      expect(mockDb.backfill).toHaveBeenCalledTimes(2);
    });

    it('should default the drain cap to 20 pages when maxPages is not set', async () => {
      const subscription = createMockSubscription({
        checkpoint: new Date(2024, 0, 1).toISOString(),
      });
      mockEndlessCdcPages();

      await backfillManager.backfill(subscription, BackfillReason.Periodic);

      expect(mockDb.backfill).toHaveBeenCalledTimes(20);
    });
  });

  describe('cursor-based fetching', () => {
    it('should fetch next batch using cursor', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: mockDocs.slice(0, 20).map((d) => d.name),
          nextCursor: 'doc-19',
          hasMore: true,
          totalCount: undefined,
        },
      });

      await backfillManager.backfill(subscription, BackfillReason.Pagination);

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: undefined,
        filters: undefined,
        orderBy: { field: 'modified', order: Order.Asc },
        cursor: 'doc-19',
        limit: 50, // batchSize (falls back to pageSize)
      });

      expect(subscription.testProgressiveCache.docIds.length).toBeGreaterThan(20);
    });

    it('should update cursor and hasMore flag', async () => {
      const subscription = createMockSubscription({
        progressiveCache: {
          docIds: mockDocs.slice(0, 80).map((d) => d.name),
          nextCursor: 'doc-79',
          hasMore: true,
          totalCount: undefined,
        },
      });

      // Mock returning less than requested (end of data)
      (mockDb.getDocList as any).mockResolvedValueOnce(mockDocs.slice(80, 100));

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
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      (mockDb.getDocList as any).mockImplementationOnce(async () => {
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
      resolveFirst!();

      await Promise.all([promise1, promise2, promise3, promise4]);

      // Should only execute twice: Initial + one Pagination (duplicates ignored)
      expect(mockDb.getDocList).toHaveBeenCalledTimes(2);
    });

    it('should process queue in FIFO order', async () => {
      const subscription = createMockSubscription();
      const callOrder: BackfillReason[] = [];

      // Mock to track call order
      (mockDb.getDocList as any).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
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
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(callOrder).toEqual([BackfillReason.Initial, BackfillReason.Pagination, BackfillReason.DeleteGap]);
    });
  });

  describe('checkpoint calculation', () => {
    it('should calculate checkpoint from highest modified timestamp', async () => {
      const subscription = createMockSubscription({
        checkpoint: undefined,
      });

      const testDocs = [
        { ...mockDocs[0], modified: '2024-01-01T00:00:00Z' },
        { ...mockDocs[1], modified: '2024-01-01T00:00:30Z' },
        { ...mockDocs[2], modified: '2024-01-01T00:00:15Z' },
      ];

      (mockDb.getDocList as any).mockResolvedValueOnce(testDocs);

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      expect(subscription.checkpoint).toBe('2024-01-01T00:00:30Z');
    });

    it('should handle documents without modified field', async () => {
      const subscription = createMockSubscription({
        checkpoint: undefined,
      });

      const testDocs = [
        { name: 'doc-1', doctype: 'TestDoc' },
        { name: 'doc-2', doctype: 'TestDoc', modified: '2024-01-01T00:00:00Z' },
        { name: 'doc-3', doctype: 'TestDoc' },
      ];

      (mockDb.getDocList as any).mockResolvedValueOnce(testDocs);

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      expect(subscription.checkpoint).toBe('2024-01-01T00:00:00Z');
    });

    it('should return undefined for empty document list', async () => {
      const subscription = createMockSubscription({
        checkpoint: undefined,
      });

      (mockDb.getDocList as any).mockResolvedValueOnce([]);

      await backfillManager.backfill(subscription, BackfillReason.Initial);

      expect(subscription.checkpoint).toBeUndefined();
    });
  });
});
