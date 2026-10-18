import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CallModule } from './call';
import type { HttpClient, HttpResponse } from './core/http';

interface TestResponse {
  message: string;
  data?: any;
  success?: boolean;
}

type HttpFn = (...args: unknown[]) => Promise<object>;

const createHttpMock = () => ({
  get: vi.fn<HttpFn>(),
  post: vi.fn<HttpFn>(),
  put: vi.fn<HttpFn>(),
  delete: vi.fn<HttpFn>(),
  head: vi.fn<HttpFn>(),
  request: vi.fn<HttpFn>(),
  setToken: vi.fn<HttpFn>(),
});

describe(CallModule, () => {
  let call: CallModule;
  let http: ReturnType<typeof createHttpMock>;
  let mockHttpClient: HttpClient;

  beforeEach(() => {
    http = createHttpMock();
    mockHttpClient = http as unknown as HttpClient;

    call = new CallModule(mockHttpClient);
  });

  describe('constructor', () => {
    it('should initialize with http client', () => {
      const callInstance = new CallModule(mockHttpClient);
      expect(callInstance).toBeDefined();
    });
  });

  describe('get', () => {
    it('should call GET method without params', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Success',
          data: { result: 'test' },
        },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      const result = await call.get<TestResponse>('frappe.api.test_method');

      expect(http.get).toHaveBeenCalledWith('/api/method/frappe.api.test_method', undefined);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should call GET method with params', async () => {
      const params = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        fields: ['name', 'title'],
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Success',
        },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      const result = await call.get<TestResponse>('frappe.api.get_doc', params);

      expect(http.get).toHaveBeenCalledWith('/api/method/frappe.api.get_doc', params);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle method with dots in name', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'OK' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      await call.get('frappe.core.doctype.user.user.get_list');

      expect(http.get).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.get_list', undefined);
    });

    it('should handle empty params object', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'OK' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      await call.get('test_method', {});

      expect(http.get).toHaveBeenCalledWith('/api/method/test_method', {});
    });

    it('should handle complex params', async () => {
      const params = {
        filters: [['status', '=', 'Active']],
        order_by: 'creation desc',
        limit: 10,
        nested: {
          value: 'test',
          enabled: true,
        },
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'OK' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      await call.get('custom_method', params);

      expect(http.get).toHaveBeenCalledWith('/api/method/custom_method', params);
    });

    it('should handle error response', async () => {
      const mockError = new Error('Method not found');
      http.get.mockRejectedValue(mockError);

      await expect(call.get('invalid_method')).rejects.toThrow('Method not found');
    });
  });

  describe('post', () => {
    it('should call POST method without body', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Created',
        },
        headers: new Headers(),
        status: 201,
        _res: {} as Response,
      };

      http.post.mockResolvedValue(mockResponse);

      const result = await call.post<TestResponse>('frappe.api.create');

      expect(http.post).toHaveBeenCalledWith('/api/method/frappe.api.create', undefined);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should call POST method with body', async () => {
      const body = {
        doctype: 'TestDocType',
        title: 'Test Document',
        description: 'Test description',
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Document created',
          data: { name: 'TEST-001', ...body },
        },
        headers: new Headers(),
        status: 201,
        _res: {} as Response,
      };

      http.post.mockResolvedValue(mockResponse);

      const result = await call.post<TestResponse>('frappe.api.insert', body);

      expect(http.post).toHaveBeenCalledWith('/api/method/frappe.api.insert', body);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle FormData body', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.txt');
      formData.append('doctype', 'File');

      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'File uploaded' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.post.mockResolvedValue(mockResponse);

      await call.post('upload_file', formData);

      expect(http.post).toHaveBeenCalledWith('/api/method/upload_file', formData);
    });

    it('should handle array body', async () => {
      const body = ['item1', 'item2', 'item3'];

      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'Processed' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.post.mockResolvedValue(mockResponse);

      await call.post('process_items', body);

      expect(http.post).toHaveBeenCalledWith('/api/method/process_items', body);
    });

    it('should handle null body', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'OK' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.post.mockResolvedValue(mockResponse);

      await call.post('test_method', null);

      expect(http.post).toHaveBeenCalledWith('/api/method/test_method', null);
    });

    it('should handle error response', async () => {
      const mockError = {
        status: 500,
        message: 'Internal server error',
      };
      http.post.mockRejectedValue(mockError);

      await expect(call.post('failing_method', {})).rejects.toStrictEqual(mockError);
    });
  });

  describe('put', () => {
    it('should call PUT method without body', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Updated',
        },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.put.mockResolvedValue(mockResponse);

      const result = await call.put<TestResponse>('frappe.api.update');

      expect(http.put).toHaveBeenCalledWith('/api/method/frappe.api.update', undefined);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should call PUT method with body', async () => {
      const body = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        updates: {
          title: 'Updated Title',
          status: 'Completed',
        },
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Document updated',
          success: true,
        },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.put.mockResolvedValue(mockResponse);

      const result = await call.put<TestResponse>('frappe.api.update_doc', body);

      expect(http.put).toHaveBeenCalledWith('/api/method/frappe.api.update_doc', body);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle partial updates', async () => {
      const body = {
        field: 'status',
        value: 'Active',
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'Field updated' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.put.mockResolvedValue(mockResponse);

      await call.put('update_field', body);

      expect(http.put).toHaveBeenCalledWith('/api/method/update_field', body);
    });

    it('should handle error response', async () => {
      const mockError = new Error('Update failed');
      http.put.mockRejectedValue(mockError);

      await expect(call.put('update_method', {})).rejects.toThrow('Update failed');
    });
  });

  describe('delete', () => {
    it('should call DELETE method without body', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Deleted',
        },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.delete.mockResolvedValue(mockResponse);

      const result = await call.delete<TestResponse>('frappe.api.delete');

      expect(http.delete).toHaveBeenCalledWith('/api/method/frappe.api.delete', undefined);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should call DELETE method with body', async () => {
      const body = {
        doctype: 'TestDocType',
        name: 'TEST-001',
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: {
          message: 'Document deleted',
          success: true,
        },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.delete.mockResolvedValue(mockResponse);

      const result = await call.delete<TestResponse>('frappe.api.delete_doc', body);

      expect(http.delete).toHaveBeenCalledWith('/api/method/frappe.api.delete_doc', body);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle batch delete', async () => {
      const body = {
        doctype: 'TestDocType',
        names: ['TEST-001', 'TEST-002', 'TEST-003'],
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: '3 documents deleted' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.delete.mockResolvedValue(mockResponse);

      await call.delete('batch_delete', body);

      expect(http.delete).toHaveBeenCalledWith('/api/method/batch_delete', body);
    });

    it('should handle soft delete', async () => {
      const body = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        soft_delete: true,
      };

      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'Document marked as deleted' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.delete.mockResolvedValue(mockResponse);

      await call.delete('soft_delete', body);

      expect(http.delete).toHaveBeenCalledWith('/api/method/soft_delete', body);
    });

    it('should handle error response', async () => {
      const mockError = {
        status: 403,
        message: 'Permission denied',
      };
      http.delete.mockRejectedValue(mockError);

      await expect(call.delete('delete_method', {})).rejects.toStrictEqual(mockError);
    });
  });

  describe('method name handling', () => {
    it('should handle method names with special characters', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'OK' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      await call.get('frappe.utils.get-data');

      expect(http.get).toHaveBeenCalledWith('/api/method/frappe.utils.get-data', undefined);
    });

    it('should handle method names with underscores', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'OK' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.post.mockResolvedValue(mockResponse);

      await call.post('custom_app.api.test_method_name');

      expect(http.post).toHaveBeenCalledWith('/api/method/custom_app.api.test_method_name', undefined);
    });

    it('should handle single word method names', async () => {
      const mockResponse: HttpResponse<TestResponse> = {
        payload: { message: 'OK' },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      await call.get('ping');

      expect(http.get).toHaveBeenCalledWith('/api/method/ping', undefined);
    });
  });

  describe('generic type handling', () => {
    interface CustomResponse {
      id: number;
      name: string;
      items: string[];
    }

    it('should handle custom generic types', async () => {
      const mockResponse: HttpResponse<CustomResponse> = {
        payload: {
          id: 1,
          name: 'Test',
          items: ['item1', 'item2'],
        },
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      const result = await call.get<CustomResponse>('get_custom_data');

      expect(result).toStrictEqual(mockResponse);
      expect(result.payload.id).toBe(1);
      expect(result.payload.name).toBe('Test');
      expect(result.payload.items).toHaveLength(2);
    });

    it('should handle array response types', async () => {
      const mockResponse: HttpResponse<string[]> = {
        payload: ['item1', 'item2', 'item3'],
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      const result = await call.get<string[]>('get_list');

      expect(result.payload).toStrictEqual(['item1', 'item2', 'item3']);
    });

    it('should handle primitive response types', async () => {
      const mockResponse: HttpResponse<number> = {
        payload: 42,
        headers: new Headers(),
        status: 200,
        _res: {} as Response,
      };

      http.get.mockResolvedValue(mockResponse);

      const result = await call.get<number>('get_count');

      expect(result.payload).toBe(42);
    });
  });
});
