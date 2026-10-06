import { useEffect } from 'react';

export interface NavigationBlocker {
  state: 'unblocked' | 'blocked' | 'proceeding';
  proceed: () => void;
  reset: () => void;
}

export type UseNavigationBlocker = (shouldBlock: boolean) => NavigationBlocker;

const idleBlocker: NavigationBlocker = {
  state: 'unblocked',
  proceed: () => {},
  reset: () => {},
};

/** Native `beforeunload` plus an optional TanStack / host `useBlocker`. */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  useBlocker: UseNavigationBlocker | undefined,
): NavigationBlocker {
  const blocker = useBlocker?.(isDirty) ?? idleBlocker;

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isDirty]);

  return blocker;
}
