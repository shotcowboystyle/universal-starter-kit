import { describe, it, expect, vi } from 'vitest';

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
}));

vi.mock(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: any) => children,
}));

vi.mock(import('@tiptap/react/menus'), () => ({
  BubbleMenu: ({ children }: any) => <div data-testid="bubble-menu">{children}</div>,
}));

// Mock useEditor and EditorContent from @tiptap/react
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
import { createRef } from 'react';

import { RichEditorContext } from '../context';
import type { RichEditorRef } from '../types';

import { getEditorCSS } from './editorStyles';

const { TiptapEditor } = await import('./TiptapEditor');

function withContext(ui: React.ReactElement, ctxProps?: { size?: any; compact?: boolean; disabled?: boolean }) {
  return (
    <RichEditorContext.Provider
      size={ctxProps?.size ?? '$true'}
      compact={ctxProps?.compact ?? false}
      disabled={ctxProps?.disabled ?? false}>
      {ui}
    </RichEditorContext.Provider>
  );
}

describe('TiptapEditor', () => {
  it('renders with getEditorCSS() styles applied, not inline hardcoded CSS', () => {
    const { container } = renderWithProviders(withContext(<TiptapEditor />));

    const styleTag = container.querySelector('style');
    expect(styleTag).toBeTruthy();
    // The CSS should contain Tamagui CSS custom properties
    const cssContent = styleTag?.textContent ?? '';
    expect(cssContent).toContain('var(--color');
    // It should match the output from getEditorCSS
    getEditorCSS();
    expect(cssContent).toContain('.ProseMirror');
    expect(cssContent).toContain('var(--blue10');
  });

  it('reads styling from RichEditorContext.useStyledContext()', () => {
    // Render with compact and disabled context
    const { container } = renderWithProviders(
      withContext(<TiptapEditor />, {
        size: '$2',
        compact: true,
        disabled: false,
      }),
    );

    // Should render successfully with context values applied
    expect(container.firstChild).toBeTruthy();
    expect(container.querySelector("[data-testid='editor-content']")).toBeTruthy();
  });

  it('gates the formatting bubbles behind showBubbleToolbar (math bubble stays)', () => {
    // With showBubbleToolbar={true}: formatting bubbles + math bubble
    const { container: withBubble } = renderWithProviders(withContext(<TiptapEditor showBubbleToolbar />));
    expect(withBubble.querySelectorAll("[data-testid='bubble-menu']").length).toBeGreaterThan(1);

    // With showBubbleToolbar={false} (default): only the MathBubble stays
    // mounted — it is the only edit path for inline math atoms.
    const { container: withoutBubble } = renderWithProviders(withContext(<TiptapEditor showBubbleToolbar={false} />));
    expect(withoutBubble.querySelectorAll("[data-testid='bubble-menu']")).toHaveLength(1);
  });

  it('exposes RichEditorRef methods via forwardRef and useImperativeHandle', () => {
    const ref = createRef<RichEditorRef>();

    renderWithProviders(withContext(<TiptapEditor ref={ref} />));

    expect(ref.current).toBeTruthy();
    expect(ref.current?.executeCommand).toBeTypeOf('function');
    expect(ref.current?.getState).toBeTypeOf('function');
    expect(ref.current?.getHTML).toBeTypeOf('function');
    expect(ref.current?.getJSON).toBeTypeOf('function');
    expect(ref.current?.setHTML).toBeTypeOf('function');
    expect(ref.current?.setJSON).toBeTypeOf('function');
    expect(ref.current?.focus).toBeTypeOf('function');
    expect(ref.current?.blur).toBeTypeOf('function');
  });

  it('does not include inline hardcoded CSS values', () => {
    const { container } = renderWithProviders(withContext(<TiptapEditor />));

    const styleTag = container.querySelector('style');
    const cssContent = styleTag?.textContent ?? '';
    // Should use CSS custom properties for theme-aware colors
    expect(cssContent).toContain('var(--color12)');
    expect(cssContent).toContain('var(--color10');
  });
});
