import { createI18nConfig, defaultLocale, locales, messages } from '@repo/i18n';
import { createPreview } from '@repo/storybook';
import { type ThemeConfig, ThemeProvider, createDefaultThemeConfig } from '@repo/theme';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { initReactI18next } from 'react-i18next';

const themeConfig = createDefaultThemeConfig();

i18n.use(initReactI18next).init({
  ...createI18nConfig({
    languages: locales,
    namespaces: ['translation'],
    defaultLanguage: defaultLocale,
    defaultNamespace: 'translation',
    resources: Object.fromEntries(locales.map((locale) => [locale, { translation: messages[locale] }])),
  }),
  lng: defaultLocale,
});

function AppProvider({
  themeConfig: activeThemeConfig = themeConfig,
  systemTheme,
  children,
}: {
  themeConfig?: ThemeConfig;
  systemTheme?: 'light' | 'dark';
  children?: ReactNode;
}) {
  return (
    <ThemeProvider config={{ tamagui: activeThemeConfig.tamagui }} systemTheme={systemTheme}>
      {children}
    </ThemeProvider>
  );
}

export default createPreview({
  themeConfig,
  i18n: { instance: i18n, languages: locales, defaultLanguage: defaultLocale },
  AppProvider,
});
