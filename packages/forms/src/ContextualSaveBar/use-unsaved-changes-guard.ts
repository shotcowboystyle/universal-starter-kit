import { useEffect } from 'react';

export interface NavigationBlocker {
  state: 'unblocked' | 'blocked' | 'proceeding';
  proceed: () => void;
  reset: () => void;
}

export type UseNavigationBlocker = (shouldBlock: boolean) => NavigationBlocker;

// oxlint-disable-next-line eslint/no-empty-function -- the idle blocker has nothing to proceed or reset
const noop = (): void => {};

const idleBlocker: NavigationBlocker = {
  state: 'unblocked',
  proceed: noop,
  reset: noop,
};

/** Native `beforeunload` plus an optional TanStack / host `useBlocker`. */
export const useUnsavedChangesGuard = (
  isDirty: boolean,
  useBlocker: UseNavigationBlocker | undefined,
): NavigationBlocker => {
  // oxlint-disable-next-line react/hooks -- the host passes one useBlocker (or none) for the bar's lifetime, so the call order never changes
  const blocker = useBlocker?.(isDirty) ?? idleBlocker;

  useEffect(() => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- environment probe: SSR has no window and React Native's window has no addEventListener
    if (!isDirty || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- older browsers only show the leave prompt when returnValue is set
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isDirty]);

  return blocker;
};
