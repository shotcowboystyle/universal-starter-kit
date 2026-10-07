// The webview runs the shared feature screens over the stack-navigation
// seam (@repo/router/seam): a webview has no address bar and
// no One server runtime, so One's file-based routes/loaders don't apply —
// the seam backs the SAME `one` router API (aliased in
// vite.config.vscode.ts) with a DOM page stack. AppLayout and the screens
// are the exact modules the web/native app mounts.

import { AboutScreen, AppLayout, HomeScreen } from '@features/__NAME__';
import { DomNavigationHost, stackNavigator } from '@repo/router/seam';
import { usePathname } from 'one';
import { useEffect } from 'react';

import { vscode } from './utils/vscode';

export const ROUTES = [
  { pattern: '/', tag: 'home', title: 'Home' },
  { pattern: '/about', tag: 'about', title: 'About' },
];

stackNavigator.configure(ROUTES);

/** Restore the route persisted through the webview host (reopening the
 *  panel / a VS Code reload). */
export function initialRoute(): string {
  const state = vscode.getState();
  if (state && typeof state === 'object' && typeof (state as { route?: unknown }).route === 'string') {
    return (state as { route: string }).route;
  }
  return '/';
}

function RoutePersistence() {
  const pathname = usePathname();

  useEffect(() => {
    vscode.setState({ route: pathname });
  }, [pathname]);

  return null;
}

export function AppRoutes({ initialHref }: { initialHref?: string }) {
  return (
    <AppLayout>
      <RoutePersistence />
      <DomNavigationHost
        initialHref={initialHref}
        routes={[
          { ...ROUTES[0]!, element: <HomeScreen /> },
          { ...ROUTES[1]!, element: <AboutScreen /> },
        ]}
      />
    </AppLayout>
  );
}
