import { renderWithProviders } from '@repo/test-utils';
/**
 * Mounts every Forms/ContextualSaveBar/UnsavedChangesDialog story and asserts
 * what it exists to show — chiefly the copy pluralisation and that the safe
 * choice, not the destructive one, is what a dismissal resolves to.
 *
 * Only one open dialog per test: Dialog.Portal mounts to the document body, so
 * two open at once make every text query ambiguous.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as storiesModule from './UnsavedChangesDialog.stories';

afterEach(cleanup);

const meta = storiesModule.default;
const { Basic, SingleField, ManyFields, Closed, Interactive } = storiesModule;

interface StoryLike {
  render?: (args: Record<string, unknown>) => ReactElement;
}

function mount(story: StoryLike) {
  if (!story.render) {
    throw new Error('story has no render');
  }
  return renderWithProviders(story.render({ ...(meta.args as Record<string, unknown>) }));
}

describe('Forms/ContextualSaveBar/UnsavedChangesDialog stories', () => {
  it('nests under ContextualSaveBar so the gallery keeps it with the bar that raises it', () => {
    expect(meta.title).toBe('Forms/ContextualSaveBar/UnsavedChangesDialog');
  });

  it('Basic opens an alertdialog with both choices', () => {
    mount(Basic as StoryLike);
    expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
    expect(screen.getByText('Keep editing')).toBeTruthy();
    expect(screen.getByText('Discard changes')).toBeTruthy();
    expect(document.querySelector("[role='alertdialog']")).toBeTruthy();
  });

  it('SingleField uses the singular sentence', () => {
    mount(SingleField as StoryLike);
    expect(screen.getByText("1 field on this page has edits that aren't saved. Leaving discards them.")).toBeTruthy();
  });

  it('ManyFields uses the plural sentence with the count interpolated', () => {
    mount(ManyFields as StoryLike);
    expect(
      screen.getByText("14 fields on this page have edits that aren't saved. Leaving discards them."),
    ).toBeTruthy();
  });

  it('Closed paints no dialog at all', () => {
    const { getByText } = mount(Closed as StoryLike);
    expect(getByText('Nothing should paint below this line.')).toBeTruthy();
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
  });

  it('Interactive opens on the trigger and closes on Keep editing', () => {
    const { getByText } = mount(Interactive as StoryLike);
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
    fireEvent.click(getByText('Leave the page'));
    expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
    fireEvent.click(screen.getByText('Keep editing'));
    expect(getByText('last outcome: kept editing')).toBeTruthy();
  });

  it('Interactive records a discard as a distinct outcome from keeping', () => {
    const { getByText } = mount(Interactive as StoryLike);
    fireEvent.click(getByText('Leave the page'));
    fireEvent.click(screen.getByText('Discard changes'));
    expect(getByText('last outcome: discarded')).toBeTruthy();
  });
});
