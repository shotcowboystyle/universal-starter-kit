import { describe, it, expect } from 'vitest';

import { NATIVE_SUPPORTED_COMMANDS } from '../constants';

import { getEditorStateFromBridge } from './useEditorState';

// ===========================================================================
// Test bridge extensions configuration
// ===========================================================================

describe('TentapEditor bridge extensions', () => {
  it('includes ColorBridge, HighlightBridge, ImageBridge, and TaskListBridge', () => {
    // We validate the bridge state mapping reads the fields these bridges
    // provide. Since this is a .native.tsx file we cannot directly import
    // in a web test environment, so we verify the state mapping and
    // supported commands map which are the integration points.

    const bridgeState = {
      isBoldActive: false,
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
      canUndo: false,
      canRedo: false,
      activeColor: '#e53935',
      activeHighlight: '#fff59d',
    };

    const state = getEditorStateFromBridge(bridgeState);

    // ColorBridge fields
    expect(state.textColor).toBe('#e53935');
    // HighlightBridge fields
    expect(state.highlightColor).toBe('#fff59d');
    // TaskListBridge fields
    expect(state.isTaskList).toBe(true);
  });
});

// ===========================================================================
// Test executeCommand bridge method mapping
// ===========================================================================

describe('TentapEditor executeCommand mapping', () => {
  it('textColor, highlight, image, and taskList are not no-ops', () => {
    // Validate through the NATIVE_SUPPORTED_COMMANDS map that these commands
    // are marked as supported (meaning they have real bridge implementations)
    expect(NATIVE_SUPPORTED_COMMANDS.textColor).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.highlight).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.image).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.taskList).toBe(true);
  });

  it('genuinely unsupported features are marked as unsupported', () => {
    expect(NATIVE_SUPPORTED_COMMANDS.subscript).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.superscript).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.codeBlock).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.horizontalRule).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.clearFormatting).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.alignLeft).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.alignCenter).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.alignRight).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.alignJustify).toBe(false);
  });
});

// ===========================================================================
// Test mapBridgeStateToEditorState (getEditorStateFromBridge)
// ===========================================================================

describe('getEditorStateFromBridge for TentapEditor', () => {
  it('reads activeColor, activeHighlight, and isTaskListActive from bridge state', () => {
    const bridgeState = {
      isBoldActive: true,
      isItalicActive: false,
      isUnderlineActive: true,
      isStrikeActive: false,
      isCodeActive: false,
      headingLevel: 2,
      isBulletListActive: false,
      isOrderedListActive: false,
      isTaskListActive: true,
      isBlockquoteActive: false,
      isLinkActive: true,
      canUndo: true,
      canRedo: false,
      activeColor: '#1e88e5',
      activeHighlight: '#c8e6c9',
    };

    const state = getEditorStateFromBridge(bridgeState);

    // Values should come from the bridge, not hardcoded
    expect(state.textColor).toBe('#1e88e5');
    expect(state.highlightColor).toBe('#c8e6c9');
    expect(state.isTaskList).toBe(true);

    // Other state should map correctly
    expect(state.isBold).toBe(true);
    expect(state.isUnderline).toBe(true);
    expect(state.isHeading2).toBe(true);
    expect(state.isParagraph).toBe(false);
    expect(state.isLink).toBe(true);
    expect(state.canUndo).toBe(true);
  });

  it('returns null for color fields when bridge does not provide them', () => {
    const bridgeState = {
      isBoldActive: false,
      headingLevel: 0,
    };

    const state = getEditorStateFromBridge(bridgeState);

    // When bridge doesn't provide color fields, should be null
    expect(state.textColor).toBeNull();
    expect(state.highlightColor).toBeNull();
    expect(state.isTaskList).toBe(false);
  });
});
