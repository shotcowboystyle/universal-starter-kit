/**
 * Mounts every RichEditor shell story with its args and asserts the visible
 * contract each one exists to show, so a story that stops rendering what its
 * name promises fails here before the gallery ships it.
 *
 * ProseMirror needs a browser layout engine happy-dom does not have, and the
 * catalog Button is heavy under it, so both are stood in as the toolbar specs
 * next door do. The theme hooks stay REAL: the toolbar's pickers render a
 * FloatingPanel, which reads knobs rich-editor.test.tsx's `useResolvedKnobs`
 * stub does not carry ("Cannot destructure property 'style' of
 * 'panel.knobProps.elevatedSurface'"). What survives the swaps — which chrome
 * the shell renders for a given set of props — is exactly what these stories
 * are about.
 */
import { renderWithProviders } from '@repo/test-utils';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RichEditorCombinedProps } from './RichEditor';

interface MockButtonProps {
  'aria-label'?: string;
  'aria-disabled'?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: MockButtonProps) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      aria-disabled={props['aria-disabled']}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));

vi.mock<object>(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  Tooltip: ({ children }: { children: ReactElement }) => children,
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
    focus: vi
      .fn<() => object>()
      .mockReturnValue({ toggleBold: vi.fn<() => object>().mockReturnValue({ run: vi.fn<() => boolean>() }) }),
  }),
  commands: { setContent: vi.fn<() => boolean>(), focus: vi.fn<() => boolean>(), blur: vi.fn<() => boolean>() },
  setEditable: vi.fn<(editable: boolean) => void>(),
  storage: { mediaUpload: { handlers: {} }, suggestionChrome: { value: null } },
};

vi.mock<object>(import('@tiptap/react'), () => ({
  useEditor: vi.fn<() => typeof mockEditor>().mockReturnValue(mockEditor),
  EditorContent: () => <div data-testid="editor-content">Editor</div>,
}));
vi.mock<object>(import('@tiptap/react/menus'), () => ({
  BubbleMenu: ({ children }: { children?: ReactNode }) => <div data-testid="bubble-menu">{children}</div>,
}));

const storiesModule = await import('./RichEditor.parts.stories');
const meta = storiesModule.default;
const { Main, NoStatusBar, NotResizable, MarkdownCapabilities, ReadOnly, WithError, Compact } = storiesModule;

interface StoryLike {
  args?: Partial<RichEditorCombinedProps>;
}

/** Resolve a story the way Storybook does: meta args over story args. */
const mount = (story: StoryLike) => {
  const args = { ...meta.args, ...story.args };
  const Component = meta.component;
  if (!Component) {
    throw new Error('RichEditor stories meta has no component');
  }
  return renderWithProviders(<Component {...args} />);
};

const stories = {
  Main,
  NoStatusBar,
  NotResizable,
  MarkdownCapabilities,
  ReadOnly,
  WithError,
  Compact,
} as const;

const labelsIn = (container: HTMLElement) =>
  [...container.querySelectorAll("[role='button']")].map((b) => b.getAttribute('aria-label'));

describe('RichEditor shell stories', () => {
  it('nests under the editor title so the gallery buckets it with RichTextEditor', () => {
    expect(meta.title).toBe('Forms/RichTextEditor/RichEditor');
  });

  it("is a separate title from the form field's, so neither shadows the other", () => {
    expect(meta.title).not.toBe('Forms/RichTextEditor');
  });

  it.each(Object.entries(stories))('%s mounts the editor content', (_name, story) => {
    const { container } = mount(story);
    expect(container.querySelector("[data-testid='editor-content']")).toBeTruthy();
  });

  it('Main renders the toolbar AND the status bar', () => {
    const { container, getByText } = mount(Main);
    expect(container.querySelector("[role='toolbar']")).toBeTruthy();
    expect(labelsIn(container)).toContain('Bold');
    expect(getByText('Rich text')).toBeTruthy();
    expect(getByText('0 words')).toBeTruthy();
  });

  it('NoStatusBar drops the footer, and with it the mode toggle', () => {
    const { container, queryByText } = mount(NoStatusBar);
    expect(queryByText('Rich text')).toBeNull();
    expect(queryByText('0 words')).toBeNull();
    // The toolbar is untouched — only the footer goes.
    expect(container.querySelector("[role='toolbar']")).toBeTruthy();
  });

  it('ReadOnly hides the toolbar, since there is nothing to command', () => {
    const { container } = mount(ReadOnly);
    expect(container.querySelector("[role='toolbar']")).toBeNull();
    expect(container.querySelector("[data-testid='editor-content']")).toBeTruthy();
  });

  it('MarkdownCapabilities drops the controls GFM cannot express', () => {
    const { container } = mount(MarkdownCapabilities);
    const labels = labelsIn(container);
    expect(labels).toContain('Bold');
    expect(labels).not.toContain('Underline');
    expect(labels).not.toContain('Text Color');
  });

  it("WithError keeps the whole shell, since the error is the frame's color", () => {
    const { container, getByText } = mount(WithError);
    expect(container.querySelector("[role='toolbar']")).toBeTruthy();
    expect(getByText('Rich text')).toBeTruthy();
  });

  // One render per test: getByText is bound to the document, so two mounts in
  // one test make every footer query ambiguous.
  it.each([
    ['NotResizable', NotResizable],
    ['Compact', Compact],
  ])('%s still renders toolbar, content and footer', (_name, story) => {
    const { container, getByText } = mount(story);
    expect(container.querySelector("[role='toolbar']")).toBeTruthy();
    expect(container.querySelector("[data-testid='editor-content']")).toBeTruthy();
    expect(getByText('Rich text')).toBeTruthy();
  });
});
