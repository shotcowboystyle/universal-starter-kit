import { isNative, isWindowDefined } from '@repo/platform';

/**
 * True when running under GJS (GNOME JavaScript — the GTK desktop runtime).
 *
 * GJS always exposes the legacy `imports` global with its `gi` GObject
 * Introspection namespace, in both script and ESM (`gjs -m`) modes — verified
 * on GJS 1.7x/1.8x. No browser, Node, or React Native runtime defines
 * `globalThis.imports.gi`, so this cannot false-positive elsewhere (a page
 * would have to deliberately fake the GI namespace). Checked lazily — GJS
 * embeds could in theory construct the global after module init.
 */
export function isGjs(): boolean {
  try {
    const gjsImports = (globalThis as { imports?: { gi?: unknown } }).imports;
    return (
      typeof gjsImports === 'object' &&
      gjsImports !== null &&
      typeof gjsImports.gi === 'object' &&
      gjsImports.gi !== null
    );
  } catch {
    return false;
  }
}

/**
 * True in any CLIENT runtime — web browser, React Native, or GJS (GNOME) —
 * false in Node/SSR. This gates the live sync pipeline
 * (SyncModule/collections), which is fully capable on all three:
 * native has MMKV storage and the RN realtime transport; GJS runs with
 * WHATWG timers, an entry-installed fetch/WebSocket polyfill (libsoup), and
 * guarded storage/BroadcastChannel no-ops. Window-presence alone is the
 * wrong test: @tamagui/constants hardcodes isWindowDefined=false on native,
 * which used to silently disable every collection on iOS/Android, and GJS
 * has no real window either.
 */
export function isBrowser(): boolean {
  return isNative || isWindowDefined || isGjs();
}
