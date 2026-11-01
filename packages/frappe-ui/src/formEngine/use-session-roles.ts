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

import { createHttpClient } from './form-actions';
import type { FrappeConnection } from './form-actions';

interface SessionIdentity {
  user: string;
  roles: string[];
}

const sessionCache = new Map<string, Promise<SessionIdentity>>();

const fetchSession = async (connection: FrappeConnection): Promise<SessionIdentity> => {
  const http = createHttpClient(connection);
  const res = await http.get<{ message?: string }>('/api/method/frappe.auth.get_logged_user');
  const user = res.payload?.message;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the payload is unvalidated JSON; anything but a non-empty string is no session
  if (typeof user !== 'string' || user === '') {
    throw new Error('No session user');
  }
  const rolesRes = await http.get<{ message?: string[] }>('/api/method/frappe.core.doctype.user.user.get_roles', {
    uid: user,
  });
  const roles = rolesRes.payload?.message;
  if (!Array.isArray(roles)) {
    throw new TypeError('No roles returned');
  }
  return { user, roles };
};

/** A connection that may not name a bench yet (a provider's config before it resolves). */
export type SessionConnection = Omit<FrappeConnection, 'baseURL'> & { baseURL?: string };

export type FrappeSessionState = 'idle' | 'loading' | 'ready' | 'failed';

export interface FrappeSession {
  user?: string;
  roles?: string[];
  /**
   * `idle`: no bench to ask (no connection, a fixtures-only one, or none
   * given). `loading`: asked, not answered. `ready`: user and roles known.
   * `failed`: the bench answered without a session (Guest) or refused.
   */
  state: FrappeSessionState;
}

const idleSession: FrappeSession = { state: 'idle' };
const loadingSession: FrappeSession = { state: 'loading' };

export const useFrappeSession = (connection: SessionConnection | undefined): FrappeSession => {
  const baseURL = connection?.baseURL;
  const fixtures = connection?.fixtures;
  const active = Boolean(connection) && !fixtures && Boolean(baseURL);
  const [session, setSession] = useState<FrappeSession>(() => (active ? { state: 'loading' } : idleSession));
  const connectionRef = useRef(connection);
  // oxlint-disable-next-line react/refs -- latest-value ref: the effect keys on baseURL, not the connection object
  connectionRef.current = connection;

  useEffect(() => {
    const { current } = connectionRef;
    if (!current || fixtures || baseURL === undefined || baseURL === '') {
      setSession(idleSession);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    setSession((prev) => (prev.state === 'loading' ? prev : { state: 'loading' }));
    let promise = sessionCache.get(baseURL);
    if (!promise) {
      promise = fetchSession({ ...current, baseURL });
      sessionCache.set(baseURL, promise);
      const pending = promise;
      void (async () => {
        try {
          await pending;
        } catch {
          // A failed lookup is not cached: the next mount asks the bench again.
          sessionCache.delete(baseURL);
        }
      })();
    }
    const settled = promise;
    void (async () => {
      try {
        const { user, roles } = await settled;
        if (!cancelled) {
          setSession({ user, roles, state: 'ready' });
        }
      } catch {
        // Guest or a refused RPC: report the session as failed.
        if (!cancelled) {
          setSession({ state: 'failed' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseURL, fixtures]);

  if (!active) {
    return idleSession;
  }
  return session.state === 'idle' ? loadingSession : session;
};

export const useSessionRoles = (connection: SessionConnection | undefined): string[] | undefined =>
  useFrappeSession(connection).roles;
