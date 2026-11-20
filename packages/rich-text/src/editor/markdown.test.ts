import { describe, expect, it } from 'vitest';

import { htmlToMarkdown, markdownToHtml } from './markdown';

describe(htmlToMarkdown, () => {
  it('converts headings, emphasis, and inline code to GFM', () => {
    const md = htmlToMarkdown('<h1>Title</h1><p><strong>bold</strong> and <em>italic</em> and <code>code</code></p>');
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('_italic_');
    expect(md).toContain('`code`');
  });

  it('converts strikethrough to ~~', () => {
    expect(htmlToMarkdown('<p><s>gone</s></p>')).toContain('~~gone~~');
    expect(htmlToMarkdown('<p><del>gone</del></p>')).toContain('~~gone~~');
  });

  it('converts fenced code blocks', () => {
    const md = htmlToMarkdown('<pre><code class="language-js">const a = 1;</code></pre>');
    expect(md).toContain('```');
    expect(md).toContain('const a = 1;');
  });

  it('converts Tiptap task items to GFM checkboxes', () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>done</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li>' +
      '</ul>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('- [x] done');
    expect(md).toContain('- [ ] todo');
  });

  it('converts tables to GFM pipe tables', () => {
    const html = '<table><tr><th>Name</th><th>Role</th></tr><tr><td>Ada</td><td>Analyst</td></tr></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('| Name | Role |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Ada | Analyst |');
  });

  it('escapes pipes inside table cells', () => {
    const md = htmlToMarkdown('<table><tr><th>A</th></tr><tr><td>x | y</td></tr></table>');
    expect(md).toContain('x \\| y');
  });

  it('keeps marks markdown cannot express as inline HTML (lossless)', () => {
    const md = htmlToMarkdown(
      '<p><u>under</u> <sub>sub</sub> <sup>sup</sup> <mark>hi</mark> <span style="color: rgb(255, 0, 0)">red</span></p>',
    );
    expect(md).toContain('<u>under</u>');
    expect(md).toContain('<sub>sub</sub>');
    expect(md).toContain('<sup>sup</sup>');
    expect(md).toContain('<mark>hi</mark>');
    expect(md).toMatch(/<span style="color:\s*rgb\(255,\s*0,\s*0\)/u);
  });
});

describe(markdownToHtml, () => {
  it('converts GFM to HTML', () => {
    const html = markdownToHtml('# Title\n\n**bold** and ~~strike~~');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<del>strike</del>');
  });

  it('upgrades GFM task lists to the Tiptap taskList schema', () => {
    const html = markdownToHtml('- [x] done\n- [ ] todo');
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    // marked's raw checkbox inputs are removed after the upgrade
    expect(html).not.toContain('<input');
  });

  it('parses pipe tables', () => {
    const html = markdownToHtml('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
  });
});

describe('math markdown (GitLab-flavored dollar math)', () => {
  it('converts inline math spans to $...$', () => {
    const md = htmlToMarkdown('<p>energy <span data-type="inline-math" data-latex="E=mc^2">E=mc^2</span> here</p>');
    expect(md).toContain('$E=mc^2$');
  });

  it('converts math code blocks to $$ fences', () => {
    const md = htmlToMarkdown('<pre><code class="language-math">\\frac{a}{b}</code></pre>');
    expect(md).toContain('$$\n\\frac{a}{b}\n$$');
  });

  it('parses $...$ into inline math spans', () => {
    const html = markdownToHtml('the mass $E=mc^2$ equation');
    expect(html).toContain('data-type="inline-math"');
    expect(html).toContain('data-latex="E=mc^2"');
  });

  it('parses $$ blocks (own-line and single-line) into math code blocks', () => {
    expect(markdownToHtml('$$\n\\sqrt{x}\n$$')).toContain('<code class="language-math">');
    expect(markdownToHtml('$$\\sqrt{x}$$')).toContain('<code class="language-math">');
  });

  it('parses ```math fences into the same math code block', () => {
    expect(markdownToHtml('```math\n\\sqrt{x}\n```')).toContain('class="language-math"');
  });

  it('does not treat prices as math', () => {
    const html = markdownToHtml('costs $5 and $10 total');
    expect(html).not.toContain('inline-math');
    expect(html).toContain('costs $5 and $10 total');
  });

  it('escapes HTML inside latex both directions', () => {
    const html = markdownToHtml('$a<b$');
    expect(html).toContain('a&lt;b');
    expect(html).not.toContain('<b$');
  });

  it('round-trips inline and block math losslessly', () => {
    const source =
      '<p>inline <span data-type="inline-math" data-latex="x^2">x^2</span></p>' +
      '<pre><code class="language-math">\\sum_{i=0}^n i</code></pre>';
    const roundTripped = markdownToHtml(htmlToMarkdown(source));
    expect(roundTripped).toContain('data-latex="x^2"');
    expect(roundTripped).toContain('<code class="language-math">');
    expect(roundTripped).toContain('\\sum_{i=0}^n i');
  });
});

describe('mermaid markdown', () => {
  it('round-trips mermaid fences losslessly', () => {
    const source = '<pre><code class="language-mermaid">graph TD\n  A--&gt;B</code></pre>';
    const md = htmlToMarkdown(source);
    expect(md).toContain('```mermaid');
    expect(md).toContain('graph TD');
    const roundTripped = markdownToHtml(md);
    expect(roundTripped).toContain('class="language-mermaid"');
    expect(roundTripped).toContain('A--&gt;B');
  });
});

describe('details markdown (collapsible sections)', () => {
  it('keeps <details> as raw HTML (GitLab behavior) and round-trips it', () => {
    const source =
      '<details><summary>Click me</summary>' +
      '<div data-type="detailsContent"><p>hidden <strong>content</strong></p></div></details>';
    const md = htmlToMarkdown(source);
    expect(md).toContain('<details>');
    expect(md).toContain('<summary>Click me</summary>');
    const roundTripped = markdownToHtml(md);
    expect(roundTripped).toContain('<details>');
    expect(roundTripped).toContain('<summary>Click me</summary>');
    expect(roundTripped).toContain('<strong>content</strong>');
  });
});

describe('round-trip (rich -> markdown -> rich)', () => {
  it('preserves headings, lists, tasks, quotes, and inline marks', () => {
    const source =
      '<h2>Notes</h2>' +
      '<p><strong>bold</strong> <em>em</em> <s>strike</s> <code>code</code> <u>under</u></p>' +
      '<ul><li><p>one</p></li><li><p>two</p></li></ul>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>task</p></div></li></ul>' +
      '<blockquote><p>quote</p></blockquote>';
    const roundTripped = markdownToHtml(htmlToMarkdown(source));
    expect(roundTripped).toContain('<h2>Notes</h2>');
    expect(roundTripped).toContain('<strong>bold</strong>');
    expect(roundTripped).toContain('<em>em</em>');
    expect(roundTripped).toContain('<del>strike</del>');
    expect(roundTripped).toContain('<code>code</code>');
    expect(roundTripped).toContain('<u>under</u>');
    // Tiptap emits loose lists (<li><p>…</p></li>); either form is fine
    expect(roundTripped).toMatch(/<li>(?:<p>)?one(?:<\/p>)?\s*<\/li>/u);
    expect(roundTripped).toContain('data-type="taskItem"');
    expect(roundTripped).toContain('data-checked="true"');
    expect(roundTripped).toContain('<blockquote>');
  });

  it('preserves tables through the round trip', () => {
    const source = '<table><tr><th>H</th></tr><tr><td>cell</td></tr></table>';
    const roundTripped = markdownToHtml(htmlToMarkdown(source));
    expect(roundTripped).toContain('<table>');
    expect(roundTripped).toContain('<th>H</th>');
    expect(roundTripped).toContain('<td>cell</td>');
  });
});
