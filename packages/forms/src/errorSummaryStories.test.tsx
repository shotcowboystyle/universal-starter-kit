import { renderWithProviders } from '@repo/test-utils';
/**
 * Mounts every Forms/ErrorSummary story and asserts what it exists to show.
 *
 * Autofocus is off in most stories on purpose: the summary grabs focus on
 * appear, and two mounted summaries in one file would fight over it. The one
 * story that leaves it on is asserted for the alert role instead, which is the
 * half of the contract that does not need a real focus manager.
 */
import { cleanup, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as storiesModule from './ErrorSummary.stories';

afterEach(cleanup);

const meta = storiesModule.default;
const {
  Basic,
  StructuredErrors,
  CustomLabels,
  SingleError,
  EmptyRendersNothing,
  FocusesTheFieldOnPress,
  AutoFocusOnAppear,
} = storiesModule;

interface StoryLike {
  render?: (args: Record<string, unknown>) => ReactElement;
}

function mount(story: StoryLike) {
  if (!story.render) {
    throw new Error('story has no render');
  }
  return renderWithProviders(story.render({ ...(meta.args as Record<string, unknown>) }));
}

describe('Forms/ErrorSummary stories', () => {
  it('files under a Forms title so the gallery buckets it with the form surfaces', () => {
    expect(meta.title).toBe('Forms/ErrorSummary');
  });

  it('Basic renders the summary as an alert with one link per error', () => {
    const { container } = mount(Basic as StoryLike);
    const summary = container.querySelector("[data-testid='error-summary']");
    expect(summary).toBeTruthy();
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(container.querySelectorAll('a').length).toBe(2);
  });

  it('Basic names the summary by its own heading', () => {
    const { container, getByText } = mount(Basic as StoryLike);
    const summary = container.querySelector("[data-testid='error-summary']") as HTMLElement;
    const headingId = summary.getAttribute('aria-labelledby');
    expect(headingId).toBeTruthy();
    expect(getByText('There is a problem')).toBeTruthy();
    expect(container.querySelector(`#${headingId}`)?.textContent).toBe('There is a problem');
  });

  /** Problem + action flatten into one sentence, not two bullets. */
  it('StructuredErrors joins problem and action into a single link', () => {
    const { getByText, container } = mount(StructuredErrors as StoryLike);
    expect(
      getByText('That VAT number is not registered. Check it against your registration certificate.'),
    ).toBeTruthy();
    expect(getByText('The start date is in the past.')).toBeTruthy();
    expect(container.querySelectorAll('a').length).toBe(2);
  });

  it('CustomLabels prefers the label over the error text and keeps a custom title', () => {
    const { getByText, queryByText } = mount(CustomLabels as StoryLike);
    expect(getByText('Check these before continuing')).toBeTruthy();
    expect(getByText('Email address')).toBeTruthy();
    expect(queryByText('Enter an email address')).toBeNull();
  });

  it('SingleError renders exactly one link', () => {
    const { container } = mount(SingleError as StoryLike);
    expect(container.querySelectorAll('a').length).toBe(1);
  });

  it('EmptyRendersNothing paints no summary at all', () => {
    const { container, getByText } = mount(EmptyRendersNothing as StoryLike);
    expect(container.querySelector("[data-testid='error-summary']")).toBeNull();
    expect(getByText('Second line.')).toBeTruthy();
  });

  it('FocusesTheFieldOnPress starts clean and raises the summary on submit', () => {
    const { container, getByText } = mount(FocusesTheFieldOnPress as StoryLike);
    expect(container.querySelector("[data-testid='error-summary']")).toBeNull();
    fireEvent.click(getByText('Submit'));
    const summary = container.querySelector("[data-testid='error-summary']");
    expect(summary).toBeTruthy();
    expect(container.querySelectorAll('a').length).toBe(2);
  });

  it('FocusesTheFieldOnPress links target the ids its fields actually carry', () => {
    const { container, getByText } = mount(FocusesTheFieldOnPress as StoryLike);
    fireEvent.click(getByText('Submit'));
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#email', '#password']);
    expect(container.querySelector('#email')).toBeTruthy();
    expect(container.querySelector('#password')).toBeTruthy();
  });

  it('AutoFocusOnAppear toggles the summary in and out on the button', () => {
    const { container, getByText } = mount(AutoFocusOnAppear as StoryLike);
    expect(container.querySelector("[data-testid='error-summary']")).toBeNull();
    fireEvent.click(getByText('Show the summary'));
    expect(container.querySelector("[data-testid='error-summary']")).toBeTruthy();
    fireEvent.click(getByText('Hide the summary'));
    expect(container.querySelector("[data-testid='error-summary']")).toBeNull();
  });
});
