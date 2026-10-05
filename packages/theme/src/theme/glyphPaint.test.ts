import { describe, expect, it } from 'vitest';

import { resolveGlyphPaint } from './glyphPaint';

describe('resolveGlyphPaint', () => {
  it('falls back to concrete ink when a requested theme token is absent', () => {
    expect(resolveGlyphPaint({ color: { val: '#111' } }, '$accentColor')).toBe('#111');
    expect(resolveGlyphPaint({ color12: { val: '#eee' } }, '$missing')).toBe('#eee');
    expect(resolveGlyphPaint({ color11: { val: '#ddd' } }, '$missing')).toBe('#ddd');
    expect(resolveGlyphPaint({}, '$missing')).toBe('currentColor');
  });

  it('preserves supplied theme tokens and supported literal paint', () => {
    expect(resolveGlyphPaint({ accentColor: { val: '#123456' } }, '$accentColor')).toBe('#123456');
    for (const paint of ['currentColor', 'red', '#123456', 'rgb(1, 2, 3)', 'hsl(0, 0%, 50%)']) {
      expect(resolveGlyphPaint({ color: { val: '#111' } }, paint)).toBe(paint);
    }
  });

  it('never returns undefined', () => {
    expect(resolveGlyphPaint({})).toBe('currentColor');
    expect(resolveGlyphPaint({}, undefined)).toBe('currentColor');
    expect(resolveGlyphPaint({}, null)).toBe('currentColor');
    expect(resolveGlyphPaint({}, '')).toBe('currentColor');
    expect(resolveGlyphPaint({ color: {} })).toBe('currentColor');
  });

  it('reads .val, never a missing get(web) path', () => {
    expect(resolveGlyphPaint({ color: { val: '#fafafa' } })).toBe('#fafafa');
    expect(resolveGlyphPaint({ color10: { val: '#abcabc' } }, '$color10')).toBe('#abcabc');
    expect(resolveGlyphPaint({ placeholderColor: { val: '#888' } }, 'placeholderColor')).toBe('#888');
  });

  it('passes through already-resolved colors and falls back to ink', () => {
    expect(resolveGlyphPaint({ color: { val: '#111' } }, '#ff00aa')).toBe('#ff00aa');
    expect(resolveGlyphPaint({ color12: { val: '#eee' } })).toBe('#eee');
    expect(resolveGlyphPaint({ color11: { val: '#ddd' } })).toBe('#ddd');
  });
});
