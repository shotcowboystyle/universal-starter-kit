// DOM one-shim — One's router API backed by the stack-navigation seam.
//
// Alias the `one` package to THIS module in a DOM target's vite config
// (VS Code webview, webext views) and every consumer — feature screens,
// @package/layouts, the @repo/router facade (whose default
// implementation re-exports from `one`) — rides the seam instead of One's
// real router runtime, which needs an address bar + One server runtime
// those hosts don't have. The GTK equivalent lives in
// the GNOME `one` shim (it renders Link over a GTK pressable and
// carries GJS probe instrumentation this DOM shim doesn't need).
//
// Exports beyond the router hooks exist to satisfy module resolution for
// everything the shared graph imports from `one`:
//   - useUserScheme & friends re-export from @vxrn/color-scheme — One's
//     own implementation IS that package, and it's browser-safe
//     (localStorage + matchMedia).
//   - LoadProgressBar/useMatches/Slot are inert placeholders: webview
//     entries never mount One's root layout, but the barrels that reach
//     them must still resolve.

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useContext, useSyncExternalStore } from 'react';

import {
  RouteTagContext,
  hrefToString,
  stackNavigator,
  useNavState,
  useRouteParams,
  type Href,
  type NavParams,
} from './navigator';

export { getUserScheme, onUserSchemeChange, SchemeProvider, setUserScheme, useUserScheme } from '@vxrn/color-scheme';

/** Loose stand-in for One's LoaderProps — loaders run through the seam's
 *  loader bridge on these targets, with the same shape One passes. */
export interface LoaderProps<Params = Record<string, string | string[] | undefined>> {
  params: Params;
  request?: Request;
}

export function useLoader<T>(_loader: (...args: never[]) => unknown): T | undefined {
  const tag = useContext(RouteTagContext);
  const fromRoute = useSyncExternalStore(stackNavigator.subscribe, () => stackNavigator.loaderSnapshot(tag));
  return fromRoute as T | undefined;
}

// One's router object is referentially stable — consumers keep it in
// useCallback/useEffect dep arrays, so this shim's must be too. The surface
// matches the @repo/router facade's Router contract (One's
// real router is a superset of it).
const ROUTER = {
  push: stackNavigator.push,
  navigate: stackNavigator.push,
  replace: stackNavigator.replace,
  back: stackNavigator.back,
  canGoBack: () => stackNavigator.getSnapshot().canGoBack,
  dismiss: (count?: number) => {
    for (let i = 0; i < (count ?? 1); i++) {
      stackNavigator.back();
    }
  },
  dismissAll: () => {
    const depth = stackNavigator.getSnapshot().depth;
    for (let i = 1; i < depth; i++) {
      stackNavigator.back();
    }
  },
  canDismiss: () => stackNavigator.getSnapshot().canGoBack,
  setParams: stackNavigator.setParams,
  subscribe: (listener: (state: 'success' | 'error') => void) => {
    listener('success');
    return () => {};
  },
  onLoadState: (listener: (state: 'loading' | 'loaded') => void) => {
    listener('loaded');
    return () => {};
  },
};

export function useRouter(): typeof ROUTER {
  return ROUTER;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  href?: Href;
  replace?: boolean;
  children?: ReactNode;
}

/** Navigation Link: an anchor that pushes `href` through the seam.
 *  Degrades to rendering children in place when no route manifest is
 *  configured (single-screen entries — no route stack exists there). */
export function Link({ href, replace, children, style, ...rest }: LinkProps): ReactNode {
  if (!href || !stackNavigator.isConfigured) {
    return children ?? null;
  }
  const hrefString = hrefToString(href);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (replace) {
      stackNavigator.replace(href);
    } else {
      stackNavigator.push(href);
    }
  };
  return (
    <a
      href={hrefString}
      onClick={onClick}
      // display:contents — the anchor contributes no box, so wrapping
      // arbitrary flex/grid children never disturbs layout (clicks still
      // bubble through it).
      style={{ display: 'contents', color: 'inherit', textDecoration: 'none', ...style }}
      data-seam-link={hrefString}
      {...rest}>
      {children}
    </a>
  );
}

/** One's <Slot /> renders the active child route inside a layout. The seam
 *  has no nested-layout mounting — every route is its own host page — so
 *  layouts that render <Slot /> contribute chrome only; the child screen is
 *  mounted by the navigation host instead. Renders nothing by design. */
export function Slot(_props: Record<string, unknown>): null {
  return null;
}

export function useParams(): NavParams {
  return useRouteParams();
}

export function useLocalSearchParams(): NavParams {
  return useRouteParams();
}

export function usePathname(): string {
  // First paint of a root layout can run before the host has mounted
  // (CreateRootLayout.native wraps RootLayout around Slot before One's
  // routeInfo exists; the seam's snapshot is likewise unset until a
  // stack host attaches). Unguarded `.pathname` throws and the app never
  // boots.
  return useNavState()?.pathname ?? '/';
}

/** One's history-nav guard. The seam's hosts have no browser history to
 *  block (in-app navigation confirms dirty transitions itself), so this is
 *  a no-op that always reports "unblocked". Shape matches one/react-router's
 *  useBlocker return. */
export function useBlocker(_shouldBlock?: unknown): {
  state: 'unblocked' | 'blocked' | 'proceeding';
  proceed: () => void;
  reset: () => void;
} {
  return { state: 'unblocked', proceed: () => {}, reset: () => {} };
}

/** Inert stand-in for One's route-transition progress bar (SSR-era chrome
 *  with no meaning on a stack host). */
export function LoadProgressBar(_props: Record<string, unknown>): null {
  return null;
}

/** One's useMatches returns the matched route chain; the seam mounts one
 *  page at a time, so consumers get an empty chain. */
export function useMatches(): unknown[] {
  return [];
}
