import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it } from 'vitest';

import { getEditorCSS } from './editorStyles';
import { escapeNativeEditorCSS } from './nativeEditorCSS';

// Execute the installed transport instead of copying its template-literal
// serializer. Only its unused native platform import needs a test stub.
const require = createRequire(import.meta.url);
const upstreamExports: Record<string, any> = {};
runInNewContext(
  readFileSync(
    path.join(path.dirname(require.resolve('@10play/tentap-editor/package.json')), 'lib/commonjs/RichText/utils.js'),
    'utf-8',
  ),
  { exports: upstreamExports, require: () => ({ Platform: { OS: 'ios' } }) },
);

function injectCSS(css: string, tag: string) {
  const context = { document, cssContent: '' };
  runInNewContext(upstreamExports.getStyleSheetCSS(escapeNativeEditorCSS(css), tag), context);
  return context.cssContent;
}

afterEach(() => {
  document.head.querySelectorAll('style[data-tag]').forEach((node) => {
    node.remove();
  });
  document.body.innerHTML = '';
});

describe('native editor CSS transport', () => {
  it('delivers the full content stylesheet and its typing inset', () => {
    const css = getEditorCSS({
      bodyFontFamily: 'system-ui, sans-serif',
      fullscreen: true,
      motionMs: 0,
    });
    expect(injectCSS(css, 'content')).toBe(css);
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    document.body.append(editor);
    expect(getComputedStyle(editor).paddingLeft).toBe('16px');
    expect(getComputedStyle(editor).paddingRight).toBe('12px');
    expect(getComputedStyle(editor).fontFamily).toBe('system-ui, sans-serif');
  });

  it('preserves CSS escapes and literal template syntax without executing it', () => {
    const css = String.raw`.ProseMirror::before { content: "\25B8 \` \${document.body.textContent = "executed"}"; }`;
    expect(injectCSS(css, 'content')).toBe(css);
    expect(document.body.textContent).toBe('');
  });

  it.each([
    '.ProseMirror::before { content: "`"; }',
    '.ProseMirror::before { content: "${document.body.textContent = \'executed\'}"; }',
  ])('keeps raw template characters literal: %s', (css) => {
    expect(injectCSS(css, 'content')).toBe(css);
    expect(document.body.textContent).toBe('');
  });

  it('replaces a tagged stylesheet without changing document contents', () => {
    document.body.innerHTML = '<div class="ProseMirror">Saved <strong>text</strong></div>';
    injectCSS('.ProseMirror { padding: 2px; }', 'content');
    const next = getEditorCSS({ bodyFontFamily: 'Georgia, serif' });
    expect(injectCSS(next, 'content')).toBe(next);
    expect(document.querySelectorAll('style[data-tag="content"]')).toHaveLength(1);
    expect(document.body.innerHTML).toBe('<div class="ProseMirror">Saved <strong>text</strong></div>');
  });
});
