import { describe, it, expect } from 'vitest';

import { getEditorStateFromTiptap, getEditorStateFromBridge, defaultEditorState } from './useEditorState';

describe(getEditorStateFromTiptap, () => {
  it('returns defaultEditorState when editor is null', () => {
    const state = getEditorStateFromTiptap(null);
    expect(state).toEqual(defaultEditorState);
  });

  it('maps a mock Tiptap editor to correct EditorState shape', () => {
    const mockEditor = {
      isActive: (type: string, attrs?: any) => {
        if (type === 'bold') {
          return true;
        }
        if (type === 'heading' && attrs?.level === 2) {
          return true;
        }
        if (type === 'paragraph') {
          return true;
        }
        if (type === 'link') {
          return true;
        }
        return false;
      },
      getAttributes: (type: string) => {
        if (type === 'textStyle') {
          return { color: '#e53935' };
        }
        if (type === 'highlight') {
          return { color: '#fff59d' };
        }
        return {};
      },
      can: () => ({
        undo: () => true,
        redo: () => false,
      }),
    };

    const state = getEditorStateFromTiptap(mockEditor);
    expect(state.isBold).toBe(true);
    expect(state.isItalic).toBe(false);
    expect(state.isHeading2).toBe(true);
    expect(state.isParagraph).toBe(false);
    expect(state.isLink).toBe(true);
    expect(state.textColor).toBe('#e53935');
    expect(state.highlightColor).toBe('#fff59d');
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);
    expect(state.textAlign).toBe('left');
  });
});

describe(getEditorStateFromBridge, () => {
  it('returns defaultEditorState when bridgeState is null', () => {
    const state = getEditorStateFromBridge(null);
    expect(state).toEqual(defaultEditorState);
  });

  it('properly reads activeColor, activeHighlight, and isTaskListActive', () => {
    const bridgeState = {
      isBoldActive: true,
      isItalicActive: false,
      isUnderlineActive: false,
      isStrikeActive: false,
      isCodeActive: false,
      headingLevel: 0,
      isBulletListActive: false,
      isOrderedListActive: false,
      isTaskListActive: true,
      isBlockquoteActive: false,
      isLinkActive: false,
      canUndo: true,
      canRedo: false,
      activeColor: '#1e88e5',
      activeHighlight: '#c8e6c9',
    };

    const state = getEditorStateFromBridge(bridgeState);
    expect(state.isBold).toBe(true);
    expect(state.isTaskList).toBe(true);
    expect(state.textColor).toBe('#1e88e5');
    expect(state.highlightColor).toBe('#c8e6c9');
    expect(state.canUndo).toBe(true);
    expect(state.isParagraph).toBe(true);
  });

  it('reads heading level from bridgeState', () => {
    const bridgeState = {
      headingLevel: 3,
      isBoldActive: false,
    };

    const state = getEditorStateFromBridge(bridgeState);
    expect(state.isHeading3).toBe(true);
    expect(state.isHeading1).toBe(false);
    expect(state.isParagraph).toBe(false);
  });
});
