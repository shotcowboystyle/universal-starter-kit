/**
 * Session user's role list — the client-side half of desk's
 * `frappe.user_roles` (bootinfo). Fetched once per site via the whitelisted
 * `frappe.core.doctype.user.user.get_roles` RPC (probed:
 * `?uid=<user>` → `{"message": ["Role", ...]}`), keyed off
 * `frappe.auth.get_logged_user`.
 *
 * Undefined while loading, on a fixtures-only connection, or when the RPC
 * fails. The permlevel matrix then takes the conservative
 * "permlevel > 0 → read-only" rule (fieldPermissions.ts).
 */

import { useEffect, useRef, useState } from 'react';

import { createHttpClient } from './formActions';
import type { FrappeConnection } from './formActions';

interface SessionIdentity {
  user: string;
  roles: string[];
}

const sessionCache = new Map<string, Promise<SessionIdentity>>();

async function fetchSession(connection: FrappeConnection): Promise<SessionIdentity> {
  const http = createHttpClient(connection);
  return await http.get<{ message?: string }>('/api/method/frappe.auth.get_logged_user').then(async (res) => {
    const user = res.payload?.message;
    if (!user || typeof user !== 'string') {
      throw new Error('No session user');
    }
    return await http
      .get<{ message?: string[] }>('/api/method/frappe.core.doctype.user.user.get_roles', {
        uid: user,
      })
      .then((rolesRes) => {
        const roles = rolesRes.payload?.message;
        if (!Array.isArray(roles)) {
          throw new TypeError('No roles returned');
        }
        return { user, roles };
      });
  });
}

/** A connection that may not name a bench yet (a provider's config before it resolves). */
export type SessionConnection = Omit<FrappeConnection, 'baseURL'> & { baseURL?: string };

export interface FrappeSession {
  user?: string;
  roles?: string[];
  /**
   * `idle`: no bench to ask (no connection, a fixtures-only one, or none
   * given). `loading`: asked, not answered. `ready`: user and roles known.
   * `failed`: the bench answered without a session (Guest) or refused.
   */
  state: 'idle' | 'loading' | 'ready' | 'failed';
}

const idleSession: FrappeSession = { state: 'idle' };
const loadingSession: FrappeSession = { state: 'loading' };

export function useFrappeSession(connection: SessionConnection | undefined): FrappeSession {
  const baseURL = connection?.baseURL;
  const fixtures = connection?.fixtures;
  const active = Boolean(connection) && !fixtures && Boolean(baseURL);
  const [session, setSession] = useState<FrappeSession>(() => (active ? { state: 'loading' } : idleSession));
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  useEffect(() => {
    const { current } = connectionRef;
    if (!current || fixtures || !baseURL) {
      setSession(idleSession);
      return;
    }
    let cancelled = false;
    setSession((prev) => (prev.state === 'loading' ? prev : { state: 'loading' }));
    let promise = sessionCache.get(baseURL);
    if (!promise) {
      promise = fetchSession({ ...current, baseURL });
      sessionCache.set(baseURL, promise);
      promise.catch(() => sessionCache.delete(baseURL));
    }
    promise
      .then(({ user, roles }) => {
        if (!cancelled) {
          setSession({ user, roles, state: 'ready' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession({ state: 'failed' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [baseURL, fixtures]);

  if (!active) {
    return idleSession;
  }
  return session.state === 'idle' ? loadingSession : session;
}

export function useSessionRoles(connection: SessionConnection | undefined): string[] | undefined {
  return useFrappeSession(connection).roles;
}
