import { renderWithProviders } from '@repo/test-utils';
/**
 * Mounts every Forms/Wheel story and asserts the contract each one exists to
 * show, so a story that stops rendering what its name promises fails here
 * rather than in the gallery.
 *
 * The theme hooks stay REAL: Wheel reads knobProps.nestedControl.px for row
 * height and knobProps.transition for snap duration, and a stub that omits
 * either changes the geometry these assertions measure.
 */
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as storiesModule from './Wheel.stories';

afterEach(cleanup);

const meta = storiesModule.default;
const {
  Basic,
  PlainValues,
  VisibleItems,
  LoopingAndBounded,
  JoinedColumns,
  Disabled,
  CustomRenderItem,
  EdgeCases,
  MotionOff,
} = storiesModule;

interface StoryLike {
  render?: (args: Record<string, unknown>) => ReactElement;
}

/** Resolve a story the way Storybook does: story args over meta args. */
function mount(story: StoryLike) {
  const args = { ...(meta.args as Record<string, unknown>) };
  if (!story.render) {
    throw new Error('story has no render');
  }
  return renderWithProviders(story.render(args));
}

const stories = {
  Basic,
  PlainValues,
  VisibleItems,
  LoopingAndBounded,
  JoinedColumns,
  Disabled,
  CustomRenderItem,
  EdgeCases,
  MotionOff,
} as const;

describe('Forms/Wheel stories', () => {
  it('files under a Forms title so the gallery buckets it with the fields it serves', () => {
    expect(meta.title).toBe('Forms/Wheel');
  });

  it('declares the component, which is what the argTypes controls drive', () => {
    expect(meta.component).toBeTruthy();
  });

  it.each(Object.entries(stories))('%s mounts at least one wheel', (_name, story) => {
    const { container } = mount(story as StoryLike);
    expect(container.querySelectorAll("[data-testid='wheel']").length).toBeGreaterThan(0);
  });

  it('Basic paints a selected row and reports it in the caption', () => {
    const { container, getByText } = mount(Basic as StoryLike);
    expect(container.querySelector("[data-selected='true']")).toBeTruthy();
    // meta.args.value is 9 and the caption pads to two digits.
    expect(getByText('selected: 09')).toBeTruthy();
  });

  it('PlainValues renders bare items without a { value, label } wrapper', () => {
    const { getByText } = mount(PlainValues as StoryLike);
    expect(getByText('Medium')).toBeTruthy();
    expect(getByText('Extra large')).toBeTruthy();
  });

  it('VisibleItems shows all three cylinder depths, and each is odd', () => {
    const { container, getByText } = mount(VisibleItems as StoryLike);
    expect(container.querySelectorAll("[data-testid='wheel']").length).toBe(3);
    for (const count of [3, 5, 7]) {
      expect(getByText(`visibleItems=${count}`)).toBeTruthy();
    }
    // Tamagui compiles height to a class, not an inline style, so the three
    // depths show up as three distinct _h-* classes on the containers.
    const heightClasses = Array.from(container.querySelectorAll("[data-testid='wheel']")).map((w) =>
      (w.getAttribute('class') ?? '').split(' ').find((c) => c.startsWith('_h-')),
    );
    expect(new Set(heightClasses).size).toBe(3);
  });

  it('LoopingAndBounded pairs a looping column with a bounded one', () => {
    const { container, getByText } = mount(LoopingAndBounded as StoryLike);
    expect(container.querySelectorAll("[data-testid='wheel']").length).toBe(2);
    expect(getByText('loop')).toBeTruthy();
    expect(getByText('bounded')).toBeTruthy();
    // AM/PM must not loop, or the user scrolls past the last offered value.
    expect(getByText('PM')).toBeTruthy();
  });

  it('JoinedColumns declares start / none / end so three columns read as one band', () => {
    const { container } = mount(JoinedColumns as StoryLike);
    const sliders = container.querySelectorAll("[role='slider']");
    expect(sliders.length).toBe(3);
    expect(Array.from(sliders).map((s) => s.getAttribute('aria-label'))).toEqual(['Hour', 'Minute', 'AM/PM']);
  });

  it('Disabled marks the disabled wheel for a11y and leaves the enabled one alone', () => {
    const { container } = mount(Disabled as StoryLike);
    const wheels = Array.from(container.querySelectorAll("[data-testid='wheel']"));
    expect(wheels.length).toBe(2);
    expect(wheels[0].getAttribute('aria-disabled')).toBeNull();
    expect(wheels[1].getAttribute('aria-disabled')).toBe('true');
  });

  /** renderItem is handed the VALUE, not the { value, label } wrapper. */
  it('CustomRenderItem lets the consumer own the row, bolding the selected one', () => {
    const { container, getByText } = mount(CustomRenderItem as StoryLike);
    expect(getByText('Rupee')).toBeTruthy();
    expect(getByText('US Dollar')).toBeTruthy();
    expect(container.querySelector("[data-selected='true']")).toBeTruthy();
  });

  it('EdgeCases survives an empty wheel without throwing', () => {
    const { container, getByText } = mount(EdgeCases as StoryLike);
    expect(container.querySelectorAll("[data-testid='wheel']").length).toBe(3);
    expect(getByText('Only')).toBeTruthy();
    expect(getByText('America/Argentina/Buenos_Aires')).toBeTruthy();
  });

  it('MotionOff puts an animated wheel beside one under animation:none', () => {
    const { container, getByText } = mount(MotionOff as StoryLike);
    expect(container.querySelectorAll("[data-testid='wheel']").length).toBe(2);
    expect(getByText('animation: medium')).toBeTruthy();
    expect(getByText('animation: none')).toBeTruthy();
  });
});
