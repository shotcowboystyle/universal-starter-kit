import { describe, expect, it } from 'vitest';

import { parseMarkdown, parseMarkdownAsync } from './parser';

describe(parseMarkdown, () => {
  it('parses a heading', () => {
    const ast = parseMarkdown('# Hello');
    expect(ast.type).toBe('root');
    expect(ast.children).toHaveLength(1);
    expect(ast.children[0].type).toBe('heading');
    const heading = ast.children[0] as any;
    expect(heading.depth).toBe(1);
    expect(heading.children[0].value).toBe('Hello');
  });

  it('parses a paragraph', () => {
    const ast = parseMarkdown('Just some text.');
    expect(ast.children[0].type).toBe('paragraph');
  });

  it('parses inline formatting', () => {
    const ast = parseMarkdown('**bold** and *italic*');
    const paragraph = ast.children[0] as any;
    expect(paragraph.children[0].type).toBe('strong');
    expect(paragraph.children[2].type).toBe('emphasis');
  });

  it('parses an unordered list', () => {
    const ast = parseMarkdown('- item 1\n- item 2\n- item 3');
    expect(ast.children[0].type).toBe('list');
    const list = ast.children[0] as any;
    expect(list.ordered).toBe(false);
    expect(list.children).toHaveLength(3);
  });

  it('parses an ordered list', () => {
    const ast = parseMarkdown('1. first\n2. second');
    const list = ast.children[0] as any;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(true);
    expect(list.children).toHaveLength(2);
  });

  it('parses a code block', () => {
    const ast = parseMarkdown("```js\nconsole.log('hi');\n```");
    const code = ast.children[0] as any;
    expect(code.type).toBe('code');
    expect(code.lang).toBe('js');
    expect(code.value).toBe("console.log('hi');");
  });

  it('parses inline code', () => {
    const ast = parseMarkdown('Use `const x = 1` here.');
    const paragraph = ast.children[0] as any;
    const inlineCode = paragraph.children.find((c: any) => c.type === 'inlineCode');
    expect(inlineCode).toBeDefined();
    expect(inlineCode.value).toBe('const x = 1');
  });

  it('parses a blockquote', () => {
    const ast = parseMarkdown('> A quote');
    expect(ast.children[0].type).toBe('blockquote');
  });

  it('parses a link', () => {
    const ast = parseMarkdown('[example](https://example.com)');
    const paragraph = ast.children[0] as any;
    const link = paragraph.children[0];
    expect(link.type).toBe('link');
    expect(link.url).toBe('https://example.com');
    expect(link.children[0].value).toBe('example');
  });

  it('parses an image', () => {
    const ast = parseMarkdown('![alt text](image.png)');
    const paragraph = ast.children[0] as any;
    const image = paragraph.children[0];
    expect(image.type).toBe('image');
    expect(image.url).toBe('image.png');
    expect(image.alt).toBe('alt text');
  });

  it('parses a horizontal rule', () => {
    const ast = parseMarkdown('---');
    expect(ast.children[0].type).toBe('thematicBreak');
  });

  it('parses GFM tables', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const ast = parseMarkdown(md);
    expect(ast.children[0].type).toBe('table');
  });

  it('parses GFM strikethrough', () => {
    const ast = parseMarkdown('~~deleted~~');
    const paragraph = ast.children[0] as any;
    expect(paragraph.children[0].type).toBe('delete');
  });

  it('parses GFM task lists', () => {
    const ast = parseMarkdown('- [x] done\n- [ ] todo');
    const list = ast.children[0] as any;
    expect(list.children[0].checked).toBe(true);
    expect(list.children[1].checked).toBe(false);
  });

  it('handles empty input', () => {
    const ast = parseMarkdown('');
    expect(ast.type).toBe('root');
    expect(ast.children).toHaveLength(0);
  });

  it('handles complex multi-element markdown', () => {
    const md = '# Title\n\nParagraph.\n\n- item\n\n```\ncode\n```';
    const ast = parseMarkdown(md);
    expect(ast.children.length).toBeGreaterThanOrEqual(4);
  });
});

describe(parseMarkdownAsync, () => {
  it('returns the same AST as sync version', async () => {
    const md = '# Hello\n\nWorld';
    const syncAst = parseMarkdown(md);
    const asyncAst = await parseMarkdownAsync(md);
    expect(asyncAst).toEqual(syncAst);
  });
});
