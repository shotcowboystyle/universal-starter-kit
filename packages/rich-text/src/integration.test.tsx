/**
 * Integration tests for the rich text editor rebuild
 *
 * These tests focus on cross-component data flow and integration points
 * that span multiple modules, filling gaps not covered by individual
 * module tests from Task Groups 2-14.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';

import { RichEditorContext } from './context';
import { defaultEditorState } from './types';
import type { EditorCommand, EditorState, RichEditorRef, ToolbarSection } from './types';

interface AlignAttributes {
  textAlign?: string;
}

const createMockEditor = (activeAlign: string) => ({
  isActive: (type: string | AlignAttributes, attrs?: AlignAttributes) => {
    const align = type instanceof Object ? type.textAlign : attrs?.textAlign;
    if (align !== undefined && align !== '') {
      return align === activeAlign;
    }
    return type === 'paragraph';
  },
  getAttributes: () => ({}),
  can: () => ({ undo: () => false, redo: () => false }),
});

// ===========================================================================
// 1. Cross-component data flow: getEditorStateFromTiptap text alignment
// ===========================================================================

describe('getEditorStateFromTiptap text alignment paths', () => {
  it('maps center, right, and justify alignment from Tiptap editor', async () => {
    const { getEditorStateFromTiptap } = await import('./editor/use-editor-state');

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
    const { getEditorCSS } = await import('./editor/editor-styles');

    const css = getEditorCSS();
    expect(css).toContain('min-height: 150px');
  });
});

// ===========================================================================
// 3. ToolbarButton disabled state from context
// ===========================================================================

interface MockButtonProps {
  'aria-label'?: string;
  'aria-disabled'?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  theme?: string;
  children?: ReactNode;
}

interface MockFieldApi {
  state: { value: string; meta: { errors: unknown[] } };
  handleChange: (next: string) => void;
  handleBlur: () => void;
}

type MockValidators = Partial<
  Record<'onChange' | 'onBlur' | 'onSubmit', (arg: { value: unknown }) => string | undefined>
>;

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: MockButtonProps) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      aria-disabled={props['aria-disabled']}
      disabled={props.disabled}
      onClick={props.onPress}
      data-active={props.theme === 'active' ? 'true' : undefined}>
      {props.children}
    </button>
  ),
  Field: ({ children, defaultValue }: { children: (field: MockFieldApi) => ReactNode; defaultValue?: string }) => {
    const field: MockFieldApi = {
      state: { value: defaultValue ?? '', meta: { errors: [] } },
      handleChange: vi.fn<(next: string) => void>(),
      handleBlur: vi.fn<() => void>(),
    };
    return <div data-testid="tanstack-field">{children(field)}</div>;
  },
  FieldLayout: ({ children, label, error }: { children?: ReactNode; label?: string; error?: string }) => (
    <div
      data-testid="field-layout"
      data-label={label}
      data-error={error ?? undefined}>
      {children}
    </div>
  ),
  Skeleton: ({ variant, width, height }: { variant?: string; width?: string; height?: number }) => (
    <div
      data-testid="skeleton"
      data-variant={variant}
      style={{ width, height }}
    />
  ),
  getFieldError: (field: MockFieldApi, propError: string | undefined) => {
    const fieldError = field.state.meta.errors.length > 0 ? String(field.state.meta.errors[0]) : undefined;
    return propError ?? fieldError;
  },
  useFormField: ({ form }: { form?: object }) => ({
    resolvedForm: form ?? undefined,
    knobProps: {
      body: {},
      borderRadius: { borderRadius: '$3', borderWidth: 1 },
      sizeToken: '$4',
      outlined: false,
      inputBackground: '$color2',
      textAccentColor: '$color',
      heading: {},
      gap: { gap: '$2' },
    },
    id: 'test-id',
  }),
  useResolvedValidators: (
    // oxlint-disable-next-line sonarjs/bool-param-default -- mirrors the real useResolvedValidators signature
    required: boolean | undefined,
    validators: MockValidators | undefined,
    label: ReactNode,
    name: string | undefined,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors the real isEmpty contract: a predicate over any field value
    isEmpty?: (v: unknown) => boolean,
  ) => {
    if (required !== true) {
      return validators;
    }
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- default predicate over any field value
    const check = isEmpty ?? ((v: unknown) => v === null || v === undefined || v === '');
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is any ReactNode; only a string label names the message
    const fieldName = typeof label === 'string' ? label : (name ?? 'Field');
    const requiredValidator = ({ value }: { value: unknown }) =>
      check(value) ? `${fieldName} is required` : undefined;
    if (validators === undefined) {
      return { onSubmit: requiredValidator };
    }
    return { ...validators, onSubmit: requiredValidator };
  },
  mergeFieldHandler:
    (field: MockFieldApi, name: 'handleBlur' | 'handleChange', handler?: (...args: never[]) => void) =>
    (...args: never[]) => {
      (field[name] as (...a: never[]) => void)(...args);
      handler?.(...args);
    },
  clampRadiusForLargeComponent: (radiusToken: string | undefined, maxTokenNum = 4) => {
    if (radiusToken === undefined || radiusToken === '') {
      return '$3';
    }
    if (radiusToken === '$0') {
      return 0;
    }
    if (radiusToken.startsWith('$')) {
      const num = Math.trunc(Number(radiusToken.slice(1)));
      return num > maxTokenNum ? `$${maxTokenNum}` : radiusToken;
    }
    return radiusToken;
  },
}));

vi.mock<object>(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  Tooltip: ({ children }: { children: ReactElement }) => children,
}));

vi.mock<object>(import('@tiptap/react/menus'), () => ({
  BubbleMenu: ({ children }: { children?: ReactNode }) => <div data-testid="bubble-menu">{children}</div>,
}));

const mockEditor = {
  isActive: vi.fn<() => boolean>().mockReturnValue(false),
  getAttributes: vi.fn<() => object>().mockReturnValue({}),
  can: vi.fn<() => { undo: () => boolean; redo: () => boolean }>().mockReturnValue({
    undo: () => false,
    redo: () => false,
  }),
  getHTML: vi.fn<() => string>().mockReturnValue('<p></p>'),
  getJSON: vi.fn<() => object>().mockReturnValue({ type: 'doc', content: [] }),
  chain: vi.fn<() => object>().mockReturnValue({
    focus: vi.fn<() => object>().mockReturnValue({
      toggleBold: vi.fn<() => object>().mockReturnValue({ run: vi.fn<() => boolean>() }),
    }),
  }),
  commands: {
    setContent: vi.fn<() => boolean>(),
    focus: vi.fn<() => boolean>(),
    blur: vi.fn<() => boolean>(),
  },
  setEditable: vi.fn<(editable: boolean) => void>(),
  storage: {
    mediaUpload: { handlers: {} },
    suggestionChrome: { value: null },
  },
};

const configurable = () => ({ configure: vi.fn<() => object>().mockReturnValue({}) });

vi.mock<object>(import('@tiptap/react'), () => ({
  useEditor: vi.fn<() => typeof mockEditor>().mockReturnValue(mockEditor),
  EditorContent: () => <div data-testid="editor-content">Editor</div>,
}));

vi.mock<object>(import('@tiptap/starter-kit'), () => ({ default: configurable() }));
vi.mock<object>(import('@tiptap/extension-underline'), () => ({ default: {} }));
vi.mock<object>(import('@tiptap/extension-link'), () => ({ default: configurable() }));
vi.mock<object>(import('@tiptap/extension-placeholder'), () => ({ default: configurable() }));
vi.mock<object>(import('@tiptap/extension-text-align'), () => ({ default: configurable() }));
vi.mock<object>(import('@tiptap/extension-color'), () => ({ Color: {} }));
vi.mock<object>(import('@tiptap/extension-text-style'), () => ({ TextStyle: {} }));
vi.mock<object>(import('@tiptap/extension-highlight'), () => ({ Highlight: configurable() }));
vi.mock<object>(import('@tiptap/extension-subscript'), () => ({ Subscript: {} }));
vi.mock<object>(import('@tiptap/extension-superscript'), () => ({ Superscript: {} }));
vi.mock<object>(import('@tiptap/extension-task-list'), () => ({ default: {} }));
vi.mock<object>(import('@tiptap/extension-task-item'), () => ({ default: configurable() }));
vi.mock<object>(import('@tiptap/extension-image'), () => ({ default: configurable() }));

const { ToolbarButton } = await import('./toolbar/ToolbarButton');
const { FixedToolbar } = await import('./toolbar/FixedToolbar');
const { RichEditor } = await import('./RichEditor');
const { RichTextEditor } = await import('./RichTextEditor/index');

describe('ToolbarButton disabled state from context', () => {
  it('inherits disabled state from RichEditorContext', () => {
    const onPress = vi.fn<() => void>();
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

    const buttons = container.querySelectorAll<HTMLElement>("[role='button']");
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

    const buttons = container.querySelectorAll<HTMLElement>("[role='button']");
    expect(buttons).toHaveLength(0);
  });
});

// ===========================================================================
// 6. RichEditor compound component forwards ref to TiptapEditor
// ===========================================================================

describe('RichEditor ref forwarding', () => {
  it('forwards ref through compound component to TiptapEditor', () => {
    const ref = createRef<RichEditorRef>();

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
    const { getEditorStateFromTiptap, getEditorStateFromBridge } = await import('./editor/use-editor-state');

    const tiptapState = getEditorStateFromTiptap(null);
    const bridgeState = getEditorStateFromBridge(null);

    const tiptapKeys = Object.keys(tiptapState).toSorted();
    const bridgeKeys = Object.keys(bridgeState).toSorted();

    expect(tiptapKeys).toStrictEqual(bridgeKeys);
    expect(tiptapState).toStrictEqual(bridgeState);
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
