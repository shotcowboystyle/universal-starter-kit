/**
 * The shim dagre needs on Hermes and on a pre-15.4 WKWebView.
 *
 * `layout.spec.ts` proves the ENGINE works; these cases prove the shim is a
 * real structural clone rather than a shallow copy that happens to satisfy
 * dagre today, and that it never shadows a platform implementation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { cloneStructured, ensureStructuredClone } from './structuredCloneShim';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe(cloneStructured, () => {
  it('returns primitives unchanged', () => {
    for (const value of [1, 'a', true, null, undefined, 0, Number.NaN]) {
      expect(Object.is(cloneStructured(value), value)).toBe(true);
    }
  });

  it('deep-copies a nested plain object rather than sharing it', () => {
    const source = { a: { b: { c: 1 } }, list: [1, { d: 2 }] };
    const copy = cloneStructured(source);
    expect(copy).toEqual(source);
    expect(copy.a).not.toBe(source.a);
    expect(copy.list[1]).not.toBe(source.list[1]);
    copy.a.b.c = 99;
    expect(source.a.b.c).toBe(1);
  });

  it('copies the shape dagre actually clones: an id → x map', () => {
    const positions = { n0: 12.5, n1: 44, n2: -3 };
    const copy = cloneStructured(positions);
    copy.n0 = 0;
    expect(positions.n0).toBe(12.5);
  });

  it('preserves cycles instead of recursing forever', () => {
    const source: { self?: unknown; n: number } = { n: 1 };
    source.self = source;
    const copy = cloneStructured(source);
    expect(copy.self).toBe(copy);
    expect(copy.n).toBe(1);
  });

  it('handles Map, Set, Date and RegExp', () => {
    const source = {
      map: new Map([['k', { v: 1 }]]),
      set: new Set([1, 2]),
      date: new Date(1_700_000_000_000),
      re: /ab+c/gi,
    };
    const copy = cloneStructured(source);
    expect(copy.map.get('k')).toEqual({ v: 1 });
    expect(copy.map.get('k')).not.toBe(source.map.get('k'));
    expect([...copy.set]).toEqual([1, 2]);
    expect(copy.date.getTime()).toBe(1_700_000_000_000);
    expect(copy.date).not.toBe(source.date);
    expect(copy.re.source).toBe('ab+c');
    expect(copy.re.flags).toBe('gi');
  });

  it('refuses a function rather than inventing a shallow copy', () => {
    expect(() => cloneStructured(() => 1)).toThrow(TypeError);
    expect(() => cloneStructured({ fn: () => 1 })).toThrow(TypeError);
  });

  it("refuses a class instance, matching DataCloneError's spirit", () => {
    class Thing {
      value = 1;
    }
    expect(() => cloneStructured(new Thing())).toThrow(/could not be cloned/);
  });
});

describe(ensureStructuredClone, () => {
  it('does not shadow a platform implementation', () => {
    const platform = vi.fn((value: unknown) => value);
    vi.stubGlobal('structuredClone', platform);
    ensureStructuredClone();
    expect(globalThis.structuredClone).toBe(platform);
  });

  it('installs the shim when the global is absent — the Hermes case', () => {
    vi.stubGlobal('structuredClone');
    ensureStructuredClone();
    expect(globalThis.structuredClone).toBeTypeOf('function');
    const source = { a: { b: 1 } };
    const copy = globalThis.structuredClone(source);
    expect(copy).toEqual(source);
    expect(copy.a).not.toBe(source.a);
  });

  it('is idempotent', () => {
    vi.stubGlobal('structuredClone');
    ensureStructuredClone();
    const first = globalThis.structuredClone;
    ensureStructuredClone();
    expect(globalThis.structuredClone).toBe(first);
  });
});
