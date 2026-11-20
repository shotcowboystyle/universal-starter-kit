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

const isWebExtension =
  (typeof chrome !== 'undefined' && !!chrome?.runtime?.id) ||
  (typeof browser !== 'undefined' && !!browser?.runtime?.id);

const hasNextData = (): boolean => {
  if (!platformBase.isWindowDefined) {
    return true;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: a plain property read of Next's injected global, absent outside Next
  const nextWindow = window as { __NEXT_DATA__?: unknown };
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- tells an object payload apart from absent or non-object values
  return typeof nextWindow.__NEXT_DATA__ === 'object';
};

export const platform: Platform = {
  ...platformBase,
  isChromeExtension: typeof chrome !== 'undefined' && !!chrome?.runtime?.id,
  isFirefoxExtension: typeof browser !== 'undefined' && !!browser?.runtime?.id,
  isIframe,
  isWebExtension,
  isBrowser: platformBase.isWeb && platformBase.isWindowDefined && !isWebExtension,
  isNext: platformBase.isWeb && hasNextData(),
  isFirefox: platformBase.isWindowDefined && (window?.navigator?.userAgent?.toLowerCase().includes('firefox') ?? false),
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);

export type { Platform, PlatformName } from './platform-base';
