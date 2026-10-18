import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { ListOptions } from '../core/types';
import type { DbModule } from '../db';

import { NormalizedCache } from './normalized-cache';
import type { SubscriptionQuery } from './types';
import { Order } from './types';
import type { VirtualSubscription } from './virtual-page-manager';
import { PlacementStrategy, VirtualPageManager } from './virtual-page-manager';

/** Helper to access the protected progressiveCache directly on any VirtualSubscription */
const getCache = (sub: VirtualSubscription) =>
  (sub as any).progressiveCache as ReturnType<VirtualSubscription['getProgressiveCache']>;

const setCache = (sub: VirtualSubscription, patch: Partial<ReturnType<VirtualSubscription['getProgressiveCache']>>) => {
  const cache = (sub as any).progressiveCache;
  Object.assign(cache, patch);
};

const docIndexPattern = /doc-(?<index>\d+)/u;

type GetDocList = (doctype: string, options?: ListOptions) => Promise<FrappeDoc<FrappeDocData>[]>;

describe(VirtualPageManager, () => {
  let virtualPageManager: VirtualPageManager;
  let mockNormalizedCache: NormalizedCache;
  let mockDb: DbModule;
  let getDocListMock: ReturnType<typeof vi.fn<GetDocList>>;
  let getCountMock: ReturnType<typeof vi.fn<DbModule['getCount']>>;

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

  const subscribeTen = async (id: string) => {
    await virtualPageManager.initializeSubscription(id, {
      doctype: 'TestDoc',
      limit: 10,
      orderBy: { field: 'value', order: Order.Asc },
    });
    return virtualPageManager.getSubscription(id)!;
  };

  beforeEach(() => {
    mockNormalizedCache = {
      get: vi.fn<(key: { doctype: string; name: string }) => FrappeDoc<FrappeDocData> | null>(({ name }) => {
        const doc = mockDocs.find((d) => d.name === name);
        return doc ?? null;
      }),
      upsert: vi.fn<() => void>(),
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
    getDocListMock = vi.fn<GetDocList>(async (_doctype, options) => {
      const limit = options?.limit ?? 20;
      let start = options?.limitStart ?? 0;
      if (options?.cursor !== undefined) {
        const cursorIdx = mockDocs.findIndex((d) => d.name === options.cursor);
        if (cursorIdx !== -1) {
          start = cursorIdx + 1;
        }
      }
      const result = mockDocs.slice(start, start + limit);

      const orderBy = options?.orderBy;
      if (orderBy !== undefined && !Array.isArray(orderBy) && orderBy.order === Order.Desc) {
        return result.toReversed();
      }
      return result;
    });
    getCountMock = vi.fn<DbModule['getCount']>(async () => mockDocs.length);
    mockDb = {
      getDocList: getDocListMock,
      getCount: getCountMock,
      getDoc: vi.fn<() => void>(),
      createDoc: vi.fn<() => void>(),
      updateDoc: vi.fn<() => void>(),
      deleteDoc: vi.fn<() => void>(),
    } as unknown as DbModule;
    virtualPageManager = new VirtualPageManager(mockNormalizedCache, mockDb, {
      batchSize: 50,
    });
  });

  describe('initializeSubscription', () => {
    it('should initialize a subscription with progressive cache', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'modified', order: Order.Asc },
      };
      const subscription = await virtualPageManager.initializeSubscription('sub-1', query);
      expect(subscription).toBeDefined();
      expect(subscription.id).toBe('sub-1');
      expect(subscription.query).toStrictEqual(query);
      expect(getCache(subscription)).toBeDefined();
      expect(getCache(subscription).docIds).toHaveLength(50);
      expect(subscription.viewWindow.pageSize).toBe(20);
      expect(subscription.viewWindow.currentPage).toBe(1);
    });

    it('should fetch initial batch of documents', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
      };
      await virtualPageManager.initializeSubscription('sub-2', query);
      expect(getDocListMock).toHaveBeenCalledWith('TestDoc', {
        limit: 50,
      });
    });

    it('should store subscription for later retrieval', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-3', query);
      const subscription = virtualPageManager.getSubscription('sub-3');
      expect(subscription).toBeDefined();
      expect(subscription?.id).toBe('sub-3');
    });
  });

  describe('getPage', () => {
    it('should return documents for requested page', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
      };
      await virtualPageManager.initializeSubscription('sub-4', query);
      const page = await virtualPageManager.getPage('sub-4', 1);
      expect(page).toHaveLength(10);
      expect(page[0].name).toBe('doc-0');
      expect(page[9].name).toBe('doc-9');
    });

    it('should update current page in view window', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
      };
      await virtualPageManager.initializeSubscription('sub-5', query);
      await virtualPageManager.getPage('sub-5', 3);
      const subscription = virtualPageManager.getSubscription('sub-5');
      expect(subscription?.viewWindow.currentPage).toBe(3);
    });

    it('should fetch more data when accessing pages beyond cache', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
      };
      await virtualPageManager.initializeSubscription('sub-6', query);
      const page = await virtualPageManager.getPage('sub-6', 7);
      expect(getDocListMock).toHaveBeenCalledTimes(2);
      expect(page).toHaveLength(10);
      expect(page[0].name).toBe('doc-60');
    });

    it('should return empty array for non-existent subscription', async () => {
      const page = await virtualPageManager.getPage('non-existent', 1);
      expect(page).toStrictEqual([]);
    });
  });

  describe('getNextBatch', () => {
    it('should return documents after cursor', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-7', query);
      const docs = await virtualPageManager.getNextBatch('sub-7', 'doc-10', 5);
      expect(docs).toHaveLength(5);
      expect(docs[0].name).toBe('doc-11');
      expect(docs[4].name).toBe('doc-15');
    });

    it('should return empty array if cursor not found', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-8', query);
      const docs = await virtualPageManager.getNextBatch('sub-8', 'non-existent', 5);
      expect(docs).toStrictEqual([]);
    });

    it('should fetch more data if needed', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
      };
      await virtualPageManager.initializeSubscription('sub-9', query);
      const docs = await virtualPageManager.getNextBatch('sub-9', 'doc-45', 10);
      expect(docs).toHaveLength(10);
      expect(docs[0].name).toBe('doc-46');
      expect(docs[9].name).toBe('doc-55');
    });
  });

  describe('getPageInfo', () => {
    it('should return correct page information', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
      };
      await virtualPageManager.initializeSubscription('sub-10', query);
      const pageInfo = virtualPageManager.getPageInfo('sub-10');
      expect(pageInfo.currentPage).toBe(1);
      expect(pageInfo.pageSize).toBe(10);
      expect(pageInfo.itemsInCache).toBe(50);
      expect(pageInfo.knownPages).toBe(5);
      expect(pageInfo.hasMore).toBe(true);
    });

    it('should return default info for non-existent subscription', () => {
      const pageInfo = virtualPageManager.getPageInfo('non-existent');
      expect(pageInfo.currentPage).toBe(1);
      expect(pageInfo.knownPages).toBe(0);
      expect(pageInfo.totalPages).toBe('unknown');
      expect(pageInfo.hasMore).toBe(false);
      expect(pageInfo.itemsInCache).toBe(0);
      expect(pageInfo.pageSize).toBe(20);
    });

    it('should calculate total pages when count is known', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 15,
      };
      await virtualPageManager.initializeSubscription('sub-11', query);
      const subscription = virtualPageManager.getSubscription('sub-11');
      if (subscription) {
        setCache(subscription, { totalCount: 100 });
      }
      const pageInfo = virtualPageManager.getPageInfo('sub-11');
      expect(pageInfo.totalPages).toBe(7);
    });
  });

  describe('getTotalPages', () => {
    it('should return total pages when all data is fetched', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 100,
      };
      await virtualPageManager.initializeSubscription('sub-12', query);
      const subscription = virtualPageManager.getSubscription('sub-12');
      if (subscription) {
        setCache(subscription, {
          hasMore: false,
          docIds: mockDocs.map((d) => d.name),
        });
      }
      const totalPages = await virtualPageManager.getTotalPages('sub-12');
      expect(totalPages).toBe(1);
    });

    it('should fetch count from server when needed', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
      };
      await virtualPageManager.initializeSubscription('sub-13', query);
      const totalPages = await virtualPageManager.getTotalPages('sub-13');
      expect(getCountMock).toHaveBeenCalledWith('TestDoc', undefined);
      expect(totalPages).toBe(10);
    });

    it('should return unknown for non-existent subscription', async () => {
      const totalPages = await virtualPageManager.getTotalPages('non-existent');
      expect(totalPages).toBe('unknown');
    });
  });

  describe('determineOptimisticPlacement', () => {
    it('should determine WITHIN_RANGE placement correctly', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-14', query);
      const subscription = virtualPageManager.getSubscription('sub-14')!;
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: 25,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const placement = virtualPageManager.determineOptimisticPlacement(subscription, newDoc);
      expect(placement.strategy).toBe(PlacementStrategy.WithinRange);
      expect(placement.position).toBeDefined();
      expect(placement.position).toBeGreaterThanOrEqual(25);
      expect(placement.position).toBeLessThanOrEqual(26);
    });

    it('should determine BEFORE_RANGE placement', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-15', query);
      const subscription = virtualPageManager.getSubscription('sub-15')!;
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: -1,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };

      const placement = virtualPageManager.determineOptimisticPlacement(subscription, newDoc);

      expect(placement.strategy).toBe(PlacementStrategy.BeforeRange);
    });

    it('should determine AFTER_RANGE placement', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-16', query);
      const subscription = virtualPageManager.getSubscription('sub-16')!;
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: 200,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const placement = virtualPageManager.determineOptimisticPlacement(subscription, newDoc);
      expect(placement.strategy).toBe(PlacementStrategy.AfterRange);
    });

    it('should return UNCERTAIN when no sort field', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-17', query);
      const subscription = virtualPageManager.getSubscription('sub-17')!;
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const placement = virtualPageManager.determineOptimisticPlacement(subscription, newDoc);
      expect(placement.strategy).toBe(PlacementStrategy.Uncertain);
    });

    it('should handle DESC order correctly', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Desc },
      };
      await virtualPageManager.initializeSubscription('sub-18', query);
      const subscription = virtualPageManager.getSubscription('sub-18')!;
      setCache(subscription, {
        docIds: mockDocs
          .slice(0, 50)
          .toReversed()
          .map((d) => d.name),
      });
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: 200,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const placement = virtualPageManager.determineOptimisticPlacement(subscription, newDoc);
      expect(placement.strategy).toBe(PlacementStrategy.BeforeRange);
    });
  });

  describe('handleRemoteCreate', () => {
    it('should add document in correct position', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-19', query);
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: 25,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const result = await virtualPageManager.handleRemoteCreate('sub-19', newDoc);
      const subscription = virtualPageManager.getSubscription('sub-19')!;
      expect(result).toBe(true);
      expect(getCache(subscription).docIds).toContain('new-doc');
    });

    it('should handle BEFORE_RANGE placement', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-20', query);
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: -1,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const result = await virtualPageManager.handleRemoteCreate('sub-20', newDoc);
      const subscription = virtualPageManager.getSubscription('sub-20')!;
      expect(result).toBe(true);
      expect(getCache(subscription).docIds[0]).toBe('new-doc');
    });

    it('should handle UNCERTAIN placement', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-21', query);
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const result = await virtualPageManager.handleRemoteCreate('sub-21', newDoc);
      const subscription = virtualPageManager.getSubscription('sub-21')!;
      expect(result).toBe(false);
      expect(subscription.needsRehydration).toBe(true);
    });
  });

  describe('handleRemoteDelete', () => {
    it('should remove document from cache', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-22', query);
      const result = await virtualPageManager.handleRemoteDelete('sub-22', 'doc-10');
      const subscription = virtualPageManager.getSubscription('sub-22')!;
      expect(result).toBe(true);
      expect(getCache(subscription).docIds).not.toContain('doc-10');
      expect(subscription.pendingBackfill).toBe(true);
    });

    it('should return false for non-existent document', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-23', query);
      const result = await virtualPageManager.handleRemoteDelete('sub-23', 'non-existent');
      expect(result).toBe(false);
    });
  });

  describe('handleRemoteUpdate', () => {
    it('should update document position when sort value changes', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-24', query);
      const updatedDoc: FrappeDoc<FrappeDocData> = {
        name: 'doc-10',
        doctype: 'TestDoc',
        value: 45,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const result = await virtualPageManager.handleRemoteUpdate('sub-24', updatedDoc);
      const subscription = virtualPageManager.getSubscription('sub-24')!;
      expect(result).toBe(true);
      const index = getCache(subscription).docIds.indexOf('doc-10');
      expect(index).toBeGreaterThan(10);
    });

    it('should handle document not in cache', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-25', query);
      const updatedDoc: FrappeDoc<FrappeDocData> = {
        name: 'doc-200',
        doctype: 'TestDoc',
        value: 999,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const result = await virtualPageManager.handleRemoteUpdate('sub-25', updatedDoc);
      expect(result).toBe(false);
    });

    it('should not reposition if sort value unchanged', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-26', query);
      const subscription = virtualPageManager.getSubscription('sub-26')!;
      const originalIndex = getCache(subscription).docIds.indexOf('doc-10');
      const updatedDoc: FrappeDoc<FrappeDocData> = {
        name: 'doc-10',
        doctype: 'TestDoc',
        value: 10,
        title: 'Updated Title',
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const result = await virtualPageManager.handleRemoteUpdate('sub-26', updatedDoc);
      const newIndex = getCache(subscription).docIds.indexOf('doc-10');
      expect(result).toBe(true);
      expect(newIndex).toBe(originalIndex);
    });
  });

  describe('invalidateCache', () => {
    it('should clear page cache and increment generation', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-27', query);
      const system = virtualPageManager as any;
      const initialGeneration = system.cacheGeneration;
      virtualPageManager.invalidateCache();
      expect(system.cacheGeneration).toBe(initialGeneration + 1);
      expect(system.pageCache.size).toBe(0);
    });
  });

  describe('updateProgressiveCache', () => {
    it('should update subscription cache', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
      };
      await virtualPageManager.initializeSubscription('sub-28', query);
      const newDocIds = ['doc-100', 'doc-101', 'doc-102'];
      virtualPageManager.updateProgressiveCache('sub-28', newDocIds, 'cursor-102', false);
      const subscription = virtualPageManager.getSubscription('sub-28')!;
      expect(getCache(subscription).docIds).toStrictEqual(newDocIds);
      expect(getCache(subscription).nextCursor).toBe('cursor-102');
      expect(getCache(subscription).hasMore).toBe(false);
    });

    it('should handle non-existent subscription', () => {
      expect(() => {
        virtualPageManager.updateProgressiveCache('non-existent', [], null, false);
      }).not.toThrow();
    });
  });

  describe('hybrid pagination', () => {
    const pageSize = 20;

    const createMockDbForHybrid = () => {
      const getDocList = vi.fn<GetDocList>(async (_doctype, options = {}) => {
        const limit = options.limit === undefined || options.limit === 0 ? pageSize : options.limit;
        let start: number;
        if (options.limitStart !== undefined) {
          start = options.limitStart;
        } else if (options.cursor !== undefined && options.cursor !== '') {
          const match = docIndexPattern.exec(options.cursor);
          start = match ? Number(match.groups?.index) + 1 : 0;
        } else {
          start = 0;
        }
        return Array.from({ length: limit }, (_, i) => ({
          name: `doc-${start + i}`,
          doctype: 'TestDoc',
          modified: '2026-01-01 00:00:00',
        }));
      });
      return {
        getDocList,
        getCount: vi.fn<DbModule['getCount']>().mockResolvedValue(1000),
        getDoc: vi.fn<() => void>(),
        createDoc: vi.fn<() => void>(),
        updateDoc: vi.fn<() => void>(),
        deleteDoc: vi.fn<() => void>(),
      } as unknown as DbModule;
    };

    beforeEach(() => {
      mockNormalizedCache = new NormalizedCache();
      mockDb = createMockDbForHybrid();
      virtualPageManager = new VirtualPageManager(mockNormalizedCache, mockDb, {
        batchSize: 100,
      });
    });

    it('sequential page access uses cursor-based fetch', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: pageSize,
      };
      await virtualPageManager.initializeSubscription('sub-h1', query);
      await virtualPageManager.getPage('sub-h1', 1);
      await virtualPageManager.getPage('sub-h1', 2);

      const { calls } = (mockDb.getDocList as ReturnType<typeof vi.fn>).mock;
      for (const [, options] of calls) {
        expect(options).not.toHaveProperty('limitStart');
      }
    });

    it('non-contiguous page jump uses offset-based fetch', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: pageSize,
      };
      await virtualPageManager.initializeSubscription('sub-h2', query);
      await virtualPageManager.getPage('sub-h2', 1);
      await virtualPageManager.getPage('sub-h2', 50);

      const { calls } = (mockDb.getDocList as ReturnType<typeof vi.fn>).mock;
      const offsetCall = calls.find((call) => (call[1] as ListOptions | undefined)?.limitStart === (50 - 1) * pageSize);
      expect(offsetCall).toBeDefined();
      expect(offsetCall![1]).toMatchObject({
        limitStart: 980,
        limit: pageSize,
      });
    });

    it('after offset jump, contiguous access uses cursor', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: pageSize,
      };
      await virtualPageManager.initializeSubscription('sub-h3', query);
      await virtualPageManager.getPage('sub-h3', 1);
      await virtualPageManager.getPage('sub-h3', 50);
      (mockDb.getDocList as ReturnType<typeof vi.fn>).mockClear();
      await virtualPageManager.getPage('sub-h3', 51);

      const { calls } = (mockDb.getDocList as ReturnType<typeof vi.fn>).mock;
      expect(calls.length).toBeGreaterThan(0);
      for (const [, options] of calls) {
        expect(options).not.toHaveProperty('limitStart');
      }
    });

    it('gap placeholders after offset jump', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: pageSize,
      };
      await virtualPageManager.initializeSubscription('sub-h4', query);
      await virtualPageManager.getPage('sub-h4', 1);
      await virtualPageManager.getPage('sub-h4', 50);

      const subscription = virtualPageManager.getSubscription('sub-h4')!;
      const { docIds } = getCache(subscription);

      const limitStart = (50 - 1) * pageSize;
      expect(docIds.length).toBeGreaterThanOrEqual(limitStart + pageSize);

      const gapRange = docIds.slice(pageSize, limitStart);
      expect(gapRange.some((id) => id === '')).toBe(true);
      expect(docIds[limitStart]).not.toBe('');
      expect(docIds.slice(limitStart, limitStart + pageSize).every((id) => id !== '')).toBe(true);
    });

    it('mapIdsToDocuments filters gaps', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: pageSize,
      };
      await virtualPageManager.initializeSubscription('sub-h5', query);
      await virtualPageManager.getPage('sub-h5', 1);
      await virtualPageManager.getPage('sub-h5', 50);

      const page = await virtualPageManager.getPage('sub-h5', 50);
      expect(page.every((doc) => doc !== undefined && doc !== null)).toBe(true);
      expect(page).toHaveLength(pageSize);
      expect(page[0].name).toBe('doc-980');
    });

    it('getPageIslands returns correct islands', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: pageSize,
      };
      await virtualPageManager.initializeSubscription('sub-h6', query);
      await virtualPageManager.getPage('sub-h6', 1);
      await virtualPageManager.getPage('sub-h6', 50);

      const islands = virtualPageManager.getPageIslands('sub-h6');
      expect(islands).toHaveLength(2);

      const cursorIsland = islands.find((i) => i.fetchedVia === 'cursor');
      const offsetIsland = islands.find((i) => i.fetchedVia === 'offset');
      expect(cursorIsland).toBeDefined();
      expect(offsetIsland).toBeDefined();
      expect(offsetIsland).toMatchObject({
        startPage: 50,
        endPage: 50,
        startIndex: 980,
        endIndex: 1000,
        fetchedVia: 'offset',
      });
    });

    it('island merging when adjacent pages fetched', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: pageSize,
      };
      await virtualPageManager.initializeSubscription('sub-h7', query);
      await virtualPageManager.getPage('sub-h7', 1);
      await virtualPageManager.getPage('sub-h7', 2);
      await virtualPageManager.getPage('sub-h7', 3);

      const islands = virtualPageManager.getPageIslands('sub-h7');
      expect(islands).toHaveLength(1);
      expect(islands[0].startPage).toBe(1);
      expect(islands[0].endPage).toBeGreaterThanOrEqual(3);
      expect(islands[0].fetchedVia).toBe('cursor');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty progressive cache', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-29', query);
      const subscription = virtualPageManager.getSubscription('sub-29')!;
      setCache(subscription, { docIds: [] });
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: 10,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const placement = virtualPageManager.determineOptimisticPlacement(subscription, newDoc);
      expect(placement.strategy).toBe(PlacementStrategy.WithinRange);
      expect(placement.position).toBe(0);
    });

    it('should handle null values in comparison', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 20,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-30', query);
      const subscription = virtualPageManager.getSubscription('sub-30')!;
      const newDoc: FrappeDoc<FrappeDocData> = {
        name: 'new-doc',
        doctype: 'TestDoc',
        value: null,
        owner: 'user',
        modified: new Date().toISOString(),
        creation: new Date().toISOString(),
        modified_by: 'user',
      };
      const placement = virtualPageManager.determineOptimisticPlacement(subscription, newDoc);
      expect(placement.strategy).toBe(PlacementStrategy.WithinRange);
      expect(placement.position).toBe(0);
    });

    it('should limit cache size appropriately', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        limit: 10,
        orderBy: { field: 'value', order: Order.Asc },
      };
      await virtualPageManager.initializeSubscription('sub-31', query);
      const subscription = virtualPageManager.getSubscription('sub-31')!;
      const bigCache = Array.from({ length: 1001 }, (_, i) => `doc-${i % 100}`);
      setCache(subscription, { docIds: bigCache });
      expect((virtualPageManager as any).shouldLimitCacheSize(subscription)).toBe(true);
    });
  });

  /**
   * docIds is a list of document NAMES, so a name can appear at most once.
   * fetchMorePages used to append whatever came back without checking, which
   * two racing loadMore() calls (the useFrappeInfiniteList sentinel fires
   * twice before isLoadingMore settles) turned into the same page twice —
   * React then logs a duplicate-key error per row (MPO-197).
   */
  describe('progressive cache stays a set of unique names', () => {
    it('re-fetching from the same cursor does not duplicate a page', async () => {
      const subscription = await subscribeTen('sub-dedupe-1');
      // Rewind to one page, as a fresh subscribe leaves it, and point the
      // cursor at the last row of that page.
      setCache(subscription, {
        docIds: mockDocs.slice(0, 10).map((d) => d.name),
        nextCursor: 'doc-9',
        hasMore: true,
      });
      await virtualPageManager.getNextBatch('sub-dedupe-1', 'doc-9', 10);
      const first = [...getCache(subscription).docIds];
      expect(new Set(first).size).toBe(first.length);

      // A second call from the SAME cursor: the engine must not append the
      // rows it already holds.
      setCache(subscription, { nextCursor: 'doc-9', hasMore: true });
      await virtualPageManager.getNextBatch('sub-dedupe-1', 'doc-9', 10);
      const after = getCache(subscription).docIds;
      expect(new Set(after).size).toBe(after.length);
    });

    it('two concurrent getNextBatch calls leave no duplicate ids', async () => {
      const subscription = await subscribeTen('sub-dedupe-2');
      setCache(subscription, {
        docIds: mockDocs.slice(0, 10).map((d) => d.name),
        nextCursor: 'doc-9',
        hasMore: true,
      });
      await Promise.all([
        virtualPageManager.getNextBatch('sub-dedupe-2', 'doc-9', 10),
        virtualPageManager.getNextBatch('sub-dedupe-2', 'doc-9', 10),
      ]);
      const ids = getCache(subscription).docIds;
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('de-duplicating never reorders or drops the rows already held', async () => {
      const subscription = await subscribeTen('sub-dedupe-3');
      const head = mockDocs.slice(0, 10).map((d) => d.name);
      setCache(subscription, { docIds: [...head], nextCursor: 'doc-9', hasMore: true });
      await virtualPageManager.getNextBatch('sub-dedupe-3', 'doc-9', 10);
      expect(getCache(subscription).docIds.slice(0, 10)).toStrictEqual(head);
    });
  });
});
