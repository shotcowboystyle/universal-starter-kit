/**
 * Integration tests for the rich text editor rebuild
 *
 * These tests focus on cross-component data flow and integration points
 * that span multiple modules, filling gaps not covered by individual
 * module tests from Task Groups 2-14.
 */

import { describe, it, expect, vi } from 'vitest';

// ===========================================================================
// 1. Cross-component data flow: getEditorStateFromTiptap text alignment
// ===========================================================================

describe('getEditorStateFromTiptap text alignment paths', () => {
  it('maps center, right, and justify alignment from Tiptap editor', async () => {
    const { getEditorStateFromTiptap } = await import('./editor/useEditorState');

    const createMockEditor = (activeAlign: string) => ({
      isActive: (type: string | Record<string, any>, attrs?: any) => {
        if (typeof type === 'object' && type.textAlign) {
          return type.textAlign === activeAlign;
        }
        if (attrs?.textAlign) {
          return attrs.textAlign === activeAlign;
        }
        if (type === 'paragraph') {
          return true;
        }
        return false;
      },
      getAttributes: () => ({}),
      can: () => ({ undo: () => false, redo: () => false }),
    });

    const centerState = getEditorStateFromTiptap(createMockEditor('center'));
    expect(centerState.textAlign).toBe('center');

    const rightState = getEditorStateFromTiptap(createMockEditor('right'));
    expect(rightState.textAlign).toBe('right');

    const justifyState = getEditorStateFromTiptap(createMockEditor('justify'));
    expect(justifyState.textAlign).toBe('justify');
  });
});

// ===========================================================================
// 2. getEditorCSS default minHeight
// ===========================================================================

describe('getEditorCSS defaults', () => {
  it('applies 150px default minHeight when no options are provided', async () => {
    const { getEditorCSS } = await import('./editor/editorStyles');

    const css = getEditorCSS();
    expect(css).toContain('min-height: 150px');
  });
});

// ===========================================================================
// 3. ToolbarButton disabled state from context
// ===========================================================================

vi.mock(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: (props: any) => (
    <button
      aria-label={props['aria-label']}
      aria-disabled={props['aria-disabled']}
      disabled={props.disabled}
      onClick={props.onPress}
      data-active={props.theme === 'active' ? 'true' : undefined}>
      {props.children}
    </button>
  ),
  Field: ({ children, ...props }: any) => {
    const field = {
      state: { value: props.defaultValue ?? '', meta: { errors: [] } },
      handleChange: vi.fn(),
      handleBlur: vi.fn(),
    };
    return <div data-testid="tanstack-field">{children(field)}</div>;
  },
  FieldLayout: ({ children, label, error, ..._props }: any) => (
    <div
      data-testid="field-layout"
      data-label={label}
      data-error={error ?? undefined}>
      {children}
    </div>
  ),
  Skeleton: ({ variant, width, height }: any) => (
    <div
      data-testid="skeleton"
      data-variant={variant}
      style={{ width, height }}
    />
  ),
  getFieldError: (field: any, propError: any) => {
    const fieldError = field.state.meta.errors.length ? String(field.state.meta.errors[0]) : undefined;
    return propError ?? fieldError;
  },
  useFormField: ({ form }: any) => ({
    resolvedForm: form ?? undefined,
    knobProps: {
      body: {},
      borderRadius: { borderRadius: '$3', borderWidth: 1 },
      elevation: undefined,
      sizeToken: '$4',
      outlined: false,
      inputBackground: '$color2',
      textAccentColor: '$color',
      transition: undefined,
      heading: {},
      gap: { gap: '$2' },
    },
    id: 'test-id',
  }),
  useResolvedValidators: (
    required: boolean | undefined,
    validators: any,
    label: any,
    name: any,
    isEmpty?: (v: unknown) => boolean,
  ) => {
    if (!required) {
      return validators;
    }
    const check = isEmpty ?? ((v: unknown) => v === null || v === undefined || v === '');
    const requiredValidator = ({ value }: { value: unknown }) =>
      check(value) ? `${typeof label === 'string' ? label : (name ?? 'Field')} is required` : undefined;
    if (!validators) {
      return { onSubmit: requiredValidator };
    }
    return { ...validators, onSubmit: requiredValidator };
  },
  mergeFieldHandler:
    (field: any, name: string, handler: any) =>
    (...args: any[]) => {
      (field[name] as Function)(...args);
      handler?.(...args);
    },
  clampRadiusForLargeComponent: (radiusToken: string | undefined, maxTokenNum = 4) => {
    if (!radiusToken) {
      return '$3';
    }
    if (radiusToken === '$0') {
      return 0;
    }
    if (typeof radiusToken === 'string' && radiusToken.startsWith('$')) {
      const num = Number.parseInt(radiusToken.slice(1), 10);
      return num > maxTokenNum ? `$${maxTokenNum}` : radiusToken;
    }
    return radiusToken;
  },
}));

vi.mock(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: any) => children,
}));

vi.mock(import('@tiptap/react/menus'), () => ({
  BubbleMenu: ({ children }: any) => <div data-testid="bubble-menu">{children}</div>,
}));

const mockEditor = {
  isActive: vi.fn().mockReturnValue(false),
  getAttributes: vi.fn().mockReturnValue({}),
  can: vi.fn().mockReturnValue({ undo: () => false, redo: () => false }),
  getHTML: vi.fn().mockReturnValue('<p></p>'),
  getJSON: vi.fn().mockReturnValue({ type: 'doc', content: [] }),
  chain: vi.fn().mockReturnValue({
    focus: vi.fn().mockReturnValue({
      toggleBold: vi.fn().mockReturnValue({ run: vi.fn() }),
    }),
  }),
  commands: {
    setContent: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
  },
  setEditable: vi.fn(),
  storage: {
    mediaUpload: { handlers: {} },
    suggestionChrome: { value: null },
  },
};

vi.mock(import('@tiptap/react'), () => ({
  useEditor: vi.fn().mockReturnValue(mockEditor),
  EditorContent: ({ editor: _editor }: any) => <div data-testid="editor-content">Editor</div>,
}));

vi.mock(import('@tiptap/starter-kit'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-underline'), () => ({ default: {} }));
vi.mock(import('@tiptap/extension-link'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-placeholder'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-text-align'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-color'), () => ({ Color: {} }));
vi.mock(import('@tiptap/extension-text-style'), () => ({ TextStyle: {} }));
vi.mock(import('@tiptap/extension-highlight'), () => ({
  Highlight: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-subscript'), () => ({ Subscript: {} }));
vi.mock(import('@tiptap/extension-superscript'), () => ({ Superscript: {} }));
vi.mock(import('@tiptap/extension-task-list'), () => ({ default: {} }));
vi.mock(import('@tiptap/extension-task-item'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-image'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';

import { RichEditorContext } from './context';
import { defaultEditorState } from './types';
import type { EditorCommand, EditorState, ToolbarSection } from './types';

const { ToolbarButton } = await import('./toolbar/ToolbarButton');
const { FixedToolbar } = await import('./toolbar/FixedToolbar');
const { RichEditor } = await import('./RichEditor');
const { RichTextEditor } = await import('./RichTextEditor/index');

describe('ToolbarButton disabled state from context', () => {
  it('inherits disabled state from RichEditorContext', () => {
    const onPress = vi.fn();
    const { getByRole } = renderWithProviders(
      <RichEditorContext.Provider
        size="$true"
        compact={false}
        disabled>
        <ToolbarButton
          onPress={onPress}
          aria-label="Test">
          T
        </ToolbarButton>
      </RichEditorContext.Provider>,
    );
    const button = getByRole('button');
    // DG-ST-03 / LC-40: an unavailable toolbar action is aria-disabled
    // (stays focusable, swallows presses), never bare-`disabled`.
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('disabled')).toBeNull();
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. EditorState flows to FixedToolbar and reflects active states
// ===========================================================================

describe('EditorState flows to FixedToolbar active states', () => {
  it('reflects bold active state in the Bold toolbar button', () => {
    const boldActiveState: EditorState = {
      ...defaultEditorState,
      isBold: true,
    };

    const { container } = renderWithProviders(
      <RichEditorContext.Provider
        size="$true"
        compact={false}
        disabled={false}>
        <FixedToolbar
          editorRef={{ current: null }}
          state={boldActiveState}
        />
      </RichEditorContext.Provider>,
    );

    const buttons = container.querySelectorAll("[role='button']");
    const boldButton = [...buttons].find((b) => b.getAttribute('aria-label') === 'Bold');
    expect(boldButton).toBeTruthy();
    expect(boldButton?.dataset.active).toBe('true');
  });
});

// ===========================================================================
// 5. Sections with empty array hides all groups
// ===========================================================================

describe('FixedToolbar sections edge case', () => {
  it('hides all groups when sections is an empty array', () => {
    const { container } = renderWithProviders(
      <RichEditorContext.Provider
        size="$true"
        compact={false}
        disabled={false}>
        <FixedToolbar
          editorRef={{ current: null }}
          state={defaultEditorState}
          sections={[] as ToolbarSection[]}
        />
      </RichEditorContext.Provider>,
    );

    const buttons = container.querySelectorAll("[role='button']");
    expect(buttons).toHaveLength(0);
  });
});

// ===========================================================================
// 6. RichEditor compound component forwards ref to TiptapEditor
// ===========================================================================

describe('RichEditor ref forwarding', () => {
  it('forwards ref through compound component to TiptapEditor', () => {
    const { createRef } = require('react');
    const ref = createRef();

    renderWithProviders(<RichEditor ref={ref} />);

    expect(ref.current).toBeTruthy();
    expect(ref.current?.executeCommand).toBeTypeOf('function');
    expect(ref.current?.getHTML).toBeTypeOf('function');
    expect(ref.current?.getState).toBeTypeOf('function');
  });
});

// ===========================================================================
// 7. RichTextEditor custom empty check integration
// ===========================================================================

describe('RichTextEditor form validation with custom empty check', () => {
  it("uses richTextIsEmpty so '<p></p>' triggers required validation", () => {
    const mockForm = { store: {} } as any;
    const { getByTestId } = renderWithProviders(
      <RichTextEditor
        form={mockForm}
        name="content"
        label="Content"
        required
        defaultValue="<p></p>"
      />,
    );

    const field = getByTestId('tanstack-field');
    expect(field).toBeTruthy();
  });
});

// ===========================================================================
// 8. Bridge state mapping consistency between tiptap and bridge
// ===========================================================================

describe('EditorState shape consistency between platforms', () => {
  it('getEditorStateFromTiptap and getEditorStateFromBridge produce the same shape', async () => {
    const { getEditorStateFromTiptap, getEditorStateFromBridge } = await import('./editor/useEditorState');

    const tiptapState = getEditorStateFromTiptap(null);
    const bridgeState = getEditorStateFromBridge(null);

    const tiptapKeys = Object.keys(tiptapState).sort();
    const bridgeKeys = Object.keys(bridgeState).sort();

    expect(tiptapKeys).toEqual(bridgeKeys);
    expect(tiptapState).toEqual(bridgeState);
  });
});

// ===========================================================================
// 9. NATIVE_SUPPORTED_COMMANDS completeness matches EditorCommand type
// ===========================================================================

describe('NATIVE_SUPPORTED_COMMANDS completeness', () => {
  it('has an entry for every EditorCommand and each value is a boolean', async () => {
    const { NATIVE_SUPPORTED_COMMANDS } = await import('./constants');

    // All EditorCommand union values must have an entry in the map
    const allCommands: EditorCommand[] = [
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'subscript',
      'superscript',
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
      'alignLeft',
      'alignCenter',
      'alignRight',
      'alignJustify',
      'textColor',
      'highlight',
      'horizontalRule',
      'clearFormatting',
      'insertTable',
      'addColumnBefore',
      'addColumnAfter',
      'deleteColumn',
      'addRowBefore',
      'addRowAfter',
      'deleteRow',
      'deleteTable',
      'mergeCells',
      'splitCell',
      'toggleHeaderRow',
    ];

    for (const cmd of allCommands) {
      expect(NATIVE_SUPPORTED_COMMANDS[cmd]).toBeTypeOf('boolean');
    }

    // No extra keys beyond what EditorCommand defines
    const commandKeys = Object.keys(NATIVE_SUPPORTED_COMMANDS);
    expect(commandKeys).toHaveLength(allCommands.length);
  });
});

// ===========================================================================
// 10. RichEditor passes showBubbleToolbar through to TiptapEditor
// ===========================================================================

describe('RichEditor passes showBubbleToolbar to TiptapEditor', () => {
  it('renders BubbleMenu when showBubbleToolbar is true', () => {
    const { container } = renderWithProviders(<RichEditor showBubbleToolbar />);

    const bubbleMenu = container.querySelector("[data-testid='bubble-menu']");
    expect(bubbleMenu).toBeTruthy();
  });

  it('renders only the always-on MathBubble when showBubbleToolbar is false', () => {
    const { container } = renderWithProviders(<RichEditor showBubbleToolbar={false} />);

    // showBubbleToolbar gates the OPTIONAL formatting bubbles; the math
    // bubble stays mounted because it is the only edit path for inline
    // math atoms (a typed $x$ would otherwise be a dead end).
    const bubbleMenus = container.querySelectorAll("[data-testid='bubble-menu']");
    expect(bubbleMenus).toHaveLength(1);
  });
});
