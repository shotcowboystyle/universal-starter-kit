/// <reference types="@types/chrome" />
/// <reference types="@types/firefox-webext-browser" />

import { getBroadName, getPreciseName, platformBase } from './platform-base';
import type { Platform } from './platform-base';

declare global {
  interface Window {
    ipc?: unknown;
  }
}

const isIframe = (() => {
  if (!platformBase.isWindowDefined) {
    return false;
  }
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isWebExtension = !!(
  (typeof chrome !== 'undefined' && !!chrome?.runtime?.id) ||
  (typeof browser !== 'undefined' && !!browser?.runtime?.id)
);

export const platform: Platform = {
  ...platformBase,
  isChromeExtension: typeof chrome !== 'undefined' && !!chrome?.runtime?.id,
  isFirefoxExtension: typeof browser !== 'undefined' && !!browser?.runtime?.id,
  isIframe,
  isWebExtension,
  isBrowser: !!(platformBase.isWeb && platformBase.isWindowDefined && !isWebExtension),
  isNext:
    platformBase.isWeb &&
    (!platformBase.isWindowDefined || typeof (window as { __NEXT_DATA__?: unknown }).__NEXT_DATA__ === 'object'),
  isFirefox: platformBase.isWindowDefined && !!window?.navigator?.userAgent?.toLowerCase().includes('firefox'),
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);

export type { Platform };
export type { PlatformName } from './platform-base';
