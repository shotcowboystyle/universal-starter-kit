import { describe, expect, it, beforeEach } from 'vitest';

import {
  splitCookieValue,
  joinSplitCookieValues,
  readOverridesCookie,
  readPresetCookie,
  writePresetCookie,
  writeOverridesCookie,
  computeOverrides,
  getCookieWatchList,
  cookiePreset,
  cookieOverridesPrefix,
} from './cookies';
import { defaultKnobs, type Knobs } from './knobs';

describe('splitCookieValue', () => {
  it('returns a single chunk for small values', () => {
    const result = splitCookieValue('small');
    expect(result).toEqual(['small']);
  });

  it('splits values exceeding 3500 chars into chunks', () => {
    const large = 'x'.repeat(7500);
    const chunks = splitCookieValue(large);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(3500);
    expect(chunks[1].length).toBe(3500);
    expect(chunks[2].length).toBe(500);
  });

  it('handles value at exact threshold boundary', () => {
    const exact = 'a'.repeat(3500);
    expect(splitCookieValue(exact)).toEqual([exact]);
  });

  it('handles value one over threshold', () => {
    const over = 'b'.repeat(3501);
    const chunks = splitCookieValue(over);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(3500);
    expect(chunks[1].length).toBe(1);
  });
});

describe('joinSplitCookieValues', () => {
  it('joins chunks back together', () => {
    expect(joinSplitCookieValues(['abc', 'def', 'ghi'])).toBe('abcdefghi');
  });

  it('handles single chunk', () => {
    expect(joinSplitCookieValues(['only'])).toBe('only');
  });

  it('handles empty array', () => {
    expect(joinSplitCookieValues([])).toBe('');
  });
});

describe('splitCookieValue + joinSplitCookieValues roundtrip', () => {
  it('reconstructs original value after split and join', () => {
    const original = 'y'.repeat(8000);
    const reconstructed = joinSplitCookieValues(splitCookieValue(original));
    expect(reconstructed).toBe(original);
  });
});

describe('readOverridesCookie', () => {
  it('returns empty object when no chunks exist', () => {
    expect(readOverridesCookie({})).toEqual({});
  });

  it('reads a single chunk override', () => {
    const overrides: Partial<Knobs> = { fillStyle: 'outlined' };
    const cookies: Record<string, string> = {
      'mp.ov.0': JSON.stringify(overrides),
    };
    expect(readOverridesCookie(cookies)).toEqual(overrides);
  });

  it('reads and joins multiple chunks', () => {
    const overrides: Partial<Knobs> = { fillStyle: 'outlined', size: 'large' };
    const json = JSON.stringify(overrides);
    const mid = Math.floor(json.length / 2);
    const cookies: Record<string, string> = {
      'mp.ov.0': json.slice(0, mid),
      'mp.ov.1': json.slice(mid),
    };
    expect(readOverridesCookie(cookies)).toEqual(overrides);
  });

  it('returns empty object for malformed JSON', () => {
    const cookies: Record<string, string> = {
      'mp.ov.0': 'not{valid json',
    };
    expect(readOverridesCookie(cookies)).toEqual({});
  });

  it('stops reading at first missing chunk', () => {
    const cookies: Record<string, string> = {
      'mp.ov.0': '{"fill',
      'mp.ov.2': 'Style":"outlined"}',
    };
    expect(readOverridesCookie(cookies)).toEqual({});
  });
});

// Regression: react-cookie's jar (universal-cookie) auto-JSON-parses every
// cookie value it can, so the KnobBridge/useTheme read path receives
// already-parsed OBJECTS — the old reader joined them into "[object Object]",
// JSON.parse threw, and overrides silently resolved to {} app-wide.
describe('readOverridesCookie with universal-cookie auto-parsed values', () => {
  it('accepts an already-parsed object cookie value (universal-cookie shape)', () => {
    const overrides: Partial<Knobs> = { borderRadius: 'none', space: 'small' };
    expect(readOverridesCookie({ 'mp.ov.0': overrides })).toEqual(overrides);
  });

  it('accepts a raw JSON string cookie value (document.cookie / SSR shape)', () => {
    const overrides: Partial<Knobs> = { borderRadius: 'none', space: 'small' };
    expect(readOverridesCookie({ 'mp.ov.0': JSON.stringify(overrides) })).toEqual(overrides);
  });

  it('preserves nested interaction-state overrides from a parsed object', () => {
    const overrides: Partial<Knobs> = { hover: { elevation: 'large' } };
    expect(readOverridesCookie({ 'mp.ov.0': overrides })).toEqual(overrides);
  });

  it('round-trips writeOverridesCookie output through an auto-parsing jar', () => {
    const overrides: Partial<Knobs> = { density: 'compact', fillStyle: 'outlined' };
    const { toSet } = writeOverridesCookie(overrides);
    // Simulate universal-cookie readCookie: JSON.parse succeeds on the
    // single-chunk value, so the jar hands back an object.
    const jar = Object.fromEntries(toSet.map(({ key, value }) => [key, JSON.parse(value)]));
    expect(readOverridesCookie(jar)).toEqual(overrides);
  });

  it('round-trips oversized multi-chunk payloads through an auto-parsing jar', () => {
    const bigValue = 'x'.repeat(8000);
    const overrides = { animation: bigValue } as unknown as Partial<Knobs>;
    const { toSet } = writeOverridesCookie(overrides);
    expect(toSet.length).toBeGreaterThan(1);
    // universal-cookie leaves each chunk a string: a JSON fragment throws in
    // its JSON.parse attempt, so readCookie falls back to the raw value.
    const jar = Object.fromEntries(
      toSet.map(({ key, value }) => {
        try {
          return [key, JSON.parse(value)];
        } catch {
          return [key, value];
        }
      }),
    );
    expect(readOverridesCookie(jar)).toEqual(overrides);
  });

  it('returns safe empty for garbage values', () => {
    expect(readOverridesCookie({ 'mp.ov.0': 42 })).toEqual({});
    expect(readOverridesCookie({ 'mp.ov.0': true })).toEqual({});
    expect(readOverridesCookie({ 'mp.ov.0': ['not', 'overrides'] })).toEqual({});
    expect(readOverridesCookie({ 'mp.ov.0': 'not{valid json' })).toEqual({});
    expect(readOverridesCookie({ 'mp.ov.0': '[object Object]' })).toEqual({});
  });

  it('returns safe empty for mixed chunk types (object followed by string)', () => {
    expect(
      readOverridesCookie({
        'mp.ov.0': { borderRadius: 'none' },
        'mp.ov.1': '{"space":"small"}',
      }),
    ).toEqual({});
  });

  it('drops non-knob-shaped entries inside a parsed object', () => {
    expect(
      readOverridesCookie({
        'mp.ov.0': {
          borderRadius: 'none',
          count: 3,
          list: ['a'],
          hover: { elevation: 'large', depth: { nested: true } },
        },
      }),
    ).toEqual({ borderRadius: 'none', hover: { elevation: 'large' } });
  });
});

describe('readPresetCookie', () => {
  it('returns undefined when cookie is missing', () => {
    expect(readPresetCookie({})).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(readPresetCookie({ [cookiePreset]: '' })).toBeUndefined();
  });

  it('returns the preset name', () => {
    expect(readPresetCookie({ [cookiePreset]: 'dark-mode' })).toBe('dark-mode');
  });

  it('returns undefined for non-string jar values (universal-cookie auto-parse)', () => {
    expect(readPresetCookie({ [cookiePreset]: 123 })).toBeUndefined();
    expect(readPresetCookie({ [cookiePreset]: { nested: true } })).toBeUndefined();
  });
});

describe('writePresetCookie', () => {
  it('returns the correct key and value', () => {
    expect(writePresetCookie('my-preset')).toEqual({
      key: cookiePreset,
      value: 'my-preset',
    });
  });
});

describe('writeOverridesCookie', () => {
  it('returns a single chunk for small overrides', () => {
    const overrides: Partial<Knobs> = { fillStyle: 'outlined' };
    const { toSet, toRemove } = writeOverridesCookie(overrides);
    expect(toSet).toHaveLength(1);
    expect(toSet[0].key).toBe('mp.ov.0');
    expect(JSON.parse(toSet[0].value)).toEqual(overrides);
    expect(toRemove.length).toBeGreaterThan(0);
  });

  it('returns cleanup keys for indices beyond chunks written', () => {
    const { toSet, toRemove } = writeOverridesCookie({});
    expect(toSet).toHaveLength(1);
    expect(toRemove[0]).toBe('mp.ov.1');
  });

  it('handles empty overrides', () => {
    const { toSet } = writeOverridesCookie({});
    expect(JSON.parse(toSet[0].value)).toEqual({});
  });
});

describe('computeOverrides', () => {
  it('returns empty object when current matches base', () => {
    expect(computeOverrides(defaultKnobs, { ...defaultKnobs })).toEqual({});
  });

  it('returns only changed keys', () => {
    const current: Knobs = { ...defaultKnobs, fillStyle: 'outlined', size: 'large' };
    const overrides = computeOverrides(defaultKnobs, current);
    expect(overrides).toEqual({ fillStyle: 'outlined', size: 'large' });
  });

  it('does not include unchanged keys', () => {
    const current: Knobs = { ...defaultKnobs, fillStyle: 'outlined' };
    const overrides = computeOverrides(defaultKnobs, current);
    expect(Object.keys(overrides)).toEqual(['fillStyle']);
  });

  it('persists density override via mp.ov.* pattern', () => {
    const current: Knobs = { ...defaultKnobs, density: 'compact' };
    const overrides = computeOverrides(defaultKnobs, current);
    expect(overrides).toEqual({ density: 'compact' });

    const { toSet } = writeOverridesCookie(overrides);
    expect(toSet[0].key).toBe('mp.ov.0');
    expect(JSON.parse(toSet[0].value)).toEqual({ density: 'compact' });

    const roundtrip = readOverridesCookie({ 'mp.ov.0': toSet[0].value });
    expect(roundtrip).toEqual({ density: 'compact' });
  });

  it('persists house-decision overrides via mp.ov.* pattern', () => {
    const current: Knobs = {
      ...defaultKnobs,
      fieldLabelPlacement: 'side',
      tableZebra: 'on',
      formAutofocus: 'on',
    };
    const overrides = computeOverrides(defaultKnobs, current);
    expect(overrides).toEqual({
      fieldLabelPlacement: 'side',
      tableZebra: 'on',
      formAutofocus: 'on',
    });

    const { toSet } = writeOverridesCookie(overrides);
    expect(JSON.parse(toSet[0].value)).toEqual(overrides);
    expect(readOverridesCookie({ 'mp.ov.0': toSet[0].value })).toEqual(overrides);
  });
});

describe('getCookieWatchList', () => {
  it('includes the preset cookie key', () => {
    const list = getCookieWatchList();
    expect(list).toContain(cookiePreset);
  });

  it('includes chunked override keys', () => {
    const list = getCookieWatchList();
    expect(list).toContain(`${cookieOverridesPrefix}.0`);
    expect(list).toContain(`${cookieOverridesPrefix}.1`);
  });

  it('returns 11 keys (1 preset + 10 chunks)', () => {
    expect(getCookieWatchList()).toHaveLength(11);
  });
});
