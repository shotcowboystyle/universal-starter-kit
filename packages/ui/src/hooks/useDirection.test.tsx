/**
 * useDirection — web direction detection (RTL audit backlog #1).
 * Covers the document-level `dir` resolution order (body wins over html),
 * non-explicit values falling through, live reaction to `dir` flips
 * (MutationObserver), and the ltr default.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDirection } from './useDirection';

const clearDirs = () => {
  document.documentElement.removeAttribute('dir');
  document.body.removeAttribute('dir');
};

afterEach(clearDirs);

describe('useDirection (web)', () => {
  it('defaults to ltr when no dir attribute is set', () => {
    clearDirs();
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('ltr');
  });

  it('reads dir=rtl set before mount (probe pattern: dir at first paint)', () => {
    // Element-level reflected property, exactly what the RTL probe init
    // script sets. (happy-dom does not reflect the `document.dir` setter
    // onto <html dir>, so tests use the element form browsers reflect.)
    document.documentElement.dir = 'rtl';
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('rtl');
  });

  it('prefers the body dir over the html dir (nearest attribute wins)', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    document.body.setAttribute('dir', 'ltr');
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('ltr');

    document.body.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('dir', 'ltr');
    const { result: flipped } = renderHook(() => useDirection());
    expect(flipped.current).toBe('rtl');
  });

  it('treats "auto" and empty dir values as non-explicit and falls through', () => {
    document.body.setAttribute('dir', 'auto');
    document.documentElement.setAttribute('dir', 'rtl');
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('rtl');

    document.documentElement.setAttribute('dir', '');
    const { result: fallback } = renderHook(() => useDirection());
    expect(fallback.current).toBe('ltr');
  });

  it('reacts to runtime dir flips in both directions (MutationObserver)', async () => {
    clearDirs();
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('ltr');

    await act(async () => {
      document.documentElement.dir = 'rtl';
    });
    expect(result.current).toBe('rtl');

    await act(async () => {
      document.documentElement.dir = 'ltr';
    });
    expect(result.current).toBe('ltr');
  });

  it('reacts to body-level dir changes', async () => {
    clearDirs();
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('ltr');

    await act(async () => {
      document.body.setAttribute('dir', 'rtl');
    });
    expect(result.current).toBe('rtl');

    await act(async () => {
      document.body.removeAttribute('dir');
    });
    expect(result.current).toBe('ltr');
  });
});
