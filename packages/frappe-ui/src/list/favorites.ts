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

export function createFavoritesStore(key: string, storageImpl: Storage = storage): PersistStore<FavoritesState> {
  return createPersistStore<FavoritesState>({ names: [] }, { key, storage: storageImpl });
}

const stores = new Map<string, PersistStore<FavoritesState>>();

/** The shared store for a storage key. */
export function favoritesStore(key: string): PersistStore<FavoritesState> {
  let store = stores.get(key);
  if (!store) {
    store = createFavoritesStore(key);
    stores.set(key, store);
  }
  return store;
}

/** The storage key a doctype's favorites default to. */
export function favoritesKey(doctype: string): string {
  return `frappe-favorites-${doctype}`;
}

export function toggleFavoriteIn(store: PersistStore<FavoritesState>, name: string): void {
  store.setState((prev) =>
    prev.names.includes(name) ? { names: prev.names.filter((n) => n !== name) } : { names: [...prev.names, name] },
  );
}

export interface UseFavorites {
  favorites: string[];
  favoriteSet: ReadonlySet<string>;
  isFavorite: (name: string) => boolean;
  toggle: (name: string) => void;
  count: number;
}

const noFavorites = new Store<FavoritesState>({ names: [] });

/** A key's favorites; without a key, none (and toggling does nothing). */
export function useFavorites(key: string | undefined): UseFavorites {
  const store = key ? favoritesStore(key) : noFavorites;
  const names = useStore(store, (state) => state.names);
  return useMemo(() => {
    const favoriteSet = new Set(names);
    return {
      favorites: names,
      favoriteSet,
      isFavorite: (name: string) => favoriteSet.has(name),
      toggle: (name: string) => {
        if (store !== noFavorites) {
          toggleFavoriteIn(store as PersistStore<FavoritesState>, name);
        }
      },
      count: names.length,
    };
  }, [names, store]);
}
