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

export { platform } from './platform/index';
export type { Platform, PlatformName } from './platform/index';
export { createWithLayout, fastUnique, isDev, isText } from './helpers';
export type { WithLayout } from './helpers';
export type { StyleProp } from './types';
export {
  Config,
  bakedConfigEnvKey,
  bakedPublicConfig,
  config,
  devHostFromHostUri,
  publicConfigKeys,
  publicConfigKeysEnvKey,
  readRuntimePublicConfig,
  resolveDevOrigin,
  resolvePublicConfig,
  runtimePublicConfigKey,
  serializeRuntimePublicConfig,
} from './config/index';
export type { DevOriginSource } from './config/index';
export { deleteCookie, getCookie, setCookie } from './utils/cookie';
export type { CookieOptions } from './utils/cookie';
export { downloadBlob, downloadFile } from './utils/download-file';
export { writeToClipboard } from './utils/clipboard';
export { openUrl } from './utils/open-url';
export { onAppBlur, onAppFocus, onOffline, onOnline, onVisibilityChange } from './utils/lifecycle';
