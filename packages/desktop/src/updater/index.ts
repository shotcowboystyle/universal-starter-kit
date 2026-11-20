/**
 * Auto-updater API for desktop applications
 *
 * A platform-agnostic interface for checking and installing application
 * updates. The Tauri target implements it via tauri-plugin-updater (the
 * `.tauri` file next door). Everywhere else `isSupported()` returning false
 * is the honest answer — web and mobile get updates from the service worker
 * or the app store.
 */

export interface UpdateInfo {
  version: string;
  date: string;
  body?: string;
}

export interface UpdaterApi {
  /**
   * Check if an update is available
   * @returns UpdateInfo if update available, null otherwise
   */
  checkForUpdates: () => Promise<UpdateInfo | null>;

  /**
   * Download and install the latest update
   * @param onProgress Optional callback for download progress (0-100)
   * @returns true if update was installed, false if no update available
   */
  downloadAndInstall: (onProgress?: (progress: number) => void) => Promise<boolean>;

  /**
   * Check if auto-updates are supported on this platform
   */
  isSupported: () => boolean;
}

// Default no-op implementation for web/mobile
export const updater: UpdaterApi = {
  async checkForUpdates(): Promise<UpdateInfo | null> {
    return null;
  },

  async downloadAndInstall(): Promise<boolean> {
    return false;
  },

  isSupported(): boolean {
    return false;
  },
};
