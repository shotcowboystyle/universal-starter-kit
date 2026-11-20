// DOM one-shim — One's router API backed by the stack-navigation seam.
//
// Alias the `one` package to THIS module in a DOM target's vite config
// (webext views) and every consumer — feature screens,
// @package/layouts, the @repo/router facade (whose default
// implementation re-exports from `one`) — rides the seam instead of One's
// real router runtime, which needs an address bar + One server runtime
// those hosts don't have.
//
// Exports beyond the router hooks exist to satisfy module resolution for
// everything the shared graph imports from `one`:
//   - useUserScheme & friends re-export from @vxrn/color-scheme — One's
//     own implementation IS that package, and it's browser-safe
//     (localStorage + matchMedia).
//   - LoadProgressBar/useMatches/Slot are inert placeholders: webext
//     entries never mount One's root layout, but the barrels that reach
//     them must still resolve.

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useContext, useSyncExternalStore } from 'react';

import { RouteTagContext, hrefToString, stackNavigator, useNavState, useRouteParams } from './navigator';
import type { Href, NavParams } from './navigator';

export { getUserScheme, onUserSchemeChange, SchemeProvider, setUserScheme, useUserScheme } from '@vxrn/color-scheme';

/** Loose stand-in for One's LoaderProps — loaders run through the seam's
 *  loader bridge on these targets, with the same shape One passes. */
export interface LoaderProps<Params = Record<string, string | string[] | undefined>> {
  params: Params;
  request?: Request;
}

const noop = (): void => {
  // intentionally empty
};

// oxlint-disable-next-line anti-slop/no-unknown-returns, typescript/no-unnecessary-type-parameters -- mirrors One's useLoader<T>(loader): the caller names the loader's data type
export const useLoader = <T,>(_loader: (...args: never[]) => unknown): T | undefined => {
  const tag = useContext(RouteTagContext);
  const fromRoute = useSyncExternalStore(stackNavigator.subscribe, () => stackNavigator.loaderSnapshot(tag));
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the route's loader produced this value, and the caller names that loader's data type as T
  return fromRoute as T | undefined;
};

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
    for (let i = 0; i < (count ?? 1); i += 1) {
      stackNavigator.back();
    }
  },
  dismissAll: () => {
    const { depth } = stackNavigator.getSnapshot();
    for (let i = 1; i < depth; i += 1) {
      stackNavigator.back();
    }
  },
  canDismiss: () => stackNavigator.getSnapshot().canGoBack,
  setParams: stackNavigator.setParams,
  subscribe: (listener: (state: 'success' | 'error') => void) => {
    listener('success');
    return noop;
  },
  onLoadState: (listener: (state: 'loading' | 'loaded') => void) => {
    listener('loaded');
    return noop;
  },
};

export const useRouter = (): typeof ROUTER => ROUTER;

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  href?: Href;
  replace?: boolean;
  children?: ReactNode;
}

/** Navigation Link: an anchor that pushes `href` through the seam.
 *  Degrades to rendering children in place when no route manifest is
 *  configured (single-screen entries — no route stack exists there). */
export const Link = ({ href, replace, children, style, ...rest }: LinkProps): ReactNode => {
  if (href === undefined || href === '' || !stackNavigator.isConfigured) {
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
};

/** One's <Slot /> renders the active child route inside a layout. The seam
 *  has no nested-layout mounting — every route is its own host page — so
 *  layouts that render <Slot /> contribute chrome only; the child screen is
 *  mounted by the navigation host instead. Renders nothing by design. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- React component named after One's <Slot />; accepts One's arbitrary props
export const Slot = (_props: Record<string, unknown>): null => null;

export const useParams = (): NavParams => useRouteParams();

export const useLocalSearchParams = (): NavParams => useRouteParams();

export const usePathname = (): string =>
  // First paint of a root layout can run before the host has mounted
  // (CreateRootLayout.native wraps RootLayout around Slot before One's
  // routeInfo exists; the seam's snapshot is likewise unset until a
  // stack host attaches). Unguarded `.pathname` throws and the app never
  // boots.
  useNavState()?.pathname ?? '/';

/** One's history-nav guard. The seam's hosts have no browser history to
 *  block (in-app navigation confirms dirty transitions itself), so this is
 *  a no-op that always reports "unblocked". Shape matches one/react-router's
 *  useBlocker return. */
interface Blocker {
  state: 'unblocked' | 'blocked' | 'proceeding';
  proceed: () => void;
  reset: () => void;
}

export const useBlocker = (_shouldBlock?: boolean | (() => boolean)): Blocker => ({
  state: 'unblocked',
  proceed: noop,
  reset: noop,
});

/** Inert stand-in for One's route-transition progress bar (SSR-era chrome
 *  with no meaning on a stack host). */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- React component named after One's <LoadProgressBar />; accepts One's arbitrary props
export const LoadProgressBar = (_props: Record<string, unknown>): null => null;

/** One's useMatches returns the matched route chain; the seam mounts one
 *  page at a time, so consumers get an empty chain. */
export const useMatches = (): unknown[] => [];
