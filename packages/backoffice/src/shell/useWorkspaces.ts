/**
 * Live Workspace data for the backoffice shell.
 *
 * Reads the "Workspace" doctype through the live client (realtime updates,
 * fixture support) and derives the desk sidebar structure: the session
 * user's private workspaces on top, then public workspaces ordered by
 * sequence_id and nested via parent_page.
 *
 * Connection comes exclusively from the ambient FrappeProvider (mounted by
 * BackofficeProvider) — without one the hook settles on an empty, non-loading
 * result so isolated mounts stay deterministic.
 */
import { HttpClient, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeConfig } from '@repo/frappe-ui';
import { useEffect, useMemo, useState } from 'react';

export interface WorkspaceDoc {
  name: string;
  doctype: string;
  title?: string;
  icon?: string;
  parent_page?: string;
  public?: 0 | 1;
  for_user?: string;
  sequence_id?: number;
  module?: string;
  is_hidden?: 0 | 1;
}

const WORKSPACE_FIELDS = [
  'name',
  'title',
  'icon',
  'parent_page',
  'public',
  'for_user',
  'sequence_id',
  'module',
  'is_hidden',
] as const;

// ---------------------------------------------------------------------------
// Session user (module cache — one fetch per session)
// ---------------------------------------------------------------------------

const sessionUserCache = new Map<string, Promise<string | undefined>>();

async function fetchSessionUser(baseURL: string, auth?: FrappeConfig['auth']): Promise<string | undefined> {
  const client = new HttpClient(baseURL, auth as AuthConfig | undefined);
  const res = await client.get<{ message?: string }>('/api/method/frappe.auth.get_logged_user');
  const user = res.payload?.message;
  return user && user !== 'Guest' ? user : undefined;
}

/**
 * The frappe session user ("Administrator", …), or undefined while loading,
 * for Guest sessions, in fixture mode, without a provider, or when the
 * endpoint is unreachable.
 */
export function useSessionUser(): string | undefined {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const auth = config?.auth;
  const fixtures = config?.fixtures;
  const [user, setUser] = useState<string | undefined>();

  useEffect(() => {
    // Fixture mode has no session endpoint; keep the private section off.
    // No provider config → no bench to ask.
    if (fixtures || !baseURL) {
      return;
    }
    let cancelled = false;
    let promise = sessionUserCache.get(baseURL);
    if (!promise) {
      promise = fetchSessionUser(baseURL, auth).catch(() => {
        sessionUserCache.delete(baseURL);
        return undefined;
      });
      sessionUserCache.set(baseURL, promise);
    }
    promise.then((value) => {
      if (!cancelled) {
        setUser(value);
      }
    });
    return () => {
      cancelled = true;
    };
    // `auth` is session-stable; the cache is keyed by baseURL.
    // oxlint-disable-next-line exhaustive-deps
  }, [baseURL, fixtures]);

  return user;
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export interface WorkspacesResult {
  /** All visible workspaces, sorted by sequence_id. */
  workspaces: WorkspaceDoc[];
  /** Session user's private workspaces (desk shows these on top). */
  privateWorkspaces: WorkspaceDoc[];
  /** Public root workspaces (no parent_page), ordered by sequence_id. */
  publicRoots: WorkspaceDoc[];
  /** Children of a public workspace, keyed by parent name. */
  childrenByParent: Map<string, WorkspaceDoc[]>;
  /** True until the first snapshot arrives (always true server-side). */
  isLoading: boolean;
  /** Session user, once known (never set in fixture mode). */
  sessionUser?: string;
}

function bySequence(a: WorkspaceDoc, b: WorkspaceDoc): number {
  const seqA = Number(a.sequence_id ?? 0);
  const seqB = Number(b.sequence_id ?? 0);
  if (seqA !== seqB) {
    return seqA - seqB;
  }
  return (a.title ?? a.name).localeCompare(b.title ?? b.name);
}

export function useWorkspaces(): WorkspacesResult {
  const config = useFrappeConfig();
  const sessionUser = useSessionUser();

  // Stable connection config: a fresh object identity per render would
  // re-run the collection hook's internal effects (DeskSidebar precedent).
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

  const collection = useFrappeCollection<WorkspaceDoc>(connectionConfig, 'Workspace', {
    fields: WORKSPACE_FIELDS as unknown as (keyof WorkspaceDoc & string)[],
  });
  const { data: rawData, isLoading } = useLiveQuery(
    (q) => (collection ? q.from({ _workspace: collection }) : null),
    [collection],
  );

  return useMemo<WorkspacesResult>(() => {
    const all = ((rawData as WorkspaceDoc[] | undefined) ?? []).filter((w) => w.name && !w.is_hidden).sort(bySequence);

    const privateWorkspaces = sessionUser ? all.filter((w) => !w.public && w.for_user === sessionUser) : [];

    const publicWorkspaces = all.filter((w) => Boolean(w.public));
    const publicNames = new Set(publicWorkspaces.map((w) => w.name));
    const publicRoots: WorkspaceDoc[] = [];
    const childrenByParent = new Map<string, WorkspaceDoc[]>();
    for (const workspace of publicWorkspaces) {
      // Treat a dangling parent_page as a root so the workspace never vanishes.
      if (workspace.parent_page && publicNames.has(workspace.parent_page)) {
        const siblings = childrenByParent.get(workspace.parent_page) ?? [];
        siblings.push(workspace);
        childrenByParent.set(workspace.parent_page, siblings);
      } else {
        publicRoots.push(workspace);
      }
    }

    return {
      workspaces: all,
      privateWorkspaces,
      publicRoots,
      childrenByParent,
      // No provider config → settle empty instead of skeleting forever.
      isLoading: connectionConfig ? Boolean(isLoading) || collection === undefined : false,
      sessionUser,
    };
  }, [rawData, isLoading, collection, connectionConfig, sessionUser]);
}

/**
 * The workspace the backoffice home should land on — desk parity: the
 * user's first private workspace, else the first public workspace by
 * sequence order.
 */
export function useDefaultWorkspace(): { workspace?: string; isLoading: boolean } {
  const { privateWorkspaces, publicRoots, isLoading } = useWorkspaces();
  const workspace = privateWorkspaces[0]?.name ?? publicRoots[0]?.name;
  return { workspace, isLoading };
}
