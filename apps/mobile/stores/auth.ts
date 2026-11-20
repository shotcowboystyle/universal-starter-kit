import { createAuthStore } from '@repo/store';
import type { StorageAdapter } from '@repo/store';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

const secureStorageAdapter: StorageAdapter = {
  getItem: async (name: string) => await getItemAsync(name),
  setItem: async (name: string, value: string) => {
    await setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    await deleteItemAsync(name);
  },
};

export const useAuthStore = createAuthStore(secureStorageAdapter);
