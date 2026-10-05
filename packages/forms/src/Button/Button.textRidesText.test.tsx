/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { SizableText } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { Button } from './index';

/**
 * TEXT-RIDES-TEXT (catalog arm): the Button text slot wraps ALL bare
 * string/number children — runs of adjacent strings coalesce into the same
 * SizableText the singleton path uses — so `{label}{cond ? suffix : ""}`
 * renders the concatenated label instead of tripping the native "Text strings
 * must be rendered within a <Text> component" invariant and silently dropping
 * the label.
 *
 * getByText matches only elements whose DIRECT text nodes hold the text, so a
 * bare (unwrapped) string child would resolve to the frame itself
 * (role=button) — asserting the match is NOT the frame proves the string
 * rides a Text component.
 */
describe('Button TEXT-RIDES-TEXT', () => {
  it('renders array-of-strings children as one concatenated wrapped label', () => {
    renderWithProviders(
      <Button>
        Add
        {' +$1.00'}
      </Button>,
    );
    const label = screen.getByText('Add +$1.00');
    const frame = screen.getByRole('button');
    expect(label).toBeInTheDocument();
    expect(label).not.toBe(frame);
    expect(frame.contains(label)).toBe(true);
  });

  it('renders the origin shape `{label}{cond ? suffix : ""}` when the condition is false', () => {
    const priceDelta: number = 0;
    renderWithProviders(
      <Button>
        Add
        {priceDelta !== 0 ? ` +$${priceDelta}` : ''}
      </Button>,
    );
    const label = screen.getByText('Add');
    expect(label).toBeInTheDocument();
    expect(label).not.toBe(screen.getByRole('button'));
  });

  it('still renders a singleton string child wrapped', () => {
    renderWithProviders(<Button>Save</Button>);
    const label = screen.getByText('Save');
    expect(label).toBeInTheDocument();
    expect(label).not.toBe(screen.getByRole('button'));
  });

  it('keeps element children untouched and wraps only the string, order preserved', () => {
    renderWithProviders(
      <Button>
        Save
        <SizableText testID="suffix-badge">+$1.00</SizableText>
      </Button>,
    );
    const label = screen.getByText('Save');
    const badge = screen.getByTestId('suffix-badge');
    expect(label).not.toBe(screen.getByRole('button'));
    expect(badge).toBeInTheDocument();
    expect(screen.getByText('+$1.00')).toBe(badge);
    expect(label.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
