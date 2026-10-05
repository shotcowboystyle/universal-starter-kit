/**
 * Frappe i18next backend contracts — the VITE_FRAPPE_ENABLED tree-shaking
 * guard (backend must be null when Frappe is off), and the backend read
 * path: fetches Frappe's get_dict endpoint with credentials, hands the
 * translation dict to i18next, and surfaces fetch failures as errors.
 */

import type { Services, InitOptions } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrappeBackend, type FrappeBackendOptions } from './frappeBackend';

const savedFlag = process.env.VITE_FRAPPE_ENABLED;

afterEach(() => {
  if (savedFlag === undefined) {
    delete process.env.VITE_FRAPPE_ENABLED;
  } else {
    process.env.VITE_FRAPPE_ENABLED = savedFlag;
  }
});

function enabledBackend() {
  process.env.VITE_FRAPPE_ENABLED = 'true';
  const backend = createFrappeBackend();
  expect(backend).not.toBeNull();
  return backend!;
}

function initBackend(backend: ReturnType<typeof createFrappeBackend>, options: FrappeBackendOptions) {
  backend!.init({} as Services, options, {} as InitOptions);
}

describe('createFrappeBackend gating', () => {
  it("returns null when VITE_FRAPPE_ENABLED is not 'true' (tree-shake guard)", () => {
    process.env.VITE_FRAPPE_ENABLED = 'false';
    expect(createFrappeBackend()).toBeNull();
    delete process.env.VITE_FRAPPE_ENABLED;
    expect(createFrappeBackend()).toBeNull();
  });

  it('returns a backend module when enabled', () => {
    const backend = enabledBackend();
    expect(backend.type).toBe('backend');
    expect(typeof backend.read).toBe('function');
  });
});

describe('backend read', () => {
  it('fetches the Frappe translation dict and passes it to the callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { Hello: 'నమస్కారం' } }),
    });
    const backend = enabledBackend();
    initBackend(backend, { baseUrl: 'https://erp.example.com', fetch: fetchMock as never });

    const result = await new Promise((resolve, reject) => {
      backend.read('te', 'common', (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });

    expect(result).toEqual({ Hello: 'నమస్కారం' });
    expect(fetchMock).toHaveBeenCalledWith('https://erp.example.com/api/method/frappe.translate.get_dict?language=te', {
      credentials: 'include',
    });
  });

  it('URI-encodes the language in the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: {} }),
    });
    const backend = enabledBackend();
    initBackend(backend, { fetch: fetchMock as never });

    await new Promise((resolve) => {
      backend.read('pt BR', 'common', () => {
        resolve(null);
      });
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain('language=pt%20BR');
  });

  it('falls back to an empty dict when the response has no message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const backend = enabledBackend();
    initBackend(backend, { fetch: fetchMock as never });

    const result = await new Promise((resolve, reject) => {
      backend.read('en', 'common', (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });
    expect(result).toEqual({});
  });

  it('surfaces HTTP failures to the callback as errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const backend = enabledBackend();
    initBackend(backend, { fetch: fetchMock as never });

    const error = await new Promise<Error>((resolve) => {
      backend.read('en', 'common', (err) => {
        resolve(err as Error);
      });
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('503');
  });
});
