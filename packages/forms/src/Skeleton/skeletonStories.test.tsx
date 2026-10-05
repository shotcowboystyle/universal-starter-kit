import { renderWithProviders } from '@repo/test-utils';
/**
 * Mounts every Forms/Skeleton story and asserts what it exists to show. The
 * theme hooks stay REAL: text-bone height comes from the size recipe and the
 * pulse gates on knobProps.transition, so a stub would measure neither.
 *
 * Geometry is read off the CLASS, not `style`. Tamagui compiles width, height
 * and radius into atomic classes (`_w-240px`, `_w-7037` for 70%), and only the
 * pulse stays an inline style — so `el.style.width` is empty on every bone.
 */
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as storiesModule from './Skeleton.stories';

afterEach(cleanup);

const meta = storiesModule.default;
const { Basic, Variants, TextLines, Circles, LoadingRow, MotionOff, RadiusKnob } = storiesModule;

interface StoryLike {
  render?: (args: Record<string, unknown>) => ReactElement;
}

function mount(story: StoryLike) {
  if (!story.render) {
    throw new Error('story has no render');
  }
  return renderWithProviders(story.render({ ...(meta.args as Record<string, unknown>) }));
}

/** Every bone is a SkeletonFrame, which Tamagui names `is_Skeleton`. */
function bones(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.is_Skeleton'));
}

const classesOf = (el: HTMLElement) => (el.getAttribute('class') ?? '').split(' ');
const widthClass = (el: HTMLElement) => classesOf(el).find((c) => c.startsWith('_w-'));
const heightClass = (el: HTMLElement) => classesOf(el).find((c) => c.startsWith('_h-'));

const stories = { Basic, Variants, TextLines, Circles, LoadingRow, MotionOff, RadiusKnob } as const;

describe('Forms/Skeleton stories', () => {
  it('files under a Forms title so the gallery buckets it with the fields it fills in for', () => {
    expect(meta.title).toBe('Forms/Skeleton');
  });

  it.each(Object.entries(stories))('%s mounts at least one bone', (_name, story) => {
    expect(bones(mount(story as StoryLike).container).length).toBeGreaterThan(0);
  });

  it('Basic paints one bone at the meta width', () => {
    const painted = bones(mount(Basic as StoryLike).container);
    expect(painted.length).toBe(1);
    expect(widthClass(painted[0])).toBe('_w-240px');
  });

  it('Variants shows all four, and the circular one is 1:1', () => {
    const { container, getByText } = mount(Variants as StoryLike);
    for (const name of ['text', 'rounded', 'rectangular', 'circular']) {
      expect(getByText(name)).toBeTruthy();
    }
    const square = bones(container).find((el) => widthClass(el) === '_w-48px' && heightClass(el) === '_h-48px');
    expect(square).toBeTruthy();
  });

  it('TextLines shortens the last line so a block reads as prose', () => {
    const { container, getByText } = mount(TextLines as StoryLike);
    expect(getByText('three lines, last at 70%')).toBeTruthy();
    const widths = bones(container).map(widthClass);
    // 70% and 40% are the two lastLineWidth values; 100% is every other line.
    expect(widths).toContain('_w-7037');
    expect(widths).toContain('_w-4037');
    expect(widths).toContain('_w-10037');
  });

  it('Circles renders three, two of them at explicit sizes', () => {
    const painted = bones(mount(Circles as StoryLike).container);
    expect(painted.length).toBe(3);
    const widths = painted.map(widthClass);
    expect(widths).toContain('_w-32px');
    expect(widths).toContain('_w-64px');
  });

  it('LoadingRow composes an avatar plus a name and two body lines', () => {
    const painted = bones(mount(LoadingRow as StoryLike).container);
    // 1 circle + 1 name bone + 2 body bones.
    expect(painted.length).toBe(4);
    expect(painted.map(widthClass)).toContain('_w-40px');
  });

  /** The pulse is on with the knob and gone without it. */
  it('MotionOff pulses the animated column and not the animate={false} one', () => {
    const { container, getByText } = mount(MotionOff as StoryLike);
    expect(getByText('animation knob on')).toBeTruthy();
    expect(getByText('animation: none')).toBeTruthy();
    const animations = bones(container).map((el) => el.style.animation);
    expect(animations.some((a) => a.includes('skeleton-pulse'))).toBe(true);
    expect(animations.some((a) => !a)).toBe(true);
  });

  it('RadiusKnob renders one column per radius stop', () => {
    const { getByText } = mount(RadiusKnob as StoryLike);
    for (const stop of ['none', 'medium', 'large']) {
      expect(getByText(`borderRadius: ${stop}`)).toBeTruthy();
    }
  });
});
