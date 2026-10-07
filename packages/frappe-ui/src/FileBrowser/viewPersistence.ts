import type { FileBrowserView } from './types';

const PREFIX = 'mpo.filebrowser.view.';

/** Survives the test-utils no-op localStorage stub; localStorage still wins after reload. */
const memory = new Map<string, FileBrowserView>();

function storageKey(surfaceId: string): string {
  return `${PREFIX}${surfaceId}`;
}

function coerce(value: string | null | undefined): FileBrowserView | undefined {
  return value === 'grid' || value === 'list' ? value : undefined;
}

export function readPersistedView(surfaceId?: string): FileBrowserView | undefined {
  if (!surfaceId) {
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
}

export function writePersistedView(surfaceId: string | undefined, view: FileBrowserView): void {
  if (!surfaceId) {
    return;
  }
  const key = storageKey(surfaceId);
  memory.set(key, view);
  try {
    globalThis.localStorage?.setItem(key, view);
  } catch {
    // quota / private mode / test stub
  }
}
