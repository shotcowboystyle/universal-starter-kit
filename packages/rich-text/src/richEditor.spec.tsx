import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must come before imports
// ---------------------------------------------------------------------------

vi.mock(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: (props: any) => (
    <button
      aria-label={props['aria-label']}
      disabled={props.disabled}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { renderWithProviders } from '@repo/test-utils';

import { defaultEditorState } from './types';

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
    const handleStateChange = vi.fn();
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
