import { renderWithProviders } from '@repo/test-utils';
/**
 * Mounts every ToolbarGroup story with its args and asserts the visible
 * contract each one exists to show, so a story that stops rendering what its
 * name promises fails here before the gallery ships it.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ToolbarGroupStoryArgs } from './ToolbarGroup.stories';

// The catalog Button and Tooltip are heavy under happy-dom; the toolbar specs
// next to this one already stand them in with a plain button, and the group's
// contract (which children render, and whether a separator follows) is
// unaffected by that swap.
vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Button: (props: any) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));

vi.mock<object>(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  Tooltip: ({ children }: any) => children,
}));

const storiesModule = await import('./ToolbarGroup.stories');
const meta = storiesModule.default;
const { Main, NoSeparator, Hidden, TwoGroups } = storiesModule;

interface StoryLike {
  args?: Partial<ToolbarGroupStoryArgs>;
  render?: unknown;
}

/** Resolve a story the way Storybook does: meta args, story args, story render. */
const mount = (story: StoryLike) => {
  const args = { ...(meta.args as ToolbarGroupStoryArgs), ...story.args };
  const render = (story.render ?? meta.render) as ((args: ToolbarGroupStoryArgs) => React.ReactElement) | undefined;
  if (!render) {
    throw new Error('story has no render');
  }
  const Story = () => render(args);
  const Decorator = meta.decorators?.[0] as ((S: React.ComponentType) => React.ReactElement) | undefined;
  return renderWithProviders(Decorator ? Decorator(Story) : <Story />);
};

/**
 * The row the groups sit in. A ToolbarGroup renders a fragment
 * (group frame + optional separator), so the row's element children ARE the
 * groups and their separators — which is where "did the separator render"
 * is observable, the separator being an unlabeled styled Separator.
 */
const rowOf = (container: HTMLElement, anyButtonLabel: string): HTMLElement => {
  const button = container.querySelector<HTMLElement>(`[aria-label="${anyButtonLabel}"]`);
  if (!button) {
    throw new Error(`no button labeled ${anyButtonLabel}`);
  }
  const groupFrame = button.parentElement;
  const row = groupFrame?.parentElement;
  if (!row) {
    throw new Error('no toolbar row');
  }
  return row;
};

const labelsIn = (container: HTMLElement) =>
  [...container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));

describe('ToolbarGroup stories', () => {
  it('nests under the editor title so the gallery buckets it with RichTextEditor', () => {
    expect(meta.title).toBe('Forms/RichTextEditor/ToolbarGroup');
  });

  it('Main shows the history pair, the formatting trio and a separator between them', () => {
    const { container } = mount(Main);
    const labels = labelsIn(container);
    expect(labels).toContain('Undo');
    expect(labels).toContain('Redo');
    expect(labels).toContain('Bold');
    // group frame, separator, group frame
    expect(rowOf(container, 'Undo').children).toHaveLength(3);
  });

  it('NoSeparator keeps both groups but drops the rule between them', () => {
    const { container } = mount(NoSeparator);
    const labels = labelsIn(container);
    expect(labels).toContain('Undo');
    expect(labels).toContain('Bold');
    expect(rowOf(container, 'Undo').children).toHaveLength(2);
  });

  it("Hidden removes the group's buttons AND its separator, leaving the neighbor", () => {
    const { container } = mount(Hidden);
    const labels = labelsIn(container);
    expect(labels).not.toContain('Undo');
    expect(labels).not.toContain('Redo');
    expect(labels).toContain('Bold');
    expect(rowOf(container, 'Bold').children).toHaveLength(1);
  });

  it('TwoGroups renders three clusters with a rule after each but the last', () => {
    const { container } = mount(TwoGroups);
    const labels = labelsIn(container);
    expect(labels).toContain('Undo');
    expect(labels).toContain('Bold');
    expect(labels).toContain('Blockquote');
    // three group frames + two separators
    expect(rowOf(container, 'Undo').children).toHaveLength(5);
  });
});
