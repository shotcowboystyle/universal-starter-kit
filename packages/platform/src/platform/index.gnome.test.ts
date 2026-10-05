import { describe, expect, it } from 'vitest';

import { platform } from './index.gnome';

import { platform as webPlatform } from './index';

describe('the gnome platform entry', () => {
  it('sets isGnome, which is the whole point of the file existing', () => {
    expect(platform.isGnome).toBe(true);
  });

  it('resolves preciseName to "gnome" rather than "native"', () => {
    expect(platform.preciseName).toBe('gnome');
  });

  it('resolves broadName to "client"', () => {
    expect(platform.broadName).toBe('client');
  });

  it('reports a desktop that is not a browser', () => {
    expect(platform.isDesktop).toBe(true);
    expect(platform.isNative).toBe(true);
    expect(platform.isWeb).toBe(false);
    expect(platform.isBrowser).toBe(false);
  });

  it("does not claim a usable window, since GJS's is a polyfill stub", () => {
    expect(platform.isWindowDefined).toBe(false);
  });

  it('claims no other platform', () => {
    expect(platform.isIos).toBe(false);
    expect(platform.isAndroid).toBe(false);
    expect(platform.isExpo).toBe(false);
    expect(platform.isNext).toBe(false);
    expect(platform.isServer).toBe(false);
    expect(platform.isWebExtension).toBe(false);
    expect(platform.isStorybook).toBe(false);
  });

  it('answers every key the default entry does, so the flag set cannot drift', () => {
    expect(Object.keys(platform).sort()).toEqual(Object.keys(webPlatform).sort());
  });
});
