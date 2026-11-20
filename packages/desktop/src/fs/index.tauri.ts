import {
  readTextFile as tauriReadTextFile,
  writeTextFile as tauriWriteTextFile,
  exists as tauriExists,
  mkdir as tauriMkdir,
  remove as tauriRemove,
  rename as tauriRename,
  copyFile as tauriCopyFile,
} from '@tauri-apps/plugin-fs';

import type { FsApi } from './index';

export const fs: FsApi = {
  async readTextFile(path: string): Promise<string> {
    return await tauriReadTextFile(path);
  },
  async writeTextFile(path: string, contents: string): Promise<void> {
    await tauriWriteTextFile(path, contents);
  },
  async exists(path: string): Promise<boolean> {
    return await tauriExists(path);
  },
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await tauriMkdir(path, options);
  },
  async remove(path: string, options?: { recursive?: boolean }): Promise<void> {
    await tauriRemove(path, options);
  },
  async rename(oldPath: string, newPath: string): Promise<void> {
    await tauriRename(oldPath, newPath);
  },
  async copyFile(src: string, dst: string): Promise<void> {
    await tauriCopyFile(src, dst);
  },
};

export type { FsApi } from './index';
