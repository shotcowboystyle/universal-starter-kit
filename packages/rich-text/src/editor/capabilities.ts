/**
 * Editor capability presets.
 *
 * "markdown" constrains the WYSIWYG editor to exactly what GFM markdown can
 * express (owner ruling, LC-52 MARKDOWN-EXPRESSIBLE-EDITING): bold, italic,
 * strikethrough, inline code, links, headings, bullet/ordered/task lists,
 * blockquote, fenced code blocks, images, horizontal rule, and simple pipe
 * tables. Everything markdown cannot express — underline, highlight, text
 * color, alignment, sub/superscript, collapsible details, inline math,
 * mention chips, table cell merge/split — is ABSENT in this mode: the
 * extensions are not registered (commands do not exist) and the toolbar
 * controls do not render.
 *
 * This module is the single source of truth both the runtime (extension
 * factory, toolbars, executeCommand guard) and the VERIFY specs consume.
 */

import type { EditorCapabilities, EditorCommand } from '../types';

/** Commands expressible in GFM markdown (the "markdown" capability surface) */
export const MARKDOWN_COMMANDS: ReadonlySet<EditorCommand> = new Set<EditorCommand>([
  'bold',
  'italic',
  'strike',
  'code',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'paragraph',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'link',
  'image',
  'undo',
  'redo',
  'horizontalRule',
  'clearFormatting',
  // GFM pipe tables (simple grid — mergeCells/splitCell are NOT expressible)
  'insertTable',
  'addColumnBefore',
  'addColumnAfter',
  'deleteColumn',
  'addRowBefore',
  'addRowAfter',
  'deleteRow',
  'deleteTable',
  'toggleHeaderRow',
]);

/** True when the command exists in the given capability surface */
export function isCommandInCapabilities(command: EditorCommand, capabilities: EditorCapabilities = 'full'): boolean {
  if (capabilities === 'full') {
    return true;
  }
  return MARKDOWN_COMMANDS.has(command);
}

/**
 * Slash-menu items excluded in markdown capabilities. Mermaid stays out of
 * the INSERT surface to keep it strictly GFM (a hand-typed ``` fence still
 * produces a plain code block); math and details have no markdown syntax.
 * Emoji stays — it inserts a plain unicode character (just text).
 */
export const MARKDOWN_EXCLUDED_SLASH_IDS: readonly string[] = ['mermaid', 'mathBlock', 'inlineMath', 'details'];
