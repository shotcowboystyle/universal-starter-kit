/**
 * Cookie persistence round-trip specs — the non-React persistence surface
 * (`persistPresetOverrides` / `loadPresetOverrides` / `getCookieWatchList`)
 * that theme devtools and SSR hosts call directly. Locks down: overrides
 * survive a write→read round-trip through document.cookie, oversized
 * payloads chunk across `mp.ov.N` cookies and reassemble, stale chunks are
 * cleaned up, and the SSR path reads from a raw cookie map without touching
 * the document.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  cookieOverridesPrefix,
  cookiePreset,
  getCookieWatchList,
  loadPresetOverrides,
  persistPresetOverrides,
} from './cookies';
import type { Knobs } from './knobs';

function clearThemeCookies() {
  for (const key of getCookieWatchList()) {
    document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

beforeEach(() => {
  clearThemeCookies();
});

describe('getCookieWatchList', () => {
  it('watches the preset cookie plus every override chunk slot', () => {
    const list = getCookieWatchList();
    expect(list).toContain(cookiePreset);
    expect(list).toContain(`${cookieOverridesPrefix}.0`);
    expect(list).toContain(`${cookieOverridesPrefix}.9`);
    // preset + 10 chunk slots
    expect(list).toHaveLength(11);
  });
});

describe('persistPresetOverrides / loadPresetOverrides', () => {
  it('round-trips small overrides through document cookies', () => {
    persistPresetOverrides({ borderRadius: 'large', fillStyle: 'filled' } as Partial<Knobs>);
    expect(loadPresetOverrides()).toEqual({ borderRadius: 'large', fillStyle: 'filled' });
  });

  it('returns an empty object when nothing is persisted', () => {
    expect(loadPresetOverrides()).toEqual({});
  });

  it('overwrites previous overrides instead of merging them', () => {
    persistPresetOverrides({ borderRadius: 'large' } as Partial<Knobs>);
    persistPresetOverrides({ elevation: 'small' } as Partial<Knobs>);
    expect(loadPresetOverrides()).toEqual({ elevation: 'small' });
  });

  it('chunks oversized overrides across multiple cookies and reassembles them', () => {
    const bigValue = 'x'.repeat(8000);
    persistPresetOverrides({ animation: bigValue } as unknown as Partial<Knobs>);
    // The serialized JSON exceeds the 3.5 KB split threshold → several chunks.
    expect(document.cookie).toContain(`${cookieOverridesPrefix}.0=`);
    expect(document.cookie).toContain(`${cookieOverridesPrefix}.1=`);
    expect(loadPresetOverrides()).toEqual({ animation: bigValue });
  });

  it('cleans up stale chunk cookies when the payload shrinks', () => {
    const bigValue = 'y'.repeat(8000);
    persistPresetOverrides({ animation: bigValue } as unknown as Partial<Knobs>);
    persistPresetOverrides({ borderRadius: 'small' } as Partial<Knobs>);
    expect(loadPresetOverrides()).toEqual({ borderRadius: 'small' });
    expect(document.cookie).not.toContain(`${cookieOverridesPrefix}.1=`);
  });

  it('reads from a raw cookie map (SSR) without touching the document', () => {
    const raw = {
      [`${cookieOverridesPrefix}.0`]: JSON.stringify({ space: 'large' }),
    };
    expect(loadPresetOverrides(raw)).toEqual({ space: 'large' });
  });

  it('treats corrupted cookie JSON as no overrides', () => {
    const raw = { [`${cookieOverridesPrefix}.0`]: '{broken' };
    expect(loadPresetOverrides(raw)).toEqual({});
  });
});
