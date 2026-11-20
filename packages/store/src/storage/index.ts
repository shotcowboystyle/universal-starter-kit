import type { Storage } from '../persist';

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => {
    // Intentional no-op: no storage backend is available in this environment
  },
  removeItem: () => {
    // Intentional no-op: no storage backend is available in this environment
  },
};

const getStorage = (): Storage => {
  if ('localStorage' in globalThis && globalThis.localStorage?.getItem != null) {
    return {
      getItem: (name: string) => globalThis.localStorage.getItem(name) ?? null,
      setItem: (name: string, value: string) => {
        globalThis.localStorage.setItem(name, value);
      },
      removeItem: (name: string) => {
        globalThis.localStorage.removeItem(name);
      },
    };
  }
  return noopStorage;
};

export const storage: Storage = getStorage();
