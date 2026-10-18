import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';

// Use real implementations - no mocking needed for internal modules
// oxlint-disable-next-line sonarjs/no-wildcard-import -- vi.spyOn patches members on the module namespace object
import * as filters from './filters';
import type { NormalizedCache } from './normalized-cache';
import { SubscriptionManager } from './subscription-manager';
import { BackfillScope, defaultPageLength, Order } from './types';
import type { SubscriptionQuery, SyncOptions } from './types';

describe(SubscriptionManager, () => {
  let subscriptionManager: SubscriptionManager;
  let mockDb: any;
  let mockNormalizedCache: any;

  const mockDoc: FrappeDoc<FrappeDocData> = {
    name: 'test-doc',
    doctype: 'TestDoc',
    title: 'Test Document',
    modified: '2024-01-01T10:00:00',
    creation: '2024-01-01T09:00:00',
    owner: 'test-user',
    modified_by: 'test-user',
  };

  const mockDocs: any[] = [
    {
      name: 'doc1',
      doctype: 'TestDoc',
      modified: '2024-01-01T09:00:00',
      title: 'Document 1',
    },
    {
      name: 'doc2',
      doctype: 'TestDoc',
      modified: '2024-01-01T10:00:00',
      title: 'Document 2',
    },
    {
      name: 'doc3',
      doctype: 'TestDoc',
      modified: '2024-01-01T11:00:00',
      title: 'Document 3',
    },
  ];

  let uuidCount = 0;
  let randomUUID: ReturnType<typeof vi.fn<() => string>>;

  beforeEach(() => {
    uuidCount = 0;

    // Spy on filters functions with default behavior
    vi.spyOn(filters, 'matchesFilters').mockReturnValue(true);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- mockReturnValue's parameter is required; omitting it is TS2554
    vi.spyOn(filters, 'extractSingleName').mockReturnValue(undefined);

    // Mock database module
    mockDb = {
      getDoc: vi.fn<DbModule['getDoc']>().mockResolvedValue(mockDoc),
      getDocList: vi.fn<DbModule['getDocList']>().mockResolvedValue(mockDocs),
      backfill: vi.fn<DbModule['backfill']>().mockResolvedValue({
        rows: [],
        checkpoint: '2024-01-01T12:00:00',
      }),
    } as any;

    // Mock normalized cache
    mockNormalizedCache = {
      upsert: vi.fn<NormalizedCache['upsert']>(),
      get: vi
        .fn<NormalizedCache['get']>()
        .mockImplementation(({ name }: { name: string }) => mockDocs.find((doc) => doc.name === name) ?? mockDoc),
      remove: vi.fn<NormalizedCache['remove']>(),
    } as any;

    // Mock crypto for ID generation - use sequential IDs so multiple subscribes get unique IDs
    randomUUID = vi.fn<() => string>(() => {
      uuidCount += 1;
      return `uuid-${uuidCount}`;
    });
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);

      expect(subscriptionManager).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const options: SyncOptions = {
        pageSize: 50,
        useCursorPagination: true,
        onBackfill: vi.fn<NonNullable<SyncOptions['onBackfill']>>(),
      };

      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, options);

      expect(subscriptionManager).toBeDefined();
    });
  });

  describe('subscribe', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should create a subscription successfully', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['title', 'description'],
        filters: { status: 'Active' },
        orderBy: { field: 'modified', order: Order.Desc },
        limit: 20,
      };

      const result = await subscriptionManager.subscribe(query);

      expect(result.subscriptionId).toBe('uuid-1');
      expect(result.rows).toStrictEqual(mockDocs);
      // Max modified
      expect(result.checkpoint).toBe('2024-01-01T11:00:00');
      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['title', 'description', 'modified', 'name'],
        filters: { status: 'Active' },
        orderBy: { field: 'modified', order: Order.Desc },
        limit: 20,
      });
    });

    it('passes an explicit limit (and limitStart) through to the initial fetch', async () => {
      // Regression: the initial fetch used to drop query.limit entirely, so
      // the request carried no limit_page_length and the bench clamped every
      // collection to its default page length (20) — `useFrappeCollection`
      // consumers with `limit: N > 20` silently lost rows (pokemon moves
      // accordion truncation).
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['title'],
        limit: 500,
        limitStart: 40,
      };

      await subscriptionManager.subscribe(query);

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['title', 'modified', 'name'],
        limit: 500,
        limitStart: 40,
      });
    });

    it('sends the default page length when the query has no limit', async () => {
      // MPO-238: leaving limit_page_length off let the bench clamp to 20
      // while fixture mode returned every row, so a no-limit collection read
      // one count in development and another in production.
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['title'],
      };

      await subscriptionManager.subscribe(query);

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['title', 'modified', 'name'],
        limit: defaultPageLength,
      });
    });

    it("passes limit 0 through as Frappe's every-row page length", async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['title'],
        limit: 0,
      };

      await subscriptionManager.subscribe(query);

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['title', 'modified', 'name'],
        limit: 0,
      });
    });

    it('applies limitStart without an explicit limit', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['title'],
        limitStart: 20,
      };

      await subscriptionManager.subscribe(query);

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['title', 'modified', 'name'],
        limit: defaultPageLength,
        limitStart: 20,
      });
    });

    it('should handle single document queries', async () => {
      (filters.extractSingleName as any).mockReturnValue('specific-doc');

      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { name: 'specific-doc' },
      };

      const result = await subscriptionManager.subscribe(query);

      expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'specific-doc');
      expect(result.rows).toStrictEqual([mockDoc]);
    });

    it('should handle single document query errors', async () => {
      (filters.extractSingleName as any).mockReturnValue('non-existent-doc');
      mockDb.getDoc.mockRejectedValue(Object.assign(new Error('Document not found'), { status: 404 }));

      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { name: 'non-existent-doc' },
      };

      const result = await subscriptionManager.subscribe(query);

      expect(result.rows).toStrictEqual([]);
    });

    it('should handle cursor pagination', async () => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, {
        useCursorPagination: true,
      });

      mockDb.getDocList.mockResolvedValue({
        data: mockDocs,
        cursor: 'cursor-123',
      } as any);

      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
        limit: 20,
      };

      const result = await subscriptionManager.subscribe(query);

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['*', 'modified', 'name'],
        limit: 20,
      });
      expect(result.rows).toStrictEqual(mockDocs);

      const subscription = subscriptionManager.getSubscription(result.subscriptionId);
      expect(subscription?.cursor).toBe('cursor-123');
    });

    it('should seed normalized cache with returned documents', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      await subscriptionManager.subscribe(query);

      expect(mockNormalizedCache.upsert).toHaveBeenCalledTimes(3);
      for (const doc of mockDocs) {
        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(doc);
      }
    });

    it('should compute checkpoint as max modified time', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);

      expect(result.checkpoint).toBe('2024-01-01T11:00:00');
    });

    it('should set page boundaries', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
        limitStart: 10,
        limit: 15,
      };

      const result = await subscriptionManager.subscribe(query);
      const subscription = subscriptionManager.getSubscription(result.subscriptionId);

      expect(subscription?.boundaries).toStrictEqual({
        firstItem: mockDocs[0],
        lastItem: mockDocs[2],
        offset: 10,
        pageSize: 15,
      });
    });

    it('should initialize metadata', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);
      const subscription = subscriptionManager.getSubscription(result.subscriptionId);

      expect(subscription?.metadata).toStrictEqual({
        itemsBeforePage: 0,
        itemsAfterPage: 0,
      });
    });

    it('should handle empty results', async () => {
      mockDb.getDocList.mockResolvedValue([]);

      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);

      expect(result.rows).toStrictEqual([]);
      expect(result.checkpoint).toBeUndefined();

      const subscription = subscriptionManager.getSubscription(result.subscriptionId);
      expect(subscription?.boundaries).toBeUndefined();
    });
  });

  describe('unsubscribe', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should remove subscription', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);
      expect(subscriptionManager.getSubscription(result.subscriptionId)).toBeDefined();

      subscriptionManager.unsubscribe(result.subscriptionId);
      expect(subscriptionManager.getSubscription(result.subscriptionId)).toBeUndefined();
    });

    it('should handle non-existent subscription', () => {
      expect(() => {
        subscriptionManager.unsubscribe('non-existent');
      }).not.toThrow();
    });
  });

  describe('getDocsForSubscription', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should return documents from virtual page system when available', async () => {
      const { virtualPageManager } = subscriptionManager as any;
      vi.spyOn(virtualPageManager, 'getSubscription').mockReturnValue({
        query: { doctype: 'TestDoc' },
        getProgressiveCache: () => ({ docIds: ['doc1', 'doc2'] }),
      });

      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);
      const docs = subscriptionManager.getDocsForSubscription(result.subscriptionId);

      expect(docs).toHaveLength(2);
    });

    it('should resolve documents from the standard subscription map when virtual pages are absent', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);
      const docs = subscriptionManager.getDocsForSubscription(result.subscriptionId);

      expect(docs).toHaveLength(3);
    });

    it('should return empty array for non-existent subscription', () => {
      const docs = subscriptionManager.getDocsForSubscription('non-existent');
      expect(docs).toStrictEqual([]);
    });

    it('should handle missing documents in cache', async () => {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- simulates a cache miss; mockReturnValue's parameter is required
      mockNormalizedCache.get.mockReturnValue(undefined);

      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);
      const docs = subscriptionManager.getDocsForSubscription(result.subscriptionId);

      expect(docs).toStrictEqual([]);
    });
  });

  describe('virtual pagination methods', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should delegate getPage to virtual page system', async () => {
      const { virtualPageManager } = subscriptionManager as any;
      const mockPageData = [mockDoc];
      vi.spyOn(virtualPageManager, 'getPage').mockResolvedValue(mockPageData);

      const result = await subscriptionManager.getPage('sub1', 2);

      expect(virtualPageManager.getPage).toHaveBeenCalledWith('sub1', 2);
      expect(result).toStrictEqual(mockPageData);
    });

    it('should delegate getNextBatch to virtual page system', async () => {
      const { virtualPageManager } = subscriptionManager as any;
      const mockAfterData = [mockDoc];
      vi.spyOn(virtualPageManager, 'getNextBatch').mockResolvedValue(mockAfterData);

      const result = await subscriptionManager.getNextBatch('sub1', 'cursor-doc', 10);

      expect(virtualPageManager.getNextBatch).toHaveBeenCalledWith('sub1', 'cursor-doc', 10);
      expect(result).toStrictEqual(mockAfterData);
    });

    it('should delegate getPageInfo to virtual page system', () => {
      const { virtualPageManager } = subscriptionManager as any;
      const mockPageInfo = {
        currentPage: 2,
        pageSize: 20,
        totalPages: 5,
        hasMore: true,
        itemsInCache: 100,
      };
      vi.spyOn(virtualPageManager, 'getPageInfo').mockReturnValue(mockPageInfo);

      const result = subscriptionManager.getPageInfo('sub1');

      expect(virtualPageManager.getPageInfo).toHaveBeenCalledWith('sub1');
      expect(result).toStrictEqual(mockPageInfo);
    });
  });

  describe('backfill', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, {
        pageSize: 100,
        onBackfill: vi.fn<NonNullable<SyncOptions['onBackfill']>>(),
      });
    });

    it('should backfill all subscriptions', async () => {
      const query1: SubscriptionQuery = { doctype: 'TestDoc', fields: ['*'] };
      const query2: SubscriptionQuery = { doctype: 'OtherDoc', fields: ['*'] };

      await subscriptionManager.subscribe(query1);
      await subscriptionManager.subscribe(query2);

      const backfillSpy = vi.spyOn(subscriptionManager as any, 'backfillSub');

      await subscriptionManager.backfill({
        scope: BackfillScope.All,
      });

      expect(backfillSpy).toHaveBeenCalledTimes(2);
    });

    it('should backfill specific subscriptions', async () => {
      const result1 = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });
      await subscriptionManager.subscribe({
        doctype: 'OtherDoc',
        fields: ['*'],
      });

      const backfillSpy = vi.spyOn(subscriptionManager as any, 'backfillSub');

      await subscriptionManager.backfill({
        scope: BackfillScope.Subscriptions,
        subscriptions: [result1.subscriptionId],
      });

      expect(backfillSpy).toHaveBeenCalledOnce();
    });

    it('should backfill by doctypes', async () => {
      await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });
      await subscriptionManager.subscribe({
        doctype: 'OtherDoc',
        fields: ['*'],
      });

      const backfillSpy = vi.spyOn(subscriptionManager as any, 'backfillSub');

      await subscriptionManager.backfill({
        scope: BackfillScope.Doctypes,
        doctypes: ['TestDoc'],
      });

      expect(backfillSpy).toHaveBeenCalledOnce();
    });

    it('should backfill specific documents', async () => {
      const docTargets = [
        { doctype: 'TestDoc', name: 'doc1' },
        { doctype: 'TestDoc', name: 'doc2' },
      ];

      await subscriptionManager.backfill({
        scope: BackfillScope.Docs,
        docs: docTargets,
      });

      expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'doc1');
      expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'doc2');
      expect(mockNormalizedCache.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('backfillSub', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, {
        onBackfill: vi.fn<NonNullable<SyncOptions['onBackfill']>>(),
      });
    });

    it('should perform CDC backfill for subscription', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { status: 'Active' },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const backfillResponse = {
        rows: [{ name: 'doc4', doctype: 'TestDoc', modified: '2024-01-02T10:00:00' }],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);

      await subscriptionManager.backfillSub(subscription);

      expect(mockDb.backfill).toHaveBeenCalledWith({
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { status: 'Active' },
        modifiedAfter: '2024-01-01T11:00:00',
        // Default pageSize
        limit: 200,
      });

      expect(subscription.checkpoint).toBe('2024-01-02T10:00:00');
    });

    it('should handle tombstones (deleted documents)', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const backfillResponse = {
        rows: [],
        deleted: [{ doctype: 'TestDoc', name: 'doc2' }],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);

      await subscriptionManager.backfillSub(subscription);

      expect(mockNormalizedCache.remove).toHaveBeenCalledWith({
        doctype: 'TestDoc',
        name: 'doc2',
      });
      expect(subscription.docIds).not.toContain('doc2');
      expect(subscription.tombstones?.has('doc2')).toBe(true);
    });

    it('should drain follow-up pages while the server reports has_more', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });
      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      (filters.matchesFilters as any).mockReturnValue(true);

      mockDb.backfill
        .mockResolvedValueOnce({
          rows: [{ name: 'doc4', doctype: 'TestDoc', modified: '2024-01-02T10:00:00' }],
          deleted: [],
          checkpoint: '2024-01-02T10:00:00|doc4',
          has_more: true,
        })
        .mockResolvedValueOnce({
          rows: [{ name: 'doc5', doctype: 'TestDoc', modified: '2024-01-02T11:00:00' }],
          deleted: [{ name: 'doc2' }],
          checkpoint: '2024-01-02T11:00:00|doc5',
          has_more: true,
        })
        .mockResolvedValueOnce({
          rows: [],
          deleted: [],
          checkpoint: '2024-01-02T11:00:00|doc5',
          has_more: false,
        });

      await subscriptionManager.backfillSub(subscription);

      expect(mockDb.backfill).toHaveBeenCalledTimes(3);
      // Each follow-up call resumes from the cursor of the previous page
      expect(mockDb.backfill.mock.calls[1][0].modifiedAfter).toBe('2024-01-02T10:00:00|doc4');
      expect(mockDb.backfill.mock.calls[2][0].modifiedAfter).toBe('2024-01-02T11:00:00|doc5');
      // All drained pages are applied: rows joined, tombstone evicted
      expect(subscription.docIds).toStrictEqual(expect.arrayContaining(['doc4', 'doc5']));
      expect(subscription.tombstones?.has('doc2')).toBe(true);
      expect(subscription.checkpoint).toBe('2024-01-02T11:00:00|doc5');
    });

    it('should stop draining at the configured page cap', async () => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, {
        backfillMaxPages: 2,
      });
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });
      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;

      let page = 0;
      mockDb.backfill.mockImplementation(async () => {
        page += 1;
        return {
          rows: [{ name: `doc-${page}`, doctype: 'TestDoc', modified: `2024-01-0${page}` }],
          deleted: [],
          checkpoint: `2024-01-0${page}|doc-${page}`,
          has_more: true,
        };
      });

      await subscriptionManager.backfillSub(subscription);

      expect(mockDb.backfill).toHaveBeenCalledTimes(2);
    });

    it('should plumb backfillMaxPages into the BackfillManager drain path', () => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, {
        backfillMaxPages: 7,
      });

      // One knob bounds both drain paths: the option must reach the
      // BackfillManager (incrementalBackfill) as its maxPages cap.
      const { backfillManager } = subscriptionManager as any;
      expect(backfillManager.options.maxPages).toBe(7);
    });

    it('should not drain when the server omits has_more (legacy servers)', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });
      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;

      mockDb.backfill.mockResolvedValue({
        rows: [{ name: 'doc4', doctype: 'TestDoc', modified: '2024-01-02T10:00:00' }],
        checkpoint: '2024-01-02T10:00:00',
      });

      await subscriptionManager.backfillSub(subscription);

      expect(mockDb.backfill).toHaveBeenCalledOnce();
    });

    it('should reconcile membership with filters', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { status: 'Active' },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const newDoc = {
        name: 'doc4',
        doctype: 'TestDoc',
        status: 'Active',
        modified: '2024-01-02T10:00:00',
      };

      const backfillResponse = {
        rows: [newDoc],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);
      (filters.matchesFilters as any).mockReturnValue(true);

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.docIds).toContain('doc4');
    });

    it('should remove documents that no longer match filters', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { status: 'Active' },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const updatedDoc = {
        name: 'doc1',
        doctype: 'TestDoc',
        status: 'Inactive',
        modified: '2024-01-02T10:00:00',
      };

      const backfillResponse = {
        rows: [updatedDoc],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);
      (filters.matchesFilters as any).mockReturnValue(false);

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.docIds).not.toContain('doc1');
    });

    it('should update page boundaries after backfill', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.boundaries).toBeDefined();
    });

    it('should call onBackfill callback', async () => {
      const onBackfill = vi.fn<NonNullable<SyncOptions['onBackfill']>>();
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, { onBackfill });

      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;

      await subscriptionManager.backfillSub(subscription);

      expect(onBackfill).toHaveBeenCalledWith({
        doctype: 'TestDoc',
        fetched: 0,
        checkpoint: '2024-01-01T12:00:00',
      });
    });

    it('should handle queries without filters', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const backfillResponse = {
        rows: [
          { name: 'doc4', doctype: 'TestDoc' },
          { name: 'doc5', doctype: 'TestDoc' },
        ],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.docIds).toStrictEqual(['doc4', 'doc5']);
    });
  });

  describe('resortSubscriptionDocIds', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should sort by orderBy field ascending', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        orderBy: { field: 'modified', order: Order.Asc },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      subscriptionManager.resortSubscriptionDocIds(subscription);

      expect(subscription.docIds).toStrictEqual(['doc1', 'doc2', 'doc3']);
    });

    it('should sort by orderBy field descending', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        orderBy: { field: 'modified', order: Order.Desc },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      subscriptionManager.resortSubscriptionDocIds(subscription);

      expect(subscription.docIds).toStrictEqual(['doc3', 'doc2', 'doc1']);
    });

    it('should handle documents with null values', async () => {
      const docWithNull = { name: 'doc4', doctype: 'TestDoc', modified: null };
      mockNormalizedCache.get.mockImplementation(({ name }: { name: string }) => {
        if (name === 'doc4') {
          return docWithNull;
        }
        return mockDocs.find((doc) => doc.name === name);
      });

      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        orderBy: { field: 'modified', order: Order.Asc },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      subscription.docIds = ['doc1', 'doc4', 'doc2'];

      subscriptionManager.resortSubscriptionDocIds(subscription);

      // Null should come first for asc
      expect(subscription.docIds[0]).toBe('doc4');
    });

    it('should use name as tiebreaker', async () => {
      const docsWithSameModified = [
        { name: 'doc-b', doctype: 'TestDoc', modified: '2024-01-01T10:00:00' },
        { name: 'doc-a', doctype: 'TestDoc', modified: '2024-01-01T10:00:00' },
        { name: 'doc-c', doctype: 'TestDoc', modified: '2024-01-01T10:00:00' },
      ];

      mockNormalizedCache.get.mockImplementation(({ name }: { name: string }) =>
        docsWithSameModified.find((doc) => doc.name === name),
      );

      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        orderBy: { field: 'modified', order: Order.Asc },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      subscription.docIds = ['doc-b', 'doc-a', 'doc-c'];

      subscriptionManager.resortSubscriptionDocIds(subscription);

      expect(subscription.docIds).toStrictEqual(['doc-a', 'doc-b', 'doc-c']);
    });

    it('should skip sorting when no orderBy', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const originalOrder = [...subscription.docIds];

      subscriptionManager.resortSubscriptionDocIds(subscription);

      expect(subscription.docIds).toStrictEqual(originalOrder);
    });
  });

  describe('updateSubscriptionMembership', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should return subscriptions needing rehydration for new documents', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { status: 'Active' },
      });

      const newDoc = {
        name: 'new-doc',
        doctype: 'TestDoc',
        status: 'Active',
      };

      (filters.matchesFilters as any).mockReturnValue(true);

      const needsRehydration = subscriptionManager.updateSubscriptionMembership(newDoc);

      expect(needsRehydration).toHaveLength(1);
      expect(needsRehydration[0]).toBe(subscriptionManager.getSubscription(result.subscriptionId));
    });

    it('should remove documents that no longer match filters', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        filters: { status: 'Active' },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;

      const updatedDoc = {
        name: 'doc1',
        doctype: 'TestDoc',
        status: 'Inactive',
      };

      (filters.matchesFilters as any).mockReturnValue(false);

      subscriptionManager.updateSubscriptionMembership(updatedDoc);

      expect(subscription.docIds).not.toContain('doc1');
    });

    it('should resort existing documents', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        orderBy: { field: 'modified', order: Order.Desc },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const resortSpy = vi.spyOn(subscriptionManager, 'resortSubscriptionDocIds');

      const existingDoc = {
        name: 'doc2',
        doctype: 'TestDoc',
        // Updated time
        modified: '2024-01-02T10:00:00',
      };

      (filters.matchesFilters as any).mockReturnValue(true);

      subscriptionManager.updateSubscriptionMembership(existingDoc);

      expect(resortSpy).toHaveBeenCalledWith(subscription);
    });

    it('should skip subscriptions with different doctypes', async () => {
      await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const needsRehydration = subscriptionManager.updateSubscriptionMembership({
        name: 'other-doc',
        doctype: 'OtherDoc',
      });

      expect(needsRehydration).toStrictEqual([]);
    });
  });

  describe('removeFromAllSubscriptions', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should remove document from all matching subscriptions', async () => {
      const result1 = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const result2 = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['title'],
      });

      const affectedSubs = subscriptionManager.removeFromAllSubscriptions('TestDoc', 'doc2');

      expect(affectedSubs).toHaveLength(2);

      const sub1 = subscriptionManager.getSubscription(result1.subscriptionId)!;
      const sub2 = subscriptionManager.getSubscription(result2.subscriptionId)!;

      expect(sub1.docIds).not.toContain('doc2');
      expect(sub2.docIds).not.toContain('doc2');
    });

    it('should return empty array when document not in any subscription', async () => {
      await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const affectedSubs = subscriptionManager.removeFromAllSubscriptions('TestDoc', 'non-existent');

      expect(affectedSubs).toStrictEqual([]);
    });

    it('should skip subscriptions with different doctypes', async () => {
      await subscriptionManager.subscribe({
        doctype: 'OtherDoc',
        fields: ['*'],
      });

      const affectedSubs = subscriptionManager.removeFromAllSubscriptions('TestDoc', 'doc1');

      expect(affectedSubs).toStrictEqual([]);
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should get all subscriptions', async () => {
      await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });
      await subscriptionManager.subscribe({
        doctype: 'OtherDoc',
        fields: ['*'],
      });

      const allSubs = subscriptionManager.getAllSubscriptions();

      expect(allSubs.size).toBe(2);
    });

    it('should clear all subscriptions', async () => {
      await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });
      await subscriptionManager.subscribe({
        doctype: 'OtherDoc',
        fields: ['*'],
      });

      subscriptionManager.clear();

      expect(subscriptionManager.getAllSubscriptions().size).toBe(0);
    });
  });

  describe('crypto ID generation', () => {
    it('should use crypto.randomUUID when available', async () => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);

      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      expect(result.subscriptionId).toBe('uuid-1');
      expect(randomUUID).toHaveBeenCalledWith();
    });

    it('should fallback to Math.random when crypto not available', async () => {
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- simulates a runtime with no `crypto` global
      (global as any).crypto = undefined;
      vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);

      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      expect(result.subscriptionId).toBe('4fzzzxjylrx');
      expect(Math.random).toHaveBeenCalledWith();
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should handle backfill response without checkpoint', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const originalCheckpoint = subscription.checkpoint;

      mockDb.backfill.mockResolvedValue({
        rows: [],
        // No checkpoint field
      });

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.checkpoint).toBe(originalCheckpoint);
    });

    it('should handle documents without modified field', async () => {
      const docsWithoutModified = [
        { name: 'doc1', doctype: 'TestDoc', title: 'Doc 1' },
        { name: 'doc2', doctype: 'TestDoc', title: 'Doc 2' },
      ];

      mockDb.getDocList.mockResolvedValue(docsWithoutModified);

      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      expect(result.checkpoint).toBeUndefined();
    });

    it('should handle missing documents during membership update', () => {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- simulates a cache miss; mockReturnValue's parameter is required
      mockNormalizedCache.get.mockReturnValue(undefined);

      const result = subscriptionManager.updateSubscriptionMembership({
        name: 'missing-doc',
        doctype: 'TestDoc',
      });

      expect(result).toStrictEqual([]);
    });

    it('should handle tombstones with invalid data', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const backfillResponse = {
        rows: [],
        deleted: [
          // Invalid tombstone
          null,
          // Missing name
          { doctype: 'TestDoc' },
          // Missing doctype
          { name: 'doc2' },
          // Valid
          { doctype: 'TestDoc', name: 'doc2' },
        ],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.tombstones?.has('doc2')).toBe(true);
      expect(subscription.tombstones?.size).toBe(1);
    });

    it('should handle backfill rows without names', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const backfillResponse = {
        rows: [
          // Missing name
          { doctype: 'TestDoc', title: 'No name' },
          // Valid
          { name: 'doc4', doctype: 'TestDoc' },
        ],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.docIds).toContain('doc4');
    });
  });

  describe('subscription deduplication', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should return the same subscriptionId for identical queries', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['title'],
        filters: { status: 'Active' },
      };

      const first = await subscriptionManager.subscribe(query);
      const second = await subscriptionManager.subscribe(query);

      expect(second.subscriptionId).toBe(first.subscriptionId);
      expect(mockDb.getDocList).toHaveBeenCalledOnce();
    });

    it('should create separate subscriptions for different queries', async () => {
      const query1: SubscriptionQuery = { doctype: 'TestDoc', filters: { status: 'Active' } };
      const query2: SubscriptionQuery = { doctype: 'TestDoc', filters: { status: 'Draft' } };

      const first = await subscriptionManager.subscribe(query1);
      const second = await subscriptionManager.subscribe(query2);

      expect(second.subscriptionId).not.toBe(first.subscriptionId);
      expect(mockDb.getDocList).toHaveBeenCalledTimes(2);
    });

    it('should return cached docs on dedup hit', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };

      const first = await subscriptionManager.subscribe(query);
      const second = await subscriptionManager.subscribe(query);

      expect(second.rows).toBeDefined();
      expect(second.checkpoint).toBe(first.checkpoint);
    });

    it('should keep subscription alive when one consumer unsubscribes but another remains', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };

      const first = await subscriptionManager.subscribe(query);
      await subscriptionManager.subscribe(query);

      subscriptionManager.unsubscribe(first.subscriptionId);

      const sub = subscriptionManager.getSubscription(first.subscriptionId);
      expect(sub).toBeDefined();
    });

    it('should remove subscription when last consumer unsubscribes', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };

      const result = await subscriptionManager.subscribe(query);
      await subscriptionManager.subscribe(query);

      subscriptionManager.unsubscribe(result.subscriptionId);
      subscriptionManager.unsubscribe(result.subscriptionId);

      const sub = subscriptionManager.getSubscription(result.subscriptionId);
      expect(sub).toBeUndefined();
    });

    it('should allow re-subscribing after all consumers unsubscribe', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };

      const first = await subscriptionManager.subscribe(query);
      subscriptionManager.unsubscribe(first.subscriptionId);

      const second = await subscriptionManager.subscribe(query);
      expect(second.subscriptionId).not.toBe(first.subscriptionId);
      expect(mockDb.getDocList).toHaveBeenCalledTimes(2);
    });

    it('should clear dedup maps on clear()', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };
      await subscriptionManager.subscribe(query);

      subscriptionManager.clear();

      const result = await subscriptionManager.subscribe(query);
      expect(mockDb.getDocList).toHaveBeenCalledTimes(2);
      expect(result.subscriptionId).toBeDefined();
    });
  });

  describe('progressive VPM registration', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
    });

    it('should register with VPM when progressive is true', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        progressive: true,
        limit: 20,
      };

      const result = await subscriptionManager.subscribe(query);
      const vpm = subscriptionManager.getVirtualPageManager();
      const virtualSub = vpm.getSubscription(result.subscriptionId);

      expect(virtualSub).toBeDefined();
      expect(virtualSub!.getProgressiveCache().docIds).toHaveLength(mockDocs.length);
    });

    it('should not register with VPM when progressive is false/undefined', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };

      const result = await subscriptionManager.subscribe(query);
      const vpm = subscriptionManager.getVirtualPageManager();
      const virtualSub = vpm.getSubscription(result.subscriptionId);

      expect(virtualSub).toBeUndefined();
    });

    it('should prefer VPM docs when subscription is progressive', async () => {
      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        progressive: true,
        limit: 20,
      };

      const result = await subscriptionManager.subscribe(query);
      const docs = subscriptionManager.getDocsForSubscription(result.subscriptionId);

      expect(docs.length).toBeGreaterThan(0);
    });
  });

  describe('tombstone cleanup', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, {
        tombstoneMaxAge: 1000,
        tombstoneMaxCount: 3,
      });
    });

    it('should remove tombstones older than maxAge', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };
      const result = await subscriptionManager.subscribe(query);
      const sub = subscriptionManager.getSubscription(result.subscriptionId)!;

      sub.tombstones!.set('old-doc', Date.now() - 2000);
      sub.tombstones!.set('recent-doc', Date.now());

      subscriptionManager.cleanupTombstones(result.subscriptionId);

      expect(sub.tombstones!.has('old-doc')).toBe(false);
      expect(sub.tombstones!.has('recent-doc')).toBe(true);
    });

    it('should trim tombstones exceeding maxCount (oldest first)', async () => {
      const now = Date.now();
      const query: SubscriptionQuery = { doctype: 'TestDoc' };
      const result = await subscriptionManager.subscribe(query);
      const sub = subscriptionManager.getSubscription(result.subscriptionId)!;

      sub.tombstones!.set('doc-1', now - 100);
      sub.tombstones!.set('doc-2', now - 50);
      sub.tombstones!.set('doc-3', now - 25);
      sub.tombstones!.set('doc-4', now);

      subscriptionManager.cleanupTombstones(result.subscriptionId);

      expect(sub.tombstones!.size).toBe(3);
      expect(sub.tombstones!.has('doc-1')).toBe(false);
      expect(sub.tombstones!.has('doc-4')).toBe(true);
    });

    it('should handle subscriptions without tombstones', async () => {
      const query: SubscriptionQuery = { doctype: 'TestDoc' };
      const result = await subscriptionManager.subscribe(query);
      const sub = subscriptionManager.getSubscription(result.subscriptionId)!;
      delete sub.tombstones;

      expect(() => {
        subscriptionManager.cleanupTombstones(result.subscriptionId);
      }).not.toThrow();
    });
  });
});
