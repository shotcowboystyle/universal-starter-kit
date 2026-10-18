/**
 * One-router adapter — subpath export `@repo/backoffice/one-adapter`.
 *
 * Lives on its own export path so the MAIN entry stays router-free: `one` is
 * an optional peer, only resolved by hosts that import this adapter (same
 * pattern as `@repo/router`'s `./seam` subpath).
 *
 * Usage (a One app's backoffice layout):
 *
 *   const navigation = useOneNavigator();
 *   return (
 *     <BackofficeProvider frappe={{ baseURL }} navigation={navigation}>
 *       <BackofficeShell><Slot /></BackofficeShell>
 *     </BackofficeProvider>
 *   );
 */
import { useActiveParams, useBlocker, usePathname, useRouter } from 'one';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { BackofficeNavigationBlocker } from '../config/BackofficeProvider';
import { ControlledNavigator } from '../navigation/navigator';
import type { BackofficeNavigator, BackofficeParams } from '../navigation/navigator';

// SSR-safe layout effect: One renders routes server-side, where
// useLayoutEffect warns; the location mirror runs post-render either way.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * A {@link BackofficeNavigator} backed by One's router. Referentially stable
 * across renders; the current pathname + search params are mirrored into the
 * navigator's subscribable location after every route change.
 */
export const useOneNavigator = (): BackofficeNavigator => {
  const router = useRouter();
  const pathname = usePathname();
  // useActiveParams (One's useGlobalSearchParams): the FOCUSED route's
  // params including its query string. useLocalSearchParams here returned
  // the LAYOUT segment's params, so leaf query params (?f= / ?report= /
  // ?board= / ?field=) never reached the navigator's location mirror and
  // deep-link state was silently dropped.
  // SAFETY: One's active params are the URL's string / string[] query values, the shape BackofficeParams models.
  const params = useActiveParams() as BackofficeParams;

  // One's router object is referentially stable, but route through a ref so
  // even a host swapping router implementations stays wired.
  const routerRef = useRef(router);
  useIsomorphicLayoutEffect(() => {
    routerRef.current = router;
  }, [router]);

  // oxlint-disable-next-line react/hook-use-state -- lazily created once; the navigator is never replaced.
  const [navigator] = useState(
    // oxlint-disable-next-line react/refs -- the callbacks read routerRef when invoked by navigation, never during render.
    () =>
      new ControlledNavigator(
        {
          // Expression bodies: One types push/replace as void, but they return
          // linkTo's promise at runtime — returning it lets a rejection reach
          // the navigator's retry guard.
          // oxlint-disable-next-line typescript/no-confusing-void-expression -- see above
          navigate: (path) => routerRef.current.push(path),
          // oxlint-disable-next-line typescript/no-confusing-void-expression -- see above
          replace: (path) => routerRef.current.replace(path),
          back: () => {
            routerRef.current.back();
          },
          // URL-state mirror (list `?f=`/`?sort=`): one's setParams merges
          // into the focused route's params and lands as a history REPLACE
          // on web — desk's update_url_with_filters channel, no remount.
          // Key removal rides one's OWN sentinel: its URL serializer drops
          // params whose value is the literal string "undefined" but prints
          // a real `undefined` into the query (`?sort=undefined`) — so
          // removals are translated to the sentinel before the merge.
          setParams: (nextParams) => {
            routerRef.current.setParams(
              Object.fromEntries(Object.entries(nextParams).map(([key, value]) => [key, value ?? 'undefined'])),
            );
          },
        },
        { path: pathname, params },
      ),
  );

  useIsomorphicLayoutEffect(() => {
    navigator.setLocation({ path: pathname, params });
  }, [navigator, pathname, params]);

  return navigator;
};

/**
 * One-router navigation blocker for `BackofficeProvider integrations` —
 * blocks history-pop navigations (browser back/forward on web, the native
 * back gesture/button) while `shouldBlock` is true. Push/replace actions
 * are left alone: the form's in-app navigate() wrapper already confirms
 * those, and blocking them here would double-prompt the post-confirm push.
 */
export const useOneNavigationBlocker = (shouldBlock: boolean): BackofficeNavigationBlocker => {
  const blocker = useBlocker(({ historyAction }: { historyAction: string }) => shouldBlock && historyAction === 'pop');
  if (blocker.state === 'blocked') {
    return { blocked: true, proceed: blocker.proceed, reset: blocker.reset };
  }
  return {
    blocked: false,
    proceed: () => {
      // Nothing is blocked, so there is nothing to proceed with.
    },
    reset: () => {
      // Nothing is blocked, so there is nothing to reset.
    },
  };
};
