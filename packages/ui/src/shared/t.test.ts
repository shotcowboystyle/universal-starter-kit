import { describe, expect, it } from 'vitest';

import { bidiIsolate, withInterp } from './t';

describe('withInterp', () => {
  it('no-ops when the translation already interpolated', () => {
    expect(withInterp('7 entries', { count: 7 })).toBe('7 entries');
  });

  it('interpolates the raw key when i18n is uninitialized', () => {
    expect(withInterp('{{count}} entries', { count: 7 })).toBe('7 entries');
  });

  it('leaves unknown variables as-is', () => {
    expect(withInterp('{{count}} entries', { other: 1 })).toBe('{{count}} entries');
  });

  it('handles multiple variables', () => {
    expect(withInterp('{{a}} of {{b}}', { a: 1, b: 2 })).toBe('1 of 2');
  });
});

describe('bidiIsolate (bidi isolation)', () => {
  it('wraps the run in FSI…PDI so RTL contexts cannot reorder it', () => {
    expect(bidiIsolate('1–5 of 5')).toBe('\u20681–5 of 5\u2069');
    expect(bidiIsolate('7 entries')).toBe('\u20687 entries\u2069');
  });

  it('keeps LTR content byte-identical inside the isolates', () => {
    // First-strong isolation adds only the invisible FSI/PDI frame — the
    // visible run is unchanged, so LTR rendering is unaffected.
    const isolated = bidiIsolate('1–25 of 312');
    expect(isolated.slice(1, -1)).toBe('1–25 of 312');
    expect(isolated.startsWith('\u2068')).toBe(true);
    expect(isolated.endsWith('\u2069')).toBe(true);
  });

  it("preserves an RTL run's own base direction (first-strong semantics)", () => {
    // An Arabic run keeps its first strong character (RTL) as the isolate's
    // base direction — isolation never forces LTR on translated copy.
    const rtl = '٧ إدخالات';
    expect(bidiIsolate(rtl)).toBe(`\u2068${rtl}\u2069`);
  });

  it('leaves empty strings alone (nothing to isolate)', () => {
    expect(bidiIsolate('')).toBe('');
  });
});
