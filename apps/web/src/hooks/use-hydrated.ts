import { useEffect, useState } from 'react';

/**
 * False during SSR and the hydration render, true afterwards. Gate any render
 * output that depends on client-only state (resolved color scheme, media
 * queries) on it so server and client markup match.
 */
export const useHydrated = (): boolean => {
  const [hydrated, setHydrated] = useState(false);
  // The post-mount re-render is the point: useSyncExternalStore reports the client
  // snapshot too early for Suspense boundaries that hydrate after a parent update.
  // oxlint-disable-next-line react-doctor/rendering-hydration-no-flicker -- the post-mount flip is the purpose of this hook
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-initialize-state, react/set-state-in-effect -- same: post-mount flip is intended
    setHydrated(true);
  }, []);
  return hydrated;
};
