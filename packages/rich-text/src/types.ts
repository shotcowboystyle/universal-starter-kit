/**
 * Shared types for the rich text editor
 */

import type { MentionItem } from '@repo/forms';
import type { FontSizeTokens } from 'tamagui';

// ===========================================================================
// Mentions
// ===========================================================================

/**
 * Mention wiring for the @ suggestion popup (web). Uses the forms
 * `MentionItem` contract (LC-16: same data shape as MentionInput).
 */
export interface RichTextMentionOptions {
  /** Trigger character (default "@") */
  trigger?: string;
  /** Returns suggestion items for a query (sync or async) */
  items: (query: string) => MentionItem[] | Promise<MentionItem[]>;
}

// ===========================================================================
// Editor Capabilities
// ===========================================================================

/**
 * Capability surface of the editor:
 * - "full": every extension and toolbar control (default).
 * - "markdown": WYSIWYG constrained to what GFM markdown can express —
 *   non-markdown extensions (underline, highlight, text color, alignment,
 *   sub/superscript, details, inline math, mentions) are NOT registered
 *   (commands absent, not just hidden), the toolbar shows only the
 *   markdown-expressible controls, `initialContent` is parsed as markdown,
 *   and `onChange` emits a markdown string.
 */
export type EditorCapabilities = 'full' | 'markdown';

// ===========================================================================
// Editor Command
// ===========================================================================

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
  | 'clearFormatting'
  | 'insertTable'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'deleteTable'
  | 'mergeCells'
  | 'splitCell'
  | 'toggleHeaderRow';

// ===========================================================================
// Editor State
// ===========================================================================

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
  /** Total word count */
  wordCount: number;
  /** Total character count */
  characterCount: number;
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
  wordCount: 0,
  characterCount: 0,
};

// ===========================================================================
// Editor Ref and Props
// ===========================================================================

export interface RichEditorRef {
  /** Execute an editor command */
  executeCommand: (command: EditorCommand, payload?: any) => void;
  /** Get the current editor state */
  getState: () => EditorState;
  /** Get the content as HTML */
  getHTML: () => string;
  /** Get the content as JSON (ProseMirror format) */
  getJSON: () => any;
  /** Get the content serialized to GFM markdown (web) */
  getMarkdown: () => string;
  /** Set content from HTML */
  setHTML: (html: string) => void;
  /** Set content from JSON */
  setJSON: (json: any) => void;
  /** Set content from a markdown string without emitting onChange (web) */
  setMarkdown: (markdown: string) => void;
  /** Focus the editor */
  focus: () => void;
  /** Blur the editor */
  blur: () => void;
}

export interface RichEditorProps {
  /**
   * Capability preset (default "full"). With "markdown", only the
   * markdown-expressible extensions register, the toolbar shows only the
   * corresponding controls, `initialContent` is parsed as markdown, and
   * `onChange` receives a markdown string. Fixed at mount.
   */
  capabilities?: EditorCapabilities;
  /** Initial content as HTML ("full") or markdown ("markdown" capabilities) */
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
  /**
   * Uploads a pasted/dropped image and resolves its URL (web). Without it,
   * images are inlined as base64 data URIs.
   */
  onImageUpload?: (file: File) => Promise<string>;
  /**
   * Uploads a pasted/dropped non-image file and resolves its URL (web).
   * Inserts an attachment chip link; without it, non-image files are ignored.
   */
  onFileUpload?: (file: File) => Promise<{ url: string; name?: string }>;
  /** Enables the @ mention suggestion popup (web) */
  mentions?: RichTextMentionOptions;
}

// ===========================================================================
// Editor Mode
// ===========================================================================

export type EditorMode = 'richtext' | 'markdown';

// ===========================================================================
// Native Capability
// ===========================================================================

/** Maps each EditorCommand to whether 10Tap natively supports it */
export type NativeCapability = Record<EditorCommand, boolean>;

// ===========================================================================
// Toolbar Section
// ===========================================================================

/** Toolbar section identifiers for visibility config */
export type ToolbarSection =
  | 'history'
  | 'formatting'
  | 'color'
  | 'heading'
  | 'alignment'
  | 'list'
  | 'block'
  | 'link'
  | 'image'
  | 'clear';

// ===========================================================================
// Context Value
// ===========================================================================

/** Values provided by RichEditorContext via createStyledContext */
export interface RichEditorContextValue {
  /** Size token for toolbar buttons and editor sizing */
  size: FontSizeTokens;
  /** Whether to use compact sizing */
  compact: boolean;
  /** Whether the editor is disabled */
  disabled: boolean;
}
