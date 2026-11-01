/**
 * Storybook story target for Frappe-backed stories.
 *
 * The Storybook dev server (apps/storybook/.storybook/main.ts) probes the
 * bench selected by `STORYBOOK_FRAPPE_URL` (default: the local dev bench at
 * http://localhost:8000) and defines the result as
 * `process.env.STORYBOOK_FRAPPE_LIVE`. When the bench is reachable it
 * also proxies `/api` and `/socket.io` same-origin (the bench sends no CORS
 * headers) and injects the API token server-side, so no credentials ever
 * reach the preview bundle.
 *
 * Stories that want the live path render through `FrappeStoryProvider` with
 * a fixtures fallback: live bench when reachable, fixtures otherwise —
 * Storybook never hard-fails when the bench is down.
 */
import type { FixtureProvider } from '@repo/frappe';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { FrappeProvider } from './FrappeProvider';

interface StorybookFrappeEnv {
  STORYBOOK_FRAPPE_LIVE?: string;
  STORYBOOK_FRAPPE_URL?: string;
}

/**
 * The two keys, read as STATIC `process.env.<KEY>` member expressions.
 *
 * This used to read `import.meta.env`. MPO-192 ruled that out: two bundles
 * execute mpo as a CLASSIC script — the vxrn/rolldown native bundle for
 * Hermes, and any Metro bundle for platform=web, which is what an Expo DOM
 * component (`'use dom'`) is — and in a classic script `import.meta` is a
 * PARSE-time SyntaxError, so the try/catch below never gets to run and the
 * whole module fails to parse.
 *
 * `process.env.<KEY>` is the spelling every bundler on the way to a browser
 * inlines, and it is exactly what public/platform/src/config/runtimeConfig.ts
 * settled on. apps/storybook/.storybook/main.ts defines both keys for the
 * preview bundle (Storybook's own `env` preset only defines the
 * `import.meta.env.*` spelling, so the define is what carries these across).
 * A dynamic `env[key]` read would never be inlined. Where nothing defined the
 * keys and `process` does not exist, the reads throw and the catch answers
 * with the fixtures fallback.
 */
const sbEnv: StorybookFrappeEnv = (() => {
  try {
    return {
      STORYBOOK_FRAPPE_LIVE: process.env.STORYBOOK_FRAPPE_LIVE,
      STORYBOOK_FRAPPE_URL: process.env.STORYBOOK_FRAPPE_URL,
    };
  } catch {
    return {};
  }
})();

/** True when the Storybook dev server verified the bench is reachable. */
export const frappeStoriesLive = sbEnv.STORYBOOK_FRAPPE_LIVE === '1';

/**
 * Base URL Frappe stories should target.
 *
 * Live mode uses the page origin so requests flow through the Storybook dev
 * server's `/api` + `/socket.io` proxy (same-origin, auth injected
 * server-side). When not live the placeholder URL is inert — fixture-backed
 * stories never fetch it.
 */
// Presence check on `location`, not just `window` — Hermes (native
// storybook-expo) defines a global `window` alias with no DOM, so a bare
// `typeof window` guard would still crash module init on `.origin`.
const pageOrigin: string | undefined =
  typeof window !== 'undefined' && window.location !== undefined ? window.location.origin : undefined;

const hasPageOrigin = pageOrigin !== undefined && pageOrigin !== '';

export const frappeStoryBaseUrl: string =
  frappeStoriesLive && hasPageOrigin ? pageOrigin : (sbEnv.STORYBOOK_FRAPPE_URL ?? 'https://demo.frappe.cloud');

export interface FrappeStoryProviderProps {
  children: ReactNode;
  /** Fallback data used when the bench is not reachable (or in static builds). */
  fixtures?: FixtureProvider;
}

/**
 * FrappeProvider wrapper for stories that exercise the live data path.
 * Targets the local bench through the dev-server proxy when it is up,
 * otherwise falls back to the provided fixtures.
 */
/**
 * The Storybook dev server proxies `/socket.io` over plain HTTP middleware and
 * cannot forward WebSocket upgrades, so a websocket-first handshake never
 * connects. Long-polling carries the same realtime events through the proxy
 * (with the server-side auth header), so live stories handshake over polling.
 */
const liveSocketOptions = { transports: ['polling', 'websocket'] };

export const FrappeStoryProvider = ({ children, fixtures }: FrappeStoryProviderProps) => {
  if (frappeStoriesLive) {
    return (
      <FrappeProvider
        baseURL={frappeStoryBaseUrl}
        socketOptions={liveSocketOptions}>
        {children}
      </FrappeProvider>
    );
  }
  return (
    <FrappeProvider
      baseURL={frappeStoryBaseUrl}
      fixtures={fixtures}>
      {children}
    </FrappeProvider>
  );
};

/**
 * Preferred name for the live-story to-do document. Fixture stories ship a
 * document under this name; the live bench usually cannot (the doctype
 * autonames by hash and rejects rename), so {@link LiveToDoGate} resolves a
 * real row when live.
 */
export const LIVE_TODO_NAME = 'TODO-LIVE-001';

let liveToDoPromise: Promise<string> | undefined;

/** The slices of the bench's JSON answers the lookup reads; all are untrusted. */
interface ListBody {
  data?: { name?: unknown }[];
}
interface MessageBody {
  message?: unknown;
}
interface CreatedBody {
  data?: { name?: string };
}
interface ToDoSeed {
  description: string;
  status: string;
  priority: string;
  allocated_to?: string;
}

const lookupOrSeedLiveToDo = async (): Promise<string> => {
  const base = frappeStoryBaseUrl.replace(/\/$/u, '');
  const preferred = await fetch(`${base}/api/resource/ToDo/${encodeURIComponent(LIVE_TODO_NAME)}`);
  if (preferred.ok) {
    return LIVE_TODO_NAME;
  }

  const list = await fetch(`${base}/api/resource/ToDo?limit_page_length=1&fields=${encodeURIComponent('["name"]')}`);
  if (list.ok) {
    // SAFETY: ListBody leaves the row name unknown, and it is checked below before use
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const listBody = (await list.json()) as ListBody | null;
    const row = listBody?.data?.[0]?.name;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- checks the bench's untyped JSON before trusting the row name
    if (typeof row === 'string' && row !== '') {
      return row;
    }
  }

  const whoRes = await fetch(`${base}/api/method/frappe.auth.get_logged_user`);
  // SAFETY: MessageBody leaves the message unknown, and it is checked below before use
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const whoBody = whoRes.ok ? ((await whoRes.json()) as MessageBody | null) : null;
  const me = whoBody?.message;
  const seed: ToDoSeed = { description: 'MPO live-story fixture ToDo', status: 'Open', priority: 'Medium' };
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- checks the bench's untyped JSON before trusting the session user
  if (typeof me === 'string' && me !== '' && me !== 'Guest') {
    seed.allocated_to = me;
  }
  const created = await fetch(`${base}/api/resource/ToDo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(seed),
  });
  if (!created.ok) {
    throw new Error(`Could not seed a ToDo on this bench (HTTP ${created.status})`);
  }
  // SAFETY: a successful insert answers `{ data: doc }`; an absent or empty name is rejected below
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const createdBody = (await created.json()) as CreatedBody | null;
  const hashName = createdBody?.data?.name;
  if (hashName === undefined || hashName === '') {
    throw new Error('Bench created a ToDo without a name');
  }
  const renamed = await fetch(`${base}/api/method/frappe.client.rename_doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doctype: 'ToDo',
      old_name: hashName,
      new_name: LIVE_TODO_NAME,
    }),
  });
  return renamed.ok ? LIVE_TODO_NAME : hashName;
};

/** The shared lookup, started once per page load and retried after a failure. */
const liveToDo = async (): Promise<string> => {
  liveToDoPromise ??= lookupOrSeedLiveToDo();
  return await liveToDoPromise;
};

/**
 * Resolves the to-do document the live form / sidebar / liked-by stories open.
 *
 * Offline (fixtures) → the preferred name. Live + explicit `name` arg → that
 * name (harnesses pass a real doc). Live with no arg → GET the preferred name,
 * else the first readable to-do, else create one (rename to the preferred name
 * is best-effort: the doctype often forbids rename).
 */
export const LiveToDoGate = ({ name, children }: { name?: string; children: (resolvedName: string) => ReactNode }) => {
  const requested = name?.trim();
  const hasRequested = requested !== undefined && requested !== '';
  // Only a live bench with no `name` arg has to look a document up.
  const needsLookup = !hasRequested && frappeStoriesLive;
  const [found, setFound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // oxlint-disable-next-line react-doctor/no-fetch-in-effect -- story-only gate: the module-level promise dedupes the lookup and `cancelled` drops late answers
  useEffect(() => {
    if (!needsLookup) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    const resolve = async () => {
      try {
        const value = await liveToDo();
        if (!cancelled) {
          setFound(value);
        }
      } catch (lookupError) {
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an unset cache slot is `undefined` by its type; the next mount retries
        liveToDoPromise = undefined;
        if (!cancelled) {
          setError(lookupError instanceof Error ? lookupError.message : String(lookupError));
        }
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [needsLookup]);

  if (hasRequested) {
    return <>{children(requested)}</>;
  }
  if (!frappeStoriesLive) {
    return <>{children(LIVE_TODO_NAME)}</>;
  }
  if (error !== null && error !== '') {
    return <div>{error}</div>;
  }
  if (found === null || found === '') {
    return <div>Resolving live ToDo…</div>;
  }
  return <>{children(found)}</>;
};
