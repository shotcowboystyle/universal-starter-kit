import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssets as useAssetsNative } from './index.native';

import { useAssets as useAssetsWeb } from './index';

vi.mock('react-native/Libraries/Utilities/Platform', () => ({
  default: {
    select: (obj: any) => obj.native,
  },
}));

vi.mock('expo-asset', () => ({
  useAssets: vi.fn().mockImplementation((modules) => {
    return [
      modules
        ? modules.map((_m: any) => ({
            height: 100,
            width: 200,
            uri: 'mock-asset-uri',
          }))
        : [],
      null,
    ];
  }),
}));

describe('useAssets (Web)', () => {
  it('should handle single module input', () => {
    const mockModule = {
      default: { src: 'test.jpg', width: 100, height: 100 },
    };
    const { result } = renderHook(() => useAssetsWeb([mockModule]));
    expect(result.current).toEqual([mockModule.default]);
  });

  it('should handle array of modules', () => {
    const mockModules = [
      { default: { src: 'test1.jpg', width: 100, height: 100 } },
      { default: { src: 'test2.jpg', width: 200, height: 200 } },
    ];
    const { result } = renderHook(() => useAssetsWeb(mockModules));
    expect(result.current).toEqual(mockModules.map((m) => m.default));
  });

  it('should handle empty input', () => {
    const { result } = renderHook(() => useAssetsWeb([]));
    expect(result.current).toEqual([]);
  });

  it('should handle undefined module', () => {
    const { result } = renderHook(() => useAssetsWeb([undefined]));
    expect(result.current).toEqual([undefined]);
  });
});

describe('useAssets (Native)', () => {
  it('should handle single module input', () => {
    const mockModule = { default: 'test-asset' };
    const { result } = renderHook(() => useAssetsNative(mockModule));
    expect(result.current).toEqual([
      {
        height: 100,
        width: 200,
        src: 'mock-asset-uri',
      },
    ]);
  });

  it('should handle array of modules', () => {
    const mockModules = [{ default: 'test1' }, { default: 'test2' }];
    const { result } = renderHook(() => useAssetsNative(mockModules));
    expect(result.current).toEqual([
      {
        height: 100,
        width: 200,
        src: 'mock-asset-uri',
      },
      {
        height: 100,
        width: 200,
        src: 'mock-asset-uri',
      },
    ]);
  });

  it('should handle empty input', () => {
    const { result } = renderHook(() => useAssetsNative([]));
    expect(result.current).toEqual([]);
  });

  it('should handle non-object input', () => {
    const { result } = renderHook(() => useAssetsNative('not-an-object'));
    expect(result.current).toBeDefined();
    expect(result.current).toHaveLength(1);
  });
});

describe('useAssets (Native) - Unit Tests for expoUseAssets behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should log an error if expoUseAssets returns an error', async () => {
    const testError = new Error('Test error');
    vi.doMock('expo-asset', () => ({
      useAssets: vi.fn(() => [null, testError]),
    }));
    const { useAssets: useAssetsNative } = await import('./index.native');
    const loggerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAssetsNative('dummy-module'));
    expect(loggerSpy).toHaveBeenCalledWith(testError);
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toBeUndefined();
    loggerSpy.mockRestore();
  });

  it('should return an array with undefined when expoUseAssets returns null for assets', async () => {
    vi.doMock('expo-asset', () => ({
      useAssets: vi.fn(() => [null, null]),
    }));
    const { useAssets: useAssetsNative } = await import('./index.native');
    const { result } = renderHook(() => useAssetsNative('dummy-module'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toBeUndefined();
    const { result: resultArray } = renderHook(() => useAssetsNative(['mod1', 'mod2']));
    expect(resultArray.current).toHaveLength(2);
    expect(resultArray.current[0]).toBeUndefined();
    expect(resultArray.current[1]).toBeUndefined();
  });

  it('should correctly map valid assets when expoUseAssets returns assets', async () => {
    const assetMock = { height: 100, width: 200, uri: 'test-uri' };
    vi.doMock('expo-asset', () => ({
      useAssets: vi.fn(() => [[assetMock], null]),
    }));
    const { useAssets: useAssetsNative } = await import('./index.native');
    const { result } = renderHook(() => useAssetsNative('dummy-module'));
    expect(result.current).toEqual([
      {
        height: 100,
        src: 'test-uri',
        width: 200,
      },
    ]);
  });
});
