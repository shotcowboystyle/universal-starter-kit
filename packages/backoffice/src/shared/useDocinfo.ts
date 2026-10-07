// Shared contract — consumed by the form sidebar, timeline, and connections
// surfaces; keep signatures stable.
// Shape verified against the live bench: get_docinfo → { docinfo: {...} }
// with keys: user_info, comments, shared, assignment_logs, attachment_logs,
// info_logs, like_logs, workflow_logs, attachments, communications,
// automated_messages, versions, assignments, permissions, views,
// additional_timeline_content, milestones, is_document_followed, tags,
// document_email.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useFrappeApp } from './useFrappeApp';

export interface DocInfoComment {
  name: string;
  comment_type?: string;
  content?: string;
  owner?: string;
  creation?: string;
  [key: string]: unknown;
}

export interface DocInfo {
  doctype?: string;
  name?: string;
  user_info?: Record<string, { fullname?: string; image?: string; name?: string } & Record<string, unknown>>;
  comments?: DocInfoComment[];
  communications?: Record<string, unknown>[];
  automated_messages?: Record<string, unknown>[];
  versions?: Record<string, unknown>[];
  assignments?: ({ name?: string; owner?: string; description?: string } & Record<string, unknown>)[];
  assignment_logs?: Record<string, unknown>[];
  attachments?: ({ name?: string; file_name?: string; file_url?: string; is_private?: 0 | 1 } & Record<
    string,
    unknown
  >)[];
  attachment_logs?: Record<string, unknown>[];
  info_logs?: Record<string, unknown>[];
  like_logs?: Record<string, unknown>[];
  workflow_logs?: Record<string, unknown>[];
  shared?: Record<string, unknown>[];
  permissions?: Record<string, unknown>;
  views?: Record<string, unknown>[];
  additional_timeline_content?: Record<string, unknown>[];
  milestones?: Record<string, unknown>[];
  is_document_followed?: number;
  /** JSON string of tag list, e.g. "[]" or comma string — parse defensively */
  tags?: string;
  document_email?: unknown;
  [key: string]: unknown;
}

interface CacheEntry {
  promise: Promise<DocInfo>;
  value?: DocInfo;
  listeners: Set<() => void>;
}

const docinfoCache = new Map<string, CacheEntry>();

function cacheKey(doctype: string, name: string) {
  return `${doctype}\u0000${name}`;
}

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

function composeDocinfo(key: string, base: DocInfo | undefined): DocInfo | undefined {
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
}

function notifyDocinfo(key: string) {
  const entry = docinfoCache.get(key);
  if (entry) {
    for (const listener of entry.listeners) {
      listener();
    }
  }
}

/**
 * Adds an optimistic overlay to a document's docinfo and wakes subscribers.
 * Returns the overlay id for {@link removeDocinfoOverlay}. The patch must be
 * pure — it re-runs on every read, including on refetched bases.
 */
export function addDocinfoOverlay(doctype: string, name: string, patch: (info: DocInfo) => DocInfo): string {
  const key = cacheKey(doctype, name);
  const id = `overlay_${++overlaySeq}`;
  docinfoOverlays.set(id, { key, patch });
  notifyDocinfo(key);
  return id;
}

/** Removes an optimistic overlay (rollback or post-reconcile) and wakes subscribers. */
export function removeDocinfoOverlay(id: string) {
  const overlay = docinfoOverlays.get(id);
  if (!overlay) {
    return;
  }
  docinfoOverlays.delete(id);
  notifyDocinfo(overlay.key);
}

/**
 * Permanently patches the fetched docinfo base (reconcile step — promote a
 * server ack into the shared store without a refetch). No-ops when the base
 * has not resolved yet; the in-flight fetch will include the change.
 */
export function patchDocinfoBase(doctype: string, name: string, patch: (info: DocInfo) => DocInfo) {
  const key = cacheKey(doctype, name);
  const entry = docinfoCache.get(key);
  if (!entry?.value) {
    return;
  }
  entry.value = patch(entry.value);
  notifyDocinfo(key);
}

/**
 * Shared, deduped fetch of frappe's docinfo for a document. Multiple panels
 * (sidebar, timeline, connections) share one fetch; `reload()` from any of
 * them refreshes all subscribers.
 */
export function useDocinfo(
  doctype?: string,
  name?: string,
): { docinfo?: DocInfo; loading: boolean; error?: Error; reload: () => void } {
  const app = useFrappeApp();
  const [docinfo, setDocinfo] = useState<DocInfo | undefined>();
  const [loading, setLoading] = useState<boolean>(Boolean(doctype && name));
  const [error, setError] = useState<Error | undefined>();
  const [generation, setGeneration] = useState(0);

  const isNewDoc = !name || name === 'new';

  useEffect(() => {
    if (!app || !doctype || !name || isNewDoc) {
      setDocinfo(undefined);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const key = cacheKey(doctype, name);
    let entry = docinfoCache.get(key);
    if (!entry) {
      const listeners = new Set<() => void>();
      const promise = app
        .call()
        .get<{ docinfo?: DocInfo; message?: { docinfo?: DocInfo } }>('frappe.desk.form.load.get_docinfo', {
          doctype,
          name,
        })
        .then((res) => {
          const info = res.payload?.docinfo ?? res.payload?.message?.docinfo;
          if (!info) {
            throw new Error(`No docinfo returned for ${doctype}/${name}`);
          }
          return info;
        });
      entry = { promise, listeners };
      docinfoCache.set(key, entry);
      promise
        .then((value) => {
          const current = docinfoCache.get(key);
          if (current && current === entry) {
            current.value = value;
            for (const listener of current.listeners) {
              listener();
            }
          }
        })
        .catch(() => {
          if (docinfoCache.get(key) === entry) {
            docinfoCache.delete(key);
          }
        });
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
    setError(undefined);
    if (currentEntry.value) {
      setDocinfo(composeDocinfo(key, currentEntry.value));
    }
    currentEntry.promise.catch((error: Error) => {
      if (!cancelled) {
        setError(error);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      currentEntry.listeners.delete(sync);
    };
  }, [app, doctype, name, isNewDoc, generation]);

  const reload = useCallback(() => {
    if (doctype && name) {
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

  return useMemo(() => ({ docinfo, loading, error, reload }), [docinfo, loading, error, reload]);
}

/** Invalidate the docinfo cache for a document (after mutations). */
export function invalidateDocinfo(doctype: string, name: string) {
  docinfoCache.delete(cacheKey(doctype, name));
}
