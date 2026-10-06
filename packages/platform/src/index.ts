import { platform } from './platform/index';

export const {
  isAndroid,
  isBrowser,
  isChrome,
  isChromeExtension,
  isClient,
  isExpo,
  isFirefox,
  isFirefoxExtension,
  isGnome,
  isIframe,
  isIos,
  isNative,
  isNext,
  isServer,
  isStorybook,
  isTauri,
  isDesktop,
  isTouchable,
  isWeb,
  isWebExtension,
  isWebTouchable,
  isWindowDefined,
} = platform;

export * from './platform/index';
export * from './helpers';
export type * from './types';
export * from './config/index';
export * from './utils/cookie';
export * from './utils/download-file';
export * from './utils/clipboard';
export * from './utils/open-url';
export * from './utils/lifecycle';
