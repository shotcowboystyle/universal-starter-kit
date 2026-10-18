// Shared contract — consumed by the form sidebar, timeline, and connections
// surfaces; keep signatures stable.
// Shape verified against the live bench: get_docinfo → { docinfo: {...} }
// with keys: user_info, comments, shared, assignment_logs, attachment_logs,
// info_logs, like_logs, workflow_logs, attachments, communications,
// automated_messages, versions, assignments, permissions, views,
// additional_timeline_content, milestones, is_document_followed, tags,
// document_email.
import type { FrappeApp } from '@repo/frappe';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useFrappeApp } from './use-frappe-app';

/** One free-form docinfo log/row as frappe sends it; surfaces read the keys they know. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- get_docinfo rows are open frappe records whose keys vary by log type
export type DocInfoRecord = Record<string, unknown>;

export interface DocInfoComment {
  name: string;
  comment_type?: string;
  content?: string;
  owner?: string;
  creation?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- comments carry extra frappe columns surfaces may read
  [key: string]: unknown;
}

export interface DocInfo {
  doctype?: string;
  name?: string;
  user_info?: Record<string, { fullname?: string; image?: string; name?: string } & DocInfoRecord>;
  comments?: DocInfoComment[];
  communications?: DocInfoRecord[];
  automated_messages?: DocInfoRecord[];
  versions?: DocInfoRecord[];
  assignments?: ({ name?: string; owner?: string; description?: string } & DocInfoRecord)[];
  assignment_logs?: DocInfoRecord[];
  attachments?: ({ name?: string; file_name?: string; file_url?: string; is_private?: 0 | 1 } & DocInfoRecord)[];
  attachment_logs?: DocInfoRecord[];
  info_logs?: DocInfoRecord[];
  like_logs?: DocInfoRecord[];
  workflow_logs?: DocInfoRecord[];
  shared?: DocInfoRecord[];
  permissions?: DocInfoRecord;
  views?: DocInfoRecord[];
  additional_timeline_content?: DocInfoRecord[];
  milestones?: DocInfoRecord[];
  is_document_followed?: number;
  /** JSON string of tag list, e.g. "[]" or comma string — parse defensively */
  tags?: string;
  document_email?: unknown;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- frappe adds docinfo keys across versions; unknown keys pass through
  [key: string]: unknown;
}

interface CacheEntry {
  promise: Promise<DocInfo>;
  value?: DocInfo;
  listeners: Set<() => void>;
}

const docinfoCache = new Map<string, CacheEntry>();

const cacheKey = (doctype: string, name: string) => `${doctype}\u0000${name}`;

/** True for a set, non-empty route segment. */
const isPresent = (value: string | undefined): value is string => value !== undefined && value !== '';

const fetchDocinfo = async (app: FrappeApp, doctype: string, name: string): Promise<DocInfo> => {
  const res = await app
    .call()
    .get<{ docinfo?: DocInfo; message?: { docinfo?: DocInfo } }>('frappe.desk.form.load.get_docinfo', {
      doctype,
      name,
    });
  const info = res.payload?.docinfo ?? res.payload?.message?.docinfo;
  if (!info) {
    throw new Error(`No docinfo returned for ${doctype}/${name}`);
  }
  return info;
};

// ---------------------------------------------------------------------------
// Optimistic overlays (the docinfo arm of the ONE optimistic pattern)
// ---------------------------------------------------------------------------
//
// An overlay is a pure patch composed ON TOP of the fetched docinfo every
// time subscribers read it. Optimistic mutations (add comment, assign, tag…)
// apply as overlays instead of editing the base value, so:
//   - a racing full refetch replaces the BASE and the pending record
//     survives (overlays re-compose on the new base);
//   - rollback is exact — remove the overlay, the base was never touched;
//   - reconcile promotes the ack payload into the base (authoritative
//     server identity) and drops the overlay in one notification, so the
//     optimistic record and the server record converge instead of
//     duplicating.
// Overlay records should carry a pending marker (e.g. `__optimistic: true`)
// so surfaces render them visible-but-distinct (Axiom 6 HONEST STATE).

interface DocinfoOverlay {
  key: string;
  patch: (info: DocInfo) => DocInfo;
}

let overlaySeq = 0;
const docinfoOverlays = new Map<string, DocinfoOverlay>();

const composeDocinfo = (key: string, base: DocInfo | undefined): DocInfo | undefined => {
  if (!base) {
    return base;
  }
  let composed = base;
  for (const overlay of docinfoOverlays.values()) {
    if (overlay.key === key) {
      composed = overlay.patch(composed);
    }
  }
  return composed;
};

const notifyDocinfo = (key: string) => {
  const entry = docinfoCache.get(key);
  if (entry) {
    for (const listener of entry.listeners) {
      listener();
    }
  }
};

/**
 * Adds an optimistic overlay to a document's docinfo and wakes subscribers.
 * Returns the overlay id for {@link removeDocinfoOverlay}. The patch must be
 * pure — it re-runs on every read, including on refetched bases.
 */
export const addDocinfoOverlay = (doctype: string, name: string, patch: (info: DocInfo) => DocInfo): string => {
  const key = cacheKey(doctype, name);
  overlaySeq += 1;
  const id = `overlay_${overlaySeq}`;
  docinfoOverlays.set(id, { key, patch });
  notifyDocinfo(key);
  return id;
};

/** Removes an optimistic overlay (rollback or post-reconcile) and wakes subscribers. */
export const removeDocinfoOverlay = (id: string) => {
  const overlay = docinfoOverlays.get(id);
  if (!overlay) {
    return;
  }
  docinfoOverlays.delete(id);
  notifyDocinfo(overlay.key);
};

/**
 * Permanently patches the fetched docinfo base (reconcile step — promote a
 * server ack into the shared store without a refetch). No-ops when the base
 * has not resolved yet; the in-flight fetch will include the change.
 */
export const patchDocinfoBase = (doctype: string, name: string, patch: (info: DocInfo) => DocInfo) => {
  const key = cacheKey(doctype, name);
  const entry = docinfoCache.get(key);
  if (!entry?.value) {
    return;
  }
  entry.value = patch(entry.value);
  notifyDocinfo(key);
};

/** Store a resolved fetch on its cache entry (and wake subscribers), or evict the entry when it fails. */
const settleEntry = async (key: string, entry: CacheEntry): Promise<void> => {
  try {
    const value = await entry.promise;
    if (docinfoCache.get(key) === entry) {
      entry.value = value;
      for (const listener of entry.listeners) {
        listener();
      }
    }
  } catch {
    // Safe to continue: subscribers surface the error themselves; a failed fetch is evicted so the next mount retries.
    if (docinfoCache.get(key) === entry) {
      docinfoCache.delete(key);
    }
  }
};

/**
 * Shared, deduped fetch of frappe's docinfo for a document. Multiple panels
 * (sidebar, timeline, connections) share one fetch; `reload()` from any of
 * them refreshes all subscribers.
 */
export const useDocinfo = (
  doctype?: string,
  name?: string,
): { docinfo?: DocInfo; loading: boolean; error?: Error; reload: () => void } => {
  const app = useFrappeApp();
  const [docinfo, setDocinfo] = useState<DocInfo | undefined>();
  const [loading, setLoading] = useState<boolean>(() => isPresent(doctype) && isPresent(name));
  const [loadError, setLoadError] = useState<Error | undefined>();
  const [generation, setGeneration] = useState(0);

  const isNewDoc = !isPresent(name) || name === 'new';

  useEffect(() => {
    if (!app || !isPresent(doctype) || !isPresent(name) || isNewDoc) {
      // oxlint-disable-next-line react/set-state-in-effect -- no document to load: clear the previous document's docinfo
      setDocinfo(undefined);
      setLoading(false);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    const key = cacheKey(doctype, name);
    let entry = docinfoCache.get(key);
    if (!entry) {
      entry = { promise: fetchDocinfo(app, doctype, name), listeners: new Set<() => void>() };
      docinfoCache.set(key, entry);
      void settleEntry(key, entry);
    }
    const currentEntry = entry;
    const sync = () => {
      if (!cancelled && currentEntry.value) {
        setDocinfo(composeDocinfo(key, currentEntry.value));
        setLoading(false);
      }
    };
    currentEntry.listeners.add(sync);
    setLoading(!currentEntry.value);
    setLoadError(undefined);
    if (currentEntry.value) {
      setDocinfo(composeDocinfo(key, currentEntry.value));
    }
    const watchError = async (): Promise<void> => {
      try {
        await currentEntry.promise;
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error : new Error(`Failed to load docinfo for ${key}`, { cause: error }),
          );
          setLoading(false);
        }
      }
    };
    void watchError();
    return () => {
      cancelled = true;
      currentEntry.listeners.delete(sync);
    };
    // `generation` is a deliberate re-run trigger: reload() bumps it after evicting the cache entry.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- see above
  }, [app, doctype, name, isNewDoc, generation]);

  const reload = useCallback(() => {
    if (isPresent(doctype) && isPresent(name)) {
      const key = cacheKey(doctype, name);
      const entry = docinfoCache.get(key);
      docinfoCache.delete(key);
      // wake every subscriber so they re-run the effect and share the refetch
      if (entry) {
        for (const listener of entry.listeners) {
          listener();
        }
      }
    }
    setGeneration((g) => g + 1);
  }, [doctype, name]);

  return useMemo(() => ({ docinfo, loading, error: loadError, reload }), [docinfo, loading, loadError, reload]);
};

/** Invalidate the docinfo cache for a document (after mutations). */
export const invalidateDocinfo = (doctype: string, name: string) => {
  docinfoCache.delete(cacheKey(doctype, name));
};
