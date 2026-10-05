/**
 * URL-state edge contracts not covered by useUrlState.test.ts:
 * `useShareableUrl` (share-link building from current params) and the
 * defensive deserialize branches of `useUrlState` (malformed JSON falls back
 * to defaults, scalar→array coercion for array-typed defaults).
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as router from '../router';

import { useShareableUrl, useUrlState } from './useUrlState';

vi.mock('../router', () => ({
  useParams: vi.fn(() => ({})),
  useRouter: vi.fn(() => ({ setParams: vi.fn() })),
}));

const mockUseParams = router.useParams as unknown as ReturnType<typeof vi.fn>;
const mockUseRouter = router.useRouter as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({});
  mockUseRouter.mockReturnValue({ setParams: vi.fn() });
});

describe('useShareableUrl', () => {
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
    expect(url.searchParams.getAll('tags')).toEqual(['a', 'b']);
  });

  it('drops empty and undefined params from the shared link', () => {
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
    expect([...url.searchParams.keys()]).toEqual(['only']);
  });

  it('falls back to the bare URL when the router host throws', () => {
    mockUseParams.mockImplementation(() => {
      throw new Error('no router context');
    });
    const { result } = renderHook(() => useShareableUrl());
    const url = new URL(result.current);
    expect([...url.searchParams.keys()]).toEqual([]);
  });
});

describe('useUrlState deserialize edge cases', () => {
  it('falls back to the default when an object param carries malformed JSON', () => {
    mockUseParams.mockReturnValue({ config: '{not-json' });
    const defaults = { config: { theme: 'light' } };
    const { result } = renderHook(() => useUrlState(defaults));
    expect(result.current[0]).toEqual({ config: { theme: 'light' } });
  });

  it('coerces a single string into an array for array-typed defaults', () => {
    mockUseParams.mockReturnValue({ tags: 'solo' });
    const defaults = { tags: [] as string[] };
    const { result } = renderHook(() => useUrlState(defaults));
    expect(result.current[0]).toEqual({ tags: ['solo'] });
  });

  it("parses 'false' strings into boolean false for boolean defaults", () => {
    mockUseParams.mockReturnValue({ active: 'false' });
    const defaults = { active: true };
    const { result } = renderHook(() => useUrlState(defaults));
    expect(result.current[0]).toEqual({ active: false });
  });

  it('ignores params that have no matching default key', () => {
    mockUseParams.mockReturnValue({ unknown: 'x', name: 'known' });
    const defaults = { name: '' };
    const { result } = renderHook(() => useUrlState(defaults));
    expect(result.current[0]).toEqual({ name: 'known' });
  });
});
