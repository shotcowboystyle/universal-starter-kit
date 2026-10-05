import type { Storage } from '../persist';

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function getStorage(): Storage {
  if (
    typeof globalThis !== 'undefined' &&
    'localStorage' in globalThis &&
    typeof globalThis.localStorage?.getItem === 'function'
  ) {
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
}

export const storage: Storage = getStorage();
