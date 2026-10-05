export type ExpoMapsModule = typeof import('expo-maps');

let cached: ExpoMapsModule | null | undefined;

/**
 * Loads the optional `expo-maps` peer at runtime. The `require` sits inside a
 * try/catch so Metro treats it as an optional dependency
 * (`transformer.allowOptionalDependencies`, on by default in Expo): bundling
 * succeeds without the package installed and the call simply returns `null`,
 * letting the native map surface fall back to its placeholder. Only the
 * native map twin imports this file — web bundles never reach it.
 *
 * Preflight: the availability check MUST happen before requiring
 * "expo-maps". Its module factory calls requireNativeModule("ExpoMaps")
 * eagerly, and a throwing module factory is reported by Metro's guarded
 * require as a FATAL LogBox in dev (Expo Go) even when the caller catches
 * the error — the map fell back correctly but a fatal redbox covered the
 * screen. requireOptionalNativeModule returns null instead of throwing, so
 * the factory never runs where the native module is absent.
 */
export function loadExpoMaps(): ExpoMapsModule | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    // expo-modules-core ships with every Expo host; requiring it is optional
    // too so non-Expo hosts skip straight to the guarded expo-maps probe.
    let hasNativeModule = true;
    try {
      const core = require('expo-modules-core') as {
        requireOptionalNativeModule?: (name: string) => unknown;
      };
      if (core.requireOptionalNativeModule) {
        const nativeModule = core.requireOptionalNativeModule('ExpoMaps');
        hasNativeModule = nativeModule !== null && nativeModule !== undefined;
      }
    } catch {
      /* expo-modules-core absent — keep hasNativeModule=true and probe below */
    }
    if (!hasNativeModule) {
      cached = null;
      return cached;
    }
    const mod = require('expo-maps') as ExpoMapsModule;
    // The JS package can require fine while the NATIVE module is absent
    // (builds without the peer): expo-maps defers namespace initialization
    // until first touched, which would throw during render. Probe here so
    // the failure is caught and the map surface falls back to its
    // placeholder.
    void mod.AppleMaps?.View;
    void mod.GoogleMaps?.View;
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}
