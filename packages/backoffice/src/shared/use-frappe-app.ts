import { FrappeApp } from '@repo/frappe';
import type { AuthConfig } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import { useMemo } from 'react';

const appCache = new Map<string, FrappeApp>();

/** Host auth `type` strings map onto frappe's two auth schemes (anything else set means token auth). */
const authTypeName = (type: string | undefined): 'Bearer' | 'token' | undefined => {
  if (type === 'Bearer') {
    return 'Bearer';
  }
  return type === undefined || type === '' ? undefined : 'token';
};

/**
 * Memoized FrappeApp built from the ambient FrappeProvider config (mounted
 * by BackofficeProvider). Use `app.call()` for desk RPCs, `app.db()` for
 * CRUD, `app.file()` for uploads. Prefer Frappe* components /
 * useFrappeCollection where possible — reach for this only when no component
 * covers the API. Returns undefined outside a provider.
 */
export const useFrappeApp = (): FrappeApp | undefined => {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  // Without socketPort the realtime module dials `${baseURL}/socket.io`
  // (:8000 in dev) instead of frappe's socketio server (:9000), producing a
  // CORS-failed handshake on every mount.
  const socketPort = config?.socketPort;
  // socketBaseURL/siteName ride along too: the same-origin dev-proxy socket
  // (and the namespace it must join) apply to FrappeApp's realtime exactly
  // like the collection engine's.
  const socketBaseURL = config?.socketBaseURL;
  const siteName = config?.siteName;
  const useToken = config?.auth?.useToken;
  const token = config?.auth?.token;
  const type = config?.auth?.type;
  const writeStrategy = config?.syncOptions?.writeStrategy;
  return useMemo(() => {
    if (baseURL === undefined || baseURL === '') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the memo returns an app on other paths; a bare return trips consistent-return
      return undefined;
    }
    // oxlint-disable-next-line typescript/restrict-template-expressions -- a token getter keys by its source text; its identity is not stable across renders
    const key = `${baseURL}|${socketPort ?? ''}|${socketBaseURL ?? ''}|${siteName ?? ''}|${useToken ? 't' : ''}|${token ?? ''}|${type ?? ''}|${writeStrategy ?? ''}`;
    let app = appCache.get(key);
    if (!app) {
      const hasRealtimeOptions = Boolean(socketPort) || Boolean(socketBaseURL) || Boolean(siteName);
      const realtimeOptions = hasRealtimeOptions ? { socketPort, socketBaseURL, siteName } : undefined;
      app = new FrappeApp(baseURL, {
        useToken,
        token,
        // SAFETY: AuthConfig['type'] is a string enum whose members are exactly 'Bearer' and 'token'; @repo/frappe exports only its type
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the enum value object is not exported, so the literal must be asserted
        type: authTypeName(type) as AuthConfig['type'],
        realtimeOptions,
        frappeLive: writeStrategy ? { writeStrategy } : undefined,
      });
      appCache.set(key, app);
    }
    return app;
  }, [baseURL, socketPort, socketBaseURL, siteName, useToken, token, type, writeStrategy]);
};
