import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbModule } from '../db';

import { NormalizedCache } from './normalized-cache';
import { SubscriptionManager } from './subscription-manager';
import { Order } from './types';
import type { OrderByField } from './types';

describe('Multi-field ordering', () => {
  let db: any;
  let normalizedCache: NormalizedCache;
  let subscriptionManager: SubscriptionManager;

  beforeEach(() => {
    // Mock the db module
    db = {
      getDoc: vi.fn<DbModule['getDoc']>(),
      getDocList: vi.fn<DbModule['getDocList']>().mockResolvedValue([]),
      backfill: vi.fn<DbModule['backfill']>().mockResolvedValue({ rows: [] }),
    };

    normalizedCache = new NormalizedCache();
    subscriptionManager = new SubscriptionManager(db, normalizedCache);
  });

  describe('SubscriptionManager.resortSubscriptionDocIds', () => {
    it('should sort by multiple fields in order', async () => {
      // Setup test documents
      const docs = [
        {
          doctype: 'Task',
          name: 'TASK-001',
          priority: 1,
          status: 'Open',
          title: 'B',
        },
        {
          doctype: 'Task',
          name: 'TASK-002',
          priority: 1,
          status: 'Open',
          title: 'A',
        },
        {
          doctype: 'Task',
          name: 'TASK-003',
          priority: 2,
          status: 'Closed',
          title: 'C',
        },
        {
          doctype: 'Task',
          name: 'TASK-004',
          priority: 1,
          status: 'Closed',
          title: 'D',
        },
        {
          doctype: 'Task',
          name: 'TASK-005',
          priority: 2,
          status: 'Open',
          title: 'E',
        },
      ];

      // Add documents to cache
      for (const doc of docs) {
        normalizedCache.upsert(doc as any);
      }

      // Create subscription with multi-field ordering
      const orderBy: OrderByField[] = [
        { field: 'priority', order: Order.Asc },
        // "Open" > "Closed" alphabetically
        { field: 'status', order: Order.Desc },
        { field: 'title', order: Order.Asc },
      ];

      const subscription = {
        id: 'test-sub',
        query: {
          doctype: 'Task',
          orderBy,
        },
        docIds: docs.map((d) => d.name),
        tombstones: new Set(),
      } as any;

      // Sort the subscription
      subscriptionManager.resortSubscriptionDocIds(subscription);

      // Expected order:
      // 1. TASK-002: priority=1, status=Open, title=A
      // 2. TASK-001: priority=1, status=Open, title=B
      // 3. TASK-004: priority=1, status=Closed, title=D
      // 4. TASK-005: priority=2, status=Open, title=E
      // 5. TASK-003: priority=2, status=Closed, title=C

      expect(subscription.docIds).toStrictEqual(['TASK-002', 'TASK-001', 'TASK-004', 'TASK-005', 'TASK-003']);
    });

    it('should handle null values correctly with multiple fields', async () => {
      // Setup test documents with null values
      const docs = [
        { doctype: 'Task', name: 'TASK-001', priority: null, status: 'Open' },
        { doctype: 'Task', name: 'TASK-002', priority: 1, status: null },
        { doctype: 'Task', name: 'TASK-003', priority: null, status: null },
        { doctype: 'Task', name: 'TASK-004', priority: 2, status: 'Open' },
      ];

      // Add documents to cache
      for (const doc of docs) {
        normalizedCache.upsert(doc as any);
      }

      // Create subscription with multi-field ordering
      const orderBy: OrderByField[] = [
        { field: 'priority', order: Order.Asc },
        { field: 'status', order: Order.Asc },
      ];

      const subscription = {
        id: 'test-sub',
        query: {
          doctype: 'Task',
          orderBy,
        },
        docIds: docs.map((d) => d.name),
        tombstones: new Set(),
      } as any;

      // Sort the subscription
      subscriptionManager.resortSubscriptionDocIds(subscription);

      // Expected order (nulls first in ascending):
      // 1. TASK-003: priority=null, status=null
      // 2. TASK-001: priority=null, status=Open
      // 3. TASK-002: priority=1, status=null
      // 4. TASK-004: priority=2, status=Open

      expect(subscription.docIds).toStrictEqual(['TASK-003', 'TASK-001', 'TASK-002', 'TASK-004']);
    });

    it('should still work with single field orderBy', async () => {
      // Setup test documents
      const docs = [
        { doctype: 'Task', name: 'TASK-001', priority: 3 },
        { doctype: 'Task', name: 'TASK-002', priority: 1 },
        { doctype: 'Task', name: 'TASK-003', priority: 2 },
      ];

      // Add documents to cache
      for (const doc of docs) {
        normalizedCache.upsert(doc as any);
      }

      // Single-field orderBy (string field name)
      const orderBy: OrderByField = {
        field: 'priority',
        order: Order.Desc,
      };

      const subscription = {
        id: 'test-sub',
        query: {
          doctype: 'Task',
          orderBy,
        },
        docIds: docs.map((d) => d.name),
        tombstones: new Set(),
      } as any;

      // Sort the subscription
      subscriptionManager.resortSubscriptionDocIds(subscription);

      // Expected order (descending):
      // priority=3, priority=2, priority=1
      expect(subscription.docIds).toStrictEqual(['TASK-001', 'TASK-003', 'TASK-002']);
    });
  });
});
