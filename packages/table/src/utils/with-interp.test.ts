import { describe, expect, it } from 'vitest';

import { bidiIsolate, withInterp } from './with-interp';

describe(withInterp, () => {
  it('no-ops when the translation already interpolated', () => {
    expect(withInterp('Delete row 3', { row: 3 })).toBe('Delete row 3');
  });

  it('interpolates the raw key when i18n is uninitialized', () => {
    expect(withInterp('Delete row {{row}}', { row: 3 })).toBe('Delete row 3');
  });

  it('leaves unknown variables as-is', () => {
    expect(withInterp('Delete row {{row}}', { other: 1 })).toBe('Delete row {{row}}');
  });

  it('handles multiple variables', () => {
    expect(withInterp('{{a}} of {{b}}', { a: 1, b: 2 })).toBe('1 of 2');
  });
});

describe(bidiIsolate, () => {
  it('wraps the run in FSI…PDI so RTL contexts cannot reorder it', () => {
    expect(bidiIsolate('1–5 of 5')).toBe('\u20681–5 of 5\u2069');
  });

  it('leaves empty strings alone (nothing to isolate)', () => {
    expect(bidiIsolate('')).toBe('');
  });
});
