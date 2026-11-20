/**
 * Inline math node (`$x^2$`) rendered with lazy-loaded KaTeX — GitLab
 * parity for dollar math in the rich text editor.
 *
 * - Typing `$latex$` converts to a rendered formula (input rule; prices
 *   like "$5 and $10" never convert — content cannot start/end with
 *   whitespace).
 * - The node is an inline atom carrying the raw TeX in `data-latex`; the
 *   MathBubble edits it in place (updateInlineMath command).
 * - Invalid TeX shows the raw source in an error style with the KaTeX
 *   parse message (Axiom 6: show the error, never blank).
 * - Block math (`$$ ... $$`) is a code block with language "math" — see
 *   code-block-preview.ts — matching GitLab's ```math fence model.
 *
 * Serialization: `<span data-type="inline-math" data-latex="...">` <->
 * `$...$` (editor/markdown.ts), so the source toggle is lossless.
 */

import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import type { Attrs } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';

import { t } from '../shared/t';

import { mountKatexHtml, renderKatexHtml } from './lazy-katex';

export interface InlineMathOptions {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Tiptap's HTMLAttributes option contract, passed to mergeAttributes
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      /** Inserts an inline math node and selects it (opens the MathBubble) */
      insertInlineMath: (attributes?: { latex?: string }) => ReturnType;
      /** Updates the latex of the selected inline math node */
      updateInlineMath: (attributes: { latex: string }) => ReturnType;
    };
  }
}

/**
 * Matches `$...$` as the last thing typed. match[1] (`dollar`) is the dollar
 * span (what the node replaces; nodeInputRule reads it by index), match[2]
 * (`latex`) the TeX. The character before the
 * opening `$` must not be another `$` (that is block math), and content
 * cannot start/end with whitespace or contain `$`/newlines.
 */
export const INLINE_MATH_INPUT_RULE = /(?:^|[^$])(?<dollar>\$(?<latex>[^$\n \t](?:[^$\n]*[^$\n \t])?)\$)$/u;

const MATH_ERROR_CLASS = 'rt-math-error';

/** The node's TeX source ('' when the attribute is missing) */
const latexOf = (attrs: Attrs): string => String(attrs.latex ?? '');

export const InlineMath = Node.create<InlineMathOptions>({
  name: 'inlineMath',
  inline: true,
  group: 'inline',
  atom: true,
  marks: '',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.dataset.latex ?? element.textContent ?? '',
        renderHTML: (attributes) => ({ 'data-latex': latexOf(attributes) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // raw TeX as text content: non-web surfaces (native preview, plain
    // parsers) degrade to readable source
    return [
      'span',
      mergeAttributes({ 'data-type': 'inline-math' }, this.options.HTMLAttributes, HTMLAttributes),
      node.attrs.latex,
    ];
  },

  addCommands() {
    return {
      insertInlineMath:
        (attributes) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const pos = tr.selection.from;
            tr.replaceSelectionWith(this.type.create({ latex: attributes?.latex ?? '' }), false);
            tr.setSelection(NodeSelection.create(tr.doc, pos));
            tr.scrollIntoView();
          }
          return true;
        },
      updateInlineMath:
        (attributes) =>
        ({ tr, dispatch }) => {
          const { selection } = tr;
          if (!(selection instanceof NodeSelection) || selection.node.type !== this.type) {
            return false;
          }
          if (dispatch) {
            const pos = selection.from;
            tr.setNodeMarkup(pos, undefined, { latex: attributes.latex });
            tr.setSelection(NodeSelection.create(tr.doc, pos));
          }
          return true;
        },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: INLINE_MATH_INPUT_RULE,
        type: this.type,
        getAttributes: (match) => ({ latex: match.groups?.latex ?? '' }),
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'rt-math-inline';
      dom.dataset.type = 'inline-math';
      dom.contentEditable = 'false';

      let currentLatex: string | null = null;
      let destroyed = false;

      const mountKatex = async (latex: string) => {
        const result = await renderKatexHtml(latex);
        if (destroyed || currentLatex !== latex) {
          return;
        }
        if (result.ok) {
          mountKatexHtml(dom, result.html);
          dom.classList.remove(MATH_ERROR_CLASS);
          dom.removeAttribute('title');
          dom.setAttribute('role', 'img');
          dom.setAttribute('aria-label', latex);
        } else {
          // Axiom 6: raw source + parse message, never a blank chip
          dom.textContent = latex;
          dom.classList.add(MATH_ERROR_CLASS);
          dom.title = result.error;
        }
      };

      const render = (latex: string) => {
        if (destroyed || latex === currentLatex) {
          return;
        }
        currentLatex = latex;
        dom.dataset.latex = latex;
        if (!latex.trim()) {
          dom.classList.add('rt-math-empty');
          dom.classList.remove(MATH_ERROR_CLASS);
          dom.removeAttribute('title');
          dom.textContent = t('math');
          return;
        }
        dom.classList.remove('rt-math-empty');
        // raw TeX stays visible while KaTeX loads (first render only)
        dom.textContent = latex;
        void mountKatex(latex);
      };

      render(latexOf(node.attrs));

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'inlineMath') {
            return false;
          }
          render(latexOf(updatedNode.attrs));
          return true;
        },
        ignoreMutation: () => true,
        destroy: () => {
          destroyed = true;
        },
      };
    };
  },
});
