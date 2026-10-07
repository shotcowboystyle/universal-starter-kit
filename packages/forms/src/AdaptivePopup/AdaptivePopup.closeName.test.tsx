import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { changeLanguage, init } from 'i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AdaptivePopup } from './index';

describe('AdaptivePopup close is named in the active locale', () => {
  beforeAll(async () => {
    await init({
      lng: 'en',
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      resources: {
        en: { translation: { Close: 'Close' } },
        te: { translation: { Close: 'మూసివేయి' } },
      },
    });
  });

  afterEach(async () => {
    cleanup();
    await changeLanguage('en');
  });

  it.each([
    ['en', 'Close'],
    ['te', 'మూసివేయి'],
  ] as const)('%s', async (lng, label) => {
    await changeLanguage(lng);
    renderWithProviders(
      <AdaptivePopup
        open
        onOpenChange={vi.fn<(open: boolean) => void>()}
        title="Edit Profile">
        <Text>popup body</Text>
      </AdaptivePopup>,
    );
    expect(screen.getByRole('button', { name: label })).toBe(screen.getByTestId('adaptive-popup-close'));
  });
});
