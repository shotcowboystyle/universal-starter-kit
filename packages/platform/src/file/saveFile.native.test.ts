import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: { isIos: false, isAndroid: true },
  pick: vi.fn(),
  loaded: vi.fn(),
}));
vi.mock('../platform', () => ({ platform: native.platform }));

describe('native byte save (native boundary modeled)', () => {
  const options = () => ({
    bytes: new Uint8Array([0, 255, 13, 10]),
    filename: 'café.bin',
    mimeType: 'application/octet-stream; charset=binary',
  });
  let file: {
    uri: string;
    name: string;
    write: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let directory: {
    uri: string;
    createFile: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('expo-file-system', () => {
      native.loaded();
      return { Directory: { pickDirectoryAsync: native.pick } };
    });
    vi.clearAllMocks();
    native.platform.isIos = false;
    native.platform.isAndroid = true;
    file = {
      uri: 'content://provider/child-42',
      name: 'café (1).bin',
      write: vi.fn(),
      delete: vi.fn(),
    };
    directory = {
      uri: 'content://provider/tree/selected',
      createFile: vi.fn(() => file),
      delete: vi.fn(),
    };
    native.pick.mockReset().mockResolvedValue(directory);
  });
  const api = () => import('./saveFile.native');

  it('loads FileSystem only on invocation and writes the exact snapshot to the provider child', async () => {
    const { saveFile } = await api();
    expect(native.loaded).not.toHaveBeenCalled();
    let choose!: (value: typeof directory) => void;
    native.pick.mockReturnValue(
      new Promise((resolve) => {
        choose = resolve;
      }),
    );
    const input = options();
    input.bytes = new Uint8Array([99, 0, 255, 13, 10, 88]).subarray(1, 5);
    const pending = saveFile(input);
    input.bytes.fill(8);
    input.filename = 'changed-after-request.bin';
    await vi.waitFor(() => {
      expect(native.pick).toHaveBeenCalledOnce();
    });
    choose(directory);
    await expect(pending).resolves.toEqual({
      status: 'written',
      uri: file.uri,
      requestedFilename: 'café.bin',
      byteLength: 4,
    });
    expect(directory.createFile).toHaveBeenCalledExactlyOnceWith('café.bin', 'application/octet-stream');
    expect(Array.from(file.write.mock.calls[0][0])).toEqual([0, 255, 13, 10]);
    expect(file.delete).not.toHaveBeenCalled();
    expect(directory.delete).not.toHaveBeenCalled();
  });

  it('reports the iOS file-URI name separately from the requested name, including empty files', async () => {
    native.platform.isIos = true;
    native.platform.isAndroid = false;
    directory.uri = 'file:///selected/';
    file.uri = 'file:///selected/caf%C3%A9%20(1).bin';
    const { saveFile } = await api();
    await expect(saveFile({ ...options(), bytes: new Uint8Array() })).resolves.toEqual({
      status: 'written',
      uri: file.uri,
      requestedFilename: 'café.bin',
      filename: 'café (1).bin',
      byteLength: 0,
    });
    expect(file.write).toHaveBeenCalledWith(new Uint8Array());
    expect(file.delete).not.toHaveBeenCalled();
  });

  it('omits an opaque Android document ID without reading it as a filename', async () => {
    file.uri = 'content://example.documents/tree/root/document/42';
    const readName = vi.fn(() => '42');
    Object.defineProperty(file, 'name', { get: readName });
    const input = { ...options(), filename: 'fixture.bin' };
    const { saveFile } = await api();
    await expect(saveFile(input)).resolves.toEqual({
      status: 'written',
      uri: file.uri,
      requestedFilename: 'fixture.bin',
      byteLength: 4,
    });
    expect(readName).not.toHaveBeenCalled();
    expect(directory.createFile).toHaveBeenCalledExactlyOnceWith('fixture.bin', 'application/octet-stream');
    expect(file.write).toHaveBeenCalledExactlyOnceWith(new Uint8Array([0, 255, 13, 10]));
    expect(file.delete).not.toHaveBeenCalled();
    expect(directory.delete).not.toHaveBeenCalled();
  });

  it('only reports an iOS filename when the created file has a file URI', async () => {
    native.platform.isIos = true;
    native.platform.isAndroid = false;
    directory.uri = 'file:///selected/';
    const readName = vi.fn(() => 'child-42');
    Object.defineProperty(file, 'name', { get: readName });
    const { saveFile } = await api();
    await expect(saveFile(options())).resolves.toEqual({
      status: 'written',
      uri: file.uri,
      requestedFilename: 'café.bin',
      byteLength: 4,
    });
    expect(readName).not.toHaveBeenCalled();
    expect(file.write).toHaveBeenCalledOnce();
    expect(file.delete).not.toHaveBeenCalled();
  });

  it.each(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED'])(
    'reports %s as not saved without inventing cancel/refusal distinction',
    async (code) => {
      const { saveFile } = await api();
      native.pick.mockRejectedValueOnce({ code });
      await expect(saveFile(options())).resolves.toEqual({
        status: 'not-saved',
        reason: 'cancelled-or-refused',
      });
      expect(directory.createFile).not.toHaveBeenCalled();
      expect(file.write).not.toHaveBeenCalled();
      await expect(saveFile(options())).resolves.toMatchObject({ status: 'written' });
      expect(file.write).toHaveBeenCalledOnce();
    },
  );

  it.each([{ code: 'ERR_ACCESS_DENIED' }, new Error('User cancelled'), { code: 'ERR_PICKER_CANCELLED_EXTRA' }])(
    'preserves non-cancellation picker failures: %j',
    async (cause) => {
      native.pick.mockRejectedValue(cause);
      const { saveFile } = await api();
      await expect(saveFile(options())).rejects.toMatchObject({ code: 'picker-failed', cause });
      expect(directory.createFile).not.toHaveBeenCalled();
    },
  );

  it('rejects overlapping requests and accepts a retry once the picker settles', async () => {
    let choose!: (value: typeof directory) => void;
    native.pick.mockReturnValueOnce(
      new Promise((resolve) => {
        choose = resolve;
      }),
    );
    const { saveFile } = await api();
    const first = saveFile(options());
    await expect(saveFile(options())).rejects.toMatchObject({ code: 'busy' });
    await vi.waitFor(() => {
      expect(native.pick).toHaveBeenCalledOnce();
    });
    choose(directory);
    await expect(first).resolves.toMatchObject({ status: 'written' });
    await expect(saveFile(options())).resolves.toMatchObject({ status: 'written' });
  });

  it('rejects invalid inputs before loading native code or opening the picker', async () => {
    const { saveFile } = await api();
    await expect(saveFile({ ...options(), filename: '../escape' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(native.loaded).not.toHaveBeenCalled();
    expect(native.pick).not.toHaveBeenCalled();
  });

  it.each(['file:///private/not-saf', 'https://example.test', ''])(
    'refuses unexpected Android directory URI %j',
    async (uri) => {
      directory.uri = uri;
      const { saveFile } = await api();
      await expect(saveFile(options())).rejects.toMatchObject({ code: 'picker-failed' });
      expect(directory.createFile).not.toHaveBeenCalled();
    },
  );

  it('refuses unsupported native hosts before loading FileSystem', async () => {
    native.platform.isAndroid = false;
    const { saveFile } = await api();
    await expect(saveFile(options())).rejects.toMatchObject({ code: 'unavailable' });
    expect(native.loaded).not.toHaveBeenCalled();
  });

  it('does not delete anything when creation or a duplicate name is refused', async () => {
    const cause = new Error('already exists');
    directory.createFile.mockImplementation(() => {
      throw cause;
    });
    const { saveFile } = await api();
    await expect(saveFile(options())).rejects.toMatchObject({ code: 'write-failed', cause });
    expect(file.write).not.toHaveBeenCalled();
    expect(file.delete).not.toHaveBeenCalled();
    expect(directory.delete).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'deletes only its new child on write failure and preserves cleanup failure (%s)',
    async (cleanupFails) => {
      const cause = new Error('storage full');
      const cleanupError = new Error('delete refused');
      file.write.mockImplementationOnce(() => {
        throw cause;
      });
      if (cleanupFails) {
        file.delete.mockImplementation(() => {
          throw cleanupError;
        });
      }
      const { saveFile } = await api();
      await expect(saveFile(options())).rejects.toMatchObject({
        code: 'write-failed',
        cause,
        cleanupError: cleanupFails ? cleanupError : undefined,
      });
      expect(file.write).toHaveBeenCalledOnce();
      expect(file.delete).toHaveBeenCalledOnce();
      expect(directory.delete).not.toHaveBeenCalled();
      await expect(saveFile(options())).resolves.toMatchObject({ status: 'written' });
      expect(file.delete).toHaveBeenCalledOnce();
    },
  );
});
