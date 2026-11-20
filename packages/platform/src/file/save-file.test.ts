import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { FileSaveError, saveFile } from './index';

const options = () => ({
  bytes: new Uint8Array([0, 255, 13, 10]),
  filename: 'café.bin',
  mimeType: 'application/octet-stream',
});

describe('web byte save', () => {
  let click: MockInstance<HTMLAnchorElement['click']>;
  let createObjectURL: MockInstance<(typeof URL)['createObjectURL']>;
  let revokeObjectURL: MockInstance<(typeof URL)['revokeObjectURL']>;

  beforeEach(() => {
    vi.useFakeTimers();
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      // intentionally empty: no navigation under test
    });
    createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
    revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
      // intentionally empty: nothing to release under test
    });
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests a download with the exact byte view and filename', async () => {
    const input = options();
    input.bytes = new Uint8Array([99, 0, 255, 13, 10, 88]).subarray(1, 5);
    click.mockImplementation(function assertAnchor(this: HTMLAnchorElement) {
      expect(this.download).toBe('café.bin');
    });
    const result = saveFile(input);
    input.bytes.fill(7);
    await expect(result).resolves.toStrictEqual({ status: 'download-requested' });
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect([...new Uint8Array(await blob.arrayBuffer())]).toStrictEqual([0, 255, 13, 10]);
    expect(blob.type).toBe('application/octet-stream');
    expect(click).toHaveBeenCalledOnce();
  });

  it('preserves UTF-8 bytes and MIME parameters, including an empty file', async () => {
    const bytes = new TextEncoder().encode('café ☕\n');
    await saveFile({ ...options(), bytes, mimeType: 'text/plain; charset=utf-8' });
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toBe('café ☕\n');
    expect(blob.type).toBe('text/plain; charset=utf-8');
    await saveFile({ ...options(), bytes: new Uint8Array() });
    expect((createObjectURL.mock.calls[1][0] as Blob).size).toBe(0);
  });

  it.each(['', '  ', '.', '..', 'a/b', 'a\\b', 'a\u0000b', 'a\nb', 'a\u007Fb'])(
    'rejects filename %j before allocating resources',
    async (filename) => {
      await expect(saveFile({ ...options(), filename })).rejects.toMatchObject({
        code: 'invalid-input',
      });
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'text', 'text/', 'text /plain', 'text/plain\n'])('rejects invalid MIME %j', async (mimeType) => {
    await expect(saveFile({ ...options(), mimeType })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it.each([null, {}, { ...options(), bytes: [1, 2] }])('rejects malformed input %j', async (input) => {
    await expect(saveFile(input as never)).rejects.toBeInstanceOf(FileSaveError);
    await expect(saveFile(input as never)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it.each(['document', 'Blob', 'URL'])('reports an unavailable %s capability', async (capability) => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- stubbing the global to undefined is how the capability is removed
    vi.stubGlobal(capability, undefined);
    await expect(saveFile(options())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('reports activation failure with its original cause and cleans resources', async () => {
    const cause = new Error('download refused');
    click.mockImplementation(() => {
      throw cause;
    });
    await expect(saveFile(options())).rejects.toMatchObject({ code: 'write-failed', cause });
    expect(document.querySelector('a')).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
  });
});
