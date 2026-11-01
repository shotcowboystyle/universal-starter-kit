import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * The host router as frappe-ui sees it. frappe-ui imports no router: the
 * host app hands this to `FrappeProvider` once (`@repo/core`
 * does it from One's router), and a routed `FrappeListView` or `FrappeForm`
 * (`route` prop) reads its record from the path and moves with it.
 *
 * Both members are hooks, called where the routed view renders, so they see
 * that page's route. A host keeps the same navigation for the life of the
 * tree.
 */
export interface FrappeNavigation {
  /** The pathname of the route the caller renders in. */
  usePathname: () => string;
  /** A function that pushes an href onto the history. */
  useNavigate: () => (href: string) => void;
  /**
   * The query params of the route the caller renders in. A host without
   * them leaves a routed list's controls out of the URL.
   */
  useSearchParams?: () => Record<string, string | undefined>;
  /** A function that replaces query params in place; undefined drops one. */
  useSetSearchParams?: () => (params: Record<string, string | undefined>) => void;
  /**
   * What the route's loader returned (the page it rendered on the server),
   * given the loader the route exports. A host without loaders leaves it
   * out, and a view reads live from the start.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-returns, typescript/method-signature-style -- loader data is whatever the route's loader returned (the view narrows it); method syntax keeps hosts' loader-typed implementations assignable (bivariant params)
  useLoader?(loader: (...args: never[]) => unknown): unknown;
}

/** A routed view's handle on the host router. */
export interface FrappeRouter {
  pathname: string;
  navigate: (href: string) => void;
  /** Present when the host hands its query params to routed views. */
  searchParams?: Record<string, string | undefined>;
  setSearchParams?: (params: Record<string, string | undefined>) => void;
}

const FrappeNavigationContext = createContext<FrappeNavigation | undefined>(undefined);

export const FrappeNavigationProvider = ({
  navigation,
  children,
}: {
  navigation: FrappeNavigation | undefined;
  children: ReactNode;
}) => {
  const inherited = useContext(FrappeNavigationContext);
  return (
    <FrappeNavigationContext.Provider value={navigation ?? inherited}>{children}</FrappeNavigationContext.Provider>
  );
};

export const useFrappeNavigation = (): FrappeNavigation | undefined => useContext(FrappeNavigationContext);

/**
 * What `loader` returned for the route the caller renders in, through the
 * host's navigation; undefined without a loader or a host that runs them.
 */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- loader data is whatever the route's loader returned; the routed view narrows it
export const useRouteLoaderData = (loader: ((...args: never[]) => unknown) | undefined): unknown => {
  const navigation = useContext(FrappeNavigationContext);
  if (!loader || !navigation?.useLoader) {
    return undefined;
  }
  // oxlint-disable-next-line react/hooks -- one navigation and one loader per view, so the call order never changes
  return navigation.useLoader(loader);
};

/** The host router for a routed view, or undefined when the host gave none. */
export const useFrappeRouter = (): FrappeRouter | undefined => {
  const navigation = useFrappeNavigation();
  if (!navigation) {
    return undefined;
  }
  // oxlint-disable-next-line react/hooks -- one navigation per tree, so the call order never changes
  const pathname = navigation.usePathname();
  // oxlint-disable-next-line react/hooks -- one navigation per tree, so the call order never changes
  const navigate = navigation.useNavigate();
  // oxlint-disable-next-line react/hooks -- one navigation per tree, so the call order never changes
  const searchParams = navigation.useSearchParams?.();
  // oxlint-disable-next-line react/hooks -- one navigation per tree, so the call order never changes
  const setSearchParams = navigation.useSetSearchParams?.();
  return { pathname, navigate, searchParams, setSearchParams };
};

/**
 * What a path under a doctype's route names, desk style: the list
 * (`/route`), a new record (`/route/new`), a record (`/route/<name>`) or its
 * edit form (`/route/<name>/edit`).
 */
export type FrappeRouteTarget =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'view'; name: string }
  | { mode: 'edit'; name: string };

const QUERY_OR_HASH_RE = /[?#]/u;

const stripTrailingSlashes = (path: string): string => {
  let end = path.length;
  while (end > 0 && path[end - 1] === '/') {
    end -= 1;
  }
  return path.slice(0, end);
};

const trimPath = (path: string): string => {
  const bare = path.split(QUERY_OR_HASH_RE)[0] ?? '';
  return bare.length > 1 ? stripTrailingSlashes(bare) : bare;
};

const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Safe to continue: a malformed %-escape is shown as typed rather than failing the route
    return segment;
  }
};

export const frappeRouteTarget = (route: string, pathname: string): FrappeRouteTarget | undefined => {
  const base = trimPath(route);
  const path = trimPath(pathname);
  if (path === base) {
    return { mode: 'list' };
  }
  if (!path.startsWith(`${base}/`)) {
    return undefined;
  }
  const segments = path.slice(base.length + 1).split('/');
  const [first, second] = segments;
  if (!first) {
    return undefined;
  }
  if (segments.length === 1) {
    return first === 'new' ? { mode: 'create' } : { mode: 'view', name: decodeSegment(first) };
  }
  if (segments.length === 2 && second === 'edit') {
    return { mode: 'edit', name: decodeSegment(first) };
  }
  return undefined;
};

/** The href of a doctype route's list, new record, record or record edit form. */
export const frappeRouteHref = (route: string, target: FrappeRouteTarget): string => {
  const base = trimPath(route);
  switch (target.mode) {
    case 'list': {
      return base;
    }
    case 'create': {
      return `${base}/new`;
    }
    case 'view': {
      return `${base}/${encodeURIComponent(target.name)}`;
    }
    case 'edit': {
      return `${base}/${encodeURIComponent(target.name)}/edit`;
    }
    default: {
      const unreachable: never = target;
      return unreachable;
    }
  }
};
