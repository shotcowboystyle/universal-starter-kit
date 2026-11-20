import { renderWithProviders } from '@repo/test-utils';
/**
 * Mounts every Forms/InputParts story and asserts the anatomy each one exists
 * to show. The theme hooks stay REAL: Box height, icon size and the caption
 * type ramp all come out of useResolvedKnobs, so a stub would measure a
 * geometry the gallery never paints.
 */
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import meta, {
  Adornments,
  Anatomy,
  DisabledBox,
  FocusRingOnTheBox,
  Info,
  MetaReservesOneLine,
  MultiLine,
  TrailingButton,
} from './InputParts.stories';

interface StoryLike {
  render?: (args: NonNullable<typeof meta.args>) => ReactElement;
}

const mount = (story: StoryLike) => {
  if (!story.render) {
    throw new Error('story has no render');
  }
  return renderWithProviders(story.render({ ...meta.args }));
};

const stories = {
  Anatomy,
  FocusRingOnTheBox,
  Adornments,
  TrailingButton,
  MetaReservesOneLine,
  Info,
  MultiLine,
  DisabledBox,
} as const;

describe('Forms/InputParts stories', () => {
  afterEach(cleanup);

  it("files under its own Forms title, separate from the Input field's", () => {
    expect(meta.title).toBe('Forms/InputParts');
    expect(meta.title).not.toBe('Forms/Input');
  });

  it.each(Object.entries(stories))('%s mounts something interactive', (_name, story) => {
    const { container } = mount(story as StoryLike);
    expect(container.querySelector('input, textarea, button')).toBeTruthy();
  });

  it('Anatomy wires the label to the control it names', () => {
    const { container } = mount(Anatomy as StoryLike);
    const input = container.querySelector('#anatomy-email');
    expect(input).toBeTruthy();
    expect(container.querySelector("label[for='anatomy-email']")).toBeTruthy();
  });

  it('Anatomy renders the helper caption under the box', () => {
    const { getByText } = mount(Anatomy as StoryLike);
    expect(getByText('We only use this to send receipts.')).toBeTruthy();
  });

  it('Adornments builds three boxes: leading, trailing, and both', () => {
    const { container } = mount(Adornments as StoryLike);
    const placeholders = [...container.querySelectorAll('input')].map((i) => i.getAttribute('placeholder'));
    expect(placeholders).toStrictEqual(['Leading icon', 'Trailing icon', 'Both ends']);
  });

  it('TrailingButton exposes a labeled reveal toggle beside the field', () => {
    const { container } = mount(TrailingButton as StoryLike);
    const button = container.querySelector("[aria-label='Show password']");
    expect(button).toBeTruthy();
    expect(container.querySelector('#parts-password')).toBeTruthy();
  });

  /**
   * STABLE GROUND: Meta owns ONE caption slot. The error REPLACES the helper,
   * so the errored field must not show both lines.
   */
  it('MetaReservesOneLine replaces the helper with the error rather than stacking them', () => {
    const { container, getByText } = mount(MetaReservesOneLine as StoryLike);
    expect(getByText('Enter at least two characters.')).toBeTruthy();
    // The valid field keeps its helper; the errored one does not add a second line.
    const helpers = [...container.querySelectorAll('*')].filter(
      (el) => el.children.length === 0 && el.textContent === 'Two to thirty characters.',
    );
    expect(helpers).toHaveLength(1);
  });

  it('MetaReservesOneLine announces the error to assistive tech', () => {
    const { container } = mount(MetaReservesOneLine as StoryLike);
    const alert = container.querySelector("[role='alert']");
    expect(alert?.textContent).toBe('Enter at least two characters.');
  });

  it('Info renders caption prose without a Meta wrapper', () => {
    const { getByText, container } = mount(Info as StoryLike);
    expect(getByText('Shown next to everything you publish.')).toBeTruthy();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it('MultiLine mounts a textarea, not a single-line input', () => {
    const { container } = mount(MultiLine as StoryLike);
    expect(container.querySelector('textarea#parts-notes')).toBeTruthy();
  });

  it('DisabledBox disables only the second field, leaving the first usable', () => {
    const { container } = mount(DisabledBox as StoryLike);
    const inputs = [...container.querySelectorAll('input')];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].disabled).toBe(false);
    expect(inputs[1].disabled).toBe(true);
  });
});
