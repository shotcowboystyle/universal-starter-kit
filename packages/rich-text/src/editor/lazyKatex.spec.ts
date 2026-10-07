import { describe, expect, it } from 'vitest';

import { mountKatexHtml, renderKatexHtml } from './lazyKatex';

describe(renderKatexHtml, () => {
  it('renders valid TeX to KaTeX markup', async () => {
    const result = await renderKatexHtml('x^2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain('katex');
    }
  });

  it('renders display mode for block math', async () => {
    const result = await renderKatexHtml('\\sum_{i=0}^n i', { displayMode: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain('katex-display');
    }
  });

  it('returns the parse error for invalid TeX (Axiom 6: never blank)', async () => {
    const result = await renderKatexHtml('\\undefinedmacro{');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/parse error/i);
    }
  });
});

describe(mountKatexHtml, () => {
  it('mounts markup as real nodes', async () => {
    const result = await renderKatexHtml('x^2');
    const container = document.createElement('span');
    if (result.ok) {
      mountKatexHtml(container, result.html);
    }
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('strips executable elements (defense in depth)', () => {
    const container = document.createElement('span');
    mountKatexHtml(container, '<span class="katex">ok</span><script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('.katex')?.textContent).toBe('ok');
  });
});
