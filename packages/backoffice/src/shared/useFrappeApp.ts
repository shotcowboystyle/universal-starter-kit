import { FrappeApp } from '@repo/frappe';
import type { AuthConfig } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import { useMemo } from 'react';

const appCache = new Map<string, FrappeApp>();

/**
 * Memoized FrappeApp built from the ambient FrappeProvider config (mounted
 * by BackofficeProvider). Use `app.call()` for desk RPCs, `app.db()` for
 * CRUD, `app.file()` for uploads. Prefer Frappe* components /
 * useFrappeCollection where possible — reach for this only when no component
 * covers the API. Returns undefined outside a provider.
 */
export function useFrappeApp(): FrappeApp | undefined {
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
    if (!baseURL) {
      return;
    }
    const key = `${baseURL}|${socketPort ?? ''}|${socketBaseURL ?? ''}|${siteName ?? ''}|${useToken ? 't' : ''}|${token ?? ''}|${type ?? ''}|${writeStrategy ?? ''}`;
    let app = appCache.get(key);
    if (!app) {
      const realtimeOptions =
        socketPort || socketBaseURL || siteName ? { socketPort, socketBaseURL, siteName } : undefined;
      app = new FrappeApp(baseURL, {
        useToken,
        token,
        type: (type === 'Bearer' ? 'Bearer' : type ? 'token' : undefined) as AuthConfig['type'],
        realtimeOptions,
        frappeLive: writeStrategy ? { writeStrategy } : undefined,
      });
      appCache.set(key, app);
    }
    return app;
  }, [baseURL, socketPort, socketBaseURL, siteName, useToken, token, type, writeStrategy]);
}
