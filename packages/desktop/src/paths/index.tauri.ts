import { invoke } from '@tauri-apps/api/core';

import type { PathsApi } from './index';

export const paths: PathsApi = {
  async getAppPath() {
    return await invoke<string>('get_app_path');
  },
  async getPath(name: string) {
    return await invoke<string>('get_path', { name });
  },
  async join(...segments: string[]) {
    return await invoke<string>('join_path', { segments });
  },
  async resolve(...segments: string[]) {
    return await invoke<string>('resolve_path', { segments });
  },
  async dirname(path: string) {
    return await invoke<string>('dirname', { path });
  },
};

export type { PathsApi } from './index';
