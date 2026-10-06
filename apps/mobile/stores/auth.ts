import { createAuthStore } from '@repo/store';
import type { StorageAdapter } from '@repo/store';
import * as SecureStore from 'expo-secure-store';

const secureStorageAdapter: StorageAdapter = {
  getItem: async (name: string) => await SecureStore.getItemAsync(name),
  setItem: async (name: string, value: string) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    await SecureStore.deleteItemAsync(name);
  },
};

export const useAuthStore = createAuthStore(secureStorageAdapter);
