/**
 * createStore persistence-gating specs — the factory decision consumers rely
 * on: `persist: true` returns a PersistStore wired to storage (rehydrate /
 * clearPersistedState / write-through), anything else returns a plain
 * in-memory TanStack Store that never touches storage.
 */

import { describe, expect, it, vi } from 'vitest';

import { createStore } from './createStore';
import type { PersistStore, Storage } from './persist';

function createMockStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
}

describe('createStore persistence gating', () => {
  it('returns a plain store without persist methods by default', () => {
    const store = createStore({ n: 1 });
    expect(store.state).toEqual({ n: 1 });
    expect((store as Partial<PersistStore<{ n: number }>>).rehydrate).toBeUndefined();
    expect((store as Partial<PersistStore<{ n: number }>>).clearPersistedState).toBeUndefined();
  });

  it('never writes to storage when persist is off', () => {
    const storage = createMockStorage();
    const store = createStore({ n: 1 }, { name: 'unpersisted', storage });
    store.setState(() => ({ n: 2 }));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('returns a persist store keyed by options.name when persist is on', async () => {
    const storage = createMockStorage();
    storage.data.set('settings', JSON.stringify({ n: 42 }));
    const store = createStore({ n: 0 }, { name: 'settings', persist: true, storage }) as PersistStore<{ n: number }>;
    expect(typeof store.rehydrate).toBe('function');
    expect(typeof store.clearPersistedState).toBe('function');
    await store.rehydrate();
    expect(store.state).toEqual({ n: 42 });
    expect(storage.getItem).toHaveBeenCalledWith('settings');
  });

  it('writes state changes through to the provided storage after hydration', async () => {
    const storage = createMockStorage();
    const store = createStore({ n: 0 }, { name: 'counter', persist: true, storage }) as PersistStore<{ n: number }>;
    await store.rehydrate();
    store.setState(() => ({ n: 7 }));
    await vi.waitFor(() => {
      expect(storage.setItem).toHaveBeenCalledWith('counter', JSON.stringify({ n: 7 }));
    });
  });

  it("clearPersistedState removes exactly the store's key", async () => {
    const storage = createMockStorage();
    const store = createStore({ n: 0 }, { name: 'wipe-me', persist: true, storage }) as PersistStore<{ n: number }>;
    await store.rehydrate();
    await store.clearPersistedState();
    expect(storage.removeItem).toHaveBeenCalledWith('wipe-me');
  });

  it('falls back to the default (localStorage-backed) storage when none is given', async () => {
    // The shared setup replaces localStorage with a no-op stub; install a real
    // in-memory one so the default adapter's lazy delegation is observable.
    const data = new Map<string, string>([['default-backed', JSON.stringify({ n: 9 })]]);
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (name: string) => data.get(name) ?? null,
        setItem: (name: string, value: string) => {
          data.set(name, String(value));
        },
        removeItem: (name: string) => {
          data.delete(name);
        },
      },
      writable: true,
      configurable: true,
    });
    try {
      const store = createStore({ n: 0 }, { name: 'default-backed', persist: true }) as PersistStore<{ n: number }>;
      await store.rehydrate();
      expect(store.state).toEqual({ n: 9 });
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: previous,
        writable: true,
        configurable: true,
      });
    }
  });
});
