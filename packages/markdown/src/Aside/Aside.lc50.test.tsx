/**
 * LC-82 TEXT-RIDES-TEXT (catalog arm): MDXAside wraps ALL bare string/number
 * children — an all-strings array coalesces into the singleton Paragraph
 * path, and string runs inside mixed element+string children ride their own
 * Paragraph — so `{text}{cond ? suffix : ""}` renders instead of tripping
 * the native "Text strings must be rendered within a <Text> component"
 * invariant.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { Paragraph } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { MDXAside } from './index';

describe('MDXAside LC-82 TEXT-RIDES-TEXT', () => {
  it('renders an all-strings array as the coalesced singleton Paragraph (no cutoff)', () => {
    const { container } = renderWithProviders(
      <MDXAside>
        just a note
        {' with a suffix'}
      </MDXAside>,
    );
    const text = screen.getByText('just a note with a suffix');
    expect(text).toBeInTheDocument();
    expect(text.tagName).not.toBe('DIV');
    // Text-only asides never grow cutoff chrome.
    expect(screen.queryByText('Show more')).toBeNull();
    expect(container.querySelector('aside')).toBeTruthy();
  });

  it('wraps string runs inside mixed element+string children', () => {
    renderWithProviders(
      <MDXAside>
        <Paragraph>first block</Paragraph>
        trailing note
      </MDXAside>,
    );
    const trailing = screen.getByText('trailing note');
    expect(trailing).toBeInTheDocument();
    expect(trailing.tagName).not.toBe('DIV');
  });
});
