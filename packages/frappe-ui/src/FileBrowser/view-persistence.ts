import type { FileBrowserView } from './types';

const PREFIX = 'mpo.filebrowser.view.';

/** Survives the test-utils no-op localStorage stub; localStorage still wins after reload. */
const memory = new Map<string, FileBrowserView>();

const storageKey = (surfaceId: string): string => `${PREFIX}${surfaceId}`;

const coerce = (value: string | null | undefined): FileBrowserView | undefined =>
  value === 'grid' || value === 'list' ? value : undefined;

export const readPersistedView = (surfaceId?: string): FileBrowserView | undefined => {
  if (surfaceId === undefined || surfaceId === '') {
    return undefined;
  }
  const key = storageKey(surfaceId);
  const remembered = memory.get(key);
  if (remembered) {
    return remembered;
  }
  try {
    return coerce(globalThis.localStorage?.getItem(key));
  } catch {
    return undefined;
  }
};

export const writePersistedView = (surfaceId: string | undefined, view: FileBrowserView): void => {
  if (surfaceId === undefined || surfaceId === '') {
    return;
  }
  const key = storageKey(surfaceId);
  memory.set(key, view);
  try {
    globalThis.localStorage?.setItem(key, view);
  } catch {
    // quota / private mode / test stub
  }
};
