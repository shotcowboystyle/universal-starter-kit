import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { INLINE_MATH_INPUT_RULE, InlineMath } from './mathematics';

function createEditor(content = '<p></p>') {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, InlineMath],
    content,
  });
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe(INLINE_MATH_INPUT_RULE, () => {
  const matches = (text: string) => text.match(INLINE_MATH_INPUT_RULE);

  it('matches dollar math at the end of typed text', () => {
    const match = matches('energy $E=mc^2$');
    expect(match?.[2]).toBe('E=mc^2');
    const startOfLine = matches('$x^2$');
    expect(startOfLine?.[2]).toBe('x^2');
    const singleChar = matches('$x$');
    expect(singleChar?.[2]).toBe('x');
  });

  it('rejects price-like text and padded content', () => {
    expect(matches('costs $5 and $10')).toBeNull();
    expect(matches('$ x$')).toBeNull();
    expect(matches('$x $')).toBeNull();
    expect(matches('$$')).toBeNull();
    // `$$x$$` is block math, not inline
    expect(matches('$$x$$')).toBeNull();
  });
});

describe('InlineMath node', () => {
  it('parses and serializes data-latex spans losslessly', () => {
    const editor = createEditor('<p>see <span data-type="inline-math" data-latex="E=mc^2">E=mc^2</span></p>');
    expect(editor.getHTML()).toContain('data-type="inline-math"');
    expect(editor.getHTML()).toContain('data-latex="E=mc^2"');
    editor.destroy();
  });

  it('insertInlineMath inserts and selects the node (bubble opens)', () => {
    const editor = createEditor();
    editor.chain().focus().insertInlineMath({ latex: 'a+b' }).run();
    expect(editor.isActive('inlineMath')).toBe(true);
    expect(editor.getAttributes('inlineMath').latex).toBe('a+b');
    editor.destroy();
  });

  it("updateInlineMath rewrites the selected node's latex", () => {
    const editor = createEditor();
    editor.chain().focus().insertInlineMath({ latex: 'a' }).run();
    expect(editor.commands.updateInlineMath({ latex: 'b^2' })).toBe(true);
    expect(editor.getAttributes('inlineMath').latex).toBe('b^2');
    expect(editor.getHTML()).toContain('data-latex="b^2"');
    editor.destroy();
  });

  it('updateInlineMath is a no-op without a selected math node', () => {
    const editor = createEditor('<p>plain</p>');
    expect(editor.commands.updateInlineMath({ latex: 'x' })).toBe(false);
    editor.destroy();
  });

  it('node view renders KaTeX markup for valid TeX', async () => {
    const editor = createEditor('<p><span data-type="inline-math" data-latex="x^2">x^2</span></p>');
    const chip = editor.view.dom.querySelector('.rt-math-inline');
    expect(chip).not.toBeNull();
    await waitFor(() => chip!.querySelector('.katex') !== null);
    expect(chip!.getAttribute('aria-label')).toBe('x^2');
    editor.destroy();
  });

  it('node view shows the error state for invalid TeX', async () => {
    const editor = createEditor('<p><span data-type="inline-math" data-latex="\\nope{">x</span></p>');
    const chip = editor.view.dom.querySelector('.rt-math-inline');
    await waitFor(() => chip!.classList.contains('rt-math-error'));
    // raw source stays visible; the parse error rides the title
    expect(chip!.textContent).toBe('\\nope{');
    expect(chip!.getAttribute('title')).toMatch(/parse error/i);
    editor.destroy();
  });
});
