import { Link, useParams, usePathname as useOnePathname, useRouter } from 'one';

export { Link, useParams, useRouter };

/**
 * One 1.16.5 `usePathname()` reads `useRouteInfo().pathname` with no guard.
 * On native a layout node sees the router store's `routeInfo`, which is
 * undefined until `setupLinkingAndRouteInfo()` runs when the navigation
 * container mounts. A root layout that calls this on first paint throws
 * `Cannot read property 'pathname' of undefined`.
 */
export function usePathname(): string {
  try {
    return useOnePathname() ?? '/';
  } catch {
    return '/';
  }
}
