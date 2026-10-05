/**
 * Text rides text (catalog arm): Quote's body and cite slots wrap ALL
 * bare string/number children — runs of adjacent strings coalesce into the
 * slot's own SizableText — so `{label}{cond ? suffix : ""}` renders the
 * concatenated text instead of tripping the native "Text strings must be
 * rendered within a <Text> component" invariant.
 *
 * A wrapped run renders a Text element (<span>/<cite>); a bare run's direct
 * text holder would be the <blockquote>/<div> frame — asserting the
 * getByText match is not the frame proves the string rides a Text component.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Quote } from './index';

describe('Quote text rides text', () => {
  it('renders array-of-strings body children as one concatenated wrapped run', () => {
    renderWithProviders(
      <Quote>
        Invent
        {' the future.'}
      </Quote>,
    );
    const body = screen.getByText('Invent the future.');
    expect(body).toBeInTheDocument();
    expect(body.tagName).not.toBe('BLOCKQUOTE');
    expect(body.tagName).not.toBe('DIV');
  });

  it('renders the origin shape `{label}{cond ? suffix : ""}` when the condition is false', () => {
    const suffix: number = 0;
    renderWithProviders(
      <Quote>
        Invent the future.
        {suffix !== 0 ? ` (${suffix})` : ''}
      </Quote>,
    );
    const body = screen.getByText('Invent the future.');
    expect(body.tagName).not.toBe('BLOCKQUOTE');
    expect(body.tagName).not.toBe('DIV');
  });

  it('renders an array-of-strings cite wrapped with the attribution dash', () => {
    const { container } = renderWithProviders(<Quote cite={['Alan', ' Kay']}>Invent the future.</Quote>);
    const cite = screen.getByText('— Alan Kay');
    expect(cite.tagName).not.toBe('DIV');
    expect(container.querySelector('cite')).toBeTruthy();
  });
});
