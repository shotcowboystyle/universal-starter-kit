import { describe, expect, it } from 'vitest';

import { decodeEntities, isPreviewEmpty, parseHtmlPreview } from './preview';

describe(decodeEntities, () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41;')).toBe('a & b <c> "d" \'e\' A');
  });

  it('turns &nbsp; into a plain space', () => {
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
  });

  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&bogus;')).toBe('&bogus;');
  });
});

describe(isPreviewEmpty, () => {
  it('treats null, empty string, and empty paragraph as empty', () => {
    expect(isPreviewEmpty(null)).toBe(true);
    expect(isPreviewEmpty('')).toBe(true);
    expect(isPreviewEmpty('<p></p>')).toBe(true);
    expect(isPreviewEmpty('<p>  </p>')).toBe(true);
    expect(isPreviewEmpty('<p><br></p>')).toBe(true);
  });

  it('treats text and images as content', () => {
    expect(isPreviewEmpty('<p>hi</p>')).toBe(false);
    expect(isPreviewEmpty('<p><img src="x.png"></p>')).toBe(false);
  });
});

describe(parseHtmlPreview, () => {
  it('parses paragraphs into separate blocks', () => {
    const { blocks } = parseHtmlPreview('<p>alpha</p><p>beta</p>');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe('paragraph');
    expect(blocks[0].spans).toStrictEqual([{ text: 'alpha' }]);
    expect(blocks[1].spans).toStrictEqual([{ text: 'beta' }]);
  });

  it('skips empty paragraphs', () => {
    const { blocks } = parseHtmlPreview('<p>alpha</p><p></p><p>beta</p>');
    expect(blocks).toHaveLength(2);
  });

  it('captures inline marks with nesting', () => {
    const { blocks } = parseHtmlPreview('<p>plain <strong>bold <em>bolditalic</em></strong> <code>mono</code></p>');
    expect(blocks[0].spans).toStrictEqual([
      { text: 'plain ' },
      { text: 'bold ', bold: true },
      { text: 'bolditalic', bold: true, italic: true },
      { text: ' ' },
      { text: 'mono', code: true },
    ]);
  });

  it('maps heading levels', () => {
    const { blocks } = parseHtmlPreview('<h1>one</h1><h2>two</h2><h3>three</h3>');
    expect(blocks.map((b) => b.kind)).toStrictEqual(['heading1', 'heading2', 'heading3']);
  });

  it('numbers ordered lists and marks bullets', () => {
    const { blocks } = parseHtmlPreview('<ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>');
    expect(blocks.map((b) => b.kind)).toStrictEqual(['bullet', 'bullet', 'ordered', 'ordered']);
    expect(blocks[2].index).toBe(1);
    expect(blocks[3].index).toBe(2);
  });

  it('tracks nested list indent', () => {
    const { blocks } = parseHtmlPreview('<ul><li>a<ul><li>a1</li></ul></li></ul>');
    expect(blocks[0].indent).toBe(0);
    expect(blocks[1].indent).toBe(1);
  });

  it('parses 10Tap task lists with checked state', () => {
    const { blocks } = parseHtmlPreview(
      '<ul data-type="taskList">' +
        '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked></label><div><p>done</p></div></li>' +
        '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"></label><div><p>todo</p></div></li>' +
        '</ul>',
    );
    expect(blocks.map((b) => b.kind)).toStrictEqual(['task', 'task']);
    expect(blocks[0].checked).toBe(true);
    expect(blocks[0].spans.map((s) => s.text).join('')).toBe('done');
    expect(blocks[1].checked).toBe(false);
  });

  it('flags blockquote content', () => {
    const { blocks } = parseHtmlPreview('<blockquote><p>quoted</p></blockquote><p>after</p>');
    expect(blocks[0].quote).toBe(true);
    expect(blocks[0].spans[0].text).toBe('quoted');
    expect(blocks[1].quote).toBeUndefined();
  });

  it('decodes entities and collapses whitespace', () => {
    const { blocks } = parseHtmlPreview('<p>\n  a &amp;\n\n  b\n</p>');
    expect(blocks[0].spans).toStrictEqual([{ text: 'a & b' }]);
  });

  it('represents images with a token', () => {
    const { blocks } = parseHtmlPreview('<p>look <img src="x.png"> here</p>');
    expect(blocks[0].spans.map((s) => s.text).join('')).toBe('look [image] here');
  });

  it('truncates at maxBlocks', () => {
    const html = Array.from({ length: 9 }, (_, i) => `<p>p${i}</p>`).join('');
    const { blocks, truncated } = parseHtmlPreview(html, 6);
    expect(blocks).toHaveLength(6);
    expect(truncated).toBe(true);
  });

  it('does not flag truncation when content fits', () => {
    const { blocks, truncated } = parseHtmlPreview('<p>a</p><p>b</p>', 6);
    expect(blocks).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it('returns no blocks for empty input', () => {
    expect(parseHtmlPreview('').blocks).toHaveLength(0);
    expect(parseHtmlPreview('<p></p>').blocks).toHaveLength(0);
    expect(parseHtmlPreview(null).blocks).toHaveLength(0);
  });
});
