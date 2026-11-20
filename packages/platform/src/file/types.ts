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

const isControlCodePoint = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return code < 32 || code === 127;
};

const hasControlCharacters = (value: string): boolean => {
  for (const character of value) {
    if (isControlCodePoint(character)) {
      return true;
    }
  }
  return false;
};

const isSingleFilename = (filename: string): boolean => {
  const isNamed = filename.trim() !== '' && filename !== '.' && filename !== '..';
  return isNamed && !/[/\\]/u.test(filename) && !hasControlCharacters(filename);
};

const isValidInput = (options: FileSaveOptions): boolean => {
  if (options == null || !(options.bytes instanceof Uint8Array)) {
    return false;
  }
  const { filename, mimeType } = options;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- untrusted callers can bypass the declared string types
  const areStrings = typeof filename === 'string' && typeof mimeType === 'string';
  return areStrings && isSingleFilename(filename) && !hasControlCharacters(mimeType);
};

export const prepareFileSave = (options: FileSaveOptions) => {
  if (!isValidInput(options)) {
    throw new FileSaveError('invalid-input', 'Provide bytes, a single filename and a MIME type.');
  }
  const nativeMimeType = options.mimeType.split(';', 1)[0].trim();
  if (!/^[\w!#$%&'*+.^`|~-]+\/[\w!#$%&'*+.^`|~-]+$/u.test(nativeMimeType)) {
    throw new FileSaveError('invalid-input', 'Provide a MIME type with a type and subtype.');
  }
  return {
    bytes: Uint8Array.from(options.bytes),
    filename: options.filename,
    mimeType: options.mimeType,
    nativeMimeType,
  };
};
