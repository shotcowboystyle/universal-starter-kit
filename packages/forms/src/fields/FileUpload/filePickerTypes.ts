/**
 * Shared contract for the platform-split file picker
 * (`nativeFilePicker.ts` web / `nativeFilePicker.native.ts`). Lives in its own
 * file (Geolocation `mapTypes.ts` precedent) so the twins cannot drift apart.
 */

/**
 * A file chosen through a native picker. The shape is deliberately the one
 * React Native's `FormData` accepts for a multipart upload
 * (`{ uri, name, type }`), so a bound value can be posted without a second
 * conversion. `size`/`type` may be absent from the OS response — the picker
 * fills 0 / "" rather than leaving them undefined, because the field's own
 * validators read both.
 */
export interface NativePickedFile {
  name: string;
  size: number;
  type: string;
  /** `file://` (or content://) URI of the picked asset on the device. */
  uri: string;
  lastModified: number;
}

/** Which native surface to open. `auto` reads `accept` (see `pickFilesNatively`). */
export type NativePickerMode = 'auto' | 'document' | 'image';

export interface NativePickRequest {
  /** Same `accept` string the web `<input type="file">` gets, e.g. "image/*,.pdf". */
  accept?: string;
  multiple?: boolean;
  mode?: NativePickerMode;
}

export interface NativePickOutcome {
  files: NativePickedFile[];
  /** The user dismissed the picker. Not an error — leave the field untouched. */
  canceled?: boolean;
  /** No native picker module is linked into this build (peer not installed). */
  unavailable?: boolean;
  /** The OS refused the photo-library permission. */
  denied?: boolean;
}
