import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';

const config = { baseURL: 'https://bench.example.com' };

describe('FrappeReconnectIndicator (MPO-111)', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  afterEach(cleanup);

  it('renders nothing when the socket was never up', () => {
    const { container } = renderWithProviders(
      <FrappeReconnectIndicator
        config={config}
        connection={{ connected: false, everConnected: false }}
      />,
    );
    expect(container.querySelector('[data-testid="frappe-reconnect-indicator"]')).toBeNull();
  });

  it('renders nothing while connected', () => {
    const { container } = renderWithProviders(
      <FrappeReconnectIndicator
        config={config}
        connection={{ connected: true, everConnected: true }}
      />,
    );
    expect(container.querySelector('[data-testid="frappe-reconnect-indicator"]')).toBeNull();
  });

  it('renders the interrupted-updates chip while reconnecting', async () => {
    renderWithProviders(
      <FrappeReconnectIndicator
        config={config}
        connection={{ connected: false, everConnected: true }}
      />,
    );
    const chip = await screen.findByTestId('frappe-reconnect-indicator');
    expect(chip.getAttribute('role')).toBe('status');
    expect(chip).toHaveTextContent('Live updates interrupted — reconnecting…');
  });
});
