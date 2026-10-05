import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptToMimeTypes,
  isImageOnlyAccept,
  isNativeFilePickerAvailable,
  pickFilesNatively,
} from './nativeFilePicker.native';
import { loadDocumentPicker, loadImagePicker } from './nativePickerLoader';

// The optional-peer loaders are the mock seam: on-device they try/catch-require
// the pickers (Metro optional dependencies); here the modules are swapped
// wholesale, the same way GeolocationMap.native.spec mocks `expoMapsLoader`.
vi.mock('./nativePickerLoader', () => ({
  loadDocumentPicker: vi.fn(() => null),
  loadImagePicker: vi.fn(() => null),
}));

const loadDocumentPickerMock = vi.mocked(loadDocumentPicker);
const loadImagePickerMock = vi.mocked(loadImagePicker);

const getDocumentAsync = vi.fn();
const launchImageLibraryAsync = vi.fn();
const requestMediaLibraryPermissionsAsync = vi.fn();

function withDocumentPicker() {
  loadDocumentPickerMock.mockReturnValue({ getDocumentAsync } as never);
}

function withImagePicker() {
  loadImagePickerMock.mockReturnValue({
    launchImageLibraryAsync,
    requestMediaLibraryPermissionsAsync,
  } as never);
}

beforeEach(() => {
  loadDocumentPickerMock.mockReset().mockReturnValue(null);
  loadImagePickerMock.mockReset().mockReturnValue(null);
  getDocumentAsync.mockReset();
  launchImageLibraryAsync.mockReset();
  requestMediaLibraryPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
});

describe('acceptToMimeTypes', () => {
  it('passes MIME entries through and drops extension entries', () => {
    expect(acceptToMimeTypes('image/png, .pdf ,application/json')).toEqual(['image/png', 'application/json']);
  });

  it('returns undefined when accept is absent or extension-only', () => {
    expect(acceptToMimeTypes()).toBeUndefined();
    expect(acceptToMimeTypes('.pdf,.docx')).toBeUndefined();
  });
});

describe('isImageOnlyAccept', () => {
  it('is true only when every entry is an image', () => {
    expect(isImageOnlyAccept('image/*')).toBe(true);
    expect(isImageOnlyAccept('image/png,.jpg')).toBe(true);
    expect(isImageOnlyAccept('image/png,application/pdf')).toBe(false);
    expect(isImageOnlyAccept()).toBe(false);
  });
});

describe('isNativeFilePickerAvailable', () => {
  it('is false with neither peer and true with either', () => {
    expect(isNativeFilePickerAvailable()).toBe(false);
    withDocumentPicker();
    expect(isNativeFilePickerAvailable()).toBe(true);
  });
});

describe('pickFilesNatively', () => {
  it('reports unavailable when no picker is linked into the build', async () => {
    await expect(pickFilesNatively({})).resolves.toEqual({ files: [], unavailable: true });
  });

  it('maps document assets onto the FormData-ready shape', async () => {
    withDocumentPicker();
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          name: 'report.pdf',
          size: 2048,
          uri: 'file:///tmp/report.pdf',
          mimeType: 'application/pdf',
          lastModified: 42,
        },
      ],
    });

    const outcome = await pickFilesNatively({ accept: 'application/pdf,.pdf', multiple: true });

    expect(getDocumentAsync).toHaveBeenCalledWith({
      type: ['application/pdf'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    expect(outcome.files).toEqual([
      {
        name: 'report.pdf',
        size: 2048,
        type: 'application/pdf',
        uri: 'file:///tmp/report.pdf',
        lastModified: 42,
      },
    ]);
  });

  it('routes an image-only accept to the photo library', async () => {
    withDocumentPicker();
    withImagePicker();
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/IMG_0001.HEIC', fileSize: 900 }],
    });

    const outcome = await pickFilesNatively({ accept: 'image/*' });

    expect(getDocumentAsync).not.toHaveBeenCalled();
    expect(launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    // Android providers omit fileName and mimeType; both are derived from the
    // URI so an accept="image/*" field does not reject its own pick.
    expect(outcome.files).toEqual([
      {
        name: 'IMG_0001.HEIC',
        size: 900,
        type: 'image/heic',
        uri: 'file:///tmp/IMG_0001.HEIC',
        lastModified: expect.any(Number),
      },
    ]);
  });

  it('reports a denied photo permission instead of falling back to documents', async () => {
    withDocumentPicker();
    withImagePicker();
    requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    const outcome = await pickFilesNatively({ accept: 'image/*' });

    expect(outcome).toEqual({ files: [], denied: true });
    expect(getDocumentAsync).not.toHaveBeenCalled();
  });

  it('falls back to the document browser when only that peer is installed', async () => {
    withDocumentPicker();
    getDocumentAsync.mockResolvedValue({ canceled: true });

    const outcome = await pickFilesNatively({ accept: 'image/*', mode: 'image' });

    expect(getDocumentAsync).toHaveBeenCalled();
    expect(outcome).toEqual({ files: [], canceled: true });
  });

  it('treats a dismissed picker as a no-op', async () => {
    withDocumentPicker();
    getDocumentAsync.mockResolvedValue({ canceled: true });
    await expect(pickFilesNatively({})).resolves.toEqual({ files: [], canceled: true });
  });
});
