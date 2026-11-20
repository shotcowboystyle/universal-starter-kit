import { describe, expect, it } from 'vitest';

import { updater } from './index';

describe('updater web stubs', () => {
  it('checkForUpdates returns null', async () => {
    await expect(updater.checkForUpdates()).resolves.toBeNull();
  });

  it('downloadAndInstall returns false', async () => {
    await expect(updater.downloadAndInstall()).resolves.toBe(false);
  });

  it('isSupported returns false', () => {
    expect(updater.isSupported()).toBe(false);
  });
});
