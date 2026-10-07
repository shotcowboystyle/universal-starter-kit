import { afterEach, describe, expect, it, vi } from 'vitest';

import { isBrowser, isGjs } from './util';

describe(isBrowser, () => {
  it('returns true in a browser-like (happy-dom) environment', () => {
    expect(isBrowser()).toBe(true);
  });

  it('returns false when neither isNative nor isWindowDefined', async () => {
    vi.resetModules();
    vi.doMock(import('@repo/platform'), () => ({ isNative: false, isWindowDefined: false }));
    const { isBrowser: isBrowserFresh } = await import('./util');
    expect(isBrowserFresh()).toBe(false);
    vi.doUnmock('@repo/platform');
    vi.resetModules();
  });
});

describe(isGjs, () => {
  afterEach(() => {
    delete (globalThis as { imports?: unknown }).imports;
  });

  it('returns false in a browser-like environment', () => {
    expect(isGjs()).toBe(false);
  });

  it('detects the GJS imports.gi global', () => {
    (globalThis as { imports?: unknown }).imports = { gi: {} };
    expect(isGjs()).toBe(true);
  });

  it('does not false-positive on an imports global without gi', () => {
    (globalThis as { imports?: unknown }).imports = { something: true };
    expect(isGjs()).toBe(false);
  });

  it('makes isBrowser() true on GJS even without isNative/isWindowDefined', async () => {
    vi.resetModules();
    vi.doMock(import('@repo/platform'), () => ({ isNative: false, isWindowDefined: false }));
    (globalThis as { imports?: unknown }).imports = { gi: {} };
    const fresh = await import('./util');
    expect(fresh.isGjs()).toBe(true);
    expect(fresh.isBrowser()).toBe(true);
    vi.doUnmock('@repo/platform');
    vi.resetModules();
  });
});
