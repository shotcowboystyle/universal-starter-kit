import { Store } from '@tanstack/store';

export interface Storage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

export interface PersistOptions<TState> {
  key: string;
  storage: Storage;
  serialize?: (state: TState) => string;
  deserialize?: (raw: string) => TState;
}

export interface PersistStore<TState> extends Store<TState> {
  rehydrate: () => Promise<void>;
  clearPersistedState: () => Promise<void>;
}

export const createPersistStore = <TState>(
  initialState: TState,
  persistOptions: PersistOptions<TState>,
): PersistStore<TState> => {
  const { key, storage, serialize = JSON.stringify } = persistOptions;
  const deserialize =
    persistOptions.deserialize ??
    // oxlint-disable-next-line typescript/no-unsafe-return -- SAFETY: default deserializer; the persisted JSON was written by the matching serializer for TState
    ((raw: string): TState => JSON.parse(raw));

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

  return Object.assign(store, { rehydrate, clearPersistedState });
};
