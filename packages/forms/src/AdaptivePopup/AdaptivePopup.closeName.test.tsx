import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AdaptivePopup } from './index';

beforeAll(async () => {
  await i18next.init({
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
  await i18next.changeLanguage('en');
});

describe('AdaptivePopup close is named in the active locale', () => {
  for (const [lng, label] of [
    ['en', 'Close'],
    ['te', 'మూసివేయి'],
  ] as const) {
    it(lng, async () => {
      await i18next.changeLanguage(lng);
      renderWithProviders(
        <AdaptivePopup open onOpenChange={vi.fn()} title="Edit Profile">
          <Text>popup body</Text>
        </AdaptivePopup>,
      );
      expect(screen.getByRole('button', { name: label })).toBe(screen.getByTestId('adaptive-popup-close'));
    });
  }
});
