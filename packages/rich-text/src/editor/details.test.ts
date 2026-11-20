import { Editor } from '@tiptap/core';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { StarterKit } from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

const createEditor = (content = '<p>hello</p>') =>
  new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Details, DetailsSummary, DetailsContent],
    content,
  });

describe('collapsible details (GitLab <details> parity)', () => {
  it('setDetails wraps the current block into a details section', () => {
    const editor = createEditor('<p>body text</p>');
    editor.commands.selectAll();
    expect(editor.commands.setDetails()).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('body text');
    editor.destroy();
  });

  it('parses <details> HTML (the markdown round-trip shape) back into nodes', () => {
    const editor = createEditor(
      '<details><summary>Click</summary><div data-type="detailsContent"><p>hidden</p></div></details>',
    );
    const html = editor.getHTML();
    expect(html).toContain('<summary');
    expect(html).toContain('Click');
    expect(html).toContain('hidden');
    editor.destroy();
  });

  it('unsetDetails unwraps back to plain blocks', () => {
    const editor = createEditor('<p>body</p>');
    editor.commands.selectAll();
    editor.commands.setDetails();
    // place cursor inside the summary and unwrap
    editor.commands.setTextSelection(2);
    expect(editor.commands.unsetDetails()).toBe(true);
    expect(editor.getHTML()).not.toContain('<details');
    editor.destroy();
  });
});
