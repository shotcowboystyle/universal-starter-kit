import { describe, expect, it } from 'vitest';

import type { FrappeDocData } from '../common/types';

import { BackfillScope, Operation, Order, PendingRehydrationType } from './types';
import type {
  CreateMutation,
  DeleteMutation,
  Mutation,
  OrderBy,
  PageBoundaries,
  Subscription,
  SubscriptionQuery,
  UpdateMutation,
} from './types';

describe('Order enum', () => {
  it('should have correct values', () => {
    expect(Order.Asc).toBe('asc');
    expect(Order.Desc).toBe('desc');
  });

  it('should be usable in OrderBy interface', () => {
    const orderBy: OrderBy = {
      field: 'created',
      order: Order.Desc,
    };
    expect(orderBy.field).toBe('created');
    expect(orderBy.order).toBe('desc');
  });

  it('should accept string literals for order field names', () => {
    const orderBy: OrderBy = {
      field: 'modified',
      order: 'asc' as Order,
    };
    expect(orderBy.order).toBe('asc');
    expect(orderBy.order).toBe(Order.Asc);
  });
});

describe('SubscriptionQuery', () => {
  it('should use camelCase for all properties', () => {
    const query: SubscriptionQuery = {
      doctype: 'Task',
      fields: ['name', 'status', 'priority'],
      filters: [['status', '=', 'Open']],
      orderBy: {
        field: 'priority',
        order: Order.Desc,
      },
      limitStart: 0,
      limit: 20,
    };
    expect(query.limitStart).toBe(0);
    expect(query.limit).toBe(20);
    expect(Array.isArray(query.orderBy) ? query.orderBy[0].order : query.orderBy?.order).toBe('desc');
  });

  it('should handle optional properties', () => {
    const minimalQuery: SubscriptionQuery = {
      doctype: 'Task',
      fields: ['name'],
    };
    expect(minimalQuery.filters).toBeUndefined();
    expect(minimalQuery.orderBy).toBeUndefined();
    expect(minimalQuery.limitStart).toBeUndefined();
    expect(minimalQuery.limit).toBeUndefined();
  });

  it('should support different filter formats', () => {
    const arrayFilters: SubscriptionQuery = {
      doctype: 'Task',
      fields: ['name'],
      filters: [
        ['status', '=', 'Open'],
        ['priority', '>', 5],
      ],
    };
    const objectFilters: SubscriptionQuery = {
      doctype: 'Task',
      fields: ['name'],
      filters: {
        status: 'Open',
        priority: 5,
      },
    };
    expect(Array.isArray(arrayFilters.filters)).toBe(true);
    expect(objectFilters.filters).toBeTypeOf('object');
  });
});

describe('PageBoundaries', () => {
  it('should track page boundaries correctly', () => {
    const boundaries: PageBoundaries<FrappeDocData> = {
      firstItem: { name: 'TASK-001', doctype: 'Task', priority: 10 },
      lastItem: { name: 'TASK-020', doctype: 'Task', priority: 1 },
      offset: 0,
      pageSize: 20,
      temporaryOverflow: 2,
    };
    expect(boundaries.firstItem?.name).toBe('TASK-001');
    expect(boundaries.lastItem?.name).toBe('TASK-020');
    expect(boundaries.temporaryOverflow).toBe(2);
  });

  it('should allow undefined items', () => {
    const emptyBoundaries: PageBoundaries<FrappeDocData> = {
      offset: 0,
      pageSize: 20,
    };
    expect(emptyBoundaries.firstItem).toBeUndefined();
    expect(emptyBoundaries.lastItem).toBeUndefined();
  });
});

describe('Subscription', () => {
  it('should contain all required fields', () => {
    const subscription: Subscription = {
      id: 'sub-123',
      query: {
        doctype: 'Task',
        fields: ['name', 'status'],
        limitStart: 0,
        limit: 20,
      },
      docIds: ['TASK-001', 'TASK-002'],
    };
    expect(subscription.id).toBe('sub-123');
    expect(subscription.query.doctype).toBe('Task');
    expect(subscription.docIds).toHaveLength(2);
  });

  it('should support optional fields', () => {
    const subscription: Subscription = {
      id: 'sub-456',
      query: {
        doctype: 'Invoice',
        fields: ['name'],
      },
      docIds: [],
      checkpoint: 'checkpoint-123',
      cursor: 'cursor-456',
      boundaries: {
        offset: 20,
        pageSize: 20,
      },
      lockExpiry: Date.now() + 5000,
      pendingRehydration: PendingRehydrationType.FullRefresh,
    };
    expect(subscription.checkpoint).toBe('checkpoint-123');
    expect(subscription.cursor).toBe('cursor-456');
    expect(subscription.pendingRehydration).toBe(PendingRehydrationType.FullRefresh);
  });
});

describe('Mutation types', () => {
  describe('CreateMutation', () => {
    it('should have correct structure', () => {
      const create: CreateMutation<FrappeDocData> = {
        mutationId: 'mut-001',
        operation: Operation.Create,
        doc: {
          name: 'TASK-001',
          doctype: 'Task',
          subject: 'New Task',
          status: 'Open',
        },
        affected: [],
        version: '1',
      };
      expect(create.operation).toBe(Operation.Create);
      expect(create.doc.name).toBe('TASK-001');
      expect(create.doc.doctype).toBe('Task');
      expect(create.doc.subject).toBe('New Task');
      expect(create.doc.status).toBe('Open');
    });
  });

  describe('UpdateMutation', () => {
    it('should have correct structure', () => {
      const update: UpdateMutation<FrappeDocData> = {
        mutationId: 'mut-002',
        operation: Operation.Update,
        doc: {
          name: 'TASK-001',
          doctype: 'Task',
          status: 'Completed',
        },
        affected: [],
        version: '5',
      };
      expect(update.operation).toBe(Operation.Update);
      expect(update.doc.name).toBe('TASK-001');
      expect(update.version).toBe('5');
    });
  });

  describe('DeleteMutation', () => {
    it('should have correct structure', () => {
      const deleteMutation: DeleteMutation<FrappeDocData> = {
        mutationId: 'mut-003',
        operation: Operation.Delete,
        doc: {
          name: 'TASK-001',
          doctype: 'Task',
        },
        affected: [],
        version: '5',
      };
      expect(deleteMutation.operation).toBe(Operation.Delete);
      expect(deleteMutation.doc.name).toBe('TASK-001');
      expect((deleteMutation as any).values).toBeUndefined();
    });
  });

  it('should support discriminated union', () => {
    const mutations: Mutation<FrappeDocData>[] = [
      {
        mutationId: '1',
        operation: Operation.Create,
        doc: {
          name: 'TASK-001',
          doctype: 'Task',
          status: 'Open',
        },
        affected: [],
      },
      {
        mutationId: '2',
        operation: Operation.Update,
        doc: {
          name: 'TASK-001',
          doctype: 'Task',
          status: 'Closed',
        },
        affected: [],
      },
      {
        mutationId: '3',
        operation: Operation.Delete,
        doc: {
          name: 'TASK-001',
          doctype: 'Task',
        },
        affected: [],
      },
    ];
    mutations.forEach((mutation) => {
      switch (mutation.operation) {
        case Operation.Create: {
          expect(mutation.doc.name).toBeDefined();
          expect(mutation.doc.doctype).toBeDefined();
          break;
        }
        case Operation.Update: {
          expect(mutation.doc.name).toBeDefined();
          expect(mutation.doc.doctype).toBeDefined();
          break;
        }
        case Operation.Delete: {
          expect(mutation.doc.name).toBeDefined();
          expect((mutation as any).values).toBeUndefined();
          break;
        }
      }
    });
  });
});

describe('BackfillScope enum', () => {
  it('should have all scopes defined', () => {
    expect(BackfillScope.All).toBe('all');
    expect(BackfillScope.Doctypes).toBe('doctypes');
  });
});
