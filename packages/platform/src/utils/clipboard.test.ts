import { describe, expect, it, vi, beforeEach } from 'vitest';

import { writeToClipboard } from './clipboard';
import { writeToClipboard as writeNativeClipboard } from './clipboard.native';

const native = vi.hoisted(() => ({
  clipboard: undefined as { setString: (text: string) => void } | undefined,
}));
vi.mock('react-native', () => ({
  get Clipboard() {
    return native.clipboard;
  },
}));

describe('writeToClipboard', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('returns true when clipboard write succeeds', async () => {
    expect(await writeToClipboard('hello')).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when clipboard write fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    expect(await writeToClipboard('hello')).toBe(false);
  });
});

describe('native writeToClipboard', () => {
  it('writes through the existing React Native clipboard and resolves true', async () => {
    const setString = vi.fn();
    native.clipboard = { setString };
    expect(await writeNativeClipboard('native copy proof')).toBe(true);
    expect(setString).toHaveBeenCalledWith('native copy proof');
  });

  it('returns false when native copying throws', async () => {
    native.clipboard = {
      setString: () => {
        throw new Error('Clipboard unavailable');
      },
    };
    expect(await writeNativeClipboard('hello')).toBe(false);
  });

  it('returns false if a future native runtime removes Clipboard', async () => {
    native.clipboard = undefined;
    expect(await writeNativeClipboard('hello')).toBe(false);
  });
});
