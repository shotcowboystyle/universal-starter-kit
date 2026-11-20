/**
 * Slash commands extension -- type "/" to open a searchable menu of block
 * types. Uses @tiptap/suggestion for trigger/matching and the shared
 * suggestion popup (LC-16: same list, rows, chrome, and keyboard handling
 * as the @ mention menu).
 */

import {
  CaretCircleDownIcon,
  CodeIcon,
  FunctionIcon,
  ImageIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  MathOperationsIcon,
  MinusIcon,
  QuotesIcon,
  SmileyIcon,
  TableIcon,
  TextHOneIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextTIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react';
import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';

import { t } from '../shared/t';

import { createSuggestionRenderer, getSuggestionChrome } from './suggestion-popup';
import type { SuggestionRow } from './suggestion-popup';

// ===========================================================================
// Slash Command Items
// ===========================================================================

export interface SlashCommandItem {
  /** Stable identifier (also the row key) */
  id: string;
  /** Translated display title */
  title: string;
  /** Translated one-line description */
  description: string;
  icon: SuggestionRow['icon'];
  command: (props: { editor: Editor; range: Range }) => void;
}

const insertImageFromSlash = (editor: Editor, range: Range) => {
  const handlers = editor.storage.mediaUpload?.handlers ?? {};
  const upload = handlers.onImageUpload;
  if (upload && typeof document !== 'undefined') {
    // Upload hook wired: offer the OS file picker and insert the uploaded URL
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- the listener catches its own errors; DOM ignores the return value
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      try {
        const src = await upload(file);
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setImage({ src, alt: file.name.replace(/\.[a-z0-9]+$/iu, '') })
          .run();
      } catch (error) {
        console.warn('[rich-text] image upload failed:', error);
      }
    });
    input.click();
    return;
  }
  // No uploader: fall back to a URL prompt
  // oxlint-disable-next-line no-alert -- documented last-resort fallback when the host wires no upload handler
  const url = window.prompt(t('Image URL:'));
  if (url !== null && url !== '') {
    editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
  }
};

const ICON_SIZE = 16;

const getSlashItems = (): SlashCommandItem[] => [
  {
    id: 'text',
    title: t('Text'),
    description: t('Plain paragraph text'),
    icon: <TextTIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    id: 'heading1',
    title: t('Heading 1'),
    description: t('Large section heading'),
    icon: <TextHOneIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    id: 'heading2',
    title: t('Heading 2'),
    description: t('Medium section heading'),
    icon: <TextHTwoIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    id: 'heading3',
    title: t('Heading 3'),
    description: t('Small section heading'),
    icon: <TextHThreeIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    id: 'bulletList',
    title: t('Bullet List'),
    description: t('Unordered list with bullets'),
    icon: <ListBulletsIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'orderedList',
    title: t('Numbered List'),
    description: t('Ordered list with numbers'),
    icon: <ListNumbersIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: 'taskList',
    title: t('Task List'),
    description: t('List with checkboxes'),
    icon: <ListChecksIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: 'codeBlock',
    title: t('Code Block'),
    description: t('Fenced code with syntax highlighting'),
    icon: <CodeIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: 'blockquote',
    title: t('Blockquote'),
    description: t('Quoted text block'),
    icon: <QuotesIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: 'horizontalRule',
    title: t('Horizontal Rule'),
    description: t('Visual divider line'),
    icon: <MinusIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: 'table',
    title: t('Table'),
    description: t('Insert a 3\u00D73 table'),
    icon: <TableIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    id: 'image',
    title: t('Image'),
    description: t('Upload or embed an image'),
    icon: <ImageIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      insertImageFromSlash(editor, range);
    },
  },
  {
    id: 'mermaid',
    title: t('Mermaid Diagram'),
    description: t('Diagram code with live preview'),
    icon: <TreeStructureIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock({ language: 'mermaid' }).run();
    },
  },
  {
    id: 'mathBlock',
    title: t('Math Block'),
    description: t('Display TeX math with live preview'),
    icon: <MathOperationsIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock({ language: 'math' }).run();
    },
  },
  {
    id: 'inlineMath',
    title: t('Inline Math'),
    description: t('TeX formula in the text flow'),
    icon: <FunctionIcon size={ICON_SIZE} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertInlineMath().run();
    },
  },
  {
    id: 'details',
    title: t('Collapsible Section'),
    description: t('Expandable details with a summary'),
    icon: <CaretCircleDownIcon size={ICON_SIZE} />,
    // open: true so the freshly inserted section is expanded for typing
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setDetails().updateAttributes('details', { open: true }).run();
    },
  },
  {
    id: 'emoji',
    title: t('Emoji'),
    description: t('Search emoji by name'),
    icon: <SmileyIcon size={ICON_SIZE} />,
    // inserting ":" hands off to the emoji suggestion popup
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent(':').run();
    },
  },
];

// ===========================================================================
// SlashCommands Extension
// ===========================================================================

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    const excludeIds: string[] = [];
    return {
      /**
       * Item ids removed from the menu (capability gating — e.g. markdown
       * capabilities exclude math/details, which GFM cannot express).
       */
      excludeIds,
      suggestion: {
        char: '/',
        startOfLine: false,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return getSlashItems().filter(
            (item) => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
          );
        },
        render: createSuggestionRenderer<SlashCommandItem>({
          toRow: (item) => ({
            key: item.id,
            title: item.title,
            description: item.description,
            icon: item.icon,
          }),
          getChrome: getSuggestionChrome,
          getEmptyLabel: () => t('No results'),
        }),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const excluded = new Set<string>(this.options.excludeIds);
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: (args: { query: string }) =>
          this.options.suggestion.items(args).filter((item: SlashCommandItem) => !excluded.has(item.id)),
      }),
    ];
  },
});
