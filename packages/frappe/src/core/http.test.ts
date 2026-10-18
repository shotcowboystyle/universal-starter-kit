import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { isString } from '../util';

import { HttpClient } from './http';
import { AuthType, FrappeError, HttpMethod } from './types';
import type { RetryConfig } from './types';

/** The fetch stub: tests answer with partial Response objects. */
type FetchStub = (...args: Parameters<typeof fetch>) => Promise<Partial<Response>>;

const getMockFetch = () => vi.mocked(fetch) as unknown as Mock<FetchStub>;

// Frappe with developer_mode on answers a permission failure with BOTH a
// python traceback (`exc`) and the readable sentence (`_server_messages`).
// Reading `exc` first put the traceback in `error.message`, and the live
// surfaces rendered it verbatim — the symptom ordinary users saw where a
// form or report should have been. Administrator rarely gets a 403, so no
// existing test could see it.
const permissionDeniedPayload = (sentence: string) => ({
  exception: 'frappe.exceptions.PermissionError',
  exc_type: 'PermissionError',
  // Both fields built the way frappe builds them, not typed from memory.
  exc: JSON.stringify([
    'Traceback (most recent call last):\n  File "apps/frappe/frappe/app.py", line 120, in application\n    response = frappe.api.handle(request)\n  File "apps/frappe/frappe/api/v1.py", line 80, in read_doc\n    raise frappe.PermissionError\nfrappe.exceptions.PermissionError\n',
  ]),
  _server_messages: JSON.stringify([JSON.stringify({ message: sentence, title: 'Message' })]),
});

const respondWith = (payload: Record<string, string>, status: number, statusText: string) => {
  getMockFetch().mockResolvedValue({
    ok: false,
    status,
    statusText,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => payload,
  });
};

describe(HttpClient, () => {
  let client: HttpClient;
  const baseURL = 'https://api.example.com';
  beforeEach(() => {
    client = new HttpClient(baseURL);
    vi.stubGlobal('fetch', vi.fn<FetchStub>());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should initialize with base URL', () => {
      const httpClient = new HttpClient(baseURL);
      expect(httpClient).toBeDefined();
    });

    it('should accept auth config', () => {
      const httpClient = new HttpClient(baseURL, {
        useToken: true,
        token: 'test-token',
        type: AuthType.Bearer,
      });
      expect(httpClient).toBeDefined();
    });

    it('should accept retry config', () => {
      const httpClient = new HttpClient(baseURL, undefined, {
        maxRetries: 5,
        baseDelayMs: 500,
        exponentialBackoff: false,
      });
      expect(httpClient).toBeDefined();
    });
  });

  describe('request', () => {
    it('should make basic GET request', async () => {
      const mockPayload = { data: 'test' };
      const mockHeaders = new Headers({ 'Content-Type': 'application/json' });
      const mockRes = {
        ok: true,
        headers: mockHeaders,
        status: 200,
        json: async () => mockPayload,
      };
      getMockFetch().mockResolvedValue(mockRes);
      const result = await client.request<typeof mockPayload>(HttpMethod.Get, '/test', {});
      expect(fetch).toHaveBeenCalledWith(
        `${baseURL}/test`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      );
      expect(result.payload).toStrictEqual(mockPayload);
      expect(result.headers).toBe(mockHeaders);
      expect(result.status).toBe(200);
      expect(result._res).toBe(mockRes);
    });

    it('should make POST request with JSON body', async () => {
      const requestBody = { foo: 'bar', nested: { value: 123 } };
      const mockPayload = { success: true };
      const mockHeaders = new Headers({ 'Content-Type': 'application/json' });
      const mockRes = {
        ok: true,
        headers: mockHeaders,
        status: 200,
        json: async () => mockPayload,
      };
      getMockFetch().mockResolvedValue(mockRes);
      const result = await client.request<typeof mockPayload>(HttpMethod.Post, '/test', {
        body: requestBody,
      });
      expect(fetch).toHaveBeenCalledWith(
        `${baseURL}/test`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: expect.any(Headers),
          credentials: 'include',
        }),
      );
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('Content-Type')).toBe('application/json');
      expect(result.payload).toStrictEqual(mockPayload);
      expect(result.status).toBe(200);
    });

    it('should handle FormData body', async () => {
      const formData = new FormData();
      formData.append('field', 'value');
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      const result = await client.request(HttpMethod.Post, '/upload', {
        body: formData,
      });
      expect(fetch).toHaveBeenCalledWith(
        `${baseURL}/upload`,
        expect.objectContaining({
          method: 'POST',
          body: formData,
          headers: expect.any(Headers),
          credentials: 'include',
        }),
      );
      expect(result.payload).toStrictEqual({ success: true });
    });

    it('should handle URLSearchParams body', async () => {
      const params = new URLSearchParams();
      params.append('key', 'value');
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        status: 200,
        text: async () => 'success',
      };
      getMockFetch().mockResolvedValue(mockRes);
      const result = await client.request(HttpMethod.Post, '/form', {
        body: params,
      });
      expect(fetch).toHaveBeenCalledWith(
        `${baseURL}/form`,
        expect.objectContaining({
          method: 'POST',
          body: params,
          credentials: 'include',
        }),
      );
      expect(result.payload).toBe('success');
    });

    it('should convert object to FormData when Content-Type is multipart/form-data', async () => {
      const requestBody = { field1: 'value1', field2: 'value2' };
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/test', {
        body: requestBody,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const calledBody = getMockFetch().mock.calls[0]?.[1]?.body;
      expect(calledBody).toBeInstanceOf(FormData);
    });

    it('should convert object to URLSearchParams when Content-Type is application/x-www-form-urlencoded', async () => {
      const requestBody = { field1: 'value1', field2: 'value2' };
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        status: 200,
        text: async () => 'success',
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/test', {
        body: requestBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const calledBody = getMockFetch().mock.calls[0]?.[1]?.body;
      expect(calledBody).toBe('field1=value1&field2=value2');
    });

    it('should handle text response', async () => {
      const textResponse = 'Plain text response';
      const mockHeaders = new Headers({ 'Content-Type': 'text/plain' });
      const mockRes = {
        ok: true,
        headers: mockHeaders,
        status: 200,
        text: async () => textResponse,
      };
      getMockFetch().mockResolvedValue(mockRes);
      const result = await client.request(HttpMethod.Get, '/text', {});
      expect(result.payload).toBe(textResponse);
      expect(result.headers).toBe(mockHeaders);
      expect(result.status).toBe(200);
    });

    it('should throw FrappeError on non-ok response', async () => {
      const errorPayload = { message: 'Bad Request', details: 'Invalid input' };
      getMockFetch().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => errorPayload,
      });
      await expect(client.request(HttpMethod.Post, '/test', {})).rejects.toThrow(FrappeError);
      await expect(client.request(HttpMethod.Post, '/test', {})).rejects.toMatchObject({
        status: 400,
        message: 'Bad Request',
        data: errorPayload,
      });
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      getMockFetch().mockRejectedValue(networkError);
      await expect(client.request(HttpMethod.Get, '/test', {})).rejects.toThrow('Network error');
    });
  });

  describe('authentication', () => {
    it('should add Bearer token to headers', async () => {
      const token = 'test-bearer-token';
      const authClient = new HttpClient(baseURL, {
        useToken: true,
        token,
        type: AuthType.Bearer,
      });
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await authClient.request(HttpMethod.Get, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('Authorization')).toBe(`Bearer ${token}`);
      expect(getMockFetch().mock.calls[0]?.[1]?.credentials).toBe('omit');
    });

    it('should add token auth to headers', async () => {
      const token = 'test-token';
      const authClient = new HttpClient(baseURL, {
        useToken: true,
        token,
        type: AuthType.Token,
      });
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await authClient.request(HttpMethod.Get, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('Authorization')).toBe(`token ${token}`);
    });

    it('should support token as function', async () => {
      const token = 'dynamic-token';
      const authClient = new HttpClient(baseURL, {
        useToken: true,
        token: async () => token,
        type: AuthType.Bearer,
      });
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await authClient.request(HttpMethod.Get, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('Authorization')).toBe(`Bearer ${token}`);
    });

    it('should add CSRF token for non-GET requests without token auth', async () => {
      const csrfToken = 'csrf-test-token';
      vi.stubGlobal('document', { cookie: `frappe-csrf-token=${csrfToken}; path=/` });
      vi.stubGlobal('window', {});
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('X-Frappe-CSRF-Token')).toBe(csrfToken);
    });

    it('should use credentials include when not using token auth', async () => {
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Get, '/test', {});
      expect(getMockFetch().mock.calls[0]?.[1]?.credentials).toBe('include');
    });

    it('should set token dynamically via function', async () => {
      const tokenFn = vi.fn<() => Promise<string>>().mockResolvedValue('new-token');
      const authClient = new HttpClient(baseURL, { useToken: true, token: tokenFn });
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await authClient.request(HttpMethod.Get, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('Authorization')).toBe('Bearer new-token');
      expect(tokenFn).toHaveBeenCalledOnce();
    });
  });

  describe('retry logic', () => {
    it('should retry on retry-able status codes', async () => {
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 2,
        baseDelayMs: 10,
        retryStatusCodes: [503],
      });
      let attempt = 0;
      getMockFetch().mockImplementation(async () => {
        attempt += 1;
        if (attempt < 3) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
            text: async () => 'Service temporarily unavailable',
          };
        }
        return {
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      const result = await retryClient.request(HttpMethod.Get, '/test', {});
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.payload).toStrictEqual({ success: true });
    });

    it('should retry on network errors when configured', async () => {
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 1,
        baseDelayMs: 10,
        retryOnNetworkError: true,
      });
      let attempt = 0;
      getMockFetch().mockImplementation(async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error('Network error');
        }
        return {
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      const result = await retryClient.request(HttpMethod.Get, '/test', {});
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.payload).toStrictEqual({ success: true });
    });

    it('should not retry on non-retry-able status codes', async () => {
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 2,
        baseDelayMs: 10,
        retryStatusCodes: [503],
      });
      getMockFetch().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        text: async () => 'Bad request',
      });
      await expect(retryClient.request(HttpMethod.Get, '/test', {})).rejects.toThrow(FrappeError);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('should use exponential backoff when configured', async () => {
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 3,
        baseDelayMs: 100,
        exponentialBackoff: true,
        maxDelayMs: 500,
        retryStatusCodes: [503],
      });
      const delays: number[] = [];
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: Parameters<typeof setTimeout>[0], delay?: number) => {
        delays.push(delay ?? 0);
        if (!isString(fn)) {
          fn();
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
      let attempt = 0;
      getMockFetch().mockImplementation(async () => {
        attempt += 1;
        if (attempt <= 3) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
            text: async () => 'Service unavailable',
          };
        }
        return {
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      const result = await retryClient.request(HttpMethod.Get, '/test', {});
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);
      expect(result.payload).toStrictEqual({ success: true });
    });

    it('should respect maxDelayMs', async () => {
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 3,
        baseDelayMs: 100,
        exponentialBackoff: true,
        maxDelayMs: 150,
        retryStatusCodes: [503],
      });
      const delays: number[] = [];
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: Parameters<typeof setTimeout>[0], delay?: number) => {
        delays.push(delay ?? 0);
        if (!isString(fn)) {
          fn();
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });
      let attempt = 0;
      getMockFetch().mockImplementation(async () => {
        attempt += 1;
        if (attempt <= 3) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
            text: async () => 'Service unavailable',
          };
        }
        return {
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      const result = await retryClient.request(HttpMethod.Get, '/test', {});
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(150);
      expect(delays[2]).toBe(150);
      expect(result.payload).toStrictEqual({ success: true });
    });

    it('should use custom shouldRetry function', async () => {
      const shouldRetry = vi.fn<NonNullable<RetryConfig['shouldRetry']>>((_err, attempt) => attempt < 2);
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 3,
        baseDelayMs: 10,
        shouldRetry,
      });
      let attempt = 0;
      getMockFetch().mockImplementation(async () => {
        attempt += 1;
        if (attempt < 3) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
            text: async () => 'Server error',
          };
        }
        return {
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      const result = await retryClient.request(HttpMethod.Get, '/test', {});
      expect(shouldRetry).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.payload).toStrictEqual({ success: true });
    });

    it('should throw last error after max retries', async () => {
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 2,
        baseDelayMs: 10,
        retryStatusCodes: [503],
      });
      getMockFetch().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        text: async () => 'Service unavailable',
      });
      await expect(retryClient.request(HttpMethod.Get, '/test', {})).rejects.toThrow(FrappeError);
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('abort', () => {
    it('passes the AbortSignal through to fetch', async () => {
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      const controller = new AbortController();
      await client.request(HttpMethod.Get, '/test', { signal: controller.signal });
      expect(fetch).toHaveBeenCalledWith(`${baseURL}/test`, expect.objectContaining({ signal: controller.signal }));
    });

    it('get() forwards the signal', async () => {
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      const controller = new AbortController();
      await client.get('/test', { a: 1 }, undefined, controller.signal);
      expect(fetch).toHaveBeenCalledWith(`${baseURL}/test?a=1`, expect.objectContaining({ signal: controller.signal }));
    });

    it('rejects without retrying when the request is aborted', async () => {
      // retryOnNetworkError would normally re-issue a rejected fetch — an
      // abort is a deliberate cancellation and must bypass the retry loop.
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 3,
        baseDelayMs: 1,
        retryOnNetworkError: true,
      });
      const controller = new AbortController();
      getMockFetch().mockImplementation(async () => {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      });
      await expect(retryClient.request(HttpMethod.Get, '/test', { signal: controller.signal })).rejects.toThrow(
        /aborted/iu,
      );
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('does not retry an AbortError even without a signal reference', async () => {
      const retryClient = new HttpClient(baseURL, undefined, {
        maxRetries: 3,
        baseDelayMs: 1,
        retryOnNetworkError: true,
      });
      getMockFetch().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));
      await expect(retryClient.request(HttpMethod.Get, '/test', {})).rejects.toThrow(/aborted/iu);
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
    });

    describe('get', () => {
      it('should make GET request without params', async () => {
        const result = await client.get('/test');
        expect(fetch).toHaveBeenCalledWith(`${baseURL}/test`, expect.objectContaining({ method: 'GET' }));
        expect(result.payload).toStrictEqual({ success: true });
      });

      it('should make GET request with params', async () => {
        await client.get('/test', {
          foo: 'bar',
          num: 123,
          bool: true,
          nullValue: null,
          // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an undefined param is the case under test
          undefinedValue: undefined,
        });
        expect(fetch).toHaveBeenCalledWith(
          `${baseURL}/test?foo=bar&num=123&bool=true`,
          expect.objectContaining({ method: 'GET' }),
        );
      });

      it('should handle complex params', async () => {
        await client.get('/test', {
          array: [1, 2, 3],
          object: { nested: 'value' },
        });
        expect(fetch).toHaveBeenCalledWith(
          `${baseURL}/test?array=%5B1%2C2%2C3%5D&object=%7B%22nested%22%3A%22value%22%7D`,
          expect.objectContaining({ method: 'GET' }),
        );
      });

      it('should pass custom headers', async () => {
        await client.get('/test', {}, { 'X-Custom': 'header' });
        const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
        expect(calledHeaders?.get('X-Custom')).toBe('header');
      });
    });

    describe('post', () => {
      it('should make POST request without body', async () => {
        const result = await client.post('/test');
        expect(fetch).toHaveBeenCalledWith(`${baseURL}/test`, expect.objectContaining({ method: 'POST' }));
        expect(result.payload).toStrictEqual({ success: true });
      });

      it('should make POST request with body', async () => {
        const body = { data: 'test' };
        const result = await client.post('/test', body);
        expect(fetch).toHaveBeenCalledWith(
          `${baseURL}/test`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(body),
          }),
        );
        expect(result.payload).toStrictEqual({ success: true });
      });

      it('should pass custom headers', async () => {
        await client.post('/test', {}, { 'X-Custom': 'header' });
        const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
        expect(calledHeaders?.get('X-Custom')).toBe('header');
      });
    });

    describe('put', () => {
      it('should make PUT request', async () => {
        const body = { data: 'test' };
        const result = await client.put('/test', body);
        expect(fetch).toHaveBeenCalledWith(
          `${baseURL}/test`,
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify(body),
          }),
        );
        expect(result.payload).toStrictEqual({ success: true });
      });

      it('should pass custom headers', async () => {
        await client.put('/test', {}, { 'X-Custom': 'header' });
        const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
        expect(calledHeaders?.get('X-Custom')).toBe('header');
      });
    });

    describe('delete', () => {
      it('should make DELETE request', async () => {
        const result = await client.delete('/test');
        expect(fetch).toHaveBeenCalledWith(`${baseURL}/test`, expect.objectContaining({ method: 'DELETE' }));
        expect(result.payload).toStrictEqual({ success: true });
      });

      it('should make DELETE request with body', async () => {
        const body = { id: '123' };
        const result = await client.delete('/test', body);
        expect(fetch).toHaveBeenCalledWith(
          `${baseURL}/test`,
          expect.objectContaining({
            method: 'DELETE',
            body: JSON.stringify(body),
          }),
        );
        expect(result.payload).toStrictEqual({ success: true });
      });

      it('should pass custom headers', async () => {
        await client.delete('/test', undefined, { 'X-Custom': 'header' });
        const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
        expect(calledHeaders?.get('X-Custom')).toBe('header');
      });
    });

    describe('head', () => {
      it('should make HEAD request and return response', async () => {
        const mockRes = {
          ok: true,
          headers: new Headers({
            'Content-Type': 'application/json',
            'Content-Length': '1234',
          }),
          status: 200,
          text: async () => '',
          json: async () => ({}),
        };
        getMockFetch().mockResolvedValue(mockRes);
        const response = await client.head('/test');
        expect(fetch).toHaveBeenCalledWith(`${baseURL}/test`, expect.objectContaining({ method: 'HEAD' }));
        expect(response.headers.get('Content-Type')).toBe('application/json');
        expect(response.headers.get('Content-Length')).toBe('1234');
        expect(response.status).toBe(200);
      });

      it('should make HEAD request with params', async () => {
        const mockRes = {
          ok: true,
          headers: new Headers(),
          status: 200,
          text: async () => '',
          json: async () => ({}),
        };
        getMockFetch().mockResolvedValue(mockRes);
        const response = await client.head('/test', { check: 'true' });
        expect(fetch).toHaveBeenCalledWith(`${baseURL}/test?check=true`, expect.objectContaining({ method: 'HEAD' }));
        expect(response.status).toBe(200);
      });

      it('should pass custom headers', async () => {
        const mockRes = {
          ok: true,
          headers: new Headers(),
          status: 200,
          text: async () => '',
          json: async () => ({}),
        };
        getMockFetch().mockResolvedValue(mockRes);
        await client.head('/test', {}, { 'X-Custom': 'header' });
        const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
        expect(calledHeaders?.get('X-Custom')).toBe('header');
      });

      it('should throw FrappeError on non-ok response', async () => {
        getMockFetch().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers(),
          text: async () => 'Not found',
        });
        await expect(client.head('/test')).rejects.toThrow(FrappeError);
        await expect(client.head('/test')).rejects.toMatchObject({ status: 404, message: 'Not Found' });
      });

      it('should use credentials include when not using token auth', async () => {
        const mockRes = {
          ok: true,
          headers: new Headers(),
          status: 200,
          text: async () => '',
          json: async () => ({}),
        };
        getMockFetch().mockResolvedValue(mockRes);
        await client.head('/test');
        expect(getMockFetch().mock.calls[0]?.[1]?.credentials).toBe('include');
      });

      it('should use credentials omit and add auth header when using token auth', async () => {
        const authClient = new HttpClient(baseURL, {
          useToken: true,
          token: 'test-token',
          type: AuthType.Bearer,
        });
        const mockRes = {
          ok: true,
          headers: new Headers(),
          status: 200,
          text: async () => '',
          json: async () => ({}),
        };
        getMockFetch().mockResolvedValue(mockRes);
        await authClient.head('/test');
        expect(getMockFetch().mock.calls[0]?.[1]?.credentials).toBe('omit');
        const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
        expect(calledHeaders?.get('Authorization')).toBe('Bearer test-token');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty response', async () => {
      const mockRes = {
        ok: true,
        headers: new Headers(),
        status: 200,
        text: async () => '',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      };
      getMockFetch().mockResolvedValue(mockRes);
      const result = await client.request(HttpMethod.Get, '/empty', {});
      expect(result.payload).toBe('');
      expect(result.status).toBe(200);
    });

    it('should handle ArrayBuffer body', async () => {
      const buffer = new ArrayBuffer(8);
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/binary', {
        body: buffer,
      });
      expect(getMockFetch().mock.calls[0]?.[1]?.body).toBe(buffer);
    });

    it('should handle Blob body', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/blob', {
        body: blob,
      });
      expect(getMockFetch().mock.calls[0]?.[1]?.body).toBe(blob);
    });

    it('should handle ArrayBufferView body', async () => {
      const uint8Array = new Uint8Array([1, 2, 3, 4]);
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/typed-array', {
        body: uint8Array,
      });
      expect(getMockFetch().mock.calls[0]?.[1]?.body).toBe(uint8Array);
    });

    it('should handle relative paths', async () => {
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Get, 'relative/path', {});
      expect(fetch).toHaveBeenCalledWith(`${baseURL}/relative/path`, expect.any(Object));
    });

    it('should handle absolute paths', async () => {
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Get, '/absolute/path', {});
      expect(fetch).toHaveBeenCalledWith(`${baseURL}/absolute/path`, expect.any(Object));
    });

    it('should handle error response with _server_messages', async () => {
      const errorPayload = {
        _server_messages: 'Server error messages',
        exc: 'Exception details',
        message: 'Error message',
      };
      getMockFetch().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => errorPayload,
      });
      const request = client.request(HttpMethod.Post, '/test', {});
      await expect(request).rejects.toThrow(FrappeError);
      await expect(request).rejects.toMatchObject({ message: 'Error message' });
    });

    it('should handle error response with exc', async () => {
      const errorPayload = {
        exc: 'Exception details',
      };
      getMockFetch().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => errorPayload,
      });
      const request = client.request(HttpMethod.Post, '/test', {});
      await expect(request).rejects.toThrow(FrappeError);
      await expect(request).rejects.toMatchObject({ message: 'Exception details' });
    });

    it('surfaces the readable server message, not the developer-mode traceback', async () => {
      // oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
      // Verbatim shape of what the bench returns for GET /api/resource/DocType/ToDo
      // as a plain Desk User: one entry, two sentences joined by <br>.
      respondWith(
        permissionDeniedPayload(
          'User <strong>desk@example.com</strong> does not have doctype access via role permission for document <strong>DocType</strong><br>User <strong>desk@example.com</strong> does not have access to this document',
        ),
        403,
        'FORBIDDEN',
      );

      await expect(client.request(HttpMethod.Get, '/api/resource/DocType/ToDo', {})).rejects.toThrow(
        // Inline markup stripped, <br> kept as a line break so the two sentences
        // do not run together into "…document DocTypeUser desk@example.com…".
        'User desk@example.com does not have doctype access via role permission for document DocType\nUser desk@example.com does not have access to this document',
      );
    });

    // Verbatim from pokemon's bench (MPO-473): is_whitelisted refuses Guest with
    // ONE message whose summary and body sit in a <details>. Dropping the tags
    // without a boundary read "Login to accessFunction …".
    it('keeps a <details> summary and its body on separate lines', async () => {
      respondWith(
        permissionDeniedPayload(
          '<details><summary>You are not permitted to access this resource. Login to access</summary>Function <strong>frappe.desk.form.load.getdoctype</strong> is not whitelisted.</details>',
        ),
        403,
        'FORBIDDEN',
      );

      await expect(
        client.request(HttpMethod.Get, '/api/method/frappe.desk.form.load.getdoctype', {}),
      ).rejects.toSatisfy(
        (err: FrappeError) =>
          err.message ===
          'You are not permitted to access this resource. Login to access\nFunction frappe.desk.form.load.getdoctype is not whitelisted.',
      );
    });

    it('keeps every server message, one per line, in the order the server sent them', async () => {
      respondWith(
        {
          exc_type: 'PermissionError',
          _server_messages: JSON.stringify([
            JSON.stringify({ message: 'Insufficient Permission for <strong>Report</strong>' }),
            JSON.stringify({ message: "You don't have access to Report: ToDo &amp; Notes" }),
          ]),
        },
        403,
        'FORBIDDEN',
      );

      await expect(client.request(HttpMethod.Get, '/test', {})).rejects.toSatisfy(
        (err: FrappeError) =>
          err.message === "Insufficient Permission for Report\nYou don't have access to Report: ToDo & Notes",
      );
    });

    it('never puts a python traceback in the error message', async () => {
      respondWith(permissionDeniedPayload("You don't have access to Report: ToDo"), 403, 'FORBIDDEN');

      await expect(client.request(HttpMethod.Get, '/api/method/frappe.desk.query_report.run', {})).rejects.toSatisfy(
        (err: FrappeError) =>
          err.message === "You don't have access to Report: ToDo" &&
          !err.message.includes('Traceback') &&
          !err.message.includes('frappe/app.py'),
      );
    });

    it('falls back to the raising line when only a traceback is available', async () => {
      respondWith(
        {
          exc: JSON.stringify([
            'Traceback (most recent call last):\n  File "apps/frappe/frappe/app.py", line 120, in application\n    raise frappe.ValidationError\nfrappe.exceptions.ValidationError: Title is required\n',
          ]),
        },
        417,
        'EXPECTATION FAILED',
      );

      await expect(client.request(HttpMethod.Post, '/test', {})).rejects.toThrow(
        'frappe.exceptions.ValidationError: Title is required',
      );
    });

    it('should handle FormData with Blob values', async () => {
      const blob = new Blob(['file content'], { type: 'text/plain' });
      const requestBody = {
        field: 'value',
        file: blob,
      };
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/upload', {
        body: requestBody,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const calledBody = getMockFetch().mock.calls[0]?.[1]?.body;
      expect(calledBody).toBeInstanceOf(FormData);
    });

    it('should skip non-string values in URLSearchParams conversion', async () => {
      const requestBody = {
        field1: 'value1',
        field2: 123,
        field3: null,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an undefined field is the case under test
        field4: undefined,
      };
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        status: 200,
        text: async () => 'success',
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/test', {
        body: requestBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const calledBody = getMockFetch().mock.calls[0]?.[1]?.body;
      expect(calledBody).toBe('field1=value1');
    });

    it('should handle ReadableStream body', async () => {
      const stream = new ReadableStream();
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/stream', {
        body: stream,
      });
      expect(getMockFetch().mock.calls[0]?.[1]?.body).toBe(stream);
    });

    it('should handle global frappe csrf token', async () => {
      vi.stubGlobal('document', { cookie: '' });
      vi.stubGlobal('window', {});
      vi.stubGlobal('frappe', { csrf_token: 'global-csrf-token' });
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('X-Frappe-CSRF-Token')).toBe('global-csrf-token');
    });

    it.each([
      {
        name: 'should prefer frappe-csrf-token cookie over csrf_token',
        cookie: 'frappe-csrf-token=preferred; csrf_token=fallback',
        expected: 'preferred',
      },
      { name: 'should use csrf_token cookie as fallback', cookie: 'csrf_token=fallback', expected: 'fallback' },
      {
        name: 'should handle cookie with special characters',
        cookie: 'frappe-csrf-token=%2Ftest%2Ftoken%3D',
        expected: '/test/token=',
      },
    ])('$name', async ({ cookie, expected }) => {
      vi.stubGlobal('document', { cookie });
      vi.stubGlobal('window', {});
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Post, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('X-Frappe-CSRF-Token')).toBe(expected);
    });

    it('should not add CSRF token for GET requests', async () => {
      vi.stubGlobal('document', { cookie: 'frappe-csrf-token=test-token' });
      vi.stubGlobal('window', {});
      const mockRes = {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        status: 200,
        json: async () => ({ success: true }),
      };
      getMockFetch().mockResolvedValue(mockRes);
      await client.request(HttpMethod.Get, '/test', {});
      const calledHeaders = getMockFetch().mock.calls[0]?.[1]?.headers as Headers | undefined;
      expect(calledHeaders?.get('X-Frappe-CSRF-Token')).toBeNull();
    });
  });
});
