import { describe, expect, it } from 'vitest';

import { bidiIsolate, t } from './t';

describe('t (uninitialized-i18n fallback)', () => {
  it('returns the key with {{var}} interpolation applied', () => {
    expect(t('Delete row {{row}}', { row: 3 })).toBe('Delete row 3');
  });

  it('leaves unknown variables as-is', () => {
    expect(t('Delete row {{row}}', { other: 1 })).toBe('Delete row {{row}}');
  });
});

describe('bidiIsolate (BIDI-ISOLATION)', () => {
  it('wraps the run in FSI…PDI so RTL contexts cannot reorder it', () => {
    expect(bidiIsolate('1–5 of 5')).toBe('\u20681–5 of 5\u2069');
    expect(bidiIsolate('Search...')).toBe('\u2068Search...\u2069');
  });

  it('keeps LTR content byte-identical inside the isolates', () => {
    // First-strong isolation adds only the invisible FSI/PDI frame — the
    // visible run is unchanged, so LTR rendering is unaffected.
    const isolated = bidiIsolate('Search...');
    expect(isolated.slice(1, -1)).toBe('Search...');
    expect(isolated.startsWith('\u2068')).toBe(true);
    expect(isolated.endsWith('\u2069')).toBe(true);
  });

  it("preserves an RTL run's own base direction (first-strong semantics)", () => {
    // An Arabic run keeps its first strong character (RTL) as the isolate's
    // base direction — isolation never forces LTR on translated copy.
    const rtl = 'بحث…';
    expect(bidiIsolate(rtl)).toBe(`\u2068${rtl}\u2069`);
  });

  it('leaves empty strings alone (nothing to isolate)', () => {
    expect(bidiIsolate('')).toBe('');
  });
});
