// Session user id (for liked-hearts + "assigned to me"), cached per app.
// (The shell's useSessionUser in shell/use-workspaces.ts is the HttpClient
// variant used by the sidebar; this one rides the FrappeApp auth module.)
import { useFrappeConfig } from '@repo/frappe-ui';
import { useEffect, useState } from 'react';

import { useFrappeApp } from './use-frappe-app';

const userCache = new Map<string, Promise<string>>();

/** Evict a failed probe so a later mount can retry. */
const evictOnFailure = async (baseURL: string, pending: Promise<string>): Promise<void> => {
  try {
    await pending;
  } catch {
    // Safe to continue: the failure is surfaced to the hook's own await; only the cache entry is dropped here.
    userCache.delete(baseURL);
  }
};

/**
 * The logged-in user's id (`frappe.auth.get_logged_user`), or undefined
 * while loading / in fixture mode (no session exists against fixtures).
 */
export const useSessionUserId = (): string | undefined => {
  const config = useFrappeConfig();
  const app = useFrappeApp();
  const fixtureMode = Boolean(config?.fixtures);
  const [user, setUser] = useState<string | undefined>();

  useEffect(() => {
    const baseURL = config?.baseURL;
    if (!app || fixtureMode || baseURL === undefined || baseURL === '') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    let promise = userCache.get(baseURL);
    if (!promise) {
      promise = app.auth().getLoggedInUser();
      userCache.set(baseURL, promise);
      void evictOnFailure(baseURL, promise);
    }
    const pending = promise;
    const load = async (): Promise<void> => {
      try {
        const value = await pending;
        if (!cancelled && value) {
          setUser(value);
        }
      } catch {
        // No session — hearts render unfilled, "me" facets hidden.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [app, fixtureMode, config?.baseURL]);

  return user;
};
