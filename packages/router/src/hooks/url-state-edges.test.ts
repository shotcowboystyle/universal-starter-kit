/**
 * URL-state edge contracts not covered by useUrlState.test.ts:
 * `useShareableUrl` (share-link building from current params) and the
 * defensive deserialize branches of `useUrlState` (malformed JSON falls back
 * to defaults, scalar→array coercion for array-typed defaults).
 */

import { renderHook } from '@testing-library/react';
import type { OneRouter } from 'one';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useParams, useRouter } from '../router';

import { useShareableUrl, useUrlState } from './use-url-state';

vi.mock(import('../router'), () => ({
  useParams: vi.fn<typeof useParams>(),
  useRouter: vi.fn<typeof useRouter>(),
}));

const noop = (): void => {
  // intentionally empty
};

const createRouter = (
  setParams: OneRouter.Router['setParams'] = vi.fn<OneRouter.Router['setParams']>(),
): OneRouter.Router => ({
  back: vi.fn<OneRouter.Router['back']>(),
  canGoBack: vi.fn<OneRouter.Router['canGoBack']>(() => false),
  push: vi.fn<OneRouter.Router['push']>(),
  navigate: vi.fn<OneRouter.Router['navigate']>(),
  replace: vi.fn<OneRouter.Router['replace']>(),
  dismiss: vi.fn<OneRouter.Router['dismiss']>(),
  dismissAll: vi.fn<OneRouter.Router['dismissAll']>(),
  canDismiss: vi.fn<OneRouter.Router['canDismiss']>(() => false),
  setParams,
  subscribe: vi.fn<OneRouter.Router['subscribe']>(() => noop),
  onLoadState: vi.fn<OneRouter.Router['onLoadState']>(() => noop),
});

const mockUseParams = vi.mocked(useParams);
const mockUseRouter = vi.mocked(useRouter);

describe('url state edge contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({});
    mockUseRouter.mockReturnValue(createRouter());
  });

  describe(useShareableUrl, () => {
    it('builds an absolute URL carrying the current params as query string', () => {
      mockUseParams.mockReturnValue({ tab: 'settings', page: '2' });
      const { result } = renderHook(() => useShareableUrl());
      const url = new URL(result.current);
      expect(url.origin).toBe(new URL(window.location.href).origin);
      expect(url.searchParams.get('tab')).toBe('settings');
      expect(url.searchParams.get('page')).toBe('2');
    });

    it('repeats array params as multiple query entries', () => {
      mockUseParams.mockReturnValue({ tags: ['a', 'b'] });
      const { result } = renderHook(() => useShareableUrl());
      const url = new URL(result.current);
      expect(url.searchParams.getAll('tags')).toStrictEqual(['a', 'b']);
    });

    it('drops empty and undefined params from the shared link', () => {
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an explicitly undefined param is the case under test
      mockUseParams.mockReturnValue({ keep: 'yes', empty: '', missing: undefined });
      const { result } = renderHook(() => useShareableUrl());
      const url = new URL(result.current);
      expect(url.searchParams.get('keep')).toBe('yes');
      expect(url.searchParams.has('empty')).toBe(false);
      expect(url.searchParams.has('missing')).toBe(false);
    });

    it('replaces any existing location query instead of appending to it', () => {
      mockUseParams.mockReturnValue({ only: 'param' });
      const { result } = renderHook(() => useShareableUrl());
      const url = new URL(result.current);
      expect([...url.searchParams.keys()]).toStrictEqual(['only']);
    });

    it('falls back to the bare URL when the router host throws', () => {
      mockUseParams.mockImplementation(() => {
        throw new Error('no router context');
      });
      const { result } = renderHook(() => useShareableUrl());
      const url = new URL(result.current);
      expect([...url.searchParams.keys()]).toStrictEqual([]);
    });
  });

  describe('useUrlState deserialize edge cases', () => {
    it('falls back to the default when an object param carries malformed JSON', () => {
      mockUseParams.mockReturnValue({ config: '{not-json' });
      const defaults = { config: { theme: 'light' } };
      const { result } = renderHook(() => useUrlState(defaults));
      expect(result.current[0]).toStrictEqual({ config: { theme: 'light' } });
    });

    it('coerces a single string into an array for array-typed defaults', () => {
      mockUseParams.mockReturnValue({ tags: 'solo' });
      const defaults = { tags: [] as string[] };
      const { result } = renderHook(() => useUrlState(defaults));
      expect(result.current[0]).toStrictEqual({ tags: ['solo'] });
    });

    it("parses 'false' strings into boolean false for boolean defaults", () => {
      mockUseParams.mockReturnValue({ active: 'false' });
      const defaults = { active: true };
      const { result } = renderHook(() => useUrlState(defaults));
      expect(result.current[0]).toStrictEqual({ active: false });
    });

    it('ignores params that have no matching default key', () => {
      mockUseParams.mockReturnValue({ unknown: 'x', name: 'known' });
      const defaults = { name: '' };
      const { result } = renderHook(() => useUrlState(defaults));
      expect(result.current[0]).toStrictEqual({ name: 'known' });
    });
  });
});
