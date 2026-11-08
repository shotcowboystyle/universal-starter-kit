import { renderWithProviders } from '@repo/test-utils';
import { describe, it, expect, vi } from 'vitest';

import { RichEditorContext } from '../context';
import { defaultEditorState } from '../types';
import type { ToolbarSection } from '../types';

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: any) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      disabled={props.disabled}
      onClick={props.onPress}
      data-active={props.theme === 'active' ? 'true' : undefined}>
      {props.children}
    </button>
  ),
}));

vi.mock<object>(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  Tooltip: ({ children }: any) => children,
}));

const { FixedToolbar } = await import('./FixedToolbar');

const withContext = (ui: React.ReactElement) => (
  <RichEditorContext.Provider
    size="$true"
    compact={false}
    disabled={false}>
    {ui}
  </RichEditorContext.Provider>
);

describe('FixedToolbar (web)', () => {
  it('renders primary toolbar groups and the More overflow button', () => {
    const editorRef = { current: null };
    const { container } = renderWithProviders(
      withContext(
        <FixedToolbar
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );

    const buttons = container.querySelectorAll("[role='button']");
    const labels = [...buttons].map((b) => b.getAttribute('aria-label'));

    // Primary groups (always visible)
    expect(labels).toContain('Undo');
    expect(labels).toContain('Redo');
    expect(labels).toContain('Bold');
    expect(labels).toContain('Italic');
    expect(labels).toContain('Underline');
    expect(labels).toContain('Strikethrough');
    expect(labels).toContain('Text Color');
    expect(labels).toContain('Highlight Color');
    expect(labels).toContain('Heading');
    expect(labels).toContain('Lists');
    expect(labels).toContain('Blockquote');
    expect(labels).toContain('Code Block');
    expect(labels).toContain('Link');
    expect(labels).toContain('Insert Image');

    // Overflow items are inside the More dropdown (not directly visible)
    expect(labels).toContain('More formatting options');
    expect(labels).not.toContain('Align Left');
    expect(labels).not.toContain('Clear Formatting');
  });

  it('sections prop controls visibility of toolbar groups', () => {
    const editorRef = { current: null };
    const sections: ToolbarSection[] = ['formatting', 'link'];
    const { container } = renderWithProviders(
      withContext(
        <FixedToolbar
          editorRef={editorRef}
          state={defaultEditorState}
          sections={sections}
        />,
      ),
    );

    const buttons = container.querySelectorAll("[role='button']");
    const labels = [...buttons].map((b) => b.getAttribute('aria-label'));

    // Visible sections
    expect(labels).toContain('Bold');
    expect(labels).toContain('Link');

    // Hidden sections
    expect(labels).not.toContain('Undo');
    expect(labels).not.toContain('Heading');
    expect(labels).not.toContain('Insert Image');
  });

  it('renders with all primary sections visible when sections prop is omitted', () => {
    const editorRef = { current: null };
    const { container } = renderWithProviders(
      withContext(
        <FixedToolbar
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );

    const buttons = container.querySelectorAll("[role='button']");
    const labels = [...buttons].map((b) => b.getAttribute('aria-label'));

    expect(labels).toContain('Undo');
    expect(labels).toContain('Bold');
    expect(labels).toContain('Text Color');
    expect(labels).toContain('Heading');
    expect(labels).toContain('Lists');
    expect(labels).toContain('Blockquote');
    expect(labels).toContain('Link');
    expect(labels).toContain('Insert Image');
    expect(labels).toContain('More formatting options');
  });

  it('correctly orders groups: History before Formatting before Color', () => {
    const editorRef = { current: null };
    const { container } = renderWithProviders(
      withContext(
        <FixedToolbar
          editorRef={editorRef}
          state={defaultEditorState}
        />,
      ),
    );

    const buttons = container.querySelectorAll("[role='button']");
    const labels = [...buttons].map((b) => b.getAttribute('aria-label'));

    const undoIdx = labels.indexOf('Undo');
    const boldIdx = labels.indexOf('Bold');
    const textColorIdx = labels.indexOf('Text Color');
    const headingIdx = labels.indexOf('Heading');

    expect(undoIdx).toBeLessThan(boldIdx);
    expect(boldIdx).toBeLessThan(textColorIdx);
    expect(textColorIdx).toBeLessThan(headingIdx);
  });
});
