/**
 * Default storage adapter specs — the persistence backend `createStore`
 * silently wires in when `persist: true`. Locks down: the web adapter
 * delegates to globalThis.localStorage (get/set/remove round-trip) and
 * misses read as null, matching the `Storage` contract `createPersistStore`
 * depends on for rehydration.
 *
 * The shared test setup replaces localStorage with a no-op stub, so these
 * specs install a real in-memory localStorage first: the adapter reads
 * `globalThis.localStorage` lazily on every call, which is exactly the
 * delegation contract under test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { storage } from './index';

const key = 'mp-storage-spec-key';

const createLocalStorageStub = () => {
  const data = new Map<string, string>();
  return {
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => {
      data.set(name, value);
    },
    removeItem: (name: string) => {
      data.delete(name);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
};

let previousLocalStorage: unknown;

describe('default storage adapter (web)', () => {
  beforeEach(() => {
    previousLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageStub(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: previousLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('round-trips a value through localStorage', async () => {
    await storage.setItem(key, 'hello');
    expect(globalThis.localStorage.getItem(key)).toBe('hello');
    await expect(Promise.resolve(storage.getItem(key))).resolves.toBe('hello');
  });

  it('returns null for a missing key (rehydrate no-op contract)', async () => {
    await expect(Promise.resolve(storage.getItem('mp-storage-spec-missing'))).resolves.toBeNull();
  });

  it('removes a value', async () => {
    await storage.setItem(key, 'to-remove');
    await storage.removeItem(key);
    await expect(Promise.resolve(storage.getItem(key))).resolves.toBeNull();
    expect(globalThis.localStorage.getItem(key)).toBeNull();
  });

  it('overwrites an existing value on set', async () => {
    await storage.setItem(key, 'first');
    await storage.setItem(key, 'second');
    await expect(Promise.resolve(storage.getItem(key))).resolves.toBe('second');
  });
});
