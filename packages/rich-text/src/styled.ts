/**
 * Shared styled components for the rich text editor
 */

import { menuRowFrame } from '@repo/theme';
import { Separator, View, XStack, styled } from 'tamagui';

import { RichEditorContext } from './context';

// ===========================================================================
// EditorFrame
// ===========================================================================

export const EditorFrame = styled(View, {
  name: 'EditorFrame',
  context: RichEditorContext,
  borderWidth: 1,
  borderColor: '$color7',
  backgroundColor: '$color2',
  overflow: 'hidden',

  variants: {
    hasError: {
      true: {
        borderColor: '$red10',
      },
    },
    size: {
      '...size': (_val, { tokens: _tokens }) => ({}),
    },
    compact: {
      true: {},
      false: {},
    },
    disabled: {
      true: {
        opacity: 0.5,
        pointerEvents: 'none',
      },
    },
  } as const,
});

// ===========================================================================
// ToolbarFrame
// ===========================================================================

export const ToolbarFrame = styled(XStack, {
  name: 'ToolbarFrame',
  context: RichEditorContext,
  backgroundColor: '$color3',
  borderBottomWidth: 1,
  borderBottomColor: '$color6',
  paddingVertical: '$1',
  position: 'relative',

  variants: {
    hasError: {
      true: {
        borderBottomColor: '$red10',
      },
    },
    size: {
      '...size': () => ({}),
    },
    compact: {
      true: {},
      false: {},
    },
    disabled: {
      true: {},
      false: {},
    },
  } as const,
});

// ===========================================================================
// ToolbarGroupFrame
// ===========================================================================

export const ToolbarGroupFrame = styled(XStack, {
  name: 'ToolbarGroupFrame',
  context: RichEditorContext,
  alignItems: 'center',
  gap: 2,

  variants: {
    size: {
      '...size': () => ({}),
    },
    compact: {
      true: {},
      false: {},
    },
    disabled: {
      true: {},
      false: {},
    },
  } as const,
});

// ===========================================================================
// ToolbarSeparatorFrame
// ===========================================================================

export const ToolbarSeparatorFrame = styled(Separator, {
  name: 'ToolbarSeparatorFrame',
  context: RichEditorContext,
  vertical: true,
  backgroundColor: '$color6',
  width: 1,
  height: 16,
  marginHorizontal: '$2',

  variants: {
    size: {
      '...size': () => ({}),
    },
    compact: {
      true: {},
      false: {},
    },
    disabled: {
      true: {},
      false: {},
    },
  } as const,
});

// ===========================================================================
// DropdownMenuItemFrame
// ===========================================================================

export const DropdownMenuItemFrame = styled(XStack, {
  name: 'DropdownMenuItemFrame',
  context: RichEditorContext,
  // SP-EDGE geometry comes from the shared LC-16 `menuRowFrame` recipe
  // (theme): full-width row, own horizontal padding, flat corners, no focus
  // outline — the same frame DropdownMenu items, Select options, and
  // MentionInput suggestions use. Menu-only concerns stay local: cursor,
  // gap, vertical padding, and the color ramp.
  ...menuRowFrame,
  // Pressable rows must expose a real control role — without it screen
  // readers (and role-based queries) see an unnamed generic div.
  role: 'button',
  paddingVertical: '$2',
  gap: '$2',
  cursor: 'pointer',

  hoverStyle: {
    backgroundColor: '$color4',
  },

  pressStyle: {
    backgroundColor: '$color5',
  },

  // Focus highlight doubles as the focus indicator (full-width row);
  // menuRowFrame suppresses the outline by design.
  focusVisibleStyle: {
    backgroundColor: '$color4',
    outlineStyle: 'none' as any,
  },

  variants: {
    active: {
      true: {
        backgroundColor: '$color4',
      },
    },
    size: {
      '...size': () => ({}),
    },
    compact: {
      true: {},
      false: {},
    },
    disabled: {
      true: {},
      false: {},
    },
  } as const,
});
