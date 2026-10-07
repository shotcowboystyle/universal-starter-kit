/**
 * Backoffice capability flags — the host's on/off (and per-feature config)
 * switches for what the embedded backoffice displays and allows.
 *
 * Every flag accepts either a boolean or a config object; everything
 * defaults ON so `<BackofficeProvider>` with no `capabilities` prop renders
 * the full desk. Resolution happens once in the provider; surfaces read the
 * resolved shape via `useBackofficeCapabilities()`.
 */

import { BACKOFFICE_VIEWS } from '../navigation/paths';
import type { BackofficeView } from '../navigation/paths';

/** Boolean shorthand or per-feature config object. */
export type CapabilityInput<Config extends object = { enabled?: boolean }> =
  | boolean
  | (Config & { enabled?: boolean })
  | undefined;

export interface BackofficeCapabilities {
  /** Global search / command bar in the shell navbar. */
  awesomebar?: CapabilityInput;
  /** Notification bell + panel in the shell navbar. */
  notifications?: CapabilityInput;
  /** Avatar menu (profile, theme toggle, logout) in the shell navbar. */
  userMenu?: CapabilityInput<{
    /** Show the "Toggle Theme" item (needs an `appearance` adapter too). */
    themeToggle?: boolean;
    /** Show the "Log Out" item. */
    logout?: boolean;
    /**
     * "Exit to site" escape hatch back into the host app (web only).
     * `path` is host-app absolute (default "/"); `label` overrides the
     * translated default.
     */
    exitToSite?: boolean | { enabled?: boolean; path?: string; label?: string };
  }>;
  /** Help menu (docs links, shortcuts + about dialogs) in the shell navbar. */
  help?: CapabilityInput;
  /** Workspace sidebar (desktop rail + narrow drawer). */
  sidebar?: CapabilityInput;
  /** Quick-entry dialogs (compact create forms). */
  quickEntry?: CapabilityInput;
  /** List views. `allow` restricts which views are reachable. */
  views?: CapabilityInput<{ allow?: readonly BackofficeView[] }>;
  /** "New <doctype>" affordances (list header, awesomebar new-commands, …). */
  newDoc?: CapabilityInput;
  /** List bulk-action bar (multi-select edit/assign/tag/delete). */
  bulkActions?: CapabilityInput;
  /** Form sidebar attachments section. */
  attachments?: CapabilityInput;
  /** Form activity timeline (comments, versions, communications). */
  timeline?: CapabilityInput;
  /** Assignment (ToDo) surfaces on forms and lists. */
  assignments?: CapabilityInput;
  /** Tag surfaces on forms and lists. */
  tags?: CapabilityInput;
  /** Document share surfaces. */
  shares?: CapabilityInput;
  /** Print affordances. */
  print?: CapabilityInput;
  /** Email / communication affordances. */
  email?: CapabilityInput;
}

export interface ResolvedCapability {
  enabled: boolean;
}

export interface ResolvedExitToSite {
  enabled: boolean;
  path: string;
  label?: string;
}

export interface ResolvedBackofficeCapabilities {
  awesomebar: ResolvedCapability;
  notifications: ResolvedCapability;
  userMenu: ResolvedCapability & {
    themeToggle: boolean;
    logout: boolean;
    exitToSite: ResolvedExitToSite;
  };
  help: ResolvedCapability;
  sidebar: ResolvedCapability;
  quickEntry: ResolvedCapability;
  views: ResolvedCapability & { allow: readonly BackofficeView[] };
  newDoc: ResolvedCapability;
  bulkActions: ResolvedCapability;
  attachments: ResolvedCapability;
  timeline: ResolvedCapability;
  assignments: ResolvedCapability;
  tags: ResolvedCapability;
  shares: ResolvedCapability;
  print: ResolvedCapability;
  email: ResolvedCapability;
}

function resolveFlag<Resolved extends { enabled: boolean }>(
  input: boolean | (Partial<Resolved> & { enabled?: boolean }) | undefined,
  defaults: Resolved,
): Resolved {
  if (input === undefined) {
    return defaults;
  }
  if (typeof input === 'boolean') {
    return { ...defaults, enabled: input };
  }
  // Undefined config values must not clobber defaults (exactOptionalPropertyTypes).
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  merged.enabled = input.enabled ?? true;
  return merged as Resolved;
}

function resolveExitToSite(
  input: boolean | { enabled?: boolean; path?: string; label?: string } | undefined,
): ResolvedExitToSite {
  if (input === undefined) {
    return { enabled: true, path: '/' };
  }
  if (typeof input === 'boolean') {
    return { enabled: input, path: '/' };
  }
  const resolved: ResolvedExitToSite = { enabled: input.enabled ?? true, path: input.path ?? '/' };
  if (input.label !== undefined) {
    resolved.label = input.label;
  }
  return resolved;
}

export function resolveCapabilities(input: BackofficeCapabilities = {}): ResolvedBackofficeCapabilities {
  const userMenuInput = typeof input.userMenu === 'object' ? input.userMenu : undefined;
  return {
    awesomebar: resolveFlag<ResolvedCapability>(input.awesomebar, { enabled: true }),
    notifications: resolveFlag<ResolvedCapability>(input.notifications, { enabled: true }),
    userMenu: {
      enabled: typeof input.userMenu === 'boolean' ? input.userMenu : (userMenuInput?.enabled ?? true),
      themeToggle: userMenuInput?.themeToggle ?? true,
      logout: userMenuInput?.logout ?? true,
      exitToSite: resolveExitToSite(userMenuInput?.exitToSite),
    },
    help: resolveFlag<ResolvedCapability>(input.help, { enabled: true }),
    sidebar: resolveFlag<ResolvedCapability>(input.sidebar, { enabled: true }),
    quickEntry: resolveFlag<ResolvedCapability>(input.quickEntry, { enabled: true }),
    views: resolveFlag<ResolvedBackofficeCapabilities['views']>(input.views, {
      enabled: true,
      allow: BACKOFFICE_VIEWS,
    }),
    newDoc: resolveFlag<ResolvedCapability>(input.newDoc, { enabled: true }),
    bulkActions: resolveFlag<ResolvedCapability>(input.bulkActions, { enabled: true }),
    attachments: resolveFlag<ResolvedCapability>(input.attachments, { enabled: true }),
    timeline: resolveFlag<ResolvedCapability>(input.timeline, { enabled: true }),
    assignments: resolveFlag<ResolvedCapability>(input.assignments, { enabled: true }),
    tags: resolveFlag<ResolvedCapability>(input.tags, { enabled: true }),
    shares: resolveFlag<ResolvedCapability>(input.shares, { enabled: true }),
    print: resolveFlag<ResolvedCapability>(input.print, { enabled: true }),
    email: resolveFlag<ResolvedCapability>(input.email, { enabled: true }),
  };
}

/** Doctype reachability scope (allow wins over deny being absent; deny always wins). */
export interface BackofficeDoctypeScope {
  /** When set, only these doctypes are reachable. */
  allow?: readonly string[];
  /** Always-unreachable doctypes (applied after `allow`). */
  deny?: readonly string[];
}

export function isDoctypeAllowed(scope: BackofficeDoctypeScope | undefined, doctype: string): boolean {
  if (!scope) {
    return true;
  }
  if (scope.deny?.includes(doctype)) {
    return false;
  }
  if (scope.allow && !scope.allow.includes(doctype)) {
    return false;
  }
  return true;
}
