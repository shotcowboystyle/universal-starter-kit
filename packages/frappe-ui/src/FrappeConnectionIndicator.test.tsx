import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeConnectionIndicator } from './FrappeConnectionIndicator';

const config = { baseURL: 'https://bench.example.com' };

describe('FrappeConnectionIndicator (MPO-111)', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });
  afterEach(cleanup);

  it('renders nothing when the socket was never up', () => {
    const { container } = renderWithProviders(
      <FrappeConnectionIndicator
        config={config}
        connection={{ connected: false, everConnected: false }}
      />,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders nothing while connected', () => {
    const { container } = renderWithProviders(
      <FrappeConnectionIndicator
        config={config}
        connection={{ connected: true, everConnected: true }}
      />,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders a live status pill while reconnecting', async () => {
    renderWithProviders(
      <FrappeConnectionIndicator
        config={config}
        connection={{ connected: false, everConnected: true }}
      />,
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Reconnecting…');
  });
});
