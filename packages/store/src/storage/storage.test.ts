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

function createLocalStorageStub() {
  const data = new Map<string, string>();
  return {
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => {
      data.set(name, String(value));
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
}

let previousLocalStorage: unknown;

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

describe('default storage adapter (web)', () => {
  it('round-trips a value through localStorage', () => {
    storage.setItem(key, 'hello');
    expect(globalThis.localStorage.getItem(key)).toBe('hello');
    expect(storage.getItem(key)).toBe('hello');
  });

  it('returns null for a missing key (rehydrate no-op contract)', () => {
    expect(storage.getItem('mp-storage-spec-missing')).toBeNull();
  });

  it('removes a value', () => {
    storage.setItem(key, 'to-remove');
    storage.removeItem(key);
    expect(storage.getItem(key)).toBeNull();
    expect(globalThis.localStorage.getItem(key)).toBeNull();
  });

  it('overwrites an existing value on set', () => {
    storage.setItem(key, 'first');
    storage.setItem(key, 'second');
    expect(storage.getItem(key)).toBe('second');
  });
});
