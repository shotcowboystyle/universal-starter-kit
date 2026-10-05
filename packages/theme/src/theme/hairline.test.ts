import { beforeEach, describe, expect, it } from 'vitest';

import { ensureHairlineFallback, hairline, hairlineFallbackCss, hairlineWidth } from './hairline';

describe('hairline (Axiom 15 OPTICS)', () => {
  it('resolves half a CSS pixel on web', () => {
    expect(hairlineWidth).toBe(0.5);
  });

  it('renders standalone rules as filled fractional-size lines (Blink floors sub-1px borders)', () => {
    expect(hairline.line).toEqual({
      height: 0.5,
      maxHeight: 0.5,
      flexBasis: 0.5,
      borderBottomWidth: 0,
      backgroundColor: '$borderColor',
      className: 'mp-hairline-h',
    });
    expect(hairline.vline).toEqual({
      width: 0.5,
      maxWidth: 0.5,
      flexBasis: 0.5,
      borderRightWidth: 0,
      backgroundColor: '$borderColor',
      className: 'mp-hairline-w',
    });
    expect(hairline.height).toEqual({ height: 0.5, className: 'mp-hairline-h' });
  });

  it('pairs each edge treatment with its low-DPI fallback class', () => {
    expect(hairline.bottom).toEqual({ borderBottomWidth: 0.5, className: 'mp-hairline-b' });
    expect(hairline.top).toEqual({ borderTopWidth: 0.5, className: 'mp-hairline-t' });
    expect(hairline.right).toEqual({ borderRightWidth: 0.5, className: 'mp-hairline-r' });
    expect(hairline.left).toEqual({ borderLeftWidth: 0.5, className: 'mp-hairline-l' });
  });

  it('falls back to 1px through a resolution media query on low-DPI screens', () => {
    expect(hairlineFallbackCss).toMatch(/@media \(max-resolution: 1\.49dppx\)/);
    // every fallback class resolves a full CSS pixel
    for (const cls of ['b', 't', 'r', 'l', 'h', 'w', 'ie']) {
      expect(hairlineFallbackCss).toContain(`.mp-hairline-${cls}`);
    }
    expect(hairlineFallbackCss).toContain('border-bottom-width: 1px !important');
    expect(hairlineFallbackCss).toContain('border-inline-end-width: 1px !important');
    // filled-line fallbacks must pin max-height/max-width too (the `line`
    // treatment sets both, so height alone could not win)
    expect(hairlineFallbackCss).toContain('height: 1px !important; max-height: 1px !important');
    expect(hairlineFallbackCss).toContain('width: 1px !important; max-width: 1px !important');
  });

  describe('fallback stylesheet mount', () => {
    beforeEach(() => {
      document.getElementById('mp-hairline-styles')?.remove();
    });

    it('mounts the fallback stylesheet once (idempotent)', () => {
      ensureHairlineFallback();
      ensureHairlineFallback();
      const tags = document.querySelectorAll('#mp-hairline-styles');
      expect(tags).toHaveLength(1);
      expect(tags[0]?.textContent).toBe(hairlineFallbackCss);
    });
  });
});
