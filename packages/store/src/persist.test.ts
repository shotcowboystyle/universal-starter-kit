import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createPersistStore, type Storage } from './persist';

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

describe('createPersistStore', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('creates a store with the initial state', () => {
    const store = createPersistStore({ count: 0 }, { key: 'test', storage });
    expect(store.state).toEqual({ count: 0 });
  });

  it('attempts to rehydrate on creation', async () => {
    storage.data.set('test', JSON.stringify({ count: 42 }));
    const store = createPersistStore({ count: 0 }, { key: 'test', storage });
    await store.rehydrate();
    expect(store.state).toEqual({ count: 42 });
  });

  it('persists state changes after hydration', async () => {
    const store = createPersistStore({ count: 0 }, { key: 'test', storage });
    await store.rehydrate();

    store.setState(() => ({ count: 5 }));
    await vi.waitFor(() => {
      expect(storage.setItem).toHaveBeenCalledWith('test', JSON.stringify({ count: 5 }));
    });
  });

  it('does not persist before hydration completes', () => {
    storage.getItem = vi.fn(() => new Promise<string | null>(() => {}));
    const store = createPersistStore({ count: 0 }, { key: 'test', storage });
    store.setState(() => ({ count: 99 }));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('clearPersistedState removes the key from storage', async () => {
    const store = createPersistStore({ count: 0 }, { key: 'test', storage });
    await store.rehydrate();
    store.setState(() => ({ count: 10 }));
    await store.clearPersistedState();
    expect(storage.removeItem).toHaveBeenCalledWith('test');
  });

  it('rehydrate sets state from persisted data', async () => {
    storage.data.set('mykey', JSON.stringify({ name: 'Alice' }));
    const store = createPersistStore({ name: '' }, { key: 'mykey', storage });
    await store.rehydrate();
    expect(store.state).toEqual({ name: 'Alice' });
  });

  it('uses initial state when nothing is persisted', async () => {
    const store = createPersistStore({ value: 'default' }, { key: 'empty', storage });
    await store.rehydrate();
    expect(store.state).toEqual({ value: 'default' });
  });

  it('supports custom serialize/deserialize', async () => {
    const store = createPersistStore(
      { n: 0 },
      {
        key: 'custom',
        storage,
        serialize: (state) => `n=${state.n}`,
        deserialize: (raw) => ({ n: Number.parseInt(raw.split('=')[1]) }),
      },
    );
    await store.rehydrate();
    store.setState(() => ({ n: 7 }));
    await vi.waitFor(() => {
      expect(storage.setItem).toHaveBeenCalledWith('custom', 'n=7');
    });
  });

  it('rehydrates with custom deserialize', async () => {
    storage.data.set('custom', 'n=42');
    const store = createPersistStore(
      { n: 0 },
      {
        key: 'custom',
        storage,
        serialize: (state) => `n=${state.n}`,
        deserialize: (raw) => ({ n: Number.parseInt(raw.split('=')[1]) }),
      },
    );
    await store.rehydrate();
    expect(store.state).toEqual({ n: 42 });
  });
});
