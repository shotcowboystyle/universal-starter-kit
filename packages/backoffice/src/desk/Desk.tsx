/**
 * <Desk /> — the whole desk as one importable component (MPO-14 / gap GL-2,
 * spec 09). One required prop, and that prop is nothing: `<Desk />` renders
 * the full desk; everything else is a narrowing.
 *
 * Desk is assembly, not implementation: prop normalization into
 * BackofficeProvider, a navigator pick (host adapter or an internal
 * MemoryNavigator seeded from the pins), the path→surface resolution
 * (useDeskTarget), and the chrome pick. No fetch, no filter construction,
 * no field mapping, no visual values — the §9.2 doctrine greps over this
 * directory ship as a spec test (doctrine.test.ts).
 */
import { useFrappeConfig } from '@repo/frappe-ui';
import type { FieldRenderProps } from '@repo/frappe-ui';
import { YStack } from '@repo/ui';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import { BackofficeProvider } from '../config/BackofficeProvider';
import type {
  BackofficeActions,
  BackofficeAppearance,
  BackofficeFrappeConfig,
  BackofficeIntegrations,
} from '../config/BackofficeProvider';
import type { BackofficeCapabilities, BackofficeDoctypeScope } from '../config/capabilities';
import type { BackofficeEventHandler } from '../config/events';
import type { BackofficeSlots } from '../config/slots';
import { createMemoryNavigator } from '../navigation/navigator';
import type { BackofficeNavigator } from '../navigation/navigator';
import { BACKOFFICE_BASE, createBackofficePaths } from '../navigation/paths';
import type { BackofficeView } from '../navigation/paths';
import type { FrappeFilters } from '../shared/types';
import { BackofficeShell } from '../shell/BackofficeShell';

import { DeskSurface, DeskSurfaceLoading } from './DeskSurface';
import type { DeskSurfaceOverrides } from './DeskSurface';
import { isPresent, stripTrailingSlashes } from './resolve-desk-path';
import { DeskScopeProvider } from './scope';
import { guessDeskTarget, hasDeskPin, useDeskTarget } from './target';
import type { DeskPins, DeskTarget } from './target';

export type DeskChrome = 'full' | 'bare' | 'content';

export interface DeskProps {
  // ─── connection ────────────────────────────────────────────────────────
  /**
   * Frappe connection. Wins over an ambient FrappeProvider; omit it to
   * inherit the ambient one. The SyncModule is shared per baseURL, socket
   * target and syncOptions, so a config matching the ambient one on all
   * three also shares its auth.
   */
  frappe?: BackofficeFrappeConfig;

  // ─── what it shows (the pins) ──────────────────────────────────────────
  /** Pin the desk to one doctype. Sets the initial target AND the scope. */
  doctype?: string;
  /** With `doctype`: a document name, or "new". Renders the form. */
  name?: string;
  /** With `doctype`: which view. Default "list". */
  view?: BackofficeView;
  /** Pin the desk to one workspace page. */
  workspace?: string;
  /** Pin the desk to one Query/Script Report. */
  report?: string;
  /**
   * Explicit surface address relative to `basePath` (e.g.
   * "/sales-order/SO-0001"). Wins over every pin — the escape hatch for a
   * host with its own address scheme.
   */
  path?: string;

  // ─── scoping ───────────────────────────────────────────────────────────
  /** Seed the user-visible filter channel; the user can change or clear. */
  filters?: FrappeFilters;
  /**
   * ALWAYS ANDed into every doctype-homed query, invisible to the filter
   * chrome, not removable — the tenant seam (DeskScopeProvider).
   */
  scope?: FrappeFilters;
  /** Doctype reachability. A `doctype` pin defaults this to that doctype. */
  doctypes?: BackofficeDoctypeScope;

  // ─── which surfaces are enabled ────────────────────────────────────────
  /** Feature flags, everything defaults on (config/capabilities.ts). */
  capabilities?: BackofficeCapabilities;
  /** View-switcher allowlist, intersected with capabilities.views.allow. */
  views?: readonly BackofficeView[];
  /** Force every form read-only regardless of permissions. */
  readOnly?: boolean;

  // ─── chrome ────────────────────────────────────────────────────────────
  /**
   * "full" banner + workspace rail; "bare" banner only; "content" no
   * chrome. Default: "content" when any pin is set, "full" otherwise.
   */
  chrome?: DeskChrome;
  /** Sugar for chrome="content". */
  embedded?: boolean;
  /** Render-prop chrome replacements (config/slots.ts). */
  slots?: BackofficeSlots;
  /** Color-scheme adapter for the user menu's "Toggle Theme". */
  appearance?: BackofficeAppearance;
  /** Router-integration hooks (navigation blocker, …). */
  integrations?: BackofficeIntegrations;

  // ─── routing ───────────────────────────────────────────────────────────
  /**
   * Host router adapter. Supply it and Desk owns URLs; omit it and Desk
   * navigates internally over a MemoryNavigator seeded from the pins.
   */
  navigation?: BackofficeNavigator;
  /** URL prefix Desk is mounted under. Default "/backoffice". */
  basePath?: string;
  /**
   * Intercept push/replace navigations before they happen; return false to
   * cancel (host renders the target itself, e.g. in a drawer). The target
   * is resolved best-effort: an ambiguous slug degrades to a title-cased
   * doctype guess, the same degrade the slug index applies offline.
   */
  // oxlint-disable-next-line typescript/no-invalid-void-type -- public callback: a host that returns nothing lets the navigation through
  onNavigate?: (target: DeskTarget, path: string) => boolean | void;
  /** Fires whenever the resolved surface changes (host breadcrumbs/titles). */
  onTargetChange?: (target: DeskTarget) => void;

  // ─── extension ─────────────────────────────────────────────────────────
  /** Replace a whole surface, per kind or per doctype under a kind. */
  surfaces?: DeskSurfaceOverrides;
  /** Replace a field control by fieldtype — context-scoped per Desk. */
  fields?: Record<string, ComponentType<FieldRenderProps>>;
  /** Host actions on form and list toolbars, optionally per-doctype. */
  actions?: BackofficeActions;
  /** Every notable desk action lands here (config/events.ts). */
  onEvent?: BackofficeEventHandler;
}

/** Pins → the internal navigator's seed path. */
const pinnedPath = (pins: DeskPins, basePath: string): string => {
  const paths = createBackofficePaths(basePath);
  if (isPresent(pins.path)) {
    const prefix = basePath === '/' ? '' : stripTrailingSlashes(basePath);
    return `${prefix}${pins.path}`;
  }
  if (isPresent(pins.doctype)) {
    if (pins.name === 'new') {
      return paths.newDoc(pins.doctype);
    }
    if (isPresent(pins.name)) {
      return paths.form(pins.doctype, pins.name);
    }
    if (pins.view && pins.view !== 'list') {
      return paths.view(pins.doctype, pins.view);
    }
    return paths.list(pins.doctype);
  }
  if (isPresent(pins.workspace)) {
    return paths.workspace(pins.workspace);
  }
  if (isPresent(pins.report)) {
    return paths.queryReport(pins.report);
  }
  return paths.home();
};

interface DeskBodyProps {
  pins: DeskPins;
  chrome: DeskChrome;
  readOnly?: boolean;
  surfaces?: DeskSurfaceOverrides;
  initialFilters?: FrappeFilters;
  views?: readonly BackofficeView[];
  onTargetChange?: (target: DeskTarget) => void;
}

/** Inside the provider: resolve the target, pick the chrome, mount the surface. */
const DeskBody = ({ pins, chrome, readOnly, surfaces, initialFilters, views, onTargetChange }: DeskBodyProps) => {
  const target = useDeskTarget(pins);

  const onTargetChangeRef = useRef(onTargetChange);
  // oxlint-disable-next-line react/refs -- latest-callback ref: the target effect calls the current onTargetChange
  onTargetChangeRef.current = onTargetChange;
  const targetKey = target ? JSON.stringify(target) : undefined;
  useEffect(() => {
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- fires on target value changes (targetKey), not identity
    if (target) {
      // oxlint-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent, react-doctor/no-prop-callback-in-effect -- onTargetChange is the public "surface changed" notification; the host reacts after commit
      onTargetChangeRef.current?.(target);
    }
    // oxlint-disable-next-line exhaustive-deps
  }, [targetKey]);

  const surface = target ? (
    <DeskSurface
      target={target}
      overrides={surfaces}
      readOnly={readOnly}
      initialFilters={initialFilters}
      views={views}
    />
  ) : (
    <DeskSurfaceLoading />
  );

  if (chrome === 'content') {
    return (
      <YStack
        flex={1}
        minHeight={0}
        minWidth={0}>
        {surface}
      </YStack>
    );
  }
  return <BackofficeShell>{surface}</BackofficeShell>;
};

export const Desk = (props: DeskProps) => {
  const {
    doctype,
    name,
    view,
    workspace,
    report,
    path,
    basePath = BACKOFFICE_BASE,
    chrome: chromeProp,
    embedded,
    onNavigate,
  } = props;

  const pins = useMemo<DeskPins>(
    () => ({ doctype, name, view, workspace, report, path }),
    [doctype, name, view, workspace, report, path],
  );

  // ── connection: the prop, else an ambient provider, else no bench ─────
  const ambient = useFrappeConfig();
  const frappe = useMemo<BackofficeFrappeConfig>(() => {
    if (props.frappe) {
      return props.frappe;
    }
    if (ambient) {
      // A fixtures-only provider carries no baseURL; "" is this config's
      // existing "no bench" value.
      return { baseURL: ambient.baseURL ?? '', auth: ambient.auth, fixtures: ambient.fixtures };
    }
    return { baseURL: '' };
  }, [ambient, props.frappe]);

  // ── navigation: host adapter, else internal memory (seeded once) ──────
  const navigationMode = props.navigation ? 'host' : 'memory';
  const memoryNavigator = useMemo(
    () => (navigationMode === 'host' ? undefined : createMemoryNavigator(pinnedPath(pins, basePath))),
    // The seed is the ENTRY; later pin changes re-enter through useDeskTarget.
    // oxlint-disable-next-line exhaustive-deps, react/memo-dependencies -- seeded once per navigation mode
    [navigationMode],
  );
  // oxlint-disable-next-line typescript/no-non-null-assertion -- memoryNavigator exists exactly when props.navigation is absent
  const baseNavigation = props.navigation ?? memoryNavigator!;

  const onNavigateRef = useRef(onNavigate);
  // oxlint-disable-next-line react/refs -- latest-callback ref: the stable navigator calls the current onNavigate
  onNavigateRef.current = onNavigate;
  const navigation = useMemo<BackofficeNavigator>(() => {
    const intercept = (href: string): boolean =>
      onNavigateRef.current?.(guessDeskTarget(href, basePath), href) !== false;
    const intercepted: BackofficeNavigator = {
      ...baseNavigation,
      navigate: (href) => {
        if (intercept(href)) {
          baseNavigation.navigate(href);
        }
      },
      replace: (href) => {
        if (intercept(href)) {
          baseNavigation.replace(href);
        }
      },
      back: () => {
        baseNavigation.back();
      },
      getLocation: () => baseNavigation.getLocation(),
      subscribe: (listener) => baseNavigation.subscribe(listener),
    };
    if (baseNavigation.setParams) {
      intercepted.setParams = (params) => baseNavigation.setParams?.(params);
    }
    return intercepted;
  }, [baseNavigation, basePath]);

  // ── narrowings: chrome, doctype fence, bare-chrome capability merge ───
  const chrome: DeskChrome = chromeProp ?? (embedded || hasDeskPin(pins) ? 'content' : 'full');
  const doctypes = props.doctypes ?? (isPresent(doctype) ? { allow: [doctype] } : undefined);
  const capabilities = useMemo<BackofficeCapabilities | undefined>(
    () => (chrome === 'bare' ? { ...props.capabilities, sidebar: false } : props.capabilities),
    [chrome, props.capabilities],
  );

  return (
    <BackofficeProvider
      frappe={frappe}
      navigation={navigation}
      basePath={basePath}
      capabilities={capabilities}
      doctypes={doctypes}
      fields={props.fields}
      actions={props.actions}
      slots={props.slots}
      appearance={props.appearance}
      integrations={props.integrations}
      onEvent={props.onEvent}>
      <DeskScopeProvider scope={props.scope}>
        <DeskBody
          pins={pins}
          chrome={chrome}
          readOnly={props.readOnly}
          surfaces={props.surfaces}
          initialFilters={props.filters}
          views={props.views}
          onTargetChange={props.onTargetChange}
        />
      </DeskScopeProvider>
    </BackofficeProvider>
  );
};
