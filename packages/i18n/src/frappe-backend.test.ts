/**
 * Frappe i18next backend contracts — the VITE_FRAPPE_ENABLED tree-shaking
 * guard (backend must be null when Frappe is off), and the backend read
 * path: fetches Frappe's get_dict endpoint with credentials, hands the
 * translation dict to i18next, and surfaces fetch failures as errors.
 */

import type { InitOptions, ReadCallback, Services } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrappeBackend } from './frappe-backend';
import type { FrappeBackendOptions } from './frappe-backend';

const savedFlag = process.env.VITE_FRAPPE_ENABLED;

const enabledBackend = () => {
  process.env.VITE_FRAPPE_ENABLED = 'true';
  const backend = createFrappeBackend();
  expect(backend).not.toBeNull();
  return backend!;
};

const initBackend = (backend: ReturnType<typeof createFrappeBackend>, options: FrappeBackendOptions) => {
  backend!.init({} as Services, options, {} as InitOptions);
};

const mockFetch = (response: Response) => vi.fn<typeof fetch>().mockResolvedValue(response);

interface ReadResult {
  error: Parameters<ReadCallback>[0];
  data: Parameters<ReadCallback>[1];
}

const readOnce = async (backend: NonNullable<ReturnType<typeof createFrappeBackend>>, language: string) =>
  // oxlint-disable-next-line promise/avoid-new -- adapts i18next's callback-style backend.read to a promise
  await new Promise<ReadResult>((resolve) => {
    backend.read(language, 'common', (error, data) => {
      resolve({ error, data });
    });
  });

describe('frappe backend', () => {
  afterEach(() => {
    if (savedFlag === undefined) {
      Reflect.deleteProperty(process.env, 'VITE_FRAPPE_ENABLED');
    } else {
      process.env.VITE_FRAPPE_ENABLED = savedFlag;
    }
  });

  describe(createFrappeBackend, () => {
    it("returns null when VITE_FRAPPE_ENABLED is not 'true' (tree-shake guard)", () => {
      process.env.VITE_FRAPPE_ENABLED = 'false';
      expect(createFrappeBackend()).toBeNull();
      Reflect.deleteProperty(process.env, 'VITE_FRAPPE_ENABLED');
      expect(createFrappeBackend()).toBeNull();
    });

    it('returns a backend module when enabled', () => {
      const backend = enabledBackend();
      expect(backend.type).toBe('backend');
      expect(backend).toHaveProperty('read', expect.any(Function));
    });
  });

  describe('backend read', () => {
    it('fetches the Frappe translation dict and passes it to the callback', async () => {
      const fetchMock = mockFetch(Response.json({ message: { Hello: 'నమస్కారం' } }));
      const backend = enabledBackend();
      initBackend(backend, { baseUrl: 'https://erp.example.com', fetch: fetchMock });

      const { error, data } = await readOnce(backend, 'te');

      expect(error).toBeNull();
      expect(data).toStrictEqual({ Hello: 'నమస్కారం' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://erp.example.com/api/method/frappe.translate.get_dict?language=te',
        { credentials: 'include' },
      );
    });

    it('URI-encodes the language in the request', async () => {
      const fetchMock = mockFetch(Response.json({ message: {} }));
      const backend = enabledBackend();
      initBackend(backend, { fetch: fetchMock });

      await readOnce(backend, 'pt BR');

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('language=pt%20BR'), expect.anything());
    });

    it('falls back to an empty dict when the response has no message', async () => {
      const fetchMock = mockFetch(Response.json({}));
      const backend = enabledBackend();
      initBackend(backend, { fetch: fetchMock });

      const { error, data } = await readOnce(backend, 'en');
      expect(error).toBeNull();
      expect(data).toStrictEqual({});
    });

    it('surfaces HTTP failures to the callback as errors', async () => {
      const fetchMock = mockFetch(new Response(null, { status: 503 }));
      const backend = enabledBackend();
      initBackend(backend, { fetch: fetchMock });

      const { error } = await readOnce(backend, 'en');
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty('message', expect.stringContaining('503'));
    });
  });
});
