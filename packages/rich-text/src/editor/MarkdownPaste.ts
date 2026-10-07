/**
 * Extension that intercepts paste events containing markdown-formatted plain
 * text and converts it to HTML before insertion. If the clipboard already
 * contains HTML (e.g. from a web page), the default paste behavior is used.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { marked } from 'marked';

const MARKDOWN_PATTERN = /(?:^#{1,6}\s|^\*\s|^-\s|^\d+\.\s|```|^\[.+\]\(.+\)|^\*\*|^>\s)/m;

function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_PATTERN.test(text);
}

export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste(view, event) {
            const { clipboardData } = event;
            if (!clipboardData) {
              return false;
            }

            const hasHTML = clipboardData.types.includes('text/html');
            if (hasHTML) {
              return false;
            }

            const text = clipboardData.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) {
              return false;
            }

            event.preventDefault();

            const html = marked.parse(text, { async: false });
            editor.commands.insertContent(html, {
              parseOptions: { preserveWhitespace: false },
            });

            return true;
          },
        },
      }),
    ];
  },
});
