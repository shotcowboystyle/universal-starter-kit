// Shared contract — consumed by the list, form, views, and quick-entry
// surfaces; keep signatures stable.
// This is the ONE meta loader for backoffice surfaces (form/deskMeta.ts and
// views/view-meta.ts loaders were consolidated here): getdoctype RPC on live
// benches, the FrappeProvider fixture branch for stories/tests, one
// module-wide cache either way.
import type { FixtureProvider, FrappeApp } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { DocFieldMeta, DoctypeMeta } from '@repo/frappe-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useFrappeApp } from './use-frappe-app';

// The meta shapes are the one model `@repo/frappe` declares
// (MPO-15), under the desk names frappe-ui gives them. This module keeps the
// LOADER (it needs the backoffice app context) and re-exports the shapes so
// every existing `@repo/backoffice` import still resolves.
export type { DocFieldMeta, DocLinkMeta, DocPermissionRule, DoctypeMeta } from '@repo/frappe-ui';

/** Parsed getdoctype `user_settings`: free-form per-user view settings JSON. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- frappe stores arbitrary per-view settings here; consumers read their own keys
export type DoctypeUserSettings = Record<string, unknown>;

export interface DoctypeMetaBundle {
  /** Parent doctype meta (docs[0]) */
  meta: DoctypeMeta;
  /** Child table doctype metas keyed by doctype name (docs[1..]) */
  childMetas: Record<string, DoctypeMeta>;
  /** Parsed user_settings (list view settings etc.), when present */
  userSettings?: DoctypeUserSettings;
}

interface GetDoctypeResponse {
  docs?: DoctypeMeta[];
  user_settings?: string | DoctypeUserSettings;
}

const metaCache = new Map<string, Promise<DoctypeMetaBundle>>();

const parseUserSettings = (raw: GetDoctypeResponse['user_settings']): DoctypeUserSettings | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- getdoctype sends user_settings either as a JSON string or already parsed
  if (typeof raw !== 'string') {
    return raw;
  }
  let parsed: DoctypeUserSettings | undefined;
  if (raw !== '') {
    try {
      // SAFETY: frappe serializes user_settings from a dict, so the JSON is an object
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any; see SAFETY above
      parsed = JSON.parse(raw) as DoctypeUserSettings;
    } catch {
      // Malformed settings are treated as absent.
    }
  }
  return parsed;
};

/**
 * Fixture path (stories / tests): the raw getdoctype-shaped meta doc lives in
 * the fixture provider's "DocType" collection under the doctype's name
 * (fields / links / permissions arrays inline).
 */
const loadBundleFromFixtures = async (fixtures: FixtureProvider, doctype: string): Promise<DoctypeMetaBundle> => {
  const doc = await fixtures.getDoc('DocType', doctype);
  if (!doc) {
    throw new Error(`No fixture meta for DocType "${doctype}"`);
  }
  // SAFETY: fixture DocType docs are raw getdoctype-shaped meta records (fields / links / permissions inline)
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the raw fixture doc before it is read as DoctypeMeta
  const raw = doc as Record<string, unknown>;
  // SAFETY: see above — `fields` is the DocField array when present
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fixture data is trusted test input
  const fields = (raw.fields as DocFieldMeta[] | undefined) ?? [];
  // SAFETY: see above — the record is a DoctypeMeta with `fields` normalized to an array
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fixture data is trusted test input
  const meta = { ...raw, fields } as DoctypeMeta;
  return { meta, childMetas: {} };
};

/** Live path: `frappe.desk.form.load.getdoctype` returns the parent meta plus every child-table meta. */
const loadBundleFromApp = async (app: FrappeApp, doctype: string): Promise<DoctypeMetaBundle> => {
  const res = await app.call().get<GetDoctypeResponse>('frappe.desk.form.load.getdoctype', {
    doctype,
    with_parent: 1,
  });
  const docs = res.payload?.docs ?? [];
  const meta = docs.find((d) => d.name === doctype) ?? docs.at(0);
  if (meta === undefined) {
    throw new Error(`No meta returned for ${doctype}`);
  }
  const childMetas: Record<string, DoctypeMeta> = {};
  for (const doc of docs) {
    if (doc !== meta) {
      childMetas[doc.name] = doc;
    }
  }
  return {
    meta,
    childMetas,
    userSettings: parseUserSettings(res.payload?.user_settings),
  };
};

/** Evict a failed load so the next mount retries instead of caching the rejection. */
const evictOnFailure = async (cacheKey: string, pending: Promise<DoctypeMetaBundle>): Promise<void> => {
  try {
    await pending;
  } catch {
    // Safe to continue: the hook surfaces the error through its own await; only the cache entry is dropped.
    metaCache.delete(cacheKey);
  }
};

/**
 * Load (and cache, module-wide) the meta bundle for a doctype via
 * `frappe.desk.form.load.getdoctype` — or, when the ambient FrappeProvider
 * carries a fixture provider, from its "DocType" collection. All backoffice
 * surfaces share this cache, so meta is fetched once per doctype per session.
 */
export const useDoctypeMeta = (
  doctype?: string,
): {
  bundle?: DoctypeMetaBundle;
  meta?: DoctypeMeta;
  loading: boolean;
  error?: Error;
  reload: () => void;
} => {
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const fixtures = config?.fixtures;
  const [bundle, setBundle] = useState<DoctypeMetaBundle | undefined>();
  const [loading, setLoading] = useState<boolean>(Boolean(doctype));
  const [loadError, setLoadError] = useState<Error | undefined>();
  const [generation, setGeneration] = useState(0);

  // Fixture and live providers must not share cache entries (storybook mounts
  // both kinds in one session); baseURL keeps multi-bench setups apart.
  const providerKind = fixtures ? 'fixtures' : 'live';
  const cacheKey =
    doctype === undefined || doctype === ''
      ? undefined
      : `${config?.baseURL ?? ''}\u0000${providerKind}\u0000${doctype}`;

  const hasSource = Boolean(app) || Boolean(fixtures);

  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- loading/bundle track an async fetch; they are not derivable during render
  useEffect(() => {
    // An empty doctype yields no cacheKey, so this also covers `doctype === ''`.
    if (!hasSource || doctype === undefined || cacheKey === undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- the doctype or provider went away: clear the stale bundle
      setBundle(undefined);
      // oxlint-disable-next-line react-doctor/no-derived-state -- see the effect note above
      setLoading(Boolean(doctype));
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    let promise = metaCache.get(cacheKey);
    if (!promise) {
      if (fixtures) {
        promise = loadBundleFromFixtures(fixtures, doctype);
      } else if (app) {
        promise = loadBundleFromApp(app, doctype);
      } else {
        // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
        return undefined;
      }
      metaCache.set(cacheKey, promise);
      void evictOnFailure(cacheKey, promise);
    }
    setLoading(true);
    setLoadError(undefined);
    const pending = promise;
    const load = async (): Promise<void> => {
      try {
        const value = await pending;
        if (cancelled) {
          return;
        }
        setBundle(value);
        setLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error ? error : new Error(`Failed to load meta for ${doctype}`, { cause: error }),
        );
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `generation` is a deliberate re-run trigger: reload() bumps it after evicting the cache entry.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- see above
  }, [app, fixtures, hasSource, doctype, cacheKey, generation]);

  const reload = useCallback(() => {
    if (cacheKey !== undefined) {
      metaCache.delete(cacheKey);
    }
    setGeneration((g) => g + 1);
  }, [cacheKey]);

  return useMemo(
    () => ({ bundle, meta: bundle?.meta, loading, error: loadError, reload }),
    [bundle, loading, loadError, reload],
  );
};
