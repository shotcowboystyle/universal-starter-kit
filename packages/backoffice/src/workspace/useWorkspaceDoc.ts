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

function getDb(baseURL: string, auth: FrappeConfig['auth']): DbModule {
  const key = `${baseURL}:${auth?.useToken ? 't' : ''}:${auth?.token ?? ''}:${auth?.type ?? ''}`;
  let db = dbCache.get(key);
  if (!db) {
    const authConfig: AuthConfig | undefined = auth
      ? {
          useToken: auth.useToken,
          token: auth.token,
          type: auth.type as AuthConfig['type'],
        }
      : undefined;
    db = new DbModule(new HttpClient(baseURL, authConfig));
    dbCache.set(key, db);
  }
  return db;
}

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
export function useFrappeDoc<TDoc extends { name: string; doctype: string }>(
  doctype: string,
  name: string | undefined,
): UseFrappeDocResult<TDoc> {
  const config = useFrappeConfig();
  const [doc, setDoc] = useState<TDoc | undefined>();
  const [isLoading, setIsLoading] = useState(!!name);
  const [error, setError] = useState<Error | undefined>();
  const fetchSeq = useRef(0);

  const configRef = useRef(config);
  configRef.current = config;

  const runFetch = useCallback(
    async (docName: string) => {
      const conn = configRef.current;
      const seq = ++fetchSeq.current;
      setIsLoading(true);
      setError(undefined);
      try {
        let result: TDoc | undefined;
        if (conn?.fixtures) {
          const fixtureDoc = await conn.fixtures.getDoc(doctype, docName);
          if (!fixtureDoc) {
            throw new Error(`${doctype} ${docName} not found`);
          }
          result = fixtureDoc as unknown as TDoc;
        } else if (conn?.baseURL) {
          result = (await getDb(conn.baseURL, conn.auth).getDoc(doctype, docName)) as unknown as TDoc;
        } else {
          throw new Error('useFrappeDoc requires a FrappeProvider with baseURL or fixtures');
        }
        if (seq !== fetchSeq.current) {
          return;
        }
        setDoc(result);
      } catch (error) {
        if (seq !== fetchSeq.current) {
          return;
        }
        setDoc(undefined);
        setError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        if (seq === fetchSeq.current) {
          setIsLoading(false);
        }
      }
      // doctype is stable per hook usage; config flows through configRef.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [doctype],
  );

  useEffect(() => {
    if (!name) {
      setDoc(undefined);
      setIsLoading(false);
      return;
    }
    void runFetch(name);
  }, [name, runFetch, config?.baseURL, config?.fixtures]);

  const refresh = useCallback(() => {
    if (name) {
      void runFetch(name);
    }
  }, [name, runFetch]);

  const isPermissionError = (error as { status?: number } | undefined)?.status === 403;

  return { doc, isLoading, error, isPermissionError, refresh };
}

/** Fetch a Workspace doc by proper-cased name (e.g. "Home", "Users"). */
export function useWorkspaceDoc(workspace: string): UseFrappeDocResult<WorkspaceDoc> {
  return useFrappeDoc<WorkspaceDoc>('Workspace', workspace);
}
