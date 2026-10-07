// Stable Frappe connection config derived from the FrappeProvider mounted by
// the backoffice shell (shell/BackofficeLayout). All alt-view data fetching
// (meta, kanban boards, aggregates) flows through this one shape.
import type { FixtureProvider } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import { useMemo } from 'react';

export interface ViewConnection {
  baseURL: string;
  socketPort?: number;
  /** Same-origin socket override (see FrappeConfig.socketBaseURL). */
  socketBaseURL?: string;
  /** Frappe site name — the realtime Socket.IO namespace. */
  siteName?: string;
  auth?: {
    useToken?: boolean;
    token?: string | (() => string | Promise<string>);
    type?: string;
  };
  syncOptions?: unknown;
  fixtures?: FixtureProvider;
}

export function useViewConnection(): ViewConnection | undefined {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const socketPort = config?.socketPort;
  const socketBaseURL = config?.socketBaseURL;
  const siteName = config?.siteName;
  const auth = config?.auth;
  const syncOptions = config?.syncOptions;
  const fixtures = config?.fixtures;
  return useMemo(() => {
    if (!baseURL) {
      return;
    }
    return { baseURL, socketPort, socketBaseURL, siteName, auth, syncOptions, fixtures };
  }, [baseURL, socketPort, socketBaseURL, siteName, auth, syncOptions, fixtures]);
}
