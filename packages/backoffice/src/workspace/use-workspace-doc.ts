/**
 * Single-doc fetch for the workspace page.
 *
 * A Workspace doc is read-mostly chrome (its child tables define the page
 * layout), so a plain REST `getDoc` through the frappe client is a better
 * fit than spinning up a live collection for one document. Honors the
 * FrappeProvider's fixture provider so stories/tests run offline.
 */
import { DbModule, HttpClient } from '@repo/frappe';
import type { AuthConfig } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeConfig } from '@repo/frappe-ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorkspaceDoc } from './types';

// One REST client per connection — screens sharing a bench share it.
const dbCache = new Map<string, DbModule>();

const getDb = (baseURL: string, auth: FrappeConfig['auth']): DbModule => {
  const key = `${baseURL}:${auth?.useToken ? 't' : ''}:${String(auth?.token ?? '')}:${auth?.type ?? ''}`;
  let db = dbCache.get(key);
  if (!db) {
    const authConfig: AuthConfig | undefined = auth
      ? {
          useToken: auth.useToken,
          token: auth.token,
          // SAFETY: FrappeProvider documents auth.type as an AuthType value ('Bearer' | 'token').
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
          type: auth.type as AuthConfig['type'],
        }
      : undefined;
    db = new DbModule(new HttpClient(baseURL, authConfig));
    dbCache.set(key, db);
  }
  return db;
};

const fetchDoc = async <TDoc>(conn: FrappeConfig | undefined, doctype: string, docName: string): Promise<TDoc> => {
  if (conn?.fixtures) {
    const fixtureDoc = await conn.fixtures.getDoc(doctype, docName);
    if (!fixtureDoc) {
      throw new Error(`${doctype} ${docName} not found`);
    }
    // SAFETY: the caller names the doctype, so TDoc is that doctype's document shape.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see the SAFETY note above
    return fixtureDoc as unknown as TDoc;
  }
  if (conn?.baseURL !== undefined && conn.baseURL !== '') {
    // SAFETY: the caller names the doctype, so TDoc is that doctype's document shape.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see the SAFETY note above
    return (await getDb(conn.baseURL, conn.auth).getDoc(doctype, docName)) as unknown as TDoc;
  }
  throw new Error('useFrappeDoc requires a FrappeProvider with baseURL or fixtures');
};

export interface UseFrappeDocResult<TDoc> {
  doc: TDoc | undefined;
  /** First load in flight — render a skeleton. */
  isLoading: boolean;
  error: Error | undefined;
  /** True when the server rejected the read (HTTP 403). */
  isPermissionError: boolean;
  refresh: () => void;
}

/** Fetch one document via REST (or the provider's fixtures when present). */
export const useFrappeDoc = <TDoc extends { name: string; doctype: string }>(
  doctype: string,
  name: string | undefined,
): UseFrappeDocResult<TDoc> => {
  const config = useFrappeConfig();
  const [doc, setDoc] = useState<TDoc | undefined>();
  const [isLoading, setIsLoading] = useState(name !== undefined && name !== '');
  const [error, setError] = useState<Error | undefined>();
  const fetchSeq = useRef(0);

  const configRef = useRef(config);
  // oxlint-disable-next-line react/refs -- latest-value ref sync; read only inside the async fetch
  configRef.current = config;

  const runFetch = useCallback(
    async (docName: string) => {
      const conn = configRef.current;
      fetchSeq.current += 1;
      const seq = fetchSeq.current;
      setIsLoading(true);
      setError(undefined);
      let result: TDoc | undefined;
      let failure: Error | undefined;
      try {
        result = await fetchDoc<TDoc>(conn, doctype, docName);
      } catch (fetchError) {
        failure = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      }
      if (seq !== fetchSeq.current) {
        return;
      }
      setDoc(failure ? undefined : result);
      if (failure) {
        setError(failure);
      }
      setIsLoading(false);
      // doctype is stable per hook usage; config flows through configRef.
    },
    [doctype],
  );

  useEffect(() => {
    if (name === undefined || name === '') {
      // oxlint-disable-next-line react/set-state-in-effect -- clearing the name resets the doc; there is nothing to fetch
      setDoc(undefined);
      setIsLoading(false);
      return;
    }
    void runFetch(name);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a connection change (baseURL / fixtures) must refetch; runFetch reads it via configRef
  }, [name, runFetch, config?.baseURL, config?.fixtures]);

  const refresh = useCallback(() => {
    if (name !== undefined && name !== '') {
      void runFetch(name);
    }
  }, [name, runFetch]);

  // SAFETY: frappe client errors carry the HTTP status; a plain Error just has none.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
  const isPermissionError = (error as { status?: number } | undefined)?.status === 403;

  return { doc, isLoading, error, isPermissionError, refresh };
};

/** Fetch a Workspace doc by proper-cased name (e.g. "Home", "Users"). */
export const useWorkspaceDoc = (workspace: string): UseFrappeDocResult<WorkspaceDoc> =>
  useFrappeDoc<WorkspaceDoc>('Workspace', workspace);
