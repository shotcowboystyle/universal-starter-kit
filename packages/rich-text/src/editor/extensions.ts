/**
 * Extension factory for the web Tiptap editor.
 *
 * One canonical list (LC-16) consumed by TiptapEditor AND by the
 * capability specs, so what ships is exactly what is verified. With
 * `capabilities: "markdown"` the non-markdown extensions are NOT
 * registered — their commands do not exist on the editor (LC-52
 * MARKDOWN-EXPRESSIBLE-EDITING), and StarterKit's underline sub-extension
 * is disabled.
 */

import { Extension } from '@tiptap/core';
import type { Extensions } from '@tiptap/core';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import CharacterCount from '@tiptap/extension-character-count';
import { Color } from '@tiptap/extension-color';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Highlight } from '@tiptap/extension-highlight';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import Image from '@tiptap/extension-image';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import Placeholder from '@tiptap/extension-placeholder';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import TaskItem from '@tiptap/extension-task-item';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import TaskList from '@tiptap/extension-task-list';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import Typography from '@tiptap/extension-typography';
// oxlint-disable-next-line import/no-named-as-default -- several suites vi.mock this module with only a `default` export
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

import { t } from '../shared/t';
import type { EditorCapabilities } from '../types';

import { BlockDragHandle } from './block-drag-handle';
import { MARKDOWN_EXCLUDED_SLASH_IDS } from './capabilities';
import { CodeBlockWithPreview, PreviewChromeStore } from './code-block-preview';
import { EmojiSuggestion } from './emoji';
import { MarkdownPaste } from './markdown-paste';
import { InlineMath } from './mathematics';
import { MediaUpload } from './media';
import { SlashCommands } from './SlashCommands';
import { SuggestionChromeStore } from './suggestion-popup';

const lowlight = createLowlight(common);

/**
 * Tab / Shift-Tab indentation inside code blocks.
 * Inserts or removes 2 spaces at the cursor (or start of each selected line).
 */
export const CodeBlockTabIndent = Extension.create({
  name: 'codeBlockTabIndent',
  addKeyboardShortcuts() {
    return {
      // oxlint-disable-next-line sonarjs/function-name -- ProseMirror keymap key, not a function name
      Tab: ({ editor }) => {
        if (!editor.isActive('codeBlock')) {
          return false;
        }
        const { state, dispatch } = editor.view;
        const { from, to } = state.selection;

        if (from === to) {
          dispatch(state.tr.insertText('  ', from, to));
          return true;
        }

        const { doc } = state;
        const lines: { start: number }[] = [];
        doc.nodesBetween(from, to, (node, pos) => {
          if (node.isTextblock) {
            lines.push({ start: pos + 1 });
          }
        });
        if (lines.length === 0) {
          dispatch(state.tr.insertText('  ', from, to));
          return true;
        }

        let { tr } = state;
        let offset = 0;
        for (const line of lines) {
          const lineStart = line.start + offset;
          tr = tr.insertText('  ', lineStart);
          offset += 2;
        }
        dispatch(tr);
        return true;
      },
      'Shift-Tab': ({ editor }) => {
        if (!editor.isActive('codeBlock')) {
          return false;
        }
        const { state, dispatch } = editor.view;
        const { from, to, $from } = state.selection;

        if (from === to) {
          const lineStart = from - $from.parentOffset;
          const text = state.doc.textBetween(lineStart, from);
          const leadingSpaces = /^ {1,2}/u.exec(text)?.[0];
          if (leadingSpaces !== undefined) {
            dispatch(state.tr.delete(lineStart, lineStart + leadingSpaces.length));
          }
          return true;
        }

        const { doc } = state;
        let { tr } = state;
        let offset = 0;
        doc.nodesBetween(from, to, (node, pos) => {
          if (node.isTextblock) {
            const lineStart = pos + 1 + offset;
            const text = tr.doc.textBetween(lineStart, Math.min(lineStart + node.content.size, tr.doc.content.size));
            const leadingSpaces = /^ {1,2}/u.exec(text)?.[0];
            if (leadingSpaces !== undefined) {
              tr = tr.delete(lineStart, lineStart + leadingSpaces.length);
              offset -= leadingSpaces.length;
            }
          }
        });
        dispatch(tr);
        return true;
      },
    };
  },
});

/**
 * Override Shift-Enter and Mod-Enter to create new paragraphs instead of
 * hard breaks (<br>). Mirrors GitLab's approach: HardBreak node stays
 * registered (so <br> in pasted HTML is preserved) but its keyboard
 * shortcuts are replaced with the default enter (split paragraph) behavior.
 */
export const ParagraphEnterKeys = Extension.create({
  name: 'paragraphEnterKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Shift-Enter': ({ editor }) =>
        editor.commands.first([
          () => editor.commands.newlineInCode(),
          () => editor.commands.splitListItem('listItem'),
          () => editor.commands.createParagraphNear(),
          () => editor.commands.liftEmptyBlock(),
          () => editor.commands.splitBlock(),
        ]),
      'Mod-Enter': ({ editor }) =>
        editor.commands.first([
          () => editor.commands.newlineInCode(),
          () => editor.commands.createParagraphNear(),
          () => editor.commands.liftEmptyBlock(),
          () => editor.commands.splitBlock(),
        ]),
    };
  },
});

/**
 * Tab/Shift-Tab indent/dedent and Alt+Arrow move for list items.
 * Tab sinks (indents), Shift-Tab lifts (dedents).
 * Alt+Up/Down moves the list item up or down among siblings.
 */
export const ListItemKeys = Extension.create({
  name: 'listItemKeys',
  addKeyboardShortcuts() {
    return {
      // oxlint-disable-next-line sonarjs/function-name -- ProseMirror keymap key, not a function name
      Tab: ({ editor }) => {
        if (editor.isActive('codeBlock')) {
          return false;
        }
        if (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')) {
          return editor.commands.sinkListItem('listItem') || editor.commands.sinkListItem('taskItem');
        }
        return false;
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('codeBlock')) {
          return false;
        }
        if (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')) {
          return editor.commands.liftListItem('listItem') || editor.commands.liftListItem('taskItem');
        }
        return false;
      },
    };
  },
});

// ===========================================================================
// Factory
// ===========================================================================

export interface BuildEditorExtensionsOptions {
  /** Capability preset (default "full") */
  capabilities?: EditorCapabilities;
  /** Placeholder text (defaults to the translated "Start writing...") */
  placeholder?: string;
  /** Pre-built mention extension (ignored in markdown capabilities) */
  mentionExtension?: Extensions[number] | null;
}

/** Build the production extension list for the given capability surface */
export const buildEditorExtensions = ({
  capabilities = 'full',
  placeholder,
  mentionExtension = null,
}: BuildEditorExtensionsOptions = {}): Extensions => {
  const markdown = capabilities === 'markdown';

  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
        HTMLAttributes: { dir: 'auto' },
      },
      paragraph: {
        HTMLAttributes: { dir: 'auto' },
      },
      link: {
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      },
      bulletList: {
        keepMarks: true,
      },
      orderedList: {
        keepMarks: true,
      },
      codeBlock: false,
      hardBreak: false,
      // Markdown has no underline syntax — the mark must not exist
      ...(markdown && { underline: false }),
    }),
    CodeBlockWithPreview.configure({
      lowlight,
      exitOnTripleEnter: true,
      exitOnArrowDown: false,
    }),
    ParagraphEnterKeys,
    CodeBlockTabIndent,
    ListItemKeys,
    // superscriptTwo/Three would mangle typed TeX (`$E=mc^2$` became
    // `E=mc²` before the math input rule ran) — off, rest stays.
    Typography.configure({
      superscriptTwo: false,
      superscriptThree: false,
    }),
    CharacterCount,
    SlashCommands.configure({
      excludeIds: markdown ? [...MARKDOWN_EXCLUDED_SLASH_IDS] : [],
    }),
    MarkdownPaste,
    MediaUpload,
    SuggestionChromeStore,
    PreviewChromeStore,
    // Emoji suggestions insert plain unicode characters (just text), so
    // they stay available in markdown capabilities.
    EmojiSuggestion,
    ...(markdown
      ? []
      : [
          InlineMath,
          // Collapsible sections (GitLab <details> parity). persist: true
          // is the extension's supported mode: its node view re-syncs the
          // open state from node.attrs on every update, so ephemeral
          // (persist: false) toggles get reverted by the next transaction.
          // The open state therefore lives in the doc and serializes as
          // `<details open>` — valid GitLab markdown.
          Details.configure({ persist: true }),
          DetailsSummary,
          DetailsContent,
        ]),
    // Mention chips have no markdown representation — full surface only
    ...(mentionExtension && !markdown ? [mentionExtension] : []),
    BlockDragHandle,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: placeholder ?? t('Start writing...'),
    }),
    ...(markdown
      ? []
      : [
          TextAlign.configure({
            types: ['heading', 'paragraph'],
            defaultAlignment: 'left',
          }),
          TextStyle,
          Color,
          Highlight.configure({
            multicolor: true,
          }),
          Subscript,
          Superscript,
        ]),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Image.configure({
      inline: true,
      allowBase64: true,
    }),
  ];
};
