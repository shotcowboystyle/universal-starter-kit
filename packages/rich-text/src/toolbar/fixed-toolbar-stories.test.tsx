import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
/**
 * Mounts every FixedToolbar story with its args and asserts the visible
 * contract each one exists to show, so a story that stops rendering what its
 * name promises fails here before the gallery ships it.
 */
import { describe, expect, it, vi } from 'vitest';

import type { FixedToolbarStoryArgs } from './FixedToolbar.stories';

// Stand-ins for the catalog Button and Tooltip, as in fixedToolbar.spec.tsx
// next to this one: the toolbar's contract is which controls exist and what
// they are labeled, which the swap leaves intact.
vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: any) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      aria-disabled={props['aria-disabled']}
      aria-pressed={props['aria-pressed']}
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

// The LiveEditor story mounts a real editor. ProseMirror needs a browser
// layout engine happy-dom does not have, so the editor is stood in with the
// same mock shape richEditor.spec.tsx uses; what this spec asserts about that
// story is that the bar renders BESIDE an editor, not what the editor does.
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
  commands: { setContent: vi.fn<() => boolean>(), focus: vi.fn<() => boolean>(), blur: vi.fn<() => boolean>() },
  setEditable: vi.fn<(editable: boolean) => void>(),
  storage: { mediaUpload: { handlers: {} }, suggestionChrome: { value: null } },
};

vi.mock<object>(import('@tiptap/react'), () => ({
  useEditor: vi.fn<() => typeof mockEditor>().mockReturnValue(mockEditor),
  EditorContent: () => <div data-testid="editor-content">Editor</div>,
}));
vi.mock<object>(import('@tiptap/react/menus'), () => ({
  BubbleMenu: ({ children }: any) => <div data-testid="bubble-menu">{children}</div>,
}));

const storiesModule = await import('./FixedToolbar.stories');
const meta = storiesModule.default;
const { Main, Sections, MarkdownCapabilities, ErrorState, FullscreenToggle, LiveEditor } = storiesModule;

interface StoryLike {
  args?: Partial<FixedToolbarStoryArgs>;
  render?: unknown;
}

/** Resolve a story the way Storybook does: meta args, story args, story render. */
const mount = (story: StoryLike) => {
  const args = { ...(meta.args as FixedToolbarStoryArgs), ...story.args };
  const render = (story.render ?? meta.render) as ((args: FixedToolbarStoryArgs) => React.ReactElement) | undefined;
  if (!render) {
    throw new Error('story has no render');
  }
  const Story = () => render(args);
  const Decorator = meta.decorators?.[0] as ((S: React.ComponentType) => React.ReactElement) | undefined;
  return renderWithProviders(Decorator ? Decorator(Story) : <Story />);
};

const stories = {
  Main,
  Sections,
  MarkdownCapabilities,
  ErrorState,
  FullscreenToggle,
  LiveEditor,
} as const;

const labelsIn = (container: HTMLElement) =>
  [...container.querySelectorAll("[role='button']")].map((b) => b.getAttribute('aria-label'));

describe('FixedToolbar stories', () => {
  it('nests under the editor title so the gallery buckets it with RichTextEditor', () => {
    expect(meta.title).toBe('Forms/RichTextEditor/FixedToolbar');
  });

  it.each(Object.entries(stories))('%s mounts a labeled toolbar', (_name, story) => {
    const { container } = mount(story);
    const toolbar = container.querySelector("[role='toolbar']");
    expect(toolbar).toBeTruthy();
    expect(toolbar!.getAttribute('aria-label')).toBe('Formatting toolbar');
    expect(labelsIn(container)).toContain('Bold');
  });

  it('Main shows every primary group and keeps the overflow items in More', () => {
    const { container } = mount(Main);
    const labels = labelsIn(container);
    for (const label of [
      'Undo',
      'Redo',
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Text Color',
      'Heading',
      'Lists',
      'Blockquote',
      'Code Block',
      'Link',
      'Insert Image',
      'More formatting options',
    ]) {
      expect(labels).toContain(label);
    }
    expect(labels).not.toContain('Clear Formatting');
  });

  it('Main washes Redo and leaves Undo available, matching its args', () => {
    const { container } = mount(Main);
    const at = (label: string) =>
      container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.getAttribute('aria-disabled');
    expect(at('Undo')).toBeNull();
    expect(at('Redo')).toBe('true');
  });

  it('Sections trims the bar to formatting and link', () => {
    const { container } = mount(Sections);
    const labels = labelsIn(container);
    expect(labels).toContain('Bold');
    expect(labels).toContain('Link');
    expect(labels).not.toContain('Undo');
    expect(labels).not.toContain('Heading');
    expect(labels).not.toContain('Insert Image');
    // isBold: true is what the story exists to show alongside the trim
    expect(container.querySelector<HTMLElement>('[aria-label="Bold"]')!.dataset.active).toBe('true');
  });

  it('MarkdownCapabilities drops the controls GFM cannot express', () => {
    const { container } = mount(MarkdownCapabilities);
    const labels = labelsIn(container);
    expect(labels).toContain('Bold');
    expect(labels).toContain('Link');
    // Absent, not disabled: the commands are never registered.
    expect(labels).not.toContain('Underline');
    expect(labels).not.toContain('Text Color');
    expect(labels).not.toContain('Highlight Color');
  });

  it("ErrorState still renders the full bar (the error is the rule's color)", () => {
    const { container } = mount(ErrorState);
    expect(labelsIn(container)).toContain('Bold');
    expect(container.querySelector("[role='toolbar']")).toBeTruthy();
  });

  it('FullscreenToggle adds the toggle and flips its pressed state', () => {
    const { container, getByText } = mount(FullscreenToggle);
    const toggle = container.querySelector<HTMLElement>('[aria-label="Fullscreen"]')!;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(getByText('Fullscreen: off')).toBeTruthy();
    fireEvent.click(toggle);
    expect(getByText('Fullscreen: on')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('[aria-label="Fullscreen"]')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('Main has no fullscreen toggle, so the FullscreenToggle story earns its place', () => {
    const { container } = mount(Main);
    expect(container.querySelector('[aria-label="Fullscreen"]')).toBeNull();
  });

  it('LiveEditor puts a standalone bar above a real editor', () => {
    const { container } = mount(LiveEditor);
    expect(container.querySelector("[role='toolbar']")).toBeTruthy();
    expect(container.querySelector("[data-testid='editor-content']")).toBeTruthy();
  });
});
