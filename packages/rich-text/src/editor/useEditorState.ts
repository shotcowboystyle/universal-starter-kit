/**
 * State mapping functions for extracting EditorState from platform editors
 */

import type { EditorState, TextAlignment } from '../types';
import { defaultEditorState } from '../types';

export { defaultEditorState };

// ===========================================================================
// Web (Tiptap)
// ===========================================================================

/**
 * Extract EditorState from a Tiptap editor instance.
 * Returns defaultEditorState if the editor is null/undefined.
 */
export function getEditorStateFromTiptap(editor: any): EditorState {
  if (!editor) {
    return defaultEditorState;
  }

  let textAlign: TextAlignment = 'left';
  if (editor.isActive({ textAlign: 'center' })) {
    textAlign = 'center';
  } else if (editor.isActive({ textAlign: 'right' })) {
    textAlign = 'right';
  } else if (editor.isActive({ textAlign: 'justify' })) {
    textAlign = 'justify';
  }

  const textColor = editor.getAttributes('textStyle').color ?? null;
  const highlightColor = editor.getAttributes('highlight').color ?? null;

  const isHeading1 = editor.isActive('heading', { level: 1 });
  const isHeading2 = editor.isActive('heading', { level: 2 });
  const isHeading3 = editor.isActive('heading', { level: 3 });
  const isHeading4 = editor.isActive('heading', { level: 4 });
  const isHeading5 = editor.isActive('heading', { level: 5 });
  const isHeading6 = editor.isActive('heading', { level: 6 });
  const isParagraph =
    editor.isActive('paragraph') &&
    !isHeading1 &&
    !isHeading2 &&
    !isHeading3 &&
    !isHeading4 &&
    !isHeading5 &&
    !isHeading6;

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
    textColor,
    highlightColor,
    wordCount: editor.storage?.characterCount?.words?.() ?? 0,
    characterCount: editor.storage?.characterCount?.characters?.() ?? 0,
  };
}

// ===========================================================================
// Native (10Tap Bridge)
// ===========================================================================

/**
 * Extract EditorState from a 10Tap bridge state object.
 *
 * Reads activeColor, activeHighlight, and isTaskListActive from bridge
 * state instead of hardcoding them to false/null.
 */
export function getEditorStateFromBridge(bridgeState: any): EditorState {
  if (!bridgeState) {
    return defaultEditorState;
  }

  const isHeading1 = bridgeState.headingLevel === 1;
  const isHeading2 = bridgeState.headingLevel === 2;
  const isHeading3 = bridgeState.headingLevel === 3;
  const isHeading4 = bridgeState.headingLevel === 4;
  const isHeading5 = bridgeState.headingLevel === 5;
  const isHeading6 = bridgeState.headingLevel === 6;

  return {
    isBold: bridgeState.isBoldActive ?? false,
    isItalic: bridgeState.isItalicActive ?? false,
    isUnderline: bridgeState.isUnderlineActive ?? false,
    isStrike: bridgeState.isStrikeActive ?? false,
    isCode: bridgeState.isCodeActive ?? false,
    isSubscript: false,
    isSuperscript: false,
    isHeading1,
    isHeading2,
    isHeading3,
    isHeading4,
    isHeading5,
    isHeading6,
    isParagraph: !isHeading1 && !isHeading2 && !isHeading3 && !isHeading4 && !isHeading5 && !isHeading6,
    isBulletList: bridgeState.isBulletListActive ?? false,
    isOrderedList: bridgeState.isOrderedListActive ?? false,
    isTaskList: bridgeState.isTaskListActive ?? false,
    isBlockquote: bridgeState.isBlockquoteActive ?? false,
    isCodeBlock: false,
    isLink: bridgeState.isLinkActive ?? false,
    canUndo: bridgeState.canUndo ?? false,
    canRedo: bridgeState.canRedo ?? false,
    textAlign: 'left',
    textColor: bridgeState.activeColor ?? null,
    highlightColor: bridgeState.activeHighlight ?? null,
    wordCount: 0,
    characterCount: 0,
  };
}
