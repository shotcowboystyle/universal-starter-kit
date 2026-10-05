import { Store } from '@tauri-apps/plugin-store';

import type { Storage } from '../persist';

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load('store.json');
  }
  return storePromise;
}

export const storage: Storage = {
  getItem: async (name: string) => {
    const s = await getStore();
    return (await s.get<string>(name)) ?? null;
  },
  setItem: async (name: string, value: string) => {
    const s = await getStore();
    await s.set(name, value);
    await s.save();
  },
  removeItem: async (name: string) => {
    const s = await getStore();
    await s.delete(name);
    await s.save();
  },
};
