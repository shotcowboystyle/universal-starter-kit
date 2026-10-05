/**
 * TEXT-RIDES-TEXT: Accordion's trigger title,
 * description, and content slots wrap ALL bare string/number children —
 * runs of adjacent strings coalesce into the slot's own Text wrapper — so
 * `{label}{cond ? suffix : ""}` renders the concatenated label instead of
 * tripping the native "Text strings must be rendered within a <Text>
 * component" invariant and silently dropping the label.
 *
 * A wrapped run renders a Text element (<span>); a bare run's direct text
 * holder would be the layout <div> — asserting the getByText match is not a
 * DIV proves the string rides a Text component.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Accordion } from './index';

describe('Accordion TEXT-RIDES-TEXT', () => {
  it('renders array-of-strings trigger children as one concatenated wrapped label', () => {
    renderWithProviders(
      <Accordion defaultValue="a">
        <Accordion.Item value="a">
          <Accordion.Trigger>
            Section one
            {' (3)'}
          </Accordion.Trigger>
          <Accordion.Content>Body</Accordion.Content>
        </Accordion.Item>
      </Accordion>,
    );
    const label = screen.getByText('Section one (3)');
    expect(label).toBeInTheDocument();
    expect(label.tagName).not.toBe('DIV');
  });

  it('renders array-of-strings description wrapped', () => {
    const count: number = 0;
    renderWithProviders(
      <Accordion>
        <Accordion.Item value="a">
          <Accordion.Trigger description={['Sub', count !== 0 ? ` (${count})` : '']}>Title</Accordion.Trigger>
          <Accordion.Content>Body</Accordion.Content>
        </Accordion.Item>
      </Accordion>,
    );
    const description = screen.getByText('Sub');
    expect(description.tagName).not.toBe('DIV');
  });

  it('renders array-of-strings content children wrapped', () => {
    renderWithProviders(
      <Accordion defaultValue="a">
        <Accordion.Item value="a">
          <Accordion.Trigger>Title</Accordion.Trigger>
          <Accordion.Content>
            Details
            {' continued'}
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>,
    );
    const content = screen.getByText('Details continued');
    expect(content).toBeInTheDocument();
    expect(content.tagName).not.toBe('DIV');
  });
});
