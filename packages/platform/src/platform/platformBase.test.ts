import { describe, expect, it } from 'vitest';

import { getBroadName, getPreciseName, type Platform } from './platformBase';

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    isAndroid: false,
    isBrowser: false,
    isChrome: false,
    isChromeExtension: false,
    isClient: false,
    isDesktop: false,
    isExpo: false,
    isFirefox: false,
    isFirefoxExtension: false,
    isGnome: false,
    isIframe: false,
    isIos: false,
    isNative: false,
    isNext: false,
    isServer: false,
    isStorybook: false,
    isTauri: false,
    isTouchable: false,
    isWeb: false,
    isWebExtension: false,
    isWebTouchable: false,
    isWindowDefined: false,
    preciseName: 'unknown',
    broadName: 'unknown',
    ...overrides,
  };
}

describe('getPreciseName', () => {
  it('returns "unknown" when no flags are true', () => {
    expect(getPreciseName(makePlatform())).toBe('unknown');
  });

  it('returns the first matching flag in priority order (iOS > Android > others)', () => {
    expect(getPreciseName(makePlatform({ isIos: true, isNative: true, isClient: true }))).toBe('ios');
  });

  it('returns "android" when isAndroid is the most precise', () => {
    expect(getPreciseName(makePlatform({ isAndroid: true, isNative: true }))).toBe('android');
  });

  it('returns "gnome" for the GTK desktop target', () => {
    expect(getPreciseName(makePlatform({ isGnome: true, isDesktop: true, isNative: true }))).toBe('gnome');
  });

  it('returns "tauri" for desktop Tauri apps', () => {
    expect(getPreciseName(makePlatform({ isTauri: true, isDesktop: true, isWeb: true }))).toBe('tauri');
  });

  it('returns "chromeExtension" over generic "chrome"', () => {
    expect(getPreciseName(makePlatform({ isChromeExtension: true, isChrome: true, isWeb: true }))).toBe(
      'chromeExtension',
    );
  });

  it('returns "next" for Next.js environments', () => {
    expect(getPreciseName(makePlatform({ isNext: true, isWeb: true, isClient: true }))).toBe('next');
  });

  it('returns "chrome" for a plain Chrome browser', () => {
    expect(getPreciseName(makePlatform({ isChrome: true, isWeb: true, isBrowser: true }))).toBe('chrome');
  });

  it('returns "server" for server-only', () => {
    expect(getPreciseName(makePlatform({ isServer: true }))).toBe('server');
  });

  it('returns "storybook" when only isStorybook is true', () => {
    expect(getPreciseName(makePlatform({ isStorybook: true }))).toBe('storybook');
  });
});

describe('getBroadName', () => {
  it('returns "unknown" when no flags are true', () => {
    expect(getBroadName(makePlatform())).toBe('unknown');
  });

  it('returns the last matching flag in reverse priority order (broadest)', () => {
    expect(getBroadName(makePlatform({ isIos: true, isNative: true, isClient: true }))).toBe('client');
  });

  it('returns "server" (broadest) for a server environment', () => {
    expect(getBroadName(makePlatform({ isNext: true, isWeb: true, isServer: true }))).toBe('server');
  });

  it('returns "storybook" for storybook-only', () => {
    expect(getBroadName(makePlatform({ isStorybook: true }))).toBe('storybook');
  });

  it('returns "iframe" when iframe + storybook are set', () => {
    expect(getBroadName(makePlatform({ isStorybook: true, isIframe: true }))).toBe('storybook');
  });

  it('returns "browser" for a typical browser client', () => {
    expect(getBroadName(makePlatform({ isChrome: true, isWeb: true, isBrowser: true, isClient: true }))).toBe('client');
  });
});
