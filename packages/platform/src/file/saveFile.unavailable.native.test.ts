import { expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  loaded: vi.fn(),
  cause: new Error('Native FileSystem is absent'),
}));
vi.mock('../platform', () => ({ platform: { isAndroid: true, isIos: false } }));
vi.mock('expo-file-system', () => {
  boundary.loaded();
  throw boundary.cause;
});

it('keeps a missing native module out of import-time execution and rejects invocation', async () => {
  const { saveFile } = await import('./saveFile.native');
  expect(boundary.loaded).not.toHaveBeenCalled();
  const input = {
    bytes: new Uint8Array([42]),
    filename: 'fixture.bin',
    mimeType: 'application/octet-stream',
  };
  await expect(saveFile(input)).rejects.toMatchObject({ code: 'unavailable' });
  expect(boundary.loaded).toHaveBeenCalledOnce();
  await expect(saveFile(input)).rejects.toMatchObject({ code: 'unavailable' });
});
