/**
 * The list's favorites: a persistent store per storage key (the
 * persistent-stores standard: hydration-gated writes, immutable updates),
 * shared by every reader of that key.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import type { Storage } from '@repo/store';
import { describe, expect, it } from 'vitest';

import { createFavoritesStore, favoritesStore, toggleFavoriteIn } from './favorites';

const makeFakeStorage = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  const storage: Storage = {
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => {
      data.set(name, value);
    },
    removeItem: (name) => {
      data.delete(name);
    },
  };
  return { storage, data };
};

const flush = async () => {
  await sleep(0);
};

describe('favorites store', () => {
  it('toggle adds then removes a name, preserving insertion order', async () => {
    const { storage } = makeFakeStorage();
    const store = createFavoritesStore('favs', storage);
    await flush();

    toggleFavoriteIn(store, 'pikachu');
    toggleFavoriteIn(store, 'gengar');
    expect(store.state.names).toStrictEqual(['pikachu', 'gengar']);

    toggleFavoriteIn(store, 'pikachu');
    expect(store.state.names).toStrictEqual(['gengar']);
  });

  it('persists under its key after hydration completes', async () => {
    const { storage, data } = makeFakeStorage();
    const store = createFavoritesStore('pokemon-favorites', storage);
    await flush();

    toggleFavoriteIn(store, 'snorlax');
    await flush();

    expect(JSON.parse(data.get('pokemon-favorites') ?? '{}')).toStrictEqual({ names: ['snorlax'] });
  });

  it('rehydrates previously persisted favorites', async () => {
    const { storage } = makeFakeStorage({
      'pokemon-favorites': JSON.stringify({ names: ['mewtwo', 'eevee'] }),
    });
    const store = createFavoritesStore('pokemon-favorites', storage);
    await flush();

    expect(store.state.names).toStrictEqual(['mewtwo', 'eevee']);
  });

  it('clearPersistedState removes the storage entry', async () => {
    const { storage, data } = makeFakeStorage({
      favs: JSON.stringify({ names: ['mew'] }),
    });
    const store = createFavoritesStore('favs', storage);
    await flush();

    await store.clearPersistedState();
    expect(data.has('favs')).toBe(false);
  });

  it('hands every reader of one key the same store', () => {
    expect(favoritesStore('frappe-favorites-Pokemon')).toBe(favoritesStore('frappe-favorites-Pokemon'));
    expect(favoritesStore('frappe-favorites-Pokemon')).not.toBe(favoritesStore('frappe-favorites-Poke Move'));
  });
});
