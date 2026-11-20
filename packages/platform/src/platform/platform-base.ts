import { isChrome, isClient, isServer, isTouchable, isWeb, isWebTouchable, isWindowDefined } from '@tamagui/constants';

declare global {
  interface Window {
    __STORYBOOK_ADDONS_PREVIEW: unknown;
  }
}

export type PlatformName =
  | 'ios'
  | 'android'
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

type PlatformFlag = Exclude<keyof Platform, 'broadName' | 'preciseName'>;

const platformOrder: { flag: PlatformFlag; name: PlatformName }[] = [
  { flag: 'isIos', name: 'ios' },
  { flag: 'isAndroid', name: 'android' },
  { flag: 'isNative', name: 'native' },
  // Tauri outranks Desktop/Web the same way: the webview host reports isWeb
  // and isDesktop, but "tauri" is the precise answer.
  { flag: 'isTauri', name: 'tauri' },
  { flag: 'isDesktop', name: 'desktop' },
  { flag: 'isChromeExtension', name: 'chromeExtension' },
  { flag: 'isFirefoxExtension', name: 'firefoxExtension' },
  { flag: 'isWebExtension', name: 'webExtension' },
  { flag: 'isNext', name: 'next' },
  { flag: 'isExpo', name: 'expo' },
  { flag: 'isChrome', name: 'chrome' },
  { flag: 'isFirefox', name: 'firefox' },
  { flag: 'isWeb', name: 'web' },
  { flag: 'isBrowser', name: 'browser' },
  { flag: 'isClient', name: 'client' },
  { flag: 'isServer', name: 'server' },
  { flag: 'isIframe', name: 'iframe' },
  { flag: 'isStorybook', name: 'storybook' },
];

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
  isIframe: false,
  isIos: false,
  isNative: false,
  isNext: false,
  isServer,
  // oxlint-disable-next-line typescript/no-deprecated, anti-slop/no-runtime-typeof -- @tamagui/constants' isWindowDefined is the established flag (also re-exported below); typeof tells the preview global apart
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

export const getPreciseName = (platform: Omit<Platform, 'preciseName'>): PlatformName => {
  for (const { flag, name } of platformOrder) {
    if (platform[flag]) {
      return name;
    }
  }
  return 'unknown';
};

export const getBroadName = (platform: Omit<Platform, 'broadName'>): PlatformName => {
  for (let index = platformOrder.length - 1; index >= 0; index -= 1) {
    const { flag, name } = platformOrder[index];
    if (platform[flag]) {
      return name;
    }
  }
  return 'unknown';
};

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
