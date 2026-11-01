// SyncErrorNotice contract: the visible half of the rejected-write pattern —
// role="alert" message, Retry re-issues, Dismiss clears, and each affordance
// only renders when its handler is provided.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SyncErrorNotice } from './SyncErrorNotice';

describe(SyncErrorNotice, () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  afterEach(cleanup);

  it('renders the message as an alert', async () => {
    renderWithProviders(<SyncErrorNotice message="Could not add comment" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not add comment');
  });

  it('fires onRetry and onDismiss from their buttons', async () => {
    const onRetry = vi.fn<() => void>();
    const onDismiss = vi.fn<() => void>();
    renderWithProviders(
      <SyncErrorNotice
        message="Write rejected"
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(await screen.findByText('Retry'));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('hides affordances whose handlers are omitted', async () => {
    renderWithProviders(<SyncErrorNotice message="No actions" />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText('Dismiss')).toBeNull();
  });

  it('honors custom labels', async () => {
    renderWithProviders(
      <SyncErrorNotice
        message="Custom"
        onRetry={() => {}}
        onDismiss={() => {}}
        retryLabel="Try again"
        dismissLabel="Ignore"
      />,
    );
    await expect(screen.findByText('Try again')).resolves.toBeTruthy();
    await expect(screen.findByText('Ignore')).resolves.toBeTruthy();
  });
});
