export type DocumentPickerModule = typeof import('expo-document-picker');
export type ImagePickerModule = typeof import('expo-image-picker');

/**
 * The names each picker registers with expo-modules-core. expo-image-picker
 * keeps its Exponent-era name.
 */
export const pickerNativeModules = {
  document: 'ExpoDocumentPicker',
  image: 'ExponentImagePicker',
} as const;

let cachedDocumentPicker: DocumentPickerModule | null | undefined;
let cachedImagePicker: ImagePickerModule | null | undefined;

/**
 * Probes an Expo native module without throwing. Both pickers ship a JS half
 * that resolves fine in a build whose NATIVE half was never linked (Expo Go,
 * a consumer that skipped the optional peer); touching the namespace then
 * throws mid-render. `requireOptionalNativeModule` answers null instead, so
 * the probe has to happen BEFORE the `require` — a throwing module factory is
 * reported by Metro's guarded require as a FATAL LogBox in dev even when the
 * caller catches it (the expo-maps lesson in `expoMapsLoader.ts`).
 */
function hasNativeModule(name: string): boolean {
  try {
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (moduleName: string) => unknown;
    };
    if (!core.requireOptionalNativeModule) {
      return true;
    }
    return core.requireOptionalNativeModule(name) != null;
  } catch {
    // expo-modules-core absent (non-Expo host) — let the guarded require decide.
    return true;
  }
}

/**
 * Loads the optional `expo-document-picker` peer at runtime. The `require`
 * sits inside a try/catch so Metro treats it as an optional dependency
 * (`transformer.allowOptionalDependencies`, on by default in Expo): bundling
 * succeeds without the package installed and the call returns null. Only the
 * native picker twin imports this file — web bundles never reach it.
 */
export function loadDocumentPicker(): DocumentPickerModule | null {
  if (cachedDocumentPicker !== undefined) {
    return cachedDocumentPicker;
  }
  try {
    cachedDocumentPicker = hasNativeModule(pickerNativeModules.document)
      ? (require('expo-document-picker') as DocumentPickerModule)
      : null;
  } catch {
    cachedDocumentPicker = null;
  }
  return cachedDocumentPicker;
}

/** Same optional-peer contract as `loadDocumentPicker`, for `expo-image-picker`. */
export function loadImagePicker(): ImagePickerModule | null {
  if (cachedImagePicker !== undefined) {
    return cachedImagePicker;
  }
  try {
    cachedImagePicker = hasNativeModule(pickerNativeModules.image)
      ? (require('expo-image-picker') as ImagePickerModule)
      : null;
  } catch {
    cachedImagePicker = null;
  }
  return cachedImagePicker;
}

/** Test seam: drops the memoized modules so a spec can swap them per case. */
export function resetNativePickerCache(): void {
  cachedDocumentPicker = undefined;
  cachedImagePicker = undefined;
}
