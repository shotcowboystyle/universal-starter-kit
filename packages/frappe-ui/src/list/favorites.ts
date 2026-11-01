/**
 * A list's favorites: the record names a reader starred, kept on the device
 * (no bench write, so a guest can star too). One persistent store per
 * storage key, following docs/standards/frontend/persistent-stores.md.
 */
import { Store, createPersistStore, storage, useStore } from '@repo/store';
import type { PersistStore, Storage } from '@repo/store';
import { useMemo } from 'react';

export interface FavoritesState {
  /** Starred record names, in the order they were starred. */
  names: string[];
}

export const createFavoritesStore = (key: string, storageImpl: Storage = storage): PersistStore<FavoritesState> =>
  createPersistStore<FavoritesState>({ names: [] }, { key, storage: storageImpl });

const stores = new Map<string, PersistStore<FavoritesState>>();

/** The shared store for a storage key. */
export const favoritesStore = (key: string): PersistStore<FavoritesState> => {
  let store = stores.get(key);
  if (!store) {
    store = createFavoritesStore(key);
    stores.set(key, store);
  }
  return store;
};

/** The storage key a doctype's favorites default to. */
export const favoritesKey = (doctype: string): string => `frappe-favorites-${doctype}`;

export const toggleFavoriteIn = (store: PersistStore<FavoritesState>, name: string): void => {
  store.setState((prev) =>
    prev.names.includes(name) ? { names: prev.names.filter((n) => n !== name) } : { names: [...prev.names, name] },
  );
};

export interface UseFavorites {
  favorites: string[];
  favoriteSet: ReadonlySet<string>;
  isFavorite: (name: string) => boolean;
  toggle: (name: string) => void;
  count: number;
}

const noFavorites = new Store<FavoritesState>({ names: [] });

/** A key's favorites; without a key, none (and toggling does nothing). */
export const useFavorites = (key: string | undefined): UseFavorites => {
  const persistent = key !== undefined && key !== '' ? favoritesStore(key) : undefined;
  const store = persistent ?? noFavorites;
  const names = useStore(store, (state) => state.names);
  return useMemo(() => {
    const favoriteSet = new Set(names);
    return {
      favorites: names,
      favoriteSet,
      isFavorite: (name: string) => favoriteSet.has(name),
      toggle: (name: string) => {
        if (persistent) {
          toggleFavoriteIn(persistent, name);
        }
      },
      count: names.length,
    };
  }, [names, persistent]);
};
