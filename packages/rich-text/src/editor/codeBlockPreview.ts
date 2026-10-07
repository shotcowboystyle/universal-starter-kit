/**
 * Code block with live below-block preview for `mermaid` and `math`
 * languages — GitLab content-editor parity.
 *
 * The code stays a normal editable code block (language picker, copy,
 * tab-indent, lowlight all keep working through contentDOM); when the
 * language is `mermaid` or `math` a preview pane renders below the source:
 *
 * - mermaid: SVG via the canonical `@repo/markdown` renderer
 *   (LC-16 — one implementation; the engine is dynamically imported on the
 *   first diagram, zero eager bytes).
 * - math: display-mode KaTeX via lazyKatex (same discipline).
 *
 * Re-renders are debounced while typing; the previous preview stays
 * visible until the new one lands (no flicker). Invalid source shows the
 * parse error in the pane (Axiom 6: show the error, never blank).
 *
 * `$$ ` at the start of a line opens a math block (GitLab-style display
 * math input); ```mermaid and ```math fences already work through the
 * inherited code block input rule.
 */

import { Extension, textblockTypeInputRule } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';

import { t } from '../shared/t';

import { mountKatexHtml, renderKatexHtml } from './lazyKatex';

// ===========================================================================
// Preview chrome (theme scheme pushed by the editor host)
// ===========================================================================

export interface PreviewChrome {
  /** Color scheme forwarded to the diagram/math renderers */
  scheme: 'light' | 'dark';
  /** CSS font family forwarded to mermaid's theme config */
  fontFamily?: string;
}

interface PreviewChromeStorage {
  value: PreviewChrome;
  listeners: Set<() => void>;
}

declare module '@tiptap/core' {
  interface Storage {
    previewChrome: PreviewChromeStorage;
  }
}

/**
 * Storage-only extension carrying the resolved scheme for block previews.
 * The editor host pushes values (setPreviewChrome) from React land; node
 * views subscribe so a theme flip re-renders live diagrams.
 */
export const PreviewChromeStore = Extension.create({
  name: 'previewChrome',
  addStorage(): PreviewChromeStorage {
    return { value: { scheme: 'light' }, listeners: new Set() };
  },
});

export function setPreviewChrome(editor: Editor, chrome: PreviewChrome): void {
  const storage = editor.storage.previewChrome;
  if (!storage) {
    return;
  }
  if (storage.value.scheme === chrome.scheme && storage.value.fontFamily === chrome.fontFamily) {
    return;
  }
  storage.value = chrome;
  for (const listener of storage.listeners) {
    listener();
  }
}

function getPreviewChrome(editor: Editor): PreviewChrome {
  return editor?.storage?.previewChrome?.value ?? { scheme: 'light' };
}

// ===========================================================================
// Preview languages
// ===========================================================================

export const PREVIEW_LANGUAGES = ['mermaid', 'math'] as const;
export type PreviewLanguage = (typeof PREVIEW_LANGUAGES)[number];

export function getPreviewKind(language: string | null | undefined): PreviewLanguage | null {
  return (PREVIEW_LANGUAGES as readonly string[]).includes(language ?? '') ? (language as PreviewLanguage) : null;
}

const PREVIEW_DEBOUNCE_MS = 250;

// ===========================================================================
// Extension
// ===========================================================================

export const CodeBlockWithPreview = CodeBlockLowlight.extend({
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      // `$$ ` opens a math block (GitLab display math), mirroring ```math
      textblockTypeInputRule({
        find: /^\$\$\s$/,
        type: this.type,
        getAttributes: { language: 'math' },
      }),
    ];
  },

  addNodeView() {
    return ({ node, editor, extension }) => {
      const languageClassPrefix: string = extension.options.languageClassPrefix ?? 'language-';

      const dom = document.createElement('div');
      dom.className = 'rt-codeblock';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.append(code);
      dom.append(pre);
      const preview = document.createElement('div');
      preview.className = 'rt-block-preview';
      preview.contentEditable = 'false';
      preview.dataset.state = 'hidden';
      dom.append(preview);

      let currentNode = node;
      let destroyed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let renderSeq = 0;
      let renderedKey: string | null = null;

      const applyLanguageClass = () => {
        const language = currentNode.attrs.language as string | null;
        code.className = language ? `${languageClassPrefix}${language}` : '';
        const kind = getPreviewKind(language);
        if (kind) {
          preview.dataset.previewType = kind;
        } else {
          delete preview.dataset.previewType;
        }
      };

      const showError = (message: string) => {
        const el = document.createElement('div');
        el.className = 'rt-preview-error';
        el.setAttribute('role', 'alert');
        // Axiom 6: surface the parse error, never a blank pane
        el.textContent = message;
        preview.replaceChildren(el);
        preview.dataset.state = 'error';
      };

      const showHost = (host: HTMLElement) => {
        preview.replaceChildren(host);
        preview.dataset.state = 'ok';
      };

      const renderPreview = async () => {
        const kind = getPreviewKind(currentNode.attrs.language);
        if (!kind || destroyed) {
          return;
        }
        const source = currentNode.textContent;
        const chrome = getPreviewChrome(editor);
        const key = `${kind}|${chrome.scheme}|${source}`;
        if (key === renderedKey) {
          return;
        }
        const seq = ++renderSeq;

        if (!source.trim()) {
          renderedKey = key;
          const hint = document.createElement('div');
          hint.className = 'rt-preview-hint';
          hint.textContent = kind === 'mermaid' ? t('Type a mermaid diagram') : t('Type a TeX expression');
          preview.replaceChildren(hint);
          preview.dataset.state = 'empty';
          return;
        }

        if (kind === 'mermaid') {
          // canonical lazy renderer (LC-16) via the dedicated dependency-
          // free subpath entry — the editor chunk carries zero mermaid
          // bytes, and the markdown barrel's closure never becomes
          // graph-reachable (chunk-group tests would pin it eager)
          const markdown = await import('@repo/markdown/mermaid');
          const result = await markdown.renderMermaidDiagram(source, {
            scheme: chrome.scheme,
            fontFamily: chrome.fontFamily,
          });
          if (destroyed || seq !== renderSeq) {
            return;
          }
          renderedKey = key;
          if (result.ok) {
            const host = document.createElement('div');
            host.className = 'rt-preview-diagram';
            host.setAttribute('role', 'img');
            host.setAttribute('aria-label', t('Mermaid diagram preview'));
            if (markdown.mountDiagramSvg(host, result.svg)) {
              showHost(host);
            } else {
              showError(t('Diagram produced no output'));
            }
          } else {
            showError(result.error);
          }
          return;
        }

        const result = await renderKatexHtml(source, { displayMode: true });
        if (destroyed || seq !== renderSeq) {
          return;
        }
        renderedKey = key;
        if (result.ok) {
          const host = document.createElement('div');
          host.className = 'rt-preview-math';
          host.setAttribute('role', 'img');
          host.setAttribute('aria-label', source);
          mountKatexHtml(host, result.html);
          showHost(host);
        } else {
          showError(result.error);
        }
      };

      const sync = (immediate = false) => {
        applyLanguageClass();
        if (timer) {
          clearTimeout(timer);
        }
        const kind = getPreviewKind(currentNode.attrs.language);
        if (!kind) {
          preview.replaceChildren();
          preview.dataset.state = 'hidden';
          renderedKey = null;
          return;
        }
        if (preview.dataset.state === 'hidden') {
          const hint = document.createElement('div');
          hint.className = 'rt-preview-hint';
          hint.textContent = t('Rendering preview…');
          preview.replaceChildren(hint);
          preview.dataset.state = 'loading';
        }
        timer = setTimeout(() => void renderPreview(), immediate ? 0 : PREVIEW_DEBOUNCE_MS);
      };

      const themeListener = () => {
        renderedKey = null;
        sync(true);
      };
      editor.storage.previewChrome?.listeners.add(themeListener);

      sync(true);

      return {
        dom,
        contentDOM: code,
        update: (updatedNode) => {
          if (updatedNode.type !== currentNode.type) {
            return false;
          }
          const languageChanged = updatedNode.attrs.language !== currentNode.attrs.language;
          const textChanged = updatedNode.textContent !== currentNode.textContent;
          currentNode = updatedNode;
          if (languageChanged || textChanged) {
            sync(languageChanged);
          }
          return true;
        },
        ignoreMutation: (mutation) => {
          if (mutation.type === 'selection') {
            return false;
          }
          // the preview pane is chrome, not document content
          return !code.contains(mutation.target);
        },
        destroy: () => {
          destroyed = true;
          if (timer) {
            clearTimeout(timer);
          }
          editor.storage.previewChrome?.listeners.delete(themeListener);
        },
      };
    };
  },
});
