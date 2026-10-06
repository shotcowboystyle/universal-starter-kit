import type { getDocumentAsync } from 'expo-document-picker';
import type { launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } from 'expo-image-picker';

/** The slice of `expo-document-picker` the field uses. */
export interface DocumentPickerModule {
  getDocumentAsync: typeof getDocumentAsync;
}

/** The slice of `expo-image-picker` the field uses. */
export interface ImagePickerModule {
  launchImageLibraryAsync: typeof launchImageLibraryAsync;
  requestMediaLibraryPermissionsAsync: typeof requestMediaLibraryPermissionsAsync;
}

/**
 * The names each picker registers with expo-modules-core. expo-image-picker
 * keeps its Exponent-era name.
 */
export const pickerNativeModules = {
  document: 'ExpoDocumentPicker',
  image: 'ExponentImagePicker',
} as const;

// null = not probed yet; the wrapper distinguishes "probed, absent" ({ module: null }).
let cachedDocumentPicker: { module: DocumentPickerModule | null } | null = null;
let cachedImagePicker: { module: ImagePickerModule | null } | null = null;

/**
 * Probes an Expo native module without throwing. Both pickers ship a JS half
 * that resolves fine in a build whose NATIVE half was never linked (Expo Go,
 * a consumer that skipped the optional peer); touching the namespace then
 * throws mid-render. `requireOptionalNativeModule` answers null instead, so
 * the probe has to happen BEFORE the `require` — a throwing module factory is
 * reported by Metro's guarded require as a FATAL LogBox in dev even when the
 * caller catches it (the expo-maps lesson in `expo-maps-loader.ts`).
 */
const hasNativeModule = (name: string): boolean => {
  try {
    // oxlint-disable-next-line node/global-require, unicorn/prefer-module, typescript/no-unsafe-type-assertion -- Metro needs a literal require inside try/catch to treat the peer as optional; SAFETY: expo-modules-core exports this shape when present
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (moduleName: string) => object | null;
    };
    if (!core.requireOptionalNativeModule) {
      return true;
    }
    return core.requireOptionalNativeModule(name) != null;
  } catch {
    // expo-modules-core absent (non-Expo host) — let the guarded require decide.
    return true;
  }
};

/**
 * Loads the optional `expo-document-picker` peer at runtime. The `require`
 * sits inside a try/catch so Metro treats it as an optional dependency
 * (`transformer.allowOptionalDependencies`, on by default in Expo): bundling
 * succeeds without the package installed and the call returns null. Only the
 * native picker twin imports this file — web bundles never reach it.
 */
export const loadDocumentPicker = (): DocumentPickerModule | null => {
  if (cachedDocumentPicker !== null) {
    return cachedDocumentPicker.module;
  }
  let loaded: DocumentPickerModule | null = null;
  try {
    loaded = hasNativeModule(pickerNativeModules.document)
      ? // oxlint-disable-next-line node/global-require, unicorn/prefer-module, typescript/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion -- Metro needs a literal require inside try/catch to treat the peer as optional; SAFETY: module is expo-document-picker
        (require('expo-document-picker') as DocumentPickerModule)
      : null;
  } catch {
    loaded = null;
  }
  cachedDocumentPicker = { module: loaded };
  return loaded;
};

/** Same optional-peer contract as `loadDocumentPicker`, for `expo-image-picker`. */
export const loadImagePicker = (): ImagePickerModule | null => {
  if (cachedImagePicker !== null) {
    return cachedImagePicker.module;
  }
  let loaded: ImagePickerModule | null = null;
  try {
    loaded = hasNativeModule(pickerNativeModules.image)
      ? // oxlint-disable-next-line node/global-require, unicorn/prefer-module, typescript/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion -- Metro needs a literal require inside try/catch to treat the peer as optional; SAFETY: module is expo-image-picker
        (require('expo-image-picker') as ImagePickerModule)
      : null;
  } catch {
    loaded = null;
  }
  cachedImagePicker = { module: loaded };
  return loaded;
};

/** Test seam: drops the memoized modules so a spec can swap them per case. */
export const resetNativePickerCache = (): void => {
  cachedDocumentPicker = null;
  cachedImagePicker = null;
};
