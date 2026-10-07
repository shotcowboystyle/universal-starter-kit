import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDocData } from './common/types';
import type { HttpClient, HttpResponse } from './core/http';
import { DbModule } from './db';
import type { BackfillArgs, BackfillResponse } from './db';
import { Order } from './sync/types';

interface TestDoc extends FrappeDocData {
  title: string;
  description?: string;
  status?: string;
}

describe(DbModule, () => {
  let db: DbModule;
  let mockHttpClient: HttpClient;

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      head: vi.fn(),
      request: vi.fn(),
      setToken: vi.fn(),
    } as unknown as HttpClient;

    db = new DbModule(mockHttpClient);
  });

  describe('constructor', () => {
    it('should initialize with default endpoints', () => {
      const dbInstance = new DbModule(mockHttpClient);
      expect(dbInstance).toBeDefined();
    });

    it('should initialize with custom endpoints', () => {
      const dbInstance = new DbModule(mockHttpClient, {
        customEndpoints: {
          createDoc: 'custom.create',
          updateDoc: 'custom.update',
          deleteDoc: 'custom.delete',
          backfill: 'custom.backfill',
        },
      });
      expect(dbInstance).toBeDefined();
    });

    it('should initialize with partial custom endpoints', () => {
      const dbInstance = new DbModule(mockHttpClient, {
        customEndpoints: { createDoc: 'custom.create' },
      });
      expect(dbInstance).toBeDefined();
    });
  });

  describe('getDoc', () => {
    it('should fetch a document by doctype and name', async () => {
      const mockDoc: TestDoc = {
        name: 'TEST-001',
        title: 'Test Document',
        description: 'Test description',
        doctype: 'TestDoc',
      };

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: mockDoc },
        headers: new Headers(),
        status: 200,
      } as HttpResponse<{ data: TestDoc }>);

      const result = await db.getDoc<TestDoc>('TestDocType', 'TEST-001');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/resource/TestDocType/TEST-001');
      expect(result).toEqual(mockDoc);
    });

    it('should properly encode doctype and name with special characters', async () => {
      const mockDoc = { name: 'Test/Doc-001' };
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: mockDoc },
        headers: new Headers(),
        status: 200,
      });

      await db.getDoc('Test DocType', 'Test/Doc-001');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/resource/Test%20DocType/Test%2FDoc-001');
    });
  });

  describe('getDocVersion', () => {
    it('should return ETag when available', async () => {
      const mockHeaders = new Headers({
        ETag: '"abc123"',
        'Last-Modified': 'Wed, 21 Oct 2025 07:28:00 GMT',
      });

      (mockHttpClient.head as any).mockResolvedValue({
        headers: mockHeaders,
        status: 200,
        payload: '',
      });

      const version = await db.getDocVersion('TestDocType', 'TEST-001');

      expect(mockHttpClient.head).toHaveBeenCalledWith('/api/resource/TestDocType/TEST-001');
      expect(version).toBe('"abc123"');
    });

    it('should return Last-Modified when ETag is not available', async () => {
      const mockHeaders = new Headers({
        'Last-Modified': 'Wed, 21 Oct 2025 07:28:00 GMT',
      });

      (mockHttpClient.head as any).mockResolvedValue({
        headers: mockHeaders,
        status: 200,
        payload: '',
      });

      const version = await db.getDocVersion('TestDocType', 'TEST-001');
      expect(version).toBe('Wed, 21 Oct 2025 07:28:00 GMT');
    });

    it('should return undefined when neither ETag nor Last-Modified is available', async () => {
      const mockHeaders = new Headers();

      (mockHttpClient.head as any).mockResolvedValue({
        headers: mockHeaders,
        status: 200,
        payload: '',
      });

      const version = await db.getDocVersion('TestDocType', 'TEST-001');
      expect(version).toBeUndefined();
    });

    it('should return undefined and log error on exception', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (mockHttpClient.head as any).mockRejectedValue(new Error('Network error'));

      const version = await db.getDocVersion('TestDocType', 'TEST-001');

      expect(version).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getDocList', () => {
    it('should fetch document list without options', async () => {
      const mockDocs: TestDoc[] = [
        { name: 'TEST-001', title: 'Doc 1', doctype: 'TestDoc' },
        { name: 'TEST-002', title: 'Doc 2', doctype: 'TestDoc' },
      ];

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: mockDocs },
        headers: new Headers(),
        status: 200,
      });

      const result = await db.getDocList<TestDoc>('TestDocType');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/resource/TestDocType', {}, undefined, undefined);
      expect(result).toEqual(mockDocs);
    });

    it('should fetch document list with all options', async () => {
      const mockDocs: TestDoc[] = [{ name: 'TEST-001', title: 'Doc 1', doctype: 'TestDoc' }];

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: mockDocs },
        headers: new Headers(),
        status: 200,
      });

      const options = {
        fields: ['name', 'title'] as readonly string[],
        filters: { status: 'Active' },
        orFilters: [['type', '=', 'A']] as [string, string, unknown][],
        limitStart: 10,
        limit: 20,
        orderBy: { field: 'name', order: Order.Asc },
        groupBy: 'status',
        asDict: true,
      };

      const result = await db.getDocList<TestDoc>('TestDocType', options);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/resource/TestDocType',
        {
          fields: ['name', 'title'],
          filters: [['status', '=', 'Active']],
          or_filters: [['type', '=', 'A']],
          limit_start: 10,
          limit_page_length: 20,
          order_by: 'name asc',
          group_by: 'status',
          as_dict: true,
        },
        undefined,
        undefined,
      );
      expect(result).toEqual(mockDocs);
    });

    it('should handle array filters', async () => {
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: [] },
        headers: new Headers(),
        status: 200,
      });

      await db.getDocList('TestDocType', {
        filters: [
          ['status', '=', 'Active'],
          ['type', '!=', 'Deleted'],
        ],
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/resource/TestDocType',
        {
          filters: [
            ['status', '=', 'Active'],
            ['type', '!=', 'Deleted'],
          ],
        },
        undefined,
        undefined,
      );
    });

    it('should handle object filters', async () => {
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: [] },
        headers: new Headers(),
        status: 200,
      });

      await db.getDocList('TestDocType', {
        filters: { status: 'Active', type: 'Standard' },
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/resource/TestDocType',
        {
          filters: [
            ['status', '=', 'Active'],
            ['type', '=', 'Standard'],
          ],
        },
        undefined,
        undefined,
      );
    });

    it('should return empty array when data is undefined', async () => {
      (mockHttpClient.get as any).mockResolvedValue({
        payload: {},
        headers: new Headers(),
        status: 200,
      });

      const result = await db.getDocList('TestDocType');
      expect(result).toEqual([]);
    });

    it('should handle response with message field instead of data', async () => {
      const mockDocs: TestDoc[] = [{ name: 'TEST-001', title: 'Doc 1', doctype: 'TestDoc' }];

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { message: mockDocs },
        headers: new Headers(),
        status: 200,
      });

      const result = await db.getDocList<TestDoc>('TestDocType');
      expect(result).toEqual([]);
    });
  });

  describe('getCount', () => {
    it('should get document count without filters', async () => {
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { message: 42 },
        headers: new Headers(),
        status: 200,
      });

      const count = await db.getCount('TestDocType');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/method/frappe.client.get_count',
        { doctype: 'TestDocType' },
        undefined,
        undefined,
      );
      expect(count).toBe(42);
    });

    it('should get document count with array filters', async () => {
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { message: 10 },
        headers: new Headers(),
        status: 200,
      });

      const count = await db.getCount('TestDocType', [['status', '=', 'Active']]);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/method/frappe.client.get_count',
        { doctype: 'TestDocType', filters: [['status', '=', 'Active']] },
        undefined,
        undefined,
      );
      expect(count).toBe(10);
    });

    it('should get document count with object filters', async () => {
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { message: 5 },
        headers: new Headers(),
        status: 200,
      });

      const count = await db.getCount('TestDocType', { status: 'Active' });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/method/frappe.client.get_count',
        { doctype: 'TestDocType', filters: [['status', '=', 'Active']] },
        undefined,
        undefined,
      );
      expect(count).toBe(5);
    });

    it('should return 0 and log error for invalid count', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { message: 'invalid' },
        headers: new Headers(),
        status: 200,
      });

      const count = await db.getCount('TestDocType');

      expect(count).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith('invalid count for doctype TestDocType: invalid');
      consoleErrorSpy.mockRestore();
    });

    it('should return 0 for NaN', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { message: Number.NaN },
        headers: new Headers(),
        status: 200,
      });

      const count = await db.getCount('TestDocType');

      expect(count).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith();
      consoleErrorSpy.mockRestore();
    });

    it('should return 0 for Infinity', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { message: Number.POSITIVE_INFINITY },
        headers: new Headers(),
        status: 200,
      });

      const count = await db.getCount('TestDocType');

      expect(count).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createDoc', () => {
    it('should create a document', async () => {
      const newDoc: TestDoc = {
        doctype: 'TestDocType',
        name: 'TEST-003',
        title: 'New Document',
        description: 'Test description',
      };

      const createdDoc: TestDoc = {
        ...newDoc,
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: createdDoc,
        headers: new Headers(),
        status: 200,
      });

      const result = await db.createDoc<TestDoc>(newDoc);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.create_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-003',
          title: 'New Document',
          description: 'Test description',
        },
        {},
      );
      expect(result).toEqual(createdDoc);
    });

    it('should include Idempotency-Key header when client_mutation_id is provided', async () => {
      const newDoc = {
        doctype: 'TestDocType',
        name: 'TEST-003',
        title: 'New Document',
        client_mutation_id: 'mutation-123',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { name: 'TEST-003', title: 'New Document' },
        headers: new Headers(),
        status: 200,
      });

      await db.createDoc(newDoc);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.create_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-003',
          title: 'New Document',
        },
        {
          'Idempotency-Key': 'mutation-123',
        },
      );
    });

    it('should exclude base_modified from request body', async () => {
      const newDoc = {
        doctype: 'TestDocType',
        name: 'TEST-003',
        title: 'New Document',
        base_modified: '2025-01-01',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { name: 'TEST-003', title: 'New Document' },
        headers: new Headers(),
        status: 200,
      });

      await db.createDoc(newDoc);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.create_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-003',
          title: 'New Document',
        },
        {},
      );
    });

    it('should use custom endpoint when provided', async () => {
      const customDb = new DbModule(mockHttpClient, {
        customEndpoints: { createDoc: 'custom.create_endpoint' },
      });

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { name: 'TEST-003' },
        headers: new Headers(),
        status: 200,
      });

      await customDb.createDoc({
        doctype: 'TestDocType',
        name: 'TEST-003',
        title: 'Test',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/custom.create_endpoint',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should unwrap the live server's {message} envelope so the ack surfaces the real name", async () => {
      // Regression: whitelisted method returns arrive as {message: {...doc}}.
      // Returning the envelope made created.name undefined, so the mutation
      // engine's temporary→real reconciliation never ran (optimistic rows
      // lingered next to their realtime server rows until reload).
      const createdDoc: TestDoc = {
        doctype: 'TestDocType',
        name: 'SERVER-NAME-001',
        title: 'New Document',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: createdDoc },
        headers: new Headers(),
        status: 200,
      });

      const result = await db.createDoc<TestDoc>({
        doctype: 'TestDocType',
        name: 'new-todo-placeholder',
        title: 'New Document',
      });

      expect(result).toEqual(createdDoc);
      expect(result.name).toBe('SERVER-NAME-001');
    });

    it('should not unwrap a document that itself has a message field', async () => {
      // A doc with a scalar `message` field (e.g. Email Template) must pass
      // through untouched — only the envelope shape (object message, no
      // top-level name) unwraps.
      const docWithMessageField = {
        doctype: 'TestDocType',
        name: 'TEST-004',
        message: 'I am a doc field, not an envelope',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: docWithMessageField,
        headers: new Headers(),
        status: 200,
      });

      const result = await db.createDoc(docWithMessageField as any);

      expect(result).toEqual(docWithMessageField);
    });
  });

  describe('updateDoc', () => {
    it('should update a document', async () => {
      const updates = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        title: 'Updated Title',
        status: 'Completed',
      };

      const updatedDoc: TestDoc = {
        name: 'TEST-001',
        title: 'Updated Title',
        status: 'Completed',
        doctype: 'TestDoc',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: updatedDoc,
        headers: new Headers(),
        status: 200,
      });

      const result = await db.updateDoc<TestDoc>(updates);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.update_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-001',
          data: {
            title: 'Updated Title',
            status: 'Completed',
          },
        },
        {},
      );
      expect(result).toEqual(updatedDoc);
    });

    it('should include Idempotency-Key when client_mutation_id is provided', async () => {
      const updates = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        title: 'Updated Title',
        client_mutation_id: 'mutation-456',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { name: 'TEST-001', title: 'Updated Title' },
        headers: new Headers(),
        status: 200,
      });

      await db.updateDoc(updates);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.update_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-001',
          data: {
            title: 'Updated Title',
          },
        },
        {
          'Idempotency-Key': 'mutation-456',
        },
      );
    });

    it('should include If-Match header when base_modified is provided', async () => {
      const updates = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        title: 'Updated Title',
        base_modified: '2025-01-01T10:00:00Z',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { name: 'TEST-001', title: 'Updated Title' },
        headers: new Headers(),
        status: 200,
      });

      await db.updateDoc(updates);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.update_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-001',
          data: {
            title: 'Updated Title',
          },
        },
        {
          'If-Match': '2025-01-01T10:00:00Z',
        },
      );
    });

    it('should include both headers when both IDs are provided', async () => {
      const updates = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        title: 'Updated Title',
        client_mutation_id: 'mutation-789',
        base_modified: '2025-01-01T10:00:00Z',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { name: 'TEST-001', title: 'Updated Title' },
        headers: new Headers(),
        status: 200,
      });

      await db.updateDoc(updates);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/live.live.api.update_doc', expect.any(Object), {
        'Idempotency-Key': 'mutation-789',
        'If-Match': '2025-01-01T10:00:00Z',
      });
    });

    it('should use custom endpoint when provided', async () => {
      const customDb = new DbModule(mockHttpClient, {
        customEndpoints: { updateDoc: 'custom.update_endpoint' },
      });

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { name: 'TEST-001' },
        headers: new Headers(),
        status: 200,
      });

      await customDb.updateDoc({
        doctype: 'TestDocType',
        name: 'TEST-001',
        title: 'Test',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/custom.update_endpoint',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should unwrap the live server's {message} envelope", async () => {
      const updatedDoc: TestDoc = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        title: 'Updated Title',
      };

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: updatedDoc },
        headers: new Headers(),
        status: 200,
      });

      const result = await db.updateDoc<TestDoc>({
        doctype: 'TestDocType',
        name: 'TEST-001',
        title: 'Updated Title',
      });

      expect(result).toEqual(updatedDoc);
    });
  });

  describe('deleteDoc', () => {
    it('should delete a document', async () => {
      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: 'Document deleted successfully' },
        headers: new Headers(),
        status: 200,
      });

      const result = await db.deleteDoc({
        doctype: 'TestDocType',
        name: 'TEST-001',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.delete_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-001',
        },
        {},
      );
      expect(result).toEqual({ message: 'Document deleted successfully' });
    });

    it('should include Idempotency-Key when mutationId is provided', async () => {
      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: 'Document deleted successfully' },
        headers: new Headers(),
        status: 200,
      });

      await db.deleteDoc({
        doctype: 'TestDocType',
        name: 'TEST-001',
        client_mutation_id: 'delete-mutation-123',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/live.live.api.delete_doc',
        {
          doctype: 'TestDocType',
          name: 'TEST-001',
        },
        {
          'Idempotency-Key': 'delete-mutation-123',
        },
      );
    });

    it('should use custom endpoint when provided', async () => {
      const customDb = new DbModule(mockHttpClient, {
        customEndpoints: { deleteDoc: 'custom.delete_endpoint' },
      });

      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: 'Deleted' },
        headers: new Headers(),
        status: 200,
      });

      await customDb.deleteDoc({
        doctype: 'TestDocType',
        name: 'TEST-001',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/method/custom.delete_endpoint',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('renameDoc', () => {
    it('should rename a document', async () => {
      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: 'Document renamed successfully' },
        headers: new Headers(),
        status: 200,
      });

      const result = await db.renameDoc(
        {
          doctype: 'TestDocType',
          name: 'OLD-001',
        },
        'NEW-001',
        false,
      );

      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.model.rename_doc.rename_doc', {
        doctype: 'TestDocType',
        old_name: 'OLD-001',
        new_name: 'NEW-001',
        merge: false,
      });
      expect(result).toEqual({ message: 'Document renamed successfully' });
    });

    it('should rename and merge when merge is true', async () => {
      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: 'Document renamed and merged' },
        headers: new Headers(),
        status: 200,
      });

      await db.renameDoc(
        {
          doctype: 'TestDocType',
          name: 'OLD-001',
        },
        'EXISTING-001',
        true,
      );

      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.model.rename_doc.rename_doc', {
        doctype: 'TestDocType',
        old_name: 'OLD-001',
        new_name: 'EXISTING-001',
        merge: true,
      });
    });

    it('should handle falsy merge values', async () => {
      (mockHttpClient.post as any).mockResolvedValue({
        payload: { message: 'Renamed' },
        headers: new Headers(),
        status: 200,
      });

      await db.renameDoc(
        {
          doctype: 'TestDocType',
          name: 'OLD-001',
        },
        'NEW-001',
        false,
      );

      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.model.rename_doc.rename_doc', {
        doctype: 'TestDocType',
        old_name: 'OLD-001',
        new_name: 'NEW-001',
        merge: false,
      });
    });
  });

  describe('backfill', () => {
    it('should perform backfill with minimal args', async () => {
      const mockResponse: BackfillResponse<TestDoc> = {
        rows: [
          { name: 'TEST-001', title: 'Doc 1', doctype: 'TestDoc' },
          { name: 'TEST-002', title: 'Doc 2', doctype: 'TestDoc' },
        ],
      };

      (mockHttpClient.get as any).mockResolvedValue({
        payload: mockResponse,
        headers: new Headers(),
        status: 200,
      });

      const args: BackfillArgs = {
        doctype: 'TestDocType',
      };

      const result = await db.backfill<TestDoc>(args);

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/method/live.live.api.backfill', {
        doctype: 'TestDocType',
        fields: undefined,
        filters: undefined,
        limit: 200,
        modified_after: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should perform backfill with all args', async () => {
      const mockResponse: BackfillResponse<TestDoc> = {
        rows: [{ name: 'TEST-001', title: 'Doc 1', doctype: 'TestDoc' }],
        checkpoint: 'checkpoint-123',
        deleted: [{ doctype: 'TestDocType', name: 'DELETED-001' }],
      };

      (mockHttpClient.get as any).mockResolvedValue({
        payload: mockResponse,
        headers: new Headers(),
        status: 200,
      });

      const args: BackfillArgs = {
        method: 'custom.backfill_method',
        doctype: 'TestDocType',
        fields: ['name', 'title'],
        filters: { status: 'Active' },
        modifiedAfter: '2025-01-01T00:00:00Z',
        limit: 50,
      };

      const result = await db.backfill<TestDoc>(args);

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/method/custom.backfill_method', {
        doctype: 'TestDocType',
        fields: ['name', 'title'],
        filters: { status: 'Active' },
        limit: 50,
        modified_after: '2025-01-01T00:00:00Z',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle array filters in backfill', async () => {
      const mockResponse: BackfillResponse<TestDoc> = {
        rows: [],
      };

      (mockHttpClient.get as any).mockResolvedValue({
        payload: mockResponse,
        headers: new Headers(),
        status: 200,
      });

      const args: BackfillArgs = {
        doctype: 'TestDocType',
        filters: [
          ['status', '=', 'Active'],
          ['type', '!=', 'Deleted'],
        ],
      };

      await db.backfill<TestDoc>(args);

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/method/live.live.api.backfill', {
        doctype: 'TestDocType',
        fields: undefined,
        filters: [
          ['status', '=', 'Active'],
          ['type', '!=', 'Deleted'],
        ],
        limit: 200,
        modified_after: undefined,
      });
    });

    it('should use custom endpoint from constructor', async () => {
      const customDb = new DbModule(mockHttpClient, {
        customEndpoints: { backfill: 'custom.default_backfill' },
      });

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { rows: [] },
        headers: new Headers(),
        status: 200,
      });

      await customDb.backfill({ doctype: 'TestDocType' });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/method/custom.default_backfill', expect.any(Object));
    });

    it('should override custom endpoint with method arg', async () => {
      const customDb = new DbModule(mockHttpClient, {
        customEndpoints: { backfill: 'custom.default_backfill' },
      });

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { rows: [] },
        headers: new Headers(),
        status: 200,
      });

      await customDb.backfill({
        doctype: 'TestDocType',
        method: 'override.backfill',
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/method/override.backfill', expect.any(Object));
    });
  });

  describe('normalizeFilters', () => {
    it('should return array filters as-is', () => {
      const filters: [string, string, unknown][] = [
        ['status', '=', 'Active'],
        ['type', '!=', 'Deleted'],
      ];
      const db = new DbModule(mockHttpClient);

      // Test through getDocList since normalizeFilters is private
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: [] },
        headers: new Headers(),
        status: 200,
      });

      db.getDocList('TestDocType', { filters });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/resource/TestDocType',
        {
          filters: [
            ['status', '=', 'Active'],
            ['type', '!=', 'Deleted'],
          ],
        },
        undefined,
        undefined,
      );
    });

    it('should convert object filters to array format', () => {
      const filters = {
        status: 'Active',
        type: 'Standard',
        count: 5,
        enabled: true,
      };

      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: [] },
        headers: new Headers(),
        status: 200,
      });

      db.getDocList('TestDocType', { filters });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/resource/TestDocType',
        {
          filters: [
            ['status', '=', 'Active'],
            ['type', '=', 'Standard'],
            ['count', '=', 5],
            ['enabled', '=', true],
          ],
        },
        undefined,
        undefined,
      );
    });

    it('should handle empty object filters', () => {
      (mockHttpClient.get as any).mockResolvedValue({
        payload: { data: [] },
        headers: new Headers(),
        status: 200,
      });

      db.getDocList('TestDocType', { filters: {} });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/resource/TestDocType',
        { filters: [] },
        undefined,
        undefined,
      );
    });
  });
});
