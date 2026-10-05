// Platform flags for the GNOME (GTK4 / GJS / libadwaita) target.
//
// Resolved the same way `index.ios.ts` and `index.android.ts` are: the
// bundler picks this file over `index.ts` by extension. Metro does that for
// `.ios`/`.android` out of the box; on GNOME it is Vite, and the `.gnome.*`
// entries come ahead of the `.native.*` ones in `resolve.extensions` —
// `gnomePlatformExtensions` from the GNOME Vite plugin, wired
// into the app's GNOME Vite config. Without that registration this file is
// inert and every consumer sees the base `isGnome: false`.
//
// Every value is stated rather than inherited from @tamagui/constants,
// because those are inferred from `document`/`window` and GJS's window is a
// polyfill stub — inference would answer questions about a fake DOM instead
// of about GTK.

import { type Platform, getBroadName, getPreciseName, platformBase } from './platformBase';

export const platform: Platform = {
  ...platformBase,
  isGnome: true,
  // GTK is a desktop, and it is not a browser — so `isNative` too, which is
  // exactly why Gnome sits ahead of Native in the precision order.
  isDesktop: true,
  isNative: true,
  isClient: true,
  isServer: false,
  isWeb: false,
  isBrowser: false,
  isChrome: false,
  isFirefox: false,
  isIframe: false,
  isStorybook: false,
  isWebExtension: false,
  isChromeExtension: false,
  isFirefoxExtension: false,
  isExpo: false,
  isNext: false,
  // A GTK pointer desktop. Touch exists on some hardware but is not the
  // interaction model the layout should assume.
  isTouchable: false,
  isWebTouchable: false,
  // There is a `window` under the react-gnome polyfills, but it is a stub
  // with no layout, no events and no document. Callers branching on this are
  // asking "can I touch the DOM", and the answer is no.
  isWindowDefined: false,
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);

export type { Platform };
export type { PlatformName } from './platformBase';
