import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AddressWithFakeProvider, FailedFakeProvider, SearchWithFakeProvider } from './Geolocation.stories';

import { Geolocation } from './index';

describe('Geolocation fake-provider stories', () => {
  it('searches and commits a place through the interactive story', async () => {
    const story = SearchWithFakeProvider;
    const result = renderWithProviders(<>{story.render!(story.args!, {} as never)}</>);
    const input = result.container.querySelector("[aria-label='Search for a location']") as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Sydney' } });
    await waitFor(() => {
      expect(document.querySelector("[data-testid='geolocation-result-0']")).not.toBeNull();
    });
    fireEvent.click(document.querySelector("[data-testid='geolocation-result-0']") as Element);
    await waitFor(() => {
      expect(input.value).toBe('Sydney, New South Wales, Australia');
    });
    expect(result.container.textContent).toContain('-33.86880, 151.20930');
  });

  it('renders the read-only address story', async () => {
    const result = renderWithProviders(<Geolocation {...AddressWithFakeProvider.args} />);
    await waitFor(() => {
      expect(result.container.textContent).toContain('Mannerheimintie 3, Kamppi, Helsinki');
    });
  });

  it('renders honest failure from the failing story', async () => {
    const story = FailedFakeProvider;
    const result = renderWithProviders(<>{story.render!(story.args!, {} as never)}</>);
    fireEvent.change(result.container.querySelector("[aria-label='Search for a location']") as Element, {
      target: { value: 'Sydney' },
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('Search is unavailable');
    });
    expect(result.container.querySelector("[aria-label='Edit coordinates']")).not.toBeNull();
  });
});
