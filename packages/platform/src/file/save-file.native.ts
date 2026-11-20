import type { Directory, File } from 'expo-file-system';

import { platform } from '../platform';

import { FileSaveError, prepareFileSave } from './types';
import type { FileSaveOptions, FileSaveResult } from './types';

let busy = false;

const pickerCancelledCodes: ReadonlySet<unknown> = new Set(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED']);

const isPickerCancelled = (error: unknown): error is { code: unknown } =>
  typeof error === 'object' && error !== null && 'code' in error && pickerCancelledCodes.has(error.code);

const loadFileSystem = async () => {
  try {
    const fileSystem = await import('expo-file-system');
    if (fileSystem.Directory?.pickDirectoryAsync == null) {
      throw new TypeError('The native FileSystem directory picker is unavailable.');
    }
    return fileSystem;
  } catch (error) {
    throw new FileSaveError('unavailable', 'This native build cannot save files to a directory.', { cause: error });
  }
};

const pickWritableDirectory = async (fileSystem: Awaited<ReturnType<typeof loadFileSystem>>) => {
  try {
    const directory = await fileSystem.Directory.pickDirectoryAsync();
    const scheme = platform.isAndroid ? 'content://' : 'file://';
    if (!directory.uri.startsWith(scheme) || directory.uri.length <= scheme.length) {
      throw new Error('The picker returned an unsupported directory URI.');
    }
    return directory;
  } catch (error) {
    if (isPickerCancelled(error)) {
      // iOS also uses this code when security-scoped directory access is refused.
      return null;
    }
    throw new FileSaveError('picker-failed', 'A writable directory could not be selected.', {
      cause: error,
    });
  }
};

const writeIntoDirectory = (directory: Directory, input: ReturnType<typeof prepareFileSave>): FileSaveResult => {
  let file: File | undefined;
  try {
    file = directory.createFile(input.filename, input.nativeMimeType);
    const { uri } = file;
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
  } catch (error) {
    let cleanupError: unknown;
    try {
      file?.delete();
    } catch (deleteError) {
      cleanupError = deleteError;
    }
    throw new FileSaveError('write-failed', 'The file could not be written.', {
      cause: error,
      cleanupError,
    });
  }
};

export const saveFile = async (options: FileSaveOptions): Promise<FileSaveResult> => {
  const input = prepareFileSave(options);
  if (!platform.isIos && !platform.isAndroid) {
    throw new FileSaveError('unavailable', 'Directory file saving is unavailable on this platform.');
  }
  if (busy) {
    throw new FileSaveError('busy', 'Another file save is in progress.');
  }
  busy = true;
  try {
    const fileSystem = await loadFileSystem();
    const directory = await pickWritableDirectory(fileSystem);
    if (directory === null) {
      return { status: 'not-saved', reason: 'cancelled-or-refused' };
    }
    return writeIntoDirectory(directory, input);
  } finally {
    busy = false;
  }
};
