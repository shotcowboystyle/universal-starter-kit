import { isNative, isWindowDefined } from '@repo/platform';

// Predicates for raw values with no static contract (response JSON, host globals).
export const isString = (value: unknown): value is string => typeof value === 'string';

export const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

/** True when `value` is an object carrying `key` (own or inherited), so `value[key]` can be read. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the field is read as unknown and narrowed at the call site
export const hasField = <K extends string>(value: unknown, key: K): value is Record<K, unknown> =>
  isObject(value) && key in value;

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
export const isGjs = (): boolean => {
  try {
    const gjsImports: unknown = hasField(globalThis, 'imports') ? globalThis.imports : undefined;
    return hasField(gjsImports, 'gi') && isObject(gjsImports.gi);
  } catch {
    // A throwing `imports` getter is not GJS's plain namespace object.
    return false;
  }
};

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
export const isBrowser = (): boolean => isNative || isWindowDefined || isGjs();
