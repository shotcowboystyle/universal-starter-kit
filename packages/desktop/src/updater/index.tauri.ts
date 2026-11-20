/**
 * Tauri implementation of the auto-updater API
 *
 * Uses tauri-plugin-updater to check for and install updates.
 * Requires the updater plugin to be configured in tauri.conf.json with:
 * - endpoints: Array of update manifest URLs
 * - pubkey: Public key for verifying update signatures
 */

import type { UpdaterApi, UpdateInfo } from './index';

// The runtime caches the module after the first dynamic import.
const getUpdater = async () => await import('@tauri-apps/plugin-updater');

export const updater: UpdaterApi = {
  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      const { check } = await getUpdater();
      const update = await check();

      if (update) {
        return {
          version: update.version,
          date: update.date ?? new Date().toISOString(),
          body: update.body ?? undefined,
        };
      }
      return null;
    } catch (error) {
      console.error('[updater] Failed to check for updates:', error);
      return null;
    }
  },

  async downloadAndInstall(onProgress?: (progress: number) => void): Promise<boolean> {
    try {
      const { check } = await getUpdater();
      const update = await check();

      if (!update) {
        return false;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started': {
            contentLength = event.data.contentLength ?? 0;
            break;
          }
          case 'Progress': {
            downloaded += event.data.chunkLength;
            if (onProgress && contentLength > 0) {
              onProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          }
          case 'Finished': {
            if (onProgress) {
              onProgress(100);
            }
            break;
          }
          default: {
            break;
          }
        }
      });

      return true;
    } catch (error) {
      console.error('[updater] Failed to download and install update:', error);
      return false;
    }
  },

  isSupported(): boolean {
    return true;
  },
};
