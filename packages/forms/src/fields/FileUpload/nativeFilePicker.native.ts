import type { NativePickedFile, NativePickOutcome, NativePickRequest } from './filePickerTypes';
import { loadDocumentPicker, loadImagePicker } from './nativePickerLoader';

/** Strips a display name out of a `file://`/`content://` URI. */
function nameFromUri(uri: string, fallback: string): string {
  const withoutQuery = uri.split('?')[0] ?? uri;
  const last = withoutQuery.split('/').pop();
  return last && last.length > 0 ? decodeURIComponent(last) : fallback;
}

const extensionMimes: Record<string, string> = {
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * The image picker leaves `mimeType` undefined on some Android providers, and
 * the field's `accept` check matches on `file.type`. Deriving it from the
 * extension keeps an `accept="image/*"` field from rejecting its own pick.
 */
function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  return (ext && extensionMimes[ext]) || '';
}

/**
 * `accept` is a web media-query string ("image/*,.pdf"). The document picker
 * takes MIME types only, so extension entries are dropped here and caught
 * afterwards by the field's own `validateFile` — better a slightly wide picker
 * than one that silently shows nothing.
 */
export function acceptToMimeTypes(accept?: string): string[] | undefined {
  if (!accept) {
    return undefined;
  }
  const mimes = accept
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith('.'));
  return mimes.length > 0 ? mimes : undefined;
}

/** True when every `accept` entry is an image type, so the photo library is the better surface. */
export function isImageOnlyAccept(accept?: string): boolean {
  if (!accept) {
    return false;
  }
  const entries = accept
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return (
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry.startsWith('image/') ||
        entry === '.png' ||
        entry === '.jpg' ||
        entry === '.jpeg' ||
        entry === '.gif' ||
        entry === '.webp' ||
        entry === '.heic',
    )
  );
}

export function isNativeFilePickerAvailable(): boolean {
  return loadDocumentPicker() !== null || loadImagePicker() !== null;
}

async function pickFromPhotoLibrary(request: NativePickRequest): Promise<NativePickOutcome | null> {
  const picker = loadImagePicker();
  if (!picker) {
    return null;
  }
  const permission = await picker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { files: [], denied: true };
  }
  const result = await picker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: !!request.multiple,
    quality: 1,
  });
  if (result.canceled) {
    return { files: [], canceled: true };
  }
  const files: NativePickedFile[] = (result.assets ?? []).map((asset) => {
    const name = asset.fileName || nameFromUri(asset.uri, 'image');
    return {
      name,
      // Android's photo provider omits fileSize; 0 keeps `maxSize` permissive
      // rather than rejecting a file whose size the OS never reported.
      size: asset.fileSize ?? 0,
      type: asset.mimeType || mimeFromName(name),
      uri: asset.uri,
      lastModified: Date.now(),
    };
  });
  return { files };
}

async function pickFromDocuments(request: NativePickRequest): Promise<NativePickOutcome | null> {
  const picker = loadDocumentPicker();
  if (!picker) {
    return null;
  }
  const result = await picker.getDocumentAsync({
    type: acceptToMimeTypes(request.accept) ?? '*/*',
    multiple: !!request.multiple,
    copyToCacheDirectory: true,
  });
  if (result.canceled) {
    return { files: [], canceled: true };
  }
  const files: NativePickedFile[] = (result.assets ?? []).map((asset) => {
    const name = asset.name || nameFromUri(asset.uri, 'file');
    return {
      name,
      size: asset.size ?? 0,
      type: asset.mimeType || mimeFromName(name),
      uri: asset.uri,
      lastModified: asset.lastModified ?? Date.now(),
    };
  });
  return { files };
}

/**
 * Opens the system picker and returns the chosen files.
 *
 * `mode: "auto"` (the default) sends an image-only `accept` to the photo
 * library — the surface a phone user expects for an avatar or a receipt — and
 * everything else to the document browser. Either peer may be missing from a
 * build; the other one is tried before reporting `unavailable`, so a consumer
 * that installed only `expo-document-picker` still gets a working field.
 */
export async function pickFilesNatively(request: NativePickRequest): Promise<NativePickOutcome> {
  const mode = request.mode ?? 'auto';
  const preferImages = mode === 'image' || (mode === 'auto' && isImageOnlyAccept(request.accept));
  const order = preferImages ? [pickFromPhotoLibrary, pickFromDocuments] : [pickFromDocuments, pickFromPhotoLibrary];
  for (const attempt of order) {
    // `mode: "image"` must not silently fall back to the document browser for
    // a DENIED permission — only for a picker that is absent from the build.
    const outcome = await attempt(request);
    if (outcome) {
      return outcome;
    }
  }
  return { files: [], unavailable: true };
}

export type { NativePickedFile, NativePickerMode, NativePickOutcome, NativePickRequest } from './filePickerTypes';
