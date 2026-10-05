import { downloadBlob } from '../utils/downloadFile';

import { FileSaveError, type FileSaveOptions, type FileSaveResult, prepareFileSave } from './types';

export async function saveFile(options: FileSaveOptions): Promise<FileSaveResult> {
  const input = prepareFileSave(options);
  if (
    typeof document === 'undefined' ||
    !document.body ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function' ||
    !('download' in document.createElement('a'))
  ) {
    throw new FileSaveError('unavailable', 'Browser file downloads are unavailable.');
  }
  try {
    downloadBlob(new Blob([input.bytes], { type: input.mimeType }), input.filename);
  } catch (cause) {
    throw new FileSaveError('write-failed', 'The browser download could not be requested.', {
      cause,
    });
  }
  return { status: 'download-requested' };
}
