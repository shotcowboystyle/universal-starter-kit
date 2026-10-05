import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { copyToClipboard, useClipboard } from './useClipboard';

import { useAssets } from './index';

const mockWriteText = vi.fn();
const mockClipboard = { writeText: mockWriteText };
vi.stubGlobal('navigator', {
  ...(typeof navigator !== 'undefined' ? navigator : {}),
  clipboard: mockClipboard,
});

describe('useClipboard', () => {
  beforeEach(() => {
    mockWriteText.mockClear();
    vi.useFakeTimers();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.value).toBe('');
    expect(result.current.hasCopied).toBe(false);
  });

  it('should initialize with custom text', () => {
    const testText = 'test text';
    const { result } = renderHook(() => useClipboard(testText));
    expect(result.current.value).toBe(testText);
  });

  it('should copy text and set hasCopied to true', async () => {
    const testText = 'test text';
    mockWriteText.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useClipboard(testText));
    await act(async () => {
      await result.current.onCopy();
    });
    expect(mockWriteText).toHaveBeenCalledWith(testText);
    expect(result.current.hasCopied).toBe(true);
  });

  it('should reset hasCopied after timeout', async () => {
    const testText = 'test text';
    const timeout = 1500;
    mockWriteText.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useClipboard(testText, { timeout }));
    await act(async () => {
      await result.current.onCopy();
    });
    expect(result.current.hasCopied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(timeout);
    });
    expect(result.current.hasCopied).toBe(false);
  });

  it('should use custom timeout', async () => {
    const testText = 'test text';
    const customTimeout = 3000;
    mockWriteText.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useClipboard(testText, { timeout: customTimeout }));
    await act(async () => {
      await result.current.onCopy();
    });
    expect(result.current.hasCopied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.hasCopied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.hasCopied).toBe(false);
  });

  it('should not claim success when the clipboard write is denied', async () => {
    const testText = 'test text';
    mockWriteText.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { result } = renderHook(() => useClipboard(testText));
    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.onCopy();
    });
    expect(success).toBe(false);
    expect(result.current.hasCopied).toBe(false);
    expect(result.current.hasCopyFailed).toBe(true);
  });

  it('should reset hasCopyFailed after timeout', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { result } = renderHook(() => useClipboard('x', { timeout: 1500 }));
    await act(async () => {
      await result.current.onCopy();
    });
    expect(result.current.hasCopyFailed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.hasCopyFailed).toBe(false);
  });
});

describe('copyToClipboard', () => {
  it('should call navigator.clipboard.writeText with provided text', async () => {
    const testText = 'test text';
    mockWriteText.mockResolvedValueOnce(undefined);
    await copyToClipboard(testText);
    expect(mockWriteText).toHaveBeenCalledWith(testText);
  });
});

describe('useAssets', () => {
  it('should return an array with a single module when passed a single module', () => {
    const mockModule = { default: 'mockedImage' };
    const { result } = renderHook(() => useAssets([mockModule]));
    expect(result.current).toEqual([mockModule.default]);
  });

  it('should return an array with the modules when passed an array of modules', () => {
    const mockModule1 = { default: 'mockedImage1' };
    const mockModule2 = { default: 'mockedImage2' };
    const { result } = renderHook(() => useAssets([mockModule1, mockModule2]));
    expect(result.current).toEqual([mockModule1.default, mockModule2.default]);
  });

  it('should return an empty array when no modules are provided', () => {
    const { result } = renderHook(() => useAssets([]));
    expect(result.current).toEqual([]);
  });

  it('should return an array of undefined if an empty module is passed', () => {
    const result = useAssets([]);
    expect(result).toEqual([]);
  });

  it('should return a single module with a default property', () => {
    const result = useAssets([{ default: 'image1' }]);
    expect(result).toEqual(['image1']);
  });

  it('should return a single module without a default property', () => {
    const result = useAssets(['image3']);
    expect(result).toEqual(['image3']);
  });

  it('should return an array of modules with default properties', () => {
    const result = useAssets([{ default: 'image1' }, { default: 'image2' }]);
    expect(result).toEqual(['image1', 'image2']);
  });

  it('should return an array of modules without default properties', () => {
    const result = useAssets(['image3', { name: 'image4' }]);
    expect(result).toEqual(['image3', { name: 'image4' }]);
  });

  it('should handle an empty array and return an empty array', () => {
    const result = useAssets([]);
    expect(result).toEqual([]);
  });

  it('should return an array with a mix of valid and invalid modules', () => {
    const result = useAssets([{ default: 'image1' }, 'image3', { name: 'image4' }]);
    expect(result).toEqual(['image1', 'image3', { name: 'image4' }]);
  });
});
