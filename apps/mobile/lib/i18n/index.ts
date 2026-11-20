import { messages, locales, defaultLocale } from '@repo/i18n';
import { getLocales } from 'expo-localization';
import i18n, { changeLanguage, use as registerI18nPlugin } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { APP_NAME } from '@/constants/app';
import { loadLanguagePreference } from '@/lib/language';

const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
const resolvedLocale = locales.some((locale) => locale === deviceLocale) ? deviceLocale : defaultLocale;

void registerI18nPlugin(initReactI18next).init({
  resources: {
    en: { translation: messages.en },
    de: { translation: messages.de },
  },
  lng: resolvedLocale,
  fallbackLng: defaultLocale,
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
    defaultVariables: { appName: APP_NAME },
  },
});

// Load persisted language preference (async, overrides device locale if set)
const applyPersistedLanguage = async () => {
  const lang = await loadLanguagePreference();
  if (lang !== null && lang !== '' && lang !== i18n.language) {
    await changeLanguage(lang);
  }
};
void applyPersistedLanguage();

export { default as i18n } from 'i18next';
export { locales, defaultLocale } from '@repo/i18n';
