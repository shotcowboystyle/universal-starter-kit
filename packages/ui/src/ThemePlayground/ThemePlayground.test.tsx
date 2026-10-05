/**
 * The theme playground is the catalog's: a palette toggle that opens
 * the house ThemeDevtoolsPanel in a SheetModal, so a reader flips the scheme,
 * the preset and the style knobs and watches the page restyle live. Web only;
 * the native twin renders nothing because the panel draws raw DOM.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemePlayground as NativeThemePlayground } from './index.native';

import { ThemePlayground } from './index';

afterEach(cleanup);

describe('ThemePlayground', () => {
  it('offers a labelled palette toggle, closed until pressed', async () => {
    renderWithProviders(<ThemePlayground testID="playground" />);
    const toggle = await screen.findByTestId('playground', {}, { timeout: 10000 });
    expect(toggle.getAttribute('aria-label')).toBe('Theme');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the playground sheet from the toggle', async () => {
    renderWithProviders(<ThemePlayground testID="playground" />);
    fireEvent.click(await screen.findByTestId('playground', {}, { timeout: 10000 }));
    await waitFor(() => {
      expect(screen.getByTestId('playground').getAttribute('aria-expanded')).toBe('true');
    });
    expect(await screen.findByText('Theme playground', {}, { timeout: 10000 })).toBeTruthy();
  });

  it('renders nothing on native', () => {
    const { container } = renderWithProviders(<NativeThemePlayground testID="playground" />);
    expect(container.querySelector('[data-testid="playground"]')).toBeNull();
  });
});
