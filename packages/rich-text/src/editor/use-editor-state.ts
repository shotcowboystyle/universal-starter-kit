/**
 * State mapping functions for extracting EditorState from platform editors
 */

import type { EditorState, TextAlignment } from '../types';
import { defaultEditorState } from '../types';

export { defaultEditorState } from '../types';

// ===========================================================================
// Web (Tiptap)
// ===========================================================================

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const NON_DEFAULT_ALIGNMENTS = ['center', 'right', 'justify'] as const;

/** Reads a mark's `color` attribute; null when absent. */
const readMarkColor = (editor: TiptapStateSource, mark: string): string | null => {
  const { color } = editor.getAttributes(mark);
  return color ?? null;
};

interface CharacterCountLike {
  words?: () => number;
  characters?: () => number;
}

/**
 * The slice of a Tiptap `Editor` the mapper reads (a structural type, so a
 * real editor and lightweight test doubles both fit).
 */
/** The node / mark attributes the mapper matches on. */
interface ActiveAttributes {
  level?: number;
  textAlign?: TextAlignment;
}

// Method syntax keeps parameters bivariant, so the overloaded `Editor`
// method and single-signature test doubles both satisfy this type.
export interface TiptapStateSource {
  // oxlint-disable-next-line typescript/method-signature-style -- bivariance needed, see above
  isActive(nameOrAttributes: string | ActiveAttributes, attributes?: ActiveAttributes): boolean;
  /** Only the `color` attribute (textStyle / highlight marks) is read. */
  getAttributes: (name: string) => { color?: string | null };
  can: () => { undo: () => boolean; redo: () => boolean };
  /** Extension storage; CharacterCount registers `characterCount` here. */
  storage?: { characterCount?: CharacterCountLike };
}

/**
 * Extract EditorState from a Tiptap editor instance.
 * Returns defaultEditorState if the editor is null/undefined.
 */
export const getEditorStateFromTiptap = (editor: TiptapStateSource | null | undefined): EditorState => {
  if (!editor) {
    return defaultEditorState;
  }

  const textAlign: TextAlignment =
    NON_DEFAULT_ALIGNMENTS.find((alignment) => editor.isActive({ textAlign: alignment })) ?? 'left';

  const [isHeading1, isHeading2, isHeading3, isHeading4, isHeading5, isHeading6] = HEADING_LEVELS.map((level) =>
    editor.isActive('heading', { level }),
  );
  const isAnyHeading = [isHeading1, isHeading2, isHeading3, isHeading4, isHeading5, isHeading6].includes(true);
  const isParagraph = editor.isActive('paragraph') && !isAnyHeading;

  // CharacterCount storage is absent when the extension is not installed.
  const { characterCount } = editor.storage ?? {};

  return {
    isBold: editor.isActive('bold'),
    isItalic: editor.isActive('italic'),
    isUnderline: editor.isActive('underline'),
    isStrike: editor.isActive('strike'),
    isCode: editor.isActive('code'),
    isSubscript: editor.isActive('subscript'),
    isSuperscript: editor.isActive('superscript'),
    isHeading1,
    isHeading2,
    isHeading3,
    isHeading4,
    isHeading5,
    isHeading6,
    isParagraph,
    isBulletList: editor.isActive('bulletList'),
    isOrderedList: editor.isActive('orderedList'),
    isTaskList: editor.isActive('taskList'),
    isBlockquote: editor.isActive('blockquote'),
    isCodeBlock: editor.isActive('codeBlock'),
    isLink: editor.isActive('link'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    textAlign,
    textColor: readMarkColor(editor, 'textStyle'),
    highlightColor: readMarkColor(editor, 'highlight'),
    wordCount: characterCount?.words?.() ?? 0,
    characterCount: characterCount?.characters?.() ?? 0,
  };
};

// ===========================================================================
// Native (10Tap Bridge)
// ===========================================================================

/** The 10Tap bridge state fields this mapper reads; every field may be absent. */
export interface BridgeStateLike {
  isBoldActive?: boolean;
  isItalicActive?: boolean;
  isUnderlineActive?: boolean;
  isStrikeActive?: boolean;
  isCodeActive?: boolean;
  headingLevel?: number;
  isBulletListActive?: boolean;
  isOrderedListActive?: boolean;
  isTaskListActive?: boolean;
  isBlockquoteActive?: boolean;
  isLinkActive?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  activeColor?: string;
  activeHighlight?: string;
}

/**
 * Extract EditorState from a 10Tap bridge state object.
 *
 * Reads activeColor, activeHighlight, and isTaskListActive from bridge
 * state instead of hardcoding them to false/null.
 */
export const getEditorStateFromBridge = (bridgeState: BridgeStateLike | null | undefined): EditorState => {
  if (!bridgeState) {
    return defaultEditorState;
  }

  const { headingLevel } = bridgeState;
  const isHeading1 = headingLevel === 1;
  const isHeading2 = headingLevel === 2;
  const isHeading3 = headingLevel === 3;
  const isHeading4 = headingLevel === 4;
  const isHeading5 = headingLevel === 5;
  const isHeading6 = headingLevel === 6;
  const isAnyHeading = HEADING_LEVELS.some((level) => level === headingLevel);

  // `=== true` maps an absent flag to false (same as `?? false` for booleans).
  return {
    isBold: bridgeState.isBoldActive === true,
    isItalic: bridgeState.isItalicActive === true,
    isUnderline: bridgeState.isUnderlineActive === true,
    isStrike: bridgeState.isStrikeActive === true,
    isCode: bridgeState.isCodeActive === true,
    isSubscript: false,
    isSuperscript: false,
    isHeading1,
    isHeading2,
    isHeading3,
    isHeading4,
    isHeading5,
    isHeading6,
    isParagraph: !isAnyHeading,
    isBulletList: bridgeState.isBulletListActive === true,
    isOrderedList: bridgeState.isOrderedListActive === true,
    isTaskList: bridgeState.isTaskListActive === true,
    isBlockquote: bridgeState.isBlockquoteActive === true,
    isCodeBlock: false,
    isLink: bridgeState.isLinkActive === true,
    canUndo: bridgeState.canUndo === true,
    canRedo: bridgeState.canRedo === true,
    textAlign: 'left',
    textColor: bridgeState.activeColor ?? null,
    highlightColor: bridgeState.activeHighlight ?? null,
    wordCount: 0,
    characterCount: 0,
  };
};
