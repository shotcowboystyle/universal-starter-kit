import type { ListOptions } from './core/types';
import { FrappeApp } from './frappeApp';

/** The slice of a route loader's `Request` the server reads: its cookie header. */
export interface FrappeLoaderRequest {
  headers?: { get(name: string): string | null } | null;
}

interface LoaderTarget {
  /** Bench address the server dials (not the browser's). */
  baseURL: string;
  doctype: string;
  /**
   * The incoming request. Its cookie rides along so the server reads with
   * the visitor's session. Absent (a loader run in the browser), nothing is
   * fetched: the live collection reads instead.
   */
  request?: FrappeLoaderRequest | null;
}

export type LoadDocListOptions = LoaderTarget & Pick<ListOptions, 'fields' | 'filters' | 'orderBy' | 'limit'>;

export interface LoadDocOptions extends LoaderTarget {
  name: string;
}

function serverApp(baseURL: string, request: FrappeLoaderRequest): FrappeApp {
  const cookie = request.headers?.get('cookie') ?? undefined;
  return new FrappeApp(baseURL, cookie ? { cookie } : {});
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

/**
 * Rows for a server-rendered list, read with the query the page's live
 * collection will use: hand both the same fields, filters, order and limit,
 * or the collection's first sync replaces the rendered page with a
 * different one (a 20-row default page shrank a 21-row list, MPO-322).
 * A failed read renders an empty page rather than failing the route.
 */
export async function loadDocList<TDoc extends { name: string; doctype: string }>({
  baseURL,
  doctype,
  request,
  ...query
}: LoadDocListOptions): Promise<TDoc[]> {
  if (!request) {
    return [];
  }
  try {
    const rows = await serverApp(baseURL, request).db().getDocList<TDoc>(doctype, query);
    return rows.map((row) => ({ ...row, doctype }) as TDoc);
  } catch (error) {
    console.error(`[loadDocList] ${doctype}:`, error);
    return [];
  }
}

/** One document, child tables included, for a server-rendered detail page; null when missing. */
export async function loadDoc<TDoc extends { name: string; doctype: string }>({
  baseURL,
  doctype,
  name,
  request,
}: LoadDocOptions): Promise<TDoc | null> {
  if (!request || !name) {
    return null;
  }
  try {
    const doc = await serverApp(baseURL, request).db().getDoc<TDoc>(doctype, name);
    return doc ? ({ ...doc, doctype } as TDoc) : null;
  } catch (error) {
    if (!isNotFound(error)) {
      console.error(`[loadDoc] ${doctype}/${name}:`, error);
    }
    return null;
  }
}

function runtimeEnv(): Record<string, string | undefined> {
  return typeof process === 'undefined' ? {} : process.env;
}

/**
 * The bench address a server loader dials: FRAPPE_BASE_URL, else the dev
 * bench on FRAPPE_PORT. Read from the env object on each call, never as a
 * static `process.env.<KEY>`: the app build defines that expression for
 * every key in its .env, which baked the build machine's dev bench into the
 * deployed server bundle. 127.0.0.1, not localhost: the bench binds IPv4
 * only, and a dual-stack lookup can land on another daemon holding ::1.
 */
export function serverFrappeBaseURL(env: Record<string, string | undefined> = runtimeEnv()): string {
  if (env.FRAPPE_BASE_URL) {
    return env.FRAPPE_BASE_URL;
  }
  return `http://127.0.0.1:${env.FRAPPE_PORT ?? '8000'}`;
}

/** What a route loader receives: the route's params and the incoming request. */
export interface FrappeRouteLoaderProps {
  params?: Record<string, string | undefined>;
  request?: FrappeLoaderRequest | null;
}

/**
 * A list page's route loader: the rows its list reads, with the list's own
 * query, so the server page and the live page match.
 */
export function frappeListLoader<TDoc extends { name: string; doctype: string }>(
  doctype: string,
  query: Pick<ListOptions, 'fields' | 'filters' | 'orderBy' | 'limit'> = {},
) {
  return async (props?: FrappeRouteLoaderProps): Promise<{ rows: TDoc[] }> => ({
    rows: await loadDocList<TDoc>({
      baseURL: serverFrappeBaseURL(),
      doctype,
      request: props?.request,
      ...query,
    }),
  });
}

/** A record page's route loader: the record its route param names, or null. */
export function frappeDocLoader<TDoc extends { name: string; doctype: string }>(doctype: string, param = 'id') {
  return async (props?: FrappeRouteLoaderProps): Promise<{ doc: TDoc | null }> => ({
    doc: await loadDoc<TDoc>({
      baseURL: serverFrappeBaseURL(),
      doctype,
      name: props?.params?.[param] ?? '',
      request: props?.request,
    }),
  });
}
