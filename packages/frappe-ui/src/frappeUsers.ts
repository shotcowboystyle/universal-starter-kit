/**
 * Shared user-display enrichment for the document-collaboration bridges
 * (FrappeAssignment, FrappeLikedBy).
 *
 * Frappe stores collaborators as user ids (emails) — `_liked_by`,
 * `allocated_to`. This hook subscribes to the matching User documents so
 * the UI can show full names and avatar images, live. Display always falls
 * back to the raw id when the User doc is not readable (permissions) or
 * not loaded yet, so nothing blocks on this lookup.
 */
import { useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useMemo } from 'react';

import type { FrappeConfig } from './FrappeProvider';

export interface FrappeUserDoc {
  name: string;
  doctype: string;
  full_name?: string;
  user_image?: string;
}

export interface FrappeUserDisplay {
  /** User id (email). */
  id: string;
  /** Full name when the User doc is readable, otherwise the id. */
  label: string;
  /** Avatar image URL when set on the User doc. */
  image?: string;
}

/** Human fallback for a user id: "jane.doe@x.com" → "jane.doe". */
function idToLabel(id: string): string {
  const at = id.indexOf('@');
  return at > 0 ? id.slice(0, at) : id;
}

/**
 * Live `id → display` map for the given user ids.
 *
 * Subscribes to the User doctype filtered by `name in ids` (skipped
 * entirely while `ids` is empty). Missing users resolve to an id-derived
 * label so consumers can render unconditionally.
 */
export function useFrappeUsers(
  config: FrappeConfig | undefined,
  ids: readonly string[],
): Map<string, FrappeUserDisplay> {
  // Stable, order-insensitive identity for the filter (collection re-creates
  // only when the actual user set changes).
  const sortedIds = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const idsKey = sortedIds.join('\n');

  const filters = useMemo<[string, string, unknown][]>(
    () => [['name', 'in', idsKey ? idsKey.split('\n') : []]],
    [idsKey],
  );

  const connectionConfig = useMemo(
    () =>
      config && idsKey
        ? {
            baseURL: config.baseURL,
            socketPort: config.socketPort,
            siteName: config.siteName,
            socketBaseURL: config.socketBaseURL,
            auth: config.auth,
            syncOptions: config.syncOptions,
            realtime: config.realtime,
            fixtures: config.fixtures,
          }
        : undefined,
    [config, idsKey],
  );

  const collection = useFrappeCollection<FrappeUserDoc>(connectionConfig, 'User', {
    filters,
    fields: ['name', 'full_name', 'user_image'],
  });

  const { data } = useLiveQuery((q) => (collection ? q.from({ _list: collection }) : null), [collection]);

  return useMemo(() => {
    const docs = (data as FrappeUserDoc[] | undefined) ?? [];
    const byId = new Map(docs.map((doc) => [doc.name, doc]));
    const map = new Map<string, FrappeUserDisplay>();
    for (const id of sortedIds) {
      const doc = byId.get(id);
      map.set(id, {
        id,
        label: doc?.full_name?.trim() ?? idToLabel(id),
        image: doc?.user_image ?? undefined,
      });
    }
    return map;
  }, [data, sortedIds]);
}
