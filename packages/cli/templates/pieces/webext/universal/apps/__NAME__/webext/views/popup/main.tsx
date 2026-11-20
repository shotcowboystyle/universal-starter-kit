import '../../tamagui.css';
import '@tamagui/core/reset.css';

import { AboutScreen, AppLayout, HomeScreen } from '@features/__NAME__';
import { createI18nConfig, defaultLanguage, defaultNamespace, languages, namespaces } from '@package/i18n';
import { resources } from '@package/i18n/resources';
import { DomNavigationHost, stackNavigator } from '@repo/router/seam';
import i18next from 'i18next';
import { StrictMode } from 'react';
import { CookiesProvider } from 'react-cookie';
import { createRoot } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';

import { AppProvider } from '../../../src/app';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// Extension pages have no One server runtime: i18n initializes synchronously
// from the bundled resources, and the feature screens run over the
// stack-navigation seam — `one` is aliased to @repo/router/seam
// in vite.config.webext.ts, so useRouter/Link/usePathname keep working.
i18next.use(initReactI18next).init(
  createI18nConfig({
    languages: [...languages],
    namespaces: [...namespaces],
    defaultLanguage,
    defaultNamespace,
    resources,
  }),
);

const ROUTES = [
  { pattern: '/', tag: 'home', title: 'Home' },
  { pattern: '/about', tag: 'about', title: 'About' },
];

stackNavigator.configure(ROUTES);

// The popup frame (400x500) and the #app mount sizing live in index.html so
// they apply on first paint.

function Popup() {
  return (
    <AppLayout>
      <DomNavigationHost
        routes={[
          { ...ROUTES[0]!, element: <HomeScreen /> },
          { ...ROUTES[1]!, element: <AboutScreen /> },
        ]}
      />
    </AppLayout>
  );
}

const container = document.querySelector('#app');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        {/* Extension pages don't go through createRootLayout, which normally
            provides cookies (ThemeProvider's useCookies throws without it). */}
        <CookiesProvider>
          <AppProvider>
            <Popup />
          </AppProvider>
        </CookiesProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
