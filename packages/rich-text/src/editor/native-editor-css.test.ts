import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it } from 'vitest';

import { getEditorCSS } from './editor-styles';
import { escapeNativeEditorCSS } from './native-editor-css';

// Execute the installed transport instead of copying its template-literal
// serializer. Only its unused native platform import needs a test stub.
const require = createRequire(import.meta.url);
interface TentapUtilsExports {
  getStyleSheetCSS?: (css: string, tag: string) => string;
}

const upstreamExports: TentapUtilsExports = {};
// oxlint-disable-next-line sonarjs/code-eval -- runs the installed tentap transport verbatim; that is what this suite verifies
runInNewContext(
  readFileSync(
    path.join(path.dirname(require.resolve('@10play/tentap-editor/package.json')), 'lib/commonjs/RichText/utils.js'),
    'utf-8',
  ),
  { exports: upstreamExports, require: () => ({ Platform: { OS: 'ios' } }) },
);
const { getStyleSheetCSS } = upstreamExports;
if (!getStyleSheetCSS) {
  throw new Error('@10play/tentap-editor RichText/utils no longer exports getStyleSheetCSS');
}

const injectCSS = (css: string, tag: string) => {
  const context = { document, cssContent: '' };
  // oxlint-disable-next-line sonarjs/code-eval -- executes the transport's generated injection script, as the WebView would
  runInNewContext(getStyleSheetCSS(escapeNativeEditorCSS(css), tag), context);
  return context.cssContent;
};

describe('native editor CSS transport', () => {
  afterEach(() => {
    for (const node of document.head.querySelectorAll('style[data-tag]')) {
      node.remove();
    }
    document.body.replaceChildren();
  });

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
    // oxlint-disable-next-line no-template-curly-in-string -- the literal `${...}` is the payload under test
    '.ProseMirror::before { content: "${document.body.textContent = \'executed\'}"; }',
  ])('keeps raw template characters literal: %s', (css) => {
    expect(injectCSS(css, 'content')).toBe(css);
    expect(document.body.textContent).toBe('');
  });

  it('replaces a tagged stylesheet without changing document contents', () => {
    const saved = document.createElement('div');
    saved.className = 'ProseMirror';
    const strong = document.createElement('strong');
    strong.textContent = 'text';
    saved.append('Saved ', strong);
    document.body.append(saved);
    injectCSS('.ProseMirror { padding: 2px; }', 'content');
    const next = getEditorCSS({ bodyFontFamily: 'Georgia, serif' });
    expect(injectCSS(next, 'content')).toBe(next);
    expect(document.querySelectorAll('style[data-tag="content"]')).toHaveLength(1);
    // oxlint-disable-next-line github/no-inner-html -- reads the serialized body to assert it is unchanged
    expect(document.body.innerHTML).toBe('<div class="ProseMirror">Saved <strong>text</strong></div>');
  });
});
