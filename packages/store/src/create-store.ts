import { Store } from '@tanstack/store';

import { createPersistStore } from './persist';
import type { PersistStore } from './persist';
import type { Storage } from './persist';
import { storage as defaultStorage } from './storage';

export interface StoreOptions {
  name: string;
  persist?: boolean;
  storage?: Storage;
}

export const createStore = <T>(initialState: T, options?: StoreOptions): Store<T> | PersistStore<T> => {
  if (options?.persist) {
    return createPersistStore<T>(initialState, {
      key: options.name,
      storage: options.storage ?? defaultStorage,
    });
  }
  return new Store<T>(initialState);
};
