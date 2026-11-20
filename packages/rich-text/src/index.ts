/**
 * `@repo/rich-text`
 *
 * Cross-platform rich text editor built on Tiptap (web) and 10Tap (native)
 */

export { RichEditor } from './RichEditor';
export type { RichEditorCombinedProps } from './RichEditor';

export { RichTextEditor } from './RichTextEditor';
export type { RichTextEditorProps } from './RichTextEditor';

export type {
  RichEditorRef,
  RichEditorProps,
  EditorCapabilities,
  EditorCommand,
  EditorState,
  RichTextMentionOptions,
} from './types';

export { MARKDOWN_COMMANDS, isCommandInCapabilities } from './editor/capabilities';
