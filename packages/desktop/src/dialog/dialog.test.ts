import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

import { dialog } from './index';

describe('dialog web stubs', () => {
  let alertFn: Mock<typeof window.alert>;
  let confirmFn: Mock<typeof window.confirm>;
  let promptFn: Mock<typeof window.prompt>;

  beforeEach(() => {
    alertFn = vi.fn<typeof window.alert>();
    confirmFn = vi.fn<typeof window.confirm>().mockReturnValue(true);
    promptFn = vi.fn<typeof window.prompt>().mockReturnValue('typed');
    vi.stubGlobal('alert', alertFn);
    vi.stubGlobal('confirm', confirmFn);
    vi.stubGlobal('prompt', promptFn);
    window.alert = alertFn;
    window.confirm = confirmFn;
    window.prompt = promptFn;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('open', () => {
    it('returns null', async () => {
      await expect(dialog.open()).resolves.toBeNull();
    });

    it('returns null with options', async () => {
      await expect(dialog.open({ title: 'Open', multiple: true })).resolves.toBeNull();
    });
  });

  describe('save', () => {
    it('returns null', async () => {
      await expect(dialog.save()).resolves.toBeNull();
    });
  });

  describe('message', () => {
    it('calls window.alert with the message', async () => {
      await dialog.message('Hello');
      expect(alertFn).toHaveBeenCalledWith('Hello');
    });

    it('prepends title when provided', async () => {
      await dialog.message('Body', { title: 'Title' });
      expect(alertFn).toHaveBeenCalledWith('Title\n\nBody');
    });
  });

  describe('ask', () => {
    it('calls window.confirm and returns the result', async () => {
      confirmFn.mockReturnValue(true);
      await expect(dialog.ask('Continue?')).resolves.toBe(true);
      expect(confirmFn).toHaveBeenCalledWith('Continue?');
    });

    it('returns false when user cancels', async () => {
      confirmFn.mockReturnValue(false);
      await expect(dialog.ask('Sure?')).resolves.toBe(false);
    });

    it('prepends title when provided', async () => {
      confirmFn.mockReturnValue(true);
      await dialog.ask('Question?', { title: 'Important' });
      expect(confirmFn).toHaveBeenCalledWith('Important\n\nQuestion?');
    });
  });

  describe('confirm', () => {
    it('calls window.confirm', async () => {
      confirmFn.mockReturnValue(true);
      await expect(dialog.confirm('Delete?')).resolves.toBe(true);
    });
  });

  describe('prompt', () => {
    it('calls window.prompt with message and default value', async () => {
      promptFn.mockReturnValue('typed');
      const result = await dialog.prompt('Enter name:', 'default');
      expect(promptFn).toHaveBeenCalledWith('Enter name:', 'default');
      expect(result).toBe('typed');
    });

    it('returns null when user cancels', async () => {
      promptFn.mockReturnValue(null);
      await expect(dialog.prompt('Enter:')).resolves.toBeNull();
    });
  });
});

/**
 * GJS's `window` is a react-gnome polyfill stub with none of the modal
 * globals on it. Reproduce that shape rather than deleting `window`, because
 * `typeof window !== "undefined"` is true on GNOME and a guard written only
 * against a missing `window` would sail straight past it.
 */
describe('dialog defaults on a platform with no modal globals (GJS)', () => {
  beforeEach(() => {
    for (const name of ['alert', 'confirm', 'prompt'] as const) {
      vi.stubGlobal(name, null);
      Reflect.deleteProperty(window, name);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still has a window, exactly as GNOME does', () => {
    expect(window).not.toBeTypeOf('undefined');
  });

  it.each([
    [
      'message',
      async () => {
        await dialog.message('hi');
      },
    ],
    ['ask', async () => await dialog.ask('sure?')],
    ['confirm', async () => await dialog.confirm('delete?')],
    ['prompt', async () => await dialog.prompt('name?')],
  ])('dialog.%s rejects instead of throwing a bare TypeError', async (api, call) => {
    await expect(call()).rejects.toThrow(new RegExp(`dialog\\.${api} needs window\\.(?:alert|confirm|prompt)`, 'u'));
  });

  it('names the package and points at the GNOME backend that would fix it', async () => {
    await expect(dialog.confirm('delete?')).rejects.toThrow(/@repo\/desktop/u);
    await expect(dialog.confirm('delete?')).rejects.toThrow(/index\.gnome\.ts/u);
  });

  it('leaves open and save working, since their default is an honest null', async () => {
    await expect(dialog.open()).resolves.toBeNull();
    await expect(dialog.save()).resolves.toBeNull();
  });
});
