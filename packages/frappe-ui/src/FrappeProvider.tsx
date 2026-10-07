import type { FixtureProvider, UseFrappeCollectionConfig } from '@repo/frappe';
import React, { createContext, use, useContext } from 'react';

import { FrappeNavigationProvider } from './frappeNavigation';
import type { FrappeNavigation } from './frappeNavigation';

/**
 * Configuration for the Frappe connection.
 *
 * @category Types
 */
export interface FrappeConfig {
  /**
   * The base URL of the Frappe server. Required unless `fixtures` is set:
   * a fixture corpus answers every read locally, so a fixtures-only app has
   * no bench to name and nothing dials one.
   */
  baseURL?: string;
  /** False uses HTTP collections without a realtime transport. Defaults to true. */
  realtime?: boolean;
  /**
   * Override the port used for the Socket.IO realtime connection.
   *
   * In development the Frappe SocketIO server typically runs on a separate
   * port (e.g. `FRAPPE_SOCKETIO_PORT=9000`) while the HTTP API is on 8000.
   * Set this so the client connects to the right place without a reverse proxy.
   *
   * When omitted the port from `baseURL` is used, which is correct behind a
   * production reverse proxy that routes `/socket.io` to the SocketIO backend.
   */
  socketPort?: number;
  /**
   * Dial the realtime socket at this origin instead of deriving it from
   * `baseURL` + `socketPort` — for dev servers that proxy `/socket.io` on
   * their own origin, making the handshake same-origin (e.g. the page origin
   * in web dev). Wins over `socketPort`. Omit in production.
   */
  socketBaseURL?: string;
  /**
   * Frappe site name — the Socket.IO namespace realtime must join. Set it
   * whenever the `baseURL` hostname is not the bench site name (e.g. baseURL
   * http://127.0.0.1:8000 serving site "localhost").
   */
  siteName?: string;
  /** Authentication configuration */
  auth?: {
    /** Whether to use token-based authentication */
    useToken?: boolean;
    /** The authentication token, or a (possibly async) getter for lazy/rotating tokens */
    token?: string | (() => string | Promise<string>);
    /** The authentication type */
    type?: string;
  };
  /** Sync options for the live data engine */
  syncOptions?: UseFrappeCollectionConfig['syncOptions'];
  /**
   * Extra Socket.IO client options for the realtime connection — e.g.
   * `{ transports: ["polling", "websocket"] }` behind dev proxies that
   * can't forward WebSocket upgrades.
   */
  socketOptions?: UseFrappeCollectionConfig['socketOptions'];
  /**
   * Fixture corpus every read and write is served from. Set it without a
   * `baseURL` to run the whole app off fixtures with no server.
   */
  fixtures?: FixtureProvider;
}

const FrappeContext = createContext<FrappeConfig | undefined>(undefined);

/**
 * Props for the FrappeProvider component.
 *
 * @category Types
 */
export interface FrappeProviderProps {
  /** Child components */
  children: React.ReactNode;
  /** The base URL of the Frappe server. Required unless `fixtures` is set. */
  baseURL?: string;
  /** False uses HTTP collections without a realtime transport. Defaults to true. */
  realtime?: boolean;
  /** Override port for Socket.IO realtime connection (e.g. 9000 in dev). */
  socketPort?: number;
  /** Dial the realtime socket at this origin (same-origin dev proxy). */
  socketBaseURL?: string;
  /** Frappe site name — the Socket.IO namespace realtime must join. */
  siteName?: string;
  /** Authentication configuration */
  auth?: {
    /** Whether to use token-based authentication */
    useToken?: boolean;
    /** The authentication token, or a (possibly async) getter for lazy/rotating tokens */
    token?: string | (() => string | Promise<string>);
    /** The authentication type */
    type?: string;
  };
  /** Sync options for the live data engine */
  syncOptions?: UseFrappeCollectionConfig['syncOptions'];
  /** Extra Socket.IO client options for the realtime connection. */
  socketOptions?: UseFrappeCollectionConfig['socketOptions'];
  /**
   * Fixture corpus every read and write is served from. Set it without a
   * `baseURL` to run the whole app off fixtures with no server.
   */
  fixtures?: FixtureProvider;
  /**
   * The host router. Given, a `FrappeListView` or `FrappeForm` with a
   * `route` reads its record from the path and navigates between the
   * doctype's list, record, edit and new pages on its own.
   */
  navigation?: FrappeNavigation;
}

/**
 * Provider component for Frappe configuration.
 *
 * Wraps your app to provide Frappe configuration to all child components.
 * Components using FrappeTable, useFrappeConfig, or useFrappeContext will
 * read their configuration from this provider.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <FrappeProvider
 *       baseURL="https://mysite.frappe.cloud"
 *       auth={{ useToken: true, token: 'api-key-123' }}
 *     >
 *       <MyApp />
 *     </FrappeProvider>
 *   );
 * }
 * ```
 *
 * @category Components
 */
export function FrappeProvider({
  children,
  baseURL,
  realtime,
  socketPort,
  socketBaseURL,
  siteName,
  auth,
  syncOptions,
  socketOptions,
  fixtures,
  navigation,
}: FrappeProviderProps) {
  const value = React.useMemo(
    () => ({
      baseURL,
      realtime,
      socketPort,
      socketBaseURL,
      siteName,
      auth,
      syncOptions,
      socketOptions,
      fixtures,
    }),
    [baseURL, realtime, socketPort, socketBaseURL, siteName, auth, syncOptions, socketOptions, fixtures],
  );

  return (
    <FrappeContext.Provider value={value}>
      <FrappeNavigationProvider navigation={navigation}>{children}</FrappeNavigationProvider>
    </FrappeContext.Provider>
  );
}

/**
 * Hook to read the FrappeConfig from context.
 * This uses the traditional useContext() hook.
 *
 * @returns The FrappeConfig if a FrappeProvider is present, undefined otherwise
 */
export function useFrappeConfig(): FrappeConfig | undefined {
  return useContext(FrappeContext);
}

/**
 * React 19 use() hook wrapper for reading FrappeContext.
 *
 * Unlike useFrappeConfig(), this can be called conditionally - after if statements,
 * early returns, or inside loops. This is a key benefit of React 19's use() hook.
 *
 * @example
 * ```tsx
 * function MyComponent({ disabled }: { disabled: boolean }) {
 *   // Early return before context read - not possible with useContext!
 *   if (disabled) {
 *     return <DisabledView />;
 *   }
 *
 *   // With use(), we can read context after conditional returns
 *   const config = useFrappeContext();
 *   if (!config) {
 *     return <NoConfigView />;
 *   }
 *
 *   return <EnabledView config={config} />;
 * }
 * ```
 *
 * @returns The FrappeConfig if a FrappeProvider is present, undefined otherwise
 */
export function useFrappeContext(): FrappeConfig | undefined {
  return use(FrappeContext);
}
