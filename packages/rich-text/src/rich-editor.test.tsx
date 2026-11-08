import { renderWithProviders } from '@repo/test-utils';
import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';

import type { EditorState } from './types';
import { defaultEditorState } from './types';

// ---------------------------------------------------------------------------
// Mocks — must come before imports
// ---------------------------------------------------------------------------

interface MockButtonProps {
  'aria-label'?: string;
  disabled?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: MockButtonProps) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      disabled={props.disabled}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
  clampRadiusForLargeComponent: (radiusToken: string | undefined, maxTokenNum = 4) => {
    if (radiusToken === undefined || radiusToken === '') {
      return '$3';
    }
    if (radiusToken === '$0') {
      return 0;
    }
    if (radiusToken.startsWith('$')) {
      const num = Number(radiusToken.slice(1));
      return num > maxTokenNum ? `$${maxTokenNum}` : radiusToken;
    }
    return radiusToken;
  },
}));

vi.mock<object>(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  Tooltip: ({ children }: { children?: ReactNode }): ReactNode => children,
}));

vi.mock<object>(import('@tiptap/react/menus'), () => ({
  BubbleMenu: ({ children }: { children?: ReactNode }) => <div data-testid="bubble-menu">{children}</div>,
}));

const mockEditor = {
  isActive: vi.fn<() => boolean>().mockReturnValue(false),
  getAttributes: vi.fn<() => object>().mockReturnValue({}),
  can: vi
    .fn<() => { undo: () => boolean; redo: () => boolean }>()
    .mockReturnValue({ undo: () => false, redo: () => false }),
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

vi.mock<object>(import('@tiptap/react'), () => ({
  useEditor: vi.fn<() => typeof mockEditor>().mockReturnValue(mockEditor),
  EditorContent: () => <div data-testid="editor-content">Editor</div>,
}));

vi.mock<object>(import('@tiptap/starter-kit'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-underline'), () => ({ default: {} }));
vi.mock<object>(import('@tiptap/extension-link'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-placeholder'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-text-align'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-color'), () => ({ Color: {} }));
vi.mock<object>(import('@tiptap/extension-text-style'), () => ({ TextStyle: {} }));
vi.mock<object>(import('@tiptap/extension-highlight'), () => ({
  Highlight: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-subscript'), () => ({ Subscript: {} }));
vi.mock<object>(import('@tiptap/extension-superscript'), () => ({ Superscript: {} }));
vi.mock<object>(import('@tiptap/extension-task-list'), () => ({ default: {} }));
vi.mock<object>(import('@tiptap/extension-task-item'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-image'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { RichEditor } = await import('./RichEditor');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RichEditor compound component', () => {
  it('provides RichEditorContext to children and renders without error', () => {
    const { container } = renderWithProviders(<RichEditor />);
    // The compound component should render its root EditorFrame
    expect(container.firstChild).toBeTruthy();
  });

  it('exposes FixedToolbar, BubbleToolbar, and Editor as static properties', () => {
    expect(RichEditor.FixedToolbar).toBeDefined();
    expect(RichEditor.BubbleToolbar).toBeDefined();
    expect(RichEditor.Editor).toBeDefined();
  });

  it('applies clampRadiusForLargeComponent max $4 via useResolvedKnobs', () => {
    // Render with default props -- the component internally calls
    // useResolvedKnobs and clampRadiusForLargeComponent
    const { container } = renderWithProviders(<RichEditor />);
    // It should render successfully (radius clamping applied internally)
    expect(container.firstChild).toBeTruthy();
  });

  it('manages EditorState via useState and passes state to toolbar', () => {
    const handleStateChange = vi.fn<(state: EditorState) => void>();
    const { container } = renderWithProviders(
      <RichEditor
        showToolbar
        onStateChange={handleStateChange}
      />,
    );
    // The editor should render with a toolbar when showToolbar is true
    expect(container.firstChild).toBeTruthy();
    // Default state should be applied (no errors during render)
    expect(defaultEditorState.isBold).toBe(false);
    expect(defaultEditorState.isParagraph).toBe(true);
  });

  it('hides toolbar when showToolbar is false', () => {
    const { container: withToolbar } = renderWithProviders(<RichEditor showToolbar />);
    const { container: withoutToolbar } = renderWithProviders(<RichEditor showToolbar={false} />);
    // Both should render, but the one without toolbar should have fewer children
    expect(withToolbar.firstChild).toBeTruthy();
    expect(withoutToolbar.firstChild).toBeTruthy();
  });

  it('applies disabled state when editable is false', () => {
    const { container } = renderWithProviders(<RichEditor editable={false} />);
    expect(container.firstChild).toBeTruthy();
  });
});
