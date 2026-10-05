import { Store } from '@tanstack/store';

export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface PersistOptions<TState> {
  key: string;
  storage: Storage;
  serialize?: (state: TState) => string;
  deserialize?: (raw: string) => TState;
}

export interface PersistStore<TState> extends Store<TState> {
  rehydrate(): Promise<void>;
  clearPersistedState(): Promise<void>;
}

export function createPersistStore<TState>(
  initialState: TState,
  persistOptions: PersistOptions<TState>,
): PersistStore<TState> {
  const { key, storage, serialize = JSON.stringify, deserialize = JSON.parse } = persistOptions;

  let hydrated = false;

  const store = new Store<TState>(initialState);

  // Subscribe to persist state changes
  store.subscribe(() => {
    if (hydrated) {
      const serialized = serialize(store.state);
      void Promise.resolve(storage.setItem(key, serialized));
    }
  });

  const rehydrate = async (): Promise<void> => {
    const raw = await Promise.resolve(storage.getItem(key));
    if (raw !== null) {
      const deserialized = deserialize(raw);
      store.setState(() => deserialized);
    }
    hydrated = true;
  };

  const clearPersistedState = async (): Promise<void> => {
    await Promise.resolve(storage.removeItem(key));
  };

  // Start rehydration immediately
  void rehydrate();

  const persistStore = store as PersistStore<TState>;
  persistStore.rehydrate = rehydrate;
  persistStore.clearPersistedState = clearPersistedState;

  return persistStore;
}
