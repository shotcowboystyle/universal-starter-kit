import './fonts.css';
import '../tamagui.css';
import '@tamagui/core/reset.css';

import { createI18nConfig, defaultLanguage, defaultNamespace, languages, namespaces } from '@package/i18n';
import { resources } from '@package/i18n/resources';
import i18next from 'i18next';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';

import { App } from './app';

// Initialize i18n synchronously before React renders: the webview has no One
// server runtime, so translations come purely from the bundled resources.
i18next.use(initReactI18next).init(
  createI18nConfig({
    languages: [...languages],
    namespaces: [...namespaces],
    defaultLanguage,
    defaultNamespace,
    resources,
  }),
);

const root = createRoot(document.querySelector('#root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
