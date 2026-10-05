import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { Quote } from './index';

describe('Quote', () => {
  it('renders as a blockquote with body text', () => {
    const { container } = renderWithProviders(<Quote>Invent the future.</Quote>);
    expect(container.querySelector('blockquote')).toBeTruthy();
    expect(container.textContent).toContain('Invent the future.');
  });

  it('does not pin compact, so the density knob restyles the frame', () => {
    const { container } = renderWithProviders(<Quote>Invent the future.</Quote>);
    const figure = container.querySelector('figure') as HTMLElement;
    expect(figure).toBeTruthy();
    expect(figure.getAttribute('data-density')).toBeTruthy();
    expect(figure.getAttribute('data-density')).not.toBe('');
  });

  it('renders cite attribution outside the quotation', () => {
    const { container } = renderWithProviders(<Quote cite="Alan Kay">Invent the future.</Quote>);
    expect(container.textContent).toContain('Alan Kay');
    const cite = container.querySelector('cite');
    const blockquote = container.querySelector('blockquote');
    const figcaption = container.querySelector('figcaption');
    expect(cite).toBeTruthy();
    expect(container.querySelector('figure')).toBeTruthy();
    expect(figcaption).toBeTruthy();
    expect(blockquote?.contains(cite)).toBe(false);
    expect(figcaption?.contains(cite)).toBe(true);
  });
});
