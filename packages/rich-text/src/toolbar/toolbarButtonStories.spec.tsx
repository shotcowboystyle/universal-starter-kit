import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
/**
 * Mounts every ToolbarButton story with its args and asserts the visible
 * contract each one exists to show, so a story that stops rendering what its
 * name promises fails here before the gallery ships it.
 */
import { describe, expect, it, vi } from 'vitest';

// Stand-ins for the catalog Button and Tooltip, as in the toolbar specs next
// to this one. Both forward the attributes the stories exist to demonstrate:
// the DG-ST-03 aria-disabled state and the DG-OVL-05 tooltip.
vi.mock(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: (props: any) => (
    <button
      aria-label={props['aria-label']}
      aria-disabled={props['aria-disabled']}
      aria-pressed={props['aria-pressed']}
      onClick={props.onPress}
      data-active={props.theme === 'active' ? 'true' : undefined}>
      {props.children}
    </button>
  ),
}));

vi.mock(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ content, children }: any) => <span data-tooltip={content}>{children}</span>,
}));

const storiesModule = await import('./ToolbarButton.stories');
const meta = storiesModule.default;
const { Main, Active, Unavailable, WithTooltip, DropdownButton, Row } = storiesModule;
type ToolbarButtonStoryArgs = import('./ToolbarButton.stories').ToolbarButtonStoryArgs;

interface StoryLike {
  args?: Partial<ToolbarButtonStoryArgs>;
  render?: unknown;
}

/** Resolve a story the way Storybook does: meta args, story args, story render. */
function mount(story: StoryLike) {
  const args = { ...(meta.args as ToolbarButtonStoryArgs), ...story.args };
  const render = (story.render ?? meta.render) as ((args: ToolbarButtonStoryArgs) => React.ReactElement) | undefined;
  if (!render) {
    throw new Error('story has no render');
  }
  const Story = () => render(args);
  const Decorator = meta.decorators?.[0] as ((S: React.ComponentType) => React.ReactElement) | undefined;
  return renderWithProviders(Decorator ? Decorator(Story) : <Story />);
}

const stories = { Main, Active, Unavailable, WithTooltip, DropdownButton, Row } as const;

const buttonNamed = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLElement>(`[aria-label="${label}"]`);

describe('ToolbarButton stories', () => {
  it('nests under the editor title so the gallery buckets it with RichTextEditor', () => {
    expect(meta.title).toBe('Forms/RichTextEditor/ToolbarButton');
  });

  it.each(Object.entries(stories))('%s mounts at least one labelled control', (_name, story) => {
    const { container } = mount(story);
    const buttons = container.querySelectorAll("[role='button']");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of [...buttons]) {
      expect(button.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('Main is available: it fires onPress and is not aria-disabled', () => {
    const { container } = mount(Main);
    const bold = buttonNamed(container, 'Bold')!;
    expect(bold.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(bold);
  });

  it('Active marks the button through the active theme', () => {
    const { container } = mount(Active);
    expect(buttonNamed(container, 'Bold')!.dataset.active).toBe('true');
    // Main is the same button without the mark, so the story earns its place.
    const plain = mount(Main);
    expect(buttonNamed(plain.container, 'Bold')!.dataset.active).toBeNull();
  });

  it('Unavailable reports aria-disabled and drops the tooltip (DG-ST-03 / DG-OVL-05)', () => {
    const { container } = mount(Unavailable);
    const undo = buttonNamed(container, 'Undo')!;
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    // Never bare-disabled: it stays focusable so AT can still reach it.
    expect(undo.hasAttribute('disabled')).toBe(false);
    expect(container.querySelector('[data-tooltip]')).toBeNull();
  });

  it('WithTooltip keeps the shortcut hint that Unavailable loses', () => {
    const { container } = mount(WithTooltip);
    const tooltip = container.querySelector('[data-tooltip]');
    expect(tooltip).toBeTruthy();
    expect(tooltip!.dataset.tooltip).toBe('Strikethrough (⌘⇧X)');
  });

  it('DropdownButton shows the caret variant in all three states', () => {
    const { container } = mount(DropdownButton);
    expect(buttonNamed(container, 'Heading')).toBeTruthy();
    expect(buttonNamed(container, 'Lists')!.dataset.active).toBe('true');
    expect(buttonNamed(container, 'Table')!.getAttribute('aria-disabled')).toBe('true');
    // The caret is what separates this from the square button.
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3);
  });

  it('Row lines the states up: unavailable, plain, active', () => {
    const { container } = mount(Row);
    expect(buttonNamed(container, 'Undo')!.getAttribute('aria-disabled')).toBe('true');
    expect(buttonNamed(container, 'Redo')!.getAttribute('aria-disabled')).toBeNull();
    expect(buttonNamed(container, 'Bold')!.dataset.active).toBe('true');
    expect(buttonNamed(container, 'Italic')!.dataset.active).toBeNull();
  });
});
