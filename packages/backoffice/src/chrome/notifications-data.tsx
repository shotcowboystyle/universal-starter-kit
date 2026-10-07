/**
 * Live Notification Log feed for the navbar bell (desk parity).
 *
 * Data flows through the live client (`useFrappeCollection` + `useLiveQuery`)
 * so realtime inserts pop into the panel without a refetch. Read state is a
 * different story: the desk RPCs flip `read` with `update_modified=False`
 * (no realtime doc_update event), so this hook layers local optimistic
 * overrides on top of the collection and lets a later sync reconcile.
 *
 * RPC shapes (probed against the reference bench):
 * - POST /api/method/frappe.desk.doctype.notification_log.notification_log.mark_as_read
 *   body {docname} → {} (sets read=1)
 * - POST /api/method/frappe.desk.doctype.notification_log.notification_log.mark_all_as_read
 *   body {} → {} (marks every unread row for the session user)
 * - Fallback per doc: POST frappe.client.set_value
 *   {doctype: "Notification Log", name, fieldname: "read", value: 1}
 */
import { Order, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import type { FixtureProvider, FrappeApp } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useFrappeApp } from '../shared/useFrappeApp';

import { parseFrappeTimestamp, stripHtmlToText } from './notifications-utils';

export interface NotificationLogDoc {
  name: string;
  doctype: string;
  subject?: string;
  type?: string;
  document_type?: string;
  document_name?: string;
  read?: 0 | 1;
  from_user?: string;
  creation?: string;
}

/** A Notification Log row prepared for display. */
export interface NotificationItem extends NotificationLogDoc {
  /** Server `read` merged with local optimistic mark-as-read overrides. */
  unread: boolean;
  /** Subject with HTML stripped ("Jane mentioned you in a comment: …"). */
  subjectText: string;
  /** `creation` as epoch ms (undefined when unparseable). */
  timestampMs?: number;
}

const NOTIFICATION_FIELDS = [
  'name',
  'subject',
  'type',
  'document_type',
  'document_name',
  'read',
  'from_user',
  'creation',
] as const;

/** Recent-notifications window (desk loads pages of 20; badge caps at 99+). */
const NOTIFICATION_WINDOW_LIMIT = 100;

const MARK_AS_READ_METHOD = 'frappe.desk.doctype.notification_log.notification_log.mark_as_read';
const MARK_ALL_AS_READ_METHOD = 'frappe.desk.doctype.notification_log.notification_log.mark_all_as_read';

// ---------------------------------------------------------------------------
// Session user (module cache — one fetch per FrappeApp per session)
// ---------------------------------------------------------------------------

const sessionUserCache = new WeakMap<FrappeApp, Promise<string | undefined>>();

interface SessionUserState {
  user?: string;
  /** True once the probe settled (Guest / unreachable resolve to no user). */
  resolved: boolean;
}

function useNotificationsSessionUser(fixtureMode: boolean): SessionUserState {
  const app = useFrappeApp();
  const [state, setState] = useState<SessionUserState>({ resolved: false });

  useEffect(() => {
    // Fixture mode has no session endpoint; report resolved-with-no-user.
    // No app (no provider config) settles the same way so the panel never
    // skeletons forever.
    if (fixtureMode || !app) {
      setState({ resolved: true });
      return;
    }
    let cancelled = false;
    let promise = sessionUserCache.get(app);
    if (!promise) {
      promise = app
        .call()
        .get<{ message?: string }>('frappe.auth.get_logged_user')
        .then((res) => {
          const user = res.payload?.message;
          return user && user !== 'Guest' ? user : undefined;
        })
        .catch(() => {
          // Evict failed probes so a later mount can retry.
          sessionUserCache.delete(app);
          return;
        });
      sessionUserCache.set(app, promise);
    }
    promise.then((user) => {
      if (!cancelled) {
        setState({ user, resolved: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [app, fixtureMode]);

  return state;
}

// ---------------------------------------------------------------------------
// Mark-as-read RPCs
// ---------------------------------------------------------------------------

async function setReadViaSetValue(app: FrappeApp, name: string): Promise<void> {
  await app.call().post('frappe.client.set_value', {
    doctype: 'Notification Log',
    name,
    fieldname: 'read',
    value: 1,
  });
}

async function markAsReadOnServer(app: FrappeApp, name: string): Promise<void> {
  try {
    await app.call().post(MARK_AS_READ_METHOD, { docname: name });
  } catch {
    // Desk RPC unavailable (older bench / stripped app) — plain doc write.
    await setReadViaSetValue(app, name);
  }
}

async function markAllAsReadOnServer(app: FrappeApp, unreadNames: readonly string[]): Promise<void> {
  try {
    await app.call().post(MARK_ALL_AS_READ_METHOD, {});
  } catch {
    await Promise.all(unreadNames.map(async (name) => await setReadViaSetValue(app, name)));
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseNotificationsResult {
  /** Prepared rows, newest first. */
  items: NotificationItem[];
  /** Unread rows within the window (badge value). */
  unreadCount: number;
  /** True until the session probe + first collection snapshot settle. */
  isLoading: boolean;
  /** Mark one notification read (optimistic; reverts if the RPC fails). */
  markAsRead: (name: string) => Promise<void>;
  /** Mark every unread notification read (optimistic; reverts on failure). */
  markAllAsRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const config = useFrappeConfig();
  const app = useFrappeApp();
  const fixtureMode = Boolean(config?.fixtures);
  const { user: sessionUser, resolved: sessionResolved } = useNotificationsSessionUser(fixtureMode);

  // Stable connection config (fresh identities would churn the collection).
  const connectionConfig = useMemo(
    () =>
      config
        ? {
            baseURL: config.baseURL,
            socketPort: config.socketPort,
            siteName: config.siteName,
            socketBaseURL: config.socketBaseURL,
            auth: config.auth,
            syncOptions: config.syncOptions,
            socketOptions: config.socketOptions,
            fixtures: config.fixtures,
          }
        : undefined,
    [config],
  );

  // Live mode waits for the session user (the for_user filter needs it);
  // fixture mode reads the fixture set unfiltered.
  const ready = Boolean(connectionConfig) && (fixtureMode || Boolean(sessionUser));
  const collection = useFrappeCollection<NotificationLogDoc>(ready ? connectionConfig : undefined, 'Notification Log', {
    fields: NOTIFICATION_FIELDS,
    filters: !fixtureMode && sessionUser ? [['for_user', '=', sessionUser]] : undefined,
    orderBy: { field: 'creation', order: Order.Desc },
    limit: NOTIFICATION_WINDOW_LIMIT,
  });

  const { data: rawData, isLoading: queryLoading } = useLiveQuery(
    (q) => (collection ? q.from({ _notification: collection }) : null),
    [collection],
  );

  // Local read overrides — see module note on why realtime can't carry these.
  const [readOverrides, setReadOverrides] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo<NotificationItem[]>(() => {
    const docs = (rawData as NotificationLogDoc[] | undefined) ?? [];
    return docs
      .filter((doc) => doc.name)
      .map((doc) => ({
        ...doc,
        unread: !doc.read && !readOverrides.has(doc.name),
        subjectText: stripHtmlToText(doc.subject),
        timestampMs: parseFrappeTimestamp(doc.creation),
      }))
      .sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0) || a.name.localeCompare(b.name));
  }, [rawData, readOverrides]);

  const unreadCount = useMemo(() => items.filter((item) => item.unread).length, [items]);

  const isLoading =
    (Boolean(connectionConfig) && !fixtureMode && !sessionResolved) ||
    // Session resolved without a user (Guest / unreachable bench): settle on
    // an empty feed instead of skeleting forever.
    (ready && (collection === undefined || Boolean(queryLoading)));

  const addOverrides = useCallback((names: readonly string[]) => {
    if (!names.length) {
      return;
    }
    setReadOverrides((prev) => {
      const next = new Set(prev);
      for (const name of names) {
        next.add(name);
      }
      return next;
    });
  }, []);

  const removeOverrides = useCallback((names: readonly string[]) => {
    if (!names.length) {
      return;
    }
    setReadOverrides((prev) => {
      const next = new Set(prev);
      for (const name of names) {
        next.delete(name);
      }
      return next;
    });
  }, []);

  const markAsRead = useCallback(
    async (name: string) => {
      addOverrides([name]);
      if (fixtureMode || !app) {
        return;
      }
      try {
        await markAsReadOnServer(app, name);
      } catch (error) {
        removeOverrides([name]);
        throw error;
      }
    },
    [app, fixtureMode, addOverrides, removeOverrides],
  );

  const markAllAsRead = useCallback(async () => {
    const unreadNames = items.filter((item) => item.unread).map((item) => item.name);
    if (!unreadNames.length) {
      return;
    }
    addOverrides(unreadNames);
    if (fixtureMode || !app) {
      return;
    }
    try {
      await markAllAsReadOnServer(app, unreadNames);
    } catch (error) {
      removeOverrides(unreadNames);
      throw error;
    }
  }, [app, fixtureMode, items, addOverrides, removeOverrides]);

  return useMemo(
    () => ({ items, unreadCount, isLoading, markAsRead, markAllAsRead }),
    [items, unreadCount, isLoading, markAsRead, markAllAsRead],
  );
}
