/**
 * @vitest-environment jsdom
 */

/**
 * TEXT-RIDES-TEXT (catalog arm): Tooltip's content slot wraps ALL bare
 * string/number content — runs of adjacent strings coalesce into TooltipText
 * — so `{label}{cond ? suffix : ""}` renders the concatenated text instead
 * of tripping the native "Text strings must be rendered within a <Text>
 * component" invariant.
 *
 * The slot is specced via the exported `wrapTooltipContent` (the exact
 * function the component renders into TooltipContent): tamagui's Tooltip
 * popper never mounts its content in jsdom/happy-dom (no layout), so the
 * open-tooltip path cannot be driven in unit tests — every other spec in the
 * repo mocks Tooltip away entirely.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { View } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { wrapTooltipContent } from './index';

describe('Tooltip TEXT-RIDES-TEXT', () => {
  it('renders array-of-strings content as one concatenated wrapped run', () => {
    renderWithProviders(<View>{wrapTooltipContent(['Save', ' (Cmd+S)'], {})}</View>);
    const content = screen.getByText('Save (Cmd+S)');
    expect(content).toBeInTheDocument();
    expect(content.tagName).not.toBe('DIV');
  });

  it('renders the origin shape `{label}{cond ? suffix : ""}` when the condition is false', () => {
    const count: number = 0;
    renderWithProviders(<View>{wrapTooltipContent(['Refresh', count !== 0 ? ` (${count})` : ''], {})}</View>);
    const content = screen.getByText('Refresh');
    expect(content.tagName).not.toBe('DIV');
  });

  it('still renders a singleton string content wrapped', () => {
    renderWithProviders(<View>{wrapTooltipContent('Hint', {})}</View>);
    const content = screen.getByText('Hint');
    expect(content.tagName).not.toBe('DIV');
  });

  it('passes element content through untouched', () => {
    const node = <View testID="custom-content" />;
    expect(wrapTooltipContent(node, {})).toBe(node);
  });
});
