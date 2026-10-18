import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { changeLanguage, use } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { en } from '../i18n/en';

import { HelpAboutDialog } from './help-about-dialog';
import { HelpShortcutsDialog } from './help-shortcuts-dialog';

// A host-registered Telugu bundle: the backoffice ships English only and lets
// the host's keys win (../i18n/index.ts).
const te = { help: { close: 'మూసివేయి' } };

const dialogs = [
  ['HelpAboutDialog', HelpAboutDialog],
  ['HelpShortcutsDialog', HelpShortcutsDialog],
] as const;

const languages = [
  ['en', 'Close'],
  ['te', 'మూసివేయి'],
] as const;

const cases = dialogs.flatMap(([name, HelpDialog]) =>
  languages.map(([lng, label]) => [name, lng, label, HelpDialog] as const),
);

describe('help dialogs name Close by its visible text (MPO-476)', () => {
  beforeAll(async () => {
    await use(initReactI18next).init({
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
    await changeLanguage('en');
  });

  it.each(cases)('%s in %s', async (_name, lng, label, HelpDialog) => {
    await changeLanguage(lng);
    renderWithProviders(
      <HelpDialog
        open
        onOpenChange={vi.fn<(open: boolean) => void>()}
      />,
    );
    const close = screen.getByRole('button', { name: label });
    expect(close.textContent).toBe(label);
    expect(screen.queryAllByRole('button', { name: 'Dialog Close' })).toHaveLength(0);
  });
});
