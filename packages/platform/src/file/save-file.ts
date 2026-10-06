import { downloadBlob } from '../utils/download-file';

import { FileSaveError, prepareFileSave } from './types';
import type { FileSaveOptions, FileSaveResult } from './types';

const hasDomDownloads = (): boolean =>
  typeof document !== 'undefined' && document.body != null && 'download' in document.createElement('a');

const hasObjectUrls = (): boolean =>
  typeof Blob !== 'undefined' &&
  typeof URL !== 'undefined' &&
  URL.createObjectURL != null &&
  URL.revokeObjectURL != null;

export const saveFile = async (options: FileSaveOptions): Promise<FileSaveResult> => {
  const input = prepareFileSave(options);
  if (!hasDomDownloads() || !hasObjectUrls()) {
    throw new FileSaveError('unavailable', 'Browser file downloads are unavailable.');
  }
  try {
    downloadBlob(new Blob([input.bytes], { type: input.mimeType }), input.filename);
  } catch (error) {
    throw new FileSaveError('write-failed', 'The browser download could not be requested.', {
      cause: error,
    });
  }
  return { status: 'download-requested' };
};
