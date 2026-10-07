import { renderHook } from '@testing-library/react';
import type { useAssets as expoUseAssets } from 'expo-asset';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssets as useAssetsNative } from './index.native';

import { useAssets as useAssetsWeb } from './index';

interface MockAsset {
  height: number;
  width: number;
  uri: string;
}

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the typed factory requires the full Platform module shape; this stand-in only needs `select`
vi.mock('react-native/Libraries/Utilities/Platform', () => ({
  default: {
    select: (obj: { native: unknown }) => obj.native,
  },
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the typed factory requires expo Asset instances; plain stand-in assets are enough here
vi.mock('expo-asset', () => ({
  useAssets: vi.fn<(modules: number | number[]) => [MockAsset[], null]>().mockImplementation((modules) => [
    [modules].flat().map(() => ({
      height: 100,
      width: 200,
      uri: 'mock-asset-uri',
    })),
    null,
  ]),
}));

describe('useAssets (Web)', () => {
  it('should handle single module input', () => {
    const mockModule = {
      default: { src: 'test.jpg', width: 100, height: 100 },
    };
    const { result } = renderHook(() => useAssetsWeb([mockModule]));
    expect(result.current).toStrictEqual([mockModule.default]);
  });

  it('should handle array of modules', () => {
    const mockModules = [
      { default: { src: 'test1.jpg', width: 100, height: 100 } },
      { default: { src: 'test2.jpg', width: 200, height: 200 } },
    ];
    const { result } = renderHook(() => useAssetsWeb(mockModules));
    expect(result.current).toStrictEqual(mockModules.map((m) => m.default));
  });

  it('should handle empty input', () => {
    const { result } = renderHook(() => useAssetsWeb([]));
    expect(result.current).toStrictEqual([]);
  });

  it('should handle undefined module', () => {
    const { result } = renderHook(() => useAssetsWeb([undefined]));
    expect(result.current).toStrictEqual([undefined]);
  });
});

describe('useAssets (Native)', () => {
  it('should handle single module input', () => {
    const mockModule = { default: 1 };
    const { result } = renderHook(() => useAssetsNative(mockModule));
    expect(result.current).toStrictEqual([
      {
        height: 100,
        width: 200,
        src: 'mock-asset-uri',
      },
    ]);
  });

  it('should handle array of modules', () => {
    const mockModules = [{ default: 1 }, { default: 2 }];
    const { result } = renderHook(() => useAssetsNative(mockModules));
    expect(result.current).toStrictEqual([
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
    expect(result.current).toStrictEqual([]);
  });

  it('should handle non-object input', () => {
    const { result } = renderHook(() => useAssetsNative(42));
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
    vi.doMock(import('expo-asset'), () => ({
      useAssets: vi.fn<typeof expoUseAssets>(() => [undefined, testError]),
    }));
    const { useAssets: useAssetsReloaded } = await import('./index.native');
    const loggerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAssetsReloaded(7));
    expect(loggerSpy).toHaveBeenCalledWith(testError);
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toBeUndefined();
    loggerSpy.mockRestore();
  });

  it('should return an array with undefined when expoUseAssets returns null for assets', async () => {
    vi.doMock(import('expo-asset'), () => ({
      useAssets: vi.fn<typeof expoUseAssets>(() => [undefined, undefined]),
    }));
    const { useAssets: useAssetsReloaded } = await import('./index.native');
    const { result } = renderHook(() => useAssetsReloaded(7));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toBeUndefined();
    const { result: resultArray } = renderHook(() => useAssetsReloaded([8, 9]));
    expect(resultArray.current).toHaveLength(2);
    expect(resultArray.current[0]).toBeUndefined();
    expect(resultArray.current[1]).toBeUndefined();
  });

  it('should correctly map valid assets when expoUseAssets returns assets', async () => {
    const assetMock = { height: 100, width: 200, uri: 'test-uri' };
    // oxlint-disable-next-line vitest/prefer-import-in-mock -- the typed factory requires expo Asset instances; a plain stand-in asset is enough here
    vi.doMock('expo-asset', () => ({
      useAssets: vi.fn<() => [MockAsset[], null]>(() => [[assetMock], null]),
    }));
    const { useAssets: useAssetsReloaded } = await import('./index.native');
    const { result } = renderHook(() => useAssetsReloaded(7));
    expect(result.current).toStrictEqual([
      {
        height: 100,
        src: 'test-uri',
        width: 200,
      },
    ]);
  });
});
