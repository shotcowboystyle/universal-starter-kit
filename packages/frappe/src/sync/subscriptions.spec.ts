import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';

// Use real implementations - no mocking needed for internal modules
import * as filters from './filters';
import { SubscriptionManager } from './subscriptionManager';
import { BackfillScope, Order } from './types';
import type { SubscriptionQuery, SyncOptions } from './types';

describe(SubscriptionManager, () => {
  let subscriptionManager: SubscriptionManager;
  let mockDb: any;
  let mockNormalizedCache: any;
  let mockVirtualPageManager: any;

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

  beforeEach(() => {
    uuidCount = 0;

    // Spy on filters functions with default behavior
    vi.spyOn(filters, 'matchesFilters').mockReturnValue(true);
    vi.spyOn(filters, 'extractSingleName').mockReturnValue();

    // Mock database module
    mockDb = {
      getDoc: vi.fn().mockResolvedValue(mockDoc),
      getDocList: vi.fn().mockResolvedValue(mockDocs),
      backfill: vi.fn().mockResolvedValue({
        rows: [],
        checkpoint: '2024-01-01T12:00:00',
      }),
    } as any;

    // Mock normalized cache
    mockNormalizedCache = {
      upsert: vi.fn(),
      get: vi
        .fn()
        .mockImplementation(({ name }: { name: string }) => mockDocs.find((doc) => doc.name === name) ?? mockDoc),
      remove: vi.fn(),
    } as any;

    // Mock crypto for ID generation - use sequential IDs so multiple subscribes get unique IDs
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: vi.fn().mockImplementation(() => `uuid-${++uuidCount}`),
      },
      writable: true,
    });

    // Reset mocks
    vi.clearAllMocks();
    (filters.matchesFilters as any).mockReturnValue(true);
    (filters.extractSingleName as any).mockReturnValue();
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
        onBackfill: vi.fn(),
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
      expect(result.rows).toEqual(mockDocs);
      expect(result.checkpoint).toBe('2024-01-01T11:00:00'); // Max modified
      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['title', 'description', 'modified', 'name'],
        filters: { status: 'Active' },
        orderBy: { field: 'modified', order: Order.Desc },
        // The initial fetch honors the subscription limit (it used to drop
        // it, so the bench clamped every list to its default page length).
        limit: 20,
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
      expect(result.rows).toEqual([mockDoc]);
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

      expect(result.rows).toEqual([]);
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
        cursor: undefined,
      });
      expect(result.rows).toEqual(mockDocs);

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

      expect(subscription?.boundaries).toEqual({
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

      expect(subscription?.metadata).toEqual({
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

      expect(result.rows).toEqual([]);
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
      mockVirtualPageManager = (subscriptionManager as any).virtualPageManager;
      vi.spyOn(mockVirtualPageManager, 'getSubscription').mockReturnValue({
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
      expect(docs).toEqual([]);
    });

    it('should handle missing documents in cache', async () => {
      mockNormalizedCache.get.mockReturnValue();

      const query: SubscriptionQuery = {
        doctype: 'TestDoc',
        fields: ['*'],
      };

      const result = await subscriptionManager.subscribe(query);
      const docs = subscriptionManager.getDocsForSubscription(result.subscriptionId);

      expect(docs).toEqual([]);
    });
  });

  describe('virtual pagination methods', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache);
      mockVirtualPageManager = (subscriptionManager as any).virtualPageManager;
    });

    it('should delegate getPage to virtual page system', async () => {
      const mockPageData = [mockDoc];
      vi.spyOn(mockVirtualPageManager, 'getPage').mockResolvedValue(mockPageData);

      const result = await subscriptionManager.getPage('sub1', 2);

      expect(mockVirtualPageManager.getPage).toHaveBeenCalledWith('sub1', 2);
      expect(result).toEqual(mockPageData);
    });

    it('should delegate getNextBatch to virtual page system', async () => {
      const mockAfterData = [mockDoc];
      vi.spyOn(mockVirtualPageManager, 'getNextBatch').mockResolvedValue(mockAfterData);

      const result = await subscriptionManager.getNextBatch('sub1', 'cursor-doc', 10);

      expect(mockVirtualPageManager.getNextBatch).toHaveBeenCalledWith('sub1', 'cursor-doc', 10);
      expect(result).toEqual(mockAfterData);
    });

    it('should delegate getPageInfo to virtual page system', () => {
      const mockPageInfo = {
        currentPage: 2,
        pageSize: 20,
        totalPages: 5,
        hasMore: true,
        itemsInCache: 100,
      };
      vi.spyOn(mockVirtualPageManager, 'getPageInfo').mockReturnValue(mockPageInfo);

      const result = subscriptionManager.getPageInfo('sub1');

      expect(mockVirtualPageManager.getPageInfo).toHaveBeenCalledWith('sub1');
      expect(result).toEqual(mockPageInfo);
    });
  });

  describe('backfill', () => {
    beforeEach(() => {
      subscriptionManager = new SubscriptionManager(mockDb, mockNormalizedCache, {
        pageSize: 100,
        onBackfill: vi.fn(),
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
      const _result2 = await subscriptionManager.subscribe({
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
        onBackfill: vi.fn(),
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
        limit: 200, // Default pageSize
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
      const onBackfill = vi.fn();
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

      expect(subscription.docIds).toEqual(['doc4', 'doc5']);
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

      expect(subscription.docIds).toEqual(['doc1', 'doc2', 'doc3']);
    });

    it('should sort by orderBy field descending', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
        orderBy: { field: 'modified', order: Order.Desc },
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      subscriptionManager.resortSubscriptionDocIds(subscription);

      expect(subscription.docIds).toEqual(['doc3', 'doc2', 'doc1']);
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

      expect(subscription.docIds[0]).toBe('doc4'); // Null should come first for asc
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

      expect(subscription.docIds).toEqual(['doc-a', 'doc-b', 'doc-c']);
    });

    it('should skip sorting when no orderBy', async () => {
      const result = await subscriptionManager.subscribe({
        doctype: 'TestDoc',
        fields: ['*'],
      });

      const subscription = subscriptionManager.getSubscription(result.subscriptionId)!;
      const originalOrder = [...subscription.docIds];

      subscriptionManager.resortSubscriptionDocIds(subscription);

      expect(subscription.docIds).toEqual(originalOrder);
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
        modified: '2024-01-02T10:00:00', // Updated time
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

      expect(needsRehydration).toEqual([]);
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

      expect(affectedSubs).toEqual([]);
    });

    it('should skip subscriptions with different doctypes', async () => {
      await subscriptionManager.subscribe({
        doctype: 'OtherDoc',
        fields: ['*'],
      });

      const affectedSubs = subscriptionManager.removeFromAllSubscriptions('TestDoc', 'doc1');

      expect(affectedSubs).toEqual([]);
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
      expect(crypto.randomUUID).toHaveBeenCalledWith();
    });

    it('should fallback to Math.random when crypto not available', async () => {
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
      mockNormalizedCache.get.mockReturnValue();

      const result = subscriptionManager.updateSubscriptionMembership({
        name: 'missing-doc',
        doctype: 'TestDoc',
      });

      expect(result).toEqual([]);
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
          null, // Invalid tombstone
          { doctype: 'TestDoc' }, // Missing name
          { name: 'doc2' }, // Missing doctype
          { doctype: 'TestDoc', name: 'doc2' }, // Valid
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
          { doctype: 'TestDoc', title: 'No name' }, // Missing name
          { name: 'doc4', doctype: 'TestDoc' }, // Valid
        ],
        checkpoint: '2024-01-02T10:00:00',
      };

      mockDb.backfill.mockResolvedValue(backfillResponse);

      await subscriptionManager.backfillSub(subscription);

      expect(subscription.docIds).toContain('doc4');
    });
  });
});
