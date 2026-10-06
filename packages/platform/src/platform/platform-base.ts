import { isChrome, isClient, isServer, isTouchable, isWeb, isWebTouchable, isWindowDefined } from '@tamagui/constants';

declare global {
  interface Window {
    __STORYBOOK_ADDONS_PREVIEW: unknown;
  }
}

const platformOrder = [
  'Ios',
  'Android',
  // Gnome outranks Native: the GTK target reports isNative (it is not a
  // browser) but "gnome" is the precise answer callers want.
  'Gnome',
  'Native',
  // Tauri outranks Desktop/Web the same way: the webview host reports isWeb
  // and isDesktop, but "tauri" is the precise answer.
  'Tauri',
  'Desktop',
  'ChromeExtension',
  'FirefoxExtension',
  'WebExtension',
  'Next',
  'Expo',
  'Chrome',
  'Firefox',
  'Web',
  'Browser',
  'Client',
  'Server',
  'Iframe',
  'Storybook',
];

export type PlatformName =
  | 'ios'
  | 'android'
  | 'gnome'
  | 'native'
  | 'tauri'
  | 'desktop'
  | 'chromeExtension'
  | 'firefoxExtension'
  | 'webExtension'
  | 'next'
  | 'expo'
  | 'chrome'
  | 'firefox'
  | 'web'
  | 'browser'
  | 'client'
  | 'server'
  | 'iframe'
  | 'storybook'
  | 'unknown';

export const platformBase = {
  isAndroid: false,
  isBrowser: false,
  isChrome,
  isChromeExtension: false,
  isClient,
  isDesktop: false,
  isExpo: false,
  isFirefox: false,
  isFirefoxExtension: false,
  isGnome: false,
  isIframe: false,
  isIos: false,
  isNative: false,
  isNext: false,
  isServer,
  isStorybook: isWindowDefined && typeof window.__STORYBOOK_ADDONS_PREVIEW === 'object',
  isTauri: false,
  isTouchable,
  isWeb,
  isWebExtension: false,
  isWebTouchable,
  isWindowDefined,
  preciseName: 'unknown',
  broadName: 'unknown',
} as const;

export function getPreciseName(platform: Omit<Platform, 'preciseName'>) {
  const flags = platform as unknown as Record<string, boolean>;
  for (const name of platformOrder) {
    if (flags[`is${name}`]) {
      return `${name[0].toLowerCase()}${name.slice(1)}` as PlatformName;
    }
  }
  return 'unknown';
}

export function getBroadName(platform: Omit<Platform, 'broadName'>) {
  const flags = platform as unknown as Record<string, boolean>;
  for (const name of platformOrder.slice().reverse()) {
    if (flags[`is${name}`]) {
      return `${name[0].toLowerCase()}${name.slice(1)}` as PlatformName;
    }
  }
  return 'unknown';
}

export interface Platform {
  isAndroid: boolean;
  isBrowser: boolean;
  isChrome: boolean;
  isChromeExtension: boolean;
  isClient: boolean;
  isDesktop: boolean;
  isExpo: boolean;
  isFirefox: boolean;
  isFirefoxExtension: boolean;
  isGnome: boolean;
  isIframe: boolean;
  isIos: boolean;
  isNative: boolean;
  isNext: boolean;
  isServer: boolean;
  isStorybook: boolean;
  isTauri: boolean;
  isTouchable: boolean;
  isWeb: boolean;
  isWebExtension: boolean;
  isWebTouchable: boolean;
  isWindowDefined: boolean;
  broadName: PlatformName;
  preciseName: PlatformName;
}
