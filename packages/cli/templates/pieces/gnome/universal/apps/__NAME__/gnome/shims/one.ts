// GNOME-target shim for the `one` router package.
//
// One's file router never mounts under GJS: its native path goes through
// react-navigation and react-native-screens, which need the RN fabric
// renderer. So the router API the screens call is backed instead by the
// framework's navigator seam (@repo/router/seam), which
// vite.config.gnome.ts resolves to the navigator source alone — the seam
// barrel also exports a DOM host that has no GJS story.
//
// DEGRADATION IS DELIBERATE. gnome/main.tsx renders one screen with no
// Adw.NavigationView attached, so the navigator is unconfigured: pushes
// are ignored and Link renders its children in place. Attach a
// NavigationView host and the same calls become real push/pop with the
// window back button, Escape and swipe-back all working. Nothing here
// changes when you do.

import { hrefToString, stackNavigator, useNavState, useRouteParams } from '@repo/router/seam';
import type { Href, NavParams } from '@repo/router/seam';
import type { ReactNode } from 'react';
import { createElement } from 'react';

import { View } from '../tamagui-barrel';

// One's router object is referentially stable — consumers put it in
// useEffect and useCallback dependency arrays, so this one must be too.
const ROUTER = {
  push: (href: Href) => {
    stackNavigator.push(href);
  },
  // One's navigate is push-unless-already-there — and the method real
  // screens actually call. Back it with the same push seam.
  navigate: (href: Href) => {
    stackNavigator.push(href);
  },
  replace: (href: Href) => {
    stackNavigator.replace(href);
  },
  back: () => {
    stackNavigator.back();
  },
  setParams: (params: NavParams) => {
    stackNavigator.setParams(params);
  },
};

export function useRouter(): typeof ROUTER {
  return ROUTER;
}

export function usePathname(): string {
  return useNavState().pathname;
}

export function useParams(): NavParams {
  return useRouteParams();
}

export function useLocalSearchParams(): NavParams {
  return useRouteParams();
}

export interface LinkProps {
  href?: Href;
  children?: ReactNode;
  [key: string]: unknown;
}

export function Link({ href, children }: LinkProps): ReactNode {
  if (!href) {
    return children ?? null;
  }
  return createElement(
    View as never,
    {
      cursor: 'pointer',
      onPress: () => {
        stackNavigator.push(href);
      },
      testID: `link:${hrefToString(href)}`,
    } as never,
    children,
  );
}

/** One renders the active child route into a layout's <Slot />. Under the
 *  seam every route is its own Adw.NavigationPage mounted by the
 *  navigation host, so a layout contributes chrome only and this renders
 *  nothing by design. */
export function Slot(): null {
  return null;
}

/** One's history-nav guard. There is no browser history to block here, so
 *  this always reports unblocked. Shape matches One's return value. */
export function useBlocker(): {
  state: 'unblocked' | 'blocked' | 'proceeding';
  proceed: () => void;
  reset: () => void;
} {
  return { state: 'unblocked', proceed: () => {}, reset: () => {} };
}
