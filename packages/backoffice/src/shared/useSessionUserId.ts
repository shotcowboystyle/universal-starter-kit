// Session user id (for liked-hearts + "assigned to me"), cached per app.
// (The shell's useSessionUser in shell/useWorkspaces.ts is the HttpClient
// variant used by the sidebar; this one rides the FrappeApp auth module.)
import { useFrappeConfig } from '@repo/frappe-ui';
import { useEffect, useState } from 'react';

import { useFrappeApp } from './useFrappeApp';

const userCache = new Map<string, Promise<string>>();

/**
 * The logged-in user's id (`frappe.auth.get_logged_user`), or undefined
 * while loading / in fixture mode (no session exists against fixtures).
 */
export function useSessionUserId(): string | undefined {
  const config = useFrappeConfig();
  const app = useFrappeApp();
  const fixtureMode = Boolean(config?.fixtures);
  const [user, setUser] = useState<string | undefined>();

  useEffect(() => {
    const baseURL = config?.baseURL;
    if (!app || fixtureMode || !baseURL) {
      return;
    }
    let cancelled = false;
    let promise = userCache.get(baseURL);
    if (!promise) {
      promise = app.auth().getLoggedInUser();
      userCache.set(baseURL, promise);
      promise.catch(() => userCache.delete(baseURL));
    }
    promise
      .then((value) => {
        if (!cancelled && value) {
          setUser(value);
        }
      })
      .catch(() => {
        // No session — hearts render unfilled, "me" facets hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [app, fixtureMode, config?.baseURL]);

  return user;
}
