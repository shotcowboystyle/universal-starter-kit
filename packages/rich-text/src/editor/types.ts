/**
 * Shared types for the rich text editor
 */

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export type EditorCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'subscript'
  | 'superscript'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'paragraph'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'undo'
  | 'redo'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignJustify'
  | 'textColor'
  | 'highlight'
  | 'horizontalRule'
  | 'clearFormatting';

export interface EditorState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  isCode: boolean;
  isSubscript: boolean;
  isSuperscript: boolean;
  isHeading1: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  isHeading4: boolean;
  isHeading5: boolean;
  isHeading6: boolean;
  isParagraph: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
  isTaskList: boolean;
  isBlockquote: boolean;
  isCodeBlock: boolean;
  isLink: boolean;
  canUndo: boolean;
  canRedo: boolean;
  textAlign: TextAlignment;
  /** Current text color (null means default) */
  textColor: string | null;
  /** Current highlight/background color (null means none) */
  highlightColor: string | null;
}

export interface RichEditorRef {
  /** Execute an editor command */
  executeCommand: (command: EditorCommand, payload?: any) => void;
  /** Get the current editor state */
  getState: () => EditorState;
  /** Get the content as HTML */
  getHTML: () => string;
  /** Get the content as JSON (ProseMirror format) */
  getJSON: () => any;
  /** Set content from HTML */
  setHTML: (html: string) => void;
  /** Set content from JSON */
  setJSON: (json: any) => void;
  /** Focus the editor */
  focus: () => void;
  /** Blur the editor */
  blur: () => void;
}

export interface RichEditorProps {
  /** Initial content as HTML */
  initialContent?: string;
  /** Initial content as JSON (takes precedence over initialContent) */
  initialJSON?: any;
  /** Placeholder text when editor is empty */
  placeholder?: string;
  /** Whether the editor is editable */
  editable?: boolean;
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Called when content changes */
  onChange?: (html: string, json: any) => void;
  /** Called when editor state changes (bold, italic, etc.) */
  onStateChange?: (state: EditorState) => void;
  /** Called when editor is focused */
  onFocus?: () => void;
  /** Called when editor is blurred */
  onBlur?: () => void;
  /** Minimum height of the editor */
  minHeight?: number;
  /** Maximum height of the editor */
  maxHeight?: number;
  /** Show error state */
  hasError?: boolean;
}

export const defaultEditorState: EditorState = {
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrike: false,
  isCode: false,
  isSubscript: false,
  isSuperscript: false,
  isHeading1: false,
  isHeading2: false,
  isHeading3: false,
  isHeading4: false,
  isHeading5: false,
  isHeading6: false,
  isParagraph: true,
  isBulletList: false,
  isOrderedList: false,
  isTaskList: false,
  isBlockquote: false,
  isCodeBlock: false,
  isLink: false,
  canUndo: false,
  canRedo: false,
  textAlign: 'left',
  textColor: null,
  highlightColor: null,
};
