import { describe, it, expect } from 'vitest';

import { getEditorCSS } from './editor-styles';

describe(getEditorCSS, () => {
  it('returns a non-empty CSS string containing Tamagui CSS custom properties', () => {
    const css = getEditorCSS();
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('var(--color');
    expect(css).toContain('var(--blue10');
  });

  it('carries no raw hex or rgba color literals (Axiom 5 / LC-18)', () => {
    const css = getEditorCSS();
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/rgba?\(/u);
  });

  it('placeholder uses the AA-passing muted text token (Axiom 12)', () => {
    const css = getEditorCSS();
    const placeholderRule = css.slice(css.indexOf('is-editor-empty'));
    expect(placeholderRule).toContain('var(--color11)');
  });

  it("code syntax ink takes the build's held tokens, never a bare step 9 or 10 (MPO-468)", () => {
    const syntax = getEditorCSS().slice(getEditorCSS().indexOf('.hljs-comment'));
    expect(syntax).not.toMatch(/var\(--(?:color|purple|green|blue|orange|red)(?:9|10)\)/u);
    expect(syntax).toMatch(/\.hljs-quote \{ color: var\(--color11\)/u);
    for (const hue of ['Purple', 'Green', 'Blue', 'Orange', 'Red']) {
      expect(syntax).toContain(`var(--syntax${hue}, var(--${hue.toLowerCase()}11))`);
    }
    expect(syntax).not.toContain('color-mix(');
  });

  it('applies minHeight and maxHeight options', () => {
    const css = getEditorCSS({ minHeight: 200, maxHeight: 500 });
    expect(css).toContain('min-height: 200px');
    expect(css).toContain('max-height: 500px');
    expect(css).toContain('overflow-y: auto');
  });

  it('omits maxHeight styles when not provided', () => {
    const css = getEditorCSS({ minHeight: 100 });
    expect(css).toContain('min-height: 100px');
    expect(css).not.toContain('max-height');
  });

  it('animation none (motionMs 0) silences bubble and drag-handle motion', () => {
    const css = getEditorCSS({ motionMs: 0 });
    expect(css).toContain('opacity 0ms');
    expect(css).not.toContain('opacity 120ms');
  });

  it('default motion pairs enter and exit transitions on bubbles (LC-24)', () => {
    const css = getEditorCSS({ motionMs: 120 });
    expect(css).toContain('opacity 120ms');
    // destination-state selector keeps the exit fade visible
    expect(css).toContain('[style*="visibility: visible"]');
  });
});
