/// <reference types="@types/chrome" />
/// <reference types="@types/firefox-webext-browser" />

import { type Platform, getBroadName, getPreciseName, platformBase } from './platformBase';

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
  isFirefox: platformBase.isWindowDefined && !!(window?.navigator?.userAgent?.toLowerCase().indexOf('firefox') > -1),
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);

export type { Platform };
export type { PlatformName } from './platformBase';
