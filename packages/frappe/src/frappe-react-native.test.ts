/**
 * React Native branches of the frappeReact hooks (native-audit B9).
 *
 * isBrowser() is deliberately TRUE on RN (it gates the sync pipeline, which
 * is fully native-capable), so it must NOT be the guard for DOM-only APIs:
 * useInfiniteScroll builds an IntersectionObserver, which does not exist on
 * Hermes. On native the hook must be a safe no-op — same surface, no DOM.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInfiniteScroll } from './frappe-react';

vi.mock(import('@repo/platform'), () => ({
  isNative: true,
  isWindowDefined: false,
  getCookie: vi.fn<() => string | null>(() => null),
  setCookie: vi.fn<() => void>(),
  deleteCookie: vi.fn<() => void>(),
  onAppFocus: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onOnline: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onVisibilityChange: vi.fn<() => () => void>(() => vi.fn<() => void>()),
}));

describe('useInfiniteScroll on React Native (isNative, no window)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('never constructs IntersectionObserver, even with a sentinel attached', async () => {
    // A construction attempt on RN would throw ReferenceError; make any
    // call loud and observable.
    const observerCtor = vi.fn<() => never>(() => {
      throw new Error('IntersectionObserver must not be constructed on native');
    });
    vi.stubGlobal('IntersectionObserver', observerCtor);

    const { result } = renderHook(() =>
      useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: vi.fn<() => void>(), enabled: true }),
    );

    await act(async () => {
      // RN refs are host-component handles, not DOM Elements.
      result.current.sentinelRef({} as unknown as Element);
    });

    expect(observerCtor).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('returns the full hook surface without crashing when the API is absent', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- stubGlobal needs the value; undefined models a runtime without the API
    vi.stubGlobal('IntersectionObserver', undefined);

    const { result, unmount } = renderHook(() =>
      useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: vi.fn<() => void>() }),
    );

    expect(result.current.sentinelRef).toBeTypeOf('function');
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
    expect(() => {
      unmount();
    }).not.toThrow();
  });
});
