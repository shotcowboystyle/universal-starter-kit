import { renderWithProviders } from '@repo/test-utils';
import { Input as TamaguiInput } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { Label } from './index';

describe('Label', () => {
  it('associates with a control via htmlFor', () => {
    const { container } = renderWithProviders(
      <>
        <Label htmlFor="email-field">Email address</Label>
        <TamaguiInput id="email-field" />
      </>,
    );
    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label?.htmlFor).toBe('email-field');
    expect(label?.textContent).toContain('Email address');
  });

  it('appends the required asterisk from house marking', () => {
    const { container } = renderWithProviders(
      <Label htmlFor="req" required>
        Email address
      </Label>,
    );
    expect(container.querySelector('label')?.textContent).toBe('Email address *');
  });

  it('appends (optional) when marking optional fields', () => {
    const { container } = renderWithProviders(
      <Label htmlFor="opt" required={false} requiredMarking="optional">
        Nickname
      </Label>,
    );
    expect(container.querySelector('label')?.textContent).toBe('Nickname (optional)');
  });

  it('keeps a hidden label in the tree and associated', () => {
    const { container } = renderWithProviders(
      <>
        <Label htmlFor="search-field" hidden>
          Search
        </Label>
        <TamaguiInput id="search-field" />
      </>,
    );
    const label = container.querySelector('label');
    expect(label?.htmlFor).toBe('search-field');
    expect(label?.textContent).toContain('Search');
    const style = label ? getComputedStyle(label) : null;
    expect(style?.position === 'absolute' || label?.style.position === 'absolute').toBe(true);
  });

  it('wraps a page-heading label in h1', () => {
    const { container } = renderWithProviders(
      <Label htmlFor="event" asPageHeading>
        Event name
      </Label>,
    );
    const heading = container.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(heading?.querySelector('label')?.htmlFor).toBe('event');
    expect(heading?.textContent).toContain('Event name');
  });

  it('paints the label at weight 400', () => {
    const { container } = renderWithProviders(<Label htmlFor="w">Name</Label>);
    const label = container.querySelector('label') as HTMLElement;
    expect(label).toBeTruthy();
    const weight = label.style.fontWeight || getComputedStyle(label).fontWeight;
    expect(['400', 'normal']).toContain(String(weight));
  });
});
