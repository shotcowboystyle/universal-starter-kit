import { Editor } from '@tiptap/core';
/**
 * VERIFY arm for LC-52 MARKDOWN-EXPRESSIBLE-EDITING.
 *
 * Proves the markdown capability surface is a real constraint, not a
 * visual one: non-markdown extensions are NOT registered on the editor
 * (their commands do not exist), and markdown in → edit → markdown out
 * round-trips for the whole GFM-expressible set.
 */
import { describe, expect, it } from 'vitest';

import type { EditorCommand } from '../types';

import { MARKDOWN_COMMANDS, isCommandInCapabilities } from './capabilities';
import { buildEditorExtensions } from './extensions';
import { htmlToMarkdown, markdownToHtml } from './markdown';

const createEditor = (capabilities: 'full' | 'markdown', content = '<p>hello</p>') =>
  new Editor({
    element: document.createElement('div'),
    extensions: buildEditorExtensions({ capabilities }),
    content,
  });

const NON_MARKDOWN_COMMANDS: EditorCommand[] = [
  'underline',
  'highlight',
  'textColor',
  'subscript',
  'superscript',
  'alignLeft',
  'alignCenter',
  'alignRight',
  'alignJustify',
  'mergeCells',
  'splitCell',
];

describe(isCommandInCapabilities, () => {
  it('allows everything in full capabilities', () => {
    for (const command of [...MARKDOWN_COMMANDS, ...NON_MARKDOWN_COMMANDS]) {
      expect(isCommandInCapabilities(command, 'full')).toBe(true);
    }
  });

  it('rejects non-markdown commands in markdown capabilities', () => {
    for (const command of NON_MARKDOWN_COMMANDS) {
      expect(isCommandInCapabilities(command, 'markdown')).toBe(false);
    }
  });

  it('keeps the GFM-expressible commands in markdown capabilities', () => {
    for (const command of MARKDOWN_COMMANDS) {
      expect(isCommandInCapabilities(command, 'markdown')).toBe(true);
    }
  });
});

describe('markdown capabilities: extension registration', () => {
  it('does not register underline/highlight/color/align/sub/sup extensions', () => {
    const editor = createEditor('markdown');
    const names = new Set(editor.extensionManager.extensions.map((e) => e.name));
    expect(names.has('underline')).toBe(false);
    expect(names.has('highlight')).toBe(false);
    expect(names.has('textStyle')).toBe(false);
    expect(names.has('color')).toBe(false);
    expect(names.has('textAlign')).toBe(false);
    expect(names.has('subscript')).toBe(false);
    expect(names.has('superscript')).toBe(false);
    expect(names.has('inlineMath')).toBe(false);
    expect(names.has('details')).toBe(false);
    editor.destroy();
  });

  it('commands markdown cannot express do not exist on the editor', () => {
    const editor = createEditor('markdown');
    const { commands } = editor;
    expect(commands).not.toHaveProperty('toggleUnderline');
    expect(commands).not.toHaveProperty('toggleHighlight');
    expect(commands).not.toHaveProperty('setColor');
    expect(commands).not.toHaveProperty('setTextAlign');
    expect(commands).not.toHaveProperty('toggleSubscript');
    expect(commands).not.toHaveProperty('toggleSuperscript');
    editor.destroy();
  });

  it('full capabilities keep the whole surface (control)', () => {
    const editor = createEditor('full');
    const names = new Set(editor.extensionManager.extensions.map((e) => e.name));
    expect(names.has('underline')).toBe(true);
    expect(names.has('highlight')).toBe(true);
    expect(names.has('textAlign')).toBe(true);
    const { commands } = editor;
    expect(commands).toHaveProperty('toggleUnderline', expect.any(Function));
    expect(commands).toHaveProperty('toggleHighlight', expect.any(Function));
    editor.destroy();
  });

  it('keeps the markdown-expressible surface registered', () => {
    const editor = createEditor('markdown');
    const { commands } = editor;
    for (const name of [
      'toggleBold',
      'toggleItalic',
      'toggleStrike',
      'toggleCode',
      'toggleHeading',
      'toggleBulletList',
      'toggleOrderedList',
      'toggleTaskList',
      'toggleBlockquote',
      'toggleCodeBlock',
      'setLink',
      'setImage',
      'setHorizontalRule',
      'insertTable',
    ]) {
      expect(commands).toHaveProperty(name, expect.any(Function));
    }
    editor.destroy();
  });

  it('parses pasted underline/highlight HTML without those marks', () => {
    const editor = createEditor('markdown', '<p><u>under</u> and <mark>marked</mark> and <strong>bold</strong></p>');
    const html = editor.getHTML();
    expect(html).not.toContain('<u>');
    expect(html).not.toContain('<mark>');
    expect(html).toContain('<strong>bold</strong>');
    editor.destroy();
  });
});

const roundTrip = (markdown: string): string => {
  const editor = createEditor('markdown', markdownToHtml(markdown));
  const out = htmlToMarkdown(editor.getHTML());
  editor.destroy();
  return out;
};

describe('markdown round-trip (markdown in → edit → markdown out)', () => {
  it('preserves headings, emphasis, strike, and inline code', () => {
    const out = roundTrip('# Title\n\nSome **bold** and _italic_ and ~~gone~~ and `code` text.\n\n## Sub');
    expect(out).toContain('# Title');
    expect(out).toContain('**bold**');
    expect(out).toContain('_italic_');
    expect(out).toContain('~~gone~~');
    expect(out).toContain('`code`');
    expect(out).toContain('## Sub');
  });

  it('preserves bullet, ordered, and task lists', () => {
    const out = roundTrip('- one\n- two\n\n1. first\n2. second\n\n- [x] done\n- [ ] todo');
    expect(out).toMatch(/[-*] {1,3}one/u);
    expect(out).toMatch(/1\. {1,2}first/u);
    expect(out).toContain('[x] done');
    expect(out).toContain('[ ] todo');
  });

  it('preserves blockquotes, fenced code, hr, links, and images', () => {
    const out = roundTrip(
      '> quoted\n\n```js\nconst a = 1;\n```\n\n---\n\n[site](https://example.com) ![alt](https://example.com/i.png)',
    );
    expect(out).toContain('> quoted');
    expect(out).toContain('```');
    expect(out).toContain('const a = 1;');
    // any valid markdown thematic break (turndown emits "* * *")
    expect(out).toMatch(/^(?:-{3,}|_{3,}|(?:\* ?){3,})$/mu);
    expect(out).toContain('[site](https://example.com)');
    expect(out).toContain('![alt](https://example.com/i.png)');
  });

  it('preserves GFM pipe tables', () => {
    const out = roundTrip('| Name | Role |\n| --- | --- |\n| Ada | Analyst |');
    expect(out).toContain('| Name | Role |');
    expect(out).toContain('| --- | --- |');
    expect(out).toContain('| Ada | Analyst |');
  });

  it('edits made through markdown commands serialize to markdown', () => {
    const editor = createEditor('markdown', markdownToHtml('plain text'));
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(htmlToMarkdown(editor.getHTML())).toContain('**plain text**');
    editor.destroy();
  });
});
