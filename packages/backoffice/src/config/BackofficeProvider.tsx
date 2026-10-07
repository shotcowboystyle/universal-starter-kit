/**
 * BackofficeProvider — the single configuration surface for embedding the
 * backoffice in a host app.
 *
 * It composes @repo/frappe-ui's FrappeProvider internally (the
 * `frappe` prop), publishes the navigation seam + capability flags + slots +
 * event bus through BackofficeConfigContext (consumed by every backoffice
 * surface), registers the package's "backoffice" i18n namespace, and scopes
 * host field overrides to this subtree via FieldOverridesProvider (never the
 * module-global registry — GL-4).
 *
 * Surfaces render without a provider too (stories/tests): the context
 * default is a fully-enabled config with an inert navigator.
 */
import { FieldOverridesProvider, FrappeProvider } from '@repo/frappe-ui';
import type { FieldRenderProps, FrappeProviderProps } from '@repo/frappe-ui';
import type { i18n as I18nInstance } from 'i18next';
import type { ComponentType, ReactNode } from 'react';
import React, { createContext, useContext, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { registerBackofficeTranslations } from '../i18n';
import { createNoopNavigator } from '../navigation/navigator';
import type { BackofficeLocation, BackofficeNavigator } from '../navigation/navigator';
import { BACKOFFICE_BASE, createBackofficePaths } from '../navigation/paths';
import type { BackofficePaths } from '../navigation/paths';

import { isDoctypeAllowed, resolveCapabilities } from './capabilities';
import type { BackofficeCapabilities, BackofficeDoctypeScope, ResolvedBackofficeCapabilities } from './capabilities';
import type { BackofficeEvent, BackofficeEventHandler } from './events';
import type { BackofficeSlots } from './slots';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Frappe connection config — fed into frappe-ui's FrappeProvider. */
export interface BackofficeFrappeConfig {
  /** Base URL of the Frappe server, e.g. "https://mysite.frappe.cloud". */
  baseURL: string;
  /** Override port for the Socket.IO realtime connection (e.g. 9000 in dev). */
  socketPort?: number;
  /**
   * Dial the realtime socket at this origin instead of deriving it from
   * `baseURL` + `socketPort` — for dev servers that proxy `/socket.io` on
   * their own origin, making the handshake same-origin (e.g. the page
   * origin in web dev). Wins over `socketPort`. Omit in production.
   */
  socketBaseURL?: string;
  /**
   * Frappe site name — the Socket.IO namespace realtime must join. Set it
   * whenever the `baseURL` hostname is not the bench site name (e.g.
   * baseURL http://127.0.0.1:8000 serving site "localhost").
   */
  siteName?: string;
  /** Authentication configuration (token auth for cross-origin/native hosts). */
  auth?: FrappeProviderProps['auth'];
  /** Sync options for the live data engine (persistKey, cdcInterval, …). */
  syncOptions?: FrappeProviderProps['syncOptions'];
  /** Extra Socket.IO client options for the realtime connection. */
  socketOptions?: FrappeProviderProps['socketOptions'];
  /** Fixture provider (stories/tests — no network). */
  fixtures?: FrappeProviderProps['fixtures'];
}

/** Host color-scheme adapter (drives the user menu's "Toggle Theme"). */
export interface BackofficeAppearance {
  /** Current scheme value. */
  scheme: 'light' | 'dark' | 'system' | (string & {});
  /** Set the scheme. */
  setScheme: (scheme: 'light' | 'dark' | 'system') => void;
}

/** Result contract of a host navigation blocker (one's useBlocker shape). */
export interface BackofficeNavigationBlocker {
  blocked: boolean;
  proceed: () => void;
  reset: () => void;
}

/**
 * Router-integration hooks the navigator contract cannot express. Each
 * entry MUST be a referentially stable hook (rules of hooks — the package
 * calls it unconditionally on the surfaces that need it).
 */
export interface BackofficeIntegrations {
  /**
   * Block history-pop navigations (browser back/forward, native back
   * gesture) while `shouldBlock` is true — the form's dirty guard. The
   * one-adapter exports `useOneNavigationBlocker`; hosts without a blocker
   * simply omit this (in-app navigations are still guarded).
   */
  useNavigationBlocker?: (shouldBlock: boolean) => BackofficeNavigationBlocker;
}

/** Host-injected custom action (form toolbars, list toolbars). */
export interface BackofficeActionContext {
  doctype: string;
  /** Document name (form actions; undefined for unsaved docs). */
  name?: string;
  /** Selected row names (list bulk actions). */
  selection?: readonly string[];
}

export interface BackofficeAction {
  id: string;
  label: string;
  /**
   * Restrict the action to specific doctypes (per-doctype registry). Omit
   * for every doctype. Example: `{ id: "reset-password", label: "Reset
   * Password", doctypes: ["User"], onPress: … }`.
   */
  doctypes?: readonly string[];
  onPress: (context: BackofficeActionContext) => void;
}

/** Registry filter: actions with a `doctypes` scope only apply to those. */
export function actionsForDoctype(
  actions: readonly BackofficeAction[] | undefined,
  doctype: string,
): BackofficeAction[] {
  return (actions ?? []).filter((action) => !action.doctypes || action.doctypes.includes(doctype));
}

export interface BackofficeActions {
  /** Extra actions on the document form toolbar. */
  form?: readonly BackofficeAction[];
  /** Extra actions on the list toolbar / bulk-actions bar. */
  list?: readonly BackofficeAction[];
}

export interface BackofficeProviderProps {
  children: ReactNode;
  /** Frappe connection — feeds FrappeProvider internally. */
  frappe: BackofficeFrappeConfig;
  /**
   * Navigation adapter. Use `useOneNavigator()` from
   * `@repo/backoffice/one-adapter` in One apps,
   * `createMemoryNavigator()` in tests/stories, or bridge your own router
   * with `ControlledNavigator`.
   */
  navigation: BackofficeNavigator;
  /** URL prefix the backoffice is mounted under. Default "/backoffice". */
  basePath?: string;
  /** Feature visibility/behavior flags. Everything defaults ON. */
  capabilities?: BackofficeCapabilities;
  /** Restrict which doctypes are reachable (awesomebar, lists, links). */
  doctypes?: BackofficeDoctypeScope;
  /**
   * Field-renderer overrides (fieldtype → component), e.g.
   * `{ Rating: MyRating }` — context-scoped to this provider, so two
   * providers with different overrides coexist on one page.
   */
  fields?: Record<string, ComponentType<FieldRenderProps>>;
  /** Host-injected custom actions (form/list toolbars). */
  actions?: BackofficeActions;
  /** Render-prop slots replacing built-in chrome. */
  slots?: BackofficeSlots;
  /** Color-scheme adapter for the user menu's "Toggle Theme". */
  appearance?: BackofficeAppearance;
  /** Router-integration hooks (navigation blocker, …). */
  integrations?: BackofficeIntegrations;
  /** Event bus — every notable backoffice action lands here. */
  onEvent?: BackofficeEventHandler;
  /**
   * i18next instance to register the "backoffice" namespace on (defaults to
   * the global singleton).
   */
  i18nInstance?: I18nInstance;
}

/** Resolved config every backoffice surface consumes. */
export interface BackofficeConfig {
  frappe?: BackofficeFrappeConfig;
  navigation: BackofficeNavigator;
  basePath: string;
  paths: BackofficePaths;
  capabilities: ResolvedBackofficeCapabilities;
  doctypes?: BackofficeDoctypeScope;
  actions: BackofficeActions;
  slots: BackofficeSlots;
  appearance?: BackofficeAppearance;
  integrations?: BackofficeIntegrations;
  /** Emit an event to the host's `onEvent` bus (no-op when unset). */
  emitEvent: (event: BackofficeEvent) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: BackofficeConfig = {
  navigation: createNoopNavigator(BACKOFFICE_BASE),
  basePath: BACKOFFICE_BASE,
  paths: createBackofficePaths(BACKOFFICE_BASE),
  capabilities: resolveCapabilities(),
  actions: {},
  slots: {},
  emitEvent: () => {},
};

const BackofficeConfigContext = createContext<BackofficeConfig>(DEFAULT_CONFIG);

/**
 * The resolved backoffice config. Outside a BackofficeProvider this returns
 * a fully-enabled default config with an inert navigator, so surfaces stay
 * mountable in isolation (stories, tests).
 */
export function useBackofficeConfig(): BackofficeConfig {
  return useContext(BackofficeConfigContext);
}

export function useBackofficeCapabilities(): ResolvedBackofficeCapabilities {
  return useBackofficeConfig().capabilities;
}

export function useBackofficeNavigator(): BackofficeNavigator {
  return useBackofficeConfig().navigation;
}

export function useBackofficePaths(): BackofficePaths {
  return useBackofficeConfig().paths;
}

export function useBackofficeSlots(): BackofficeSlots {
  return useBackofficeConfig().slots;
}

/** Current location from the navigation adapter (subscription-backed). */
export function useBackofficeLocation(): BackofficeLocation {
  const navigator = useBackofficeNavigator();
  return useSyncExternalStore(navigator.subscribe, navigator.getLocation, navigator.getLocation);
}

/** Is `doctype` reachable under the provider's doctype scope? */
export function useIsDoctypeAllowed(): (doctype: string) => boolean {
  const { doctypes } = useBackofficeConfig();
  return useMemo(() => (doctype: string) => isDoctypeAllowed(doctypes, doctype), [doctypes]);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BackofficeProvider({
  children,
  frappe,
  navigation,
  basePath = BACKOFFICE_BASE,
  capabilities,
  doctypes,
  fields,
  actions,
  slots,
  appearance,
  integrations,
  onEvent,
  i18nInstance,
}: BackofficeProviderProps) {
  // Register the "backoffice" i18n namespace BEFORE children first render,
  // so useTranslation("backoffice") is ready on the first pass (idempotent).
  useState(() => {
    registerBackofficeTranslations(i18nInstance);
    return true;
  });

  // Keep the handler on a ref so the wrapped navigator's identity survives
  // inline `onEvent` props.
  const onEventRef = useRef<BackofficeEventHandler | undefined>(onEvent);
  onEventRef.current = onEvent;

  const emitEvent = useMemo(
    () => (event: BackofficeEvent) => {
      onEventRef.current?.(event);
    },
    [],
  );

  // Wrap the host navigator so every navigation the backoffice performs
  // lands on the event bus.
  const wrappedNavigation = useMemo<BackofficeNavigator>(
    () => ({
      navigate: (path) => {
        emitEvent({ type: 'navigate', path, mode: 'push' });
        navigation.navigate(path);
      },
      replace: (path) => {
        emitEvent({ type: 'navigate', path, mode: 'replace' });
        navigation.replace(path);
      },
      back: () => {
        emitEvent({
          type: 'navigate',
          path: navigation.getLocation().path,
          mode: 'back',
        });
        navigation.back();
      },
      // Param merges are URL-state mirrors, not navigations — forwarded
      // without a navigate event (and only when the host supports them).
      ...(navigation.setParams
        ? {
            setParams: (params: Record<string, string | undefined>) => navigation.setParams?.(params),
          }
        : {}),
      getLocation: () => navigation.getLocation(),
      subscribe: (listener) => navigation.subscribe(listener),
    }),
    [navigation, emitEvent],
  );

  const paths = useMemo(() => createBackofficePaths(basePath), [basePath]);
  const resolvedCapabilities = useMemo(() => resolveCapabilities(capabilities), [capabilities]);

  const config = useMemo<BackofficeConfig>(
    () => ({
      frappe,
      navigation: wrappedNavigation,
      basePath,
      paths,
      capabilities: resolvedCapabilities,
      doctypes,
      actions: actions ?? {},
      slots: slots ?? {},
      appearance,
      integrations,
      emitEvent,
    }),
    [
      frappe,
      wrappedNavigation,
      basePath,
      paths,
      resolvedCapabilities,
      doctypes,
      actions,
      slots,
      appearance,
      integrations,
      emitEvent,
    ],
  );

  return (
    <BackofficeConfigContext.Provider value={config}>
      <FrappeProvider
        baseURL={frappe.baseURL}
        socketPort={frappe.socketPort}
        socketBaseURL={frappe.socketBaseURL}
        siteName={frappe.siteName}
        auth={frappe.auth}
        syncOptions={frappe.syncOptions}
        socketOptions={frappe.socketOptions}
        fixtures={frappe.fixtures}>
        {/* Context-scoped field overrides (GL-4): per-provider, never the
            module-global registry — two providers with different `fields` on
            one page must not clobber each other. */}
        <FieldOverridesProvider fields={fields}>{children}</FieldOverridesProvider>
      </FrappeProvider>
    </BackofficeConfigContext.Provider>
  );
}
