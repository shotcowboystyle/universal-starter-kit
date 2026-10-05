import { Store } from '@tanstack/store';

import { type PersistStore, createPersistStore } from './persist';
import type { Storage } from './persist';
import { storage as defaultStorage } from './storage';

export interface StoreOptions {
  name: string;
  persist?: boolean;
  storage?: Storage;
}

export function createStore<T>(initialState: T, options?: StoreOptions): Store<T> | PersistStore<T> {
  if (options?.persist) {
    return createPersistStore<T>(initialState, {
      key: options.name,
      storage: options.storage ?? defaultStorage,
    });
  }
  return new Store<T>(initialState);
}
