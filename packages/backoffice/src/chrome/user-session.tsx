/**
 * Session-user info for the navbar user menu, module-cached so the avatar
 * button and the menu header fetch once per session (per FrappeApp).
 *
 * Flow (one cached promise): frappe.auth.get_logged_user →
 * frappe.client.get_value(User, <name>, ["full_name","user_image","email"]).
 */
import type { FrappeApp } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import React, { useEffect, useMemo, useState } from 'react';

import { useFrappeApp } from '../shared/use-frappe-app';

export interface SessionUserInfo {
  /** Session user docname (e.g. "Administrator" or an email login). */
  user: string;
  fullName: string;
  email?: string;
  /** Absolute avatar URL (User.user_image resolved against the bench). */
  imageUrl?: string;
}

interface UserDocBits {
  full_name?: string;
  user_image?: string | null;
  email?: string;
}

// Keyed by FrappeApp instance: a different bench/auth config gets its own
// entry (useFrappeApp memoizes apps per config). Failed fetches self-evict
// so the next mount retries.
let sessionCache = new WeakMap<FrappeApp, Promise<SessionUserInfo>>();

/** Logout hygiene: drops every cached session-user fetch in this module. */
export const clearSessionUserCache = (): void => {
  sessionCache = new WeakMap();
};

/** Resolve a User.user_image value (usually "/files/…") to an absolute URL. */
export const resolveUserImageUrl = (userImage: string | null | undefined, baseURL: string): string | undefined => {
  if (userImage == null || userImage === '') {
    return undefined;
  }
  // Already absolute (http(s), data:, blob:, …) — leave untouched.
  if (/^[a-z][a-z0-9+.-]*:/iu.test(userImage)) {
    return userImage;
  }
  // oxlint-disable-next-line sonarjs/super-linear-regex -- baseURL is a short configured origin
  return `${baseURL.replace(/\/+$/u, '')}${userImage.startsWith('/') ? '' : '/'}${userImage}`;
};

const fetchSessionUserInfo = async (app: FrappeApp, baseURL: string): Promise<SessionUserInfo> => {
  const user = await app.auth().getLoggedInUser();
  if (!user) {
    throw new Error('No session user');
  }
  // Param format probed against the bench: filters takes the plain docname,
  // fieldname a JSON array (the http client JSON-encodes non-string params).
  const res = await app.call().get<{ message?: UserDocBits }>('frappe.client.get_value', {
    doctype: 'User',
    filters: user,
    fieldname: ['full_name', 'user_image', 'email'],
  });
  const bits = res.payload?.message ?? {};
  return {
    user,
    fullName: bits.full_name ?? user,
    email: bits.email ?? (user.includes('@') ? user : undefined),
    imageUrl: resolveUserImageUrl(bits.user_image, baseURL),
  };
};

/** Module-cached session-user info from the ambient Frappe connection. */
export const useSessionUserInfo = (): {
  info?: SessionUserInfo;
  loading: boolean;
  error?: Error;
} => {
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const baseURL = config?.baseURL ?? '';
  const [info, setInfo] = useState<SessionUserInfo | undefined>();
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<Error | undefined>();

  useEffect(() => {
    if (!app) {
      // oxlint-disable-next-line react/set-state-in-effect -- losing the Frappe connection clears the session view
      setInfo(undefined);
      setLoading(false);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    let promise = sessionCache.get(app);
    if (!promise) {
      const pending = fetchSessionUserInfo(app, baseURL);
      promise = pending;
      sessionCache.set(app, pending);
      const evictOnFailure = async () => {
        try {
          await pending;
        } catch {
          // Evict failed probes so a later mount can retry; the settle step below reports the error.
          if (sessionCache.get(app) === pending) {
            sessionCache.delete(app);
          }
        }
      };
      void evictOnFailure();
    }
    setLoading(true);
    setSessionError(undefined);
    const session = promise;
    const settle = async () => {
      try {
        const value = await session;
        if (!cancelled) {
          setInfo(value);
          setLoading(false);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          // SAFETY: fetchSessionUserInfo rejects with the Frappe client's Error instances (or its own `new Error`).
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          setSessionError(error as Error);
          setLoading(false);
        }
      }
    };
    void settle();
    return () => {
      cancelled = true;
    };
  }, [app, baseURL]);

  return useMemo(() => ({ info, loading, error: sessionError }), [info, loading, sessionError]);
};
