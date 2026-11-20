import { describe, expect, it, vi, beforeEach } from 'vitest';

import { writeToClipboard } from './clipboard';
import { writeToClipboard as writeNativeClipboard } from './clipboard.native';

interface ClipboardStub {
  getString: () => Promise<string>;
  setString: (content: string) => void;
}

const native = vi.hoisted(() => ({
  clipboard: null as ClipboardStub | null,
}));
vi.mock(import('react-native'), () => ({
  get Clipboard() {
    return native.clipboard as never;
  },
}));

describe(writeToClipboard, () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });

  it('returns true when clipboard write succeeds', async () => {
    await expect(writeToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when clipboard write fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied')),
      },
    });
    await expect(writeToClipboard('hello')).resolves.toBe(false);
  });
});

describe('native writeToClipboard', () => {
  it('writes through the existing React Native clipboard and resolves true', async () => {
    const setString = vi.fn<(text: string) => void>();
    native.clipboard = { setString, getString: vi.fn<() => Promise<string>>() };
    await expect(writeNativeClipboard('native copy proof')).resolves.toBe(true);
    expect(setString).toHaveBeenCalledWith('native copy proof');
  });

  it('returns false when native copying throws', async () => {
    native.clipboard = {
      getString: vi.fn<() => Promise<string>>(),
      setString: vi.fn<(text: string) => void>(() => {
        throw new Error('Clipboard unavailable');
      }),
    };
    await expect(writeNativeClipboard('hello')).resolves.toBe(false);
  });

  it('returns false if a future native runtime removes Clipboard', async () => {
    native.clipboard = null;
    await expect(writeNativeClipboard('hello')).resolves.toBe(false);
  });
});
