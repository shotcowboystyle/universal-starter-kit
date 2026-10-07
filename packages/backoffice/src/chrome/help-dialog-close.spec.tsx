import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { en } from '../i18n/en';

import { HelpAboutDialog } from './help-about-dialog';
import { HelpShortcutsDialog } from './help-shortcuts-dialog';

// A host-registered Telugu bundle: the backoffice ships English only and lets
// the host's keys win (../i18n/index.ts).
const te = { help: { close: 'మూసివేయి' } };

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: BACKOFFICE_I18N_NAMESPACE,
    ns: [BACKOFFICE_I18N_NAMESPACE],
    interpolation: { escapeValue: false },
    resources: {
      en: { [BACKOFFICE_I18N_NAMESPACE]: en },
      te: { [BACKOFFICE_I18N_NAMESPACE]: te },
    },
  });
});

afterEach(async () => {
  cleanup();
  await i18next.changeLanguage('en');
});

const dialogs = [
  ['HelpAboutDialog', HelpAboutDialog],
  ['HelpShortcutsDialog', HelpShortcutsDialog],
] as const;

describe('help dialogs name Close by its visible text (MPO-476)', () => {
  for (const [name, HelpDialog] of dialogs) {
    for (const [lng, label] of [
      ['en', 'Close'],
      ['te', 'మూసివేయి'],
    ] as const) {
      it(`${name} in ${lng}`, async () => {
        await i18next.changeLanguage(lng);
        renderWithProviders(
          <HelpDialog
            open
            onOpenChange={vi.fn()}
          />,
        );
        const close = screen.getByRole('button', { name: label });
        expect(close.textContent).toBe(label);
        expect(screen.queryAllByRole('button', { name: 'Dialog Close' })).toHaveLength(0);
      });
    }
  }
});
