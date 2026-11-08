import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RichEditorContext } from '../context';
import { defaultEditorState } from '../types';
import type { EditorMode, EditorState } from '../types';

import { StatusBar } from './StatusBar';

const withContext = (ui: React.ReactElement) => (
  <RichEditorContext.Provider
    size="$true"
    compact={false}
    disabled={false}>
    {ui}
  </RichEditorContext.Provider>
);

const stateWith = (counts: Partial<EditorState>): EditorState => ({ ...defaultEditorState, ...counts });

describe(StatusBar, () => {
  it('offers both editor modes as pressable labels', () => {
    const { getByText } = renderWithProviders(
      withContext(
        <StatusBar
          state={defaultEditorState}
          mode="richtext"
          onModeChange={() => {}}
        />,
      ),
    );
    expect(getByText('Rich text')).toBeTruthy();
    expect(getByText('Markdown')).toBeTruthy();
  });

  it('reports the mode the user picked, not the mode it is already in', () => {
    const onModeChange = vi.fn<(mode: EditorMode) => void>();
    const { getByText } = renderWithProviders(
      withContext(
        <StatusBar
          state={defaultEditorState}
          mode="richtext"
          onModeChange={onModeChange}
        />,
      ),
    );

    fireEvent.click(getByText('Markdown'));
    expect(onModeChange).toHaveBeenCalledWith('markdown');

    fireEvent.click(getByText('Rich text'));
    expect(onModeChange).toHaveBeenLastCalledWith('richtext');
    expect(onModeChange).toHaveBeenCalledTimes(2);
  });

  it('marks the active mode, and swaps the marking when the mode changes', () => {
    const { getByText, rerender } = renderWithProviders(
      withContext(
        <StatusBar
          state={defaultEditorState}
          mode="richtext"
          onModeChange={() => {}}
        />,
      ),
    );
    // Tamagui compiles the weight/colour props to class tokens, so the
    // rendered class list is where "active" is actually observable.
    const classesOf = (label: string) => getByText(label).className;

    const activeClasses = classesOf('Rich text');
    const idleClasses = classesOf('Markdown');
    expect(activeClasses).not.toBe(idleClasses);
    expect(activeClasses).toContain('_fow-600');
    expect(idleClasses).toContain('_fow-400');

    rerender(
      withContext(
        <StatusBar
          state={defaultEditorState}
          mode="markdown"
          onModeChange={() => {}}
        />,
      ),
    );
    expect(classesOf('Markdown')).toBe(activeClasses);
    expect(classesOf('Rich text')).toBe(idleClasses);
  });

  it('singularises exactly at one word and one character', () => {
    const { getByText } = renderWithProviders(
      withContext(
        <StatusBar
          state={stateWith({ wordCount: 1, characterCount: 1 })}
          mode="richtext"
          onModeChange={() => {}}
        />,
      ),
    );
    expect(getByText('1 word')).toBeTruthy();
    expect(getByText('1 character')).toBeTruthy();
  });

  it('pluralises at zero as well as at many', () => {
    const { getByText, rerender } = renderWithProviders(
      withContext(
        <StatusBar
          state={defaultEditorState}
          mode="richtext"
          onModeChange={() => {}}
        />,
      ),
    );
    expect(getByText('0 words')).toBeTruthy();
    expect(getByText('0 characters')).toBeTruthy();

    rerender(
      withContext(
        <StatusBar
          state={stateWith({ wordCount: 42, characterCount: 240 })}
          mode="richtext"
          onModeChange={() => {}}
        />,
      ),
    );
    expect(getByText('42 words')).toBeTruthy();
    expect(getByText('240 characters')).toBeTruthy();
  });
});
