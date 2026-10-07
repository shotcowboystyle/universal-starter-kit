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

import { useFrappeApp } from '../shared/useFrappeApp';

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
export function clearSessionUserCache(): void {
  sessionCache = new WeakMap();
}

/** Resolve a User.user_image value (usually "/files/…") to an absolute URL. */
export function resolveUserImageUrl(userImage: string | null | undefined, baseURL: string): string | undefined {
  if (!userImage) {
    return undefined;
  }
  // Already absolute (http(s), data:, blob:, …) — leave untouched.
  if (/^[a-z][a-z0-9+.-]*:/i.test(userImage)) {
    return userImage;
  }
  return `${baseURL.replace(/\/+$/, '')}${userImage.startsWith('/') ? '' : '/'}${userImage}`;
}

async function fetchSessionUserInfo(app: FrappeApp, baseURL: string): Promise<SessionUserInfo> {
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
}

/** Module-cached session-user info from the ambient Frappe connection. */
export function useSessionUserInfo(): {
  info?: SessionUserInfo;
  loading: boolean;
  error?: Error;
} {
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const baseURL = config?.baseURL ?? '';
  const [info, setInfo] = useState<SessionUserInfo | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!app) {
      setInfo(undefined);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let promise = sessionCache.get(app);
    if (!promise) {
      promise = fetchSessionUserInfo(app, baseURL);
      sessionCache.set(app, promise);
      promise.catch(() => {
        if (sessionCache.get(app) === promise) {
          sessionCache.delete(app);
        }
      });
    }
    setLoading(true);
    setError(undefined);
    promise
      .then((value) => {
        if (cancelled) {
          return;
        }
        setInfo(value);
        setLoading(false);
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        setError(error);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [app, baseURL]);

  return useMemo(() => ({ info, loading, error }), [info, loading, error]);
}
