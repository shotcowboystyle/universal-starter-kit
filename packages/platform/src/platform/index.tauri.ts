import { isChrome, isClient, isServer, isWeb, isWebTouchable, isWindowDefined } from '@tamagui/constants';

import { type Platform, getBroadName, getPreciseName, platformBase } from './platformBase';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

const isIframe = (() => {
  if (!isWindowDefined) {
    return false;
  }
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export const platform: Platform = {
  ...platformBase,
  isBrowser: false,
  isChrome,
  isClient,
  isIframe,
  isServer,
  isWeb,
  isWebTouchable,
  // Tauri-specific flags - using the same interface structure
  // Platform detection: Tauri injects __TAURI_INTERNALS__ at runtime
  isTauri: true,
  isDesktop: true,
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);

export type { Platform };
export type { PlatformName } from './platformBase';
