import { renderWithProviders } from '@repo/test-utils';
import { describe, it, expect, vi } from 'vitest';

import { RichEditorContext } from '../context';
import { defaultEditorState } from '../types';

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: any) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      disabled={props.disabled}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));

vi.mock<object>(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  Tooltip: ({ children }: any) => children,
}));

vi.mock<object>(import('@tiptap/react/menus'), () => ({
  BubbleMenu: ({ children, editor: _editor }: any) => <div data-testid="bubble-menu">{children}</div>,
}));

const { BubbleToolbar } = await import('./BubbleToolbar');

const withContext = (ui: React.ReactElement) => (
  <RichEditorContext.Provider
    size="$true"
    compact={false}
    disabled={false}>
    {ui}
  </RichEditorContext.Provider>
);

describe('BubbleToolbar', () => {
  it('renders inline formatting buttons only', () => {
    const editorRef = { current: null };
    const mockEditor = {} as any;

    const { container } = renderWithProviders(
      withContext(
        <BubbleToolbar
          editor={mockEditor}
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );

    const buttons = container.querySelectorAll("[role='button']");
    const labels = [...buttons].map((b) => b.getAttribute('aria-label'));

    // Inline formatting buttons should be present
    expect(labels).toContain('Bold');
    expect(labels).toContain('Italic');
    expect(labels).toContain('Underline');
    expect(labels).toContain('Strikethrough');
    expect(labels).toContain('Code');
    expect(labels).toContain('Subscript');
    expect(labels).toContain('Superscript');
    expect(labels).toContain('Text Color');
    expect(labels).toContain('Highlight Color');
    expect(labels).toContain('Link');
  });

  it('does not render heading, list, or alignment controls', () => {
    const editorRef = { current: null };
    const mockEditor = {} as any;

    const { container } = renderWithProviders(
      withContext(
        <BubbleToolbar
          editor={mockEditor}
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );

    const buttons = container.querySelectorAll("[role='button']");
    const labels = [...buttons].map((b) => b.getAttribute('aria-label'));

    // Heading, list, alignment, block controls should NOT be present
    expect(labels).not.toContain('Heading');
    expect(labels).not.toContain('Lists');
    expect(labels).not.toContain('Align Left');
    expect(labels).not.toContain('Align Center');
    expect(labels).not.toContain('Align Right');
    expect(labels).not.toContain('Blockquote');
    expect(labels).not.toContain('Code Block');
    expect(labels).not.toContain('Horizontal Rule');
    expect(labels).not.toContain('Clear Formatting');
    expect(labels).not.toContain('Insert Image');
    expect(labels).not.toContain('Undo');
    expect(labels).not.toContain('Redo');
  });
});
