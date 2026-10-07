// Shared contract — consumed by the list, form, views, and quick-entry
// surfaces; keep signatures stable.
// This is the ONE meta loader for backoffice surfaces (form/deskMeta.ts and
// views/viewMeta.ts loaders were consolidated here): getdoctype RPC on live
// benches, the FrappeProvider fixture branch for stories/tests, one
// module-wide cache either way.
import type { FixtureProvider } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { DocFieldMeta, DoctypeMeta } from '@repo/frappe-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useFrappeApp } from './useFrappeApp';

// The meta shapes are the one model `@repo/frappe` declares
// (MPO-15), under the desk names frappe-ui gives them. This module keeps the
// LOADER (it needs the backoffice app context) and re-exports the shapes so
// every existing `@repo/backoffice` import still resolves.
export type { DocFieldMeta, DocLinkMeta, DocPermissionRule, DoctypeMeta } from '@repo/frappe-ui';

export interface DoctypeMetaBundle {
  /** Parent doctype meta (docs[0]) */
  meta: DoctypeMeta;
  /** Child table doctype metas keyed by doctype name (docs[1..]) */
  childMetas: Record<string, DoctypeMeta>;
  /** Parsed user_settings (list view settings etc.), when present */
  userSettings?: Record<string, unknown>;
}

interface GetDoctypeResponse {
  docs?: DoctypeMeta[];
  user_settings?: string | Record<string, unknown>;
}

const metaCache = new Map<string, Promise<DoctypeMetaBundle>>();

function parseUserSettings(raw: GetDoctypeResponse['user_settings']) {
  if (!raw) {
    return;
  }
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
}

/**
 * Fixture path (stories / tests): the raw getdoctype-shaped meta doc lives in
 * the fixture provider's "DocType" collection under the doctype's name
 * (fields / links / permissions arrays inline).
 */
async function loadBundleFromFixtures(fixtures: FixtureProvider, doctype: string): Promise<DoctypeMetaBundle> {
  const doc = await fixtures.getDoc('DocType', doctype);
  if (!doc) {
    throw new Error(`No fixture meta for DocType "${doctype}"`);
  }
  const raw = doc as Record<string, unknown>;
  const meta = { ...raw, fields: (raw.fields as DocFieldMeta[] | undefined) ?? [] } as DoctypeMeta;
  return { meta, childMetas: {} };
}

/**
 * Load (and cache, module-wide) the meta bundle for a doctype via
 * `frappe.desk.form.load.getdoctype` — or, when the ambient FrappeProvider
 * carries a fixture provider, from its "DocType" collection. All backoffice
 * surfaces share this cache, so meta is fetched once per doctype per session.
 */
export function useDoctypeMeta(doctype?: string): {
  bundle?: DoctypeMetaBundle;
  meta?: DoctypeMeta;
  loading: boolean;
  error?: Error;
  reload: () => void;
} {
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const fixtures = config?.fixtures;
  const [bundle, setBundle] = useState<DoctypeMetaBundle | undefined>();
  const [loading, setLoading] = useState<boolean>(Boolean(doctype));
  const [error, setError] = useState<Error | undefined>();
  const [generation, setGeneration] = useState(0);

  // Fixture and live providers must not share cache entries (storybook mounts
  // both kinds in one session); baseURL keeps multi-bench setups apart.
  const cacheKey = doctype
    ? `${config?.baseURL ?? ''}\u0000${fixtures ? 'fixtures' : 'live'}\u0000${doctype}`
    : undefined;

  useEffect(() => {
    if ((!app && !fixtures) || !doctype || !cacheKey) {
      setBundle(undefined);
      setLoading(Boolean(doctype));
      return;
    }
    let cancelled = false;
    let promise = metaCache.get(cacheKey);
    if (!promise) {
      if (fixtures) {
        promise = loadBundleFromFixtures(fixtures, doctype);
      } else if (app) {
        promise = app
          .call()
          .get<GetDoctypeResponse>('frappe.desk.form.load.getdoctype', {
            doctype,
            with_parent: 1,
          })
          .then((res) => {
            const docs = res.payload?.docs ?? [];
            const meta = docs.find((d) => d.name === doctype) ?? docs[0];
            if (!meta) {
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
          });
      } else {
        return;
      }
      metaCache.set(cacheKey, promise);
      promise.catch(() => metaCache.delete(cacheKey));
    }
    setLoading(true);
    setError(undefined);
    promise
      .then((value) => {
        if (cancelled) {
          return;
        }
        setBundle(value);
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
  }, [app, fixtures, doctype, cacheKey, generation]);

  const reload = useCallback(() => {
    if (cacheKey) {
      metaCache.delete(cacheKey);
    }
    setGeneration((g) => g + 1);
  }, [cacheKey]);

  return useMemo(() => ({ bundle, meta: bundle?.meta, loading, error, reload }), [bundle, loading, error, reload]);
}
