import { usePathname as useOnePathname } from 'one';

export { Link, useParams, useRouter } from 'one';

/**
 * One 1.16.5 `usePathname()` reads `useRouteInfo().pathname` with no guard.
 * On native a layout node sees the router store's `routeInfo`, which is
 * undefined until `setupLinkingAndRouteInfo()` runs when the navigation
 * container mounts. A root layout that calls this on first paint throws
 * `Cannot read property 'pathname' of undefined`.
 */
export const usePathname = (): string => {
  try {
    // oxlint-disable-next-line react-hooks/rules-of-hooks -- the try/catch only guards One's unguarded routeInfo read; the hook still runs on every render
    return useOnePathname() ?? '/';
  } catch {
    return '/';
  }
};
