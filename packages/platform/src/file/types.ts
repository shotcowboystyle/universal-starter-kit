export interface FileSaveOptions {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface WrittenFile {
  status: 'written';
  uri: string;
  requestedFilename: string;
  filename?: string;
  byteLength: number;
}

export type FileSaveResult =
  | WrittenFile
  | { status: 'download-requested' }
  | { status: 'not-saved'; reason: 'cancelled-or-refused' };

export type FileSaveErrorCode = 'invalid-input' | 'unavailable' | 'busy' | 'picker-failed' | 'write-failed';

export class FileSaveError extends Error {
  readonly code: FileSaveErrorCode;
  readonly cleanupError?: unknown;

  constructor(code: FileSaveErrorCode, message: string, options?: { cause?: unknown; cleanupError?: unknown }) {
    super(message, options);
    this.name = 'FileSaveError';
    this.code = code;
    this.cleanupError = options?.cleanupError;
  }
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function prepareFileSave(options: FileSaveOptions) {
  if (
    !options ||
    !(options.bytes instanceof Uint8Array) ||
    typeof options.filename !== 'string' ||
    !options.filename.trim() ||
    options.filename === '.' ||
    options.filename === '..' ||
    /[/\\]/.test(options.filename) ||
    hasControlCharacters(options.filename) ||
    typeof options.mimeType !== 'string' ||
    hasControlCharacters(options.mimeType)
  ) {
    throw new FileSaveError('invalid-input', 'Provide bytes, a single filename and a MIME type.');
  }
  const nativeMimeType = options.mimeType.split(';', 1)[0].trim();
  if (!/^[\w!#$%&'*+.^`|~-]+\/[\w!#$%&'*+.^`|~-]+$/.test(nativeMimeType)) {
    throw new FileSaveError('invalid-input', 'Provide a MIME type with a type and subtype.');
  }
  return {
    bytes: Uint8Array.from(options.bytes),
    filename: options.filename,
    mimeType: options.mimeType,
    nativeMimeType,
  };
}
