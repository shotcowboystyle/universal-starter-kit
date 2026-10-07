import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
/**
 * Mounts every StatusBar story with its args and asserts the visible contract
 * each one exists to show, so a story that stops rendering what its name
 * promises fails here before the gallery ships it.
 */
import { describe, expect, it } from 'vitest';

import meta, { Empty, InFrame, Main, MarkdownMode, SingularCounts } from './StatusBar.stories';
import type { StatusBarStoryArgs } from './StatusBar.stories';

interface StoryLike {
  args?: Partial<StatusBarStoryArgs>;
  render?: unknown;
}

/** Resolve a story the way Storybook does: meta args, story args, story render. */
function mount(story: StoryLike) {
  const args = { ...(meta.args as StatusBarStoryArgs), ...story.args };
  const render = (story.render ?? meta.render) as ((args: StatusBarStoryArgs) => React.ReactElement) | undefined;
  if (!render) {
    throw new Error('story has no render');
  }
  const Story = () => render(args);
  const Decorator = meta.decorators?.[0] as ((S: React.ComponentType) => React.ReactElement) | undefined;
  return renderWithProviders(Decorator ? Decorator(Story) : <Story />);
}

const stories = { Main, SingularCounts, MarkdownMode, Empty, InFrame } as const;

describe('StatusBar stories', () => {
  it('nests under the editor title so the gallery buckets it with RichTextEditor', () => {
    expect(meta.title).toBe('Forms/RichTextEditor/StatusBar');
  });

  it.each(Object.entries(stories))('%s mounts both mode labels', (_name, story) => {
    const { getByText } = mount(story);
    expect(getByText('Rich text')).toBeTruthy();
    expect(getByText('Markdown')).toBeTruthy();
  });

  it('Main shows the plural counts the controls seed', () => {
    const { getByText } = mount(Main);
    expect(getByText('42 words')).toBeTruthy();
    expect(getByText('240 characters')).toBeTruthy();
  });

  it('SingularCounts flips both nouns to singular at exactly one', () => {
    const { getByText, queryByText } = mount(SingularCounts);
    expect(getByText('1 word')).toBeTruthy();
    expect(getByText('1 character')).toBeTruthy();
    expect(queryByText('1 words')).toBeNull();
  });

  it('Empty pluralises at zero', () => {
    const { getByText } = mount(Empty);
    expect(getByText('0 words')).toBeTruthy();
    expect(getByText('0 characters')).toBeTruthy();
  });

  it('MarkdownMode marks the markdown label, not the rich-text one', () => {
    const { getByText } = mount(MarkdownMode);
    const classesOf = (label: string) => (getByText(label) as HTMLElement).className;
    expect(classesOf('Markdown')).toContain('_fow-600');
    expect(classesOf('Rich text')).toContain('_fow-400');
  });

  it('pressing the idle label swaps the marking, so the toggle is live in the story', () => {
    const { getByText } = mount(Main);
    const classesOf = (label: string) => (getByText(label) as HTMLElement).className;
    expect(classesOf('Rich text')).toContain('_fow-600');
    fireEvent.click(getByText('Markdown'));
    expect(classesOf('Markdown')).toContain('_fow-600');
    expect(classesOf('Rich text')).toContain('_fow-400');
  });

  it('InFrame puts the footer under stand-in body copy inside an EditorFrame', () => {
    const { getByText } = mount(InFrame);
    const body = getByText(/Twelve words of body copy/);
    const footer = getByText('12 words');
    expect(body).toBeTruthy();
    expect(footer).toBeTruthy();
    // The footer follows the body in document order (it is the frame's foot).
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
