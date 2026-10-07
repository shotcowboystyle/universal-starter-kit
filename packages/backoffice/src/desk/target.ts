/**
 * DeskTarget — the resolved surface (spec 09 §2.2) — and useDeskTarget, the
 * hook that composes the pure resolver with the runtime slug index.
 *
 * Precedence (spec §2.3): `path` beats the pins, the pins beat the navigator
 * location, the navigator location beats home. A pin plus a live navigator
 * is legal: the pin is the ENTRY, and once the location moves the navigator
 * drives, still fenced by whatever scope the pin implied.
 *
 * Desk writes no fetch: the only read here is `useSlugTarget`, the exported
 * once-per-session slug index (DK-2 holding at the one place it was most at
 * risk).
 */
import { useMemo, useRef } from 'react';

import { useBackofficeConfig, useBackofficeLocation } from '../config/BackofficeProvider';
import { parseBackofficeHref } from '../navigation/navigator';
import { slugToDisplayName } from '../navigation/paths';
import type { BackofficeView } from '../navigation/paths';
import { useSlugTarget } from '../shared/useSlugTarget';

import { resolveDeskPath } from './resolveDeskPath';
import type { DeskAddress, DeskViewParams } from './resolveDeskPath';

export type DeskTarget =
  | { kind: 'home' }
  | { kind: 'workspace'; workspace: string }
  | { kind: 'list'; doctype: string; filtersParam?: string; sortParam?: string }
  | {
      kind: 'view';
      doctype: string;
      view: Exclude<BackofficeView, 'list'>;
      params?: DeskViewParams;
    }
  | { kind: 'new'; doctype: string; defaults?: Record<string, unknown> }
  | { kind: 'form'; doctype: string; name: string }
  | { kind: 'report'; reportName: string; filtersParam?: string }
  | { kind: 'not-found'; slug?: string };

/** The surface pins a host sets on `<Desk />` (spec §2, "what it shows"). */
export interface DeskPins {
  doctype?: string;
  name?: string;
  view?: BackofficeView;
  workspace?: string;
  report?: string;
  path?: string;
}

export function hasDeskPin(pins: DeskPins): boolean {
  return Boolean(pins.doctype ?? pins.workspace ?? pins.report ?? pins.path);
}

/** Pins → target, directly: pins carry proper-cased names, no slug hop. */
function pinnedTarget(pins: DeskPins): DeskTarget | undefined {
  if (pins.doctype) {
    if (pins.name === 'new') {
      return { kind: 'new', doctype: pins.doctype };
    }
    if (pins.name) {
      return { kind: 'form', doctype: pins.doctype, name: pins.name };
    }
    if (pins.view && pins.view !== 'list') {
      return { kind: 'view', doctype: pins.doctype, view: pins.view };
    }
    return { kind: 'list', doctype: pins.doctype };
  }
  if (pins.workspace) {
    return { kind: 'workspace', workspace: pins.workspace };
  }
  if (pins.report) {
    return { kind: 'report', reportName: pins.report };
  }
  return undefined;
}

/** Address + resolved slug → target. Ambiguous slugs stay `undefined` while
 * the index loads (the caller renders a spinner, exactly like SlugScreen). */
function addressToTarget(
  address: DeskAddress,
  slugKind: 'workspace' | 'doctype' | 'loading' | 'not-found',
  slugName: string | undefined,
): DeskTarget | undefined {
  switch (address.kind) {
    case 'home': {
      return { kind: 'home' };
    }
    case 'report': {
      return { kind: 'report', reportName: address.reportName, filtersParam: address.filtersParam };
    }
    case 'not-found': {
      return { kind: 'not-found' };
    }
    default: {
      break;
    }
  }
  if (slugKind === 'loading') {
    return undefined;
  }
  if (slugKind === 'not-found' || !slugName) {
    return { kind: 'not-found', slug: address.slug };
  }
  if (slugKind === 'workspace') {
    // Only the bare slug route can be a workspace page; /new, /view/x and
    // /[name] under a workspace slug are dead addresses.
    return address.kind === 'slug'
      ? { kind: 'workspace', workspace: slugName }
      : { kind: 'not-found', slug: address.slug };
  }
  switch (address.kind) {
    case 'slug': {
      return {
        kind: 'list',
        doctype: slugName,
        filtersParam: address.filtersParam,
        sortParam: address.sortParam,
      };
    }
    case 'slug-view': {
      return { kind: 'view', doctype: slugName, view: address.view, params: address.params };
    }
    case 'slug-new': {
      return { kind: 'new', doctype: slugName, defaults: address.defaults };
    }
    case 'slug-name': {
      return { kind: 'form', doctype: slugName, name: address.name };
    }
  }
}

/**
 * Pure, best-effort address→target for pre-navigation interception
 * (`onNavigate`): the slug degrades to a title-cased doctype guess, the same
 * degrade `useSlugTarget` applies when the index is unavailable.
 */
export function guessDeskTarget(path: string, basePath: string): DeskTarget {
  const { path: cleanPath, params } = parseBackofficeHref(path);
  const address = resolveDeskPath(cleanPath, basePath, params);
  const guess = 'slug' in address ? slugToDisplayName(address.slug) : undefined;
  return addressToTarget(address, guess ? 'doctype' : 'not-found', guess) ?? { kind: 'not-found' };
}

/**
 * The desk's current target. `undefined` while an ambiguous slug is still
 * resolving against the once-per-session index. Must be called under
 * BackofficeProvider (it reads the navigator location and the frappe
 * connection from context).
 */
export function useDeskTarget(pins: DeskPins): DeskTarget | undefined {
  const { basePath } = useBackofficeConfig();
  const location = useBackofficeLocation();

  // The pins (and the `path` prop) are the ENTRY: they win until the
  // location moves, then the navigator drives (spec §2.3). Location
  // snapshots have stable identity until they change, so reference
  // equality against the mount-time snapshot is the "has it moved" test.
  const initialLocation = useRef(location);
  const entryActive = location === initialLocation.current;

  const address = useMemo<DeskAddress | undefined>(() => {
    if (entryActive && pins.path) {
      const prefix = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
      const { path, params } = parseBackofficeHref(`${prefix}${pins.path}`);
      return resolveDeskPath(path, basePath, params);
    }
    if (entryActive && hasDeskPin(pins)) {
      return undefined;
    } // pinned target, no address
    return resolveDeskPath(location.path, basePath, location.params);
  }, [entryActive, pins, basePath, location]);

  const pinned = entryActive && !pins.path ? pinnedTarget(pins) : undefined;

  const slug = !pinned && address && 'slug' in address ? address.slug : undefined;
  const slugTarget = useSlugTarget(slug);

  return useMemo(() => {
    if (pinned) {
      return pinned;
    }
    if (!address) {
      return undefined;
    }
    const slugKind =
      slugTarget.status === 'loading' ? 'loading' : slugTarget.status === 'not-found' ? 'not-found' : slugTarget.kind;
    const slugName =
      slugTarget.status === 'resolved'
        ? slugTarget.kind === 'workspace'
          ? slugTarget.workspace
          : slugTarget.doctype
        : undefined;
    return addressToTarget(address, slugKind, slugName);
  }, [pinned, address, slugTarget]);
}
