import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob, downloadFile } from './downloadFile';

describe('synchronous download helpers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('activates the named URL and returns void synchronously', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.href).toBe('https://example.test/file');
      expect(this.download).toBe('café.txt');
    });
    expect(downloadFile('https://example.test/file', 'café.txt')).toBeUndefined();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();
  });

  it('removes the anchor when activation throws', () => {
    const failure = new Error('activation refused');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw failure;
    });
    expect(() => {
      downloadFile('https://example.test/file', 'file.txt');
    }).toThrow(failure);
    expect(document.querySelector('a')).toBeNull();
  });

  it.each([false, true])('releases a Blob URL after activation, even if it throws (%s)', (throws) => {
    const blob = new Blob(['fixture']);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      expect(revoke).not.toHaveBeenCalled();
      if (throws) {
        throw new Error('activation refused');
      }
    });
    if (throws) {
      expect(() => {
        downloadBlob(blob, 'fixture.txt');
      }).toThrow('activation refused');
    } else {
      expect(downloadBlob(blob, 'fixture.txt')).toBeUndefined();
    }
    expect(create).toHaveBeenCalledWith(blob);
    expect(document.querySelector('a')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:fixture');
  });
});
