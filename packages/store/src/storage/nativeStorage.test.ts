/**
 * Native storage resolution specs — lock down the backend-priority contract
 * (mmkv → async-storage → memory), the react-native-mmkv v4 API usage
 * (`createMMKV()` factory; `MMKV` is a type-only export in v4, and
 * destructuring it was the silent-in-memory persistence bug on iOS), and
 * the loud dev-mode fallback log.
 */

import { describe, expect, it, vi } from 'vitest';

import type { Storage } from '../persist';

import { logNativeStorageResolution, resolveNativeStorage } from './index.native';

function createMMKVv4Module() {
  const data = new Map<string, string>();
  const instance = {
    getString: (key: string) => data.get(key),
    set: (key: string, value: string) => {
      data.set(key, value);
    },
    remove: (key: string) => data.delete(key),
  };
  const createMMKV = vi.fn(() => instance);
  return { module: { createMMKV }, createMMKV, data };
}

function createAsyncStorageModule() {
  const data = new Map<string, string>();
  return {
    module: {
      default: {
        getItem: async (key: string) => data.get(key) ?? null,
        setItem: async (key: string, value: string) => {
          data.set(key, value);
        },
        removeItem: async (key: string) => {
          data.delete(key);
        },
      },
    },
    data,
  };
}

const throwing = (name: string) => () => {
  throw new Error(`${name} unavailable`);
};

async function roundTrip(storage: Storage): Promise<{
  afterSet: string | null;
  afterRemove: string | null;
  missing: string | null;
}> {
  await storage.setItem('k', 'v');
  const afterSet = await storage.getItem('k');
  await storage.removeItem('k');
  const afterRemove = await storage.getItem('k');
  const missing = await storage.getItem('never-written');
  return { afterSet, afterRemove, missing };
}

describe('resolveNativeStorage', () => {
  it('picks MMKV via the v4 createMMKV() factory and round-trips values', async () => {
    const mmkv = createMMKVv4Module();
    const resolution = resolveNativeStorage({
      loadMMKV: () => mmkv.module,
      loadAsyncStorage: throwing('async-storage'),
    });

    expect(resolution.backend).toBe('mmkv');
    expect(mmkv.createMMKV).toHaveBeenCalledTimes(1);
    expect(resolution.errors.mmkv).toBeUndefined();
    await expect(roundTrip(resolution.storage)).resolves.toEqual({
      afterSet: 'v',
      afterRemove: null,
      missing: null,
    });
    expect(mmkv.data.size).toBe(0);
  });

  it('regression: a v3-shaped module (MMKV class, no createMMKV) is not treated as usable', () => {
    // react-native-mmkv v4 exports `MMKV` as a type only; the old
    // `new MMKV()` code threw at runtime and silently fell to memory.
    class FakeV3MMKV {}
    const asyncStorage = createAsyncStorageModule();
    const resolution = resolveNativeStorage({
      loadMMKV: () => ({ MMKV: FakeV3MMKV }),
      loadAsyncStorage: () => asyncStorage.module,
    });

    expect(resolution.backend).toBe('async-storage');
    expect(String(resolution.errors.mmkv)).toContain('createMMKV');
  });

  it('falls back to AsyncStorage when the MMKV module fails to load', async () => {
    const asyncStorage = createAsyncStorageModule();
    const resolution = resolveNativeStorage({
      loadMMKV: throwing('react-native-mmkv'),
      loadAsyncStorage: () => asyncStorage.module,
    });

    expect(resolution.backend).toBe('async-storage');
    expect(String(resolution.errors.mmkv)).toContain('react-native-mmkv unavailable');
    await expect(roundTrip(resolution.storage)).resolves.toEqual({
      afterSet: 'v',
      afterRemove: null,
      missing: null,
    });
  });

  it('falls back to memory when AsyncStorage has no usable default export', async () => {
    const resolution = resolveNativeStorage({
      loadMMKV: throwing('react-native-mmkv'),
      loadAsyncStorage: () => ({ default: undefined }),
    });

    expect(resolution.backend).toBe('memory');
    expect(resolution.errors.asyncStorage).toBeDefined();
    // Memory storage still honors the Storage contract.
    await expect(roundTrip(resolution.storage)).resolves.toEqual({
      afterSet: 'v',
      afterRemove: null,
      missing: null,
    });
  });

  it('records both loader errors when everything fails', () => {
    const resolution = resolveNativeStorage({
      loadMMKV: throwing('react-native-mmkv'),
      loadAsyncStorage: throwing('async-storage'),
    });

    expect(resolution.backend).toBe('memory');
    expect(String(resolution.errors.mmkv)).toContain('react-native-mmkv unavailable');
    expect(String(resolution.errors.asyncStorage)).toContain('async-storage unavailable');
  });
});

describe('logNativeStorageResolution', () => {
  it('logs a single info line when MMKV won', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const mmkv = createMMKVv4Module();
    const resolution = resolveNativeStorage({
      loadMMKV: () => mmkv.module,
      loadAsyncStorage: throwing('async-storage'),
    });

    logNativeStorageResolution(resolution, { info, warn });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toContain('backend: mmkv');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns loudly (once) when persistence degraded to async-storage', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const asyncStorage = createAsyncStorageModule();
    const resolution = resolveNativeStorage({
      loadMMKV: throwing('react-native-mmkv'),
      loadAsyncStorage: () => asyncStorage.module,
    });

    logNativeStorageResolution(resolution, { info, warn });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('fell back to async-storage');
    expect(message).toContain('react-native-mmkv unavailable');
    expect(info).not.toHaveBeenCalled();
  });

  it('warns that state will not survive restarts when memory won', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const resolution = resolveNativeStorage({
      loadMMKV: throwing('react-native-mmkv'),
      loadAsyncStorage: throwing('async-storage'),
    });

    logNativeStorageResolution(resolution, { info, warn });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('fell back to memory');
    expect(message).toContain('NOT survive app restarts');
    expect(message).toContain('react-native-mmkv unavailable');
    expect(message).toContain('async-storage unavailable');
  });
});

describe('module-level storage export', () => {
  it('resolves without crashing outside React Native', async () => {
    // Outside metro/vxrn the default loader chain must settle on SOME backend
    // instead of throwing at import time (in this vitest environment it lands
    // on AsyncStorage's web build over the test setup's no-op localStorage
    // stub, so a round-trip cannot be asserted here — the injected-loader
    // specs above cover the round-trip contract per backend).
    const { storage } = await import('./index.native');
    expect(typeof storage.getItem).toBe('function');
    expect(typeof storage.setItem).toBe('function');
    expect(typeof storage.removeItem).toBe('function');
    await expect(Promise.resolve(storage.setItem('spec-key', 'spec-value'))).resolves.not.toThrow();
    await expect(Promise.resolve(storage.removeItem('spec-key'))).resolves.not.toThrow();
  });
});
