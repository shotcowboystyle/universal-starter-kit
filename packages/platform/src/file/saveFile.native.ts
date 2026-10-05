import type { Directory, File } from 'expo-file-system';

import { platform } from '../platform';

import { FileSaveError, type FileSaveOptions, type FileSaveResult, prepareFileSave } from './types';

let busy = false;

export async function saveFile(options: FileSaveOptions): Promise<FileSaveResult> {
  const input = prepareFileSave(options);
  if (!platform.isIos && !platform.isAndroid) {
    throw new FileSaveError('unavailable', 'Directory file saving is unavailable on this platform.');
  }
  if (busy) {
    throw new FileSaveError('busy', 'Another file save is in progress.');
  }
  busy = true;
  try {
    let fileSystem: typeof import('expo-file-system');
    try {
      fileSystem = await import('expo-file-system');
      if (typeof fileSystem.Directory?.pickDirectoryAsync !== 'function') {
        throw new Error('The native FileSystem directory picker is unavailable.');
      }
    } catch (cause) {
      throw new FileSaveError('unavailable', 'This native build cannot save files to a directory.', { cause });
    }

    let directory: Directory;
    try {
      directory = await fileSystem.Directory.pickDirectoryAsync();
      const scheme = platform.isAndroid ? 'content://' : 'file://';
      if (!directory.uri.startsWith(scheme) || directory.uri.length <= scheme.length) {
        throw new Error('The picker returned an unsupported directory URI.');
      }
    } catch (cause) {
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        (cause.code === 'ERR_PICKER_CANCELLED' || cause.code === 'ERR_FILE_PICKING_CANCELLED')
      ) {
        // iOS also uses this code when security-scoped directory access is refused.
        return { status: 'not-saved', reason: 'cancelled-or-refused' };
      }
      throw new FileSaveError('picker-failed', 'A writable directory could not be selected.', {
        cause,
      });
    }

    let file: File | undefined;
    try {
      file = directory.createFile(input.filename, input.nativeMimeType);
      const uri = file.uri;
      // Android content URIs can contain opaque IDs instead of provider display names.
      const filename = platform.isIos && uri.startsWith('file://') ? { filename: file.name } : {};
      file.write(input.bytes);
      return {
        status: 'written',
        uri,
        requestedFilename: input.filename,
        ...filename,
        byteLength: input.bytes.byteLength,
      };
    } catch (cause) {
      let cleanupError: unknown;
      try {
        file?.delete();
      } catch (error) {
        cleanupError = error;
      }
      throw new FileSaveError('write-failed', 'The file could not be written.', {
        cause,
        cleanupError,
      });
    }
  } finally {
    busy = false;
  }
}
