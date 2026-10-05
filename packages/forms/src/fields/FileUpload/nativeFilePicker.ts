import type { NativePickOutcome, NativePickRequest } from './filePickerTypes';

/**
 * Web twin of the native file picker (`nativeFilePicker.native.ts`). The web
 * field opens a real `<input type="file">`, so this half exists only to keep
 * `index.tsx` free of a platform branch at import time.
 */
export function isNativeFilePickerAvailable(): boolean {
  return false;
}

export async function pickFilesNatively(_request: NativePickRequest): Promise<NativePickOutcome> {
  return { files: [], unavailable: true };
}

export type { NativePickedFile, NativePickerMode, NativePickOutcome, NativePickRequest } from './filePickerTypes';
