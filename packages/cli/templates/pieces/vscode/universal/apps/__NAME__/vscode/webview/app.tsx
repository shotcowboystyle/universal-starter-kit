import { CookiesProvider } from 'react-cookie';

import { AppProvider } from '../../src/app';

import { ErrorBoundary } from './components/ErrorBoundary';
import { AppRoutes, initialRoute } from './router';
import { useVSCodeTheme } from './useVSCodeTheme';

export function App() {
  // VS Code's theme kind drives the house ThemeProvider scheme, so the
  // webview follows the editor's light/dark theme live.
  const scheme = useVSCodeTheme();

  return (
    <ErrorBoundary>
      {/* Webview pages don't go through createRootLayout, which normally
          provides cookies (ThemeProvider's useCookies throws without it) —
          same fix as the webext extension pages. */}
      <CookiesProvider>
        <AppProvider systemTheme={scheme}>
          <AppRoutes initialHref={initialRoute()} />
        </AppProvider>
      </CookiesProvider>
    </ErrorBoundary>
  );
}
