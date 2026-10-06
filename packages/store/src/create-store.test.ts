import { describe, expect, it, vi } from 'vitest';

import { createStore } from './create-store';

describe(createStore, () => {
  it('creates a basic store with initial state', () => {
    const store = createStore({ count: 0 });
    expect(store.state).toStrictEqual({ count: 0 });
  });

  it('updates state via setState', () => {
    const store = createStore({ value: 'initial' });
    store.setState(() => ({ value: 'updated' }));
    expect(store.state.value).toBe('updated');
  });

  it('creates a persist store when persist option is true', () => {
    const mockStorage = {
      getItem: vi.fn<(key: string) => string | null>().mockReturnValue(null),
      setItem: vi.fn<(key: string, value: string) => void>(),
      removeItem: vi.fn<(key: string) => void>(),
    };
    const store = createStore({ n: 0 }, { name: 'test-persist', persist: true, storage: mockStorage });
    expect(store.state).toStrictEqual({ n: 0 });
    expect('rehydrate' in store).toBe(true);
    expect('clearPersistedState' in store).toBe(true);
  });

  it('creates a non-persist store when persist is false', () => {
    const store = createStore({ n: 0 }, { name: 'test', persist: false });
    expect(store.state).toStrictEqual({ n: 0 });
    expect('rehydrate' in store).toBe(false);
  });

  it('creates a non-persist store when no options given', () => {
    const store = createStore({ data: [] });
    expect('rehydrate' in store).toBe(false);
  });
});
